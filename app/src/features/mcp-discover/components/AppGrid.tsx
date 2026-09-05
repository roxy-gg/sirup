import { CheckIcon } from "lucide-react";
import { AppIcon } from "@/components/AppIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { CatalogEntry } from "@shared/domain";

/**
 * COMPONENT (stateless) -- the app catalog.
 *
 * A three-column list of rows rather than square tiles: the row shape fits an
 * icon, a name, a status line, and an action without crowding, and it scans
 * vertically the way a directory should.
 */
interface AppGridProps {
  apps: CatalogEntry[];
  status: "loading" | "ready";
  onSelect: (entry: CatalogEntry) => void;
}

export function AppGrid({ apps, status, onSelect }: AppGridProps) {
  if (status === "loading") {
    return (
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 12 }).map((_, index) => (
          <Skeleton key={index} className="h-[66px] rounded-xl" />
        ))}
      </div>
    );
  }

  if (apps.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No apps match that search.
      </p>
    );
  }

  return (
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
      {apps.map((app) => (
        <AppRow key={app.key} app={app} onSelect={onSelect} />
      ))}
    </div>
  );
}

function AppRow({
  app,
  onSelect,
}: {
  app: CatalogEntry;
  onSelect: (entry: CatalogEntry) => void;
}) {
  // OAuth providers need a browser redirect flow we have not built, so the row
  // says so instead of offering a Connect button that leads nowhere.
  const unavailable = app.auth === "oauth";
  const interactive = !app.connected && !unavailable;

  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? () => onSelect(app) : undefined}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(app);
              }
            }
          : undefined
      }
      className={cn(
        "theme-surface group flex items-center gap-3 rounded-xl border bg-card p-3",
        "transition-all duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)]",
        interactive &&
          "cursor-pointer hover:-translate-y-px hover:border-foreground/25 hover:shadow-sm",
        interactive &&
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        unavailable && "opacity-60",
      )}
    >
      <AppIcon icon={app.icon} name={app.name} />

      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{app.name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {app.description}
        </span>
      </div>

      {app.connected ? (
        <Badge variant="secondary" className="shrink-0 gap-1 font-normal">
          <CheckIcon className="size-3" />
          Added
        </Badge>
      ) : unavailable ? (
        <span
          className="shrink-0 text-xs text-muted-foreground"
          title="This provider requires an OAuth sign-in, which sirup does not support yet."
        >
          OAuth soon
        </span>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={(event) => {
            // The whole row is clickable; don't fire the handler twice.
            event.stopPropagation();
            onSelect(app);
          }}
        >
          Connect
        </Button>
      )}
    </div>
  );
}
