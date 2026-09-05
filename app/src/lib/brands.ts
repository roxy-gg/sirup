/**
 * The brand family.
 *
 * sirup and Roxy are separate products on separate domains, but they're the
 * same org and — increasingly — the same audience. The switcher in the navbar
 * is the only place that relationship is stated, so the list lives here rather
 * than inline in the component: roxy.gg ships an identical file, and the two
 * are meant to stay in sync so a third brand is one edit per repo.
 *
 * `tagline` is what someone reads to decide whether the other thing is worth a
 * click, so it names the category ("Open Source IDE"), not a slogan.
 */
export type BrandId = "roxy" | "sirup";

export interface Brand {
  id: BrandId;
  name: string;
  tagline: string;
  /** Absolute, because switching brands always leaves this origin. */
  href: string;
  /** Served from /public on both sites under the same filenames. */
  icon: string;
}

export const BRANDS: Brand[] = [
  {
    id: "roxy",
    name: "Roxy",
    tagline: "Open Source IDE",
    href: "https://roxy.gg",
    icon: "/roxy-icon.png",
  },
  {
    id: "sirup",
    name: "sirup.gg",
    tagline: "Open Source MCP Connector",
    href: "https://sirup.gg",
    icon: "/icon-192.png",
  },
];

/** The brand this site *is*. Its entry links home instead of off-origin. */
export const CURRENT_BRAND: BrandId = "sirup";
