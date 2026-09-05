import Knex from "knex";
import { Model } from "objection";
import knexConfig from "../../knexfile.js";

const environment =
  process.env.NODE_ENV === "production" ? "production" : "development";

const environmentConfig = knexConfig[environment];
if (!environmentConfig) {
  throw new Error(`No knex configuration for environment "${environment}".`);
}

export const knex = Knex(environmentConfig);

Model.knex(knex);

/**
 * Waits for Postgres to accept queries.
 *
 * In Docker the app and the database start together, and a compose healthcheck
 * only gets us so far -- Postgres briefly accepts TCP before it is ready for
 * queries. Retrying here means a cold `docker compose up` doesn't crash-loop.
 */
async function waitForDatabase({ attempts = 15, delayMs = 2000 } = {}): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await knex.raw("select 1");
      return;
    } catch (error) {
      if (attempt === attempts) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Could not reach Postgres after ${attempts} attempts: ${message}`,
        );
      }
      console.log(`[db] waiting for Postgres (${attempt}/${attempts})…`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * Connects and runs pending migrations at boot, so a fresh deploy needs no
 * separate migrate step.
 */
export async function initDatabase() {
  await waitForDatabase();

  const [batch, migrations] = await knex.migrate.latest();
  if (migrations.length > 0) {
    console.log(`[db] applied ${migrations.length} migration(s) (batch ${batch})`);
  }
  return knex;
}

export { Model };
