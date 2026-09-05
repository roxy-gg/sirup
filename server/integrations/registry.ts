import { gmailIntegration } from "./gmail.js";
import type { OAuthMcpIntegration } from "./types.js";

const integrations = new Map<string, OAuthMcpIntegration>([
  [gmailIntegration.key, gmailIntegration],
]);

export function findOAuthIntegration(key: string): OAuthMcpIntegration | null {
  return integrations.get(key) ?? null;
}

export function isOAuthIntegrationAvailable(key: string): boolean {
  const integration = findOAuthIntegration(key);
  return Boolean(integration && !integration.unavailableReason);
}
