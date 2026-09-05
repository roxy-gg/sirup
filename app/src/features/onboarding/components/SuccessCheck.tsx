import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * COMPONENT (stateless) -- the success check.
 *
 * Fades, rotates upright, bobs, and draws its stroke. The dash length is
 * measured from the real path on mount rather than hardcoded, so the draw
 * starts fully hidden and finishes exactly on the last pixel.
 */
export function SuccessCheck({ className }: { className?: string }) {
  const wrapperRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const path = wrapper?.querySelector("path");
    if (!wrapper || !path) return;

    const length = Math.ceil(path.getTotalLength()) + 1;
    path.style.strokeDasharray = String(length);
    wrapper.style.setProperty("--check-path-length", String(length));

    // Reflow between states so the keyframes restart from offset 0.
    wrapper.setAttribute("data-state", "out");
    void wrapper.offsetWidth;
    wrapper.setAttribute("data-state", "in");
  }, []);

  return (
    <span
      ref={wrapperRef}
      className={cn("t-success-check", className)}
      data-state="out"
      aria-hidden="true"
    >
      <svg viewBox="0 0 48 48" fill="none" className="size-12">
        <circle
          cx="24"
          cy="24"
          r="22"
          className="stroke-border"
          strokeWidth="2"
          fill="none"
        />
        <path
          d="M15 24.5 L21.5 31 L33 19"
          className="stroke-foreground"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
