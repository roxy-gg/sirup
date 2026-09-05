import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { CatalogGrid } from "@/features/mcp-discover/components/CatalogGrid";
import { CopyField } from "@/features/onboarding/components/CopyField";
import { ServerCard } from "./ServerCard";
import { ConnectDialog } from "./ConnectDialog";
import type { ConnectServerBody } from "@shared/api";
import type { CatalogEntry, Uuid } from "@shared/domain";

/**
 * COMPONENT -- the MCP full screen. Two tabs, matching the wireframe: what's
 * connected, and a catalog to connect from.
 */
export function McpScreen() {
  const { company } = useSession();
  const servers = useMcpServers();

  const [tab, setTab] = useState("manage");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [preset, setPreset] = useState<CatalogEntry | null>(null);
  // Bumped after a connect so the catalog re-reads its "Added" flags.
  const [catalogKey, setCatalogKey] = useState(0);

  const catalog = useMcpCatalog(catalogKey);
  const endpoint = `${window.location.origin}/mcp`;

  function openDialog(entry: CatalogEntry | null) {
    setPreset(entry);
    setDialogOpen(true);
  }

  async function handleConnect(payload: ConnectServerBody) {
    const server = await servers.connect(payload);
    setCatalogKey((key) => key + 1);
    setTab("manage");

    if (server.status === "connected") {
      toast.success(`${server.name} connected`, {
        description: `${server.tool_count} tool${
          server.tool_count === 1 ? "" : "s"
        } added to your gateway.`,
      });
    } else {
      // Saved but unreachable: say so plainly rather than a bare success toast.
      toast.warning(`${server.name} saved, but not reachable`, {
        description:
          server.status_message ?? "Check the URL and credentials, then retry.",
      });
    }
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
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight">MCP servers</h1>
            <p className="text-sm text-muted-foreground">
              {servers.totalTools} tool{servers.totalTools === 1 ? "" : "s"} served
              through one endpoint.
            </p>
          </div>

          <Button onClick={() => openDialog(null)}>
            <PlusIcon data-icon="inline-start" />
            Connect
          </Button>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <CopyField label="Your endpoint" value={endpoint} className="flex-1" />
          <CopyField
            label="Gateway token"
            value={company?.gateway_token ?? ""}
            className="flex-1"
          />
        </div>
      </header>

      <Separator />

      <Tabs value={tab} onValueChange={setTab} className="gap-6">
        <TabsList>
          <TabsTrigger value="manage">Connected ({servers.servers.length})</TabsTrigger>
          <TabsTrigger value="discover">Discover</TabsTrigger>
        </TabsList>

        <TabsContent value="manage" className="flex flex-col gap-3">
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
                <EmptyTitle>No servers connected</EmptyTitle>
                <EmptyDescription>
                  Connect your first MCP server and its tools appear on your
                  gateway instantly.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={() => setTab("discover")}>Browse servers</Button>
              </EmptyContent>
            </Empty>
          ) : (
            servers.servers.map((server) => (
              <ServerCard
                key={server.id}
                server={server}
                isBusy={servers.busyId === server.id}
                onRefresh={(id) => void handleRefresh(id)}
                onDisconnect={(id) => void handleDisconnect(id)}
                onToggleEnabled={(id, enabled) => void handleToggleEnabled(id, enabled)}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="discover" className="flex flex-col gap-4">
          {/* Category filter: a segmented control, not page navigation. */}
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

          <CatalogGrid
            catalog={catalog.catalog}
            status={catalog.status}
            onSelect={openDialog}
          />
        </TabsContent>
      </Tabs>

      <ConnectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        preset={preset}
        onConnect={handleConnect}
      />
    </div>
  );
}
