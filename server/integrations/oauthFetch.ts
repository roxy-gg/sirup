import { config } from "../config.js";
import type { OAuthMcpIntegration } from "./types.js";

/** OAuth fetch hardened to the origins registered for this provider. */
export function oauthFetchFor(integration: OAuthMcpIntegration): typeof fetch {
  return (async (input, init) => {
    const raw = input instanceof Request ? input.url : String(input);
    const url = new URL(raw);
    if (!integration.allowedOrigins.has(url.origin)) {
      throw new Error(`OAuth request to unexpected origin: ${url.origin}`);
    }

    const timeoutSignal = AbortSignal.timeout(config.upstreamTimeoutMs);
    const signal = init?.signal
      ? AbortSignal.any([init.signal, timeoutSignal])
      : timeoutSignal;
    return fetch(input, { ...init, signal });
  }) as typeof fetch;
}
