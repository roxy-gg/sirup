import express from "express";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { OAuthError, ServerError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { config } from "../../config.js";
import { asyncRoute } from "../../shared/errors.js";
import { ApiError } from "../../shared/errors.js";
import {
  requireAuth,
  requireCompany,
  requireContext,
  type AuthedRequest,
} from "../../middleware/requireAuth.js";
import { oauthProvider, MCP_SCOPE } from "./oauth.provider.js";
import * as data from "./oauth.data.js";
import { findProfile } from "../profiles/profiles.data.js";
import { list as listProfiles } from "../profiles/profiles.logic.js";
import type {
  ConsentDecisionResponse,
  ConsentRequestResponse,
  ConnectedAppListResponse,
} from "../../../shared/api.js";
import type { Uuid } from "../../../shared/domain.js";

/**
 * ROUTE -- the OAuth surface.
 *
 * Two routers, mounted separately in `server/index.ts`:
 *
 *   oauthProtocolRouter  the spec endpoints, at the application root, because
 *                        RFC 8414 and RFC 9728 fix their paths under
 *                        /.well-known and clients look there and nowhere else.
 *
 *   oauthConsentRouter   our own JSON API for the consent screen, under /api
 *                        with the rest of the dashboard endpoints.
 *
 * The protocol router is the SDK's, not ours. It provides /authorize, /token,
 * /register, /revoke and both metadata documents, and it enforces PKCE, client
 * authentication, and redirect_uri matching. We supply the provider it calls
 * into and nothing else.
 */

/**
 * Where this server lives, as an absolute URL.
 *
 * Needed because the OAuth metadata documents advertise absolute endpoints and
 * RFC 8707 resource identifiers -- there is no relative form. In production it
 * must be the real public origin: get it wrong and clients will send users to
 * the wrong authorization endpoint, or reject the token audience.
 *
 * This is `APP_ORIGIN`, the same variable the outbound Google integration uses
 * to build its callback URLs. Both directions need "the URL the world reaches
 * us at", and two variables for one fact is a configuration trap -- set one
 * and not the other and half the OAuth surface silently points somewhere
 * wrong. `config.appOrigin` is null only in production with nothing set, which
 * is a misconfiguration rather than a state worth rendering.
 */
export function publicOrigin(): string {
  const origin = config.appOrigin;
  if (!origin) {
    throw new Error(
      "APP_ORIGIN must be set in production, e.g. https://sirup.gg. It is the OAuth issuer and resource identifier.",
    );
  }
  return origin.replace(/\/+$/, "");
}

/** The resource identifier for the gateway, per RFC 8707. */
export function resourceUrl(): URL {
  return new URL(`${publicOrigin()}/mcp`);
}

/**
 * The RFC 9728 pointer that a 401 must carry.
 *
 * This is the thread the whole discovery flow hangs from: an unauthenticated
 * client gets a 401, reads this URL out of `WWW-Authenticate`, and follows it
 * to find out where to send the user. Without it a client can only guess.
 */
export function protectedResourceMetadataUrl(): string {
  return `${publicOrigin()}/.well-known/oauth-protected-resource/mcp`;
}

/* ── protocol endpoints ────────────────────────────────────────────────── */

export const oauthProtocolRouter = express.Router();

/**
 * The SDK's router bundles its own Express 5 while this app runs Express 4.
 * The two interoperate here because a router is just a middleware function --
 * verified end to end by `npm run check:oauth`, which drives a real client
 * through discovery, registration, consent, and a tool call.
 */
oauthProtocolRouter.use(
  mcpAuthRouter({
    provider: oauthProvider,
    issuerUrl: new URL(publicOrigin()),
    // The gateway is the protected resource; the issuer is the app itself.
    // Naming them separately is what makes the PRM document point at /mcp
    // rather than at the site root.
    resourceServerUrl: resourceUrl(),
    scopesSupported: [MCP_SCOPE],
    resourceName: "sirup.gg",
  }),
);

/**
 * The same metadata at the bare well-known path.
 *
 * RFC 9728 puts the document at a path derived from the resource, which for
 * `/mcp` means `/.well-known/oauth-protected-resource/mcp` -- that is what the
 * router above serves, and what our 401 points at. But some clients probe the
 * unsuffixed path first, and without this they would reach the SPA catch-all
 * and get HTML with a 200, which reads as a malformed document rather than
 * "look somewhere else".
 *
 * The body is identical, so `resource` still names `/mcp`: a client that lands
 * here is told the truth about what is protected, rather than being left to
 * infer that the site root is an MCP endpoint.
 */
oauthProtocolRouter.get("/.well-known/oauth-protected-resource", (_req, res) => {
  res.json({
    resource: resourceUrl().href,
    authorization_servers: [`${publicOrigin()}/`],
    scopes_supported: [MCP_SCOPE],
    resource_name: "sirup.gg",
  });
});

/* ── consent ───────────────────────────────────────────────────────────── */

export const oauthConsentRouter = express.Router();

/**
 * What the consent screen renders.
 *
 * Deliberately unauthenticated: a user arriving from a client is usually not
 * signed in yet, and the screen has to be able to say *who* is asking before
 * asking them to log in. Returning the client's name is not a leak -- the
 * caller already holds the request id, which they only get by being redirected
 * here in the first place.
 *
 * `profiles` is populated only for a signed-in user, which is what the screen
 * uses to decide between showing the picker and showing the sign-in form.
 */
oauthConsentRouter.get(
  "/consent/:requestId",
  asyncRoute(async (req: AuthedRequest, res) => {
    const request = await data.findRequest(req.params.requestId as Uuid);

    if (!request || request.expires_at.getTime() < Date.now()) {
      throw ApiError.notFound("This authorization request has expired. Start again from your client.");
    }

    const client = await data.findClient(request.client_id);
    if (!client) throw ApiError.notFound("Unknown client.");

    // Read the session if there is one, but never require it.
    const userId = await optionalUserId(req);

    const payload: ConsentRequestResponse = {
      request_id: request.id,
      client_name: client.client_name || "An MCP client",
      client_uri: client.client_uri,
      // Shown verbatim so the user can see exactly where approval sends them.
      redirect_uri: request.redirect_uri,
      scopes: request.scopes,
      profiles: userId ? await listProfiles(userId) : [],
    };

    res.json(payload);
  }),
);

/**
 * Approve. Requires a session and a profile the caller owns.
 *
 * Returns the redirect as JSON rather than issuing a 302, because the consent
 * screen is a React page calling fetch -- a redirect here would be followed by
 * the fetch and the browser would never navigate.
 */
oauthConsentRouter.post(
  "/consent/:requestId/approve",
  // requireCompany as well as requireAuth: a profile only exists once
  // onboarding is finished, and requireContext demands the company it sets.
  requireAuth,
  requireCompany,
  asyncRoute(async (req: AuthedRequest, res) => {
    const { userId } = requireContext(req);
    const profileId = String((req.body as { profile_id?: string })?.profile_id ?? "");

    const profile = await findProfile(userId, profileId as Uuid);
    if (!profile) throw ApiError.badRequest("Choose a profile to expose.");

    const { redirectTo } = await toApiError(() =>
      oauthProvider.approve(req.params.requestId!, userId, profile.id),
    );

    const payload: ConsentDecisionResponse = { redirect_to: redirectTo };
    res.json(payload);
  }),
);

/** Decline. No session needed: refusing is not a privileged act. */
oauthConsentRouter.post(
  "/consent/:requestId/deny",
  asyncRoute(async (req, res) => {
    const { redirectTo } = await toApiError(() =>
      oauthProvider.deny(req.params.requestId!),
    );

    const payload: ConsentDecisionResponse = { redirect_to: redirectTo };
    res.json(payload);
  }),
);

/* ── connected apps ────────────────────────────────────────────────────── */

/**
 * Which clients hold a live grant.
 *
 * A user who authorized something months ago through a client they no longer
 * use needs a way to see it and take it back; without this the only revocation
 * is deleting the profile.
 */
oauthConsentRouter.get(
  "/apps",
  requireAuth,
  requireCompany,
  asyncRoute(async (req: AuthedRequest, res) => {
    const { userId } = requireContext(req);
    const tokens = await data.listUserTokens(userId);

    // One row per client, not per token: an hourly refresh would otherwise
    // show the same app dozens of times.
    const byClient = new Map<string, (typeof tokens)[number]>();
    for (const token of tokens) {
      if (!byClient.has(token.client_id)) byClient.set(token.client_id, token);
    }

    const payload: ConnectedAppListResponse = {
      apps: [...byClient.values()].map((token) => ({
        client_id: token.client_id,
        client_name: token.client?.client_name || "An MCP client",
        client_uri: token.client?.client_uri ?? null,
        profile_id: token.profile_id,
        profile_name: token.profile?.name ?? null,
        scopes: token.scopes,
        authorized_at: token.created_at.toISOString(),
      })),
    };

    res.json(payload);
  }),
);

/** Revokes every token a client holds. The client must re-run consent. */
oauthConsentRouter.delete(
  "/apps/:clientId",
  requireAuth,
  requireCompany,
  asyncRoute(async (req: AuthedRequest, res) => {
    const { userId } = requireContext(req);
    await data.revokeClientForUser(userId, req.params.clientId!);
    res.status(204).end();
  }),
);

/* ── helpers ───────────────────────────────────────────────────────────── */

/**
 * Resolves the session without demanding one.
 *
 * `requireAuth` answers 401 on a missing cookie, which is wrong for the
 * consent lookup: not being signed in yet is the normal case there, not an
 * error.
 */
async function optionalUserId(req: AuthedRequest): Promise<Uuid | null> {
  const cookie = req.cookies?.[config.cookieName];
  if (!cookie) return null;

  const { verifyToken } = await import("../auth/auth.logic.js");
  const payload = verifyToken(cookie);
  return payload?.sub ?? null;
}

/**
 * Translates the SDK's OAuth errors into this app's ApiError.
 *
 * The provider throws `InvalidRequestError` and friends, which the SDK's own
 * handlers know how to render. These consent routes are ours and go through
 * `errorHandler`, so the error has to be converted or it would surface as an
 * opaque 500.
 */
async function toApiError<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ServerError) throw error;
    if (error instanceof OAuthError) throw ApiError.badRequest(error.message);
    throw error;
  }
}
