/**
 * OAuth 2.1 for the gateway endpoint.
 *
 * Until now the only way into `/mcp` was a profile's `gateway_token`: a long
 * lived secret the user copies out of the dashboard and pastes into a client's
 * config. That works for clients that let you set a header. It does not work
 * for Claude, whose "Add custom connector" dialog accepts a URL and nothing
 * else -- there is no field to paste a token into.
 *
 * So the gateway becomes an OAuth 2.1 authorization server as well as a
 * resource server, and a client that cannot hold a static secret can instead
 * send the user through a browser sign-in. Same endpoint, same tools, second
 * way of proving who you are. The profile token is untouched and keeps working.
 *
 * Four tables, one per stage of the flow:
 *
 *   oauth_clients   who is asking          (RFC 7591 dynamic registration)
 *   oauth_requests  a consent screen in flight, before the user has decided
 *   oauth_codes     the one-time code handed back on the redirect
 *   oauth_tokens    access and refresh tokens, the things `/mcp` accepts
 *
 * Every credential here is stored as a SHA-256 hash. That differs from
 * `profiles.gateway_token`, which is stored in the clear on purpose because
 * the dashboard has to render it back to you. Nothing re-displays an OAuth
 * token, so there is no reason to keep a recoverable copy of one, and a dump
 * of these tables grants an attacker nothing.
 *
 * `client_secret` is the exception: the SDK's client authentication middleware
 * compares it directly against what the client sent, so it has to round-trip.
 * In practice MCP clients register as public clients (PKCE, no secret) and the
 * column stays null.
 */

/** Hex-encoded SHA-256. Fixed width, so char(64) rather than a varchar. */
const HASH = 64;

export async function up(knex) {
  // ── who is asking ──────────────────────────────────────────────────────
  await knex.schema.createTable("oauth_clients", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));

    // Issued by the SDK's registration handler (a UUID), not by us -- so it is
    // its own column rather than the primary key.
    table.string("client_id").notNullable().unique();
    table.string("client_secret").nullable();
    table.bigInteger("client_secret_expires_at").nullable();
    table.bigInteger("client_id_issued_at").nullable();

    // Shown on the consent screen. A client that registers dynamically picks
    // its own name, so it is display data and never a trust signal.
    table.string("client_name").nullable();
    table.string("client_uri", 2048).nullable();
    table.string("logo_uri", 2048).nullable();
    table.string("policy_uri", 2048).nullable();
    table.string("tos_uri", 2048).nullable();
    table.string("software_id").nullable();
    table.string("software_version").nullable();

    // The allow-list the authorization endpoint validates against. An
    // unregistered redirect_uri is what an attacker would use to have the code
    // delivered to themselves, so this is the load-bearing column.
    table.jsonb("redirect_uris").notNullable();
    table.jsonb("grant_types").notNullable().defaultTo(JSON.stringify(["authorization_code", "refresh_token"]));
    table.jsonb("response_types").notNullable().defaultTo(JSON.stringify(["code"]));
    table.string("token_endpoint_auth_method").notNullable().defaultTo("none");
    table.string("scope").nullable();

    table.timestamps(true, true);
  });

  // ── a consent screen in flight ─────────────────────────────────────────
  // The gap between "client sent the user to /oauth/authorize" and "user
  // clicked Allow". The parameters have been validated by then, so they are
  // parked here rather than smuggled through the browser as query strings
  // where the user could edit them before approving.
  await knex.schema.createTable("oauth_requests", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));

    table
      .string("client_id")
      .notNullable()
      .references("client_id")
      .inTable("oauth_clients")
      .onDelete("CASCADE");

    table.string("redirect_uri", 2048).notNullable();
    // PKCE (RFC 7636). S256 only -- the token endpoint rejects anything else.
    table.string("code_challenge").notNullable();
    table.jsonb("scopes").notNullable().defaultTo("[]");
    // Opaque to us; handed back on the redirect for the client's CSRF check.
    table.text("state").nullable();
    // RFC 8707. Which resource server the eventual token is for.
    table.string("resource", 2048).nullable();

    table.timestamp("expires_at", { useTz: true }).notNullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.raw(`
    CREATE INDEX oauth_requests_expires_idx ON oauth_requests (expires_at)
  `);

  // ── the one-time code ──────────────────────────────────────────────────
  await knex.schema.createTable("oauth_codes", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));

    table.specificType("code_hash", `char(${HASH})`).notNullable().unique();

    table
      .string("client_id")
      .notNullable()
      .references("client_id")
      .inTable("oauth_clients")
      .onDelete("CASCADE");

    // Who approved, and what they chose to expose. The profile is the whole
    // point: consent is not "let Claude in", it is "let Claude see *these*
    // tools", and that decision has to survive into the token.
    table.uuid("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    table.uuid("profile_id").notNullable().references("id").inTable("profiles").onDelete("CASCADE");

    table.string("redirect_uri", 2048).notNullable();
    table.string("code_challenge").notNullable();
    table.jsonb("scopes").notNullable().defaultTo("[]");
    table.string("resource", 2048).nullable();

    table.timestamp("expires_at", { useTz: true }).notNullable();
    // Set on first exchange. A second attempt is either a botched retry or a
    // stolen code, and OAuth 2.1 says treat it as theft -- so the row is kept
    // after use rather than deleted, or replay would look like an unknown code.
    table.timestamp("consumed_at", { useTz: true }).nullable();

    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.raw(`
    CREATE INDEX oauth_codes_expires_idx ON oauth_codes (expires_at)
  `);

  // ── access and refresh tokens ──────────────────────────────────────────
  await knex.schema.createTable("oauth_tokens", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));

    table.specificType("token_hash", `char(${HASH})`).notNullable().unique();
    table.string("kind").notNullable(); // 'access' | 'refresh'

    table
      .string("client_id")
      .notNullable()
      .references("client_id")
      .inTable("oauth_clients")
      .onDelete("CASCADE");

    table.uuid("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    // Deleting a profile therefore revokes every token that exposed it, which
    // is the behaviour you want from a button labelled "delete".
    table.uuid("profile_id").notNullable().references("id").inTable("profiles").onDelete("CASCADE");

    table.jsonb("scopes").notNullable().defaultTo("[]");
    table.string("resource", 2048).nullable();

    // Ties a rotated refresh token to the one it replaced, so reuse of an old
    // token can revoke the entire lineage rather than just the token presented.
    table.uuid("family_id").notNullable();

    table.timestamp("expires_at", { useTz: true }).notNullable();
    table.timestamp("revoked_at", { useTz: true }).nullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // The gateway resolves a token to a profile on every single request. Unique
  // on token_hash already gives us that lookup as an index hit.
  await knex.schema.raw(`
    CREATE INDEX oauth_tokens_family_idx ON oauth_tokens (family_id)
  `);
  // "Which apps have access to my account", newest first.
  await knex.schema.raw(`
    CREATE INDEX oauth_tokens_user_created_idx ON oauth_tokens (user_id, created_at DESC)
  `);
  await knex.schema.raw(`
    CREATE INDEX oauth_tokens_expires_idx ON oauth_tokens (expires_at)
  `);
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("oauth_tokens");
  await knex.schema.dropTableIfExists("oauth_codes");
  await knex.schema.dropTableIfExists("oauth_requests");
  await knex.schema.dropTableIfExists("oauth_clients");
}
