import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { ApiError, asyncRoute } from "../shared/errors.js";
import { verifyToken } from "../features/auth/auth.logic.js";
import { UserModel } from "../database/models/index.js";
import type { Uuid } from "../../shared/domain.js";

/**
 * Request augmented by the auth middleware. Declared once so every route can
 * rely on `req.user` and `req.companyId` being present after the guards run.
 */
export interface AuthedRequest extends Request {
  user?: UserModel;
  companyId?: Uuid;
}

/**
 * Express 4 does not catch rejected promises from middleware, so an async
 * middleware that throws would hang the request and crash the process rather
 * than reaching the error handler. asyncRoute forwards the rejection to
 * next(), same as every route handler.
 */
export const requireAuth = asyncRoute(
  async (req: AuthedRequest, _res: Response, next: NextFunction) => {
    const token = req.cookies?.[config.cookieName];
    if (!token) return next(ApiError.unauthorized());

    const payload = verifyToken(token);
    if (!payload?.sub) return next(ApiError.unauthorized());

    const user = await UserModel.query().findById(payload.sub);
    if (!user) return next(ApiError.unauthorized());

    req.user = user;
    return next();
  },
);

/**
 * Most endpoints operate on a company's resources, so they need onboarding to
 * be finished. Kept separate from requireAuth so the company-creation endpoint
 * can authenticate without one.
 */
export function requireCompany(
  req: AuthedRequest,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.user?.company_id) {
    next(ApiError.forbidden("Finish onboarding first."));
    return;
  }
  req.companyId = req.user.company_id;
  next();
}

/**
 * Narrows a request that has passed both guards. Routes call this instead of
 * repeating non-null assertions on every handler.
 */
export function requireContext(req: AuthedRequest): {
  user: UserModel;
  companyId: Uuid;
} {
  if (!req.user || !req.companyId) throw ApiError.unauthorized();
  return { user: req.user, companyId: req.companyId };
}
