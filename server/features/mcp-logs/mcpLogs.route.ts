import express from "express";
import { asyncRoute } from "../../shared/errors.js";
import {
  requireAuth,
  requireCompany,
  requireContext,
  type AuthedRequest,
} from "../../middleware/requireAuth.js";
import * as logic from "./mcpLogs.logic.js";

/**
 * ROUTE -- read-only. Logs are written by the gateway, never by a user.
 */
export const mcpLogsRouter = express.Router();

mcpLogsRouter.use(requireAuth, requireCompany);

// READ -- paginated activity
mcpLogsRouter.get(
  "/",
  asyncRoute(async (req: AuthedRequest, res) => {
    const { userId } = requireContext(req);
    res.json(await logic.list(userId, req.query));
  }),
);

// READ -- 24h rollup
mcpLogsRouter.get(
  "/summary",
  asyncRoute(async (req: AuthedRequest, res) => {
    const { userId } = requireContext(req);
    res.json({ summary: await logic.summary(userId) });
  }),
);
