/**
 * Adds managed OAuth integrations without putting refresh tokens in the
 * plaintext static-credential column on mcp_servers.
 */
export async function up(knex) {
  await knex.schema.alterTable("mcp_servers", (table) => {
    table.string("integration_key").nullable();
  });

  await knex.schema.raw(`
    CREATE INDEX mcp_servers_user_integration_idx
      ON mcp_servers (user_id, integration_key)
      WHERE integration_key IS NOT NULL
  `);

  await knex.schema.createTable("mcp_oauth_credentials", (table) => {
    table
      .uuid("server_id")
      .primary()
      .references("id")
      .inTable("mcp_servers")
      .onDelete("CASCADE");
    table.string("integration_key").notNullable();
    table.text("encrypted_tokens").notNullable();
    table.text("granted_scopes").nullable();
    table.jsonb("discovery_state").nullable();
    table.boolean("reauthorization_required").notNullable().defaultTo(false);
    table
      .timestamp("authorized_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table.timestamps(true, true);
  });

  await knex.schema.createTable("mcp_oauth_requests", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .uuid("user_id")
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");
    table
      .uuid("company_id")
      .notNullable()
      .references("id")
      .inTable("companies")
      .onDelete("CASCADE");
    table
      .uuid("profile_id")
      .notNullable()
      .references("id")
      .inTable("profiles")
      .onDelete("CASCADE");
    table.string("integration_key").notNullable();
    table.string("connection_name").notNullable();
    table.string("state_hash", 64).notNullable().unique();
    table.string("browser_nonce_hash", 64).notNullable();
    table.text("encrypted_code_verifier").nullable();
    table.jsonb("discovery_state").nullable();
    table.timestamp("expires_at", { useTz: true }).notNullable();
    table.timestamp("consumed_at", { useTz: true }).nullable();
    table.timestamps(true, true);
  });

  await knex.schema.raw(`
    CREATE INDEX mcp_oauth_requests_expiry_idx
      ON mcp_oauth_requests (expires_at)
  `);
}

export async function down(knex) {
  // Older application versions cannot interpret auth_type="oauth" rows.
  await knex("mcp_servers").where("auth_type", "oauth").delete();
  await knex.schema.dropTableIfExists("mcp_oauth_requests");
  await knex.schema.dropTableIfExists("mcp_oauth_credentials");
  await knex.schema.raw(`DROP INDEX IF EXISTS mcp_servers_user_integration_idx`);
  if (await knex.schema.hasColumn("mcp_servers", "integration_key")) {
    await knex.schema.alterTable("mcp_servers", (table) => {
      table.dropColumn("integration_key");
    });
  }
}
