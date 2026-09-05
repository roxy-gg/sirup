import crypto from "node:crypto";
import { auth } from "@modelcontextprotocol/sdk/client/auth.js";
import { z } from "zod";
import { config } from "../config.js";
import { knex } from "../database/knex.js";
import {
  McpOAuthCredentialModel,
  McpOAuthRequestModel,
  McpServerModel,
} from "../database/models/index.js";
import { refreshServerTools } from "../mcp/aggregator.js";
import { release } from "../mcp/connectionPool.js";
import { ApiError } from "../shared/errors.js";
import { slugify, uniqueSlug } from "../shared/slug.js";
import { findProfile } from "../features/profiles/profiles.data.js";
import { listSlugs } from "../features/mcp-servers/mcpServers.data.js";
import type { Uuid } from "../../shared/domain.js";
import { hashOAuthState, randomOAuthState } from "./crypto.js";
import * as data from "./oauth.data.js";
import { StoredOAuthClientProvider, encryptOAuthTokens } from "./oauthProvider.js";
import { findOAuthIntegration } from "./registry.js";
import { oauthFetchFor } from "./oauthFetch.js";

const startSchema = z.object({
  name: z.string().trim().min(1, "Give this account a name.").max(60),
  profile_id: z.string().uuid("Choose a valid profile."),
});

function callbackUrl(path: string): string {
  if (!config.appOrigin) throw ApiError.conflict("APP_ORIGIN is not configured.");
  return new URL(path, `${config.appOrigin}/`).toString();
}

function integrationOrThrow(key: string) {
  const integration = findOAuthIntegration(key);
  if (!integration) throw ApiError.notFound("Integration not found.");
  if (integration.unavailableReason) {
    throw ApiError.conflict(integration.unavailableReason);
  }
  return integration;
}

function safeReturnUrl(params: Record<string, string>): string {
  const url = new URL("/mcp", `${config.appOrigin ?? "http://localhost"}/`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return config.appOrigin ? url.toString() : `${url.pathname}${url.search}`;
}

function callbackError(message: string): { redirectUrl: string } {
  return { redirectUrl: safeReturnUrl({ oauth_error: message.slice(0, 300) }) };
}

/**
 * Starts an authorization-code flow and returns the provider URL to send the
 * browser to, plus a one-time nonce the caller stores as an HttpOnly cookie.
 */
export async function start(
  scope: { userId: Uuid; companyId: Uuid },
  integrationKey: string,
  payload: unknown,
): Promise<{ authorizationUrl: string; browserNonce: string; state: string }> {
  const integration = integrationOrThrow(integrationKey);
  const input = startSchema.parse(payload);
  const profileId = input.profile_id as Uuid;
  if (!(await findProfile(scope.userId, profileId))) {
    throw ApiError.notFound("Profile not found.");
  }

  // Opportunistic cleanup keeps abandoned browser flows bounded without a
  // scheduler. Concurrent tabs retain independent PKCE/state transactions.
  await data.deleteExpiredRequests();

  const state = randomOAuthState();
  const browserNonce = randomOAuthState();
  const request = await data.insertRequest({
    user_id: scope.userId,
    company_id: scope.companyId,
    profile_id: profileId,
    integration_key: integration.key,
    connection_name: input.name,
    state_hash: hashOAuthState(state),
    browser_nonce_hash: hashOAuthState(browserNonce),
    expires_at: new Date(Date.now() + config.oauthRequestTtlMs),
  });

  const provider = new StoredOAuthClientProvider({
    integration,
    redirectUrl: callbackUrl(integration.callbackPath),
    request,
    state,
  });

  try {
    const result = await auth(provider, {
      serverUrl: integration.serverUrl,
      scope: integration.scopes.join(" "),
      fetchFn: oauthFetchFor(integration),
    });
    if (result !== "REDIRECT") {
      throw new Error("The OAuth provider did not start an authorization redirect.");
    }
    return {
      authorizationUrl: provider.takeAuthorizationUrl().toString(),
      browserNonce,
      state,
    };
  } catch (error) {
    await data.deleteRequest(request.id);
    throw error;
  }
}

/**
 * Completes the flow: exchanges the code, stores the encrypted grant, creates
 * the connection, discovers its tools, and attaches it to the chosen profile.
 */
export async function callback(
  browserNonce: string | undefined,
  query: {
    state?: unknown;
    code?: unknown;
    error?: unknown;
    error_description?: unknown;
    iss?: unknown;
  },
): Promise<{ redirectUrl: string }> {
  const state = typeof query.state === "string" ? query.state : "";
  if (!state || state.length > 200 || !browserNonce || browserNonce.length > 200) {
    return callbackError("Invalid OAuth state.");
  }

  const request = await data.findActiveRequestByStateHash(hashOAuthState(state));
  if (
    !request ||
    !crypto.timingSafeEqual(
      Buffer.from(request.browser_nonce_hash, "hex"),
      Buffer.from(hashOAuthState(browserNonce), "hex"),
    )
  ) {
    return callbackError("This sign-in link is invalid, expired, or already used.");
  }

  const integration = findOAuthIntegration(request.integration_key);
  if (
    !integration ||
    integration.callbackPath !== "/api/integrations/oauth/callback" ||
    integration.unavailableReason
  ) {
    void data.deleteRequest(request.id).catch(() => {});
    return callbackError(
      integration?.unavailableReason ?? "Integration not found.",
    );
  }
  if (
    integration.authorizationIssuer &&
    ((integration.requireCallbackIssuer && typeof query.iss !== "string") ||
      (typeof query.iss === "string" && query.iss !== integration.authorizationIssuer))
  ) {
    void data.deleteRequest(request.id).catch(() => {});
    return callbackError("Authorization response came from an unexpected issuer.");
  }

  if (typeof query.error === "string") {
    const detail =
      typeof query.error_description === "string"
        ? query.error_description
        : "Authorization was cancelled.";
    void data.deleteRequest(request.id).catch(() => {});
    return callbackError(detail);
  }

  const code = typeof query.code === "string" ? query.code : "";
  if (!code) {
    void data.deleteRequest(request.id).catch(() => {});
    return callbackError("Missing authorization code.");
  }

  // Claim immediately before the code exchange. Validation failures delete the
  // transaction; concurrent successful callbacks cannot both pass this update.
  if (!(await data.consumeRequest(request.id))) {
    return callbackError("This sign-in link is invalid, expired, or already used.");
  }

  let serverId: Uuid | null = null;
  try {
    // Re-read because startAuthorization persisted PKCE/discovery after the
    // request object was created, and this callback may run in another process.
    const persistedRequest = await McpOAuthRequestModel.query().findById(request.id);
    if (!persistedRequest) throw new Error("OAuth request no longer exists.");

    const provider = new StoredOAuthClientProvider({
      integration,
      redirectUrl: callbackUrl(integration.callbackPath),
      request: persistedRequest,
    });
    const result = await auth(provider, {
      serverUrl: integration.serverUrl,
      authorizationCode: code,
      scope: integration.scopes.join(" "),
      fetchFn: oauthFetchFor(integration),
    });
    if (result !== "AUTHORIZED") {
      throw new Error("OAuth authorization was not completed.");
    }

    const tokens = provider.takeExchangedTokens();
    if (!tokens.refresh_token) {
      throw new Error(
        "Google did not return offline access. Remove sirup from your Google account permissions and try again.",
      );
    }

    const slugs = await listSlugs(request.user_id);
    const slug = uniqueSlug(
      slugify(request.connection_name),
      new Set(slugs.map((row) => row.slug)),
    );

    serverId = crypto.randomUUID() as Uuid;
    await knex.transaction(async (trx) => {
      await McpServerModel.query(trx).insert({
        id: serverId!,
        user_id: request.user_id,
        company_id: request.company_id,
        name: request.connection_name,
        slug,
        url: integration.serverUrl,
        integration_key: integration.key,
        auth_type: "oauth",
        auth_header_name: null,
        auth_value: null,
        status: "pending",
      });
      await McpOAuthCredentialModel.query(trx).insert({
        server_id: serverId!,
        integration_key: integration.key,
        encrypted_tokens: encryptOAuthTokens(tokens, serverId!),
        granted_scopes: tokens.scope ?? integration.scopes.join(" "),
        discovery_state: persistedRequest.discovery_state,
        reauthorization_required: false,
        authorized_at: new Date(),
      });
      // Same as a direct connect: the account lands on the profile the user
      // started the flow from, so its tools are usable straight away.
      await trx("profile_servers").insert({
        profile_id: request.profile_id,
        server_id: serverId,
      });
    });

    const server = await McpServerModel.query().findById(serverId);
    if (!server) throw new Error("Connected server was not created.");

    const connectedServerId = serverId;
    serverId = null;
    try {
      await refreshServerTools(server);
    } catch {
      // The saved server carries the discovery error and stays retryable.
    }
    release(connectedServerId);

    void data.deleteRequest(request.id).catch(() => {});
    return { redirectUrl: safeReturnUrl({ oauth_server: connectedServerId }) };
  } catch (error) {
    // A failed exchange leaves no server; a failed post-create step rolls the
    // connection back so the user can simply retry.
    if (serverId) await McpServerModel.query().deleteById(serverId);
    void data.deleteRequest(request.id).catch(() => {});
    const message = error instanceof Error ? error.message : "OAuth failed.";
    return callbackError(message);
  }
}
