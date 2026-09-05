import { CheckIcon, PlusIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * COMPONENT (stateless) -- the catalog grid from the wireframe.
 *
 * Cards lift slightly on hover so the whole tile reads as the target, rather
 * than hiding the affordance in a small button.
 */
export function CatalogGrid({ catalog, status, onSelect }) {
  if (status === "loading") {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-[104px] rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {catalog.map((entry) => (
        <Card
          key={entry.key}
          role="button"
          tabIndex={0}
          onClick={() => onSelect(entry)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelect(entry);
            }
          }}
          className={cn(
            "theme-surface group cursor-pointer transition-all duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)]",
            "hover:-translate-y-0.5 hover:border-foreground/25 hover:shadow-sm",
            "focus-visible:ring-ring/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:outline-none",
          )}
        >
          <CardContent className="flex h-full flex-col gap-1.5 p-4">
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium">{entry.name}</span>

              {entry.connected ? (
                <Badge variant="secondary" className="gap-1 font-normal">
                  <CheckIcon className="size-3" />
                  Added
                </Badge>
              ) : (
                <PlusIcon className="size-4 shrink-0 text-muted-foreground transition-transform duration-[var(--duration-fast)] group-hover:rotate-90 group-hover:text-foreground" />
              )}
            </div>

            <p className="text-xs leading-relaxed text-muted-foreground">
              {entry.description}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
