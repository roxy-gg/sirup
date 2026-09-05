import { api } from "@/lib/api";

/**
 * DATA -- read-only access to the gateway audit trail.
 *
 * @typedef {{
 *   id: string, method: string, tool_name: string | null,
 *   status: "ok" | "error", duration_ms: number | null,
 *   message: string | null, created_at: string,
 *   server_name: string | null, server_slug: string | null
 * }} McpLog
 */

/**
 * `cursor` is the opaque `next_cursor` from a previous page -- do not construct
 * one by hand; the server encodes a (created_at, id) tuple into it.
 *
 * @returns {Promise<{ logs: McpLog[], next_cursor: string | null }>}
 */
export function fetchLogs({ cursor, serverId, status, limit = 50 } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  if (serverId) params.set("server_id", serverId);
  if (status) params.set("status", status);

  return api.get(`/mcp-logs?${params.toString()}`);
}

/** @returns {Promise<{ total: number, ok: number, error: number }>} */
export async function fetchLogSummary() {
  const { summary } = await api.get("/mcp-logs/summary");
  return summary;
}
