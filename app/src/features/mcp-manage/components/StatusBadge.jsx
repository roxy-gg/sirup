import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * COMPONENT (stateless) -- connection status.
 *
 * The palette is monochrome, so status is carried by a dot plus a label rather
 * than by colour alone -- which is also what makes it readable to anyone with
 * a colour vision deficiency.
 */
const STATUS_COPY = {
  connected: "Connected",
  pending: "Connecting",
  error: "Failed",
  disabled: "Paused",
};

export function StatusBadge({ status, enabled = true, className }) {
  const key = !enabled ? "disabled" : status;

  return (
    <Badge variant="secondary" className={cn("gap-1.5 font-normal", className)}>
      <span
        className={cn(
          "size-1.5 rounded-full",
          key === "connected" && "bg-foreground",
          key === "pending" && "animate-pulse bg-muted-foreground",
          key === "error" && "bg-muted-foreground ring-1 ring-foreground",
          key === "disabled" && "bg-transparent ring-1 ring-muted-foreground",
        )}
      />
      {STATUS_COPY[key] || status}
    </Badge>
  );
}
