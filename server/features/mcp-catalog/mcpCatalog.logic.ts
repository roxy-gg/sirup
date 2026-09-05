import * as data from "./mcpCatalog.data.js";
import type { CatalogEntry } from "../../../shared/domain.js";

/**
 * LOGIC -- marks which catalog entries the company already connected, so the
 * Discover grid can show "Connected" instead of offering a duplicate.
 */
export function list(connectedUrls: Array<string | null> = []): CatalogEntry[] {
  const connected = new Set(
    connectedUrls.filter((url): url is string => Boolean(url)).map(normalizeUrl),
  );

  return data.listCatalog().map((entry) => ({
    ...entry,
    connected: entry.url ? connected.has(normalizeUrl(entry.url)) : false,
  }));
}

/** Trailing slashes and case differences shouldn't read as different servers. */
function normalizeUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return String(value).trim().toLowerCase();
  }
}
