import { McpServer, McpTool, McpLog } from "../database/models/index.js";
import { acquire, release } from "./connectionPool.js";
import { listUpstreamTools, callUpstreamTool } from "./upstreamClient.js";
import { ApiError } from "../shared/errors.js";

/** Separator between the server slug and the upstream tool name. */
export const NAMESPACE_SEPARATOR = "__";

/**
 * Two connected servers can easily both expose a tool called `search`. The
 * gateway therefore presents every tool as "<server slug>__<tool name>" so
 * names stay unique and the model can tell Gmail's search from Slack's.
 */
export function namespaceToolName(slug, toolName) {
  return `${slug}${NAMESPACE_SEPARATOR}${toolName}`;
}

/**
 * Records what crossed the gateway. Logging must never break a tool call, so
 * failures here are swallowed.
 */
export async function recordLog(entry) {
  try {
    await McpLog.query().insert(entry);
  } catch (error) {
    console.error("[mcp] failed to write log:", error.message);
  }
}

/**
 * Connects to one upstream, reads its tool list, and replaces the cached tools
 * for that server. Returns the stored tool rows.
 */
export async function refreshServerTools(server) {
  const startedAt = Date.now();

  try {
    const { client } = await acquire(server);
    const tools = await listUpstreamTools(client);

    // Preserve per-tool enable/disable choices across a refresh.
    const previous = await McpTool.query().where("server_id", server.id);
    const previouslyDisabled = new Set(
      previous.filter((tool) => !tool.enabled).map((tool) => tool.name),
    );

    await McpTool.transaction(async (trx) => {
      await McpTool.query(trx).delete().where("server_id", server.id);

      if (tools.length > 0) {
        // Postgres does multi-row INSERT natively, so this is one statement.
        await McpTool.query(trx).insert(
          tools.map((tool) => ({
            server_id: server.id,
            name: tool.name,
            namespaced_name: namespaceToolName(server.slug, tool.name),
            description: tool.description || null,
            input_schema: tool.inputSchema || null,
            enabled: !previouslyDisabled.has(tool.name),
          })),
        );
      }

      await McpServer.query(trx).findById(server.id).patch({
        status: "connected",
        status_message: null,
        tool_count: tools.length,
        last_connected_at: new Date().toISOString(),
      });
    });

    await recordLog({
      company_id: server.company_id,
      server_id: server.id,
      method: "refresh",
      status: "ok",
      duration_ms: Date.now() - startedAt,
      message: `Discovered ${tools.length} tool(s).`,
    });

    return McpTool.query().where("server_id", server.id).orderBy("name");
  } catch (error) {
    release(server.id);

    await McpServer.query().findById(server.id).patch({
      status: "error",
      status_message: error.message?.slice(0, 500) || "Connection failed.",
    });

    await recordLog({
      company_id: server.company_id,
      server_id: server.id,
      method: "refresh",
      status: "error",
      duration_ms: Date.now() - startedAt,
      message: error.message?.slice(0, 500) || "Connection failed.",
    });

    throw error;
  }
}

/**
 * The aggregated tool list for a company: every enabled tool from every enabled,
 * connected server, in MCP `tools/list` shape.
 *
 * This reads from the cache rather than fanning out to each upstream. A cold
 * fan-out on every tools/list would make the gateway as slow as its slowest
 * upstream and would break the list entirely whenever one server is down.
 */
export async function listAggregatedTools(companyId) {
  const rows = await McpTool.query()
    .joinRelated("server")
    .where("server.company_id", companyId)
    .where("server.enabled", true)
    .where("mcp_tools.enabled", true)
    .orderBy(["server.slug", "mcp_tools.name"])
    .select(
      "mcp_tools.namespaced_name",
      "mcp_tools.description",
      "mcp_tools.input_schema",
      "server.name as server_name",
    );

  return rows.map((row) => ({
    name: row.namespaced_name,
    // Prefixing the source server helps the model pick between similar tools.
    description: row.description
      ? `[${row.server_name}] ${row.description}`
      : `Tool from ${row.server_name}.`,
    // jsonb comes back already parsed from the pg driver.
    inputSchema: row.input_schema || { type: "object", properties: {} },
  }));
}

/**
 * Resolves a namespaced tool name back to its server and upstream name.
 *
 * The slug itself may contain "-" but never "__", so splitting on the first
 * separator is unambiguous.
 */
export async function resolveTool(companyId, namespacedName) {
  const tool = await McpTool.query()
    .joinRelated("server")
    .where("server.company_id", companyId)
    .where("server.enabled", true)
    .where("mcp_tools.enabled", true)
    .where("mcp_tools.namespaced_name", namespacedName)
    .first()
    .select("mcp_tools.*", "server.id as resolved_server_id");

  if (!tool) return null;

  const server = await McpServer.query().findById(tool.resolved_server_id);
  if (!server) return null;

  return { server, toolName: tool.name };
}

/**
 * Executes an aggregated tool call: resolve the namespaced name, forward it to
 * the owning upstream under its original name, and log the outcome.
 */
export async function callAggregatedTool(companyId, namespacedName, args) {
  const startedAt = Date.now();
  const resolved = await resolveTool(companyId, namespacedName);

  if (!resolved) {
    await recordLog({
      company_id: companyId,
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
      company_id: companyId,
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
      company_id: companyId,
      server_id: server.id,
      method: "tools/call",
      tool_name: namespacedName,
      status: "error",
      duration_ms: Date.now() - startedAt,
      message: error.message?.slice(0, 500) || "Tool call failed.",
    });

    throw error;
  }
}
