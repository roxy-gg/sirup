import { api } from "@/lib/api";
import type {
  ApproveConsentBody,
  ConnectedAppListResponse,
  ConsentDecisionResponse,
  ConsentRequestResponse,
} from "@shared/api";
import type { ConnectedApp } from "@shared/api";

/**
 * DATA -- the OAuth consent and connected-apps endpoints.
 *
 * These sit under /api like every other dashboard call. The OAuth protocol
 * endpoints (/authorize, /token, /register) are never called from the browser:
 * the MCP client drives those directly.
 */

export function fetchConsentRequest(requestId: string) {
  return api.get<ConsentRequestResponse>(`/oauth/consent/${requestId}`);
}

export function approveConsent(requestId: string, profileId: string) {
  return api.post<ConsentDecisionResponse>(`/oauth/consent/${requestId}/approve`, {
    profile_id: profileId,
  } satisfies ApproveConsentBody);
}

export function denyConsent(requestId: string) {
  return api.post<ConsentDecisionResponse>(`/oauth/consent/${requestId}/deny`);
}

export async function fetchConnectedApps(): Promise<ConnectedApp[]> {
  const { apps } = await api.get<ConnectedAppListResponse>("/oauth/apps");
  return apps;
}

export function revokeConnectedApp(clientId: string) {
  return api.delete(`/oauth/apps/${encodeURIComponent(clientId)}`);
}
