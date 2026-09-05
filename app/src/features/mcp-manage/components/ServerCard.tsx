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
import { AppIcon } from "@/components/AppIcon";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";
import type { McpServer, Uuid } from "@shared/domain";

/**
 * COMPONENT (stateless) -- one connected account.
 *
 * The label is the account name, not the app name: a company can connect the
 * same app twice, and the label plus the namespace are what tell "Gmail work"
 * from "Gmail personal" here and in the tool list the model sees.
 */
interface ServerCardProps {
  server: McpServer;
  /** Brand mark for the app this account belongs to, when known. */
  icon?: string | null;
  isBusy: boolean;
  onRefresh: (id: Uuid) => void;
  onDisconnect: (id: Uuid) => void;
  onToggleEnabled: (id: Uuid, enabled: boolean) => void;
  /** Offered only when the app is in the catalog and can take another account. */
  onAddAnother?: (() => void) | undefined;
}

export function ServerCard({
  server,
  icon,
  isBusy,
  onRefresh,
  onDisconnect,
  onToggleEnabled,
  onAddAnother,
}: ServerCardProps) {
  return (
    <Card
      className={cn(
        "transition-opacity duration-[var(--duration-fast)]",
        isBusy && "opacity-60",
      )}
    >
      <CardContent className="flex items-center gap-3 p-4">
        <AppIcon icon={icon} name={server.name} />

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{server.name}</span>
            <StatusBadge status={server.status} enabled={server.enabled} />
          </div>

          {server.status === "error" && server.status_message ? (
            <span
              className="truncate text-xs text-destructive"
              title={server.status_message}
            >
              {server.status_message}
            </span>
          ) : (
            <span className="truncate text-xs text-text-tertiary">
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
                {onAddAnother ? (
                  <DropdownMenuItem onSelect={onAddAnother}>
                    Add another account
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem
                  onSelect={() => onToggleEnabled(server.id, !server.enabled)}
                >
                  {server.enabled ? "Pause account" : "Resume account"}
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
