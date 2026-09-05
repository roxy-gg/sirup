import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Postgres only.
 *
 * The schema leans on Postgres-native features -- the `uuid` column type,
 * `gen_random_uuid()`, partial indexes, and row-value cursor comparison -- so
 * there is no second dialect to keep working.
 */

/**
 * Builds the connection config.
 *
 * Discrete PG* variables are preferred over DATABASE_URL because a URL has to
 * be escaped: a generated password containing `/`, `#`, or `@` makes
 * `new URL()` throw, and the app crash-loops with an opaque ERR_INVALID_URL.
 * Passing the fields separately sidesteps parsing entirely.
 *
 * DATABASE_URL still works for managed providers that only hand out a URL.
 */
function buildConnection() {
  if (process.env.PGHOST) {
    return {
      host: process.env.PGHOST,
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER || "sirup",
      password: process.env.PGPASSWORD || "",
      database: process.env.PGDATABASE || "sirup",
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
    };
  }

  const url = process.env.DATABASE_URL || "postgres://sirup:sirup@localhost:5432/sirup";

  return {
    connectionString: url,
    // Managed providers terminate unencrypted connections; a self-hosted
    // Postgres on the same Docker network usually has no CA to verify.
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
  };
}

const shared = {
  client: "pg",
  connection: buildConnection(),
  migrations: {
    directory: path.join(rootDir, "server", "database", "migrations"),
  },
  seeds: {
    directory: path.join(rootDir, "server", "database", "seeds"),
  },
};

const config = {
  development: {
    ...shared,
    pool: { min: 0, max: 10 },
  },

  production: {
    ...shared,
    pool: {
      min: Number(process.env.DB_POOL_MIN || 2),
      max: Number(process.env.DB_POOL_MAX || 10),
    },
  },
};

config.test = config.development;

export default config;
