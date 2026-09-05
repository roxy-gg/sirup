import express from "express";
import { asyncRoute } from "../../shared/errors.js";
import {
  requireAuth,
  requireCompany,
  requireContext,
  type AuthedRequest,
} from "../../middleware/requireAuth.js";
import * as logic from "./profiles.logic.js";
import { isUuid } from "../../shared/uuid.js";
import { ApiError } from "../../shared/errors.js";

/**
 * ROUTE -- full CRUD over profiles, plus their attachments.
 */
export const profilesRouter = express.Router();

profilesRouter.use(requireAuth, requireCompany);

// READ -- list
profilesRouter.get(
  "/",
  asyncRoute(async (req: AuthedRequest, res) => {
    const { companyId } = requireContext(req);
    res.json({ profiles: await logic.list(companyId) });
  }),
);

// READ -- one
profilesRouter.get(
  "/:id",
  asyncRoute(async (req: AuthedRequest, res) => {
    const { companyId } = requireContext(req);
    res.json({ profile: await logic.get(companyId, String(req.params.id)) });
  }),
);

// READ -- which connections it exposes
profilesRouter.get(
  "/:id/servers",
  asyncRoute(async (req: AuthedRequest, res) => {
    const { companyId } = requireContext(req);
    const id = String(req.params.id);
    if (!isUuid(id)) throw ApiError.notFound("Profile not found.");
    // Confirms the profile belongs to this company before reading its links.
    await logic.get(companyId, id);
    res.json({ server_ids: await logic.attachedServerIds(id) });
  }),
);

// CREATE
profilesRouter.post(
  "/",
  asyncRoute(async (req: AuthedRequest, res) => {
    const { companyId } = requireContext(req);
    res.status(201).json({ profile: await logic.create(companyId, req.body) });
  }),
);

// UPDATE -- rename, or make default
profilesRouter.patch(
  "/:id",
  asyncRoute(async (req: AuthedRequest, res) => {
    const { companyId } = requireContext(req);
    const profile = await logic.update(companyId, String(req.params.id), req.body);
    res.json({ profile });
  }),
);

// UPDATE -- replace the attachment set
profilesRouter.put(
  "/:id/servers",
  asyncRoute(async (req: AuthedRequest, res) => {
    const { companyId } = requireContext(req);
    const serverIds: unknown = req.body?.server_ids;
    if (!Array.isArray(serverIds)) {
      throw ApiError.badRequest("server_ids must be an array.");
    }
    const profile = await logic.setServers(
      companyId,
      String(req.params.id),
      serverIds.map(String),
    );
    res.json({ profile });
  }),
);

// DELETE
profilesRouter.delete(
  "/:id",
  asyncRoute(async (req: AuthedRequest, res) => {
    const { companyId } = requireContext(req);
    await logic.remove(companyId, String(req.params.id));
    res.status(204).end();
  }),
);
