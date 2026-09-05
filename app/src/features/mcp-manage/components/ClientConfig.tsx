import { useState } from "react";
import { CheckIcon, ChevronRightIcon, CopyIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCopy } from "@/features/onboarding/hooks/useCopy";

/**
 * COMPONENT (stateless) -- the client config, collapsed by default.
 *
 * Most people only need the URL and the token, which are already in fields
 * above; the full JSON matters once, when you paste it into a client. So it
 * starts closed and opens on click.
 *
 * The shape is built here rather than written out per screen, so the
 * dashboard and the onboarding handoff can never drift apart.
 */
interface ClientConfigProps {
  endpoint: string;
  token: string;
  /** Names the server entry in the config, so two profiles do not collide. */
  profileName?: string;
  className?: string;
  /** Open on mount, for the onboarding step where it is the whole point. */
  defaultOpen?: boolean;
}

export function ClientConfig({
  endpoint,
  token,
  profileName,
  className,
  defaultOpen = false,
}: ClientConfigProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [revealed, setRevealed] = useState(false);
  const { copied, copy } = useCopy();

  // Slugified so the key is valid in every client's config format.
  const key =
    (profileName ?? "sirup")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "sirup";

  /** The config, with the token either real or masked. */
  const build = (secret: string) =>
    JSON.stringify(
      {
        mcpServers: {
          [key]: {
            type: "http",
            url: endpoint,
            headers: { Authorization: `Bearer ${secret}` },
          },
        },
      },
      null,
      2,
    );

  // Masked on screen, real on copy. Showing the token here would undo the
  // masking on the field above, since this block sits directly beneath it.
  const separator = token.indexOf("_");
  const maskedToken = token
    ? `${token.slice(0, separator >= 0 ? separator + 3 : 3)}${"•".repeat(24)}`
    : "";

  const json = build(token);
  const shown = revealed ? json : build(maskedToken);

  return (
    <div className={cn("surface-flat overflow-hidden rounded-lg", className)}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-left",
          "transition-colors duration-[var(--duration-quick)] hover:bg-accent/40",
          "focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-ring",
        )}
      >
        <ChevronRightIcon
          className={cn(
            "size-3.5 shrink-0 text-text-quaternary",
            "transition-transform duration-[var(--duration-quick)] ease-[var(--ease-smooth-out)]",
            open && "rotate-90",
          )}
        />
        <span className="text-mini font-medium">Client config</span>
        <span className="text-xs text-text-quaternary">JSON</span>
      </button>

      {open ? (
        <div className="relative border-t">
          {/* Absolute so the buttons do not push the code block's layout
              around, and the JSON stays the thing you are looking at. */}
          <div className="absolute top-2 right-2 flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setRevealed((current) => !current)}
              aria-label={revealed ? "Hide token" : "Show token"}
              title={revealed ? "Hide token" : "Show token"}
            >
              {revealed ? <EyeOffIcon /> : <EyeIcon />}
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              // Always copies the real config, masked or not.
              onClick={() => void copy(json)}
              aria-label={copied ? "Copied" : "Copy client config"}
            >
              <span className="grid *:col-start-1 *:row-start-1">
                <CopyIcon
                  className="transition-[opacity,transform] duration-[var(--duration-fast)]"
                  style={{
                    opacity: copied ? 0 : 1,
                    transform: copied ? "scale(0.7)" : "scale(1)",
                  }}
                />
                <CheckIcon
                  className="transition-[opacity,transform] duration-[var(--duration-fast)]"
                  style={{
                    opacity: copied ? 1 : 0,
                    transform: copied ? "scale(1)" : "scale(0.7)",
                  }}
                />
              </span>
            </Button>
          </div>

          <pre className="overflow-x-auto px-3 py-3 text-xs leading-relaxed">
            <code className="font-mono">{shown}</code>
          </pre>
        </div>
      ) : null}
    </div>
  );
}
