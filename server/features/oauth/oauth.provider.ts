import crypto from "node:crypto";
import type { Response } from "express";
import {
  InvalidGrantError,
  InvalidRequestError,
  InvalidTokenError,
  ServerError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type {
  AuthorizationParams,
  OAuthServerProvider,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import * as data from "./oauth.data.js";
import { findProfile } from "../profiles/profiles.data.js";
import type { Uuid } from "../../../shared/domain.js";

/**
 * The authorization server behind `/mcp`.
 *
 * This implements the SDK's `OAuthServerProvider`, which means the SDK owns
 * the protocol -- parameter validation, PKCE verification, client
 * authentication, error shapes -- and this file owns only the decisions that
 * are ours: how long tokens live, what a code may be exchanged for, and which
 * profile a grant is bound to.
 *
 * That split is deliberate. The MCP security guidance is blunt about not
 * hand-rolling token validation or authorization logic, and the SDK's handlers
 * are the well-tested implementation it points at.
 *
 * The one thing that is genuinely ours is the profile binding. Everywhere else
 * an OAuth grant is "this user said yes"; here it is "this user said yes, to
 * *this* profile", because a profile is what decides which tools exist. That
 * id rides on the code, then on every token minted from it, and lands in the
 * gateway scope as if a profile token had been presented.
 */

/** Long enough to sign in and read the screen, short enough to be useless if leaked. */
const AUTHORIZATION_REQUEST_TTL_MS = 10 * 60 * 1000;
/** OAuth 2.1 asks for a short code lifetime; one minute is ample for a redirect. */
const CODE_TTL_MS = 60 * 1000;
/**
 * Access tokens expire in an hour, refresh tokens in thirty days.
 *
 * A stolen access token is therefore worth an hour, and clients re-prove
 * themselves hourly through the refresh flow. The SDK's bearer middleware
 * rejects any token with no expiry at all, so an infinite token is not an
 * option even if we wanted one.
 */
const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** The only scope this server issues. It maps to "everything the profile exposes". */
export const MCP_SCOPE = "mcp:tools";

/** Where the browser is sent to approve a request. Served by the SPA. */
const CONSENT_PATH = "/oauth/consent";

function expiresIn(ms: number): Date {
  return new Date(Date.now() + ms);
}

function secondsUntil(date: Date): number {
  return Math.max(0, Math.floor((date.getTime() - Date.now()) / 1000));
}

/* ── client store ──────────────────────────────────────────────────────── */

/**
 * Dynamic client registration, per RFC 7591.
 *
 * Open registration is what makes "paste a URL into Claude" work at all: the
 * client registers itself on first contact, with no coordination from us. It
 * grants nothing by itself -- a registered client with no user approval can
 * reach exactly zero tools.
 */
class ClientStore implements OAuthRegisteredClientsStore {
  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    const client = await data.findClient(clientId);
    if (!client) return undefined;

    return {
      client_id: client.client_id,
      client_secret: client.client_secret ?? undefined,
      // Stored as bigint, which the pg driver hands back as a string.
      client_secret_expires_at:
        client.client_secret_expires_at == null
          ? undefined
          : Number(client.client_secret_expires_at),
      client_id_issued_at:
        client.client_id_issued_at == null ? undefined : Number(client.client_id_issued_at),
      client_name: client.client_name ?? undefined,
      client_uri: client.client_uri ?? undefined,
      logo_uri: client.logo_uri ?? undefined,
      policy_uri: client.policy_uri ?? undefined,
      tos_uri: client.tos_uri ?? undefined,
      software_id: client.software_id ?? undefined,
      software_version: client.software_version ?? undefined,
      redirect_uris: client.redirect_uris,
      grant_types: client.grant_types,
      response_types: client.response_types,
      token_endpoint_auth_method: client.token_endpoint_auth_method,
      scope: client.scope ?? undefined,
    };
  }

  async registerClient(
    client: OAuthClientInformationFull,
  ): Promise<OAuthClientInformationFull> {
    // The SDK generates the id and secret before handing the record over.
    await data.insertClient({
      client_id: client.client_id,
      client_secret: client.client_secret ?? null,
      client_secret_expires_at: client.client_secret_expires_at ?? null,
      client_id_issued_at: client.client_id_issued_at ?? null,
      client_name: client.client_name ?? null,
      client_uri: client.client_uri ?? null,
      logo_uri: client.logo_uri ?? null,
      policy_uri: client.policy_uri ?? null,
      tos_uri: client.tos_uri ?? null,
      software_id: client.software_id ?? null,
      software_version: client.software_version ?? null,
      redirect_uris: client.redirect_uris,
      grant_types: client.grant_types ?? ["authorization_code", "refresh_token"],
      response_types: client.response_types ?? ["code"],
      token_endpoint_auth_method: client.token_endpoint_auth_method ?? "none",
      scope: client.scope ?? MCP_SCOPE,
    });

    return client;
  }
}

/* ── provider ──────────────────────────────────────────────────────────── */

export class SirupOAuthProvider implements OAuthServerProvider {
  readonly clientsStore = new ClientStore();

  /**
   * Step one: park the request and send the user to the consent screen.
   *
   * The SDK has already checked the client exists, the redirect_uri is one it
   * registered, and PKCE is present with S256. What is left is a human
   * decision, which cannot happen inside a request handler -- so the validated
   * parameters go to the database and the browser gets a redirect carrying
   * nothing but an opaque row id.
   *
   * Putting them in the URL instead would let the user edit the redirect_uri
   * or the challenge between here and clicking Allow.
   */
  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    const request = await data.insertRequest({
      client_id: client.client_id,
      redirect_uri: params.redirectUri,
      code_challenge: params.codeChallenge,
      scopes: params.scopes?.length ? params.scopes : [MCP_SCOPE],
      state: params.state ?? null,
      resource: params.resource?.href ?? null,
      expires_at: expiresIn(AUTHORIZATION_REQUEST_TTL_MS),
    });

    res.redirect(302, `${CONSENT_PATH}?request=${request.id}`);
  }

  /**
   * Approves a parked request and mints the code.
   *
   * Called from the consent route once a signed-in user has picked a profile
   * and clicked Allow -- not by the SDK. Returns the redirect the browser
   * should follow, rather than issuing it, so the caller can answer the fetch
   * that the consent screen made.
   */
  async approve(
    requestId: string,
    userId: Uuid,
    profileId: Uuid,
  ): Promise<{ redirectTo: string }> {
    const request = await data.findRequest(requestId as Uuid);
    if (!request) throw new InvalidRequestError("Unknown authorization request.");

    if (request.expires_at.getTime() < Date.now()) {
      await data.deleteRequest(request.id);
      throw new InvalidRequestError("This authorization request has expired.");
    }

    // Re-check ownership at approval time. The profile id arrives from the
    // browser, so trusting it would let anyone grant a client access to a
    // profile they do not own.
    const profile = await findProfile(userId, profileId);
    if (!profile) throw new InvalidRequestError("Unknown profile.");

    const code = data.newAuthorizationCode();

    await data.insertCode({
      code_hash: data.hashToken(code),
      client_id: request.client_id,
      user_id: userId,
      profile_id: profile.id,
      redirect_uri: request.redirect_uri,
      code_challenge: request.code_challenge,
      scopes: request.scopes,
      resource: request.resource,
      expires_at: expiresIn(CODE_TTL_MS),
    });

    // One approval, one code.
    await data.deleteRequest(request.id);

    const redirect = new URL(request.redirect_uri);
    redirect.searchParams.set("code", code);
    if (request.state) redirect.searchParams.set("state", request.state);

    return { redirectTo: redirect.href };
  }

  /** Declines a parked request, returning the client's own error redirect. */
  async deny(requestId: string): Promise<{ redirectTo: string }> {
    const request = await data.findRequest(requestId as Uuid);
    if (!request) throw new InvalidRequestError("Unknown authorization request.");

    await data.deleteRequest(request.id);

    const redirect = new URL(request.redirect_uri);
    redirect.searchParams.set("error", "access_denied");
    redirect.searchParams.set("error_description", "The user declined the request.");
    if (request.state) redirect.searchParams.set("state", request.state);

    return { redirectTo: redirect.href };
  }

  /**
   * Hands the SDK the challenge to verify `code_verifier` against.
   *
   * PKCE is checked by the SDK's token handler, not here -- see
   * `skipLocalPkceValidation`, which stays false so that verification happens
   * in tested library code rather than ours.
   */
  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const code = await data.findCodeByHash(data.hashToken(authorizationCode));
    if (!code || code.client_id !== client.client_id) {
      throw new InvalidGrantError("Invalid authorization code.");
    }
    return code.code_challenge;
  }

  /** Exchanges a code for tokens. The code is spent whatever happens next. */
  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
    resource?: URL,
  ): Promise<OAuthTokens> {
    const code = await data.findCodeByHash(data.hashToken(authorizationCode));

    if (!code || code.client_id !== client.client_id) {
      throw new InvalidGrantError("Invalid authorization code.");
    }
    if (code.expires_at.getTime() < Date.now()) {
      throw new InvalidGrantError("The authorization code has expired.");
    }
    // RFC 6749 §4.1.3: the redirect_uri must match the one the code was
    // issued against, so a code intercepted from one client cannot be
    // redeemed by another that happens to share a registration.
    if (redirectUri !== undefined && redirectUri !== code.redirect_uri) {
      throw new InvalidGrantError("redirect_uri does not match the authorization request.");
    }

    // Atomic: a replayed code loses the race and is refused here.
    if (!(await data.consumeCode(code.id))) {
      throw new InvalidGrantError("This authorization code has already been used.");
    }

    return this.issue({
      clientId: client.client_id,
      userId: code.user_id,
      profileId: code.profile_id,
      scopes: code.scopes,
      // RFC 8707: prefer the resource named at exchange time, falling back to
      // the one the code was bound to.
      resource: resource?.href ?? code.resource,
      familyId: crypto.randomUUID(),
    });
  }

  /**
   * Rotates a refresh token.
   *
   * Every refresh returns a new refresh token and revokes the one presented,
   * as OAuth 2.1 requires for public clients. Because the old token is
   * revoked rather than deleted, presenting it again is detectable -- and that
   * means the token leaked, so the whole family dies.
   */
  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    resource?: URL,
  ): Promise<OAuthTokens> {
    const existing = await data.findTokenByHash(data.hashToken(refreshToken));

    if (!existing || existing.kind !== "refresh" || existing.client_id !== client.client_id) {
      throw new InvalidGrantError("Invalid refresh token.");
    }

    if (existing.revoked_at) {
      // Replay of a rotated token. Assume theft and cut off the lineage.
      await data.revokeFamily(existing.family_id);
      throw new InvalidGrantError("This refresh token has already been used.");
    }

    if (existing.expires_at.getTime() < Date.now()) {
      throw new InvalidGrantError("The refresh token has expired.");
    }

    // A client may narrow its scopes on refresh, never widen them.
    const granted = existing.scopes;
    const requested = scopes?.length ? scopes : granted;
    if (requested.some((scope) => !granted.includes(scope))) {
      throw new InvalidGrantError("Cannot request scopes beyond the original grant.");
    }

    await data.revokeToken(existing.id);

    return this.issue({
      clientId: client.client_id,
      userId: existing.user_id,
      profileId: existing.profile_id,
      scopes: requested,
      resource: resource?.href ?? existing.resource,
      familyId: existing.family_id,
    });
  }

  /**
   * Validates an access token for the gateway.
   *
   * The `extra` payload is how the profile binding reaches the request
   * handler: `gatewayRoutes` reads it back out to build the same scope a
   * profile token would have produced.
   */
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const record = await data.findTokenByHash(data.hashToken(token));

    if (!record || record.kind !== "access") {
      throw new InvalidTokenError("Invalid access token.");
    }
    if (record.revoked_at) {
      throw new InvalidTokenError("This access token has been revoked.");
    }
    if (record.expires_at.getTime() < Date.now()) {
      throw new InvalidTokenError("The access token has expired.");
    }
    // The profile is fetched by the relation; if it is gone the grant points
    // at nothing and must not resolve to some fallback.
    if (!record.profile) {
      throw new InvalidTokenError("The profile this token was issued for no longer exists.");
    }

    return {
      token,
      clientId: record.client_id,
      scopes: record.scopes,
      expiresAt: Math.floor(record.expires_at.getTime() / 1000),
      resource: record.resource ? new URL(record.resource) : undefined,
      extra: {
        userId: record.user_id,
        companyId: record.profile.company_id,
        profileId: record.profile_id,
        profileName: record.profile.name,
      },
    };
  }

  /** RFC 7009. Revoking an unknown or already-revoked token is a silent success. */
  async revokeToken(
    client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ): Promise<void> {
    const record = await data.findTokenByHash(data.hashToken(request.token));
    if (!record || record.client_id !== client.client_id) return;

    // Revoking a refresh token ends the session, not just that one credential.
    if (record.kind === "refresh") await data.revokeFamily(record.family_id);
    else await data.revokeToken(record.id);
  }

  /** Mints an access/refresh pair against one profile. */
  private async issue(grant: {
    clientId: string;
    userId: Uuid;
    profileId: Uuid;
    scopes: string[];
    resource: string | null;
    familyId: string;
  }): Promise<OAuthTokens> {
    const accessToken = data.newAccessToken();
    const refreshToken = data.newRefreshToken();
    const accessExpiry = expiresIn(ACCESS_TOKEN_TTL_MS);

    const shared = {
      client_id: grant.clientId,
      user_id: grant.userId,
      profile_id: grant.profileId,
      scopes: grant.scopes,
      resource: grant.resource,
      family_id: grant.familyId as Uuid,
    };

    try {
      await data.insertToken({
        ...shared,
        token_hash: data.hashToken(accessToken),
        kind: "access",
        expires_at: accessExpiry,
      });
      await data.insertToken({
        ...shared,
        token_hash: data.hashToken(refreshToken),
        kind: "refresh",
        expires_at: expiresIn(REFRESH_TOKEN_TTL_MS),
      });
    } catch (error) {
      console.error("[oauth] could not issue tokens:", error);
      throw new ServerError("Could not issue tokens.");
    }

    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: secondsUntil(accessExpiry),
      scope: grant.scopes.join(" "),
      refresh_token: refreshToken,
    };
  }
}

export const oauthProvider = new SirupOAuthProvider();
