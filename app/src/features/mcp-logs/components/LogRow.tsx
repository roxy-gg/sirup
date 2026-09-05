import { cn } from "@/lib/utils";
import type { McpLog } from "@shared/domain";

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
        "flex items-center gap-3 border-l-2 py-2.5 pl-3 text-sm",
        isError ? "border-l-foreground bg-muted/40" : "border-l-transparent",
      )}
    >
      <time
        className="w-[104px] shrink-0 font-mono text-xs text-muted-foreground"
        dateTime={log.created_at}
      >
        {formatTime(log.created_at)}
      </time>

      <span className="w-24 shrink-0 truncate text-xs text-muted-foreground">
        {log.server_name ?? "gateway"}
      </span>

      <span className="min-w-0 flex-1 truncate font-mono text-xs">
        {log.tool_name ?? log.method}
      </span>

      {log.message ? (
        <span
          className="hidden min-w-0 max-w-[40%] flex-1 truncate text-xs text-muted-foreground lg:block"
          title={log.message}
        >
          {log.message}
        </span>
      ) : null}

      <span className="w-14 shrink-0 text-right font-mono text-xs text-muted-foreground">
        {log.duration_ms === null ? "—" : `${log.duration_ms}ms`}
      </span>

      <span className="w-12 shrink-0 text-right text-xs">
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
