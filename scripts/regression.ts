/**
 * Regression tests for bugs found in review. Each check maps to a specific
 * defect that was fixed; they exist so it can't silently come back.
 *
 * Usage: npm run check:regression
 */
import { ApiClient, BASE, Checks, uniqueEmail } from "./_harness.js";
import type { LogListResponse, ServerResponse } from "../shared/api.js";

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

// --- the server must still be alive after all of the above ---
const health = await api.call<{ ok: boolean }>("GET", "/health");
t.check("server is still running", health.payload?.ok === true);

t.finish();
