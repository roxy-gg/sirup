import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Company } from "../database/models/index.js";
import { createGatewayServer } from "./gatewayServer.js";

export const gatewayRouter = express.Router();

/**
 * The aggregated MCP endpoint: https://sirup.gg/mcp
 *
 * This is the whole product surface for an AI client. Point any MCP client at
 * this one URL with the company's gateway token and it sees every tool from
 * every connected upstream server.
 */

/** Reads the gateway token from an Authorization header or ?token= query. */
function extractToken(req) {
  const header = req.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim();
  }
  // Some MCP clients cannot set custom headers; allow the token in the URL.
  if (typeof req.query.token === "string" && req.query.token) {
    return req.query.token;
  }
  return null;
}

/**
 * Reads the gateway token and resolves the company.
 *
 * Wrapped so a database failure returns a JSON-RPC error instead of rejecting
 * inside bare Express middleware, which would hang the client and crash the
 * process.
 */
async function authenticateGateway(req, res, next) {
  try {
    const token = extractToken(req);

    if (!token) {
      // RFC 9728 / MCP authorization: tell the client how to authenticate.
      res.set("WWW-Authenticate", 'Bearer realm="sirup.gg"');
      return res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Missing gateway token." },
        id: null,
      });
    }

    const company = await Company.query().findOne({ gateway_token: token });

    if (!company) {
      res.set("WWW-Authenticate", 'Bearer realm="sirup.gg", error="invalid_token"');
      return res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Invalid gateway token." },
        id: null,
      });
    }

    req.company = company;
    return next();
  } catch (error) {
    console.error("[gateway] auth failed:", error);
    return res.status(500).json({
      jsonrpc: "2.0",
      error: { code: -32603, message: "Internal gateway error." },
      id: null,
    });
  }
}

/**
 * Handles one Streamable HTTP request.
 *
 * Stateless mode (`sessionIdGenerator: undefined`) is deliberate: a fresh
 * Server and transport per request means no session state to pin to a single
 * process, so the gateway scales horizontally without sticky sessions. The
 * aggregator holds the only long-lived state, in the upstream connection pool.
 */
gatewayRouter.post("/", authenticateGateway, async (req, res) => {
  const server = createGatewayServer(req.company);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  // Tear down when the client goes away, or the pair leaks per request.
  res.on("close", () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("[gateway] request failed:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal gateway error." },
        id: null,
      });
    }
  }
});

/**
 * `/mcp` is deliberately two things at once: the MCP endpoint that clients POST
 * to, and the dashboard URL a human visits. That's what lets the product hand
 * out one memorable address, `sirup.gg/mcp`, for both audiences.
 *
 * The two are told apart by `Accept`. An MCP client opening a server-initiated
 * stream sends `text/event-stream`; a browser navigation sends `text/html`.
 * Browser navigations fall through to the SPA, everything else gets the
 * spec-compliant 405 (there is no server-initiated stream in stateless mode).
 */
function wantsHtml(req) {
  const accept = req.get("accept") || "";
  return accept.includes("text/html") && !accept.includes("text/event-stream");
}

function methodNotAllowed(req, res, next) {
  if (wantsHtml(req)) return next();

  return res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed." },
    id: null,
  });
}

gatewayRouter.get("/", methodNotAllowed);
gatewayRouter.delete("/", methodNotAllowed);
