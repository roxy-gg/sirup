import express from "express";
import { authRouter } from "../features/auth/auth.route.js";
import { mcpServersRouter } from "../features/mcp-servers/mcpServers.route.js";
import { mcpLogsRouter } from "../features/mcp-logs/mcpLogs.route.js";
import { mcpCatalogRouter } from "../features/mcp-catalog/mcpCatalog.route.js";
import { notFoundHandler } from "../middleware/errorHandler.js";

/**
 * Every JSON endpoint hangs off /api. Mounting them on one router keeps the
 * catch-all in index.ts from ever shadowing an API route.
 */
export const apiRouter = express.Router();

apiRouter.get("/health", (_req, res) => {
  res.json({ ok: true });
});

apiRouter.use("/auth", authRouter);
apiRouter.use("/mcp-servers", mcpServersRouter);
apiRouter.use("/mcp-logs", mcpLogsRouter);
apiRouter.use("/mcp-catalog", mcpCatalogRouter);

// An unmatched /api/* must 404 as JSON, not fall through to the SPA shell.
apiRouter.use(notFoundHandler);
