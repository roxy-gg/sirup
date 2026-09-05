import express from "express";
import { authRouter } from "../features/auth/auth.route.js";
import { mcpServersRouter } from "../features/mcp-servers/mcpServers.route.js";
import { mcpLogsRouter } from "../features/mcp-logs/mcpLogs.route.js";
import { mcpCatalogRouter } from "../features/mcp-catalog/mcpCatalog.route.js";
import { publicCatalog } from "../features/mcp-catalog/mcpCatalog.logic.js";
import { notFoundHandler } from "../middleware/errorHandler.js";

/**
 * Every JSON endpoint hangs off /api. Mounting them on one router keeps the
 * catch-all in index.ts from ever shadowing an API route.
 */
export const apiRouter = express.Router();

apiRouter.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Public: the marketing page shows real apps from the real catalog, so it
// needs this before any auth guard. Returns no company context and no
// `connected` flags -- just what a signed-out visitor may see.
apiRouter.get("/public/apps", (_req, res) => {
  res.json({ catalog: publicCatalog() });
});

apiRouter.use("/auth", authRouter);
apiRouter.use("/mcp-servers", mcpServersRouter);
apiRouter.use("/mcp-logs", mcpLogsRouter);
apiRouter.use("/mcp-catalog", mcpCatalogRouter);

// An unmatched /api/* must 404 as JSON, not fall through to the SPA shell.
apiRouter.use(notFoundHandler);
