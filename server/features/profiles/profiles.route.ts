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
 * ROUTE -- full CRUD over the signed-in user's own profiles.
 *
 * Scoped on `userId`, like connections. Profiles carry gateway tokens, so a
 * cross-user read here would hand someone else's credential over directly.
 */
export const profilesRouter = express.Router();

profilesRouter.use(requireAuth, requireCompany);

// READ -- list
profilesRouter.get(
  "/",
  asyncRoute(async (req: AuthedRequest, res) => {
    const { userId } = requireContext(req);
    res.json({ profiles: await logic.list(userId) });
  }),
);

// READ -- one
profilesRouter.get(
  "/:id",
  asyncRoute(async (req: AuthedRequest, res) => {
    const { userId } = requireContext(req);
    res.json({ profile: await logic.get(userId, String(req.params.id)) });
  }),
);

// READ -- which connections it exposes
profilesRouter.get(
  "/:id/servers",
  asyncRoute(async (req: AuthedRequest, res) => {
    const { userId } = requireContext(req);
    const id = String(req.params.id);
    if (!isUuid(id)) throw ApiError.notFound("Profile not found.");
    // Confirms the profile belongs to this user before reading its links.
    await logic.get(userId, id);
    res.json({ server_ids: await logic.attachedServerIds(id) });
  }),
);

// CREATE
profilesRouter.post(
  "/",
  asyncRoute(async (req: AuthedRequest, res) => {
    const { userId, companyId } = requireContext(req);
    const profile = await logic.create({ userId, companyId }, req.body);
    res.status(201).json({ profile });
  }),
);

// UPDATE -- rename, or make default
profilesRouter.patch(
  "/:id",
  asyncRoute(async (req: AuthedRequest, res) => {
    const { userId } = requireContext(req);
    const profile = await logic.update(userId, String(req.params.id), req.body);
    res.json({ profile });
  }),
);

// UPDATE -- replace the attachment set
profilesRouter.put(
  "/:id/servers",
  asyncRoute(async (req: AuthedRequest, res) => {
    const { userId } = requireContext(req);
    const serverIds: unknown = req.body?.server_ids;
    if (!Array.isArray(serverIds)) {
      throw ApiError.badRequest("server_ids must be an array.");
    }
    const profile = await logic.setServers(
      userId,
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
    const { userId } = requireContext(req);
    await logic.remove(userId, String(req.params.id));
    res.status(204).end();
  }),
);
