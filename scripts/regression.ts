/**
 * Regression tests for bugs found in review. Each check maps to a specific
 * defect that was fixed; they exist so it can't silently come back.
 *
 * Usage: npm run check:regression
 */
import { ApiClient, BASE, Checks, uniqueEmail } from "./_harness.js";
import type { LogListResponse, ServerResponse, SessionResponse } from "../shared/api.js";

const t = new Checks(`Regression tests against ${BASE}`);
const api = new ApiClient();

await api.call("POST", "/auth/register", {
  email: uniqueEmail("regress"),
  password: "supersecret123",
});
await api.call("POST", "/auth/company", { name: "Regression Co" });

const created = await api.call<ServerResponse>("POST", "/mcp-servers", {
  name: "Secret Server",
  url: "https://mcp.example-unreachable.dev/mcp",
  auth_type: "bearer",
  auth_value: "ORIGINAL_TOKEN",
});
const serverId = created.payload.server.id;

// --- credentials must never reach the browser ---
t.check(
  "auth_value is stripped from responses",
  !("auth_value" in created.payload.server) && created.payload.server.has_auth === true,
  JSON.stringify({ has_auth: created.payload.server.has_auth }),
);

// --- BUG: rotating a credential alone silently discarded the new value ---
const rotated = await api.call("PATCH", `/mcp-servers/${serverId}`, {
  auth_value: "ROTATED_TOKEN",
});
t.check("rotating auth_value alone is accepted", rotated.status === 200, rotated.status);

// --- BUG: changing auth_type carried the OLD credential into the new type ---
const transplant = await api.call("PATCH", `/mcp-servers/${serverId}`, {
  auth_type: "header",
  auth_header_name: "X-Api-Key",
});
t.check(
  "changing auth type without a new credential is rejected",
  transplant.status === 400,
  `${transplant.status}: ${transplant.payload?.error}`,
);

// --- BUG: the audit trail was cascade-deleted with its server ---
const beforeLogs = await api.call<LogListResponse>("GET", "/mcp-logs");
const countBefore = beforeLogs.payload.logs.length;
t.check("activity was logged before deletion", countBefore > 0, `${countBefore} entries`);

await api.call("DELETE", `/mcp-servers/${serverId}`);
const afterLogs = await api.call<LogListResponse>("GET", "/mcp-logs");
const countAfter = afterLogs.payload.logs.length;
t.check(
  "audit log survives disconnecting the server",
  countAfter >= countBefore,
  `${countBefore} before -> ${countAfter} after`,
);

// --- BUG: an unvalidated ?server= param 400'd the logs request ---
const badFilter = await api.call("GET", "/mcp-logs?server_id=abc");
t.check(
  "a non-uuid server filter is rejected cleanly, not a crash",
  badFilter.status === 400,
  badFilter.status,
);

// --- an unauthenticated request must 401, never hang or crash ---
const saved = api.sessionCookie;
api.clearSession();
const anon = await api.call("GET", "/mcp-servers");
t.check("unauthenticated request gets 401", anon.status === 401, anon.status);
api.sessionCookie = saved;

// --- BUG: slug allocation gave up after nine candidates ---
// The tenth company sharing a name got an unreadable random-hex slug, because
// createCompany probed a fixed list of guesses instead of reading the family.
const SHARED_NAME = "Slug Collision Co";
const slugs: string[] = [];
for (let i = 0; i < 12; i += 1) {
  const fresh = new ApiClient();
  await fresh.call("POST", "/auth/register", {
    email: uniqueEmail("slug"),
    password: "supersecret123",
  });
  const created = await fresh.call<SessionResponse>("POST", "/auth/company", {
    name: SHARED_NAME,
  });
  const slug = created.payload?.company?.slug;
  if (slug) slugs.push(slug);
}

t.check("twelve same-named companies all got a slug", slugs.length === 12, slugs.length);
t.check(
  "every slug is unique",
  new Set(slugs).size === slugs.length,
  `${new Set(slugs).size} distinct`,
);
t.check(
  "slugs stay readable past the tenth",
  slugs.every((slug) => /^slug-collision-co(-\d+)?$/.test(slug)),
  slugs.filter((slug) => !/^slug-collision-co(-\d+)?$/.test(slug)).join(", ") || "all numbered",
);

// --- concurrent signups with the same name must not 500 ---
// Both read the same set of taken slugs, so the database has to arbitrate.
const concurrent = await Promise.all(
  Array.from({ length: 4 }, async () => {
    const fresh = new ApiClient();
    await fresh.call("POST", "/auth/register", {
      email: uniqueEmail("race"),
      password: "supersecret123",
    });
    return fresh.call<SessionResponse>("POST", "/auth/company", { name: "Race Co" });
  }),
);
t.check(
  "concurrent same-name signups all succeed",
  concurrent.every((r) => r.status === 201),
  concurrent.map((r) => r.status).join(", "),
);
t.check(
  "concurrent signups got distinct slugs",
  new Set(concurrent.map((r) => r.payload?.company?.slug)).size === concurrent.length,
  concurrent.map((r) => r.payload?.company?.slug).join(", "),
);

// --- BUG: register returned no `profiles` key, crashing the client ---
// Every endpoint that answers with a session must return the same shape. The
// client treats `profiles` as an array on every render, so one endpoint
// omitting it blanked the page immediately after signup.
const shapes = new ApiClient();
const registerBody = await shapes.call<SessionResponse>("POST", "/auth/register", {
  email: uniqueEmail("shape"),
  password: "supersecret123",
});
t.check(
  "register returns a full session shape",
  Array.isArray(registerBody.payload.profiles) &&
    "user" in registerBody.payload &&
    "company" in registerBody.payload,
  JSON.stringify(Object.keys(registerBody.payload)),
);
t.check(
  "register reports no company yet",
  registerBody.payload.company === null,
  String(registerBody.payload.company),
);

const companyBody = await shapes.call<SessionResponse>("POST", "/auth/company", {
  name: "Shape Co",
});
t.check(
  "company creation returns the same shape",
  Array.isArray(companyBody.payload.profiles) && companyBody.payload.profiles.length === 1,
  JSON.stringify(Object.keys(companyBody.payload)),
);

const sessionBody = await shapes.call<SessionResponse>("GET", "/auth/session");
t.check(
  "GET session returns the same shape",
  Array.isArray(sessionBody.payload.profiles),
  JSON.stringify(Object.keys(sessionBody.payload)),
);

const loginBody = await new ApiClient().call<SessionResponse>("POST", "/auth/login", {
  email: "nobody@example.com",
  password: "wrongpassword",
});
t.check("login with bad credentials is rejected", loginBody.status === 401, loginBody.status);

// --- the server must still be alive after all of the above ---
const health = await api.call<{ ok: boolean }>("GET", "/health");
t.check("server is still running", health.payload?.ok === true);

t.finish();
