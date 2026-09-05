/**
 * Verifies the upstream connection pool actually reuses connections.
 *
 * This exists because the pool silently stopped caching during the Postgres
 * migration: it compared `server.updated_at` with `===`, which worked when the
 * driver returned an ISO string but never matches once pg returns a Date. The
 * symptom was invisible -- everything still worked, just with a full MCP
 * handshake on every single call.
 *
 * Usage: npm run check:pool
 */
import { acquire, release, poolSize } from "../server/mcp/connectionPool.js";
import { knex } from "../server/database/knex.js";
import { McpServerModel } from "../server/database/models/index.js";
import { Checks } from "./_harness.js";

const t = new Checks("Connection pool");

const server = await McpServerModel.query().findOne({ status: "connected" });

if (!server) {
  console.log("No connected server to test against. Run the smoke test first.");
  await knex.destroy();
  process.exit(1);
}

// --- the revision stamp must be a primitive, or every lookup misses ---
t.check(
  "updated_at arrives as a Date from pg",
  server.updated_at instanceof Date,
  typeof server.updated_at,
);

// --- three acquires on an unchanged row must yield one connection ---
const first = await acquire(server);
const afterFirst = poolSize();
const second = await acquire(server);
const third = await acquire(server);

t.check(
  "repeated acquires return the same client",
  first.client === second.client && second.client === third.client,
);
t.check("the pool holds a single entry", poolSize() === 1, poolSize());
t.check("no extra connections were opened", afterFirst === poolSize());

// --- a re-read of the same row must still hit, despite a new Date instance ---
const reread = await McpServerModel.query().findById(server.id);
if (!reread) throw new Error("server vanished mid-test");

t.check(
  "a re-read row is a different Date object",
  reread.updated_at !== server.updated_at,
  "distinct instances, as pg always returns",
);

const fourth = await acquire(reread);
t.check(
  "a re-read row still hits the cache",
  fourth.client === first.client,
  "this is the exact case that regressed",
);

// --- an id differing only in case must not open a second connection ---
const upperCased = { ...reread, id: String(reread.id).toUpperCase() };
const fifth = await acquire(upperCased);
t.check(
  "an uppercase uuid hits the same pool entry",
  fifth.client === first.client,
  `pool size ${poolSize()}`,
);

// --- a changed row must bust the entry ---
await McpServerModel.query().findById(server.id).patch({ name: server.name });
const touched = await McpServerModel.query().findById(server.id);
if (!touched) throw new Error("server vanished mid-test");

const sixth = await acquire(touched);
t.check(
  "an edited row opens a fresh connection",
  sixth.client !== first.client,
  "credential changes must take effect immediately",
);

// --- release must actually drop it ---
release(server.id);
t.check("release empties the pool", poolSize() === 0, poolSize());

// --- release must work with a differently-cased id too ---
await acquire(touched);
release(String(touched.id).toUpperCase());
t.check("release works with an uppercase uuid", poolSize() === 0, poolSize());

await knex.destroy();
t.finish();
