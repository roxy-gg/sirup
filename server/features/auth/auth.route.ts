import express from "express";
import type { Response } from "express";
import { config } from "../../config.js";
import { asyncRoute } from "../../shared/errors.js";
import { requireAuth, type AuthedRequest } from "../../middleware/requireAuth.js";
import { ApiError } from "../../shared/errors.js";
import * as logic from "./auth.logic.js";

/**
 * ROUTE -- HTTP only. Parses the request, calls the logic layer, shapes the
 * response. No queries, no rules.
 */
export const authRouter = express.Router();

function setSessionCookie(res: Response, token: string): void {
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProduction,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

// CREATE -- register
authRouter.post(
  "/register",
  asyncRoute(async (req, res) => {
    const { user, token } = await logic.register(req.body);
    setSessionCookie(res, token);
    // getSession rather than a hand-built object: this endpoint returns a
    // SessionResponse, and assembling one by hand meant `profiles` was
    // missing, which crashed the client the moment it read it.
    res.status(201).json(await logic.getSession(user.id));
  }),
);

// CREATE -- login
authRouter.post(
  "/login",
  asyncRoute(async (req, res) => {
    const { user, token } = await logic.login(req.body);
    setSessionCookie(res, token);
    res.json(await logic.getSession(user.id));
  }),
);

// READ -- current session
authRouter.get(
  "/session",
  requireAuth,
  asyncRoute(async (req: AuthedRequest, res) => {
    if (!req.user) throw ApiError.unauthorized();
    res.json(await logic.getSession(req.user.id));
  }),
);

// CREATE -- company (onboarding step 2)
authRouter.post(
  "/company",
  requireAuth,
  asyncRoute(async (req: AuthedRequest, res) => {
    if (!req.user) throw ApiError.unauthorized();
    await logic.createCompany(req.user.id, req.body);
    res.status(201).json(await logic.getSession(req.user.id));
  }),
);

// DELETE -- logout
authRouter.delete("/session", (_req, res) => {
  res.clearCookie(config.cookieName);
  res.status(204).end();
});
