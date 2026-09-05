import { api } from "@/lib/api";

/**
 * DATA -- the starter catalog of well-known MCP servers.
 *
 * @typedef {{
 *   key: string, name: string, category: string, description: string,
 *   url: string | null, auth_type: "none" | "bearer" | "header",
 *   auth_hint: string, connected: boolean
 * }} CatalogEntry
 */

/** @returns {Promise<CatalogEntry[]>} */
export async function fetchCatalog() {
  const { catalog } = await api.get("/mcp-catalog");
  return catalog;
}
