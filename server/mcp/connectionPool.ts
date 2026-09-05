import {
  connectToUpstream,
  closeUpstream,
  type ConnectableServer,
  type UpstreamConnection,
} from "./upstreamClient.js";
import type { Uuid } from "../../shared/domain.js";

/**
 * A small connection pool for upstream MCP servers.
 *
 * Every tool call would otherwise pay for a fresh MCP initialize handshake, so
 * connections are reused and evicted after an idle period. Entries are keyed by
 * server id, and the in-flight connect promise is cached too, so N concurrent
 * calls to a cold server open one connection rather than N.
 */
const IDLE_TTL_MS = 5 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;

interface PoolEntry {
  promise: Promise<UpstreamConnection>;
  /**
   * Primitive stamp of the source row. Typed as a primitive on purpose: the pg
   * driver returns `timestamptz` as a Date, and comparing Dates with === never
   * matches, which silently disabled this whole cache once already.
   */
  revision: number | string;
  lastUsedAt: number;
}

/** What `acquire` needs: connection details, plus identity and revision. */
export type PoolableServer = ConnectableServer & {
  id: Uuid;
  updated_at: Date | string;
};

const pool = new Map<string, PoolEntry>();

/**
 * Postgres compares uuid values case-insensitively, but a JS Map does not.
 * Without normalising, an id that differs only in case would look up a
 * different pool entry -- so `release()` after a credential change could miss,
 * leaving a connection live with a revoked credential.
 */
function poolKey(serverId: Uuid): string {
  return String(serverId).toLowerCase();
}

/** The revision stamp used to detect that a server row changed. */
function revisionOf(server: PoolableServer): number | string {
  const updatedAt = server.updated_at;
  if (updatedAt instanceof Date) return updatedAt.getTime();
  const parsed = Date.parse(updatedAt);
  return Number.isNaN(parsed) ? String(updatedAt) : parsed;
}

function evict(serverId: Uuid): void {
  const key = poolKey(serverId);
  const entry = pool.get(key);
  if (!entry) return;
  pool.delete(key);
  entry.promise.then(({ client }) => closeUpstream(client)).catch(() => {});
}

/**
 * Returns a connected client for the server, reusing a live one when possible.
 * A change to `server.updated_at` busts the entry, so credential or URL edits
 * take effect immediately instead of after the idle timeout.
 */
export async function acquire(server: PoolableServer): Promise<UpstreamConnection> {
  const key = poolKey(server.id);
  const revision = revisionOf(server);
  const cached = pool.get(key);

  if (cached && cached.revision === revision) {
    cached.lastUsedAt = Date.now();
    try {
      return await cached.promise;
    } catch (error) {
      pool.delete(key);
      throw error;
    }
  }

  if (cached) evict(server.id);

  const promise = connectToUpstream(server);
  const entry: PoolEntry = { promise, revision, lastUsedAt: Date.now() };
  pool.set(key, entry);

  try {
    const connection = await promise;
    // A closed transport must not linger in the pool as a dead entry.
    connection.client.onclose = () => {
      if (pool.get(key) === entry) pool.delete(key);
    };
    return connection;
  } catch (error) {
    if (pool.get(key) === entry) pool.delete(key);
    throw error;
  }
}

/** Drops a server's connection -- used on disconnect/delete and on edits. */
export function release(serverId: Uuid): void {
  evict(serverId);
}

/** Test/diagnostic hook: how many live entries the pool is holding. */
export function poolSize(): number {
  return pool.size;
}

const sweeper = setInterval(() => {
  const cutoff = Date.now() - IDLE_TTL_MS;
  for (const [key, entry] of pool.entries()) {
    if (entry.lastUsedAt < cutoff) evict(key);
  }
}, SWEEP_INTERVAL_MS);

// Never hold the event loop open just for the sweeper.
sweeper.unref?.();
