import { PlusIcon } from "lucide-react";
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
  /** How many connections a company already has, keyed by catalog entry. */
  connectionCounts: Record<string, number>;
  onSelect: (entry: CatalogEntry) => void;
}

export function AppGrid({
  apps,
  status,
  connectionCounts,
  onSelect,
}: AppGridProps) {
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
      <p className="py-12 text-center text-sm text-text-tertiary">
        No apps match that search.
      </p>
    );
  }

  return (
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
      {apps.map((app) => (
        <AppRow
          key={app.key}
          app={app}
          count={connectionCounts[app.key] ?? 0}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function AppRow({
  app,
  count,
  onSelect,
}: {
  app: CatalogEntry;
  count: number;
  onSelect: (entry: CatalogEntry) => void;
}) {
  const unavailable = app.connect_mode === "unavailable";
  // Connecting an app you already have is a feature, not a mistake: a second
  // Gmail account, a staging and a production Sentry. Each connection gets its
  // own namespace, so the two never collide.
  const interactive = !unavailable;

  return (
    <div
      className={cn(
        "surface group flex items-center gap-3 rounded-xl bg-card p-3",
        "transition-colors duration-[var(--duration-quick)]",
        interactive && "hover:bg-accent/40",
        unavailable && "opacity-60",
      )}
    >
      <AppIcon icon={app.icon} name={app.name} />

      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{app.name}</span>
        <span className="truncate text-xs text-text-tertiary">
          {count > 0
            ? `${count} account${count === 1 ? "" : "s"} connected`
            : app.description}
        </span>
      </div>

      {unavailable ? (
        <span className="max-w-24 shrink-0 text-right text-xs text-text-quaternary">
          {app.availability_message ?? "Unavailable"}
        </span>
      ) : (
        <div className="flex shrink-0 items-center gap-1.5">
          {count > 0 ? (
            <Badge variant="secondary" className="font-mono font-normal tabular-nums">
              {count}
            </Badge>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSelect(app)}
            aria-label={`${count > 0 ? "Add another" : "Connect"} ${app.name} account`}
          >
            {count > 0 ? (
              <>
                <PlusIcon data-icon="inline-start" />
                Add
              </>
            ) : (
              "Connect"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
