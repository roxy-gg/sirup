/**
 * Records which profile served a call.
 *
 * With per-profile tokens, "which token was used" is the audit question that
 * matters -- a leaked credential has to be traceable to the profile it
 * belonged to. Nullable because logs written before profiles existed have no
 * answer, and because the column survives the profile being deleted.
 */
export async function up(knex) {
  await knex.schema.alterTable("mcp_logs", (table) => {
    table
      .uuid("profile_id")
      .nullable()
      .references("id")
      .inTable("profiles")
      // SET NULL, not CASCADE: deleting a profile must not erase the record of
      // what it did, for the same reason disconnecting a server does not.
      .onDelete("SET NULL");
  });

  // Backfill to the default profile, which is what served every existing call.
  await knex.raw(`
    UPDATE mcp_logs l
    SET profile_id = p.id
    FROM profiles p
    WHERE p.company_id = l.company_id AND p.is_default = true
  `);

  // The logs screen filters by profile the same way it filters by server.
  await knex.schema.raw(`
    CREATE INDEX mcp_logs_profile_created_idx
      ON mcp_logs (profile_id, created_at DESC, id DESC)
      WHERE profile_id IS NOT NULL
  `);
}

export async function down(knex) {
  await knex.schema.alterTable("mcp_logs", (table) => {
    table.dropColumn("profile_id");
  });
}
