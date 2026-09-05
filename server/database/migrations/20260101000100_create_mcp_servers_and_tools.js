/**
 * An upstream MCP server that a company has connected, plus a cache of the
 * tools discovered on it. The cache is what lets `tools/list` answer without
 * fanning out to every upstream on each request.
 */
export async function up(knex) {
  await knex.schema.createTable("mcp_servers", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .uuid("company_id")
      .notNullable()
      .references("id")
      .inTable("companies")
      .onDelete("CASCADE");

    table.string("name").notNullable();
    // Short, tool-name-safe prefix used for namespacing: gmail__send_email
    table.string("slug").notNullable();
    table.text("url").notNullable();

    // "none" | "bearer" | "header"
    table.string("auth_type").notNullable().defaultTo("none");
    table.string("auth_header_name").nullable();
    table.text("auth_value").nullable();

    // "pending" | "connected" | "error"
    table.string("status").notNullable().defaultTo("pending");
    table.text("status_message").nullable();
    table.boolean("enabled").notNullable().defaultTo(true);
    table.integer("tool_count").notNullable().defaultTo(0);
    table.timestamp("last_connected_at", { useTz: true }).nullable();

    table.timestamps(true, true);

    // Slugs namespace tools, so they must be unique per company. Doubles as the
    // index backing the dashboard's "list my servers, newest first" query.
    table.unique(["company_id", "slug"], { indexName: "mcp_servers_company_slug_unique" });
  });

  // The dashboard's list query orders by created_at DESC within a company;
  // a composite index serves the filter and the sort in one scan.
  await knex.schema.raw(`
    CREATE INDEX mcp_servers_company_created_idx
      ON mcp_servers (company_id, created_at DESC)
  `);

  await knex.schema.createTable("mcp_tools", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .uuid("server_id")
      .notNullable()
      .references("id")
      .inTable("mcp_servers")
      .onDelete("CASCADE");

    // Name as the upstream server knows it.
    table.string("name").notNullable();
    // Name the gateway exposes: "<server slug>__<name>".
    table.string("namespaced_name").notNullable();
    table.text("description").nullable();
    // jsonb, not json: it is queryable and stored parsed rather than as text.
    table.jsonb("input_schema").nullable();
    // Lets a company hide noisy tools without disconnecting the whole server.
    table.boolean("enabled").notNullable().defaultTo(true);

    table.timestamps(true, true);

    table.unique(["server_id", "name"], { indexName: "mcp_tools_server_name_unique" });
  });

  // The hot path: resolving a namespaced tool name on every tools/call. This
  // index is what keeps that a lookup rather than a scan of the company's tools.
  await knex.schema.raw(`
    CREATE INDEX mcp_tools_namespaced_name_idx
      ON mcp_tools (namespaced_name)
  `);

  // tools/list only ever reads enabled tools, so a partial index keeps the
  // index small and skips the disabled rows entirely.
  await knex.schema.raw(`
    CREATE INDEX mcp_tools_server_enabled_idx
      ON mcp_tools (server_id, name)
      WHERE enabled = true
  `);
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("mcp_tools");
  await knex.schema.dropTableIfExists("mcp_servers");
}
