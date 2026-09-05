import type {
  OAuthClientProvider,
  OAuthDiscoveryState,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type {
  McpOAuthCredentialModel,
  McpOAuthRequestModel,
} from "../database/models/index.js";
import type { Uuid } from "../../shared/domain.js";
import { decryptSecret, encryptSecret } from "./crypto.js";
import * as data from "./oauth.data.js";
import type { OAuthMcpIntegration } from "./types.js";

interface ProviderOptions {
  integration: OAuthMcpIntegration;
  redirectUrl: string;
  state?: string;
  request?: McpOAuthRequestModel;
  credential?: McpOAuthCredentialModel;
}

function tokenContext(subjectId: Uuid): string {
  return `mcp-oauth-tokens:${subjectId}`;
}

function verifierContext(requestId: Uuid): string {
  return `mcp-oauth-verifier:${requestId}`;
}

/**
 * Database-backed MCP SDK provider used both during the browser redirect and
 * later by pooled upstream connections. No token or verifier is process-local.
 */
export class StoredOAuthClientProvider implements OAuthClientProvider {
  readonly #integration: OAuthMcpIntegration;
  readonly #redirectUrl: string;
  readonly #state: string | undefined;
  readonly #request: McpOAuthRequestModel | undefined;
  readonly #credential: McpOAuthCredentialModel | undefined;
  #authorizationUrl: URL | null = null;
  #exchangedTokens: OAuthTokens | null = null;

  constructor(options: ProviderOptions) {
    this.#integration = options.integration;
    this.#redirectUrl = options.redirectUrl;
    this.#state = options.state;
    this.#request = options.request;
    this.#credential = options.credential;
  }

  get redirectUrl(): string {
    return this.#redirectUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [this.#redirectUrl],
      token_endpoint_auth_method: "client_secret_basic",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      client_name: "sirup.gg",
      scope: this.#integration.scopes.join(" "),
    };
  }

  state(): string {
    if (!this.#state) throw new Error("OAuth request state is unavailable.");
    return this.#state;
  }

  clientInformation(): OAuthClientInformationMixed {
    const { clientId, clientSecret } = this.#integration;
    if (!clientId || !clientSecret) {
      throw new Error(`${this.#integration.name} OAuth is not configured.`);
    }
    return { client_id: clientId, client_secret: clientSecret };
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    if (!this.#credential) return undefined;

    // A pooled client can outlive a token refresh performed by another process.
    // Read the current encrypted grant so it never keeps sending stale tokens.
    const latest = await data.findCredential(this.#credential.server_id);
    if (!latest || latest.reauthorization_required) return undefined;
    this.#credential.encrypted_tokens = latest.encrypted_tokens;
    this.#credential.granted_scopes = latest.granted_scopes;
    this.#credential.discovery_state = latest.discovery_state;
    this.#credential.reauthorization_required = latest.reauthorization_required;
    return decryptSecret<OAuthTokens>(
      latest.encrypted_tokens,
      tokenContext(latest.server_id),
    );
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    if (!this.#credential) {
      this.#exchangedTokens = tokens;
      return;
    }

    const latest = await data.findCredential(this.#credential.server_id);
    if (!latest) throw new Error("OAuth credentials no longer exist.");
    const expectedCiphertext = latest.encrypted_tokens;
    const existing = decryptSecret<OAuthTokens>(
      expectedCiphertext,
      tokenContext(latest.server_id),
    );
    const merged = {
      ...tokens,
      refresh_token: tokens.refresh_token ?? existing.refresh_token,
    };
    const encrypted = encryptSecret(
      merged,
      tokenContext(this.#credential.server_id),
    );

    const updated = await data.patchCredentialIfCurrent(
      latest.server_id,
      expectedCiphertext,
      {
        encrypted_tokens: encrypted,
        granted_scopes: merged.scope ?? latest.granted_scopes,
        reauthorization_required: false,
      },
    );
    if (updated !== 1) {
      throw new Error("OAuth credentials changed during refresh. Retry the request.");
    }
    this.#credential.encrypted_tokens = encrypted;
    this.#credential.granted_scopes = merged.scope ?? latest.granted_scopes;
    this.#credential.reauthorization_required = false;
  }

  redirectToAuthorization(authorizationUrl: URL): void {
    this.#integration.decorateAuthorizationUrl(authorizationUrl);
    this.#authorizationUrl = authorizationUrl;
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    if (!this.#request) throw new Error("OAuth request is unavailable.");
    const encrypted = encryptSecret(
      codeVerifier,
      verifierContext(this.#request.id),
    );
    await data.patchRequest(this.#request.id, {
      encrypted_code_verifier: encrypted,
    });
    this.#request.encrypted_code_verifier = encrypted;
  }

  codeVerifier(): string {
    if (!this.#request?.encrypted_code_verifier) {
      throw new Error("OAuth code verifier is unavailable.");
    }
    return decryptSecret<string>(
      this.#request.encrypted_code_verifier,
      verifierContext(this.#request.id),
    );
  }

  async saveDiscoveryState(state: OAuthDiscoveryState): Promise<void> {
    if (
      this.#integration.authorizationIssuer &&
      new URL(state.authorizationServerUrl).origin !==
        new URL(this.#integration.authorizationIssuer).origin
    ) {
      throw new Error("OAuth discovery returned an unexpected authorization server.");
    }
    const metadata = state.authorizationServerMetadata;
    if (this.#integration.authorizationIssuer && !metadata) {
      throw new Error("OAuth authorization server metadata is required.");
    }
    if (
      this.#integration.authorizationIssuer &&
      metadata?.issuer !== this.#integration.authorizationIssuer
    ) {
      throw new Error("OAuth discovery returned an unexpected issuer.");
    }
    if (
      this.#integration.authorizationEndpoint &&
      metadata?.authorization_endpoint !== this.#integration.authorizationEndpoint
    ) {
      throw new Error("OAuth discovery returned an unexpected authorization endpoint.");
    }
    if (
      this.#integration.tokenEndpoint &&
      metadata?.token_endpoint !== this.#integration.tokenEndpoint
    ) {
      throw new Error("OAuth discovery returned an unexpected token endpoint.");
    }
    if (
      this.#integration.authorizationIssuer &&
      !metadata?.code_challenge_methods_supported?.includes(
        "S256",
      )
    ) {
      throw new Error("OAuth provider does not support PKCE S256.");
    }

    const stored = state as unknown as Record<string, unknown>;
    if (this.#credential) {
      await data.patchCredential(this.#credential.server_id, {
        discovery_state: stored,
      });
      this.#credential.discovery_state = stored;
      return;
    }

    if (!this.#request) throw new Error("OAuth request is unavailable.");
    await data.patchRequest(this.#request.id, { discovery_state: stored });
    this.#request.discovery_state = stored;
  }

  discoveryState(): OAuthDiscoveryState | undefined {
    const state = this.#credential?.discovery_state ?? this.#request?.discovery_state;
    return state as OAuthDiscoveryState | undefined;
  }

  async validateResourceURL(
    serverUrl: string | URL,
    resource?: string,
  ): Promise<URL | undefined> {
    const expected = new URL(this.#integration.serverUrl);
    const requested = new URL(serverUrl);
    if (requested.href !== expected.href || (resource && resource !== expected.href)) {
      throw new Error("OAuth discovery returned an unexpected resource.");
    }
    return resource ? new URL(resource) : expected;
  }

  async invalidateCredentials(
    scope: "all" | "client" | "tokens" | "verifier" | "discovery",
  ): Promise<void> {
    if (!this.#credential) {
      if (scope === "verifier" && this.#request) {
        await data.patchRequest(this.#request.id, {
          encrypted_code_verifier: null,
        });
        this.#request.encrypted_code_verifier = null;
      }
      if ((scope === "discovery" || scope === "all") && this.#request) {
        await data.patchRequest(this.#request.id, { discovery_state: null });
        this.#request.discovery_state = null;
      }
      return;
    }

    // The SDK invalidates tokens before attempting a fresh interactive flow.
    // Runtime transports cannot redirect an agent's request to a browser, so
    // preserve the encrypted grant and surface a reconnect error instead.
    if (scope === "tokens" || scope === "all") {
      const latest = await data.findCredential(this.#credential.server_id);
      if (!latest) throw new Error("OAuth credentials no longer exist.");
      const expectedCiphertext = latest.encrypted_tokens;
      const updated = await data.patchCredentialIfCurrent(
        latest.server_id,
        expectedCiphertext,
        { reauthorization_required: true },
      );
      if (updated === 1) this.#credential.reauthorization_required = true;
      throw new Error(
        updated === 1
          ? "Authorization expired. Disconnect and reconnect this account."
          : "OAuth credentials changed during refresh. Retry the request.",
      );
    }
    if (scope === "discovery") {
      await data.patchCredential(this.#credential.server_id, {
        discovery_state: null,
      });
      this.#credential.discovery_state = null;
    }
  }

  takeAuthorizationUrl(): URL {
    if (!this.#authorizationUrl) {
      throw new Error("The OAuth provider did not produce an authorization URL.");
    }
    return this.#authorizationUrl;
  }

  takeExchangedTokens(): OAuthTokens {
    if (!this.#exchangedTokens) {
      throw new Error("The OAuth provider did not return credentials.");
    }
    return this.#exchangedTokens;
  }
}

export function encryptOAuthTokens(tokens: OAuthTokens, serverId: Uuid): string {
  return encryptSecret(tokens, tokenContext(serverId));
}

