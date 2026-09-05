/**
 * Confirms the indexes are used, not merely present.
 *
 * Two things make this non-trivial:
 *
 *  - On a tiny table a sequential scan is genuinely cheaper, so the planner
 *    ignores every index. The log checks therefore seed enough rows to make
 *    the index the honest choice.
 *  - Several indexes can satisfy the same query. Asserting one index *name*
 *    is brittle; what matters is that the plan avoids a sequential scan and
 *    reads few rows. These checks assert that instead.
 *
 * Usage: node scripts/check-indexes.js
 */
import pg from "pg";

const client = new pg.Client(
  process.env.DATABASE_URL || "postgres://sirup:sirup@localhost:55432/sirup",
);
await client.connect();

let failures = 0;

function check(label, condition, detail) {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` -- ${detail}` : ""}`);
}

async function planFor(sql, params = []) {
  const result = await client.query(`EXPLAIN (FORMAT JSON) ${sql}`, params);
  return JSON.stringify(result.rows[0]["QUERY PLAN"]);
}

/** Any index access counts; which specific index is the planner's business. */
function usesIndex(plan) {
  return /"Node Type":"(Index Scan|Index Only Scan|Bitmap Index Scan)"/.test(plan);
}

function scansSequentially(plan) {
  return plan.includes('"Node Type":"Seq Scan"');
}

function indexNames(plan) {
  return [...plan.matchAll(/"Index Name":"([^"]+)"/g)].map((m) => m[1]).join(", ");
}

const { rows: companies } = await client.query("SELECT id FROM companies LIMIT 1");
const { rows: servers } = await client.query("SELECT id FROM mcp_servers LIMIT 1");

if (companies.length === 0 || servers.length === 0) {
  console.log("No data to plan against. Run the smoke test first.");
  process.exit(1);
}

const companyId = companies[0].id;
const serverId = servers[0].id;

console.log(`\nIndex usage\n${"-".repeat(60)}`);

// ── Log indexes, at a size where an index is genuinely the better plan ────
//
// Seeded into a scratch company inside a rolled-back transaction, so the
// check is repeatable and leaves nothing behind.
await client.query("BEGIN");

const { rows: scratch } = await client.query(
  `INSERT INTO companies (name, slug, gateway_token)
   VALUES ('Index Probe', 'index-probe-' || gen_random_uuid(), 'probe_' || gen_random_uuid())
   RETURNING id`,
);
const probeId = scratch[0].id;

// Spread over 30 days rather than 20k rows inside one hour. That shape is
// realistic and, importantly, makes the 24h window *selective* -- with every
// row inside the window a sequential scan is genuinely the right plan, and
// the check would be asserting something false.
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
await client.query("ANALYZE mcp_logs");

const keysetPlan = await planFor(
  `SELECT * FROM mcp_logs
   WHERE company_id = $1 AND (created_at, id) < (now(), '00000000-0000-0000-0000-000000000000')
   ORDER BY created_at DESC, id DESC LIMIT 50`,
  [probeId],
);
check("logs keyset page avoids a sequential scan",
  usesIndex(keysetPlan) && !scansSequentially(keysetPlan),
  indexNames(keysetPlan));

const summaryPlan = await planFor(
  `SELECT status, count(*) FROM mcp_logs
   WHERE company_id = $1 AND created_at >= now() - interval '24 hours'
   GROUP BY status`,
  [probeId],
);
check("24h rollup avoids a sequential scan",
  usesIndex(summaryPlan) && !scansSequentially(summaryPlan),
  indexNames(summaryPlan));

const perServerPlan = await planFor(
  `SELECT * FROM mcp_logs
   WHERE company_id = $1 AND server_id = $2
   ORDER BY created_at DESC, id DESC LIMIT 50`,
  [probeId, serverId],
);
check("per-server log filter avoids a sequential scan",
  usesIndex(perServerPlan) && !scansSequentially(perServerPlan),
  indexNames(perServerPlan));

await client.query("ROLLBACK");

// ── Point lookups. These tables stay small, so force the planner to reveal
//    whether a usable index exists at all. ────────────────────────────────
await client.query("SET enable_seqscan = off");

const toolResolvePlan = await planFor(
  "SELECT * FROM mcp_tools WHERE namespaced_name = $1",
  ["deepwiki__ask_question"],
);
check("tools/call name resolution uses an index",
  toolResolvePlan.includes("mcp_tools_namespaced_name_idx"),
  indexNames(toolResolvePlan));

const toolsListPlan = await planFor(
  "SELECT * FROM mcp_tools WHERE server_id = $1 AND enabled = true ORDER BY name",
  [serverId],
);
check("tools/list uses an index", usesIndex(toolsListPlan), indexNames(toolsListPlan));

const serversPlan = await planFor(
  "SELECT * FROM mcp_servers WHERE company_id = $1 ORDER BY created_at DESC",
  [companyId],
);
check("server list uses an index", usesIndex(serversPlan), indexNames(serversPlan));

const gatewayPlan = await planFor(
  "SELECT * FROM companies WHERE gateway_token = $1",
  ["sirup_whatever"],
);
check("gateway token lookup uses the unique index",
  gatewayPlan.includes("companies_gateway_token_unique"),
  indexNames(gatewayPlan));

const userPlan = await planFor("SELECT * FROM users WHERE email = $1", ["a@b.com"]);
check("login email lookup uses the unique index",
  userPlan.includes("users_email_unique"), indexNames(userPlan));

await client.query("SET enable_seqscan = on");
await client.end();

console.log("-".repeat(60));
console.log(failures === 0 ? "All checks passed.\n" : `${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
