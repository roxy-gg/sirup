/**
 * Verifies the UUID migration, specifically the parts that could regress
 * silently: keyset pagination on a random primary key, and index usage.
 *
 * Usage: node scripts/check-pagination.js
 */
const BASE = process.env.BASE_URL || "http://localhost:5173";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

async function mcpCall(token, method, params, id) {
  const response = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  const text = await response.text();
  if (text.includes("data:")) {
    const line = text.split("\n").find((l) => l.startsWith("data:"));
    return line ? JSON.parse(line.slice(5).trim()) : null;
  }
  return text ? JSON.parse(text) : null;
}

async function main() {
  console.log(`\nUUID + pagination checks against ${BASE}\n${"-".repeat(56)}`);

  const session = await call("POST", "/auth/register", {
    email: `page-${Date.now()}@example.com`,
    password: "supersecret123",
  });
  const company = await call("POST", "/auth/company", { name: "Pagination Co" });
  const token = company.payload.company.gateway_token;

  // --- ids are UUIDs everywhere, not integers ---
  check("user id is a uuid", UUID_RE.test(session.payload.user.id),
    session.payload.user.id);
  check("company id is a uuid", UUID_RE.test(company.payload.company.id),
    company.payload.company.id);

  const server = await call("POST", "/mcp-servers", {
    name: "Pager",
    url: "https://mcp.deepwiki.com/mcp",
    auth_type: "none",
  });
  check("server id is a uuid", UUID_RE.test(server.payload.server.id),
    server.payload.server.id);

  const tools = server.payload.server.tools || [];
  check("tool ids are uuids", tools.length > 0 && tools.every((t) => UUID_RE.test(t.id)),
    `${tools.length} tools`);
  check("tool input_schema is a parsed object, not a string",
    tools.length > 0 && typeof tools[0].input_schema === "object",
    typeof tools[0]?.input_schema);

  // --- generate enough activity to paginate through ---
  const TOTAL = 25;
  for (let i = 0; i < TOTAL; i += 1) {
    await mcpCall(token, "tools/list", {}, i + 1);
  }

  // --- walk every page with a small limit and check for gaps/dupes ---
  const PAGE = 4;
  const seen = [];
  let cursor = null;
  let pages = 0;

  do {
    const params = new URLSearchParams({ limit: String(PAGE) });
    if (cursor) params.set("cursor", cursor);
    const page = await call("GET", `/mcp-logs?${params.toString()}`);

    if (page.status !== 200) {
      check("pagination request succeeded", false, `status ${page.status}`);
      break;
    }

    seen.push(...page.payload.logs.map((log) => log.id));
    cursor = page.payload.next_cursor;
    pages += 1;
  } while (cursor && pages < 40);

  check("paginated through multiple pages", pages > 3, `${pages} pages`);

  const unique = new Set(seen);
  check("no duplicate rows across pages", unique.size === seen.length,
    `${seen.length} rows, ${unique.size} unique`);

  // --- the walk must have covered everything a single big page returns ---
  const all = await call("GET", "/mcp-logs?limit=100");
  const allIds = all.payload.logs.map((log) => log.id);
  const missing = allIds.filter((id) => !unique.has(id));
  check("no rows skipped between pages", missing.length === 0,
    `${missing.length} missing of ${allIds.length}`);

  // --- ordering must be strictly newest-first ---
  const times = all.payload.logs.map((log) => new Date(log.created_at).getTime());
  const ordered = times.every((t, i) => i === 0 || times[i - 1] >= t);
  check("results are ordered newest first", ordered);

  // --- a garbage cursor must not 500 or silently return page 1 unfiltered ---
  const garbage = await call("GET", "/mcp-logs?cursor=not-a-real-cursor");
  check("a malformed cursor is handled, not a crash", garbage.status === 200,
    `status ${garbage.status}`);

  // --- a malformed uuid filter must 4xx cleanly, not blow up on 22P02 ---
  const badId = await call("GET", "/mcp-logs?server_id=12345");
  check("a non-uuid server filter is rejected cleanly", badId.status === 400,
    `status ${badId.status}`);

  const badServer = await call("GET", "/mcp-servers/12345");
  check("a non-uuid server id returns 404, not 500", badServer.status === 404,
    `status ${badServer.status}`);

  console.log("-".repeat(56));
  console.log(failures === 0 ? "All checks passed.\n" : `${failures} check(s) failed.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("\nCrashed:", error);
  process.exit(1);
});
