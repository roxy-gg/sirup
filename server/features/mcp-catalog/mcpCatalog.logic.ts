import * as data from "./mcpCatalog.data.js";
import { findOAuthIntegration } from "../../integrations/registry.js";
import type { CatalogEntry } from "../../../shared/domain.js";

/**
 * LOGIC -- marks which catalog entries the company already connected, so the
 * grid can show "Added" instead of offering a duplicate.
 */
interface ConnectedServer {
  url: string;
  integration_key: string | null;
}

export function list(servers: ConnectedServer[] = []): CatalogEntry[] {
  const connectedUrls = new Set(
    servers
      .filter((server) => !server.integration_key)
      .map((server) => normalizeUrl(server.url)),
  );
  const connectedIntegrations = new Set(
    servers
      .map((server) => server.integration_key)
      .filter((key): key is string => Boolean(key)),
  );

  return data
    .listCatalog()
    .map((entry) => decorateEntry(entry, connectedUrls, connectedIntegrations));
}

function decorateEntry(
  entry: ReturnType<typeof data.listCatalog>[number],
  connectedUrls: ReadonlySet<string>,
  connectedIntegrations: ReadonlySet<string>,
): CatalogEntry {
  const integration = entry.integration_key
    ? findOAuthIntegration(entry.integration_key)
    : null;
  const connectMode: CatalogEntry["connect_mode"] =
    entry.auth !== "oauth"
      ? "direct"
      : integration && !integration.unavailableReason
        ? "oauth"
        : "unavailable";

  return {
    ...entry,
    connect_mode: connectMode,
    availability_message:
      connectMode === "unavailable"
        ? integration?.unavailableReason ?? "OAuth support is not available yet."
        : null,
    connected: entry.integration_key
      ? connectedIntegrations.has(entry.integration_key)
      : Boolean(entry.url && connectedUrls.has(normalizeUrl(entry.url))),
  };
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

/**
 * The signed-out view of the catalog, for the marketing page.
 *
 * Same source of truth as the dashboard, minus anything company-specific: no
 * `connected` flags, and the custom-server escape hatch is dropped because it
 * is not an app anyone recognises in a logo wall.
 */
export function publicCatalog(): CatalogEntry[] {
  return data
    .listCatalog()
    .filter((entry) => entry.key !== "custom")
    .map((entry) => decorateEntry(entry, new Set<string>(), new Set<string>()));
}
