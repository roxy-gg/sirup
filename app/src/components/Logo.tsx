import { cn } from "@/lib/utils";

/**
 * COMPONENT (stateless) -- the sirup mark.
 *
 * Served from /public rather than imported, so it is one cached request shared
 * with the favicon instead of a second copy inlined into the JS bundle.
 *
 * The artwork is light on transparency, so it needs no theme handling: it
 * reads on both the white and near-black backgrounds.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <img
      src="/icon-192.png"
      alt=""
      width={192}
      height={192}
      // Decorative: the wordmark next to it carries the name, so a screen
      // reader announcing "sirup logo, sirup.gg" would just be noise.
      aria-hidden="true"
      className={cn("size-5 shrink-0 select-none", className)}
      draggable={false}
    />
  );
}

/**
 * The mark plus the wordmark.
 *
 * Two sizes, because the wordmark does two different jobs. In the sidebar it is
 * a label on a dense column of controls and should not shout, so it stays at
 * 20px/13px. In the marketing navbar it is the first thing on the page and the
 * only branding above the fold, so it steps up to 26px/15px -- the same numbers
 * roxy.gg's nav uses, which is what makes the two headers read as one family
 * rather than two teams.
 */
export function Wordmark({
  className,
  size = "sm",
}: {
  className?: string;
  size?: "sm" | "lg";
}) {
  const large = size === "lg";

  return (
    <span className={cn("flex items-center", large ? "gap-2" : "gap-1.5", className)}>
      <Logo className={cn("s-mark", large && "size-[26px] rounded-lg")} />
      <span
        className={cn(
          "font-semibold tracking-tight",
          large ? "text-[15px]" : "text-sm",
        )}
      >
        sirup.gg
      </span>
    </span>
  );
}
