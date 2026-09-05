import { api } from "@/lib/api";
import type { CatalogResponse } from "@shared/api";
import type { CatalogEntry } from "@shared/domain";

/**
 * DATA -- the starter catalog of well-known MCP servers.
 */
export async function fetchCatalog(): Promise<CatalogEntry[]> {
  const { catalog } = await api.get<CatalogResponse>("/mcp-catalog");
  return catalog;
}
