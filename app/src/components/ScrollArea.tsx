import { useEffect, useRef, type ReactNode } from "react";
import { OverlayScrollbars } from "overlayscrollbars";
import { cn } from "@/lib/utils";
import "overlayscrollbars/overlayscrollbars.css";

/**
 * COMPONENT -- a scroll container with themed overlay scrollbars.
 *
 * The native scrollbar is a wide opaque gutter on Windows that takes a slice
 * out of every panel and ignores the theme entirely. OverlayScrollbars draws
 * one that floats above the content, so layout width is identical whether or
 * not the content overflows -- which is what stops a page shifting sideways
 * the moment a list grows past the viewport.
 *
 * Initialised imperatively rather than via the React wrapper: the wrapper adds
 * its own element and a render pass, and all we need is one instance bound to
 * a div we already have.
 */
interface ScrollAreaProps {
  children: ReactNode;
  className?: string;
  /** Applied to the inner element, which is what actually scrolls. */
  contentClassName?: string;
}

export function ScrollArea({ children, className, contentClassName }: ScrollAreaProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    const instance = OverlayScrollbars(element, {
      scrollbars: {
        theme: "os-theme-sirup",
        // Fade out when idle so the scrollbar is not permanent furniture, but
        // stay visible while the pointer is over the region.
        autoHide: "leave",
        autoHideDelay: 600,
        // Dragging the track should work like a native scrollbar does.
        clickScroll: true,
      },
      overflow: { x: "hidden", y: "scroll" },
    });

    return () => instance.destroy();
  }, []);

  return (
    <div ref={ref} className={cn("relative", className)} data-overlayscrollbars-initialize="">
      <div className={contentClassName}>{children}</div>
    </div>
  );
}
