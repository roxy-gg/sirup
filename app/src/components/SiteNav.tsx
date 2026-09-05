import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { GithubIcon } from "@/components/icons";
import { Wordmark } from "@/components/Logo";
import { BrandSwitcher } from "@/components/BrandSwitcher";
import { ThemeToggle } from "@/features/theme/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { REPO_URL } from "@/features/marketing/hooks/useRepoStats";

/**
 * COMPONENT -- the public navbar.
 *
 * Geometry is copied from roxy.gg's `SiteNav` on purpose: 56px bar, 26px mark,
 * 15px wordmark, 32px controls, and the same 64rem column the page content
 * uses. The two products are one org and the brand switcher makes that
 * explicit, so a visitor crossing between them should feel like they changed
 * rooms, not buildings. If you retune the numbers here, retune them there.
 *
 * What is *not* copied is roxy's sliding active pill. That indicator exists to
 * show which of four marketing pages you're on; sirup's links resolve to two
 * routes, so a pill would be machinery animating between almost nowhere.
 */

interface NavLink {
  to: string;
  label: string;
  external?: boolean;
}

/**
 * "Sign in" carries `?mode=login` so the onboarding screen opens on the
 * sign-in form rather than its register default -- a link that says "Sign in"
 * should not land you on "Create your account".
 *
 * GitHub sits last because it is the only link that leaves the site. Putting it
 * between the in-site links would split them into two groups for no reason.
 */
const LINKS: NavLink[] = [
  { to: "/", label: "Home" },
  { to: "/start?mode=login", label: "Sign in" },
  { to: REPO_URL, label: "GitHub", external: true },
];

export function SiteNav() {
  const { pathname } = useLocation();
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

        <nav className="hidden items-center gap-0.5 sm:flex" aria-label="Main">
          {LINKS.map((link) => (
            <NavItem key={link.label} link={link} pathname={pathname} />
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
          <ThemeToggle />

          {/* Below sm the nav collapses and the repo link moves here, as an
              icon. It is the one link worth keeping on a phone -- Home is the
              logo and Sign in is one tap past "Get started" -- and a hamburger
              for a single item is a menu that opens onto nothing. */}
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="sirup on GitHub"
            className="inline-flex size-8 items-center justify-center rounded-md text-text-tertiary transition-colors duration-[var(--duration-quick)] hover:bg-accent hover:text-foreground sm:hidden"
          >
            <GithubIcon className="size-4" />
          </a>

          <Button asChild className="text-sm">
            <Link to="/start">Get started</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

/** Shared geometry for every nav item, so they can't drift apart. */
const navItem =
  "focus-visible:outline-ring relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors duration-[var(--duration-quick)] focus-visible:outline-1 focus-visible:outline-offset-1";

/** One nav item. External links get the mark; internal ones get active state. */
function NavItem({ link, pathname }: { link: NavLink; pathname: string }) {
  if (link.external) {
    return (
      <a
        href={link.to}
        target="_blank"
        rel="noreferrer"
        title="sirup on GitHub"
        className={cn(navItem, "text-text-tertiary hover:text-foreground")}
      >
        <GithubIcon className="size-4" />
        {link.label}
      </a>
    );
  }

  // Compare against the path only: "Sign in" carries a query string, so a
  // straight `pathname === link.to` would never match it.
  const active = pathname === link.to.split("?")[0];

  return (
    <Link
      to={link.to}
      aria-current={active ? "page" : undefined}
      className={cn(
        navItem,
        active ? "text-foreground" : "text-text-tertiary hover:text-foreground",
      )}
    >
      {link.label}
    </Link>
  );
}
