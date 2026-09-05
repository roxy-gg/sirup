import type { Model, RelationMappings } from "objection";
import { BaseModel } from "./BaseModel.js";
import type { Uuid } from "../../../shared/domain.js";

export class CompanyModel extends BaseModel {
  name!: string;
  slug!: string;
  gateway_token!: string;

  static override get tableName(): string {
    return "companies";
  }

  // Evaluated lazily by Objection, so the circular model imports are safe.
  static override get relationMappings(): RelationMappings {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return {
      users: {
        relation: BaseModel.HasManyRelation,
        modelClass: () => UserModel as unknown as typeof Model,
        join: { from: "companies.id", to: "users.company_id" },
      },
      servers: {
        relation: BaseModel.HasManyRelation,
        modelClass: () => McpServerModel as unknown as typeof Model,
        join: { from: "companies.id", to: "mcp_servers.company_id" },
      },
    };
  }
}

export class UserModel extends BaseModel {
  email!: string;
  password_hash!: string;
  company_id!: Uuid | null;

  company?: CompanyModel;

  static override get tableName(): string {
    return "users";
  }

  /** Never let the password hash escape into an API response. */
  override $formatJson(json: Record<string, unknown>): Record<string, unknown> {
    const formatted = super.$formatJson(json);
    delete formatted.password_hash;
    return formatted;
  }

  static override get relationMappings(): RelationMappings {
    return {
      company: {
        relation: BaseModel.BelongsToOneRelation,
        modelClass: () => CompanyModel as unknown as typeof Model,
        join: { from: "users.company_id", to: "companies.id" },
      },
    };
  }
}

export class McpServerModel extends BaseModel {
  company_id!: Uuid;
  name!: string;
  slug!: string;
  url!: string;
  auth_type!: "none" | "bearer" | "header";
  auth_header_name!: string | null;
  auth_value!: string | null;
  status!: "pending" | "connected" | "error";
  status_message!: string | null;
  enabled!: boolean;
  tool_count!: number;
  last_connected_at!: Date | null;

  tools?: McpToolModel[];

  static override get tableName(): string {
    return "mcp_servers";
  }

  /** Credentials stay server-side; the UI only needs to know one exists. */
  override $formatJson(json: Record<string, unknown>): Record<string, unknown> {
    const formatted = super.$formatJson(json);
    formatted.has_auth = Boolean(formatted.auth_value);
    delete formatted.auth_value;
    return formatted;
  }

  static override get relationMappings(): RelationMappings {
    return {
      company: {
        relation: BaseModel.BelongsToOneRelation,
        modelClass: () => CompanyModel as unknown as typeof Model,
        join: { from: "mcp_servers.company_id", to: "companies.id" },
      },
      tools: {
        relation: BaseModel.HasManyRelation,
        modelClass: () => McpToolModel as unknown as typeof Model,
        join: { from: "mcp_servers.id", to: "mcp_tools.server_id" },
      },
    };
  }
}

export class McpToolModel extends BaseModel {
  server_id!: Uuid;
  name!: string;
  namespaced_name!: string;
  description!: string | null;
  input_schema!: Record<string, unknown> | null;
  enabled!: boolean;

  static override get tableName(): string {
    return "mcp_tools";
  }

  // No JSON or boolean coercion needed: the pg driver returns jsonb as a
  // parsed object and boolean as a real boolean.

  static override get relationMappings(): RelationMappings {
    return {
      server: {
        relation: BaseModel.BelongsToOneRelation,
        modelClass: () => McpServerModel as unknown as typeof Model,
        join: { from: "mcp_tools.server_id", to: "mcp_servers.id" },
      },
    };
  }
}

export class McpLogModel extends BaseModel {
  company_id!: Uuid;
  server_id!: Uuid | null;
  method!: string;
  tool_name!: string | null;
  status!: "ok" | "error";
  duration_ms!: number | null;
  message!: string | null;

  // Populated by the LEFT join in the logs query, not by a column.
  server_name?: string | null;
  server_slug?: string | null;

  static override get tableName(): string {
    return "mcp_logs";
  }

  // Logs are append-only and the column has a database default, so nothing to
  // set here. Letting Postgres stamp it keeps `created_at` monotonic with the
  // keyset cursor that orders on it.
  override $beforeInsert(): void {}

  override $beforeUpdate(): void {}

  static override get relationMappings(): RelationMappings {
    return {
      // Nullable: gateway-level entries (tools/list, unknown tool) have no
      // server, so callers must join this as a LEFT join.
      server: {
        relation: BaseModel.BelongsToOneRelation,
        modelClass: () => McpServerModel as unknown as typeof Model,
        join: { from: "mcp_logs.server_id", to: "mcp_servers.id" },
      },
    };
  }
}
