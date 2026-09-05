import { AppIcon } from "@/components/AppIcon";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";
import type { CatalogEntry } from "@shared/domain";

/**
 * COMPONENT (stateless) -- the "what is this" diagram.
 *
 * Clients on the left, the gateway in the middle, connectable apps on the
 * right. It is the whole pitch in one glance: many clients, many apps, one
 * endpoint between them.
 *
 * Drawn in CSS rather than shipped as an image so it inherits the theme, stays
 * sharp at any zoom, and can rotate through real apps from the catalog.
 */

/** The MCP clients people actually point at a gateway. */
const CLIENTS = ["Claude Code", "Codex CLI", "Cursor", "VS Code", "Roxy"] as const;

export interface RotatingApp extends CatalogEntry {
  slot: number;
  key: string;
}

interface GatewayDiagramProps {
  apps: RotatingApp[];
  endpoint: string;
  className?: string;
}

export function GatewayDiagram({ apps, endpoint, className }: GatewayDiagramProps) {
  const host = endpoint.replace(/^https?:\/\//, "");

  return (
    <div className={cn("flex items-stretch justify-center", className)}>
      {/* ── Clients ───────────────────────────────────────────────────── */}
      <ul className="flex shrink-0 flex-col justify-center gap-2">
        {CLIENTS.map((client) => (
          <li
            key={client}
            className="surface-flat flex h-8 items-center justify-center rounded-full px-3 font-mono text-[11px] text-text-tertiary"
          >
            {client}
          </li>
        ))}
      </ul>

      <Connector side="left" count={CLIENTS.length} />

      {/* ── The gateway ───────────────────────────────────────────────── */}
      <div className="surface flex shrink-0 flex-col items-center justify-center gap-1.5 self-center rounded-2xl px-6 py-7">
        <Logo className="size-8" />
        <span className="text-sm font-semibold tracking-tight">sirup.gg</span>
        <span className="max-w-[16ch] text-center font-mono text-[10px] leading-relaxed break-all text-text-quaternary">
          {host}
        </span>
        <span className="mt-1 text-center text-[11px] leading-snug text-text-tertiary">
          one URL
          <br />
          one token
        </span>
      </div>

      <Connector side="right" count={5} />

      {/* ── Connected apps, rotating ──────────────────────────────────── */}
      <ul className="flex shrink-0 flex-col justify-center gap-2">
        {Array.from({ length: 5 }).map((_, slot) => {
          const app = apps.find((entry) => entry.slot === slot);
          return (
            <li key={slot} className="flex h-8 items-center gap-2">
              {app ? (
                <div
                  // Keyed on the app so React remounts it and the fade replays.
                  key={app.key}
                  className="t-app-swap flex items-center gap-2"
                  // Staggered so the column changes as a wave rather than a
                  // single hard cut across all five rows.
                  style={{ animationDelay: `${slot * 60}ms` }}
                >
                  <AppIcon icon={app.icon} name={app.name} className="size-7 rounded-md" />
                  <span className="text-xs whitespace-nowrap text-text-tertiary">
                    {app.name}
                  </span>
                </div>
              ) : (
                <div className="size-7 rounded-md border border-dashed opacity-40" />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * The bracket joining a column to the hub: a vertical spine with one stub per
 * row, and a single stub into the hub. Borders rather than SVG, so it inherits
 * the theme's border colour for free.
 */
function Connector({ side, count }: { side: "left" | "right"; count: number }) {
  return (
    <div className="relative w-10 shrink-0" aria-hidden="true">
      {/* Spine, inset so it stops level with the first and last stub. */}
      <div
        className={cn(
          "absolute inset-y-4 w-px bg-border",
          side === "left" ? "right-1/2" : "left-1/2",
        )}
      />

      {/* One horizontal stub per row. */}
      <div className="flex h-full flex-col justify-center gap-2">
        {Array.from({ length: count }).map((_, index) => (
          <div key={index} className="flex h-8 items-center">
            <div
              className={cn(
                "h-px w-1/2 bg-border",
                side === "left" ? "mr-auto" : "ml-auto",
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
  );
}
