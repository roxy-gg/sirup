import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import {
  McpServerModel,
  McpToolModel,
  McpLogModel,
} from "../database/models/index.js";
import { acquire, release } from "./connectionPool.js";
import { listUpstreamTools, callUpstreamTool } from "./upstreamClient.js";
import { ApiError } from "../shared/errors.js";
import type { JsonSchema, Uuid } from "../../shared/domain.js";

/** Separator between the server slug and the upstream tool name. */
export const NAMESPACE_SEPARATOR = "__";

/**
 * Two connected servers can easily both expose a tool called `search`. The
 * gateway therefore presents every tool as "<server slug>__<tool name>" so
 * names stay unique and the model can tell Gmail's search from Slack's.
 */
export function namespaceToolName(slug: string, toolName: string): string {
  return `${slug}${NAMESPACE_SEPARATOR}${toolName}`;
}

interface LogEntry {
  /** The owner. Activity is private to the person who made it. */
  user_id: Uuid;
  company_id: Uuid;
  profile_id?: Uuid | null;
  server_id?: Uuid | null;
  method: string;
  tool_name?: string | null;
  status: "ok" | "error";
  duration_ms?: number | null;
  message?: string | null;
}

/**
 * Records what crossed the gateway. Logging must never break a tool call, so
 * failures here are swallowed.
 */
export async function recordLog(entry: LogEntry): Promise<void> {
  try {
    await McpLogModel.query().insert(entry);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[mcp] failed to write log:", message);
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return (error instanceof Error ? error.message : String(error) || fallback).slice(
    0,
    500,
  );
}

/**
 * Connects to one upstream, reads its tool list, and replaces the cached tools
 * for that server. Returns the stored tool rows.
 */
export async function refreshServerTools(
  server: McpServerModel,
): Promise<McpToolModel[]> {
  const startedAt = Date.now();

  try {
    const { client } = await acquire(server);
    const tools: Tool[] = await listUpstreamTools(client);

    // Preserve per-tool enable/disable choices across a refresh.
    const previous = await McpToolModel.query().where("server_id", server.id);
    const previouslyDisabled = new Set(
      previous.filter((tool) => !tool.enabled).map((tool) => tool.name),
    );

    await McpToolModel.transaction(async (trx) => {
      await McpToolModel.query(trx).delete().where("server_id", server.id);

      if (tools.length > 0) {
        // Postgres does multi-row INSERT natively, so this is one statement.
        await McpToolModel.query(trx).insert(
          tools.map((tool) => ({
            server_id: server.id,
            name: tool.name,
            namespaced_name: namespaceToolName(server.slug, tool.name),
            description: tool.description ?? null,
            input_schema: (tool.inputSchema as JsonSchema | undefined) ?? null,
            enabled: !previouslyDisabled.has(tool.name),
          })),
        );
      }

      await McpServerModel.query(trx).findById(server.id).patch({
        status: "connected",
        status_message: null,
        tool_count: tools.length,
        last_connected_at: new Date(),
      });
    });

    await recordLog({
      user_id: server.user_id,
      company_id: server.company_id,
      server_id: server.id,
      method: "refresh",
      status: "ok",
      duration_ms: Date.now() - startedAt,
      message: `Discovered ${tools.length} tool(s).`,
    });

    return McpToolModel.query().where("server_id", server.id).orderBy("name");
  } catch (error) {
    release(server.id);

    const message = errorMessage(error, "Connection failed.");

    await McpServerModel.query().findById(server.id).patch({
      status: "error",
      status_message: message,
    });

    await recordLog({
      user_id: server.user_id,
      company_id: server.company_id,
      server_id: server.id,
      method: "refresh",
      status: "error",
      duration_ms: Date.now() - startedAt,
      message,
    });

    throw error;
  }
}

/**
 * The aggregated tool list for one profile.
 *
 * Scoped to the profile rather than the company: that is what makes two tokens
 * on the same account expose different tools. Reads from the cache rather than
 * fanning out to each upstream -- a cold fan-out on every tools/list would
 * make the gateway as slow as its slowest upstream, and would break the list
 * entirely whenever one server is down.
 */
export async function listAggregatedTools(profileId: Uuid): Promise<Tool[]> {
  const rows = (await McpToolModel.query()
    .joinRelated("server")
    .join("profile_servers as ps", "ps.server_id", "server.id")
    .where("ps.profile_id", profileId)
    .where("server.enabled", true)
    .where("mcp_tools.enabled", true)
    .orderBy(["server.slug", "mcp_tools.name"])
    .select(
      "mcp_tools.namespaced_name",
      "mcp_tools.description",
      "mcp_tools.input_schema",
      "server.name as server_name",
    )) as unknown as Array<{
    namespaced_name: string;
    description: string | null;
    input_schema: JsonSchema | null;
    server_name: string;
  }>;

  return rows.map((row) => ({
    name: row.namespaced_name,
    // Prefixing the source server helps the model pick between similar tools,
    // and tells two accounts of the same app apart.
    description: row.description
      ? `[${row.server_name}] ${row.description}`
      : `Tool from ${row.server_name}.`,
    // jsonb comes back already parsed from the pg driver.
    inputSchema: (row.input_schema ?? {
      type: "object",
      properties: {},
    }) as Tool["inputSchema"],
  }));
}

/**
 * Resolves a namespaced tool name back to its server, within one profile.
 *
 * Scoping the lookup to the profile is a security boundary, not a
 * convenience: without it, a token could call a tool its profile does not
 * expose simply by naming it.
 */
export async function resolveTool(
  profileId: Uuid,
  namespacedName: string,
): Promise<{ server: McpServerModel; toolName: string } | null> {
  const tool = (await McpToolModel.query()
    .joinRelated("server")
    .join("profile_servers as ps", "ps.server_id", "server.id")
    .where("ps.profile_id", profileId)
    .where("server.enabled", true)
    .where("mcp_tools.enabled", true)
    .where("mcp_tools.namespaced_name", namespacedName)
    .first()
    .select("mcp_tools.*", "server.id as resolved_server_id")) as
    | (McpToolModel & { resolved_server_id: Uuid })
    | undefined;

  if (!tool) return null;

  const server = await McpServerModel.query().findById(tool.resolved_server_id);
  if (!server) return null;

  return { server, toolName: tool.name };
}

/**
 * Executes an aggregated tool call: resolve the namespaced name within the
 * calling profile, forward it to the owning upstream under its original name,
 * and log the outcome against both the company and the profile.
 */
export async function callAggregatedTool(
  scope: { userId: Uuid; companyId: Uuid; profileId: Uuid },
  namespacedName: string,
  args: Record<string, unknown> | undefined,
) {
  const startedAt = Date.now();
  const resolved = await resolveTool(scope.profileId, namespacedName);

  if (!resolved) {
    await recordLog({
      user_id: scope.userId,
      company_id: scope.companyId,
      profile_id: scope.profileId,
      method: "tools/call",
      tool_name: namespacedName,
      status: "error",
      duration_ms: Date.now() - startedAt,
      message: "Unknown tool.",
    });
    throw ApiError.notFound(`Unknown tool: ${namespacedName}`);
  }

  const { server, toolName } = resolved;

  try {
    const { client } = await acquire(server);
    const result = await callUpstreamTool(client, toolName, args);

    await recordLog({
      user_id: scope.userId,
      company_id: scope.companyId,
      profile_id: scope.profileId,
      server_id: server.id,
      method: "tools/call",
      tool_name: namespacedName,
      status: result?.isError ? "error" : "ok",
      duration_ms: Date.now() - startedAt,
      message: result?.isError ? "Upstream reported a tool error." : null,
    });

    return result;
  } catch (error) {
    release(server.id);

    await recordLog({
      user_id: scope.userId,
      company_id: scope.companyId,
      profile_id: scope.profileId,
      server_id: server.id,
      method: "tools/call",
      tool_name: namespacedName,
      status: "error",
      duration_ms: Date.now() - startedAt,
      message: errorMessage(error, "Tool call failed."),
    });

    throw error;
  }
}
