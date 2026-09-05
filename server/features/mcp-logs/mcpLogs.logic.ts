import { z } from "zod";
import * as data from "./mcpLogs.data.js";
import { UUID_RE } from "../../shared/uuid.js";
import type { McpLogModel } from "../../database/models/index.js";
import type { LogListResponse } from "../../../shared/api.js";
import type { LogSummary, Uuid } from "../../../shared/domain.js";

/**
 * LOGIC -- pagination rules and the activity rollup.
 */

const uuid = z.string().regex(UUID_RE, "Expected a UUID.");

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  // Opaque keyset cursor: "<ISO timestamp>|<uuid>" of the last row seen.
  cursor: z.string().optional(),
  server_id: uuid.optional(),
  status: z.enum(["ok", "error"]).optional(),
});

/**
 * Cursors are encoded rather than exposed as two query params so callers treat
 * them as opaque and we can change the tuple later without breaking clients.
 */
function encodeCursor(log: McpLogModel): string {
  const createdAt =
    log.created_at instanceof Date ? log.created_at.toISOString() : log.created_at;
  return Buffer.from(`${createdAt}|${log.id}`, "utf8").toString("base64url");
}

function decodeCursor(raw: string | undefined): data.KeysetCursor | null {
  if (!raw) return null;

  try {
    const [createdAt, id] = Buffer.from(raw, "base64url").toString("utf8").split("|");
    // A malformed cursor must not become an unfiltered query or a SQL error.
    if (!createdAt || !id || !UUID_RE.test(id)) return null;
    if (Number.isNaN(Date.parse(createdAt))) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

export async function list(
  companyId: Uuid,
  rawQuery: unknown,
): Promise<LogListResponse> {
  const {
    limit,
    cursor: rawCursor,
    server_id: serverId,
    status,
  } = querySchema.parse(rawQuery);

  const logs = await data.listLogs(companyId, {
    limit,
    cursor: decodeCursor(rawCursor),
    ...(serverId ? { serverId } : {}),
    ...(status ? { status } : {}),
  });

  const last = logs.at(-1);

  return {
    logs: logs as unknown as LogListResponse["logs"],
    // Only advertise a cursor when the page was full; otherwise we're at the end.
    next_cursor: logs.length === limit && last ? encodeCursor(last) : null,
  };
}

export function summary(companyId: Uuid, hours = 24): Promise<LogSummary> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  return data.summarize(companyId, since);
}
