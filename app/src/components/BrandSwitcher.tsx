import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { BRANDS, CURRENT_BRAND } from "@/lib/brands";
import { cn } from "@/lib/utils";

/**
 * COMPONENT -- the chevron beside the wordmark: a menu that moves between our
 * products.
 *
 * It is deliberately *not* part of the logo link. The mark is the single most
 * predictable target on the page -- clicking it goes home -- and folding a menu
 * into it would mean a click that usually navigates sometimes opens a popover
 * instead. Two adjacent controls, one job each.
 *
 * Hand-rolled rather than the shared DropdownMenu because Radix's menu traps
 * focus and locks body scroll, which is right for a destructive action menu and
 * heavy-handed for a two-item product list at the top of a marketing page.
 */
export function BrandSwitcher() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  // Outside click and Escape both dismiss. `mousedown` rather than `click`, so
  // the menu is gone before the click lands on whatever is underneath --
  // otherwise pressing a link behind the menu takes two attempts.
  useEffect(() => {
    if (!open) return;

    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label="Switch product"
        className={cn(
          "s-brand-trigger inline-flex size-6 items-center justify-center rounded-md transition-colors duration-[var(--duration-quick)]",
          open
            ? "bg-accent text-foreground"
            : "text-text-quaternary hover:bg-accent hover:text-foreground",
        )}
      >
        <ChevronDownIcon className="size-3.5" data-open={open || undefined} />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          className="s-brand-menu surface-overlay absolute top-full left-0 z-40 mt-2 w-[17rem] overflow-hidden rounded-xl bg-popover p-1"
        >
          {BRANDS.map((brand) => {
            const current = brand.id === CURRENT_BRAND;
            const className =
              "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors duration-[var(--duration-quick)] hover:bg-accent";
            const inner = (
              <>
                <img
                  src={brand.icon}
                  alt=""
                  width={28}
                  height={28}
                  className="size-7 shrink-0 rounded-md"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{brand.name}</span>
                  <span className="block truncate text-xs text-text-quaternary">
                    {brand.tagline}
                  </span>
                </span>
                {current && <CheckIcon className="size-4 shrink-0 text-text-tertiary" />}
              </>
            );

            // The current brand navigates in-app; the other one leaves the
            // origin entirely, so it gets a real anchor with a full URL.
            return current ? (
              <Link
                key={brand.id}
                to="/"
                role="menuitem"
                onClick={() => setOpen(false)}
                className={className}
              >
                {inner}
              </Link>
            ) : (
              <a key={brand.id} href={brand.href} role="menuitem" className={className}>
                {inner}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
