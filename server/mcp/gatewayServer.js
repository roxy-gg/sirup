import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { listAggregatedTools, callAggregatedTool, recordLog } from "./aggregator.js";

/**
 * Builds the MCP server that a company's AI client actually talks to.
 *
 * One of these is created per request (stateless mode): the company is fixed at
 * construction time, so a request can only ever reach its own tools. Tool
 * definitions are read fresh from the cache on each tools/list, which means a
 * newly connected server shows up without the client reconnecting.
 */
export function createGatewayServer(company) {
  const server = new Server(
    { name: "sirup-gg", version: "0.1.0" },
    { capabilities: { tools: { listChanged: true } } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const startedAt = Date.now();
    const tools = await listAggregatedTools(company.id);

    await recordLog({
      company_id: company.id,
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
      return await callAggregatedTool(company.id, name, args);
    } catch (error) {
      // An upstream failure is a *tool* error, not a protocol error: returning
      // it as content lets the model read the message and adapt, instead of
      // the whole conversation blowing up on a transport-level exception.
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `sirup.gg could not complete "${name}": ${error.message}`,
          },
        ],
      };
    }
  });

  return server;
}
