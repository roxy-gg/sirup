import { gmailIntegration } from "./gmail.js";
import {
  docsIntegration,
  driveIntegration,
  sheetsIntegration,
  slidesIntegration,
} from "./workspace.js";
import type { OAuthMcpIntegration } from "./types.js";

const integrations = new Map<string, OAuthMcpIntegration>(
  [
    gmailIntegration,
    driveIntegration,
    sheetsIntegration,
    docsIntegration,
    slidesIntegration,
  ].map((integration) => [integration.key, integration]),
);

export function findOAuthIntegration(key: string): OAuthMcpIntegration | null {
  return integrations.get(key) ?? null;
}

export function isOAuthIntegrationAvailable(key: string): boolean {
  const integration = findOAuthIntegration(key);
  return Boolean(integration && !integration.unavailableReason);
}

/** Every registered integration, for tests and diagnostics. */
export function listOAuthIntegrations(): OAuthMcpIntegration[] {
  return [...integrations.values()];
}
