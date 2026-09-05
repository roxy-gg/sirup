import { NavLink, useNavigate } from "react-router-dom";
import { BlocksIcon, LogOutIcon, ScrollTextIcon, SparklesIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useSession } from "@/features/auth/hooks/useSession";
import { ThemeToggle } from "@/features/theme/components/ThemeToggle";
import { Wordmark } from "@/components/Logo";

/**
 * COMPONENT (stateless) -- the persistent shell: profile at the top, sections
 * in the middle, settings at the bottom. Matches the wireframe layout.
 */
const NAV = [
  { to: "/mcp", label: "mcp", icon: BlocksIcon },
  { to: "/logs", label: "logs", icon: ScrollTextIcon },
  { to: "/skills", label: "skills", icon: SparklesIcon },
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
    <div className="flex min-h-dvh bg-background">
      <aside className="theme-surface hidden w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
        <div className="flex flex-col gap-1 p-4">
          <Wordmark />
          <span className="truncate text-xs text-muted-foreground">
            {company?.name ?? "Workspace"}
          </span>
        </div>

        <Separator />

        <nav className="flex flex-1 flex-col gap-1 p-3">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors duration-[var(--duration-quick)]",
                  isActive
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
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
            <span className="truncate text-xs text-muted-foreground" title={user?.email}>
              {user?.email}
            </span>
            <ThemeToggle className="shrink-0" />
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleSignOut()}
            className="justify-start text-muted-foreground"
          >
            <LogOutIcon data-icon="inline-start" />
            Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header: the sidebar collapses away below md. */}
        <header className="theme-surface flex items-center justify-between border-b px-4 py-3 md:hidden">
          <Wordmark />
          <div className="flex items-center gap-1">
            {NAV.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    "rounded-md px-2.5 py-1.5 text-sm transition-colors",
                    isActive ? "bg-accent font-medium" : "text-muted-foreground",
                  )
                }
              >
                {label}
              </NavLink>
            ))}
            <ThemeToggle />
          </div>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
