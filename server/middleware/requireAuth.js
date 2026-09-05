import { config } from "../config.js";
import { ApiError, asyncRoute } from "../shared/errors.js";
import { verifyToken } from "../features/auth/auth.logic.js";
import { User } from "../database/models/index.js";

/**
 * Express 4 does not catch rejected promises from middleware, so an async
 * middleware that throws would hang the request and crash the process rather
 * than reaching the error handler. asyncRoute forwards the rejection to
 * next(), same as every route handler.
 */
export const requireAuth = asyncRoute(async (req, _res, next) => {
  const token = req.cookies?.[config.cookieName];
  if (!token) return next(ApiError.unauthorized());

  const payload = verifyToken(token);
  if (!payload?.sub) return next(ApiError.unauthorized());

  const user = await User.query().findById(payload.sub);
  if (!user) return next(ApiError.unauthorized());

  req.user = user;
  return next();
});

/**
 * Most endpoints operate on a company's resources, so they need onboarding to
 * be finished. Kept separate from requireAuth so the company-creation endpoint
 * can authenticate without one.
 */
export function requireCompany(req, _res, next) {
  if (!req.user?.company_id) {
    return next(ApiError.forbidden("Finish onboarding first."));
  }
  req.companyId = req.user.company_id;
  return next();
}
