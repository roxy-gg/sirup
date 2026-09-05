import { useCallback, useEffect, useState } from "react";
import * as api from "../data/mcpLogsApi";
import type { LogStatus, LogSummary, McpLog, Uuid } from "@shared/domain";

/**
 * HOOKS -- paginated log feed plus the 24h rollup.
 *
 * Pagination uses an opaque keyset cursor over (created_at, id), so new
 * activity arriving mid-scroll can't shift rows into or out of a loaded page.
 * The cursor is built by the server; treat it as a token, not a value.
 */
interface UseMcpLogsOptions {
  serverId?: Uuid | undefined;
  status?: LogStatus | undefined;
}

type LoadState = "loading" | "loading-more" | "ready";

export function useMcpLogs({ serverId, status }: UseMcpLogsOptions = {}) {
  const [logs, setLogs] = useState<McpLog[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [summary, setSummary] = useState<LogSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");

  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      const [page, rollup] = await Promise.all([
        api.fetchLogs({ serverId, status }),
        api.fetchLogSummary(),
      ]);
      setLogs(page.logs);
      setCursor(page.next_cursor);
      setSummary(rollup);
      setError(null);
    } catch (loadError) {
      // Without this the screen would sit on an empty state forever and read
      // as "no activity" when the real answer is "the request failed".
      setError(loadError instanceof Error ? loadError.message : String(loadError));
      setLogs([]);
      setCursor(null);
    } finally {
      setLoadState("ready");
    }
  }, [serverId, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = useCallback(async () => {
    if (!cursor) return;
    setLoadState("loading-more");
    try {
      const page = await api.fetchLogs({ cursor, serverId, status });
      setLogs((current) => [...current, ...page.logs]);
      setCursor(page.next_cursor);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoadState("ready");
    }
  }, [cursor, serverId, status]);

  return {
    logs,
    summary,
    error,
    loadState,
    hasMore: Boolean(cursor),
    reload: load,
    loadMore,
  };
}
