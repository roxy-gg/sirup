/**
 * Confirms timestamps come from the database, not the app clock, and that the
 * discrete PG* connection path works.
 *
 * The logs cursor orders on `created_at`, so an app-stamped value would let
 * clock skew between the app container and Postgres reorder or drop rows.
 *
 * Usage: node scripts/check-timestamps.js
 */
import { knex } from "../server/database/knex.js";
import { Company, McpLog } from "../server/database/models/index.js";

let failures = 0;

function check(label, condition, detail) {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` -- ${detail}` : ""}`);
}

console.log(`\nTimestamps + connection\n${"-".repeat(56)}`);

// --- inserts must land as real timestamps, not raw fragments or strings ---
const company = await Company.query().insert({
  name: "Timestamp Co",
  slug: `ts-${Date.now()}`,
  gateway_token: `sirup_ts_${Date.now()}`,
});

const stored = await Company.query().findById(company.id);
check("created_at is stored as a timestamp", stored.created_at instanceof Date,
  typeof stored.created_at);
check("updated_at is stored as a timestamp", stored.updated_at instanceof Date,
  typeof stored.updated_at);

// --- the value must come from the database clock ---
const { rows } = await knex.raw("SELECT now() AS db_now");
const skewMs = Math.abs(rows[0].db_now.getTime() - stored.created_at.getTime());
check("created_at matches the database clock", skewMs < 5000, `${skewMs}ms apart`);

// --- an update must move updated_at forward ---
const before = stored.updated_at.getTime();
await new Promise((resolve) => setTimeout(resolve, 1100));
const renamed = await Company.query().patchAndFetchById(company.id, {
  name: "Timestamp Co v2",
});
check("updated_at advances on update", renamed.updated_at.getTime() > before,
  `${renamed.updated_at.getTime() - before}ms later`);

// --- log inserts must be monotonic, since the cursor orders on them ---
const written = [];
for (let i = 0; i < 5; i += 1) {
  written.push(
    // eslint-disable-next-line no-await-in-loop
    await McpLog.query().insert({
      company_id: company.id,
      method: "tools/list",
      status: "ok",
      duration_ms: i,
    }),
  );
}

const readBack = await McpLog.query()
  .where("company_id", company.id)
  .orderBy([
    { column: "created_at", order: "asc" },
    { column: "id", order: "asc" },
  ]);

check("log timestamps are non-decreasing in insert order",
  readBack.every((row, i) => i === 0 ||
    readBack[i - 1].created_at.getTime() <= row.created_at.getTime()),
  `${readBack.length} rows`);

check("every log row got a timestamp",
  readBack.every((row) => row.created_at instanceof Date));

// Clean up: cascades to the logs.
await Company.query().deleteById(company.id);

await knex.destroy();

console.log("-".repeat(56));
console.log(failures === 0 ? "All checks passed.\n" : `${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
