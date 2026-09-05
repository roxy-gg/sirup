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
 *
 * Two shapes, because there are two ways in. A client that lets you set a
 * header takes the token form. A client that only accepts a URL -- Claude's
 * custom connectors, VS Code -- gets the same endpoint with no credential at
 * all and discovers OAuth from the 401. Both are real answers, so both are
 * offered rather than picking one and hiding the other.
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

type Mode = "token" | "oauth";

export function ClientConfig({
  endpoint,
  token,
  profileName,
  className,
  defaultOpen = false,
}: ClientConfigProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [revealed, setRevealed] = useState(false);
  const [mode, setMode] = useState<Mode>("token");
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

  /**
   * The OAuth form: the same endpoint, and nothing else.
   *
   * There is deliberately no credential here. The client hits the endpoint,
   * gets a 401 pointing at our metadata, registers itself, and sends the user
   * through the browser. Adding a placeholder token field would suggest a step
   * that does not exist.
   */
  const oauthJson = JSON.stringify(
    { mcpServers: { [key]: { type: "http", url: endpoint } } },
    null,
    2,
  );

  // Masked on screen, real on copy. Showing the token here would undo the
  // masking on the field above, since this block sits directly beneath it.
  const separator = token.indexOf("_");
  const maskedToken = token
    ? `${token.slice(0, separator >= 0 ? separator + 3 : 3)}${"•".repeat(24)}`
    : "";

  const isOAuth = mode === "oauth";
  const json = isOAuth ? oauthJson : build(token);
  const shown = isOAuth ? oauthJson : revealed ? json : build(maskedToken);

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
        <div className="border-t">
          {/* Which credential the client will use. Two real options, not a
              preference: some clients cannot send a header at all. */}
          <div className="flex items-center gap-1 border-b px-3 py-2">
            <ModeTab active={!isOAuth} onClick={() => setMode("token")}>
              Token
            </ModeTab>
            <ModeTab active={isOAuth} onClick={() => setMode("oauth")}>
              Sign-in
            </ModeTab>

            <span className="ml-auto text-xs text-text-quaternary">
              {isOAuth ? "Claude, VS Code" : "Cursor, scripts"}
            </span>
          </div>

          <div className="relative">
            {/* Absolute so the buttons do not push the code block's layout
                around, and the JSON stays the thing you are looking at. */}
            <div className="absolute top-2 right-2 flex items-center gap-1">
              {isOAuth ? null : (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setRevealed((current) => !current)}
                  aria-label={revealed ? "Hide token" : "Show token"}
                  title={revealed ? "Hide token" : "Show token"}
                >
                  {revealed ? <EyeOffIcon /> : <EyeIcon />}
                </Button>
              )}

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

          <p className="border-t px-3 py-2 text-xs text-text-tertiary">
            {isOAuth ? (
              <>
                No token needed. Paste just the URL — the client opens a browser
                sign-in and you pick which profile it sees.
              </>
            ) : (
              <>
                Works anywhere you can set a header. The token exposes this
                profile only.
              </>
            )}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** A tab in the credential switcher. Quiet until selected. */
function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-md px-2 py-1 text-xs font-medium",
        "transition-colors duration-[var(--duration-quick)]",
        "focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-ring",
        active
          ? "bg-secondary text-secondary-foreground"
          : "text-text-tertiary hover:bg-accent/40 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
