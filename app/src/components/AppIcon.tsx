import { getBrandIcon } from "@/lib/brandIcons";
import { cn } from "@/lib/utils";

/**
 * COMPONENT (stateless) -- an app's brand mark.
 *
 * Brand colour is the one deliberate exception to the monochrome palette. A
 * grid of grey squares is unscannable; the point of an icon here is that you
 * find GitHub by its shape and colour, not by reading the label. Everything
 * around it stays neutral so the marks are what your eye lands on.
 *
 * Falls back to a monogram when simple-icons has no mark for a provider --
 * which happens for trademark reasons (Slack, Microsoft) as well as for small
 * or new products.
 */
interface AppIconProps {
  /** simple-icons slug, or null to force the monogram. */
  icon?: string | null;
  /** Used for the monogram letter and the accessible label. */
  name: string;
  className?: string;
  /** Renders in the current text colour instead of the brand colour. */
  monochrome?: boolean;
}

/**
 * Perceived brightness of a hex colour, 0-255 (ITU-R BT.601).
 *
 * Several marks are pure black (Notion, Vercel) or near-black (GitHub
 * #181717), which disappear against a dark background. Those get rendered in
 * currentColor instead, so they stay legible in both themes without us
 * hand-maintaining an exception list.
 */
function brightness(hex: string): number {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

export function AppIcon({ icon, name, className, monochrome = false }: AppIconProps) {
  const brand = getBrandIcon(icon);

  if (!brand) {
    return (
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted",
          "text-xs font-semibold text-muted-foreground",
          className,
        )}
        aria-hidden="true"
      >
        {name.charAt(0).toUpperCase()}
      </span>
    );
  }

  // Both extremes are a problem: near-black vanishes in dark mode, near-white
  // vanishes in light mode. Either way, defer to the theme's text colour.
  const level = brightness(brand.hex);
  const useCurrentColor = monochrome || level < 40 || level > 225;

  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-md border bg-background",
        className,
      )}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        className="size-5"
        fill={useCurrentColor ? "currentColor" : brand.hex}
      >
        <title>{brand.title}</title>
        <path d={brand.path} />
      </svg>
    </span>
  );
}
