import { BaseModel } from "./BaseModel.js";
import { User } from "./User.js";
import { McpServer } from "./McpServer.js";

export class Company extends BaseModel {
  static get tableName() {
    return "companies";
  }

  // Lazily evaluated by Objection, so the circular model imports are safe.
  static get relationMappings() {
    return {
      users: {
        relation: BaseModel.HasManyRelation,
        modelClass: User,
        join: { from: "companies.id", to: "users.company_id" },
      },
      servers: {
        relation: BaseModel.HasManyRelation,
        modelClass: McpServer,
        join: { from: "companies.id", to: "mcp_servers.company_id" },
      },
    };
  }
}
