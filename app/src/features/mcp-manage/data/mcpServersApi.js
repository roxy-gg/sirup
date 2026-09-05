import { api } from "@/lib/api";

/**
 * DATA -- CRUD over the company's connected MCP servers.
 *
 * @typedef {{
 *   id: string, name: string, slug: string, url: string,
 *   status: "pending" | "connected" | "error", status_message: string | null,
 *   enabled: boolean, tool_count: number, has_auth: boolean,
 *   last_connected_at: string | null
 * }} McpServer
 * @typedef {{
 *   id: string, name: string, namespaced_name: string,
 *   description: string | null, enabled: boolean, input_schema: object | null
 * }} McpTool
 */

/** @returns {Promise<McpServer[]>} */
export async function fetchServers() {
  const { servers } = await api.get("/mcp-servers");
  return servers;
}

/** @returns {Promise<McpServer & { tools: McpTool[] }>} */
export async function fetchServer(id) {
  const { server } = await api.get(`/mcp-servers/${id}`);
  return server;
}

/** @returns {Promise<McpServer>} */
export async function connectServer(payload) {
  const { server } = await api.post("/mcp-servers", payload);
  return server;
}

/** @returns {Promise<McpServer>} */
export async function updateServer(id, payload) {
  const { server } = await api.patch(`/mcp-servers/${id}`, payload);
  return server;
}

/** Re-runs tool discovery against the upstream. */
export async function refreshServer(id) {
  const { server } = await api.post(`/mcp-servers/${id}/refresh`);
  return server;
}

export function disconnectServer(id) {
  return api.delete(`/mcp-servers/${id}`);
}

/** @returns {Promise<McpTool>} */
export async function setToolEnabled(serverId, toolId, enabled) {
  const { tool } = await api.patch(`/mcp-servers/${serverId}/tools/${toolId}`, { enabled });
  return tool;
}
