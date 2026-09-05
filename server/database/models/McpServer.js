import { BaseModel } from "./BaseModel.js";
import { Company } from "./Company.js";
import { McpTool } from "./McpTool.js";

export class McpServer extends BaseModel {
  static get tableName() {
    return "mcp_servers";
  }

  /** Credentials stay server-side; the UI only needs to know one exists. */
  $formatJson(json) {
    const formatted = super.$formatJson(json);
    formatted.has_auth = Boolean(formatted.auth_value);
    delete formatted.auth_value;
    return formatted;
  }

  static get relationMappings() {
    return {
      company: {
        relation: BaseModel.BelongsToOneRelation,
        modelClass: Company,
        join: { from: "mcp_servers.company_id", to: "companies.id" },
      },
      tools: {
        relation: BaseModel.HasManyRelation,
        modelClass: McpTool,
        join: { from: "mcp_servers.id", to: "mcp_tools.server_id" },
      },
    };
  }
}
