/**
 * The HTTP contract: request bodies and response envelopes for every endpoint.
 *
 * Both sides import these, so a route that changes its response shape fails to
 * compile until the caller is updated too.
 */
import type {
  CatalogEntry,
  Company,
  LogSummary,
  McpLog,
  McpServer,
  McpServerWithTools,
  McpTool,
  Profile,
  User,
  Uuid,
} from "./domain.js";

/** Every error response the API produces. */
export interface ApiErrorBody {
  error: string;
  field?: string;
  details?: unknown;
}

/* ── auth ──────────────────────────────────────────────────────────────── */

export interface CredentialsBody {
  email: string;
  password: string;
}

export interface CreateCompanyBody {
  name: string;
}

/** The payload every screen bootstraps from. */
export interface SessionResponse {
  user: User | null;
  company: Company | null;
  /** Every profile in the company. Empty until onboarding finishes. */
  profiles: Profile[];
}

/* ── profiles ──────────────────────────────────────────────────────────── */

export interface CreateProfileBody {
  name: string;
  /** Connections to attach up front. Defaults to none. */
  server_ids?: Uuid[];
}

export interface UpdateProfileBody {
  name?: string;
  is_default?: boolean;
}

export interface ProfileListResponse {
  profiles: Profile[];
}

export interface ProfileResponse {
  profile: Profile;
}

/** Replaces the whole attachment set for a profile. */
export interface SetProfileServersBody {
  server_ids: Uuid[];
}

/* ── mcp servers ───────────────────────────────────────────────────────── */

export interface ConnectServerBody {
  name: string;
  url: string;
  auth_type?: McpServer["auth_type"];
  auth_header_name?: string | null;
  auth_value?: string | null;
}

export type UpdateServerBody = Partial<ConnectServerBody> & {
  enabled?: boolean;
};

export interface ServerListResponse {
  servers: McpServer[];
}

export interface ServerResponse {
  server: McpServerWithTools;
}

export interface ToolResponse {
  tool: McpTool;
}

export interface SetToolEnabledBody {
  enabled: boolean;
}

/* ── logs ──────────────────────────────────────────────────────────────── */

export interface LogQuery {
  limit?: number;
  /**
   * Opaque keyset cursor encoding a (created_at, id) tuple. Treat it as a
   * token: UUIDv4 ids carry no ordering, so it is not derivable from an id.
   */
  cursor?: string;
  server_id?: Uuid;
  status?: McpLog["status"];
}

export interface LogListResponse {
  logs: McpLog[];
  next_cursor: string | null;
}

export interface LogSummaryResponse {
  summary: LogSummary;
}

/* ── catalog ───────────────────────────────────────────────────────────── */

export interface CatalogResponse {
  catalog: CatalogEntry[];
}
