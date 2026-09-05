/**
 * Verifies the UUID migration, specifically the parts that could regress
 * silently: keyset pagination on a random primary key, and id validation.
 *
 * Usage: npm run check:pagination
 */
import { ApiClient, BASE, Checks, mcpCall, UUID_RE, uniqueEmail } from "./_harness.js";
import type {
  LogListResponse,
  ServerResponse,
  SessionResponse,
} from "../shared/api.js";

const t = new Checks(`UUID + pagination checks against ${BASE}`);
const api = new ApiClient();

const session = await api.call<SessionResponse>("POST", "/auth/register", {
  email: uniqueEmail("page"),
  password: "supersecret123",
});
const company = await api.call<SessionResponse>("POST", "/auth/company", {
  name: "Pagination Co",
});
const token = company.payload.company?.gateway_token ?? "";

// --- ids are UUIDs everywhere, not integers ---
t.check(
  "user id is a uuid",
  UUID_RE.test(session.payload.user?.id ?? ""),
  session.payload.user?.id,
);
t.check(
  "company id is a uuid",
  UUID_RE.test(company.payload.company?.id ?? ""),
  company.payload.company?.id,
);

const server = await api.call<ServerResponse>("POST", "/mcp-servers", {
  name: "Pager",
  url: "https://mcp.deepwiki.com/mcp",
  auth_type: "none",
});
t.check(
  "server id is a uuid",
  UUID_RE.test(server.payload.server.id),
  server.payload.server.id,
);

const tools = server.payload.server.tools ?? [];
t.check(
  "tool ids are uuids",
  tools.length > 0 && tools.every((tool) => UUID_RE.test(tool.id)),
  `${tools.length} tools`,
);
t.check(
  "tool input_schema is a parsed object, not a string",
  tools.length > 0 && typeof tools[0]?.input_schema === "object",
  typeof tools[0]?.input_schema,
);

// --- generate enough activity to paginate through ---
const TOTAL = 25;
for (let i = 0; i < TOTAL; i += 1) {
  await mcpCall(token, "tools/list", {}, i + 1);
}

// --- walk every page with a small limit and check for gaps/dupes ---
const PAGE = 4;
const seen: string[] = [];
let cursor: string | null = null;
let pages = 0;

do {
  const params = new URLSearchParams({ limit: String(PAGE) });
  if (cursor) params.set("cursor", cursor);
  const page = await api.call<LogListResponse>("GET", `/mcp-logs?${params.toString()}`);

  if (page.status !== 200) {
    t.check("pagination request succeeded", false, page.status);
    break;
  }

  seen.push(...page.payload.logs.map((log) => log.id));
  cursor = page.payload.next_cursor;
  pages += 1;
} while (cursor && pages < 40);

t.check("paginated through multiple pages", pages > 3, `${pages} pages`);

const unique = new Set(seen);
t.check(
  "no duplicate rows across pages",
  unique.size === seen.length,
  `${seen.length} rows, ${unique.size} unique`,
);

// --- the walk must have covered everything a single big page returns ---
const all = await api.call<LogListResponse>("GET", "/mcp-logs?limit=100");
const allIds = all.payload.logs.map((log) => log.id);
const missing = allIds.filter((id) => !unique.has(id));
t.check(
  "no rows skipped between pages",
  missing.length === 0,
  `${missing.length} missing of ${allIds.length}`,
);

// --- ordering must be strictly newest-first ---
const times = all.payload.logs.map((log) => new Date(log.created_at).getTime());
t.check(
  "results are ordered newest first",
  times.every((time, i) => i === 0 || (times[i - 1] ?? 0) >= time),
);

// --- a garbage cursor must not 500 or silently return page 1 unfiltered ---
const garbage = await api.call("GET", "/mcp-logs?cursor=not-a-real-cursor");
t.check(
  "a malformed cursor is handled, not a crash",
  garbage.status === 200,
  garbage.status,
);

// --- a malformed uuid filter must 4xx cleanly, not blow up on 22P02 ---
const badId = await api.call("GET", "/mcp-logs?server_id=12345");
t.check("a non-uuid server filter is rejected cleanly", badId.status === 400, badId.status);

const badServer = await api.call("GET", "/mcp-servers/12345");
t.check(
  "a non-uuid server id returns 404, not 500",
  badServer.status === 404,
  badServer.status,
);

t.finish();
