import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { StepDirection } from "../hooks/useOnboarding";

/**
 * COMPONENT (stateless) -- side-by-side page transition between wizard steps.
 *
 * The incoming step enters from the side the user is travelling toward, so
 * forward and back read differently, and the wrapper tweens its height so the
 * card resizes smoothly between steps of different lengths.
 *
 * Two correctness details:
 *  - The first paint is never animated. An enter animation on mount would mean
 *    the content starts at opacity 0, so if the flip to visible ever failed the
 *    user would be left staring at an empty card.
 *  - The flip to "active" is driven by rAF *and* a timeout, whichever lands
 *    first. rAF alone does not fire in a background tab, which would strand the
 *    step invisible until the tab was focused.
 */
type TransitionState = "enter-from-right" | "enter-from-left" | "active";

interface StepTransitionProps {
  stepKey: string;
  direction: StepDirection;
  children: ReactNode;
  className?: string;
}

export function StepTransition({
  stepKey,
  direction,
  children,
  className,
}: StepTransitionProps) {
  const innerRef = useRef<HTMLDivElement>(null);
  const previousStepRef = useRef(stepKey);
  const [height, setHeight] = useState<number | null>(null);
  const [state, setState] = useState<TransitionState>("active");

  useLayoutEffect(() => {
    // Nothing to animate from on the very first render.
    if (previousStepRef.current === stepKey) return undefined;
    previousStepRef.current = stepKey;

    setState(direction === "forward" ? "enter-from-right" : "enter-from-left");

    let settled = false;
    const activate = () => {
      if (settled) return;
      settled = true;
      setState("active");
    };

    // Double rAF gives the browser a frame to paint the pre-enter state, so the
    // transition has something to animate from.
    const frame = requestAnimationFrame(() => requestAnimationFrame(activate));
    // Fallback for throttled/hidden tabs where rAF never runs.
    const timer = window.setTimeout(activate, 80);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      // Never unmount mid-enter leaving the next step invisible.
      activate();
    };
  }, [stepKey, direction]);

  // Track the natural height of the current step so the wrapper can tween to it.
  useEffect(() => {
    const node = innerRef.current;
    if (!node) return undefined;

    const observer = new ResizeObserver(([entry]) => {
      if (entry) setHeight(entry.contentRect.height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [stepKey]);

  return (
    <div
      className="overflow-hidden"
      style={{
        height: height === null ? undefined : `${height}px`,
        transition: "height var(--duration-fast) var(--ease-smooth-out)",
      }}
    >
      <div ref={innerRef}>
        <div data-state={state} className={cn("t-page", className)}>
          {children}
        </div>
      </div>
    </div>
  );
}
