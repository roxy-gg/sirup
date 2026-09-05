import { useMemo, useState } from "react";
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
import { ServerCard } from "./ServerCard";
import { ConnectSheet } from "./ConnectSheet";
import { setToolEnabled } from "../data/mcpServersApi";
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

  const [tab, setTab] = useState("apps");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selected, setSelected] = useState<CatalogEntry | null>(null);
  // Bumped after a connect so the catalog re-reads its "Added" flags.
  const [catalogKey, setCatalogKey] = useState(0);

  const catalog = useMcpCatalog(catalogKey);
  const endpoint = `${window.location.origin}/mcp`;

  /**
   * How many connections exist per catalog entry, and under what labels.
   *
   * Matched on URL because that is what identifies the upstream -- the label
   * is deliberately free-form so two accounts on the same app can be told
   * apart. Normalised because several providers require a trailing slash, so
   * the stored URL and the catalog URL can differ by one character.
   */
  const connectionsByApp = useMemo(() => {
    const normalise = (url: string) => url.replace(/\/+$/, "").toLowerCase();
    const byUrl = new Map<string, string[]>();

    for (const server of servers.servers) {
      const key = normalise(server.url);
      byUrl.set(key, [...(byUrl.get(key) ?? []), server.name]);
    }

    const counts: Record<string, number> = {};
    const names: Record<string, string[]> = {};
    for (const entry of catalog.all) {
      if (!entry.url) continue;
      const matches = byUrl.get(normalise(entry.url)) ?? [];
      if (matches.length > 0) {
        counts[entry.key] = matches.length;
        names[entry.key] = matches;
      }
    }
    return { counts, names };
  }, [servers.servers, catalog.all]);

  /**
   * Connected servers grouped by the app they point at.
   *
   * Two accounts on the same app belong next to each other; a flat list sorted
   * by connect date scatters them. Servers with no catalog match (a custom
   * endpoint) each form their own group of one.
   */
  const groupedServers = useMemo(() => {
    const normalise = (url: string) => url.replace(/\/+$/, "").toLowerCase();
    const entryByUrl = new Map(
      catalog.all
        .filter((entry) => entry.url)
        .map((entry) => [normalise(entry.url!), entry] as const),
    );

    const groups = new Map<
      string,
      {
        key: string;
        label: string;
        icon: string | null;
        entry: CatalogEntry | undefined;
        servers: typeof servers.servers;
      }
    >();

    for (const server of servers.servers) {
      const entry = entryByUrl.get(normalise(server.url));
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

    return [...groups.values()];
  }, [servers.servers, catalog.all]);

  function openSheet(app: CatalogEntry) {
    setSelected(app);
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
    void servers.reload();
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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
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
          />
        </div>
      </section>

      <Separator />

      <Tabs value={tab} onValueChange={setTab} className="gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="apps">All apps</TabsTrigger>
            <TabsTrigger value="connected">
              Connected ({servers.servers.length})
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
            {catalog.connectableCount} apps connect with an API key today.
            Providers marked <span className="text-foreground">OAuth soon</span>{" "}
            need a browser sign-in flow we haven&rsquo;t shipped yet.
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
          ) : servers.servers.length === 0 ? (
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
                      group.entry ? () => openSheet(group.entry!) : undefined
                    }
                  />
                ))}
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>

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
