import { McpServerModel, McpToolModel } from "../../database/models/index.js";
import type { Uuid } from "../../../shared/domain.js";

/**
 * DATA -- all Objection queries for connected MCP servers.
 */

export function listServers(companyId: Uuid) {
  return McpServerModel.query()
    .where("company_id", companyId)
    .orderBy("created_at", "desc");
}

export function findServer(companyId: Uuid, serverId: Uuid) {
  return McpServerModel.query().findById(serverId).where("company_id", companyId);
}

export function findServerWithTools(companyId: Uuid, serverId: Uuid) {
  return McpServerModel.query()
    .findById(serverId)
    .where("company_id", companyId)
    .withGraphFetched("tools(ordered)")
    .modifiers({
      ordered: (builder) => builder.orderBy("name"),
    });
}

export function listSlugs(companyId: Uuid) {
  return McpServerModel.query().where("company_id", companyId).select("slug");
}

export function insertServer(values: Partial<McpServerModel>) {
  return McpServerModel.query().insert(values);
}

export function patchServer(
  companyId: Uuid,
  serverId: Uuid,
  values: Partial<McpServerModel>,
) {
  return McpServerModel.query()
    .patchAndFetchById(serverId, values)
    .where("company_id", companyId);
}

export function deleteServer(companyId: Uuid, serverId: Uuid) {
  return McpServerModel.query()
    .delete()
    .where("company_id", companyId)
    .where("id", serverId);
}

export function listTools(serverId: Uuid) {
  return McpToolModel.query().where("server_id", serverId).orderBy("name");
}

export function patchTool(
  serverId: Uuid,
  toolId: Uuid,
  values: Partial<McpToolModel>,
) {
  return McpToolModel.query()
    .patchAndFetchById(toolId, values)
    .where("server_id", serverId);
}

/** Counts across the company, for the dashboard header. */
export function countTools(companyId: Uuid): Promise<number> {
  return McpToolModel.query()
    .joinRelated("server")
    .where("server.company_id", companyId)
    .where("server.enabled", true)
    .where("mcp_tools.enabled", true)
    .resultSize();
}
