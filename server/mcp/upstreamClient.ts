import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { config } from "../config.js";
import type { McpServerModel } from "../database/models/index.js";
import { oauthTransportOptionsForServer } from "../integrations/oauthRuntime.js";

const CLIENT_INFO = { name: "sirup-gateway", version: "0.1.0" } as const;

/** Which wire protocol an upstream connection ended up negotiating. */
export type UpstreamTransport = "streamable-http" | "sse";

export interface UpstreamConnection {
  client: Client;
  transport: UpstreamTransport;
}

/** The subset of a server row needed to open a static or OAuth connection. */
export type ConnectableServer = Pick<
  McpServerModel,
  | "id"
  | "url"
  | "integration_key"
  | "auth_type"
  | "auth_header_name"
  | "auth_value"
>;

/**
 * Builds headers for direct connections. Managed OAuth connections supply an
 * SDK auth provider instead, so their tokens never pass through this path.
 */
function buildHeaders(server: ConnectableServer): Record<string, string> {
  const headers: Record<string, string> = {};
  if (server.auth_type === "bearer" && server.auth_value) {
    headers.Authorization = `Bearer ${server.auth_value}`;
  } else if (
    server.auth_type === "header" &&
    server.auth_header_name &&
    server.auth_value
  ) {
    headers[server.auth_header_name] = server.auth_value;
  }
  return headers;
}

/**
 * Connects to a remote MCP server.
 *
 * Per the transport spec, Streamable HTTP is the current standard and the older
 * HTTP+SSE transport is deprecated. The recommended compatibility strategy is to
 * try Streamable HTTP first, and fall back to SSE on a 4xx -- which is what this
 * does. stdio is intentionally unsupported: a hosted multi-tenant gateway must
 * not spawn arbitrary subprocesses on behalf of its users.
 */
export async function connectToUpstream(
  server: ConnectableServer,
): Promise<UpstreamConnection> {
  const url = new URL(server.url);
  const headers = buildHeaders(server);
  const oauth = await oauthTransportOptionsForServer(server);
  const requestInit = Object.keys(headers).length > 0 ? { headers } : undefined;

  const client = new Client(CLIENT_INFO, { capabilities: {} });

  try {
    const transport = new StreamableHTTPClientTransport(url, {
      requestInit,
      authProvider: oauth?.authProvider,
      fetch: oauth?.fetch,
    });
    await client.connect(transport);
    return { client, transport: "streamable-http" };
  } catch (streamableError) {
    // OAuth failures are authorization events, never a signal to downgrade.
    if (streamableError instanceof UnauthorizedError || oauth) {
      throw streamableError;
    }

    // A 4xx here usually means the server only speaks the legacy transport.
    try {
      const fallbackClient = new Client(CLIENT_INFO, { capabilities: {} });
      const sseTransport = new SSEClientTransport(url, { requestInit });
      await fallbackClient.connect(sseTransport);
      return { client: fallbackClient, transport: "sse" };
    } catch {
      // Report the modern-transport failure: it is the more useful diagnostic.
      throw streamableError;
    }
  }
}

/** Lists the tools an upstream exposes, following pagination to the end. */
export async function listUpstreamTools(client: Client): Promise<Tool[]> {
  const tools: Tool[] = [];
  let cursor: string | undefined;

  do {
    const page = await client.listTools(cursor ? { cursor } : {}, {
      timeout: config.upstreamTimeoutMs,
    });
    tools.push(...(page.tools ?? []));
    cursor = page.nextCursor;
    // Defensive: a misbehaving upstream could loop forever on a static cursor.
  } while (cursor && tools.length < 5000);

  return tools;
}

/** Invokes one tool on an upstream, using the name the upstream knows. */
export async function callUpstreamTool(
  client: Client,
  name: string,
  args: Record<string, unknown> | undefined,
) {
  return client.callTool({ name, arguments: args ?? {} }, undefined, {
    timeout: config.upstreamTimeoutMs,
  });
}

/** Best-effort close; a failed disconnect must never fail the request. */
export async function closeUpstream(client: Client): Promise<void> {
  try {
    await client.close();
  } catch {
    /* ignore */
  }
}
