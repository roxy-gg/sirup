import { config } from "../config.js";
import type { OAuthMcpIntegration } from "./types.js";

/**
 * Every Google Workspace MCP server speaks the same OAuth: one Google client,
 * one callback, Google's issuer, offline access, and an account picker. Only
 * the endpoint, the scopes, and the label differ — so those are the arguments
 * and everything else is shared.
 *
 * Scopes are always the *write* variant of a product. Google's setup guides
 * list read and write side by side, but a read-only grant makes the update
 * tools 403 at call time on a connection that reported itself healthy. We are
 * a passthrough: ask once for what the advertised tools actually need, then
 * let the user disable individual tools afterwards.
 */
export interface WorkspaceIntegrationSpec {
  key: string;
  name: string;
  /** Subdomain of googleapis.com, e.g. "drivemcp". */
  host: string;
  scopes: readonly string[];
}

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

export function googleWorkspaceIntegration(
  spec: WorkspaceIntegrationSpec,
): OAuthMcpIntegration {
  const serverUrl = `https://${spec.host}.googleapis.com/mcp/v1`;

  return {
    key: spec.key,
    name: spec.name,
    serverUrl,
    scopes: spec.scopes,
    clientId: config.googleOAuthClientId,
    clientSecret: config.googleOAuthClientSecret,
    callbackPath: "/api/integrations/oauth/callback",
    authorizationIssuer: "https://accounts.google.com",
    requireCallbackIssuer: true,
    authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    allowedOrigins: new Set([
      `https://${spec.host}.googleapis.com`,
      "https://accounts.google.com",
      "https://oauth2.googleapis.com",
    ]),
    unavailableReason: unavailableReason(),
    decorateAuthorizationUrl(url) {
      // Offline access is what makes the connection survive past an hour.
      url.searchParams.set("access_type", "offline");
      url.searchParams.set("include_granted_scopes", "true");
      // Always show the picker: connecting a second account is a normal thing
      // to do here, and Google otherwise silently reuses the active session.
      url.searchParams.set("prompt", "consent select_account");
    },
  };
}
