/**
 * End-to-end smoke test against a running dev server.
 *
 * Exercises the real product path: register -> create company -> connect a live
 * upstream MCP server -> speak MCP to the gateway as a client would and confirm
 * the upstream's tools come back namespaced.
 *
 * Usage: npm run check:smoke
 */
import { ApiClient, BASE, Checks, mcpCall, uniqueEmail } from "./_harness.js";
import type {
  CatalogResponse,
  LogListResponse,
  LogSummaryResponse,
  ServerListResponse,
  ServerResponse,
  SessionResponse,
} from "../shared/api.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

// A public, no-auth MCP server, so the test needs no credentials.
const UPSTREAM = process.env.UPSTREAM_MCP ?? "https://mcp.deepwiki.com/mcp";

const t = new Checks(`Smoke test against ${BASE}`);
const api = new ApiClient();

// --- health ---
const health = await api.call<{ ok: boolean }>("GET", "/health");
t.check("health endpoint responds", health.payload?.ok);

// --- auth ---
const email = uniqueEmail("smoke");
const registered = await api.call("POST", "/auth/register", {
  email,
  password: "supersecret123",
});
t.check("register creates an account", registered.status === 201, registered.status);

const weak = await api.call("POST", "/auth/register", {
  email: uniqueEmail("weak"),
  password: "short",
});
t.check("short password is rejected", weak.status === 400, weak.status);

const duplicate = await api.call("POST", "/auth/register", {
  email,
  password: "supersecret123",
});
t.check("duplicate email is rejected", duplicate.status === 409, duplicate.status);

// --- gateway must reject an unauthenticated client ---
const noToken = await fetch(`${BASE}/mcp`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
});
t.check("gateway rejects a missing token", noToken.status === 401, noToken.status);

// --- company / onboarding ---
const company = await api.call<SessionResponse>("POST", "/auth/company", {
  name: "Acme Inc",
});
const token = company.payload?.company?.gateway_token ?? "";
t.check("company creation mints a gateway token", Boolean(token));
// Slugs are globally unique, so a rerun against a warm DB gets a suffix.
t.check(
  "company slug is derived from the name",
  company.payload?.company?.slug?.startsWith("acme-inc"),
  company.payload?.company?.slug,
);

// --- catalog ---
const catalog = await api.call<CatalogResponse>("GET", "/mcp-catalog");
t.check("catalog is served", (catalog.payload?.catalog?.length ?? 0) > 0);

// --- connect a real upstream MCP server ---
console.log(`\n  connecting upstream: ${UPSTREAM}`);
const connected = await api.call<ServerResponse>("POST", "/mcp-servers", {
  name: "DeepWiki",
  url: UPSTREAM,
  auth_type: "none",
});

const server = connected.payload?.server;
const isLive = server?.status === "connected";
t.check("upstream server is saved", connected.status === 201, connected.status);

if (!isLive) {
  console.log(`  NOTE upstream unreachable (${server?.status_message ?? "unknown"}).`);
  console.log("       Aggregation checks need network access; skipping them.\n");
} else {
  t.check(
    "upstream tools are discovered",
    server.tool_count > 0,
    `${server.tool_count} tools`,
  );
}

// --- speak MCP to the gateway ---
const initialized = await mcpCall<{ serverInfo: { name: string } }>(
  token,
  "initialize",
  {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "smoke-test", version: "1.0.0" },
  },
  1,
);
t.check(
  "gateway completes initialize",
  initialized.payload?.result?.serverInfo?.name === "sirup-gg",
  JSON.stringify(initialized.payload?.result?.serverInfo ?? initialized.payload),
);

const listed = await mcpCall<{ tools: Tool[] }>(token, "tools/list", {}, 2);
const tools = listed.payload?.result?.tools ?? [];
t.check("gateway serves tools/list", Array.isArray(tools), `${tools.length} tools`);

if (isLive && server) {
  t.check(
    "aggregated tools are namespaced",
    tools.length > 0 && tools.every((tool) => tool.name.includes("__")),
    tools
      .slice(0, 3)
      .map((tool) => tool.name)
      .join(", "),
  );

  t.check(
    "tool count matches the upstream",
    tools.length === server.tool_count,
    `gateway ${tools.length} vs upstream ${server.tool_count}`,
  );
}

// --- an unknown tool must fail cleanly, not crash the gateway ---
const bogus = await mcpCall<{ isError: boolean; content: Array<{ text: string }> }>(
  token,
  "tools/call",
  { name: "nope__does_not_exist", arguments: {} },
  3,
);
t.check(
  "unknown tool returns a tool error",
  bogus.payload?.result?.isError === true,
  JSON.stringify(bogus.payload?.result?.content?.[0]?.text ?? bogus.payload),
);

// --- a wrong token must not see another company's tools ---
const wrongToken = await mcpCall("sirup_not_a_real_token", "tools/list", {}, 4);
t.check(
  "gateway rejects an invalid token",
  wrongToken.status === 401,
  wrongToken.status,
);

// --- logs recorded what crossed the gateway ---
const logs = await api.call<LogListResponse>("GET", "/mcp-logs");
t.check(
  "gateway activity is logged",
  (logs.payload?.logs?.length ?? 0) > 0,
  `${logs.payload?.logs?.length ?? 0} entries`,
);

const summary = await api.call<LogSummaryResponse>("GET", "/mcp-logs/summary");
t.check(
  "log summary is computed",
  typeof summary.payload?.summary?.total === "number",
  JSON.stringify(summary.payload?.summary),
);

// --- tenant isolation: a second company must not see the first's servers ---
api.clearSession();
await api.call("POST", "/auth/register", {
  email: uniqueEmail("other"),
  password: "supersecret123",
});
await api.call("POST", "/auth/company", { name: "Other Corp" });
const otherServers = await api.call<ServerListResponse>("GET", "/mcp-servers");
t.check(
  "a new company sees no other company's servers",
  otherServers.payload?.servers?.length === 0,
  `${otherServers.payload?.servers?.length} servers`,
);

t.finish();
