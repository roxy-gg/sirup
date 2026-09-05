import { cn } from "@/lib/utils";
import type { McpLog } from "@shared/domain";

/**
 * The shared column template.
 *
 * Exported so the header and the rows use one definition: time · server ·
 * tool · detail · duration · result. The detail column is the only flexible
 * one, so it absorbs the slack and everything else stays put — with flex, a
 * long tool name pushed the last columns off the card edge.
 */
export const LOG_GRID =
  "grid grid-cols-[92px_minmax(0,120px)_minmax(0,1fr)_64px_56px] lg:grid-cols-[92px_minmax(0,120px)_minmax(0,1fr)_minmax(0,1.2fr)_64px_56px]";

/**
 * COMPONENT (stateless) -- one log line.
 *
 * Dense by design: this screen is scanned, not read. The failure marker is a
 * left border rather than a colour fill, which survives a monochrome palette.
 */
export function LogRow({ log }: { log: McpLog }) {
  const isError = log.status === "error";

  return (
    <div
      className={cn(
        LOG_GRID,
        "items-center gap-3 border-l-2 py-2 pr-4 pl-3 text-mini",
        isError ? "border-l-foreground bg-muted/40" : "border-l-transparent",
      )}
    >
      <time
        className="font-mono text-xs tabular-nums text-text-quaternary"
        dateTime={log.created_at}
      >
        {formatTime(log.created_at)}
      </time>

      <span className="truncate text-xs text-text-tertiary">
        {log.server_name ?? "gateway"}
      </span>

      <span className="truncate font-mono text-xs" title={log.tool_name ?? log.method}>
        {log.tool_name ?? log.method}
      </span>

      {/* Hidden below lg, where there is no room for it. The grid drops the
          column to match, so nothing shifts. */}
      <span
        className="hidden truncate text-xs text-text-quaternary lg:block"
        title={log.message ?? undefined}
      >
        {log.message ?? ""}
      </span>

      <span className="text-right font-mono text-xs tabular-nums text-text-quaternary">
        {log.duration_ms === null ? "—" : `${log.duration_ms}ms`}
      </span>

      <span
        className={cn(
          "text-right text-xs",
          isError ? "font-medium text-foreground" : "text-text-quaternary",
        )}
      >
        {isError ? "failed" : "ok"}
      </span>
    </div>
  );
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";

  const isToday = date.toDateString() === new Date().toDateString();
  const time = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  // Today's entries dominate; only spend space on a date when it differs.
  return isToday
    ? time
    : `${date.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
}
