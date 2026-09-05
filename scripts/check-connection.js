/**
 * Verifies the discrete PG* connection path that docker-compose.yml uses, and
 * that a password containing URL metacharacters does not break it.
 *
 * A composed DATABASE_URL is parsed with `new URL()`, so a generated password
 * containing "/", "#", or "@" throws ERR_INVALID_URL and crash-loops the app.
 * Compose therefore passes the fields separately -- this proves that works.
 *
 * Usage: node scripts/check-connection.js
 */
import knexConfigFactory from "../knexfile.js";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Knex = require("knex");

let failures = 0;

function check(label, condition, detail) {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` -- ${detail}` : ""}`);
}

console.log(`\nConnection configuration\n${"-".repeat(56)}`);

// --- a URL with an unescaped password must fail, proving why PG* is used ---
const hostile = "Xk9/Qm+2aVz@nP4tR8sL";
let urlThrows = false;
try {
  // eslint-disable-next-line no-new
  new URL(`postgres://sirup:${hostile}@db:5432/sirup`);
} catch {
  urlThrows = true;
}
check("a raw password with / and @ breaks URL parsing", urlThrows,
  "which is exactly why compose passes PG* fields instead");

// --- the PG* path must be selected when PGHOST is set ---
const originalEnv = { ...process.env };

process.env.PGHOST = "localhost";
process.env.PGPORT = String(process.env.PG_DEV_PORT || 55432);
process.env.PGUSER = "sirup";
process.env.PGPASSWORD = "sirup";
process.env.PGDATABASE = "sirup";
delete process.env.DATABASE_URL;

// Re-import with a cache-busting query so the factory re-reads the new env.
const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fresh = await import(
  `${new URL(`file://${path.join(rootDir, "knexfile.js")}`).href}?t=${Date.now()}`
);
const config = fresh.default.development;

check("PGHOST selects the discrete-field path",
  typeof config.connection === "object" && config.connection.host === "localhost",
  JSON.stringify({ host: config.connection.host, port: config.connection.port }));
check("no connectionString is built when PG* is used",
  config.connection.connectionString === undefined);

// --- and it must actually connect ---
const db = Knex(config);
try {
  const result = await db.raw("select 1 as ok");
  check("the PG* config connects to Postgres", result.rows[0].ok === 1);
} catch (error) {
  check("the PG* config connects to Postgres", false, error.message);
} finally {
  await db.destroy();
}

Object.assign(process.env, originalEnv);

console.log("-".repeat(56));
console.log(failures === 0 ? "All checks passed.\n" : `${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
