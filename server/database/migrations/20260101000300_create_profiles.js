/**
 * Profiles: a named subset of the company's connections, with its own gateway
 * token.
 *
 * The company owns the connections. A profile chooses which of them to expose,
 * and carries the token an MCP client actually uses. That is what makes a
 * profile mean something rather than being a label: pointing Cursor at the
 * "Frontend" token yields a different tool list than the "Ops" token, from the
 * same set of connected accounts.
 *
 * The join table is what makes this many-to-many in both directions -- one
 * connection can appear in several profiles, and one profile holds many
 * connections.
 */
export async function up(knex) {
  await knex.schema.createTable("profiles", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .uuid("company_id")
      .notNullable()
      .references("id")
      .inTable("companies")
      .onDelete("CASCADE");

    table.string("name").notNullable();
    // Namespaces nothing, but reads better than a uuid in a URL.
    table.string("slug").notNullable();
    // The credential an MCP client presents. Per profile, not per company.
    table.string("gateway_token").notNullable().unique();
    // Exactly one per company, and the one a new user lands on.
    table.boolean("is_default").notNullable().defaultTo(false);

    table.timestamps(true, true);
    table.unique(["company_id", "slug"], { indexName: "profiles_company_slug_unique" });
  });

  // The gateway resolves a token to a profile on every single request, so this
  // lookup has to be an index hit.
  await knex.schema.raw(`
    CREATE INDEX profiles_company_created_idx
      ON profiles (company_id, created_at DESC)
  `);

  // At most one default per company. A partial unique index expresses that
  // directly, rather than leaving it to application code to remember.
  await knex.schema.raw(`
    CREATE UNIQUE INDEX profiles_one_default_per_company
      ON profiles (company_id)
      WHERE is_default = true
  `);

  await knex.schema.createTable("profile_servers", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .uuid("profile_id")
      .notNullable()
      .references("id")
      .inTable("profiles")
      .onDelete("CASCADE");
    table
      .uuid("server_id")
      .notNullable()
      .references("id")
      .inTable("mcp_servers")
      .onDelete("CASCADE");

    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // Attaching twice is a no-op, not a duplicate row.
    table.unique(["profile_id", "server_id"], {
      indexName: "profile_servers_unique",
    });
  });

  // tools/list joins from profile to servers on every request.
  await knex.schema.raw(`
    CREATE INDEX profile_servers_profile_idx ON profile_servers (profile_id)
  `);
  // Deleting a connection has to find every profile referencing it.
  await knex.schema.raw(`
    CREATE INDEX profile_servers_server_idx ON profile_servers (server_id)
  `);

  // ── Backfill ───────────────────────────────────────────────────────────
  // Every existing company gets a default profile that inherits its token, so
  // clients already pointed at the gateway keep working untouched.
  await knex.raw(`
    INSERT INTO profiles (company_id, name, slug, gateway_token, is_default)
    SELECT id, 'Main', 'main', gateway_token, true
    FROM companies
  `);

  // and that profile is attached to everything the company had connected.
  await knex.raw(`
    INSERT INTO profile_servers (profile_id, server_id)
    SELECT p.id, s.id
    FROM profiles p
    JOIN mcp_servers s ON s.company_id = p.company_id
    WHERE p.is_default = true
  `);

  // The company token is now dead weight: profiles own tokens. Dropping it
  // means there is one answer to "what does this token grant".
  await knex.schema.alterTable("companies", (table) => {
    table.dropColumn("gateway_token");
  });
}

export async function down(knex) {
  await knex.schema.alterTable("companies", (table) => {
    table.string("gateway_token").nullable();
  });

  // Hand the default profile's token back, so a rollback keeps clients working.
  await knex.raw(`
    UPDATE companies c
    SET gateway_token = p.gateway_token
    FROM profiles p
    WHERE p.company_id = c.id AND p.is_default = true
  `);

  await knex.schema.dropTableIfExists("profile_servers");
  await knex.schema.dropTableIfExists("profiles");
}
