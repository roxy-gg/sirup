/**
 * Verifies the upstream connection pool actually reuses connections.
 *
 * This exists because the pool silently stopped caching during the Postgres
 * migration: it compared `server.updated_at` with `===`, which worked when the
 * driver returned an ISO string but never matches once pg returns a Date. The
 * symptom was invisible -- everything still worked, just with a full MCP
 * handshake on every single call.
 *
 * Usage: node scripts/check-pool.js
 */
import { acquire, release, poolSize } from "../server/mcp/connectionPool.js";
import { knex } from "../server/database/knex.js";
import { McpServer } from "../server/database/models/index.js";

let failures = 0;

function check(label, condition, detail) {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` -- ${detail}` : ""}`);
}

console.log(`\nConnection pool\n${"-".repeat(56)}`);

const server = await McpServer.query().findOne({ status: "connected" });

if (!server) {
  console.log("No connected server to test against. Run the smoke test first.");
  await knex.destroy();
  process.exit(1);
}

// --- the revision stamp must be a primitive, or every lookup misses ---
check("updated_at arrives as a Date from pg", server.updated_at instanceof Date,
  typeof server.updated_at);

// --- three acquires on an unchanged row must yield one connection ---
const first = await acquire(server);
const afterFirst = poolSize();
const second = await acquire(server);
const third = await acquire(server);

check("repeated acquires return the same client",
  first.client === second.client && second.client === third.client);
check("the pool holds a single entry", poolSize() === 1, `size ${poolSize()}`);
check("no extra connections were opened", afterFirst === poolSize());

// --- a re-read of the same row must still hit, despite a new Date instance ---
const reread = await McpServer.query().findById(server.id);
check("a re-read row is a different Date object",
  reread.updated_at !== server.updated_at,
  "distinct instances, as pg always returns");

const fourth = await acquire(reread);
check("a re-read row still hits the cache", fourth.client === first.client,
  "this is the exact case that regressed");

// --- an id differing only in case must not open a second connection ---
const upperCased = { ...reread, id: String(reread.id).toUpperCase() };
const fifth = await acquire(upperCased);
check("an uppercase uuid hits the same pool entry", fifth.client === first.client,
  `pool size ${poolSize()}`);

// --- a changed row must bust the entry ---
await McpServer.query().findById(server.id).patch({ name: server.name });
const touched = await McpServer.query().findById(server.id);
const sixth = await acquire(touched);
check("an edited row opens a fresh connection", sixth.client !== first.client,
  "credential changes must take effect immediately");

// --- release must actually drop it ---
release(server.id);
check("release empties the pool", poolSize() === 0, `size ${poolSize()}`);

// --- release must work with a differently-cased id too ---
await acquire(touched);
release(String(touched.id).toUpperCase());
check("release works with an uppercase uuid", poolSize() === 0, `size ${poolSize()}`);

await knex.destroy();

console.log("-".repeat(56));
console.log(failures === 0 ? "All checks passed.\n" : `${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
