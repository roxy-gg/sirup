import { Link } from "react-router-dom";
import { MoreHorizontalIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";
import type { McpServer, Uuid } from "@shared/domain";

/**
 * COMPONENT (stateless) -- one connected server row, matching the wireframe:
 * name and account on the left, actions on the right.
 */
interface ServerCardProps {
  server: McpServer;
  isBusy: boolean;
  onRefresh: (id: Uuid) => void;
  onDisconnect: (id: Uuid) => void;
  onToggleEnabled: (id: Uuid, enabled: boolean) => void;
}

export function ServerCard({
  server,
  isBusy,
  onRefresh,
  onDisconnect,
  onToggleEnabled,
}: ServerCardProps) {
  return (
    <Card
      className={cn(
        "theme-surface transition-opacity duration-[var(--duration-fast)]",
        isBusy && "opacity-60",
      )}
    >
      <CardContent className="flex items-center gap-4 p-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{server.name}</span>
            <StatusBadge status={server.status} enabled={server.enabled} />
          </div>

          <span className="truncate text-xs text-muted-foreground" title={server.url}>
            {server.url}
          </span>

          {server.status === "error" && server.status_message ? (
            <span
              className="truncate text-xs text-destructive"
              title={server.status_message}
            >
              {server.status_message}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {server.tool_count} tool{server.tool_count === 1 ? "" : "s"} ·{" "}
              <code className="font-mono">{server.slug}__*</code>
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/logs?server=${server.id}`}>Logs</Link>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            disabled={isBusy}
            onClick={() => onRefresh(server.id)}
            aria-label="Refresh tools"
            title="Refresh tools"
          >
            <RefreshCwIcon className={cn(isBusy && "animate-spin")} />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="More actions">
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onSelect={() => onToggleEnabled(server.id, !server.enabled)}
                >
                  {server.enabled ? "Pause server" : "Resume server"}
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => onDisconnect(server.id)}
                >
                  Disconnect
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}
