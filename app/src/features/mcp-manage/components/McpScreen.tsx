import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PlusIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useSession } from "@/features/auth/hooks/useSession";
import { useMcpServers } from "../hooks/useMcpServers";
import { useMcpCatalog } from "@/features/mcp-discover/hooks/useMcpCatalog";
import { AppGrid } from "@/features/mcp-discover/components/AppGrid";
import { AppIcon } from "@/components/AppIcon";
import { CopyField } from "@/features/onboarding/components/CopyField";
import { ClientConfig } from "./ClientConfig";
import { ServerCard } from "./ServerCard";
import { ConnectSheet } from "./ConnectSheet";
import { OAuthConnectSheet } from "./OAuthConnectSheet";
import { fetchServer, setToolEnabled } from "../data/mcpServersApi";
import { attachServerToProfile as attachToProfile } from "@/features/profiles/data/profilesApi";
import type { ConnectServerBody } from "@shared/api";
import type { CatalogEntry, McpServerWithTools, Uuid } from "@shared/domain";

/**
 * COMPONENT -- the MCP full screen.
 *
 * The catalog is the default tab, not the connected list. A new workspace has
 * nothing connected, so opening on "what can I add" is the useful first screen;
 * the connected list is where you go once there is something to manage.
 */
export function McpScreen() {
  const { activeProfile, refresh } = useSession();
  const servers = useMcpServers();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tab, setTab] = useState("apps");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [oauthSheetOpen, setOauthSheetOpen] = useState(false);
  const [selected, setSelected] = useState<CatalogEntry | null>(null);
  const [oauthCallbackId] = useState<Uuid | null>(
    () => new URLSearchParams(window.location.search).get("oauth_server") as Uuid | null,
  );
  const [oauthCallbackError] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get("oauth_error"),
  );
  const [oauthCallbackHandled, setOauthCallbackHandled] = useState(false);
  // Bumped after a connect so the catalog re-reads its "Added" flags.
  const [catalogKey, setCatalogKey] = useState(0);

  const { servers: serverRows, reload: reloadServers } = servers;
  const catalog = useMcpCatalog(catalogKey);
  const endpoint = `${window.location.origin}/mcp`;

  /**
   * Handles the return trip from a provider. The connection is already saved
   * and attached by the callback, so this only reports the outcome and
   * refreshes what is on screen.
   */
  useEffect(() => {
    if (oauthCallbackHandled) return;
    if (!oauthCallbackError && !oauthCallbackId) return;

    setOauthCallbackHandled(true);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("oauth_error");
    nextParams.delete("oauth_server");
    setSearchParams(nextParams, { replace: true });

    if (oauthCallbackError) {
      toast.error("Could not finish signing in", {
        description: oauthCallbackError,
      });
      return;
    }
    if (!oauthCallbackId) return;

    setTab("connected");
    setCatalogKey((key) => key + 1);
    void reloadServers();
    void refresh();

    fetchServer(oauthCallbackId)
      .then((server) => {
        if (server.status === "connected") {
          toast.success(`${server.name} connected`, {
            description: `${server.tool_count} tool${
              server.tool_count === 1 ? "" : "s"
            } added to your endpoint.`,
          });
        } else {
          toast.error(`${server.name} signed in, but tools could not be loaded`, {
            description: server.status_message ?? "Retry from the connected list.",
          });
        }
      })
      .catch(() => {
        toast.success("Account connected.");
      });
  }, [
    oauthCallbackError,
    oauthCallbackHandled,
    oauthCallbackId,
    searchParams,
    setSearchParams,
    reloadServers,
    refresh,
  ]);

  /**
   * How many connections exist per catalog entry, and under what labels.
   *
   * Managed integrations match on their stable key; generic entries match on
   * normalized URL. The label stays free-form so multiple accounts remain
   * distinct even when they share one upstream endpoint.
   */
  const connectionsByApp = useMemo(() => {
    const normalise = (url: string) => url.replace(/\/+$/, "").toLowerCase();
    const byIdentity = new Map<string, string[]>();

    for (const server of serverRows) {
      const key = server.integration_key
        ? `integration:${server.integration_key}`
        : `url:${normalise(server.url)}`;
      byIdentity.set(key, [...(byIdentity.get(key) ?? []), server.name]);
    }

    const counts: Record<string, number> = {};
    const names: Record<string, string[]> = {};
    for (const entry of catalog.all) {
      if (!entry.url && !entry.integration_key) continue;
      const key = entry.integration_key
        ? `integration:${entry.integration_key}`
        : `url:${normalise(entry.url!)}`;
      const matches = byIdentity.get(key) ?? [];
      if (matches.length > 0) {
        counts[entry.key] = matches.length;
        names[entry.key] = matches;
      }
    }
    return { counts, names };
  }, [serverRows, catalog.all]);

  /**
   * Connected servers grouped by the app they point at.
   *
   * Two accounts on the same app belong next to each other, and catalog order
   * keeps Gmail first here as well. Servers with no catalog match (a custom
   * endpoint) each form their own group of one after known integrations.
   */
  const groupedServers = useMemo(() => {
    const normalise = (url: string) => url.replace(/\/+$/, "").toLowerCase();
    const entryByIdentity = new Map(
      catalog.all
        .filter((entry) => entry.url || entry.integration_key)
        .map((entry) => [
          entry.integration_key
            ? `integration:${entry.integration_key}`
            : `url:${normalise(entry.url!)}`,
          entry,
        ] as const),
    );

    const groups = new Map<
      string,
      {
        key: string;
        label: string;
        icon: string | null;
        entry: CatalogEntry | undefined;
        servers: typeof serverRows;
      }
    >();

    const catalogOrder = new Map(
      catalog.all.map((entry, index) => [entry.key, index] as const),
    );

    for (const server of serverRows) {
      const identity = server.integration_key
        ? `integration:${server.integration_key}`
        : `url:${normalise(server.url)}`;
      const entry = entryByIdentity.get(identity);
      // Unmatched servers key on their own id, so they never merge together.
      const key = entry?.key ?? `custom:${server.id}`;
      const existing = groups.get(key);

      if (existing) existing.servers.push(server);
      else {
        groups.set(key, {
          key,
          label: entry?.name ?? server.name,
          icon: entry?.icon ?? null,
          entry,
          servers: [server],
        });
      }
    }

    return [...groups.values()].sort((left, right) => {
      const leftOrder = left.entry
        ? (catalogOrder.get(left.entry.key) ?? Number.MAX_SAFE_INTEGER)
        : Number.MAX_SAFE_INTEGER;
      const rightOrder = right.entry
        ? (catalogOrder.get(right.entry.key) ?? Number.MAX_SAFE_INTEGER)
        : Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder;
    });
  }, [serverRows, catalog.all]);

  function openSheet(app: CatalogEntry) {
    if (app.connect_mode === "unavailable") return;

    setSelected(app);
    if (app.connect_mode === "oauth") {
      setOauthSheetOpen(true);
      return;
    }
    setSheetOpen(true);
  }

  async function handleConnect(
    payload: ConnectServerBody,
  ): Promise<McpServerWithTools> {
    const server = await servers.connect(payload);

    // Attach to the profile you are looking at. Connecting from "Frontend"
    // and having it silently land elsewhere would be surprising, and a
    // connection attached to nothing serves no tools at all.
    if (activeProfile) {
      await attachToProfile(activeProfile.id, server.id);
    }

    return server;
  }

  async function handleSetToolEnabled(
    serverId: string,
    toolId: string,
    enabled: boolean,
  ) {
    await setToolEnabled(serverId as Uuid, toolId as Uuid, enabled);
  }

  function handleDone(server: McpServerWithTools) {
    setCatalogKey((key) => key + 1);
    void reloadServers();
    // Counts on the switcher and the endpoint panel just changed.
    void refresh();
    setTab("connected");

    toast.success(`${server.name} connected`, {
      description: `${server.tool_count} tool${
        server.tool_count === 1 ? "" : "s"
      } added to ${activeProfile?.name ?? "your profile"}.`,
    });
  }

  async function handleDisconnect(id: Uuid) {
    try {
      await servers.disconnect(id);
      setCatalogKey((key) => key + 1);
      toast.success("Server disconnected.");
    } catch (error) {
      toast.error("Could not disconnect", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function handleToggleEnabled(id: Uuid, enabled: boolean) {
    try {
      await servers.toggleEnabled(id, enabled);
    } catch (error) {
      toast.error("Could not update the server", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function handleRefresh(id: Uuid) {
    try {
      await servers.refresh(id);
      toast.success("Tools refreshed.");
    } catch (error) {
      toast.error("Refresh failed", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pt-3 pb-8 sm:px-6">
      {/* ── Your endpoint: the thing you came here to copy ─────────────── */}
      <section className="surface flex flex-col gap-4 rounded-2xl bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-lg font-semibold tracking-tight">
              {activeProfile?.name ?? "Your"} endpoint
            </h1>
            <p className="text-sm text-text-tertiary">
              This token exposes {activeProfile?.tool_count ?? 0} tool
              {activeProfile?.tool_count === 1 ? "" : "s"} from{" "}
              {activeProfile?.server_count ?? 0} connection
              {activeProfile?.server_count === 1 ? "" : "s"}. Other profiles have
              their own.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <CopyField label="Endpoint URL" value={endpoint} className="flex-1" />
          <CopyField
            label={`${activeProfile?.name ?? "Profile"} token`}
            value={activeProfile?.gateway_token ?? ""}
            className="flex-1"
            secret
          />
        </div>

        <ClientConfig
          endpoint={endpoint}
          token={activeProfile?.gateway_token ?? ""}
          profileName={activeProfile?.name}
        />
      </section>

      <Separator />

      <Tabs value={tab} onValueChange={setTab} className="gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="apps">All apps</TabsTrigger>
            <TabsTrigger value="connected">
              Connected ({serverRows.length})
            </TabsTrigger>
          </TabsList>

          {tab === "apps" ? (
            <div className="relative w-full sm:w-72">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search apps — github, stripe, notion…"
                value={catalog.query}
                onChange={(event) => catalog.setQuery(event.target.value)}
                className="pl-9"
              />
            </div>
          ) : null}
        </div>

        {/* ── All apps: the default view ──────────────────────────────── */}
        <TabsContent value="apps" className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {catalog.connectableCount} apps are ready to connect. Gmail uses a
            secure Google sign-in; other OAuth providers stay unavailable until
            they have a reviewed integration.
          </p>

          <div className="flex flex-wrap gap-1.5">
            {catalog.categories.map((category) => (
              <Button
                key={category}
                variant={catalog.category === category ? "secondary" : "ghost"}
                size="sm"
                onClick={() => catalog.setCategory(category)}
              >
                {category}
              </Button>
            ))}
          </div>

          <AppGrid
            apps={catalog.catalog}
            status={catalog.status}
            connectionCounts={connectionsByApp.counts}
            onSelect={openSheet}
          />
        </TabsContent>

        {/* ── Connected ───────────────────────────────────────────────── */}
        <TabsContent value="connected" className="flex flex-col gap-4">
          {servers.status === "loading" ? (
            Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-[92px] rounded-xl" />
            ))
          ) : serverRows.length === 0 ? (
            <Empty className="rounded-xl border border-dashed">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <PlusIcon />
                </EmptyMedia>
                <EmptyTitle>Nothing connected yet</EmptyTitle>
                <EmptyDescription>
                  Add your first app and its tools appear on your endpoint
                  instantly.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={() => setTab("apps")}>Browse apps</Button>
              </EmptyContent>
            </Empty>
          ) : (
            // Grouped by app, so two accounts of the same thing sit together
            // rather than scattered through a flat list by connect date.
            groupedServers.map((group) => (
              <div key={group.key} className="flex flex-col gap-2">
                {group.servers.length > 1 ? (
                  <div className="flex items-center gap-2 px-1">
                    <AppIcon
                      icon={group.icon}
                      name={group.label}
                      className="size-5 rounded border-0 bg-transparent"
                    />
                    <span className="text-mini font-medium">{group.label}</span>
                    <span className="text-xs text-text-quaternary">
                      {group.servers.length} accounts
                    </span>
                  </div>
                ) : null}

                {group.servers.map((server) => (
                  <ServerCard
                    key={server.id}
                    server={server}
                    icon={group.icon}
                    isBusy={servers.busyId === server.id}
                    onRefresh={(id) => void handleRefresh(id)}
                    onDisconnect={(id) => void handleDisconnect(id)}
                    onToggleEnabled={(id, enabled) =>
                      void handleToggleEnabled(id, enabled)
                    }
                    onAddAnother={
                      group.entry?.connect_mode !== "unavailable"
                        ? () => openSheet(group.entry!)
                        : undefined
                    }
                  />
                ))}
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>

      <OAuthConnectSheet
        open={oauthSheetOpen}
        onOpenChange={setOauthSheetOpen}
        app={selected}
        profileId={activeProfile?.id}
        existingNames={selected ? (connectionsByApp.names[selected.key] ?? []) : []}
      />

      <ConnectSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        app={selected}
        existingNames={selected ? (connectionsByApp.names[selected.key] ?? []) : []}
        onConnect={handleConnect}
        onSetToolEnabled={handleSetToolEnabled}
        onDone={handleDone}
      />
    </div>
  );
}
