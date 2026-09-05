import { useState } from "react";
import { CheckIcon, CopyIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCopy } from "../hooks/useCopy";

/**
 * COMPONENT (stateless) -- a read-only value with a copy affordance.
 *
 * Used for the gateway URL and token. The icon cross-fades between copy and
 * check in the same slot rather than swapping abruptly.
 */
interface CopyFieldProps {
  label?: string;
  value: string;
  className?: string;
  mono?: boolean;
  /**
   * Masks the value on screen. Copy still yields the real thing -- the point
   * is that a token is not readable over a shoulder, in a screen share, or in
   * a screenshot, not that it is hard to use.
   */
  secret?: boolean;
}

/**
 * Shows enough of a secret to tell two apart, and nothing more.
 *
 * Keeps the `sirup_` prefix plus two characters, so you can recognise which
 * token you are looking at without the rest being recoverable. The mask is a
 * fixed width rather than the true length, since the length itself is a hint
 * worth not giving away.
 */
function maskSecret(value: string): string {
  if (!value) return "";
  const separator = value.indexOf("_");
  // Everything before the underscore is a public prefix, not part of the key.
  const visible = separator >= 0 ? value.slice(0, separator + 3) : value.slice(0, 3);
  return `${visible}${"•".repeat(24)}`;
}

export function CopyField({
  label,
  value,
  className,
  mono = true,
  secret = false,
}: CopyFieldProps) {
  const { copied, copy } = useCopy();
  const [revealed, setRevealed] = useState(false);

  const masked = secret && !revealed;
  const shown = masked ? maskSecret(value) : value;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label ? (
        <span className="text-xs font-medium text-text-tertiary">{label}</span>
      ) : null}

      <div className="flex items-center gap-1 rounded-lg border bg-muted/40 py-1.5 pr-1.5 pl-3">
        <code
          className={cn(
            "min-w-0 flex-1 truncate text-sm select-all",
            mono ? "font-mono" : "font-sans",
            // Dots sit low in the line box; nudge them onto the baseline so a
            // masked field is the same height as a plain one.
            masked && "tracking-tight",
          )}
        >
          {shown}
        </code>

        {secret ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setRevealed((current) => !current)}
            aria-label={revealed ? `Hide ${label ?? "value"}` : `Show ${label ?? "value"}`}
            title={revealed ? "Hide" : "Show"}
            className="shrink-0"
          >
            {revealed ? <EyeOffIcon /> : <EyeIcon />}
          </Button>
        ) : null}

        <Button
          type="button"
          variant="ghost"
          size="icon"
          // Copies the real value even while masked: hiding it on screen must
          // not make it harder to use.
          onClick={() => void copy(value)}
          aria-label={copied ? "Copied" : `Copy ${label ?? "value"}`}
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
