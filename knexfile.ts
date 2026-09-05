import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Knex } from "knex";

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
function buildConnection(): Knex.PgConnectionConfig | Knex.StaticConnectionConfig {
  const ssl =
    process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false;

  if (process.env.PGHOST) {
    return {
      host: process.env.PGHOST,
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER || "sirup",
      password: process.env.PGPASSWORD || "",
      database: process.env.PGDATABASE || "sirup",
      ssl,
    };
  }

  return {
    connectionString:
      process.env.DATABASE_URL || "postgres://sirup:sirup@localhost:5432/sirup",
    // Managed providers terminate unencrypted connections; a self-hosted
    // Postgres on the same Docker network usually has no CA to verify.
    ssl,
  } as Knex.StaticConnectionConfig;
}

const shared = {
  client: "pg",
  connection: buildConnection(),
  migrations: {
    directory: path.join(rootDir, "server", "database", "migrations"),
    // Migrations are plain .js so knex can load them without a TS loader.
    loadExtensions: [".js"],
  },
  seeds: {
    directory: path.join(rootDir, "server", "database", "seeds"),
  },
} satisfies Knex.Config;

const config: Record<string, Knex.Config> = {
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

config.test = config.development as Knex.Config;

export default config;
