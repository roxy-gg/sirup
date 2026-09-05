import { useEffect, useMemo, useState } from "react";
import { fetchCatalog } from "../data/mcpCatalogApi";
import type { CatalogEntry } from "@shared/domain";

/**
 * HOOKS -- loads the catalog, and owns its search and category filters.
 */
export function useMcpCatalog(refreshKey = 0) {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [category, setCategory] = useState<string>("All");
  const [query, setQuery] = useState("");

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

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return catalog.filter((entry) => {
      if (category !== "All" && entry.category !== category) return false;
      if (!needle) return true;
      // Match the description too, so "email" finds Gmail-like apps even when
      // the product name doesn't contain the word.
      return (
        entry.name.toLowerCase().includes(needle) ||
        entry.description.toLowerCase().includes(needle) ||
        entry.category.toLowerCase().includes(needle)
      );
    });
  }, [catalog, category, query]);

  return {
    catalog: visible,
    /** The unfiltered list, for callers that need to match against all apps. */
    all: catalog,
    categories,
    category,
    setCategory,
    query,
    setQuery,
    status,
    /** How many apps can actually be connected today, for the header copy. */
    connectableCount: catalog.filter(
      (entry) => entry.connect_mode !== "unavailable",
    ).length,
  };
}
