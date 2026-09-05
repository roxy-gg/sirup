import { z } from "zod";
import { ApiError } from "../../shared/errors.js";
import { isUuid } from "../../shared/uuid.js";
import { slugify, uniqueSlug } from "../../shared/slug.js";
import { refreshServerTools } from "../../mcp/aggregator.js";
import { release } from "../../mcp/connectionPool.js";
import * as data from "./mcpServers.data.js";
import type { McpServerModel, McpToolModel } from "../../database/models/index.js";
import type { Uuid } from "../../../shared/domain.js";

/**
 * LOGIC -- validation and orchestration for connecting upstream MCP servers.
 */

const urlSchema = z
  .string()
  .trim()
  .url("Enter a valid URL.")
  .refine((value) => /^https?:\/\//i.test(value), {
    message: "Only http:// and https:// MCP servers are supported.",
  });

const createSchema = z.object({
  name: z.string().trim().min(1, "Give this server a name.").max(60),
  url: urlSchema,
  auth_type: z.enum(["none", "bearer", "header"]).default("none"),
  auth_header_name: z.string().trim().max(80).optional().nullable(),
  auth_value: z.string().trim().max(4000).optional().nullable(),
});

const updateSchema = createSchema.partial().extend({
  enabled: z.boolean().optional(),
});

type AuthShape = {
  auth_type: "none" | "bearer" | "header";
  auth_header_name?: string | null;
  auth_value?: string | null;
};

/**
 * A header-based credential is meaningless without the header name, and a
 * bearer/header type is meaningless without a value.
 */
function assertAuthShape(input: AuthShape): void {
  if (input.auth_type === "header" && !input.auth_header_name) {
    throw ApiError.badRequest("Provide the header name for header auth.");
  }
  if (input.auth_type !== "none" && !input.auth_value) {
    throw ApiError.badRequest("Provide the credential value.");
  }
}

/**
 * Postgres rejects a malformed uuid with a 22P02 error, which would surface as
 * an opaque 500. Validating the shape first turns a bad id into a clean 404.
 */
function assertServerId(serverId: string): asserts serverId is Uuid {
  if (!isUuid(serverId)) throw ApiError.notFound("Server not found.");
}

export function list(companyId: Uuid) {
  return data.listServers(companyId);
}

export async function get(companyId: Uuid, serverId: string) {
  assertServerId(serverId);
  const server = await data.findServerWithTools(companyId, serverId);
  if (!server) throw ApiError.notFound("Server not found.");
  return server;
}

/**
 * Connects a new upstream. We persist first, then attempt discovery, so a
 * server that is temporarily down still appears in the UI in an error state
 * with a Retry action -- rather than silently failing to save.
 */
export async function create(companyId: Uuid, payload: unknown) {
  const input = createSchema.parse(payload);
  assertAuthShape(input);

  const existing = await data.listSlugs(companyId);
  const taken = new Set(existing.map((row) => row.slug));
  const slug = uniqueSlug(slugify(input.name), taken);

  const server = await data.insertServer({
    company_id: companyId,
    name: input.name,
    slug,
    url: input.url,
    auth_type: input.auth_type,
    auth_header_name: input.auth_type === "header" ? input.auth_header_name : null,
    auth_value: input.auth_type === "none" ? null : input.auth_value,
    status: "pending",
  });

  await tryRefresh(server);

  return data.findServerWithTools(companyId, server.id);
}

export async function update(companyId: Uuid, serverId: string, payload: unknown) {
  assertServerId(serverId);
  const input = updateSchema.parse(payload);
  const server = await data.findServer(companyId, serverId);
  if (!server) throw ApiError.notFound("Server not found.");

  const patch: Partial<McpServerModel> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.url !== undefined) patch.url = input.url;
  if (input.enabled !== undefined) patch.enabled = input.enabled;

  // Credentials are handled independently of the auth type, so rotating a
  // token without restating the type actually persists. Folding this into the
  // auth_type branch silently dropped the new value.
  if (input.auth_value !== undefined) patch.auth_value = input.auth_value;

  if (input.auth_type !== undefined) {
    patch.auth_type = input.auth_type;
    patch.auth_header_name =
      input.auth_type === "header" ? (input.auth_header_name ?? null) : null;
    if (input.auth_type === "none") patch.auth_value = null;
  }

  // Validate against the post-patch state, but only trust a credential that is
  // actually being reused -- never carry a bearer token over into a header.
  if (input.auth_type !== undefined && input.auth_type !== server.auth_type) {
    if (input.auth_type !== "none" && input.auth_value === undefined) {
      throw ApiError.badRequest("Provide the credential value for the new auth type.");
    }
  }
  if (input.auth_type !== undefined) {
    assertAuthShape({ ...server, ...patch } as AuthShape);
  }

  const updated = await data.patchServer(companyId, serverId, patch);

  // Credentials or URL may have changed; the pooled connection is now stale.
  // The pool is keyed by the uuid string exactly as stored, so no coercion.
  release(serverId);

  // Re-discover only when the connection itself changed. A rename or an
  // enable/disable toggle should not hit the network.
  if (patch.url || patch.auth_type !== undefined || patch.auth_value !== undefined) {
    await tryRefresh(updated);
  }

  return data.findServerWithTools(companyId, serverId);
}

export async function remove(companyId: Uuid, serverId: string): Promise<void> {
  assertServerId(serverId);
  const server = await data.findServer(companyId, serverId);
  if (!server) throw ApiError.notFound("Server not found.");

  release(serverId);
  await data.deleteServer(companyId, serverId);
}

/** Manual "Retry" from the UI -- surfaces the failure instead of swallowing it. */
export async function refresh(companyId: Uuid, serverId: string) {
  assertServerId(serverId);
  const server = await data.findServer(companyId, serverId);
  if (!server) throw ApiError.notFound("Server not found.");

  try {
    await refreshServerTools(server);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw ApiError.badRequest(`Could not reach that MCP server: ${message}`);
  }

  return data.findServerWithTools(companyId, serverId);
}

export async function setToolEnabled(
  companyId: Uuid,
  serverId: string,
  toolId: string,
  enabled: unknown,
): Promise<McpToolModel> {
  assertServerId(serverId);
  if (!isUuid(toolId)) throw ApiError.notFound("Tool not found.");

  const server = await data.findServer(companyId, serverId);
  if (!server) throw ApiError.notFound("Server not found.");

  const tool = await data.patchTool(serverId, toolId, { enabled: Boolean(enabled) });
  if (!tool) throw ApiError.notFound("Tool not found.");
  return tool;
}

/**
 * Discovery that never throws. Used on create, where the server row must be
 * saved regardless -- the row's `status` column carries the outcome.
 */
async function tryRefresh(server: McpServerModel): Promise<void> {
  try {
    await refreshServerTools(server);
  } catch {
    /* status + status_message already persisted by refreshServerTools */
  }
}
