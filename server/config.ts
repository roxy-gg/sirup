import "dotenv/config";
import crypto from "node:crypto";

const isProduction = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT || 5173);

function resolveAppOrigin(): string | null {
  const value = process.env.APP_ORIGIN?.trim();
  if (!value) return isProduction ? null : `http://localhost:${port}`;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("APP_ORIGIN must be a valid http(s) origin.");
  }
  if (!/^https?:$/.test(url.protocol) || url.pathname !== "/") {
    throw new Error("APP_ORIGIN must be an http(s) origin without a path.");
  }
  if (isProduction && url.protocol !== "https:") {
    throw new Error("APP_ORIGIN must use https in production.");
  }
  return url.origin;
}

function parseEncryptionKey(value: string | undefined): Buffer | null {
  if (!value?.trim()) return null;

  const trimmed = value.trim();
  const key = /^[a-f\d]{64}$/i.test(trimmed)
    ? Buffer.from(trimmed, "hex")
    : Buffer.from(trimmed, "base64");

  if (key.length !== 32) {
    throw new Error(
      "CREDENTIAL_ENCRYPTION_KEY must be exactly 32 bytes encoded as base64 or 64 hex characters.",
    );
  }
  return key;
}

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
  port,
  jwtSecret: resolveJwtSecret(),
  jwtExpiresIn: "7d",
  cookieName: "sirup_session",
  // How long a discovered tool list is trusted before we re-query upstream.
  toolCacheTtlMs: Number(process.env.TOOL_CACHE_TTL_MS || 5 * 60 * 1000),
  // Upstream MCP calls are network calls to third parties; always bound them.
  upstreamTimeoutMs: Number(process.env.UPSTREAM_TIMEOUT_MS || 30_000),
  /** Fixed externally reachable origin used to build registered OAuth callbacks. */
  appOrigin: resolveAppOrigin(),
  credentialEncryptionKey: parseEncryptionKey(
    process.env.CREDENTIAL_ENCRYPTION_KEY,
  ),
  googleOAuthClientId: process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || null,
  googleOAuthClientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || null,
  oauthRequestTtlMs: 10 * 60 * 1000,
} as const;
