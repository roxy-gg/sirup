/**
 * Verifies a company can connect the same app more than once — a second Gmail
 * account, a staging and a production Sentry — and that the two stay distinct
 * all the way through the gateway.
 *
 * This is the case the wireframe showed two Gmail rows for. The backend always
 * supported it; the catalog UI was what blocked it.
 *
 * Usage: npm run check:multi-account
 */
import { ApiClient, BASE, Checks, mcpCall, uniqueEmail } from "./_harness.js";
import type {
  CatalogResponse,
  ServerListResponse,
  ServerResponse,
  SessionResponse,
} from "../shared/api.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

const UPSTREAM = "https://mcp.deepwiki.com/mcp";

const t = new Checks(`Multiple accounts per app against ${BASE}`);
const api = new ApiClient();

await api.call("POST", "/auth/register", {
  email: uniqueEmail("multi"),
  password: "supersecret123",
});
const session = await api.call<SessionResponse>("POST", "/auth/company", {
  name: "Multi Account Co",
});
const token = session.payload.company?.gateway_token ?? "";

// --- two connections to the same endpoint, with different labels ----------
const personal = await api.call<ServerResponse>("POST", "/mcp-servers", {
  name: "DeepWiki personal",
  url: UPSTREAM,
  auth_type: "none",
});
const work = await api.call<ServerResponse>("POST", "/mcp-servers", {
  name: "DeepWiki work",
  url: UPSTREAM,
  auth_type: "none",
});

t.check("first connection succeeds", personal.status === 201, personal.status);
t.check("second connection to the same app succeeds", work.status === 201, work.status);

const a = personal.payload.server;
const b = work.payload.server;

t.check("the two connections are separate records", a.id !== b.id);
t.check(
  "each gets its own namespace",
  a.slug !== b.slug,
  `${a.slug} vs ${b.slug}`,
);
t.check(
  "labels are preserved, not collapsed",
  a.name === "DeepWiki personal" && b.name === "DeepWiki work",
  `${a.name} / ${b.name}`,
);

// --- both appear in the connected list ------------------------------------
const list = await api.call<ServerListResponse>("GET", "/mcp-servers");
const sameUrl = list.payload.servers.filter((s) => s.url === UPSTREAM);
t.check("both show in the connected list", sameUrl.length === 2, sameUrl.length);

// --- and the catalog still reports the app as connected -------------------
const catalog = await api.call<CatalogResponse>("GET", "/mcp-catalog");
const entry = catalog.payload.catalog.find((c) => c.key === "deepwiki");
t.check("the catalog marks the app connected", entry?.connected === true);

// --- the gateway exposes both sets, distinctly ----------------------------
const listed = await mcpCall<{ tools: Tool[] }>(token, "tools/list", {}, 1);
const tools = listed.payload?.result?.tools ?? [];

const fromA = tools.filter((tool) => tool.name.startsWith(`${a.slug}__`));
const fromB = tools.filter((tool) => tool.name.startsWith(`${b.slug}__`));

t.check("tools from the first connection are exposed", fromA.length > 0, fromA.length);
t.check("tools from the second connection are exposed", fromB.length > 0, fromB.length);
t.check(
  "no tool name collides between the two",
  new Set(tools.map((tool) => tool.name)).size === tools.length,
  `${tools.length} tools, all uniquely named`,
);

// The model has to be able to tell them apart from the description alone,
// since the namespaced name is the only other signal it gets.
const describedA = fromA[0]?.description ?? "";
const describedB = fromB[0]?.description ?? "";
t.check(
  "descriptions name which account a tool belongs to",
  describedA.includes("DeepWiki personal") && describedB.includes("DeepWiki work"),
  `${describedA.slice(0, 40)} | ${describedB.slice(0, 40)}`,
);

// --- pausing one must not touch the other ---------------------------------
await api.call("PATCH", `/mcp-servers/${a.id}`, { enabled: false });
const afterPause = await mcpCall<{ tools: Tool[] }>(token, "tools/list", {}, 2);
const remaining = afterPause.payload?.result?.tools ?? [];

t.check(
  "pausing one account removes only its tools",
  remaining.every((tool) => !tool.name.startsWith(`${a.slug}__`)) &&
    remaining.some((tool) => tool.name.startsWith(`${b.slug}__`)),
  `${remaining.length} left of ${tools.length}`,
);

// --- disconnecting one must not touch the other ---------------------------
await api.call("DELETE", `/mcp-servers/${a.id}`);
const afterDelete = await api.call<ServerListResponse>("GET", "/mcp-servers");
t.check(
  "disconnecting one leaves the other connected",
  afterDelete.payload.servers.some((s) => s.id === b.id) &&
    !afterDelete.payload.servers.some((s) => s.id === a.id),
);

const finalList = await mcpCall<{ tools: Tool[] }>(token, "tools/list", {}, 3);
t.check(
  "the surviving account still serves its tools",
  (finalList.payload?.result?.tools ?? []).some((tool) =>
    tool.name.startsWith(`${b.slug}__`),
  ),
);

t.finish();
