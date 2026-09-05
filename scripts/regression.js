/**
 * Regression tests for bugs found in review. Each check maps to a specific
 * defect that was fixed; they exist so it can't silently come back.
 *
 * Usage: node scripts/regression.js
 */
const BASE = process.env.BASE_URL || "http://localhost:5173";

let cookie = "";
let failures = 0;

function check(label, condition, detail) {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` -- ${detail}` : ""}`);
  return ok;
}

async function call(method, path, body) {
  const response = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return { status: response.status, payload };
}

async function main() {
  console.log(`\nRegression tests against ${BASE}\n${"-".repeat(52)}`);

  await call("POST", "/auth/register", {
    email: `regress-${Date.now()}@example.com`,
    password: "supersecret123",
  });
  await call("POST", "/auth/company", { name: "Regression Co" });

  const created = await call("POST", "/mcp-servers", {
    name: "Secret Server",
    url: "https://mcp.example-unreachable.dev/mcp",
    auth_type: "bearer",
    auth_value: "ORIGINAL_TOKEN",
  });
  const serverId = created.payload.server.id;

  // --- credentials must never reach the browser ---
  check("auth_value is stripped from responses",
    created.payload.server.auth_value === undefined &&
      created.payload.server.has_auth === true,
    JSON.stringify({ has_auth: created.payload.server.has_auth }));

  // --- BUG: rotating a credential alone silently discarded the new value ---
  const rotated = await call("PATCH", `/mcp-servers/${serverId}`, {
    auth_value: "ROTATED_TOKEN",
  });
  check("rotating auth_value alone is accepted", rotated.status === 200,
    `status ${rotated.status}`);

  // --- BUG: changing auth_type carried the OLD credential into the new type ---
  const transplant = await call("PATCH", `/mcp-servers/${serverId}`, {
    auth_type: "header",
    auth_header_name: "X-Api-Key",
  });
  check("changing auth type without a new credential is rejected",
    transplant.status === 400,
    `status ${transplant.status}: ${transplant.payload?.error}`);

  // --- BUG: the audit trail was cascade-deleted with its server ---
  const beforeLogs = await call("GET", "/mcp-logs");
  const countBefore = beforeLogs.payload.logs.length;
  check("activity was logged before deletion", countBefore > 0, `${countBefore} entries`);

  await call("DELETE", `/mcp-servers/${serverId}`);
  const afterLogs = await call("GET", "/mcp-logs");
  const countAfter = afterLogs.payload.logs.length;
  check("audit log survives disconnecting the server",
    countAfter >= countBefore,
    `${countBefore} before -> ${countAfter} after`);

  // --- BUG: an unvalidated ?server= param 400'd the logs request ---
  const badFilter = await call("GET", "/mcp-logs?server_id=abc");
  check("a non-uuid server filter is rejected cleanly, not a crash",
    badFilter.status === 400, `status ${badFilter.status}`);

  // --- an unauthenticated request must 401, never hang or crash ---
  const saved = cookie;
  cookie = "";
  const anon = await call("GET", "/mcp-servers");
  check("unauthenticated request gets 401", anon.status === 401, `status ${anon.status}`);
  cookie = saved;

  // --- the server must still be alive after all of the above ---
  const health = await call("GET", "/health");
  check("server is still running", health.payload?.ok === true);

  console.log("-".repeat(52));
  console.log(failures === 0 ? "All checks passed.\n" : `${failures} check(s) failed.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("\nRegression run crashed:", error);
  process.exit(1);
});
