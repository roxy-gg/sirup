import { BaseModel } from "./BaseModel.js";
import { McpServer } from "./McpServer.js";

export class McpLog extends BaseModel {
  static get tableName() {
    return "mcp_logs";
  }

  // Logs are append-only and the column has a database default, so nothing to
  // set here. Letting Postgres stamp it keeps `created_at` monotonic with the
  // keyset cursor that orders on it.
  $beforeInsert() {}

  $beforeUpdate() {}

  static get relationMappings() {
    return {
      // Nullable: gateway-level entries (tools/list, unknown tool) have no
      // server, so callers must join this as a LEFT join.
      server: {
        relation: BaseModel.BelongsToOneRelation,
        modelClass: McpServer,
        join: { from: "mcp_logs.server_id", to: "mcp_servers.id" },
      },
    };
  }
}
