import { config } from "../config.js";
import type { OAuthMcpIntegration } from "./types.js";

export const GMAIL_MCP_URL = "https://gmailmcp.googleapis.com/mcp/v1";

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
] as const;

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
