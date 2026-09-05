import "dotenv/config";
import crypto from "node:crypto";

const isProduction = process.env.NODE_ENV === "production";

function resolveJwtSecret(): string {
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv) return fromEnv;

  if (isProduction) {
    throw new Error(
      "JWT_SECRET must be set in production. Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"",
    );
  }

  // Dev convenience only. Regenerated each boot, so sessions end on restart.
  console.warn("[config] JWT_SECRET not set - using an ephemeral dev secret.");
  return crypto.randomBytes(48).toString("hex");
}

export const config = {
  isProduction,
  port: Number(process.env.PORT || 5173),
  jwtSecret: resolveJwtSecret(),
  jwtExpiresIn: "7d",
  cookieName: "sirup_session",
  // How long a discovered tool list is trusted before we re-query upstream.
  toolCacheTtlMs: Number(process.env.TOOL_CACHE_TTL_MS || 5 * 60 * 1000),
  // Upstream MCP calls are network calls to third parties; always bound them.
  upstreamTimeoutMs: Number(process.env.UPSTREAM_TIMEOUT_MS || 30_000),
} as const;
