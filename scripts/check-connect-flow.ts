/**
 * Verifies the connect-then-permissions flow the ConnectSheet drives.
 *
 * The sheet is two-phase: POST /mcp-servers returns the server *with its
 * discovered tools*, and the permission step then disables the ones the user
 * unchecked. This asserts both halves against a live upstream, including that
 * a disabled tool actually disappears from the gateway's tools/list.
 *
 * Usage: npm run check:connect-flow
 */
import { ApiClient, BASE, Checks, mcpCall, uniqueEmail } from "./_harness.js";
import type {
  CatalogResponse,
  ServerResponse,
  SessionResponse,
} from "../shared/api.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

const t = new Checks(`Connect flow against ${BASE}`);
const api = new ApiClient();

await api.call("POST", "/auth/register", {
  email: uniqueEmail("connect"),
  password: "supersecret123",
});
const session = await api.call<SessionResponse>("POST", "/auth/company", {
  name: "Connect Co",
});
const token = session.payload.company?.gateway_token ?? "";

// --- the catalog must expose what the grid renders ---
const catalog = await api.call<CatalogResponse>("GET", "/mcp-catalog");
const apps = catalog.payload.catalog;
t.check("catalog is served", apps.length >= 40, `${apps.length} apps`);

const deepwiki = apps.find((app) => app.key === "deepwiki");
t.check("a no-auth app is present", deepwiki?.auth === "none", deepwiki?.auth);

const github = apps.find((app) => app.key === "github");
t.check("a token app carries an icon and hint", Boolean(github?.icon && github.auth_hint),
  github?.icon ?? "no icon");

const exa = apps.find((app) => app.key === "exa");
t.check(
  "a custom-header app names its header",
  exa?.auth_type === "header" && exa.auth_header_name === "x-api-key",
  exa?.auth_header_name,
);

const oauthApp = apps.find((app) => app.auth === "oauth");
t.check(
  "oauth apps are flagged so the grid can disable them",
  Boolean(oauthApp),
  oauthApp?.name,
);

// --- phase 1: connect returns the server WITH its tools ---
if (!deepwiki?.url) throw new Error("catalog is missing the deepwiki entry");

const connected = await api.call<ServerResponse>("POST", "/mcp-servers", {
  name: deepwiki.name,
  url: deepwiki.url,
  auth_type: "none",
});
const server = connected.payload.server;

t.check("connect succeeds", connected.status === 201, connected.status);
t.check("server reports connected", server.status === "connected", server.status);
t.check(
  "connect returns the discovered tools inline",
  Array.isArray(server.tools) && server.tools.length > 0,
  `${server.tools?.length ?? 0} tools`,
);
t.check(
  "tools arrive enabled by default",
  server.tools.every((tool) => tool.enabled),
);

// --- the catalog now marks it Added, so the grid stops offering Connect ---
const after = await api.call<CatalogResponse>("GET", "/mcp-catalog");
t.check(
  "catalog marks the app as connected",
  after.payload.catalog.find((app) => app.key === "deepwiki")?.connected === true,
);

// --- phase 2: disabling a tool must remove it from the gateway ---
const before = await mcpCall<{ tools: Tool[] }>(token, "tools/list", {}, 1);
const beforeCount = before.payload?.result?.tools?.length ?? 0;

const victim = server.tools[0];
if (!victim) throw new Error("no tool to disable");

const toggled = await api.call("PATCH", `/mcp-servers/${server.id}/tools/${victim.id}`, {
  enabled: false,
});
t.check("a tool can be disabled", toggled.status === 200, toggled.status);

const afterList = await mcpCall<{ tools: Tool[] }>(token, "tools/list", {}, 2);
const afterTools = afterList.payload?.result?.tools ?? [];

t.check(
  "the disabled tool disappears from tools/list",
  afterTools.length === beforeCount - 1,
  `${beforeCount} -> ${afterTools.length}`,
);
t.check(
  "the disabled tool is the right one",
  !afterTools.some((tool) => tool.name === victim.namespaced_name),
  victim.namespaced_name,
);

// --- and calling it is refused, not silently forwarded ---
const blocked = await mcpCall<{ isError: boolean }>(
  token,
  "tools/call",
  { name: victim.namespaced_name, arguments: {} },
  3,
);
t.check(
  "calling a disabled tool is refused",
  blocked.payload?.result?.isError === true,
  "a revoked permission must actually revoke",
);

// --- re-enabling restores it ---
await api.call("PATCH", `/mcp-servers/${server.id}/tools/${victim.id}`, {
  enabled: true,
});
const restored = await mcpCall<{ tools: Tool[] }>(token, "tools/list", {}, 4);
t.check(
  "re-enabling restores the tool",
  (restored.payload?.result?.tools?.length ?? 0) === beforeCount,
  `${restored.payload?.result?.tools?.length} of ${beforeCount}`,
);

// --- a refresh must not clobber the user's permission choices ---
await api.call("PATCH", `/mcp-servers/${server.id}/tools/${victim.id}`, {
  enabled: false,
});
await api.call("POST", `/mcp-servers/${server.id}/refresh`);
const afterRefresh = await api.call<ServerResponse>("GET", `/mcp-servers/${server.id}`);
const stillDisabled = afterRefresh.payload.server.tools.find(
  (tool) => tool.name === victim.name,
);
t.check(
  "re-discovery preserves disabled tools",
  stillDisabled?.enabled === false,
  "permissions must survive a refresh",
);

t.finish();
