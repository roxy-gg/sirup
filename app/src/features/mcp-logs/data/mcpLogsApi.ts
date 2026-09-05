import { api } from "@/lib/api";
import type { LogListResponse, LogSummaryResponse } from "@shared/api";
import type { LogStatus, LogSummary, Uuid } from "@shared/domain";

/**
 * DATA -- read-only access to the gateway audit trail.
 */

export interface FetchLogsOptions {
  /**
   * The opaque `next_cursor` from a previous page. Do not construct one by
   * hand: the server encodes a (created_at, id) tuple into it, because UUIDv4
   * ids carry no ordering of their own.
   */
  cursor?: string | null;
  serverId?: Uuid | undefined;
  status?: LogStatus | undefined;
  limit?: number;
}

export function fetchLogs({
  cursor,
  serverId,
  status,
  limit = 50,
}: FetchLogsOptions = {}): Promise<LogListResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  if (serverId) params.set("server_id", serverId);
  if (status) params.set("status", status);

  return api.get<LogListResponse>(`/mcp-logs?${params.toString()}`);
}

export async function fetchLogSummary(): Promise<LogSummary> {
  const { summary } = await api.get<LogSummaryResponse>("/mcp-logs/summary");
  return summary;
}
