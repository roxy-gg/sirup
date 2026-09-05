import { McpServer, McpTool } from "../../database/models/index.js";

/**
 * DATA -- all Objection queries for connected MCP servers.
 */

export function listServers(companyId) {
  return McpServer.query()
    .where("company_id", companyId)
    .orderBy("created_at", "desc");
}

export function findServer(companyId, serverId) {
  return McpServer.query().findById(serverId).where("company_id", companyId);
}

export function findServerWithTools(companyId, serverId) {
  return McpServer.query()
    .findById(serverId)
    .where("company_id", companyId)
    .withGraphFetched("tools(ordered)")
    .modifiers({
      ordered: (builder) => builder.orderBy("name"),
    });
}

export function listSlugs(companyId) {
  return McpServer.query().where("company_id", companyId).select("slug");
}

export function insertServer(values) {
  return McpServer.query().insert(values);
}

export function patchServer(companyId, serverId, values) {
  return McpServer.query()
    .patchAndFetchById(serverId, values)
    .where("company_id", companyId);
}

export function deleteServer(companyId, serverId) {
  return McpServer.query().delete().where("company_id", companyId).where("id", serverId);
}

export function listTools(serverId) {
  return McpTool.query().where("server_id", serverId).orderBy("name");
}

export function patchTool(serverId, toolId, values) {
  return McpTool.query()
    .patchAndFetchById(toolId, values)
    .where("server_id", serverId);
}

/** Counts across the company, for the dashboard header. */
export async function countTools(companyId) {
  const result = await McpTool.query()
    .joinRelated("server")
    .where("server.company_id", companyId)
    .where("server.enabled", true)
    .where("mcp_tools.enabled", true)
    .resultSize();
  return result;
}
