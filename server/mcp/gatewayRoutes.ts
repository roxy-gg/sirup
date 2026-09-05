import express, { type NextFunction, type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ProfileModel } from "../database/models/index.js";
import { createGatewayServer, type GatewayScope } from "./gatewayServer.js";

export const gatewayRouter = express.Router();

/**
 * The aggregated MCP endpoint: https://sirup.gg/mcp
 *
 * This is the whole product surface for an AI client. Point any MCP client at
 * this one URL with the company's gateway token and it sees every tool from
 * every connected upstream server.
 */

/** A request that has passed gateway authentication. */
interface GatewayRequest extends Request {
  scope?: GatewayScope;
}

/** Reads the gateway token from an Authorization header or ?token= query. */
function extractToken(req: Request): string | null {
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
 * Resolves the gateway token to a profile.
 *
 * The token identifies a profile, not a company: that is what lets one
 * workspace hand different tool sets to different clients. The company comes
 * along for logging and tenancy checks.
 *
 * Wrapped so a database failure returns a JSON-RPC error instead of rejecting
 * inside bare Express middleware, which would hang the client and crash the
 * process.
 */
async function authenticateGateway(
  req: GatewayRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = extractToken(req);

    if (!token) {
      // RFC 9728 / MCP authorization: tell the client how to authenticate.
      res.set("WWW-Authenticate", 'Bearer realm="sirup.gg"');
      res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Missing gateway token." },
        id: null,
      });
      return;
    }

    const profile = await ProfileModel.query().findOne({ gateway_token: token });

    if (!profile) {
      res.set("WWW-Authenticate", 'Bearer realm="sirup.gg", error="invalid_token"');
      res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Invalid gateway token." },
        id: null,
      });
      return;
    }

    req.scope = {
      companyId: profile.company_id,
      profileId: profile.id,
      profileName: profile.name,
    };
    next();
  } catch (error) {
    console.error("[gateway] auth failed:", error);
    res.status(500).json({
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
gatewayRouter.post("/", authenticateGateway, async (req: GatewayRequest, res) => {
  const scope = req.scope;
  if (!scope) return; // authenticateGateway already answered.

  const server = createGatewayServer(scope);
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
function wantsHtml(req: Request): boolean {
  const accept = req.get("accept") ?? "";
  return accept.includes("text/html") && !accept.includes("text/event-stream");
}

function methodNotAllowed(req: Request, res: Response, next: NextFunction): void {
  if (wantsHtml(req)) return next();

  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed." },
    id: null,
  });
}

gatewayRouter.get("/", methodNotAllowed);
gatewayRouter.delete("/", methodNotAllowed);
