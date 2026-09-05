/**
 * Confirms timestamps come from the database, not the app clock.
 *
 * The logs cursor orders on `created_at`, so an app-stamped value would let
 * clock skew between the app container and Postgres reorder or drop rows.
 *
 * Usage: npm run check:timestamps
 */
import { knex } from "../server/database/knex.js";
import {
  CompanyModel,
  McpLogModel,
  UserModel,
} from "../server/database/models/index.js";
import { Checks } from "./_harness.js";

const t = new Checks("Timestamps");

// --- inserts must land as real timestamps, not raw fragments or strings ---
const company = await CompanyModel.query().insert({
  name: "Timestamp Co",
  slug: `ts-${Date.now()}`,
});

const stored = await CompanyModel.query().findById(company.id);
if (!stored) throw new Error("company vanished mid-test");

t.check(
  "created_at is stored as a timestamp",
  stored.created_at instanceof Date,
  typeof stored.created_at,
);
t.check(
  "updated_at is stored as a timestamp",
  stored.updated_at instanceof Date,
  typeof stored.updated_at,
);

// --- the value must come from the database clock ---
const { rows } = await knex.raw<{ rows: Array<{ db_now: Date }> }>(
  "SELECT now() AS db_now",
);
const dbNow = rows[0]?.db_now;
const skewMs = Math.abs((dbNow?.getTime() ?? 0) - stored.created_at.getTime());
t.check("created_at matches the database clock", skewMs < 5000, `${skewMs}ms apart`);

// --- an update must move updated_at forward ---
const before = stored.updated_at.getTime();
await new Promise((resolve) => setTimeout(resolve, 1100));
const renamed = await CompanyModel.query().patchAndFetchById(company.id, {
  name: "Timestamp Co v2",
});
t.check(
  "updated_at advances on update",
  renamed.updated_at.getTime() > before,
  `${renamed.updated_at.getTime() - before}ms later`,
);

// --- log inserts must be monotonic, since the cursor orders on them ---
// Logs are user-owned, so the row needs an owner. A throwaway user keeps this
// self-contained and lets the company cascade clean both up.
const owner = await UserModel.query().insert({
  email: `ts-${Date.now()}@example.com`,
  password_hash: "not-a-real-hash",
  company_id: company.id,
});

for (let i = 0; i < 5; i += 1) {
  await McpLogModel.query().insert({
    user_id: owner.id,
    company_id: company.id,
    method: "tools/list",
    status: "ok",
    duration_ms: i,
  });
}

const readBack = await McpLogModel.query()
  .where("user_id", owner.id)
  .orderBy([
    { column: "created_at", order: "asc" },
    { column: "id", order: "asc" },
  ]);

t.check(
  "log timestamps are non-decreasing in insert order",
  readBack.every(
    (row, i) =>
      i === 0 ||
      (readBack[i - 1]?.created_at.getTime() ?? 0) <= row.created_at.getTime(),
  ),
  `${readBack.length} rows`,
);

t.check(
  "every log row got a timestamp",
  readBack.every((row) => row.created_at instanceof Date),
);

// Clean up: cascades to the logs.
await CompanyModel.query().deleteById(company.id);

await knex.destroy();
t.finish();
