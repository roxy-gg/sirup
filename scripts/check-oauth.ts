/**
 * Exercises managed OAuth end to end without requiring a real Google account.
 * Google discovery, token exchange, and the Gmail MCP endpoint are represented
 * by deterministic fetch responses; sirup's actual SDK and database paths run.
 *
 * Usage: npm run check:oauth
 */
import crypto from "node:crypto";
import { Checks, uniqueEmail } from "./_harness.js";

process.env.CREDENTIAL_ENCRYPTION_KEY ??= crypto.randomBytes(32).toString("hex");
process.env.GOOGLE_OAUTH_CLIENT_ID ??= "test-client.apps.googleusercontent.com";
process.env.GOOGLE_OAUTH_CLIENT_SECRET ??= "test-secret";

const { knex } = await import("../server/database/knex.js");
const {
  CompanyModel,
  McpOAuthCredentialModel,
  McpOAuthRequestModel,
  McpServerModel,
  ProfileModel,
  UserModel,
} = await import("../server/database/models/index.js");
const { decryptSecret, encryptSecret, hashOAuthState } = await import(
  "../server/integrations/crypto.js"
);
const oauthData = await import("../server/integrations/oauth.data.js");
const oauthLogic = await import("../server/integrations/oauth.logic.js");
const { list } = await import("../server/features/mcp-catalog/mcpCatalog.logic.js");
const { release } = await import("../server/mcp/connectionPool.js");

const t = new Checks("Managed OAuth flow");
const originalFetch = globalThis.fetch;
let tokenExchanges = 0;
let authenticatedMcpCalls = 0;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Stands in for Google. Any request outside the allowlist fails the run. */
globalThis.fetch = (async (input, init) => {
  const url = input instanceof Request ? input.url : String(input);

  if (
    ![
      "https://gmailmcp.googleapis.com",
      "https://accounts.google.com",
      "https://oauth2.googleapis.com",
    ].includes(new URL(url).origin)
  ) {
    throw new Error(`OAuth escaped the provider allowlist: ${url}`);
  }

  if (
    url ===
    "https://gmailmcp.googleapis.com/.well-known/oauth-protected-resource/mcp/v1"
  ) {
    return json({
      authorization_servers: ["https://accounts.google.com/"],
      bearer_methods_supported: ["header"],
      resource: "https://gmailmcp.googleapis.com/mcp/v1",
      scopes_supported: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.compose",
      ],
    });
  }

  if (url === "https://accounts.google.com/.well-known/oauth-authorization-server") {
    return json({
      issuer: "https://accounts.google.com",
      authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      token_endpoint: "https://oauth2.googleapis.com/token",
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: [
        "client_secret_basic",
        "client_secret_post",
      ],
      code_challenge_methods_supported: ["S256"],
    });
  }

  if (url === "https://oauth2.googleapis.com/token") {
    tokenExchanges += 1;
    const body = String(init?.body ?? "");
    t.check("token exchange sends the PKCE verifier", body.includes("code_verifier="));
    t.check(
      "token exchange binds the Gmail MCP resource",
      body.includes(encodeURIComponent("https://gmailmcp.googleapis.com/mcp/v1")),
    );
    return json({
      access_token: `access-${tokenExchanges}`,
      refresh_token: `refresh-${tokenExchanges}`,
      token_type: "Bearer",
      expires_in: 3600,
      scope:
        "https://www.googleapis.com/auth/gmail.readonly " +
        "https://www.googleapis.com/auth/gmail.compose",
    });
  }

  if (url === "https://gmailmcp.googleapis.com/mcp/v1") {
    if (init?.method === "GET") return new Response(null, { status: 405 });

    const authorization = new Headers(init?.headers).get("authorization");
    if (authorization?.startsWith("Bearer access-")) authenticatedMcpCalls += 1;

    const request = JSON.parse(String(init?.body ?? "{}")) as {
      id?: number;
      method?: string;
      params?: { protocolVersion?: string };
    };
    if (request.method === "initialize") {
      return json({
        jsonrpc: "2.0",
        id: request.id,
        result: {
          protocolVersion: request.params?.protocolVersion ?? "2025-11-25",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "Fake Gmail MCP", version: "1.0.0" },
        },
      });
    }
    if (request.method === "notifications/initialized") {
      return new Response(null, { status: 202 });
    }
    if (request.method === "tools/list") {
      return json({
        jsonrpc: "2.0",
        id: request.id,
        result: {
          tools: [
            {
              name: "search_threads",
              description: "Search email threads.",
              inputSchema: { type: "object", properties: {} },
            },
            {
              name: "create_draft",
              description: "Create an email draft.",
              inputSchema: { type: "object", properties: {} },
            },
            {
              name: "trash_thread",
              description: "Move a thread to trash.",
              inputSchema: { type: "object", properties: {} },
            },
          ],
        },
      });
    }
  }

  throw new Error(`Unexpected OAuth test request: ${init?.method ?? "GET"} ${url}`);
}) as typeof fetch;

const company = await CompanyModel.query().insert({
  name: "OAuth Check",
  slug: `oauth-check-${Date.now()}`,
});
const user = await UserModel.query().insert({
  email: uniqueEmail("oauth"),
  password_hash: "not-used",
  company_id: company.id,
});
const profile = await ProfileModel.query().insert({
  user_id: user.id,
  company_id: company.id,
  name: "Main",
  slug: "main",
  gateway_token: `sirup_${crypto.randomBytes(24).toString("base64url")}`,
  is_default: true,
});
const connectedIds: string[] = [];

try {
  // --- encryption at rest ---
  const secret = { refresh_token: "refresh-secret", access_token: "access-secret" };
  const encrypted = encryptSecret(secret, `test:${user.id}`);
  t.check(
    "OAuth secrets are not stored as plaintext",
    !encrypted.includes("refresh-secret"),
  );
  t.check(
    "encrypted OAuth secrets round-trip",
    decryptSecret<typeof secret>(encrypted, `test:${user.id}`).refresh_token ===
      secret.refresh_token,
  );

  let wrongContextRejected = false;
  try {
    decryptSecret(encrypted, "test:another-user");
  } catch {
    wrongContextRejected = true;
  }
  t.check("ciphertext is bound to its record context", wrongContextRejected);

  /** Drives one full sign-in, asserting the security properties on the way. */
  async function connectAccount(name: string) {
    const started = await oauthLogic.start(
      { userId: user.id, companyId: company.id },
      "gmail",
      { name, profile_id: profile.id },
    );
    const authorizationUrl = new URL(started.authorizationUrl);
    const state = authorizationUrl.searchParams.get("state") ?? "";

    t.check(
      "authorization uses Google's endpoint",
      authorizationUrl.origin === "https://accounts.google.com",
    );
    t.check(
      "authorization uses PKCE S256",
      authorizationUrl.searchParams.get("code_challenge_method") === "S256",
    );
    t.check(
      "authorization requests offline access",
      authorizationUrl.searchParams.get("access_type") === "offline",
    );
    t.check(
      "authorization always shows the account picker",
      authorizationUrl.searchParams.get("prompt") === "consent select_account",
    );
    t.check("authorization has high-entropy state", state.length >= 40, state.length);

    const request = await oauthData.findActiveRequestByStateHash(hashOAuthState(state));
    t.check("OAuth state is stored only as a hash", request?.state_hash !== state);
    t.check(
      "PKCE verifier is encrypted at rest",
      Boolean(request?.encrypted_code_verifier?.startsWith("v1.")),
    );
    if (!request?.encrypted_code_verifier) throw new Error("missing PKCE verifier");

    // A forwarded authorization link must not bind the grant to someone else.
    const crossed = await oauthLogic.callback("wrong-browser-nonce", {
      state,
      code: "wrong-browser",
      iss: "https://accounts.google.com",
    });
    t.check(
      "another browser cannot complete this OAuth request",
      new URL(crossed.redirectUrl).searchParams.has("oauth_error"),
    );

    const missingIssuer = await oauthLogic.callback(started.browserNonce, {
      state,
      code: `code-${name}`,
    });
    t.check(
      "Google callback requires its advertised issuer",
      new URL(missingIssuer.redirectUrl).searchParams.has("oauth_error"),
    );

    // The failed issuer check consumed that request, so start a clean flow.
    const retried = await oauthLogic.start(
      { userId: user.id, companyId: company.id },
      "gmail",
      { name, profile_id: profile.id },
    );
    const validState =
      new URL(retried.authorizationUrl).searchParams.get("state") ?? "";

    const result = await oauthLogic.callback(retried.browserNonce, {
      state: validState,
      code: `code-${name}`,
      iss: "https://accounts.google.com",
    });
    const replay = await oauthLogic.callback(retried.browserNonce, {
      state: validState,
      code: `code-${name}`,
      iss: "https://accounts.google.com",
    });
    t.check(
      "a consumed OAuth state cannot be replayed",
      new URL(replay.redirectUrl).searchParams.has("oauth_error"),
    );

    const serverId = new URL(result.redirectUrl).searchParams.get("oauth_server");
    if (!serverId) throw new Error(`OAuth callback failed: ${result.redirectUrl}`);
    connectedIds.push(serverId);

    const server = await McpServerModel.query()
      .findById(serverId)
      .withGraphFetched("tools");
    if (!server) throw new Error("OAuth callback did not create a server");
    return server;
  }

  const work = await connectAccount("Gmail work");
  const personal = await connectAccount("Gmail personal");

  // --- multi-account ---
  t.check("two Gmail accounts create separate rows", work.id !== personal.id);
  t.check("two Gmail accounts get separate namespaces", work.slug !== personal.slug);
  t.check(
    "OAuth connections keep provider identity",
    work.integration_key === "gmail" && personal.integration_key === "gmail",
  );

  // --- passthrough: every upstream tool is exposed, enabled, immediately ---
  t.check(
    "every Gmail tool is passed through",
    work.status === "connected" && work.tool_count === 3,
    `${work.status}, ${work.tool_count} tools`,
  );
  t.check(
    "passed-through tools are enabled by default",
    (work.tools ?? []).length === 3 && (work.tools ?? []).every((tool) => tool.enabled),
  );
  t.check("the connection is live immediately", work.enabled === true);
  t.check("MCP discovery uses the stored bearer grant", authenticatedMcpCalls >= 4);

  // --- the gateway actually serves them ---
  const exposed = await knex("mcp_tools as t")
    .join("mcp_servers as s", "s.id", "t.server_id")
    .join("profile_servers as ps", "ps.server_id", "s.id")
    .where("ps.profile_id", profile.id)
    .where("s.enabled", true)
    .where("t.enabled", true)
    .count<{ count: string }[]>("t.id as count")
    .first();
  t.check(
    "both accounts' tools reach the endpoint",
    Number(exposed?.count ?? 0) === 6,
    exposed?.count,
  );

  const attached = (await knex("profile_servers")
    .where({ profile_id: profile.id })
    .pluck("server_id")) as string[];
  t.check(
    "both accounts attach to the profile that started the flow",
    connectedIds.every((id) => attached.includes(id)),
  );

  // --- credentials at rest ---
  const credential = await McpOAuthCredentialModel.query().findById(work.id);
  if (!credential) throw new Error("OAuth credential was not persisted");
  t.check(
    "refresh tokens are ciphertext in Postgres",
    !credential.encrypted_tokens.includes("refresh-1"),
  );
  t.check(
    "the encrypted grant remains usable",
    decryptSecret<{ refresh_token: string }>(
      credential.encrypted_tokens,
      `mcp-oauth-tokens:${work.id}`,
    ).refresh_token === "refresh-1",
  );
  t.check(
    "credentials are never serialised to the API",
    !("encrypted_tokens" in credential.toJSON()),
  );

  // --- catalog ---
  const catalog = list([
    { url: work.url, integration_key: work.integration_key },
    { url: personal.url, integration_key: personal.integration_key },
  ]);
  const gmail = catalog[0];
  t.check("Gmail is the first catalog entry", gmail?.key === "gmail", gmail?.key);
  t.check("Gmail uses the managed OAuth connector", gmail?.connect_mode === "oauth");
  t.check("Gmail is marked connected by integration key", gmail?.connected === true);

  // --- expiry ---
  const expired = await McpOAuthRequestModel.query().insert({
    user_id: user.id,
    company_id: company.id,
    profile_id: profile.id,
    integration_key: "gmail",
    connection_name: "Expired Gmail",
    state_hash: hashOAuthState("expired-state"),
    browser_nonce_hash: hashOAuthState("expired-nonce"),
    expires_at: new Date(Date.now() - 1000),
  });
  t.check(
    "expired state cannot be claimed",
    !(await oauthData.consumeRequest(expired.id)),
  );
} finally {
  connectedIds.forEach((id) => release(id));
  globalThis.fetch = originalFetch;
  await CompanyModel.query().deleteById(company.id);
  await knex.destroy();
}

t.finish();
