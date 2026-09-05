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

/** The mark plus the wordmark, as used in the sidebar and onboarding header. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-1.5", className)}>
      <Logo />
      <span className="text-sm font-semibold tracking-tight">sirup.gg</span>
    </span>
  );
}
