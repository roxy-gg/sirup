import { BaseModel } from "./BaseModel.js";
import { McpServer } from "./McpServer.js";

export class McpTool extends BaseModel {
  static get tableName() {
    return "mcp_tools";
  }

  // No JSON or boolean coercion needed: the pg driver returns jsonb as a parsed
  // object and boolean as a real boolean.

  static get relationMappings() {
    return {
      server: {
        relation: BaseModel.BelongsToOneRelation,
        modelClass: McpServer,
        join: { from: "mcp_tools.server_id", to: "mcp_servers.id" },
      },
    };
  }
}
