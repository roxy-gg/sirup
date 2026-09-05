/**
 * Starts a throwaway Postgres for local verification, on machines without
 * Docker. Not part of the app -- `docker-compose.dev.yml` is the normal path.
 *
 *   npm run pg:dev            # starts on 55432 and stays up
 *   npm run pg:dev -- --reset # wipes the data directory first
 */
import EmbeddedPostgres from "embedded-postgres";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(rootDir, ".pgdata");
const PORT = Number(process.env.PG_DEV_PORT ?? 55432);

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

/**
 * A previous run killed with SIGKILL leaves the postgres process alive and
 * holding the port, so the next start fails with an opaque `undefined`. Clear
 * it first rather than making everyone debug it by hand.
 */
async function portIsBusy(): Promise<boolean> {
  const net = await import("node:net");
  return new Promise((resolve) => {
    const socket = net.createConnection({ port: PORT, host: "127.0.0.1" });
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 1000);
  });
}

if (await portIsBusy()) {
  console.log(`[pg] port ${PORT} already in use — reusing the running cluster.`);
  console.log(`[pg] ready: postgres://sirup:sirup@localhost:${PORT}/sirup`);
  // Stay alive so `npm run pg:dev` behaves the same either way.
  await new Promise(() => {});
}

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

const shutdown = async (): Promise<never> => {
  await pg.stop().catch(() => {});
  process.exit(0);
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
