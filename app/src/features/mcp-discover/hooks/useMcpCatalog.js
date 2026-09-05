import { useEffect, useMemo, useState } from "react";
import { fetchCatalog } from "../data/mcpCatalogApi";

/**
 * HOOKS -- loads the catalog and derives its category filter.
 */
export function useMcpCatalog(refreshKey = 0) {
  const [catalog, setCatalog] = useState([]);
  const [status, setStatus] = useState("loading");
  const [category, setCategory] = useState("All");

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
    () => (category === "All" ? catalog : catalog.filter((e) => e.category === category)),
    [catalog, category],
  );

  return { catalog: visible, categories, category, setCategory, status };
}
