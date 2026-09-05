import express from "express";
import type { Response } from "express";
import { config } from "../config.js";
import {
  requireAuth,
  requireCompany,
  requireContext,
  type AuthedRequest,
} from "../middleware/requireAuth.js";
import { asyncRoute } from "../shared/errors.js";
import * as logic from "./oauth.logic.js";

export const oauthIntegrationsRouter = express.Router();
const OAUTH_BROWSER_COOKIE_PREFIX = "sirup_oauth_";

/** One cookie per in-flight flow, so parallel tabs never clobber each other. */
function browserCookieName(state: string): string {
  return `${OAUTH_BROWSER_COOKIE_PREFIX}${state.slice(0, 16)}`;
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: config.isProduction,
    path: "/api/integrations/oauth/callback",
  };
}

// OAuth state prevents replay; a separate HttpOnly cookie binds the grant to
// the browser that started it, without depending on the longer-lived session
// cookie (which may expire while the user is at the provider).
oauthIntegrationsRouter.get(
  "/oauth/callback",
  asyncRoute(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const nonce = req.cookies?.[browserCookieName(state)] as string | undefined;
    const result = await logic.callback(nonce, req.query);
    if (state) res.clearCookie(browserCookieName(state), cookieOptions());
    res.redirect(303, result.redirectUrl);
  }),
);

oauthIntegrationsRouter.post(
  "/:key/oauth/start",
  requireAuth,
  requireCompany,
  asyncRoute(async (req: AuthedRequest, res) => {
    const { userId, companyId } = requireContext(req);
    const result = await logic.start(
      { userId, companyId },
      String(req.params.key),
      req.body,
    );
    res.cookie(browserCookieName(result.state), result.browserNonce, {
      ...cookieOptions(),
      maxAge: config.oauthRequestTtlMs,
    });
    res.status(201).json({ authorization_url: result.authorizationUrl });
  }),
);
