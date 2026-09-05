/**
 * End-to-end smoke test against a running dev server.
 *
 * Exercises the real product path: register -> create company -> connect a live
 * upstream MCP server -> speak MCP to the gateway as a client would and confirm
 * the upstream's tools come back namespaced.
 *
 * Usage: node scripts/smoke.js
 */
const BASE = process.env.BASE_URL || "http://localhost:5173";

// A public, no-auth MCP server, so the test needs no credentials.
const UPSTREAM = process.env.UPSTREAM_MCP || "https://mcp.deepwiki.com/mcp";

let cookie = "";
let failures = 0;

function check(label, condition, detail) {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` -- ${detail}` : ""}`);
  return ok;
}

async function apiCall(method, path, body) {
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

/** Speaks Streamable HTTP to the gateway the way a real MCP client does. */
async function mcpCall(token, method, params, id = 1) {
  const response = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // The spec requires clients to accept both response shapes.
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${token}`,
      "MCP-Protocol-Version": "2025-06-18",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });

  const text = await response.text();

  // A Streamable HTTP reply is either a JSON object or an SSE stream.
  if (text.startsWith("event:") || text.includes("\ndata:") || text.startsWith("data:")) {
    const line = text.split("\n").find((l) => l.startsWith("data:"));
    return { status: response.status, payload: line ? JSON.parse(line.slice(5).trim()) : null };
  }

  return { status: response.status, payload: text ? JSON.parse(text) : null };
}

async function main() {
  console.log(`\nSmoke test against ${BASE}\n${"-".repeat(52)}`);

  // --- health ---
  const health = await apiCall("GET", "/health");
  check("health endpoint responds", health.payload?.ok);

  // --- auth ---
  const email = `smoke-${Date.now()}@example.com`;
  const registered = await apiCall("POST", "/auth/register", {
    email,
    password: "supersecret123",
  });
  check("register creates an account", registered.status === 201, `status ${registered.status}`);

  const weak = await apiCall("POST", "/auth/register", {
    email: `weak-${Date.now()}@example.com`,
    password: "short",
  });
  check("short password is rejected", weak.status === 400, `status ${weak.status}`);

  const duplicate = await apiCall("POST", "/auth/register", {
    email,
    password: "supersecret123",
  });
  check("duplicate email is rejected", duplicate.status === 409, `status ${duplicate.status}`);

  // --- gateway must reject an unauthenticated client ---
  const noToken = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });
  check("gateway rejects a missing token", noToken.status === 401, `status ${noToken.status}`);

  // --- company / onboarding ---
  const companyName = "Acme Inc";
  const company = await apiCall("POST", "/auth/company", { name: companyName });
  const token = company.payload?.company?.gateway_token;
  check("company creation mints a gateway token", Boolean(token));
  // Slugs are globally unique, so a rerun against a warm DB gets a suffix.
  check("company slug is derived from the name",
    company.payload?.company?.slug?.startsWith("acme-inc"),
    company.payload?.company?.slug);

  // --- catalog ---
  const catalog = await apiCall("GET", "/mcp-catalog");
  check("catalog is served", (catalog.payload?.catalog?.length || 0) > 0);

  // --- connect a real upstream MCP server ---
  console.log(`\n  connecting upstream: ${UPSTREAM}`);
  const connected = await apiCall("POST", "/mcp-servers", {
    name: "DeepWiki",
    url: UPSTREAM,
    auth_type: "none",
  });

  const server = connected.payload?.server;
  const isLive = server?.status === "connected";
  check("upstream server is saved", connected.status === 201, `status ${connected.status}`);

  if (!isLive) {
    console.log(`  NOTE upstream unreachable (${server?.status_message || "unknown"}).`);
    console.log("       Aggregation checks need network access; skipping them.\n");
  } else {
    check("upstream tools are discovered", server.tool_count > 0, `${server.tool_count} tools`);
  }

  // --- speak MCP to the gateway ---
  const initialized = await mcpCall(token, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "smoke-test", version: "1.0.0" },
  });
  check("gateway completes initialize",
    initialized.payload?.result?.serverInfo?.name === "sirup-gg",
    JSON.stringify(initialized.payload?.result?.serverInfo || initialized.payload));

  const listed = await mcpCall(token, "tools/list", {}, 2);
  const tools = listed.payload?.result?.tools || [];
  check("gateway serves tools/list", Array.isArray(tools), `${tools.length} tools`);

  if (isLive) {
    check("aggregated tools are namespaced",
      tools.length > 0 && tools.every((tool) => tool.name.includes("__")),
      tools.slice(0, 3).map((t) => t.name).join(", "));

    check("tool count matches the upstream", tools.length === server.tool_count,
      `gateway ${tools.length} vs upstream ${server.tool_count}`);
  }

  // --- an unknown tool must fail cleanly, not crash the gateway ---
  const bogus = await mcpCall(token, "tools/call", {
    name: "nope__does_not_exist",
    arguments: {},
  }, 3);
  check("unknown tool returns a tool error",
    bogus.payload?.result?.isError === true,
    JSON.stringify(bogus.payload?.result?.content?.[0]?.text || bogus.payload));

  // --- a wrong token must not see another company's tools ---
  const wrongToken = await mcpCall("sirup_not_a_real_token", "tools/list", {}, 4);
  check("gateway rejects an invalid token", wrongToken.status === 401,
    `status ${wrongToken.status}`);

  // --- logs recorded what crossed the gateway ---
  const logs = await apiCall("GET", "/mcp-logs");
  check("gateway activity is logged", (logs.payload?.logs?.length || 0) > 0,
    `${logs.payload?.logs?.length || 0} entries`);

  const summary = await apiCall("GET", "/mcp-logs/summary");
  check("log summary is computed", typeof summary.payload?.summary?.total === "number",
    JSON.stringify(summary.payload?.summary));

  // --- tenant isolation: a second company must not see the first's servers ---
  cookie = "";
  await apiCall("POST", "/auth/register", {
    email: `other-${Date.now()}@example.com`,
    password: "supersecret123",
  });
  await apiCall("POST", "/auth/company", { name: "Other Corp" });
  const otherServers = await apiCall("GET", "/mcp-servers");
  check("a new company sees no other company's servers",
    otherServers.payload?.servers?.length === 0,
    `${otherServers.payload?.servers?.length} servers`);

  console.log("-".repeat(52));
  console.log(failures === 0 ? "All checks passed.\n" : `${failures} check(s) failed.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("\nSmoke test crashed:", error);
  process.exit(1);
});
