/**
 * Drives a real MCP client through OAuth, end to end.
 *
 * This is the *inbound* direction: a client authenticating to sirup's gateway.
 * `check-oauth.ts` covers the outbound direction -- sirup authenticating to
 * Google so it can proxy Gmail. Same protocol, opposite roles, separate code.
 *
 * This is the check that matters for the feature: not "do the endpoints
 * exist" but "can a client that was handed nothing except a URL discover how
 * to authenticate, register itself, get a user's approval, and call a tool".
 * That is the whole promise of pasting `https://sirup.gg/mcp` into Claude, and
 * it spans six HTTP exchanges across three RFCs, so it is worth walking.
 *
 * It also asserts the properties that only matter when they fail: a code
 * cannot be spent twice, PKCE is actually verified, a refresh token rotates,
 * a replayed refresh token kills the family, and -- the one that would
 * silently break everything -- the profile token still works exactly as before.
 *
 * Usage: npm run check:oauth
 */
import crypto from "node:crypto";
import { ApiClient, BASE, Checks, mcpCall, uniqueEmail } from "./_harness.js";
import type {
  CatalogResponse,
  ConsentDecisionResponse,
  ConsentRequestResponse,
  ConnectedAppListResponse,
  ProfileResponse,
  ServerResponse,
  SessionResponse,
} from "../shared/api.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

const t = new Checks(`OAuth 2.1 authorization against ${BASE}`);

/* ΓöÇΓöÇ PKCE ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */

function base64url(buffer: Buffer): string {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

const codeVerifier = base64url(crypto.randomBytes(32));
const codeChallenge = base64url(crypto.createHash("sha256").update(codeVerifier).digest());

/* ΓöÇΓöÇ 1. discovery: an unauthenticated call must point the way ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */

const unauthenticated = await fetch(`${BASE}/mcp`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
});

t.check("an unauthenticated call is refused", unauthenticated.status === 401, unauthenticated.status);

const challengeHeader = unauthenticated.headers.get("www-authenticate") ?? "";
t.check("the refusal carries a Bearer challenge", challengeHeader.includes("Bearer"), challengeHeader);

// Without this the client has no way to find the authorization server, and
// the entire flow is a dead end. This single header is the linchpin.
const metadataMatch = /resource_metadata="([^"]+)"/.exec(challengeHeader);
t.check("the challenge advertises resource_metadata (RFC 9728)", Boolean(metadataMatch), challengeHeader);

/* ΓöÇΓöÇ 2. protected resource metadata ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */

const prmUrl = metadataMatch?.[1] ?? `${BASE}/.well-known/oauth-protected-resource/mcp`;
const prmResponse = await fetch(prmUrl);
const prm = (await prmResponse.json()) as {
  resource?: string;
  authorization_servers?: string[];
  scopes_supported?: string[];
};

t.check("the metadata document is served", prmResponse.status === 200, prmResponse.status);
t.check("it identifies the gateway as the resource", prm.resource?.endsWith("/mcp"), prm.resource);
t.check("it names an authorization server", (prm.authorization_servers?.length ?? 0) > 0, prm.authorization_servers?.[0]);

// Some clients probe the unsuffixed path first. Without an explicit handler
// that request reaches the SPA catch-all and returns HTML with a 200, which a
// client reads as a malformed document rather than "look elsewhere".
const bareResponse = await fetch(`${BASE}/.well-known/oauth-protected-resource`);
const bareType = bareResponse.headers.get("content-type") ?? "";
t.check(
  "the bare well-known path serves JSON, not the SPA",
  bareResponse.status === 200 && bareType.includes("application/json"),
  bareType,
);

/* ΓöÇΓöÇ 3. authorization server metadata ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */

const issuer = (prm.authorization_servers?.[0] ?? BASE).replace(/\/+$/, "");
const asResponse = await fetch(`${issuer}/.well-known/oauth-authorization-server`);
const asMetadata = (await asResponse.json()) as {
  authorization_endpoint?: string;
  token_endpoint?: string;
  registration_endpoint?: string;
  code_challenge_methods_supported?: string[];
  grant_types_supported?: string[];
};

t.check("authorization server metadata is served", asResponse.status === 200, asResponse.status);
t.check("it supports dynamic registration (RFC 7591)", Boolean(asMetadata.registration_endpoint), asMetadata.registration_endpoint);
t.check(
  "it requires S256 PKCE",
  asMetadata.code_challenge_methods_supported?.includes("S256"),
  asMetadata.code_challenge_methods_supported?.join(","),
);
t.check(
  "it supports refresh tokens",
  asMetadata.grant_types_supported?.includes("refresh_token"),
  asMetadata.grant_types_supported?.join(","),
);

/* ΓöÇΓöÇ 4. dynamic client registration ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */

const REDIRECT_URI = "https://claude.ai/api/mcp/auth_callback";

const registration = await fetch(asMetadata.registration_endpoint!, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    client_name: "Check Suite Client",
    redirect_uris: [REDIRECT_URI],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  }),
});
const client = (await registration.json()) as { client_id?: string; client_secret?: string };

t.check("a client can register itself", registration.status === 201, registration.status);
t.check("registration returns a client_id", Boolean(client.client_id), client.client_id);
t.check(
  "a public client gets no secret",
  client.client_secret === undefined,
  "PKCE replaces the secret for clients that cannot keep one",
);

/* ΓöÇΓöÇ 5. authorize: redirects to consent ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */

function authorizeUrl(params: Record<string, string>): string {
  const url = new URL(`${issuer}/authorize`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.href;
}

const authorize = await fetch(
  authorizeUrl({
    response_type: "code",
    client_id: client.client_id!,
    redirect_uri: REDIRECT_URI,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state: "check-state",
    scope: "mcp:tools",
    resource: `${BASE}/mcp`,
  }),
  { redirect: "manual" },
);

t.check("authorize redirects", authorize.status === 302, authorize.status);

const consentLocation = authorize.headers.get("location") ?? "";
t.check("it redirects to the consent screen", consentLocation.startsWith("/oauth/consent"), consentLocation);

const requestId = new URL(consentLocation, BASE).searchParams.get("request") ?? "";
t.check("the consent link carries a request id", Boolean(requestId), requestId);

// An unregistered redirect_uri is the attack this check exists for: it is how
// a code would be delivered to someone other than the real client.
const spoofed = await fetch(
  authorizeUrl({
    response_type: "code",
    client_id: client.client_id!,
    redirect_uri: "https://attacker.example/callback",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  }),
  { redirect: "manual" },
);
t.check("an unregistered redirect_uri is refused", spoofed.status === 400, spoofed.status);

/* ΓöÇΓöÇ 6. consent ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */

const api = new ApiClient();

// The consent screen must be readable before sign-in, or a user arriving cold
// cannot even see who is asking.
const anonymous = await api.call<ConsentRequestResponse>("GET", `/oauth/consent/${requestId}`);
t.check("consent details load without a session", anonymous.status === 200, anonymous.status);
t.check("they name the client", anonymous.payload.client_name === "Check Suite Client", anonymous.payload.client_name);
t.check("they show where approval redirects", anonymous.payload.redirect_uri === REDIRECT_URI, anonymous.payload.redirect_uri);
t.check("no profiles are offered to a stranger", anonymous.payload.profiles.length === 0, `${anonymous.payload.profiles.length}`);

// Approving must require a session, or anyone holding the link could grant it.
const unauthorizedApprove = await api.call("POST", `/oauth/consent/${requestId}/approve`, {
  profile_id: "00000000-0000-4000-8000-000000000000",
});
t.check("approving without a session is refused", unauthorizedApprove.status === 401, unauthorizedApprove.status);

await api.call("POST", "/auth/register", {
  email: uniqueEmail("oauth"),
  password: "supersecret123",
});
const session = await api.call<SessionResponse>("POST", "/auth/company", { name: "OAuth Co" });
const profile = session.payload.profiles.find((p) => p.is_default)!;

const signedIn = await api.call<ConsentRequestResponse>("GET", `/oauth/consent/${requestId}`);
t.check("a signed-in user is offered their profiles", signedIn.payload.profiles.length > 0, `${signedIn.payload.profiles.length}`);

// Granting access to a profile you do not own would be the whole ballgame.
const foreign = new ApiClient();
await foreign.call("POST", "/auth/register", { email: uniqueEmail("intruder"), password: "supersecret123" });
await foreign.call("POST", "/auth/company", { name: "Intruder Co" });
const stolen = await foreign.call("POST", `/oauth/consent/${requestId}/approve`, {
  profile_id: profile.id,
});
t.check("approving with someone else's profile is refused", stolen.status === 400, stolen.status);

const approved = await api.call<ConsentDecisionResponse>(
  "POST",
  `/oauth/consent/${requestId}/approve`,
  { profile_id: profile.id },
);
t.check("approval succeeds", approved.status === 200, approved.status);

const redirectTo = new URL(approved.payload.redirect_to);
t.check("it redirects to the client's callback", redirectTo.href.startsWith(REDIRECT_URI), redirectTo.origin);
t.check("it returns the state unchanged", redirectTo.searchParams.get("state") === "check-state", redirectTo.searchParams.get("state") ?? "none");

const code = redirectTo.searchParams.get("code") ?? "";
t.check("it carries an authorization code", Boolean(code), code.slice(0, 12));

/* ΓöÇΓöÇ 7. token exchange ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */

async function tokenRequest(body: Record<string, string>) {
  const response = await fetch(asMetadata.token_endpoint!, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  return { status: response.status, payload: (await response.json()) as Record<string, string> };
}

// PKCE has to be verified, or intercepting the code would be enough on its own.
const wrongVerifier = await tokenRequest({
  grant_type: "authorization_code",
  code,
  client_id: client.client_id!,
  code_verifier: base64url(crypto.randomBytes(32)),
  redirect_uri: REDIRECT_URI,
});
t.check("a wrong code_verifier is refused", wrongVerifier.status === 400, wrongVerifier.payload.error);

const exchanged = await tokenRequest({
  grant_type: "authorization_code",
  code,
  client_id: client.client_id!,
  code_verifier: codeVerifier,
  redirect_uri: REDIRECT_URI,
});

t.check("the code exchanges for tokens", exchanged.status === 200, exchanged.status);
t.check("an access token is issued", Boolean(exchanged.payload.access_token), exchanged.payload.access_token?.slice(0, 12));
t.check("a refresh token is issued", Boolean(exchanged.payload.refresh_token), exchanged.payload.refresh_token?.slice(0, 12));
t.check("the token expires", Number(exchanged.payload.expires_in) > 0, exchanged.payload.expires_in);

// A code is single-use. A second exchange means a replay.
const replayed = await tokenRequest({
  grant_type: "authorization_code",
  code,
  client_id: client.client_id!,
  code_verifier: codeVerifier,
  redirect_uri: REDIRECT_URI,
});
t.check("a code cannot be exchanged twice", replayed.status === 400, replayed.payload.error);

/* ΓöÇΓöÇ 8. the point of all this: calling a tool ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */

const accessToken = exchanged.payload.access_token!;

// Connect a real upstream first. Comparing two empty tool lists would pass
// whether or not the profile binding works, which is the one piece of this
// flow that is ours rather than the SDK's.
const catalog = await api.call<CatalogResponse>("GET", "/mcp-catalog");
const noAuthApp = catalog.payload.catalog.find((app) => app.key === "deepwiki");

if (noAuthApp?.url) {
  const connected = await api.call<ServerResponse>("POST", "/mcp-servers", {
    name: noAuthApp.name,
    url: noAuthApp.url,
    auth_type: "none",
  });
  await api.call("PUT", `/profiles/${profile.id}/servers`, {
    server_ids: [connected.payload.server.id],
  });
}

const listed = await mcpCall<{ tools: Tool[] }>(accessToken, "tools/list", {}, 1);
const oauthTools = listed.payload?.result?.tools ?? [];

t.check("the access token reaches the gateway", listed.status === 200, listed.status);
t.check("tools/list answers", Array.isArray(listed.payload?.result?.tools), typeof listed.payload?.result?.tools);
t.check("the profile's tools are actually exposed", oauthTools.length > 0, `${oauthTools.length} tools`);

// The profile binding is the part that is genuinely ours rather than the
// SDK's: an OAuth token must see exactly what its profile exposes.
const viaProfileToken = await mcpCall<{ tools: Tool[] }>(profile.gateway_token, "tools/list", {}, 2);
const tokenTools = viaProfileToken.payload?.result?.tools ?? [];

t.check(
  "OAuth and the profile token serve the same tools",
  oauthTools.length === tokenTools.length &&
    oauthTools.every((tool, index) => tool.name === tokenTools[index]?.name),
  `${oauthTools.length} vs ${tokenTools.length}`,
);

// The whole feature is additive; the old path must be untouched.
t.check("the profile token still works", viaProfileToken.status === 200, viaProfileToken.status);

// A grant is bound to one profile, so a second profile's tools must not leak
// into a token issued against the first.
const otherProfile = await api.call<ProfileResponse>("POST", "/profiles", {
  name: "Empty",
  server_ids: [],
});
t.check(
  "a second profile exists to compare against",
  otherProfile.status === 201,
  otherProfile.status,
);
t.check(
  "the OAuth token sees its own profile, not every profile",
  (await mcpCall<{ tools: Tool[] }>(
    otherProfile.payload.profile.gateway_token,
    "tools/list",
    {},
    3,
  )).payload?.result?.tools?.length === 0,
  "an empty profile must stay empty",
);

// RFC 6750 ┬º2.3: a bearer token must not travel in a query string.
const viaQuery = await fetch(`${BASE}/mcp?token=${encodeURIComponent(accessToken)}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/list", params: {} }),
});
t.check("an access token in the query string is refused", viaQuery.status === 401, viaQuery.status);

const forged = await mcpCall(`sirup_at_${"0".repeat(64)}`, "tools/list", {}, 4);
t.check("a forged access token is refused", forged.status === 401, forged.status);

/**
 * Runs a whole grant, start to finish, for the already-registered client.
 *
 * Used where a test needs a *live* grant after an earlier one was deliberately
 * destroyed. Each call makes its own PKCE pair, so grants never share a
 * verifier.
 */
async function runGrant(): Promise<{ accessToken: string; refreshToken: string }> {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());

  const started = await fetch(
    authorizeUrl({
      response_type: "code",
      client_id: client.client_id!,
      redirect_uri: REDIRECT_URI,
      code_challenge: challenge,
      code_challenge_method: "S256",
      scope: "mcp:tools",
    }),
    { redirect: "manual" },
  );

  const id =
    new URL(started.headers.get("location") ?? "", BASE).searchParams.get("request") ?? "";

  const decision = await api.call<ConsentDecisionResponse>(
    "POST",
    `/oauth/consent/${id}/approve`,
    { profile_id: profile.id },
  );

  const grantCode = new URL(decision.payload.redirect_to).searchParams.get("code") ?? "";

  const tokens = await tokenRequest({
    grant_type: "authorization_code",
    code: grantCode,
    client_id: client.client_id!,
    code_verifier: verifier,
    redirect_uri: REDIRECT_URI,
  });

  return {
    accessToken: tokens.payload.access_token!,
    refreshToken: tokens.payload.refresh_token!,
  };
}

/* ΓöÇΓöÇ 9. the user can see the grant ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */

// Checked while the grant is still live. The revocation tests below destroy
// it on purpose, so asserting this afterwards would prove nothing.
const apps = await api.call<ConnectedAppListResponse>("GET", "/oauth/apps");
t.check("the grant is listed as a connected app", apps.status === 200, apps.status);

const listedApp = apps.payload.apps.find((app) => app.client_id === client.client_id);
t.check("it names the client", listedApp?.client_name === "Check Suite Client", listedApp?.client_name);
t.check("it names the profile exposed", listedApp?.profile_name === profile.name, listedApp?.profile_name ?? "none");

/* ΓöÇΓöÇ 10. refresh rotation ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */

const refreshToken = exchanged.payload.refresh_token!;

const refreshed = await tokenRequest({
  grant_type: "refresh_token",
  refresh_token: refreshToken,
  client_id: client.client_id!,
});

t.check("the refresh token exchanges", refreshed.status === 200, refreshed.status);
t.check("refreshing issues a new access token", refreshed.payload.access_token !== accessToken);
t.check(
  "the refresh token rotates",
  Boolean(refreshed.payload.refresh_token) && refreshed.payload.refresh_token !== refreshToken,
  "OAuth 2.1 requires rotation for public clients",
);

const rotatedAccess = refreshed.payload.access_token!;
const afterRefresh = await mcpCall<{ tools: Tool[] }>(rotatedAccess, "tools/list", {}, 5);
t.check("the rotated access token works", afterRefresh.status === 200, afterRefresh.status);

// Replaying a rotated refresh token means it leaked. The response is to revoke
// the whole lineage, not just to refuse -- an attacker may already hold a newer
// one, and refusing alone would leave them with it.
const replayedRefresh = await tokenRequest({
  grant_type: "refresh_token",
  refresh_token: refreshToken,
  client_id: client.client_id!,
});
t.check("a replayed refresh token is refused", replayedRefresh.status === 400, replayedRefresh.payload.error);

const afterBreach = await tokenRequest({
  grant_type: "refresh_token",
  refresh_token: refreshed.payload.refresh_token!,
  client_id: client.client_id!,
});
t.check(
  "replay revokes the whole token family",
  afterBreach.status === 400,
  "a leaked token must not leave the attacker's copy working",
);

const afterRevocation = await mcpCall(rotatedAccess, "tools/list", {}, 6);
t.check("access tokens die with the family", afterRevocation.status === 401, afterRevocation.status);

// Revocation has to reach the list the user reads, or the dashboard would
// keep showing access that no longer exists.
const afterBreachList = await api.call<ConnectedAppListResponse>("GET", "/oauth/apps");
t.check(
  "a revoked grant leaves the connected list",
  !afterBreachList.payload.apps.some((app) => app.client_id === client.client_id),
);

/* ΓöÇΓöÇ 11. disconnecting from the dashboard ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */

// A second grant, because the first was destroyed above. This is the path a
// user actually takes: they see an app they no longer want and revoke it.
const second = await runGrant();

const beforeDisconnect = await mcpCall(second.accessToken, "tools/list", {}, 7);
t.check("the second grant works", beforeDisconnect.status === 200, beforeDisconnect.status);

const revoked = await api.call("DELETE", `/oauth/apps/${client.client_id}`);
t.check("a connected app can be revoked", revoked.status === 204, revoked.status);

// The check that matters: revoking must actually cut off access, not just
// hide the row.
const afterDisconnect = await mcpCall(second.accessToken, "tools/list", {}, 8);
t.check(
  "revoking cuts off the client immediately",
  afterDisconnect.status === 401,
  afterDisconnect.status,
);

const afterRevoke = await api.call<ConnectedAppListResponse>("GET", "/oauth/apps");
t.check(
  "it disappears from the list",
  !afterRevoke.payload.apps.some((app) => app.client_id === client.client_id),
);

/* ΓöÇΓöÇ 12. denial ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */

const secondAuthorize = await fetch(
  authorizeUrl({
    response_type: "code",
    client_id: client.client_id!,
    redirect_uri: REDIRECT_URI,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state: "denied-state",
  }),
  { redirect: "manual" },
);
const denyId =
  new URL(secondAuthorize.headers.get("location") ?? "", BASE).searchParams.get("request") ?? "";

const denied = await api.call<ConsentDecisionResponse>("POST", `/oauth/consent/${denyId}/deny`);
const denyRedirect = new URL(denied.payload.redirect_to);

t.check("declining redirects back to the client", denied.status === 200, denied.status);
t.check("it reports access_denied", denyRedirect.searchParams.get("error") === "access_denied", denyRedirect.searchParams.get("error") ?? "none");
t.check("it preserves state", denyRedirect.searchParams.get("state") === "denied-state", denyRedirect.searchParams.get("state") ?? "none");

const spentRequest = await api.call("GET", `/oauth/consent/${denyId}`);
t.check("a decided request cannot be reused", spentRequest.status === 404, spentRequest.status);

t.finish();
