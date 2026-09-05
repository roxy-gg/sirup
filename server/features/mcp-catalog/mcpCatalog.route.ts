import express from "express";
import { asyncRoute } from "../../shared/errors.js";
import {
  requireAuth,
  requireCompany,
  requireContext,
  type AuthedRequest,
} from "../../middleware/requireAuth.js";
import { listServers } from "../mcp-servers/mcpServers.data.js";
import * as logic from "./mcpCatalog.logic.js";

/**
 * ROUTE -- read-only starter catalog for the Discover screen.
 */
export const mcpCatalogRouter = express.Router();

mcpCatalogRouter.use(requireAuth, requireCompany);

// READ -- catalog, annotated with what's already connected
mcpCatalogRouter.get(
  "/",
  asyncRoute(async (req: AuthedRequest, res) => {
    const { userId } = requireContext(req);
    const servers = await listServers(userId);
    res.json({ catalog: logic.list(servers) });
  }),
);
