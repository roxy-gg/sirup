import { McpLog } from "../../database/models/index.js";

/**
 * DATA -- read queries for the audit trail. Writes happen in the aggregator,
 * on the hot path of a tool call.
 */

export function listLogs(companyId, { limit, cursor, serverId, status }) {
  const query = McpLog.query()
    .where("mcp_logs.company_id", companyId)
    .leftJoinRelated("server")
    .select("mcp_logs.*", "server.name as server_name", "server.slug as server_slug")
    // Must match mcp_logs_company_created_idx for the keyset scan to use it.
    .orderBy([
      { column: "mcp_logs.created_at", order: "desc" },
      { column: "mcp_logs.id", order: "desc" },
    ])
    .limit(limit);

  if (cursor) {
    // Row-value comparison: "everything strictly older than this row".
    //
    // UUIDv4 ids are random, so unlike an auto-increment id they cannot order
    // rows on their own. created_at does the ordering; id only disambiguates
    // rows sharing a timestamp. Postgres can match this tuple form directly
    // against the composite index.
    query.whereRaw("(mcp_logs.created_at, mcp_logs.id) < (?, ?)", [
      cursor.createdAt,
      cursor.id,
    ]);
  }

  if (serverId) query.where("mcp_logs.server_id", serverId);
  if (status) query.where("mcp_logs.status", status);

  return query;
}

/** Rollup for the logs header: calls and error rate over a recent window. */
export async function summarize(companyId, sinceIso) {
  const rows = await McpLog.query()
    .where("company_id", companyId)
    .where("created_at", ">=", sinceIso)
    .select("status")
    .count("* as count")
    .groupBy("status");

  const summary = { total: 0, ok: 0, error: 0 };
  for (const row of rows) {
    const count = Number(row.count);
    summary.total += count;
    if (row.status === "ok") summary.ok += count;
    if (row.status === "error") summary.error += count;
  }
  return summary;
}
