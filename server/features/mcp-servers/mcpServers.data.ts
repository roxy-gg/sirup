import { McpServerModel, McpToolModel } from "../../database/models/index.js";
import type { Uuid } from "../../../shared/domain.js";

/**
 * DATA -- all Objection queries for connected MCP servers.
 *
 * Everything is scoped by `user_id`. A connection belongs to the person who
 * made it, not to their company: the stored credential is theirs, and nobody
 * else in the workspace has a read path to it.
 */

export function listServers(userId: Uuid) {
  return McpServerModel.query()
    .where("user_id", userId)
    .orderBy("created_at", "desc");
}

export function findServer(userId: Uuid, serverId: Uuid) {
  return McpServerModel.query().findById(serverId).where("user_id", userId);
}

export function findServerWithTools(userId: Uuid, serverId: Uuid) {
  return McpServerModel.query()
    .findById(serverId)
    .where("user_id", userId)
    .withGraphFetched("tools(ordered)")
    .modifiers({
      ordered: (builder) => builder.orderBy("name"),
    });
}

export function listSlugs(userId: Uuid) {
  return McpServerModel.query().where("user_id", userId).select("slug");
}

export function insertServer(values: Partial<McpServerModel>) {
  return McpServerModel.query().insert(values);
}

export function patchServer(
  userId: Uuid,
  serverId: Uuid,
  values: Partial<McpServerModel>,
) {
  return McpServerModel.query()
    .patchAndFetchById(serverId, values)
    .where("user_id", userId);
}

export function deleteServer(userId: Uuid, serverId: Uuid) {
  return McpServerModel.query()
    .delete()
    .where("user_id", userId)
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

/** Counts across the user's own connections, for the dashboard header. */
export function countTools(userId: Uuid): Promise<number> {
  return McpToolModel.query()
    .joinRelated("server")
    .where("server.user_id", userId)
    .where("server.enabled", true)
    .where("mcp_tools.enabled", true)
    .resultSize();
}
