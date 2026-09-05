/**
 * Verifies profiles: many-to-many attachment, and per-profile token scoping.
 *
 * The scoping is a security boundary, not a convenience. A token resolves to
 * exactly one profile, and must only ever reach the connections that profile
 * exposes -- naming a tool it does not have must fail, not fall through to the
 * company's full set.
 *
 * Usage: npm run check:profiles
 */
import { ApiClient, BASE, Checks, mcpCall, uniqueEmail } from "./_harness.js";
import type {
  ProfileListResponse,
  ProfileResponse,
  ServerResponse,
  SessionResponse,
} from "../shared/api.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

const DEEPWIKI = "https://mcp.deepwiki.com/mcp";
const CFDOCS = "https://docs.mcp.cloudflare.com/mcp";

const t = new Checks(`Profiles against ${BASE}`);
const api = new ApiClient();

await api.call("POST", "/auth/register", {
  email: uniqueEmail("profiles"),
  password: "supersecret123",
});
const session = await api.call<SessionResponse>("POST", "/auth/company", {
  name: "Profiles Co",
});

// --- onboarding creates exactly one default profile ------------------------
t.check(
  "a new company gets one profile",
  session.payload.profiles?.length === 1,
  session.payload.profiles?.length,
);

const main = session.payload.profiles[0]!;
t.check("it is the default", main.is_default === true);
t.check("it carries a gateway token", main.gateway_token.startsWith("sirup_"));
t.check(
  "the company no longer carries a token",
  !("gateway_token" in (session.payload.company ?? {})),
);

// --- two connections, both attached to Main by the UI flow -----------------
const deepwiki = await api.call<ServerResponse>("POST", "/mcp-servers", {
  name: "DeepWiki",
  url: DEEPWIKI,
  auth_type: "none",
});
const cloudflare = await api.call<ServerResponse>("POST", "/mcp-servers", {
  name: "Cloudflare Docs",
  url: CFDOCS,
  auth_type: "none",
});

const dwId = deepwiki.payload.server.id;
const cfId = cloudflare.payload.server.id;

// Connecting does not attach on the server -- the client does, to whichever
// profile is active. Attach both to Main explicitly.
await api.call("PUT", `/profiles/${main.id}/servers`, { server_ids: [dwId, cfId] });

const mainTools = await mcpCall<{ tools: Tool[] }>(main.gateway_token, "tools/list", {}, 1);
const mainCount = mainTools.payload?.result?.tools?.length ?? 0;
t.check("the default profile serves both connections", mainCount > 3, `${mainCount} tools`);

// --- a second profile with only one connection ----------------------------
const narrow = await api.call<ProfileResponse>("POST", "/profiles", {
  name: "Docs only",
  server_ids: [cfId],
});
const narrowProfile = narrow.payload.profile;

t.check("a second profile is created", narrow.status === 201, narrow.status);
t.check(
  "it gets its own distinct token",
  narrowProfile.gateway_token !== main.gateway_token,
);
t.check("it reports one connection", narrowProfile.server_count === 1, narrowProfile.server_count);

// --- the two tokens must serve different tool sets ------------------------
const narrowTools = await mcpCall<{ tools: Tool[] }>(
  narrowProfile.gateway_token,
  "tools/list",
  {},
  2,
);
const narrowList = narrowTools.payload?.result?.tools ?? [];

t.check(
  "the narrow profile serves fewer tools",
  narrowList.length > 0 && narrowList.length < mainCount,
  `${narrowList.length} vs ${mainCount}`,
);
t.check(
  "it serves none of the excluded connection's tools",
  narrowList.every((tool) => !tool.name.startsWith("deepwiki__")),
  narrowList.map((tool) => tool.name).join(", "),
);

// --- and a tool it does not expose must be refused, not forwarded ---------
// This is the boundary that matters: without profile scoping in resolveTool,
// naming a tool from another profile would silently work.
const forbidden = await mcpCall<{ isError: boolean; content: Array<{ text: string }> }>(
  narrowProfile.gateway_token,
  "tools/call",
  { name: "deepwiki__ask_question", arguments: { repoName: "a/b", question: "hi" } },
  3,
);
t.check(
  "calling a tool outside the profile is refused",
  forbidden.payload?.result?.isError === true,
  forbidden.payload?.result?.content?.[0]?.text?.slice(0, 60),
);

// --- many-to-many: one connection in several profiles ---------------------
const shared = await api.call<ProfileListResponse>("GET", "/profiles");
t.check("both profiles are listed", shared.payload.profiles.length === 2);

const cfInMain = await api.call<{ server_ids: string[] }>(
  "GET",
  `/profiles/${main.id}/servers`,
);
const cfInNarrow = await api.call<{ server_ids: string[] }>(
  "GET",
  `/profiles/${narrowProfile.id}/servers`,
);
t.check(
  "one connection can belong to two profiles at once",
  cfInMain.payload.server_ids.includes(cfId) &&
    cfInNarrow.payload.server_ids.includes(cfId),
);

// --- detaching from one profile must not affect the other -----------------
await api.call("PUT", `/profiles/${narrowProfile.id}/servers`, { server_ids: [] });

const afterDetach = await mcpCall<{ tools: Tool[] }>(
  narrowProfile.gateway_token,
  "tools/list",
  {},
  4,
);
t.check(
  "detaching empties that profile",
  (afterDetach.payload?.result?.tools ?? []).length === 0,
);

const mainUnchanged = await mcpCall<{ tools: Tool[] }>(
  main.gateway_token,
  "tools/list",
  {},
  5,
);
t.check(
  "the other profile is untouched",
  (mainUnchanged.payload?.result?.tools ?? []).length === mainCount,
  `${mainUnchanged.payload?.result?.tools?.length} of ${mainCount}`,
);

// --- guardrails -----------------------------------------------------------
const deleteDefault = await api.call("DELETE", `/profiles/${main.id}`);
t.check(
  "the default profile cannot be deleted",
  deleteDefault.status === 400,
  deleteDefault.status,
);

await api.call("DELETE", `/profiles/${narrowProfile.id}`);
const remaining = await api.call<ProfileListResponse>("GET", "/profiles");
t.check("a non-default profile can be deleted", remaining.payload.profiles.length === 1);

const deleteLast = await api.call("DELETE", `/profiles/${main.id}`);
t.check(
  "the last profile cannot be deleted",
  deleteLast.status === 400,
  deleteLast.status,
);

// --- cross-tenant: another company must not reach these profiles ----------
api.clearSession();
await api.call("POST", "/auth/register", {
  email: uniqueEmail("other"),
  password: "supersecret123",
});
await api.call("POST", "/auth/company", { name: "Other Co" });

const stolen = await api.call("GET", `/profiles/${main.id}`);
t.check(
  "another company cannot read this profile",
  stolen.status === 404,
  stolen.status,
);

const stolenAttach = await api.call("PUT", `/profiles/${main.id}/servers`, {
  server_ids: [dwId],
});
t.check(
  "another company cannot attach to it",
  stolenAttach.status === 404,
  stolenAttach.status,
);

t.finish();
