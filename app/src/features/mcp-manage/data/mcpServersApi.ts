import { api } from "@/lib/api";
import type {
  ConnectServerBody,
  ServerListResponse,
  ServerResponse,
  ToolResponse,
  UpdateServerBody,
} from "@shared/api";
import type { McpServer, McpServerWithTools, McpTool, Uuid } from "@shared/domain";

/**
 * DATA -- CRUD over the company's connected MCP servers.
 */

export async function fetchServers(): Promise<McpServer[]> {
  const { servers } = await api.get<ServerListResponse>("/mcp-servers");
  return servers;
}

export async function fetchServer(id: Uuid): Promise<McpServerWithTools> {
  const { server } = await api.get<ServerResponse>(`/mcp-servers/${id}`);
  return server;
}

export async function connectServer(
  payload: ConnectServerBody,
): Promise<McpServerWithTools> {
  const { server } = await api.post<ServerResponse>("/mcp-servers", payload);
  return server;
}

export async function updateServer(
  id: Uuid,
  payload: UpdateServerBody,
): Promise<McpServerWithTools> {
  const { server } = await api.patch<ServerResponse>(`/mcp-servers/${id}`, payload);
  return server;
}

/** Re-runs tool discovery against the upstream. */
export async function refreshServer(id: Uuid): Promise<McpServerWithTools> {
  const { server } = await api.post<ServerResponse>(`/mcp-servers/${id}/refresh`);
  return server;
}

export function disconnectServer(id: Uuid): Promise<void> {
  return api.delete(`/mcp-servers/${id}`);
}

export async function setToolEnabled(
  serverId: Uuid,
  toolId: Uuid,
  enabled: boolean,
): Promise<McpTool> {
  const { tool } = await api.patch<ToolResponse>(
    `/mcp-servers/${serverId}/tools/${toolId}`,
    { enabled },
  );
  return tool;
}
