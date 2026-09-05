import { api } from "@/lib/api";
import type { CatalogResponse } from "@shared/api";
import type { CatalogEntry } from "@shared/domain";

/**
 * DATA -- the signed-out catalog for the landing page.
 *
 * Reads the same list the dashboard does, so the logos on the marketing page
 * are the apps you can actually connect, not a hand-maintained mock that
 * drifts out of date.
 */
export async function fetchPublicApps(): Promise<CatalogEntry[]> {
  const { catalog } = await api.get<CatalogResponse>("/public/apps");
  return catalog;
}
