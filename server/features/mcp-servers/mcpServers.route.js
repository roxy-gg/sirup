import express from "express";
import { asyncRoute } from "../../shared/errors.js";
import { requireAuth, requireCompany } from "../../middleware/requireAuth.js";
import * as logic from "./mcpServers.logic.js";

/**
 * ROUTE -- full CRUD over the company's connected MCP servers.
 */
export const mcpServersRouter = express.Router();

mcpServersRouter.use(requireAuth, requireCompany);

// READ -- list
mcpServersRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    res.json({ servers: await logic.list(req.companyId) });
  }),
);

// READ -- one, with its tools
mcpServersRouter.get(
  "/:id",
  asyncRoute(async (req, res) => {
    res.json({ server: await logic.get(req.companyId, req.params.id) });
  }),
);

// CREATE
mcpServersRouter.post(
  "/",
  asyncRoute(async (req, res) => {
    const server = await logic.create(req.companyId, req.body);
    res.status(201).json({ server });
  }),
);

// UPDATE
mcpServersRouter.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    const server = await logic.update(req.companyId, req.params.id, req.body);
    res.json({ server });
  }),
);

// UPDATE -- re-run tool discovery
mcpServersRouter.post(
  "/:id/refresh",
  asyncRoute(async (req, res) => {
    const server = await logic.refresh(req.companyId, req.params.id);
    res.json({ server });
  }),
);

// UPDATE -- toggle a single tool
mcpServersRouter.patch(
  "/:id/tools/:toolId",
  asyncRoute(async (req, res) => {
    const tool = await logic.setToolEnabled(
      req.companyId,
      req.params.id,
      req.params.toolId,
      req.body?.enabled,
    );
    res.json({ tool });
  }),
);

// DELETE
mcpServersRouter.delete(
  "/:id",
  asyncRoute(async (req, res) => {
    await logic.remove(req.companyId, req.params.id);
    res.status(204).end();
  }),
);
