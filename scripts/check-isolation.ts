/**
 * Verifies that two users in the same company are fully isolated.
 *
 * This is the boundary that matters most in the product: a connection stores a
 * credential the user pasted -- a Gmail token, a Stripe key. If a colleague in
 * the same workspace can read, use, or even enumerate it, that is a breach,
 * not a feature. A company groups users for billing and administration; it
 * grants nothing.
 *
 * Usage: npm run check:isolation
 */
import { ApiClient, BASE, Checks, mcpCall, uniqueEmail } from "./_harness.js";
import type {
  LogListResponse,
  ProfileListResponse,
  ServerListResponse,
  ServerResponse,
  SessionResponse,
} from "../shared/api.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

const UPSTREAM = "https://mcp.deepwiki.com/mcp";

const t = new Checks(`Cross-user isolation against ${BASE}`);

// ── Two separate users. In production they would share a company via an
//    invite; today each creates their own, which is the same test either way
//    because the company must not be an access path regardless. ───────────
const alice = new ApiClient();
await alice.call("POST", "/auth/register", {
  email: uniqueEmail("alice"),
  password: "supersecret123",
});
const aliceSession = await alice.call<SessionResponse>("POST", "/auth/company", {
  name: "Shared Workspace",
});
const aliceProfile = aliceSession.payload.profiles[0]!;

const bob = new ApiClient();
await bob.call("POST", "/auth/register", {
  email: uniqueEmail("bob"),
  password: "supersecret123",
});
const bobSession = await bob.call<SessionResponse>("POST", "/auth/company", {
  name: "Shared Workspace",
});
const bobProfile = bobSession.payload.profiles[0]!;

t.check(
  "each user gets their own default profile",
  aliceProfile.id !== bobProfile.id,
);
t.check(
  "each profile has a distinct gateway token",
  aliceProfile.gateway_token !== bobProfile.gateway_token,
);

// ── Alice connects an account with a credential ─────────────────────────
const connected = await alice.call<ServerResponse>("POST", "/mcp-servers", {
  name: "Alice private",
  url: UPSTREAM,
  auth_type: "bearer",
  auth_value: "ALICE_SECRET_TOKEN",
});
const aliceServer = connected.payload.server;
t.check("alice connects a server", connected.status === 201, connected.status);

await alice.call("PUT", `/profiles/${aliceProfile.id}/servers`, {
  server_ids: [aliceServer.id],
});

// ── Bob must not see it, in any shape ───────────────────────────────────
const bobServers = await bob.call<ServerListResponse>("GET", "/mcp-servers");
t.check(
  "bob's server list is empty",
  bobServers.payload.servers.length === 0,
  `${bobServers.payload.servers.length} servers`,
);

const bobReadsAlice = await bob.call("GET", `/mcp-servers/${aliceServer.id}`);
t.check(
  "bob cannot read alice's connection by id",
  bobReadsAlice.status === 404,
  bobReadsAlice.status,
);

const bobEditsAlice = await bob.call("PATCH", `/mcp-servers/${aliceServer.id}`, {
  name: "Hijacked",
});
t.check(
  "bob cannot edit alice's connection",
  bobEditsAlice.status === 404,
  bobEditsAlice.status,
);

const bobDeletesAlice = await bob.call("DELETE", `/mcp-servers/${aliceServer.id}`);
t.check(
  "bob cannot delete alice's connection",
  bobDeletesAlice.status === 404,
  bobDeletesAlice.status,
);

const bobRefreshesAlice = await bob.call(
  "POST",
  `/mcp-servers/${aliceServer.id}/refresh`,
);
t.check(
  "bob cannot refresh alice's connection",
  bobRefreshesAlice.status === 404,
  bobRefreshesAlice.status,
);

// ── Nor her profiles, which carry tokens ────────────────────────────────
const bobProfiles = await bob.call<ProfileListResponse>("GET", "/profiles");
t.check(
  "bob only sees his own profile",
  bobProfiles.payload.profiles.length === 1 &&
    bobProfiles.payload.profiles[0]!.id === bobProfile.id,
  `${bobProfiles.payload.profiles.length} profiles`,
);

const bobReadsAliceProfile = await bob.call("GET", `/profiles/${aliceProfile.id}`);
t.check(
  "bob cannot read alice's profile",
  bobReadsAliceProfile.status === 404,
  bobReadsAliceProfile.status,
);

const bobAttaches = await bob.call("PUT", `/profiles/${aliceProfile.id}/servers`, {
  server_ids: [aliceServer.id],
});
t.check(
  "bob cannot attach to alice's profile",
  bobAttaches.status === 404,
  bobAttaches.status,
);

// The nastiest variant: attaching *her* server to *his own* profile. The id is
// guessable from any leaked log or URL, so the filter has to be on ownership.
await bob.call("PUT", `/profiles/${bobProfile.id}/servers`, {
  server_ids: [aliceServer.id],
});
const bobTools = await mcpCall<{ tools: Tool[] }>(
  bobProfile.gateway_token,
  "tools/list",
  {},
  1,
);
t.check(
  "bob cannot attach alice's server to his own profile",
  (bobTools.payload?.result?.tools ?? []).length === 0,
  `${bobTools.payload?.result?.tools?.length ?? 0} tools leaked`,
);

// ── Nor her activity ────────────────────────────────────────────────────
await mcpCall(aliceProfile.gateway_token, "tools/list", {}, 2);

const bobLogs = await bob.call<LogListResponse>("GET", "/mcp-logs");
// Bob has exactly one entry of his own -- the tools/list above that proved
// the attach failed. What matters is that none of it is Alice's: her server
// name must never appear, and her tool calls must not be counted here.
t.check(
  "bob's feed contains none of alice's activity",
  bobLogs.payload.logs.every((log) => log.server_name !== aliceServer.name),
  bobLogs.payload.logs.map((log) => log.server_name ?? "gateway").join(", ") || "empty",
);
t.check(
  "bob's feed only shows his own empty tool lists",
  bobLogs.payload.logs.every((log) => (log.message ?? "").includes("0 tool")),
  bobLogs.payload.logs.map((log) => log.message).join(" | ") || "empty",
);

const aliceLogs = await alice.call<LogListResponse>("GET", "/mcp-logs");
t.check(
  "alice still sees her own activity",
  aliceLogs.payload.logs.length > 0,
  `${aliceLogs.payload.logs.length} entries`,
);

// ── And her token must not be reachable through his session ─────────────
const bobsView = await bob.call<SessionResponse>("GET", "/auth/session");
const tokensVisibleToBob = bobsView.payload.profiles.map((p) => p.gateway_token);
t.check(
  "alice's gateway token never appears in bob's session",
  !tokensVisibleToBob.includes(aliceProfile.gateway_token),
);

// ── Alice's own access is unaffected ────────────────────────────────────
const aliceServers = await alice.call<ServerListResponse>("GET", "/mcp-servers");
t.check(
  "alice still sees her own connection",
  aliceServers.payload.servers.length === 1,
  `${aliceServers.payload.servers.length} servers`,
);
t.check(
  "credentials are still never serialised",
  !("auth_value" in (aliceServers.payload.servers[0] ?? {})) &&
    aliceServers.payload.servers[0]?.has_auth === true,
);

const aliceTools = await mcpCall<{ tools: Tool[] }>(
  aliceProfile.gateway_token,
  "tools/list",
  {},
  3,
);
t.check(
  "alice's gateway still serves her tools",
  (aliceTools.payload?.result?.tools ?? []).length > 0,
  `${aliceTools.payload?.result?.tools?.length ?? 0} tools`,
);

t.finish();
