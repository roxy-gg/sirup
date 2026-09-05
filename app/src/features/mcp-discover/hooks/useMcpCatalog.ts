import { useEffect, useMemo, useState } from "react";
import { fetchCatalog } from "../data/mcpCatalogApi";
import type { CatalogEntry } from "@shared/domain";

/**
 * HOOKS -- loads the catalog and derives its category filter.
 */
export function useMcpCatalog(refreshKey = 0) {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [category, setCategory] = useState<string>("All");

  useEffect(() => {
    let cancelled = false;

    fetchCatalog()
      .then((entries) => {
        if (!cancelled) setCatalog(entries);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setStatus("ready");
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const categories = useMemo(
    () => ["All", ...new Set(catalog.map((entry) => entry.category))],
    [catalog],
  );

  const visible = useMemo(
    () =>
      category === "All"
        ? catalog
        : catalog.filter((entry) => entry.category === category),
    [catalog, category],
  );

  return { catalog: visible, categories, category, setCategory, status };
}
