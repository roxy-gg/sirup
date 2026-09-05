import { config } from "../config.js";
import type { OAuthMcpIntegration } from "./types.js";

export const GMAIL_MCP_URL = "https://gmailmcp.googleapis.com/mcp/v1";

/**
 * Full mailbox access.
 *
 * `https://mail.google.com/` is Gmail's maximal scope: read, compose, send,
 * modify labels, trash, and permanent delete. Every tool the Gmail MCP server
 * exposes is authorized by it, so nothing 403s halfway through a conversation.
 *
 * The narrower pair in Google's setup guide (readonly + compose) only covers
 * 8 of the 23 tools — labelling, trashing, and spam all fail without modify.
 * We are a passthrough: ask once, for everything, and let the user decide
 * per-tool afterwards.
 *
 * `gmail.settings.basic` and `gmail.settings.sharing` are deliberately not
 * requested: no current tool touches settings, filters, or delegation.
 */
const GMAIL_SCOPES = ["https://mail.google.com/"] as const;

function unavailableReason(): string | null {
  if (!config.appOrigin) return "APP_ORIGIN is not configured.";
  if (!config.credentialEncryptionKey) {
    return "CREDENTIAL_ENCRYPTION_KEY is not configured.";
  }
  if (!config.googleOAuthClientId || !config.googleOAuthClientSecret) {
    return "Google OAuth credentials are not configured.";
  }
  return null;
}

export const gmailIntegration: OAuthMcpIntegration = {
  key: "gmail",
  name: "Gmail",
  serverUrl: GMAIL_MCP_URL,
  scopes: GMAIL_SCOPES,
  clientId: config.googleOAuthClientId,
  clientSecret: config.googleOAuthClientSecret,
  callbackPath: "/api/integrations/oauth/callback",
  authorizationIssuer: "https://accounts.google.com",
  requireCallbackIssuer: true,
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
  allowedOrigins: new Set([
    "https://gmailmcp.googleapis.com",
    "https://accounts.google.com",
    "https://oauth2.googleapis.com",
  ]),
  unavailableReason: unavailableReason(),
  decorateAuthorizationUrl(url) {
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("include_granted_scopes", "true");
    // A deliberate account picker is required for repeat Gmail connections.
    url.searchParams.set("prompt", "consent select_account");
  },
};
