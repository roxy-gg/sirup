/**
 * Starts a throwaway Postgres for local verification, on machines without
 * Docker. Not part of the app -- `docker-compose.dev.yml` is the normal path.
 *
 *   node scripts/pg-dev.js          # starts on 55432 and stays up
 *   node scripts/pg-dev.js --reset  # wipes the data directory first
 */
import EmbeddedPostgres from "embedded-postgres";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(rootDir, ".pgdata");
const PORT = Number(process.env.PG_DEV_PORT || 55432);

if (process.argv.includes("--reset") && fs.existsSync(dataDir)) {
  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log("[pg] data directory wiped");
}

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "sirup",
  password: "sirup",
  port: PORT,
  persistent: true,
  onLog: () => {},
  onError: () => {},
});

const isFresh = !fs.existsSync(dataDir);

if (isFresh) {
  console.log("[pg] initialising cluster…");
  await pg.initialise();
}

await pg.start();

if (isFresh) {
  await pg.createDatabase("sirup");
}

console.log(`[pg] ready: postgres://sirup:sirup@localhost:${PORT}/sirup`);

const shutdown = async () => {
  await pg.stop().catch(() => {});
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
