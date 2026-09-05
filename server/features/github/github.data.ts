/**
 * DATA -- GitHub's view of the sirup repo.
 *
 * Only the star count is used, for the nav's social-proof badge. It lives on
 * the server rather than in the browser for two reasons: GitHub's
 * unauthenticated rate limit is 60 requests per hour *per IP*, which a busy
 * landing page would exhaust in minutes; and one shared in-memory cache means
 * every visitor is served from at most one upstream call per TTL.
 */
const REPO = "roxy-gg/sirup";
const GITHUB_REPO_API = `https://api.github.com/repos/${REPO}`;

export const REPO_URL = `https://github.com/${REPO}`;

const CACHE_TTL_MS = 10 * 60 * 1000;
// GitHub rejects requests without a User-Agent outright.
const HEADERS = {
  Accept: "application/vnd.github+json",
  "User-Agent": "sirup.gg",
};
// A hung fetch would hold the request open indefinitely; the badge is
// decoration, so it gets a short leash.
const TIMEOUT_MS = 4_000;

export interface RepoStats {
  /** null when GitHub is unreachable or rate-limiting, so the UI can omit it. */
  stars: number | null;
  forks: number | null;
  html_url: string;
}

interface GithubRepo {
  stargazers_count?: number;
  forks_count?: number;
  html_url?: string;
}

let cache: { at: number; data: RepoStats } | null = null;

/**
 * Star/fork counts, served from a 10-minute in-memory cache.
 *
 * Never throws. On failure it prefers stale cache over nothing -- a count that
 * is ten minutes out of date is strictly better than a badge that vanishes
 * whenever GitHub hiccups.
 */
export async function getRepoStats(): Promise<RepoStats> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;

  try {
    const response = await fetch(GITHUB_REPO_API, {
      headers: HEADERS,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`GitHub responded ${String(response.status)}`);

    const json = (await response.json()) as GithubRepo;
    const data: RepoStats = {
      stars: json.stargazers_count ?? null,
      forks: json.forks_count ?? null,
      html_url: json.html_url ?? REPO_URL,
    };
    cache = { at: Date.now(), data };
    return data;
  } catch (error) {
    if (cache) return cache.data;
    console.warn("[github] repo stats fetch failed:", String(error));
    return { stars: null, forks: null, html_url: REPO_URL };
  }
}
