import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { ApiError, asyncRoute } from "../shared/errors.js";
import { verifyToken } from "../features/auth/auth.logic.js";
import { UserModel } from "../database/models/index.js";
import type { Uuid } from "../../shared/domain.js";

/**
 * Request augmented by the auth middleware.
 *
 * `userId` is the authorisation scope for everything a person owns:
 * connections, profiles, logs. `companyId` is carried alongside for grouping
 * and reporting, but it never grants access on its own -- two people in the
 * same company cannot see each other's connected accounts.
 */
export interface AuthedRequest extends Request {
  user?: UserModel;
  userId?: Uuid;
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
    req.userId = user.id;
    return next();
  },
);

/**
 * Most endpoints operate on resources that only exist once onboarding is
 * finished, so they need a company. The company is not the access scope --
 * see requireContext -- it just marks the account as set up.
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
 * Narrows a request that has passed both guards.
 *
 * Returns `userId` first because that is what every query scopes on. Routes
 * call this instead of repeating non-null assertions on every handler.
 */
export function requireContext(req: AuthedRequest): {
  user: UserModel;
  userId: Uuid;
  companyId: Uuid;
} {
  if (!req.user || !req.userId || !req.companyId) throw ApiError.unauthorized();
  return { user: req.user, userId: req.userId, companyId: req.companyId };
}
