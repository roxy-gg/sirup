import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  listAggregatedTools,
  callAggregatedTool,
  recordLog,
} from "./aggregator.js";
import type { Uuid } from "../../shared/domain.js";

/** Which profile — and therefore which company — a request belongs to. */
export interface GatewayScope {
  companyId: Uuid;
  profileId: Uuid;
  profileName: string;
}

/**
 * Builds the MCP server that a client actually talks to.
 *
 * One per request (stateless mode), with the *profile* fixed at construction
 * time. That is the security boundary: a token resolves to exactly one
 * profile, and every query below is scoped to it, so a request can only ever
 * reach the tools that profile exposes.
 *
 * Tool definitions are read fresh on each tools/list, which means attaching a
 * connection to the profile shows up without the client reconnecting.
 */
export function createGatewayServer(scope: GatewayScope): Server {
  const server = new Server(
    // Naming the profile helps when a client is connected to several.
    { name: `sirup-gg (${scope.profileName})`, version: "0.1.0" },
    { capabilities: { tools: { listChanged: true } } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const startedAt = Date.now();
    const tools = await listAggregatedTools(scope.profileId);

    await recordLog({
      company_id: scope.companyId,
      profile_id: scope.profileId,
      method: "tools/list",
      status: "ok",
      duration_ms: Date.now() - startedAt,
      message: `Served ${tools.length} tool(s).`,
    });

    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      return await callAggregatedTool(scope, name, args);
    } catch (error) {
      // An upstream failure is a *tool* error, not a protocol error: returning
      // it as content lets the model read the message and adapt, instead of
      // the whole conversation blowing up on a transport-level exception.
      const message = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: `sirup.gg could not complete "${name}": ${message}`,
          },
        ],
      };
    }
  });

  return server;
}
