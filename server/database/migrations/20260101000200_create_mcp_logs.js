/**
 * Every call that crosses the gateway is recorded. This is the audit trail the
 * MCP Logs screen reads, and the reason a company would route through sirup
 * instead of wiring each server into each client by hand.
 */
export async function up(knex) {
  await knex.schema.createTable("mcp_logs", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .uuid("company_id")
      .notNullable()
      .references("id")
      .inTable("companies")
      .onDelete("CASCADE");
    table
      .uuid("server_id")
      .nullable()
      .references("id")
      .inTable("mcp_servers")
      // SET NULL, not CASCADE: an audit trail a user can erase by
      // disconnecting a server is not an audit trail. The column is nullable
      // and readers already LEFT join, so orphaned entries render fine.
      .onDelete("SET NULL");

    // "tools/list" | "tools/call" | "connect" | "refresh"
    table.string("method").notNullable();
    table.string("tool_name").nullable();
    // "ok" | "error"
    table.string("status").notNullable();
    table.integer("duration_ms").nullable();
    table.text("message").nullable();

    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // The logs feed is keyset-paginated on (created_at, id) descending.
  //
  // With auto-increment ids a plain `id DESC` cursor worked, because ids were
  // insertion-ordered. UUIDv4 is random, so it carries no ordering at all --
  // the timestamp does the ordering and the id only breaks ties between rows
  // written in the same microsecond. The index must match that exact tuple for
  // the cursor comparison to use it.
  await knex.schema.raw(`
    CREATE INDEX mcp_logs_company_created_idx
      ON mcp_logs (company_id, created_at DESC, id DESC)
  `);

  // The per-server view ("Logs" on a server row) filters by server as well.
  await knex.schema.raw(`
    CREATE INDEX mcp_logs_server_created_idx
      ON mcp_logs (server_id, created_at DESC, id DESC)
      WHERE server_id IS NOT NULL
  `);

  // The 24h rollup groups by status over a recent window.
  await knex.schema.raw(`
    CREATE INDEX mcp_logs_company_status_created_idx
      ON mcp_logs (company_id, status, created_at DESC)
  `);
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("mcp_logs");
}
