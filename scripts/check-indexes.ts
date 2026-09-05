/**
 * Confirms the indexes are used, not merely present.
 *
 * Two things make this non-trivial:
 *
 *  - On a tiny table a sequential scan is genuinely cheaper, so the planner
 *    ignores every index. The log checks therefore seed enough rows to make
 *    the index the honest choice.
 *  - Several indexes can satisfy the same query. Asserting one index *name*
 *    is brittle; what matters is that the plan avoids a sequential scan.
 *
 * Usage: npm run check:indexes
 */
import pg from "pg";
import { Checks } from "./_harness.js";

const client = new pg.Client(
  process.env.DATABASE_URL ?? "postgres://sirup:sirup@localhost:55432/sirup",
);
await client.connect();

const t = new Checks("Index usage");

async function planFor(sql: string, params: unknown[] = []): Promise<string> {
  const result = await client.query(`EXPLAIN (FORMAT JSON) ${sql}`, params);
  return JSON.stringify(result.rows[0]["QUERY PLAN"]);
}

/** Any index access counts; which specific index is the planner's business. */
function usesIndex(plan: string): boolean {
  return /"Node Type":"(Index Scan|Index Only Scan|Bitmap Index Scan)"/.test(plan);
}

function scansSequentially(plan: string): boolean {
  return plan.includes('"Node Type":"Seq Scan"');
}

function indexNames(plan: string): string {
  return [...plan.matchAll(/"Index Name":"([^"]+)"/g)].map((m) => m[1]).join(", ");
}

const { rows: companies } = await client.query<{ id: string }>(
  "SELECT id FROM companies LIMIT 1",
);
const { rows: servers } = await client.query<{ id: string }>(
  "SELECT id FROM mcp_servers LIMIT 1",
);

if (companies.length === 0 || servers.length === 0) {
  console.log("No data to plan against. Run the smoke test first.");
  process.exit(1);
}

const companyId = companies[0]!.id;
const serverId = servers[0]!.id;

// ── Log indexes, at a size where an index is genuinely the better plan ────
//
// Seeded into a scratch company inside a rolled-back transaction, so the
// check is repeatable and leaves nothing behind.
await client.query("BEGIN");

const { rows: scratch } = await client.query<{ id: string }>(
  `INSERT INTO companies (name, slug)
   VALUES ('Index Probe', 'index-probe-' || gen_random_uuid())
   RETURNING id`,
);
const probeId = scratch[0]!.id;

// Spread over 30 days rather than 20k rows inside one hour. That shape is
// realistic and, importantly, makes the 24h window *selective* -- with every
// row inside the window a sequential scan is genuinely the right plan, and
// the check would be asserting something false.
//
// Rows are split across several companies for the same reason: if one company
// owns ~all of the table, filtering by it is not selective either, and the
// planner correctly seq-scans no matter how good the index is.
const { rows: siblings } = await client.query<{ id: string }>(
  `INSERT INTO companies (name, slug)
   SELECT 'Index Sibling ' || i, 'index-sibling-' || gen_random_uuid()
   FROM generate_series(1, 9) AS i
   RETURNING id`,
);

await client.query(
  `INSERT INTO mcp_logs (company_id, method, status, duration_ms, created_at)
   SELECT $1,
          'tools/call',
          CASE WHEN i % 7 = 0 THEN 'error' ELSE 'ok' END,
          i % 500,
          now() - (i || ' minutes')::interval
   FROM generate_series(1, 43200) AS i`,
  [probeId],
);

// Nine more companies of the same size, so the probe is ~10% of the table.
for (const sibling of siblings) {
  await client.query(
    `INSERT INTO mcp_logs (company_id, method, status, created_at)
     SELECT $1, 'tools/call', 'ok', now() - (i || ' minutes')::interval
     FROM generate_series(1, 43200) AS i`,
    [sibling.id],
  );
}

await client.query("ANALYZE mcp_logs");

const keysetPlan = await planFor(
  `SELECT * FROM mcp_logs
   WHERE company_id = $1 AND (created_at, id) < (now(), '00000000-0000-0000-0000-000000000000')
   ORDER BY created_at DESC, id DESC LIMIT 50`,
  [probeId],
);
t.check(
  "logs keyset page avoids a sequential scan",
  usesIndex(keysetPlan) && !scansSequentially(keysetPlan),
  indexNames(keysetPlan),
);

const summaryPlan = await planFor(
  `SELECT status, count(*) FROM mcp_logs
   WHERE company_id = $1 AND created_at >= now() - interval '24 hours'
   GROUP BY status`,
  [probeId],
);
t.check(
  "24h rollup avoids a sequential scan",
  usesIndex(summaryPlan) && !scansSequentially(summaryPlan),
  indexNames(summaryPlan),
);

const perServerPlan = await planFor(
  `SELECT * FROM mcp_logs
   WHERE company_id = $1 AND server_id = $2
   ORDER BY created_at DESC, id DESC LIMIT 50`,
  [probeId, serverId],
);
t.check(
  "per-server log filter avoids a sequential scan",
  usesIndex(perServerPlan) && !scansSequentially(perServerPlan),
  indexNames(perServerPlan),
);

await client.query("ROLLBACK");

// ── Point lookups. These tables stay small, so force the planner to reveal
//    whether a usable index exists at all. ────────────────────────────────
await client.query("SET enable_seqscan = off");

const toolResolvePlan = await planFor(
  "SELECT * FROM mcp_tools WHERE namespaced_name = $1",
  ["deepwiki__ask_question"],
);
t.check(
  "tools/call name resolution uses an index",
  toolResolvePlan.includes("mcp_tools_namespaced_name_idx"),
  indexNames(toolResolvePlan),
);

const toolsListPlan = await planFor(
  "SELECT * FROM mcp_tools WHERE server_id = $1 AND enabled = true ORDER BY name",
  [serverId],
);
t.check("tools/list uses an index", usesIndex(toolsListPlan), indexNames(toolsListPlan));

const serversPlan = await planFor(
  "SELECT * FROM mcp_servers WHERE company_id = $1 ORDER BY created_at DESC",
  [companyId],
);
t.check("server list uses an index", usesIndex(serversPlan), indexNames(serversPlan));

// The gateway resolves a token to a profile on every single request, so this
// has to be an index hit rather than a scan of every profile.
const gatewayPlan = await planFor("SELECT * FROM profiles WHERE gateway_token = $1", [
  "sirup_whatever",
]);
t.check(
  "gateway token lookup uses the unique index",
  gatewayPlan.includes("profiles_gateway_token_unique"),
  indexNames(gatewayPlan),
);

// tools/list joins from the profile through the attachment table on every
// request, so that join must be indexed too.
const profileToolsPlan = await planFor(
  `SELECT t.* FROM mcp_tools t
   JOIN mcp_servers s ON s.id = t.server_id
   JOIN profile_servers ps ON ps.server_id = s.id
   WHERE ps.profile_id = $1 AND s.enabled = true AND t.enabled = true`,
  ["00000000-0000-0000-0000-000000000000"],
);
t.check(
  "profile tool lookup avoids a sequential scan",
  usesIndex(profileToolsPlan) && !scansSequentially(profileToolsPlan),
  indexNames(profileToolsPlan),
);

const userPlan = await planFor("SELECT * FROM users WHERE email = $1", ["a@b.com"]);
t.check(
  "login email lookup uses the unique index",
  userPlan.includes("users_email_unique"),
  indexNames(userPlan),
);

await client.query("SET enable_seqscan = on");
await client.end();

t.finish();
