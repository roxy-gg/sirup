import "dotenv/config";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import compression from "compression";
import cookieParser from "cookie-parser";

import { config } from "./config.js";
import { initDatabase } from "./database/knex.js";
import { apiRouter } from "./routes/index.js";
import { gatewayRouter } from "./mcp/gatewayRoutes.js";
import { errorHandler } from "./middleware/errorHandler.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * One process, one port, one command.
 *
 * In development Vite runs as Express middleware, so the React app is served by
 * this same server with HMR intact -- no second dev server, no proxy, no CORS.
 * In production the same server serves the built assets from dist/.
 */
async function bootstrap(): Promise<void> {
  await initDatabase();

  const app = express();
  app.disable("x-powered-by");

  app.use(compression());
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));

  // ---- API -------------------------------------------------------------
  app.use("/api", apiRouter);

  // ---- Aggregated MCP endpoint -- the product surface ------------------
  app.use("/mcp", gatewayRouter);

  // API errors must be handled before the SPA fallback, or a thrown error
  // would render the HTML shell instead of a JSON error.
  app.use(errorHandler);

  // ---- Frontend --------------------------------------------------------
  if (config.isProduction) {
    const distDir = path.join(rootDir, "dist");

    if (!fs.existsSync(distDir)) {
      throw new Error("dist/ is missing. Run `npm run build` before `npm start`.");
    }

    app.use(
      express.static(distDir, {
        // Hashed asset filenames are safe to cache forever; index.html is not.
        index: false,
        maxAge: "1y",
        setHeaders: (res, filePath) => {
          if (filePath.endsWith("index.html")) {
            res.setHeader("Cache-Control", "no-cache");
          }
        },
      }),
    );

    // Catch-all: every non-API path renders the SPA shell for client routing.
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      configFile: path.join(rootDir, "vite.config.ts"),
      server: { middlewareMode: true },
      appType: "spa",
    });

    // Vite's SPA middleware handles HMR and the index.html fallback itself.
    app.use(vite.middlewares);
  }

  app.listen(config.port, () => {
    console.log(`\n  sirup.gg ready on http://localhost:${config.port}`);
    console.log(`  MCP gateway   http://localhost:${config.port}/mcp\n`);
  });
}

bootstrap().catch((error: unknown) => {
  console.error("[boot] failed to start:", error);
  process.exit(1);
});
