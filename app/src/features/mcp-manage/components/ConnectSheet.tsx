import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckIcon, Loader2Icon, TriangleAlertIcon } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AppIcon } from "@/components/AppIcon";
import { cn } from "@/lib/utils";
import type { ConnectServerBody } from "@shared/api";
import type { AuthType, CatalogEntry, McpServerWithTools } from "@shared/domain";

/**
 * COMPONENT -- the connect flow, in a right-side sheet.
 *
 * A sheet rather than a modal because this is a two-phase task: you fill in a
 * credential, we go and talk to the upstream, and then you choose which of its
 * tools your agents may call. A modal would have to either block on discovery
 * or throw away what you typed; the sheet keeps the app list visible behind it
 * and lets the panel grow into step two.
 *
 * Step 2 is the part that matters. The tool list is read from the *live*
 * server, so the permissions you're granting are the real ones -- not a
 * hardcoded guess at what the provider exposes.
 */
interface ConnectSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  app: CatalogEntry | null;
  onConnect: (payload: ConnectServerBody) => Promise<McpServerWithTools>;
  onSetToolEnabled: (serverId: string, toolId: string, enabled: boolean) => Promise<void>;
  onDone: (server: McpServerWithTools) => void;
}

type Phase = "configure" | "connecting" | "permissions";

export function ConnectSheet({
  open,
  onOpenChange,
  app,
  onConnect,
  onSetToolEnabled,
  onDone,
}: ConnectSheetProps) {
  const [phase, setPhase] = useState<Phase>("configure");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [authType, setAuthType] = useState<AuthType>("none");
  const [headerName, setHeaderName] = useState("");
  const [authValue, setAuthValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [server, setServer] = useState<McpServerWithTools | null>(null);
  const [disabledTools, setDisabledTools] = useState<Set<string>>(new Set());
  const [toolQuery, setToolQuery] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const isCustom = app?.key === "custom";

  // Re-seed each time the sheet opens, so a second connect isn't polluted by
  // whatever was typed the first time.
  useEffect(() => {
    if (!open) return;
    setPhase("configure");
    setName(app && !isCustom ? app.name : "");
    setUrl(app?.url ?? "");
    setAuthType(app?.auth_type ?? "none");
    setHeaderName(app?.auth_header_name ?? "");
    setAuthValue("");
    setError(null);
    setServer(null);
    setDisabledTools(new Set());
    setToolQuery("");
  }, [open, app, isCustom]);

  async function handleConnect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPhase("connecting");
    setError(null);

    try {
      const connected = await onConnect({
        name,
        url,
        auth_type: authType,
        auth_header_name: authType === "header" ? headerName : null,
        auth_value: authType === "none" ? null : authValue,
      });

      setServer(connected);

      // A server that saved but could not be reached has no tools to pick
      // from, so there is nothing useful to show in step two.
      if (connected.status !== "connected") {
        setError(
          connected.status_message ??
            "Saved, but we could not reach that server. Check the URL and credentials.",
        );
        setPhase("configure");
        return;
      }

      setPhase("permissions");
    } catch (connectError) {
      setError(
        connectError instanceof Error ? connectError.message : "Could not connect.",
      );
      setPhase("configure");
    }
  }

  const tools = server?.tools ?? [];

  const visibleTools = useMemo(() => {
    const needle = toolQuery.trim().toLowerCase();
    if (!needle) return tools;
    return tools.filter(
      (tool) =>
        tool.name.toLowerCase().includes(needle) ||
        (tool.description ?? "").toLowerCase().includes(needle),
    );
  }, [tools, toolQuery]);

  const enabledCount = tools.length - disabledTools.size;

  function toggleTool(toolId: string, enabled: boolean) {
    setDisabledTools((current) => {
      const next = new Set(current);
      if (enabled) next.delete(toolId);
      else next.add(toolId);
      return next;
    });
  }

  function setAll(enabled: boolean) {
    setDisabledTools(enabled ? new Set() : new Set(tools.map((tool) => tool.id)));
  }

  /**
   * Persists only the tools whose state actually changed. Everything is
   * enabled server-side on discovery, so a first connect that leaves the
   * defaults alone costs zero requests.
   */
  async function savePermissions() {
    if (!server) return;
    setIsSaving(true);

    try {
      await Promise.all(
        [...disabledTools].map((toolId) => onSetToolEnabled(server.id, toolId, false)),
      );
      onDone(server);
      onOpenChange(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Could not save permissions.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="gap-3 border-b p-6">
          <div className="flex items-center gap-3">
            <AppIcon icon={app?.icon} name={app?.name ?? "?"} className="size-10" />
            <div className="flex min-w-0 flex-col">
              <SheetTitle className="truncate">
                {phase === "permissions"
                  ? `${app?.name ?? "Server"} permissions`
                  : `Connect ${app?.name ?? "a server"}`}
              </SheetTitle>
              <SheetDescription className="truncate">
                {phase === "permissions"
                  ? "Choose exactly what your agents can call."
                  : "Authenticate, then pick what your agents can do."}
              </SheetDescription>
            </div>
          </div>

          <StepIndicator phase={phase} />
        </SheetHeader>

        {phase === "permissions" ? (
          <>
            <div className="flex flex-col gap-3 border-b px-6 py-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col">
                  <span className="text-sm font-medium">Allowed actions</span>
                  <span className="text-xs text-muted-foreground">
                    {enabledCount} of {tools.length} enabled
                  </span>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setAll(true)}>
                    Enable all
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setAll(false)}>
                    Clear all
                  </Button>
                </div>
              </div>

              <Input
                placeholder="Search actions"
                value={toolQuery}
                onChange={(event) => setToolQuery(event.target.value)}
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-2">
              {visibleTools.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No actions match that search.
                </p>
              ) : (
                <ul className="flex flex-col">
                  {visibleTools.map((tool) => {
                    const enabled = !disabledTools.has(tool.id);
                    return (
                      <li key={tool.id}>
                        <label
                          className={cn(
                            "flex cursor-pointer items-start gap-3 rounded-lg py-3 pr-2 transition-colors",
                            "hover:bg-accent/50",
                          )}
                        >
                          <Checkbox
                            checked={enabled}
                            onCheckedChange={(checked) =>
                              toggleTool(tool.id, checked === true)
                            }
                            className="mt-0.5"
                          />
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <span className="text-sm leading-none font-medium">
                              {tool.name}
                            </span>
                            {tool.description ? (
                              <span className="line-clamp-2 text-xs text-muted-foreground">
                                {tool.description}
                              </span>
                            ) : null}
                            <code className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                              {tool.namespaced_name}
                            </code>
                          </div>
                        </label>
                        <Separator />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <SheetFooter className="flex-row justify-end gap-2 border-t p-6">
              <Button
                variant="ghost"
                onClick={() => {
                  if (server) onDone(server);
                  onOpenChange(false);
                }}
              >
                Skip
              </Button>
              <Button onClick={() => void savePermissions()} disabled={isSaving}>
                {isSaving ? "Saving…" : `Grant ${enabledCount} action${enabledCount === 1 ? "" : "s"}`}
              </Button>
            </SheetFooter>
          </>
        ) : (
          <form
            onSubmit={handleConnect}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-6">
              <Field>
                <FieldLabel htmlFor="connect-name">Account label</FieldLabel>
                <Input
                  id="connect-name"
                  placeholder={app?.name ?? "My server"}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
                <FieldDescription>
                  Namespaces this server&rsquo;s tools, and tells two accounts of
                  the same app apart.
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="connect-url">Endpoint URL</FieldLabel>
                <Input
                  id="connect-url"
                  type="url"
                  placeholder="https://mcp.example.com/mcp"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  readOnly={!isCustom && Boolean(app?.url)}
                  className={cn(!isCustom && app?.url && "text-muted-foreground")}
                  required
                />
                <FieldDescription>
                  Streamable HTTP or SSE — sirup detects which automatically.
                </FieldDescription>
              </Field>

              <Separator />

              <Field>
                <FieldLabel htmlFor="connect-auth">Authentication method</FieldLabel>
                <Select
                  value={authType}
                  onValueChange={(value) => setAuthType(value as AuthType)}
                >
                  <SelectTrigger id="connect-auth">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="none">No authentication</SelectItem>
                      <SelectItem value="bearer">API key (bearer token)</SelectItem>
                      <SelectItem value="header">API key (custom header)</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {app?.auth_hint ? (
                  <FieldDescription>{app.auth_hint}</FieldDescription>
                ) : null}
              </Field>

              {authType === "header" ? (
                <Field>
                  <FieldLabel htmlFor="connect-header">Header name</FieldLabel>
                  <Input
                    id="connect-header"
                    placeholder="x-api-key"
                    value={headerName}
                    onChange={(event) => setHeaderName(event.target.value)}
                    required
                  />
                </Field>
              ) : null}

              {authType !== "none" ? (
                <Field>
                  <FieldLabel htmlFor="connect-secret">Credential</FieldLabel>
                  <Input
                    id="connect-secret"
                    type="password"
                    placeholder="Paste the key"
                    value={authValue}
                    onChange={(event) => setAuthValue(event.target.value)}
                    autoComplete="off"
                    required
                  />
                  <FieldDescription>
                    Stored server-side and never returned to the browser.
                  </FieldDescription>
                </Field>
              ) : null}

              {error ? (
                <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3">
                  <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
                  <p className="text-xs leading-relaxed">{error}</p>
                </div>
              ) : null}
            </div>

            <SheetFooter className="flex-row justify-end gap-2 border-t p-6">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={phase === "connecting"}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={phase === "connecting"}>
                {phase === "connecting" ? (
                  <>
                    <Loader2Icon className="animate-spin" />
                    Connecting…
                  </>
                ) : (
                  "Connect"
                )}
              </Button>
            </SheetFooter>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Two dots showing which half of the flow you're in. */
function StepIndicator({ phase }: { phase: Phase }) {
  const steps = [
    { label: "Authenticate", done: phase === "permissions" },
    { label: "Permissions", done: false },
  ];
  const activeIndex = phase === "permissions" ? 1 : 0;

  return (
    <ol className="flex items-center gap-2">
      {steps.map((step, index) => (
        <li key={step.label} className="flex items-center gap-2">
          <span
            className={cn(
              "flex size-4 items-center justify-center rounded-full border text-[9px] font-medium transition-colors",
              step.done && "border-foreground bg-foreground text-background",
              !step.done && index === activeIndex && "border-foreground text-foreground",
              !step.done && index !== activeIndex && "text-muted-foreground",
            )}
          >
            {step.done ? <CheckIcon className="size-2.5" /> : index + 1}
          </span>
          <span
            className={cn(
              "text-xs",
              index === activeIndex ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {step.label}
          </span>
          {index === 0 ? <span className="h-px w-6 bg-border" /> : null}
        </li>
      ))}
    </ol>
  );
}
