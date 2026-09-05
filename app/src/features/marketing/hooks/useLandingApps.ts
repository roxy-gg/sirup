import { useEffect, useMemo, useState } from "react";
import { fetchPublicApps } from "../data/publicApi";
import type { CatalogEntry } from "@shared/domain";

/**
 * HOOKS -- the landing page's live numbers and its rotating logo set.
 *
 * Everything on the page is derived from the real catalog, so the claims stay
 * true without anyone remembering to update copy.
 */
const VISIBLE_SLOTS = 5;
const ROTATE_MS = 2600;

export function useLandingApps() {
  const [apps, setApps] = useState<CatalogEntry[]>([]);
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    fetchPublicApps()
      .then((entries) => {
        if (!cancelled) setApps(entries);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setStatus("ready");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Apps with a real brand mark, one per brand.
   *
   * Deduped by icon because the catalog has both "Cloudflare" and "Cloudflare
   * Docs" — correct as separate servers, but showing the same logo twice in a
   * five-slot column reads as a rendering bug.
   */
  const withIcons = useMemo(() => {
    const seen = new Set<string>();
    return apps.filter((app) => {
      if (!app.icon || seen.has(app.icon)) return false;
      seen.add(app.icon);
      return true;
    });
  }, [apps]);

  useEffect(() => {
    if (withIcons.length <= VISIBLE_SLOTS) return undefined;

    // Respect the OS setting: a logo wall that swaps on a timer is exactly the
    // kind of ambient motion reduced-motion exists to stop.
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) return undefined;

    const timer = window.setInterval(() => setTick((n) => n + 1), ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [withIcons.length]);

  /**
   * The five apps currently on screen. Advancing by the slot count rather than
   * by one swaps the whole set each time, which reads as deliberate; rotating
   * a single logo looks like a glitch.
   */
  const visible = useMemo(() => {
    if (withIcons.length === 0) return [];
    const offset = (tick * VISIBLE_SLOTS) % withIcons.length;
    return Array.from({ length: Math.min(VISIBLE_SLOTS, withIcons.length) }, (_, i) => {
      const app = withIcons[(offset + i) % withIcons.length]!;
      // The key must change when the app does, or React reuses the DOM node
      // and the fade never runs.
      return { ...app, slot: i, key: `${app.key}-${tick}` };
    });
  }, [withIcons, tick]);

  return {
    apps,
    visible,
    status,
    total: apps.length,
    connectable: apps.filter((app) => app.auth !== "oauth").length,
  };
}
