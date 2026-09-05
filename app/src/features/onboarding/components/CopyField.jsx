import { CheckIcon, CopyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCopy } from "../hooks/useCopy";

/**
 * COMPONENT (stateless) -- a read-only value with a copy affordance.
 *
 * Used for the gateway URL and token. The icon cross-fades between copy and
 * check in the same slot rather than swapping abruptly.
 */
export function CopyField({ label, value, className, mono = true }) {
  const { copied, copy } = useCopy();

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label ? (
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      ) : null}

      <div className="flex items-center gap-2 rounded-lg border bg-muted/40 py-1.5 pl-3 pr-1.5">
        <code
          className={cn(
            "flex-1 truncate text-sm",
            mono ? "font-mono" : "font-sans",
          )}
        >
          {value}
        </code>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => copy(value)}
          aria-label={copied ? "Copied" : `Copy ${label || "value"}`}
          className="relative shrink-0"
        >
          {/* Both icons occupy the same cell so the swap never shifts layout. */}
          <span className="grid *:col-start-1 *:row-start-1">
            <CopyIcon
              className="transition-[opacity,transform,filter] duration-[var(--duration-fast)] ease-[var(--ease-in-out)]"
              style={{
                opacity: copied ? 0 : 1,
                transform: copied ? "scale(0.7)" : "scale(1)",
                filter: copied ? "blur(var(--blur-small))" : "blur(0)",
              }}
            />
            <CheckIcon
              className="transition-[opacity,transform,filter] duration-[var(--duration-fast)] ease-[var(--ease-in-out)]"
              style={{
                opacity: copied ? 1 : 0,
                transform: copied ? "scale(1)" : "scale(0.7)",
                filter: copied ? "blur(0)" : "blur(var(--blur-small))",
              }}
            />
          </span>
        </Button>
      </div>
    </div>
  );
}
