import { McpLogModel } from "../../database/models/index.js";
import type { Uuid } from "../../../shared/domain.js";
import type { LogSummary } from "../../../shared/domain.js";

/**
 * DATA -- read queries for the audit trail. Writes happen in the aggregator,
 * on the hot path of a tool call.
 */

export interface KeysetCursor {
  createdAt: string;
  id: Uuid;
}

export interface ListLogsOptions {
  limit: number;
  cursor: KeysetCursor | null;
  serverId?: Uuid;
  status?: "ok" | "error";
}

export function listLogs(companyId: Uuid, options: ListLogsOptions) {
  const query = McpLogModel.query()
    .where("mcp_logs.company_id", companyId)
    .leftJoinRelated("server")
    .select("mcp_logs.*", "server.name as server_name", "server.slug as server_slug")
    // Must match mcp_logs_company_created_idx for the keyset scan to use it.
    .orderBy([
      { column: "mcp_logs.created_at", order: "desc" },
      { column: "mcp_logs.id", order: "desc" },
    ])
    .limit(options.limit);

  if (options.cursor) {
    // Row-value comparison: "everything strictly older than this row".
    //
    // UUIDv4 ids are random, so unlike an auto-increment id they cannot order
    // rows on their own. created_at does the ordering; id only disambiguates
    // rows sharing a timestamp. Postgres can match this tuple form directly
    // against the composite index.
    query.whereRaw("(mcp_logs.created_at, mcp_logs.id) < (?, ?)", [
      options.cursor.createdAt,
      options.cursor.id,
    ]);
  }

  if (options.serverId) query.where("mcp_logs.server_id", options.serverId);
  if (options.status) query.where("mcp_logs.status", options.status);

  return query;
}

/** Rollup for the logs header: calls and error rate over a recent window. */
export async function summarize(
  companyId: Uuid,
  sinceIso: string,
): Promise<LogSummary> {
  const rows = (await McpLogModel.query()
    .where("company_id", companyId)
    .where("created_at", ">=", sinceIso)
    .select("status")
    .count("* as count")
    .groupBy("status")) as unknown as Array<{ status: string; count: string }>;

  const summary: LogSummary = { total: 0, ok: 0, error: 0 };
  for (const row of rows) {
    const count = Number(row.count);
    summary.total += count;
    if (row.status === "ok") summary.ok += count;
    if (row.status === "error") summary.error += count;
  }
  return summary;
}
