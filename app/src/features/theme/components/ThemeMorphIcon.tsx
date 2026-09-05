import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * COMPONENT (stateless) -- sun/moon morph.
 *
 * A genuine morph rather than a cross-fade of two icons: there is exactly one
 * disc on screen the whole time. Going dark, a masked disc slides in from the
 * top-right to carve the crescent while the eight rays retract into the body
 * and the disc shrinks slightly. Reversing the animation restores the sun.
 *
 * `isDark` drives everything, so the animation is interruptible -- clicking
 * mid-transition reverses from the current position instead of snapping.
 */
interface ThemeMorphIconProps {
  isDark: boolean;
  className?: string;
}

const RAYS = [
  { x1: 12, y1: 1.6, x2: 12, y2: 3.6 },
  { x1: 12, y1: 20.4, x2: 12, y2: 22.4 },
  { x1: 1.6, y1: 12, x2: 3.6, y2: 12 },
  { x1: 20.4, y1: 12, x2: 22.4, y2: 12 },
  { x1: 4.65, y1: 4.65, x2: 6.06, y2: 6.06 },
  { x1: 17.94, y1: 17.94, x2: 19.35, y2: 19.35 },
  { x1: 4.65, y1: 19.35, x2: 6.06, y2: 17.94 },
  { x1: 17.94, y1: 6.06, x2: 19.35, y2: 4.65 },
] as const;

export function ThemeMorphIcon({ isDark, className }: ThemeMorphIconProps) {
  // Mask ids must be unique per instance or a second icon reuses the first's.
  const maskId = useId();

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      className={cn("size-[18px]", className)}
      aria-hidden="true"
    >
      <mask id={maskId}>
        {/* White keeps, black cuts. The cutting disc lives off-canvas in
            light mode and slides over the sun to leave a crescent. */}
        <rect x="0" y="0" width="24" height="24" fill="white" />
        <circle
          cx="24"
          cy="10"
          r="9"
          fill="black"
          style={{
            transform: isDark ? "translate(-6px, -3px)" : "translate(0, 0)",
            transition: "transform var(--duration-slow) var(--ease-smooth-out)",
          }}
        />
      </mask>

      <circle
        cx="12"
        cy="12"
        r={isDark ? 9 : 5}
        fill="currentColor"
        stroke="none"
        mask={`url(#${maskId})`}
        style={{ transition: "r var(--duration-slow) var(--ease-smooth-out)" }}
      />

      <g>
        {RAYS.map((ray, index) => (
          <line
            key={index}
            x1={ray.x1}
            y1={ray.y1}
            x2={ray.x2}
            y2={ray.y2}
            style={{
              opacity: isDark ? 0 : 1,
              // Rays retract toward the centre rather than just fading.
              transform: isDark ? "scale(0.45)" : "scale(1)",
              transformOrigin: "center",
              transition:
                "opacity var(--duration-fast) var(--ease-smooth-out), transform var(--duration-slow) var(--ease-smooth-out)",
              // Stagger so they pull in as a wave, not a single blink.
              transitionDelay: isDark
                ? `calc(${index} * var(--duration-stagger) / 3)`
                : `calc(${RAYS.length - index} * var(--duration-stagger) / 3)`,
            }}
          />
        ))}
      </g>
    </svg>
  );
}
