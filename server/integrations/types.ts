/**
 * A trusted OAuth-backed MCP integration shipped with the application.
 *
 * Endpoints and scopes are code-owned rather than supplied by a request. That
 * keeps OAuth discovery away from arbitrary user URLs and gives each provider
 * a small, reviewable place for its non-standard parameters.
 */
export interface OAuthMcpIntegration {
  key: string;
  name: string;
  serverUrl: string;
  scopes: readonly string[];
  clientId: string | null;
  clientSecret: string | null;
  callbackPath: string;
  authorizationIssuer?: string;
  requireCallbackIssuer?: boolean;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  allowedOrigins: ReadonlySet<string>;
  unavailableReason: string | null;
  decorateAuthorizationUrl(url: URL): void;
}
