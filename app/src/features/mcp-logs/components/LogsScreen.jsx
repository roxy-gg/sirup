import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ScrollTextIcon, TriangleAlertIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useMcpLogs } from "../hooks/useMcpLogs";
import { isUuid } from "@/lib/uuid";
import { LogRow } from "./LogRow";

/**
 * COMPONENT -- the MCP Logs full screen. Every call that crossed the gateway,
 * newest first, filterable by outcome.
 */
export function LogsScreen() {
  const [searchParams] = useSearchParams();
  // Hand-edited or stale URLs shouldn't 400 the request; drop anything that
  // isn't a UUID and just show all activity instead.
  const rawServer = searchParams.get("server");
  const serverId = isUuid(rawServer) ? rawServer : undefined;

  const [filter, setFilter] = useState("all");
  const { logs, summary, error, loadState, hasMore, loadMore } = useMcpLogs({
    serverId,
    status: filter === "all" ? undefined : filter,
  });

  const isLoading = loadState === "loading";

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Logs</h1>
        <p className="text-sm text-muted-foreground">
          Every tool call routed through your gateway.
        </p>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <SummaryTile label="Calls (24h)" value={summary?.total} />
        <SummaryTile label="Succeeded" value={summary?.ok} />
        <SummaryTile label="Failed" value={summary?.error} />
      </div>

      <Separator />

      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="ok">Succeeded</TabsTrigger>
          <TabsTrigger value="error">Failed</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-9 rounded-md" />
          ))}
        </div>
      ) : error ? (
        <Alert>
          <TriangleAlertIcon />
          <AlertTitle>Could not load activity</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : logs.length === 0 ? (
        <Empty className="rounded-xl border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ScrollTextIcon />
            </EmptyMedia>
            <EmptyTitle>No activity yet</EmptyTitle>
            <EmptyDescription>
              Point an MCP client at your endpoint and calls will show up here in
              real time.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-3">
          <Card className="theme-surface overflow-hidden py-0">
            <CardContent className="divide-y p-0">
              {logs.map((log) => (
                <LogRow key={log.id} log={log} />
              ))}
            </CardContent>
          </Card>

          {hasMore ? (
            <Button
              variant="outline"
              onClick={loadMore}
              disabled={loadState === "loading-more"}
              className="self-center"
            >
              {loadState === "loading-more" ? "Loading…" : "Load more"}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function SummaryTile({ label, value }) {
  return (
    <Card className="theme-surface">
      <CardContent className="flex flex-col gap-1 p-4">
        <span className="text-xs text-muted-foreground">{label}</span>
        {value === undefined || value === null ? (
          <Skeleton className="h-7 w-12" />
        ) : (
          <span className="font-mono text-2xl tabular-nums">{value}</span>
        )}
      </CardContent>
    </Card>
  );
}
