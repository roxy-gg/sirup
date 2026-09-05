import { config } from "../config.js";
import type { McpServerModel } from "../database/models/index.js";
import * as data from "./oauth.data.js";
import { StoredOAuthClientProvider } from "./oauthProvider.js";
import { findOAuthIntegration } from "./registry.js";
import { oauthFetchFor } from "./oauthFetch.js";

export type OAuthConnectableServer = Pick<
  McpServerModel,
  "id" | "auth_type" | "integration_key"
>;

function redirectUrl(callbackPath: string): string {
  if (!config.appOrigin) throw new Error("APP_ORIGIN is not configured.");
  return new URL(callbackPath, `${config.appOrigin}/`).toString();
}

export async function oauthTransportOptionsForServer(
  server: OAuthConnectableServer,
) {
  if (server.auth_type !== "oauth" || !server.integration_key) return undefined;

  const integration = findOAuthIntegration(server.integration_key);
  if (!integration || integration.unavailableReason) {
    throw new Error(
      integration?.unavailableReason ?? "OAuth integration is not available.",
    );
  }

  const credential = await data.findCredential(server.id);
  if (!credential || credential.integration_key !== integration.key) {
    throw new Error("OAuth credentials are missing for this connection.");
  }
  if (credential.reauthorization_required) {
    throw new Error("Authorization expired. Disconnect and reconnect this account.");
  }

  // A grant issued before the integration widened its scopes still works for
  // some tools and 403s on the rest. Surface that as one clear error on the
  // connection instead of letting individual tool calls fail mysteriously.
  if (credential.granted_scopes) {
    const granted = new Set(credential.granted_scopes.split(/\s+/).filter(Boolean));
    const missing = integration.scopes.filter((scope) => !granted.has(scope));
    if (missing.length > 0) {
      throw new Error(
        `This ${integration.name} connection was authorized with fewer permissions than it now needs. Reconnect the account to grant them.`,
      );
    }
  }

  return {
    authProvider: new StoredOAuthClientProvider({
      integration,
      redirectUrl: redirectUrl(integration.callbackPath),
      credential,
    }),
    fetch: oauthFetchFor(integration),
  };
}
