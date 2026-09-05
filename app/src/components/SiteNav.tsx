import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { GithubIcon, StarIcon } from "@/components/icons";
import { Wordmark } from "@/components/Logo";
import { BrandSwitcher } from "@/components/BrandSwitcher";
import { ThemeToggle } from "@/features/theme/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { REPO_URL, formatStars, useRepoStats } from "@/features/marketing/hooks/useRepoStats";

/**
 * COMPONENT -- the public navbar.
 *
 * Geometry is copied from roxy.gg's `SiteNav` on purpose: 56px bar, 26px mark,
 * 15px wordmark, 32px controls, and the same 64rem column the page content
 * uses. The two products are one org and the switcher below makes that
 * explicit, so a visitor crossing between them should feel like they changed
 * rooms, not buildings. If you retune the numbers here, retune them there.
 *
 * What is *not* copied is roxy's sliding active pill. That indicator exists to
 * show which of four marketing pages you're on; sirup has exactly one, so a
 * pill would be machinery animating between a single position.
 */
export function SiteNav() {
  const { stars, settled } = useRepoStats();
  const [scrolled, setScrolled] = useState(false);

  // The bar is borderless at the top of the page and grows a hairline + blur
  // once content slides under it. A border should only appear when it is
  // actually separating two things.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "theme-surface sticky top-0 z-30 border-b transition-colors duration-[var(--duration-fast)]",
        scrolled
          ? "border-border bg-background/80 backdrop-blur"
          : "border-transparent bg-background",
      )}
    >
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-5 sm:gap-6">
        {/*
          Wordmark and switcher are one group: a hairline gap between them, then
          the section gap out to the links.

          The switcher sits *outside* the logo anchor. It says which product
          you're looking at, not where you are inside this one -- and a mark
          that sometimes navigates and sometimes opens a menu is a mark you stop
          trusting.
        */}
        <div className="flex shrink-0 items-center gap-1">
          <Link to="/" aria-label="sirup.gg - home" className="s-logo-link">
            <Wordmark size="lg" />
          </Link>
          <BrandSwitcher />
        </div>

        {/*
          One link, and it leaves the site. The repo is the only other place a
          signed-out visitor has to go, and the star count is the honest version
          of the social proof a marketing page usually fakes.
        */}
        <nav className="hidden items-center gap-0.5 sm:flex" aria-label="Main">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            title={stars != null ? `${stars.toLocaleString()} stars on GitHub` : "sirup on GitHub"}
            className="s-ghlink focus-visible:outline-ring relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-text-tertiary transition-colors duration-[var(--duration-quick)] hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-1"
          >
            <GithubIcon className="size-4" />
            GitHub
            {/*
              Space is held while the count is in flight so it fades in instead
              of shoving the bar sideways -- but only while in flight. If GitHub
              is rate-limiting us the slot collapses rather than leaving a
              permanent gap next to the word "GitHub".
            */}
            {(stars != null || !settled) && (
              <span className="inline-flex min-w-[2.1rem] items-center gap-0.5 tabular-nums">
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 transition-opacity duration-300",
                    stars == null ? "opacity-0" : "opacity-100",
                  )}
                >
                  <StarIcon className="s-ghstar size-3 text-[#e3b341]" />
                  <span className="text-text-quaternary">
                    {stars == null ? "0" : formatStars(stars)}
                  </span>
                </span>
              </span>
            )}
          </a>
        </nav>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
          <ThemeToggle />

          {/* Below sm the repo link moves here, as an icon: it is the one nav
              item worth keeping on a phone, and a hamburger for a single link
              is a menu that opens onto nothing. */}
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="sirup on GitHub"
            className="inline-flex size-8 items-center justify-center rounded-md text-text-tertiary transition-colors duration-[var(--duration-quick)] hover:bg-accent hover:text-foreground sm:hidden"
          >
            <GithubIcon className="size-4" />
          </a>

          <Button variant="ghost" asChild className="hidden text-sm sm:inline-flex">
            <Link to="/start">Sign in</Link>
          </Button>
          <Button asChild className="text-sm">
            <Link to="/start">Get started</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
