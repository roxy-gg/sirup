import { api } from "@/lib/api";
import type {
  StartOAuthIntegrationBody,
  StartOAuthIntegrationResponse,
} from "@shared/api";

/**
 * Starts a managed OAuth flow. The server sets a one-time HttpOnly cookie and
 * returns the provider URL the browser should be sent to.
 */
export async function startOAuthIntegration(
  integrationKey: string,
  body: StartOAuthIntegrationBody,
): Promise<string> {
  const { authorization_url } = await api.post<StartOAuthIntegrationResponse>(
    `/integrations/${encodeURIComponent(integrationKey)}/oauth/start`,
    body,
  );
  return authorization_url;
}
