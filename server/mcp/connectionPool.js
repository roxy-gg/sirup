import { connectToUpstream, closeUpstream } from "./upstreamClient.js";

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

const pool = new Map();

/**
 * Postgres compares uuid values case-insensitively, but a JS Map does not.
 * Without normalising, an id that differs only in case would look up a
 * different pool entry -- so `release()` after a credential change could miss,
 * leaving a connection live with a revoked credential.
 */
function poolKey(serverId) {
  return String(serverId).toLowerCase();
}

/**
 * The revision stamp used to detect that a server row changed.
 *
 * Must be a primitive. The pg driver returns `timestamptz` as a Date object,
 * and two Dates are never `===`, so comparing them directly would miss on
 * every single lookup and silently disable the whole cache.
 */
function revisionOf(server) {
  const updatedAt = server.updated_at;
  if (updatedAt instanceof Date) return updatedAt.getTime();
  const parsed = Date.parse(updatedAt);
  return Number.isNaN(parsed) ? String(updatedAt) : parsed;
}

function evict(serverId) {
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
export async function acquire(server) {
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

  if (cached) evict(key);

  const promise = connectToUpstream(server);
  const entry = { promise, revision, lastUsedAt: Date.now() };
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
export function release(serverId) {
  evict(serverId);
}

/** Test/diagnostic hook: how many live entries the pool is holding. */
export function poolSize() {
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
