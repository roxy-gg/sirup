import type { Model, RelationMappings } from "objection";
import { BaseModel } from "./BaseModel.js";
import type { AuthType, Uuid } from "../../../shared/domain.js";

export class CompanyModel extends BaseModel {
  name!: string;
  slug!: string;

  static override get tableName(): string {
    return "companies";
  }

  // Evaluated lazily by Objection, so the circular model imports are safe.
  static override get relationMappings(): RelationMappings {
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
      profiles: {
        relation: BaseModel.HasManyRelation,
        modelClass: () => ProfileModel as unknown as typeof Model,
        join: { from: "companies.id", to: "profiles.company_id" },
      },
    };
  }
}

/**
 * A named subset of the company's connections, with its own gateway token.
 *
 * The company owns connections; a profile decides which to expose. Attaching
 * is many-to-many in both directions: a connection can appear in several
 * profiles, and a profile holds many connections.
 */
export class ProfileModel extends BaseModel {
  user_id!: Uuid;
  company_id!: Uuid;
  name!: string;
  slug!: string;
  gateway_token!: string;
  is_default!: boolean;

  servers?: McpServerModel[];

  static override get tableName(): string {
    return "profiles";
  }

  static override get relationMappings(): RelationMappings {
    return {
      company: {
        relation: BaseModel.BelongsToOneRelation,
        modelClass: () => CompanyModel as unknown as typeof Model,
        join: { from: "profiles.company_id", to: "companies.id" },
      },
      servers: {
        relation: BaseModel.ManyToManyRelation,
        modelClass: () => McpServerModel as unknown as typeof Model,
        join: {
          from: "profiles.id",
          through: {
            from: "profile_servers.profile_id",
            to: "profile_servers.server_id",
          },
          to: "mcp_servers.id",
        },
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
  user_id!: Uuid;
  company_id!: Uuid;
  name!: string;
  slug!: string;
  url!: string;
  integration_key!: string | null;
  auth_type!: AuthType;
  auth_header_name!: string | null;
  auth_value!: string | null;
  status!: "pending" | "connected" | "error";
  status_message!: string | null;
  enabled!: boolean;
  tool_count!: number;
  last_connected_at!: Date | null;

  tools?: McpToolModel[];
  profiles?: ProfileModel[];

  static override get tableName(): string {
    return "mcp_servers";
  }

  /** Credentials stay server-side; the UI only needs to know one exists. */
  override $formatJson(json: Record<string, unknown>): Record<string, unknown> {
    const formatted = super.$formatJson(json);
    // OAuth rows are only created after a grant is stored transactionally.
    formatted.has_auth =
      formatted.auth_type === "oauth" || Boolean(formatted.auth_value);
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
      profiles: {
        relation: BaseModel.ManyToManyRelation,
        modelClass: () => ProfileModel as unknown as typeof Model,
        join: {
          from: "mcp_servers.id",
          through: {
            from: "profile_servers.server_id",
            to: "profile_servers.profile_id",
          },
          to: "profiles.id",
        },
      },
    };
  }
}

/** Encrypted, long-lived OAuth grant for one connected account. */
export class McpOAuthCredentialModel extends BaseModel {
  server_id!: Uuid;
  integration_key!: string;
  encrypted_tokens!: string;
  granted_scopes!: string | null;
  discovery_state!: Record<string, unknown> | null;
  reauthorization_required!: boolean;
  authorized_at!: Date;

  static override get tableName(): string {
    return "mcp_oauth_credentials";
  }

  static override get idColumn(): string {
    return "server_id";
  }

  override $formatJson(json: Record<string, unknown>): Record<string, unknown> {
    const formatted = super.$formatJson(json);
    delete formatted.encrypted_tokens;
    return formatted;
  }
}

/** Short-lived PKCE/state transaction used while a browser is at the provider. */
export class McpOAuthRequestModel extends BaseModel {
  user_id!: Uuid;
  company_id!: Uuid;
  profile_id!: Uuid;
  integration_key!: string;
  connection_name!: string;
  state_hash!: string;
  browser_nonce_hash!: string;
  encrypted_code_verifier!: string | null;
  discovery_state!: Record<string, unknown> | null;
  expires_at!: Date;
  consumed_at!: Date | null;

  static override get tableName(): string {
    return "mcp_oauth_requests";
  }

  override $formatJson(json: Record<string, unknown>): Record<string, unknown> {
    const formatted = super.$formatJson(json);
    delete formatted.state_hash;
    delete formatted.browser_nonce_hash;
    delete formatted.encrypted_code_verifier;
    return formatted;
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

/**
 * An MCP client that registered itself, per RFC 7591.
 *
 * Registration is open: anyone may register, which is what lets a client the
 * user has never heard of connect without us shipping an integration for it.
 * That is safe because registering grants nothing on its own -- a client only
 * gains access when a signed-in user approves it on the consent screen, and
 * only to the profile they picked there.
 */
export class OAuthClientModel extends BaseModel {
  client_id!: string;
  client_secret!: string | null;
  client_secret_expires_at!: string | number | null;
  client_id_issued_at!: string | number | null;
  client_name!: string | null;
  client_uri!: string | null;
  logo_uri!: string | null;
  policy_uri!: string | null;
  tos_uri!: string | null;
  software_id!: string | null;
  software_version!: string | null;
  redirect_uris!: string[];
  grant_types!: string[];
  response_types!: string[];
  token_endpoint_auth_method!: string;
  scope!: string | null;

  static override get tableName(): string {
    return "oauth_clients";
  }

  /**
   * Tells Objection these columns are JSON, not Postgres arrays.
   *
   * Without this the pg driver serialises a JS array as an array literal --
   * `{authorization_code,refresh_token}` -- which a jsonb column rejects with
   * "invalid input syntax for type json". Object-valued jsonb columns happen
   * to work untold, which is why this only bites on the array ones.
   */
  static override get jsonAttributes(): string[] {
    return ["redirect_uris", "grant_types", "response_types"];
  }
}

/** A consent screen in flight: validated parameters, no decision yet. */
export class OAuthRequestModel extends BaseModel {
  client_id!: string;
  redirect_uri!: string;
  code_challenge!: string;
  scopes!: string[];
  state!: string | null;
  resource!: string | null;
  expires_at!: Date;

  /**
   * These rows are written once and never updated, so the table has no
   * `updated_at` column and `created_at` carries a database default. The base
   * implementation would write both and fail on the missing one.
   */
  override $beforeInsert(): void {}

  override $beforeUpdate(): void {}

  static override get tableName(): string {
    return "oauth_requests";
  }

  /** See OAuthClientModel.jsonAttributes -- a JS array needs stringifying. */
  static override get jsonAttributes(): string[] {
    return ["scopes"];
  }
}

/** The one-time authorization code handed back on the redirect. */
export class OAuthCodeModel extends BaseModel {
  code_hash!: string;
  client_id!: string;
  user_id!: Uuid;
  profile_id!: Uuid;
  redirect_uri!: string;
  code_challenge!: string;
  scopes!: string[];
  resource!: string | null;
  expires_at!: Date;
  consumed_at!: Date | null;

  /** See OAuthRequestModel: no `updated_at` column on this table. */
  override $beforeInsert(): void {}

  override $beforeUpdate(): void {}

  static override get tableName(): string {
    return "oauth_codes";
  }

  /** See OAuthClientModel.jsonAttributes -- a JS array needs stringifying. */
  static override get jsonAttributes(): string[] {
    return ["scopes"];
  }
}

/**
 * An issued access or refresh token.
 *
 * Only the SHA-256 of the token is stored. The plaintext exists once, in the
 * response to the client, and is never recoverable from here.
 */
export class OAuthTokenModel extends BaseModel {
  token_hash!: string;
  kind!: "access" | "refresh";
  client_id!: string;
  user_id!: Uuid;
  profile_id!: Uuid;
  scopes!: string[];
  resource!: string | null;
  family_id!: Uuid;
  expires_at!: Date;
  revoked_at!: Date | null;

  client?: OAuthClientModel;
  profile?: ProfileModel;

  /** See OAuthRequestModel: no `updated_at` column on this table. */
  override $beforeInsert(): void {}

  override $beforeUpdate(): void {}

  static override get tableName(): string {
    return "oauth_tokens";
  }

  /** See OAuthClientModel.jsonAttributes -- a JS array needs stringifying. */
  static override get jsonAttributes(): string[] {
    return ["scopes"];
  }

  static override get relationMappings(): RelationMappings {
    return {
      client: {
        relation: BaseModel.BelongsToOneRelation,
        modelClass: () => OAuthClientModel as unknown as typeof Model,
        join: { from: "oauth_tokens.client_id", to: "oauth_clients.client_id" },
      },
      profile: {
        relation: BaseModel.BelongsToOneRelation,
        modelClass: () => ProfileModel as unknown as typeof Model,
        join: { from: "oauth_tokens.profile_id", to: "profiles.id" },
      },
    };
  }
}

export class McpLogModel extends BaseModel {
  user_id!: Uuid;
  company_id!: Uuid;
  server_id!: Uuid | null;
  profile_id!: Uuid | null;
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
