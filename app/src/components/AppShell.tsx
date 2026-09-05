import { NavLink, useNavigate } from "react-router-dom";
import { BlocksIcon, LogOutIcon, ScrollTextIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useSession } from "@/features/auth/hooks/useSession";
import { ThemeToggle } from "@/features/theme/components/ThemeToggle";
import { Wordmark } from "@/components/Logo";

/**
 * COMPONENT (stateless) -- the persistent shell: profile at the top, sections
 * in the middle, settings at the bottom.
 */
const NAV = [
  { to: "/mcp", label: "MCP servers", icon: BlocksIcon },
  { to: "/logs", label: "Logs", icon: ScrollTextIcon },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { user, company, signOut } = useSession();

  async function handleSignOut() {
    await signOut();
    // Back to the marketing page, which is the signed-out front door.
    void navigate("/", { replace: true });
  }

  return (
    // h-dvh, not min-h-dvh: the shell is exactly the viewport and the main
    // column scrolls inside it. With min-h the shell grew to the content's
    // height, dragging the sidebar down the page with it.
    <div className="flex h-dvh overflow-hidden bg-background">
      <aside className="theme-surface hidden w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
        <div className="flex flex-col gap-1 p-4">
          <Wordmark />
          <span className="truncate text-xs text-text-tertiary">
            {company?.name ?? "Workspace"}
          </span>
        </div>

        <Separator />

        <nav className="flex flex-1 flex-col gap-0.5 p-3">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-mini transition-colors duration-[var(--duration-quick)]",
                  isActive
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-text-tertiary hover:bg-sidebar-accent/60 hover:text-foreground",
                )
              }
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <Separator />

        <div className="flex flex-col gap-2 p-3">
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="truncate text-xs text-text-tertiary" title={user?.email}>
              {user?.email}
            </span>
            <ThemeToggle className="shrink-0" />
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleSignOut()}
            className="justify-start text-text-tertiary"
          >
            <LogOutIcon data-icon="inline-start" />
            Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header: the sidebar collapses away below md. */}
        <header className="theme-surface flex shrink-0 items-center justify-between border-b px-4 py-3 md:hidden">
          <Wordmark />
          <div className="flex items-center gap-1">
            {NAV.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    "rounded-md px-2.5 py-1.5 text-mini transition-colors",
                    isActive ? "bg-accent font-medium" : "text-text-tertiary",
                  )
                }
              >
                {label}
              </NavLink>
            ))}
            <ThemeToggle />
          </div>
        </header>

        {/* The only scroll container. Keeping it here rather than on the page
            means the sidebar never moves, whatever the content height. */}
        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
