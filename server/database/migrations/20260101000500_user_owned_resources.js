/**
 * Moves ownership of connections, profiles, and logs from the company to the
 * user.
 *
 * The previous model scoped everything to company_id, which meant every
 * colleague could see -- and use -- everyone else's connected accounts. A
 * personal Gmail token pasted by one person was reachable by the whole
 * workspace. That is wrong: a company is a way to group users for billing and
 * administration, not a shared credential pool.
 *
 * After this, a user owns their connections and their profiles outright.
 * Nothing is shared, and there is no cross-user read path at all.
 *
 * company_id stays on the rows. It is redundant for authorisation now, but it
 * keeps company-wide reporting cheap without a join, and it lets a future
 * "share this with my team" feature be additive rather than another migration
 * of the same shape.
 */
export async function up(knex) {
  // ── mcp_servers ────────────────────────────────────────────────────────
  await knex.schema.alterTable("mcp_servers", (table) => {
    table
      .uuid("user_id")
      .nullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");
  });

  // Backfill: assign every existing connection to the oldest user in its
  // company. With one user per company today that is exact; where a company
  // somehow has several, the founder is the least surprising owner.
  await knex.raw(`
    UPDATE mcp_servers s
    SET user_id = (
      SELECT u.id FROM users u
      WHERE u.company_id = s.company_id
      ORDER BY u.created_at ASC
      LIMIT 1
    )
  `);

  // Orphans -- a company whose users were all deleted -- cannot be assigned.
  await knex("mcp_servers").whereNull("user_id").delete();

  await knex.schema.alterTable("mcp_servers", (table) => {
    table.uuid("user_id").notNullable().alter();
  });

  // The slug namespaces a user's own tools, so uniqueness is per user now.
  // Two people may each connect "Gmail" without colliding.
  await knex.schema.raw(`
    ALTER TABLE mcp_servers DROP CONSTRAINT IF EXISTS mcp_servers_company_slug_unique
  `);
  await knex.schema.raw(`
    ALTER TABLE mcp_servers
      ADD CONSTRAINT mcp_servers_user_slug_unique UNIQUE (user_id, slug)
  `);

  await knex.schema.raw(`DROP INDEX IF EXISTS mcp_servers_company_created_idx`);
  await knex.schema.raw(`
    CREATE INDEX mcp_servers_user_created_idx
      ON mcp_servers (user_id, created_at DESC)
  `);

  // ── profiles ───────────────────────────────────────────────────────────
  await knex.schema.alterTable("profiles", (table) => {
    table
      .uuid("user_id")
      .nullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");
  });

  await knex.raw(`
    UPDATE profiles p
    SET user_id = (
      SELECT u.id FROM users u
      WHERE u.company_id = p.company_id
      ORDER BY u.created_at ASC
      LIMIT 1
    )
  `);

  await knex("profiles").whereNull("user_id").delete();

  await knex.schema.alterTable("profiles", (table) => {
    table.uuid("user_id").notNullable().alter();
  });

  await knex.schema.raw(`
    ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_company_slug_unique
  `);
  await knex.schema.raw(`
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_user_slug_unique UNIQUE (user_id, slug)
  `);

  // One default per *user*, not per company.
  await knex.schema.raw(`DROP INDEX IF EXISTS profiles_one_default_per_company`);
  await knex.schema.raw(`
    CREATE UNIQUE INDEX profiles_one_default_per_user
      ON profiles (user_id)
      WHERE is_default = true
  `);

  await knex.schema.raw(`DROP INDEX IF EXISTS profiles_company_created_idx`);
  await knex.schema.raw(`
    CREATE INDEX profiles_user_created_idx
      ON profiles (user_id, created_at DESC)
  `);

  // ── mcp_logs ───────────────────────────────────────────────────────────
  // Your activity is yours. A colleague reading which tools you called, and
  // when, is the same leak in a different shape.
  await knex.schema.alterTable("mcp_logs", (table) => {
    table
      .uuid("user_id")
      .nullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");
  });

  await knex.raw(`
    UPDATE mcp_logs l
    SET user_id = (
      SELECT u.id FROM users u
      WHERE u.company_id = l.company_id
      ORDER BY u.created_at ASC
      LIMIT 1
    )
  `);

  await knex("mcp_logs").whereNull("user_id").delete();

  await knex.schema.alterTable("mcp_logs", (table) => {
    table.uuid("user_id").notNullable().alter();
  });

  // The feed is keyset-paginated on (created_at, id) within one user.
  await knex.schema.raw(`
    CREATE INDEX mcp_logs_user_created_idx
      ON mcp_logs (user_id, created_at DESC, id DESC)
  `);
  await knex.schema.raw(`
    CREATE INDEX mcp_logs_user_status_created_idx
      ON mcp_logs (user_id, status, created_at DESC)
  `);
}

export async function down(knex) {
  await knex.schema.raw(`DROP INDEX IF EXISTS mcp_logs_user_status_created_idx`);
  await knex.schema.raw(`DROP INDEX IF EXISTS mcp_logs_user_created_idx`);
  await knex.schema.alterTable("mcp_logs", (table) => {
    table.dropColumn("user_id");
  });

  await knex.schema.raw(`DROP INDEX IF EXISTS profiles_user_created_idx`);
  await knex.schema.raw(`DROP INDEX IF EXISTS profiles_one_default_per_user`);
  await knex.schema.raw(`
    ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_user_slug_unique
  `);
  await knex.schema.raw(`
    CREATE UNIQUE INDEX profiles_one_default_per_company
      ON profiles (company_id) WHERE is_default = true
  `);
  await knex.schema.alterTable("profiles", (table) => {
    table.dropColumn("user_id");
  });

  await knex.schema.raw(`DROP INDEX IF EXISTS mcp_servers_user_created_idx`);
  await knex.schema.raw(`
    ALTER TABLE mcp_servers DROP CONSTRAINT IF EXISTS mcp_servers_user_slug_unique
  `);
  await knex.schema.alterTable("mcp_servers", (table) => {
    table.dropColumn("user_id");
  });
}
