import express from "express";
import { asyncRoute } from "../../shared/errors.js";
import {
  requireAuth,
  requireCompany,
  requireContext,
  type AuthedRequest,
} from "../../middleware/requireAuth.js";
import * as logic from "./mcpServers.logic.js";

/**
 * ROUTE -- full CRUD over the signed-in user's own connected MCP servers.
 *
 * Every handler scopes on `userId`. Two people in the same company never see
 * each other's connections, so there is no shared read path to a credential
 * one of them pasted.
 */
export const mcpServersRouter = express.Router();

mcpServersRouter.use(requireAuth, requireCompany);

// READ -- list
mcpServersRouter.get(
  "/",
  asyncRoute(async (req: AuthedRequest, res) => {
    const { userId } = requireContext(req);
    res.json({ servers: await logic.list(userId) });
  }),
);

// READ -- one, with its tools
mcpServersRouter.get(
  "/:id",
  asyncRoute(async (req: AuthedRequest, res) => {
    const { userId } = requireContext(req);
    res.json({ server: await logic.get(userId, String(req.params.id)) });
  }),
);

// CREATE
mcpServersRouter.post(
  "/",
  asyncRoute(async (req: AuthedRequest, res) => {
    const { userId, companyId } = requireContext(req);
    const server = await logic.create({ userId, companyId }, req.body);
    res.status(201).json({ server });
  }),
);

// UPDATE
mcpServersRouter.patch(
  "/:id",
  asyncRoute(async (req: AuthedRequest, res) => {
    const { userId } = requireContext(req);
    const server = await logic.update(userId, String(req.params.id), req.body);
    res.json({ server });
  }),
);

// UPDATE -- re-run tool discovery
mcpServersRouter.post(
  "/:id/refresh",
  asyncRoute(async (req: AuthedRequest, res) => {
    const { userId } = requireContext(req);
    const server = await logic.refresh(userId, String(req.params.id));
    res.json({ server });
  }),
);

// UPDATE -- toggle a single tool
mcpServersRouter.patch(
  "/:id/tools/:toolId",
  asyncRoute(async (req: AuthedRequest, res) => {
    const { userId } = requireContext(req);
    const tool = await logic.setToolEnabled(
      userId,
      String(req.params.id),
      String(req.params.toolId),
      req.body?.enabled,
    );
    res.json({ tool });
  }),
);

// DELETE
mcpServersRouter.delete(
  "/:id",
  asyncRoute(async (req: AuthedRequest, res) => {
    const { userId } = requireContext(req);
    await logic.remove(userId, String(req.params.id));
    res.status(204).end();
  }),
);
