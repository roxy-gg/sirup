import { useCallback, useEffect, useState } from "react";
import * as api from "../data/mcpServersApi";
import type { ConnectServerBody } from "@shared/api";
import type { McpServer, McpServerWithTools, Uuid } from "@shared/domain";

/**
 * HOOKS -- owns the list of connected servers and every mutation on it.
 *
 * Mutations refetch the list rather than patching local state: a connect also
 * changes tool counts and status, and staying authoritative is worth more than
 * saving a round trip on a screen this small.
 */
export function useMcpServers() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<Uuid | null>(null);

  const load = useCallback(async () => {
    try {
      setServers(await api.fetchServers());
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setStatus("ready");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const connect = useCallback(
    async (payload: ConnectServerBody): Promise<McpServerWithTools> => {
      const server = await api.connectServer(payload);
      await load();
      return server;
    },
    [load],
  );

  /** Wraps per-row actions so the UI can disable just that row. */
  const withBusy = useCallback(
    async (id: Uuid, action: () => Promise<unknown>) => {
      setBusyId(id);
      try {
        await action();
        await load();
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const refresh = useCallback(
    (id: Uuid) => withBusy(id, () => api.refreshServer(id)),
    [withBusy],
  );

  const disconnect = useCallback(
    (id: Uuid) => withBusy(id, () => api.disconnectServer(id)),
    [withBusy],
  );

  const toggleEnabled = useCallback(
    (id: Uuid, enabled: boolean) =>
      withBusy(id, () => api.updateServer(id, { enabled })),
    [withBusy],
  );

  return {
    servers,
    status,
    error,
    busyId,
    reload: load,
    connect,
    refresh,
    disconnect,
    toggleEnabled,
    totalTools: servers
      .filter((server) => server.enabled && server.status === "connected")
      .reduce((sum, server) => sum + server.tool_count, 0),
  };
}
