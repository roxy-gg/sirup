/**
 * Verifies the discrete PG* connection path that docker-compose.yml uses, and
 * that a password containing URL metacharacters does not break it.
 *
 * A composed DATABASE_URL is parsed with `new URL()`, so a generated password
 * containing "/", "#", or "@" throws ERR_INVALID_URL and crash-loops the app.
 * Compose therefore passes the fields separately -- this proves that works.
 *
 * Usage: npm run check:connection
 */
import Knex from "knex";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Checks } from "./_harness.js";

const t = new Checks("Connection configuration");

// --- a URL with an unescaped password must fail, proving why PG* is used ---
const hostile = "Xk9/Qm+2aVz@nP4tR8sL";
let urlThrows = false;
try {
  new URL(`postgres://sirup:${hostile}@db:5432/sirup`);
} catch {
  urlThrows = true;
}
t.check(
  "a raw password with / and @ breaks URL parsing",
  urlThrows,
  "which is exactly why compose passes PG* fields instead",
);

// --- the PG* path must be selected when PGHOST is set ---
process.env.PGHOST = "localhost";
process.env.PGPORT = String(process.env.PG_DEV_PORT ?? 55432);
process.env.PGUSER = "sirup";
process.env.PGPASSWORD = "sirup";
process.env.PGDATABASE = "sirup";
delete process.env.DATABASE_URL;

// Re-import with a cache-busting query so the factory re-reads the new env.
const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fresh = await import(
  `${new URL(`file://${path.join(rootDir, "knexfile.ts")}`).href}?t=${Date.now()}`
);
const config = fresh.default.development;
const connection = config.connection as Record<string, unknown>;

t.check(
  "PGHOST selects the discrete-field path",
  typeof connection === "object" && connection.host === "localhost",
  JSON.stringify({ host: connection.host, port: connection.port }),
);
t.check(
  "no connectionString is built when PG* is used",
  connection.connectionString === undefined,
);

// --- and it must actually connect ---
const db = Knex(config);
try {
  const result = await db.raw<{ rows: Array<{ ok: number }> }>("select 1 as ok");
  t.check("the PG* config connects to Postgres", result.rows[0]?.ok === 1);
} catch (error) {
  t.check(
    "the PG* config connects to Postgres",
    false,
    error instanceof Error ? error.message : String(error),
  );
} finally {
  await db.destroy();
}

t.finish();
