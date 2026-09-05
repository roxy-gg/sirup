import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * COMPONENT (stateless) -- staggered blurred rise for stacked lines.
 *
 * Children start blurred and offset, then rise in sequence. Because the
 * pre-reveal state is invisible, the reveal is scheduled with a plain timeout
 * (which still fires in a background tab) rather than rAF -- a missed frame
 * must never leave the copy permanently hidden.
 */
interface StaggerRevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

export function StaggerReveal({ children, className, delay = 0 }: StaggerRevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    const timer = window.setTimeout(() => node.classList.add("is-revealed"), delay);

    return () => {
      window.clearTimeout(timer);
      // Guard against unmounting before the reveal ran.
      node.classList.add("is-revealed");
    };
  }, [delay]);

  const items = Array.isArray(children) ? children.flat() : [children];

  return (
    <div ref={ref} className={cn("t-stagger", className)}>
      {items.map((child, index) => (
        <div key={index} style={{ "--stagger-index": index } as React.CSSProperties}>
          {child}
        </div>
      ))}
    </div>
  );
}
