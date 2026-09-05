import { AppIcon } from "@/components/AppIcon";
import { cn } from "@/lib/utils";

/**
 * COMPONENT (stateless) -- the "what is this" diagram.
 *
 * Editors on the left, the gateway in the middle, connected apps on the right.
 * It is the whole pitch in one glance: many clients, many apps, one endpoint
 * between them.
 *
 * Rendered with CSS rather than an image so it inherits the theme, stays sharp
 * at any zoom, and can show the company's *actual* connected apps instead of a
 * generic illustration.
 */

/** The MCP clients people actually point at a gateway. */
const CLIENTS = [
  "Claude Code",
  "Codex CLI",
  "Cursor",
  "VS Code",
  "Zed",
] as const;

export interface HeroApp {
  name: string;
  icon: string | null;
}

interface GatewayDiagramProps {
  /** Apps to show on the right. Falls back to a representative set. */
  apps?: HeroApp[];
  endpoint: string;
  className?: string;
}

const PLACEHOLDER_APPS: HeroApp[] = [
  { name: "GitHub", icon: "github" },
  { name: "Linear", icon: "linear" },
  { name: "Notion", icon: "notion" },
  { name: "Stripe", icon: "stripe" },
  { name: "Sentry", icon: "sentry" },
];

export function GatewayDiagram({ apps, endpoint, className }: GatewayDiagramProps) {
  const right = (apps?.length ? apps : PLACEHOLDER_APPS).slice(0, 5);
  const host = endpoint.replace(/^https?:\/\//, "");

  return (
    <div className={cn("flex items-stretch justify-center gap-0", className)}>
      {/* ── Clients ───────────────────────────────────────────────────── */}
      <ul className="flex shrink-0 flex-col justify-center gap-2">
        {CLIENTS.map((client) => (
          <li
            key={client}
            className="theme-surface surface-flat rounded-full px-3 py-1.5 text-center font-mono text-[11px] text-muted-foreground"
          >
            {client}
          </li>
        ))}
      </ul>

      <Connector side="left" count={CLIENTS.length} />

      {/* ── The gateway ───────────────────────────────────────────────── */}
      <div className="theme-surface surface flex shrink-0 flex-col items-center justify-center gap-1 self-center rounded-2xl px-5 py-6">
        <span className="text-sm font-semibold tracking-tight">sirup.gg</span>
        <span className="max-w-[13ch] text-center font-mono text-[10px] leading-relaxed text-muted-foreground">
          {host}
        </span>
        <span className="mt-1 text-center text-[11px] text-muted-foreground">
          one URL
          <br />
          one token
        </span>
      </div>

      <Connector side="right" count={right.length} />

      {/* ── Connected apps ────────────────────────────────────────────── */}
      <ul className="flex shrink-0 flex-col justify-center gap-2">
        {right.map((app) => (
          <li key={app.name} className="flex items-center gap-2">
            <AppIcon icon={app.icon} name={app.name} className="size-7 rounded" />
            <span className="text-xs text-muted-foreground">{app.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The bracket joining a column of items to the hub: a spine with a stub per
 * row, and one stub into the hub. Drawn with borders so it inherits the theme.
 */
function Connector({ side, count }: { side: "left" | "right"; count: number }) {
  return (
    <div className="flex w-10 shrink-0 items-center" aria-hidden="true">
      <div className="relative h-full w-full">
        {/* Vertical spine, inset so it stops at the first and last stub. */}
        <div
          className={cn(
            "absolute inset-y-6 w-px bg-border",
            side === "left" ? "right-1/2" : "left-1/2",
          )}
        />

        {/* One horizontal stub per row, evenly distributed. */}
        <div className="flex h-full flex-col justify-center gap-2 py-6">
          {Array.from({ length: count }).map((_, index) => (
            <div key={index} className="flex h-[26px] items-center">
              <div
                className={cn(
                  "h-px bg-border",
                  side === "left" ? "mr-auto w-1/2" : "ml-auto w-1/2",
                )}
              />
            </div>
          ))}
        </div>

        {/* Stub into the hub. */}
        <div
          className={cn(
            "absolute top-1/2 h-px w-1/2 bg-border",
            side === "left" ? "left-1/2" : "right-1/2",
          )}
        />
      </div>
    </div>
  );
}
