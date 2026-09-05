import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { RepoStatsResponse } from "@shared/api";

/**
 * HOOKS -- the repo's star count, for the navbar badge.
 *
 * The nav unmounts and remounts on every client-side navigation, so the
 * in-flight promise is cached at module scope: the count is fetched once per
 * page load and is already resolved on the second render. Without this the
 * badge pops in again every time you move between pages.
 */
export const REPO_URL = "https://github.com/roxy-gg/sirup";

let pending: Promise<RepoStatsResponse | null> | null = null;

function fetchRepoStats(): Promise<RepoStatsResponse | null> {
  pending ??= api.get<RepoStatsResponse>("/public/github").catch(() => null);
  return pending;
}

/** Compact star count: 2 -> "2", 1200 -> "1.2k", 12000 -> "12k". */
export function formatStars(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k.toFixed(k < 10 ? 1 : 0).replace(/\.0$/, "")}k`;
}

/**
 * `settled` is separate from `stars` so callers can tell "still loading" apart
 * from "there is no count". The nav uses it to hold space for the badge while
 * the request is in flight -- avoiding a layout shift -- and then to reclaim
 * that space if the answer turns out to be nothing, rather than leaving a
 * permanent gap next to the word "GitHub".
 */
export function useRepoStats(): { stars: number | null; settled: boolean } {
  const [state, setState] = useState<{ stars: number | null; settled: boolean }>({
    stars: null,
    settled: false,
  });

  useEffect(() => {
    let alive = true;
    void fetchRepoStats().then((data) => {
      if (alive) setState({ stars: data?.stars ?? null, settled: true });
    });
    return () => {
      alive = false;
    };
  }, []);

  return state;
}
