import express, { type NextFunction, type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ProfileModel } from "../database/models/index.js";
import { createGatewayServer, type GatewayScope } from "./gatewayServer.js";
import { oauthProvider } from "../features/oauth/oauth.provider.js";
import { protectedResourceMetadataUrl } from "../features/oauth/oauth.route.js";

export const gatewayRouter = express.Router();

/**
 * The aggregated MCP endpoint: https://sirup.gg/mcp
 *
 * This is the whole product surface for an AI client. Point any MCP client at
 * this one URL -- with a profile token, or through OAuth -- and it sees every
 * tool from every connected upstream server.
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
  // Never for OAuth tokens -- see authenticateGateway.
  if (typeof req.query.token === "string" && req.query.token) {
    return req.query.token;
  }
  return null;
}

/**
 * Tells the two credential types apart by prefix.
 *
 * Profile tokens are `sirup_<hex>`; OAuth access tokens are `sirup_at_<hex>`.
 * Both are looked up by an indexed exact match, so this is not a security
 * boundary -- an OAuth token presented as a profile token simply finds no row.
 * It exists to avoid two queries on every request, and to keep the failure
 * message accurate about which kind of credential was rejected.
 */
function looksLikeOAuthToken(token: string): boolean {
  return token.startsWith("sirup_at_");
}

/**
 * The RFC 9728 challenge.
 *
 * `resource_metadata` is the part that matters: it is how a client that
 * arrived with no credential discovers there is an authorization server to
 * talk to. A bare `Bearer realm="..."` leaves it with nowhere to go, which is
 * exactly the dead end Claude hits when a connector has no token field.
 */
function challenge(res: Response, error?: string, description?: string): void {
  const parts = [`Bearer realm="sirup.gg"`];
  if (error) parts.push(`error="${error}"`);
  // Quotes and backslashes would terminate the quoted-string early and make
  // the whole header unparseable. The descriptions are ours today, but they
  // carry text from thrown errors, so escape rather than assume.
  if (description) {
    parts.push(`error_description="${description.replace(/[\\"]/g, "")}"`);
  }
  parts.push(`resource_metadata="${protectedResourceMetadataUrl()}"`);

  res.set("WWW-Authenticate", parts.join(", "));
}

/**
 * Resolves a credential to a profile.
 *
 * Two ways in, one outcome. A profile token is a static secret the user copies
 * from the dashboard; an OAuth access token is minted after a browser consent
 * flow. Both resolve to exactly one profile, and everything downstream is
 * scoped to that profile alone -- so the rest of the gateway neither knows nor
 * cares which was used.
 *
 * Supporting both is not redundancy. Clients that let you set a header are
 * fine with the token. Clients that only accept a URL -- Claude's custom
 * connectors being the case in point -- have no way to send one, and OAuth is
 * the only path open to them.
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
      challenge(res);
      res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Missing gateway token." },
        id: null,
      });
      return;
    }

    if (looksLikeOAuthToken(token)) {
      // RFC 6750 §2.3 forbids bearer tokens in the query string, and the MCP
      // spec repeats it. The ?token= escape hatch above exists for clients
      // that cannot set headers; a client doing OAuth demonstrably can, so
      // there is no reason to accept the weaker form from it.
      if (!req.get("authorization")) {
        challenge(res, "invalid_request", "Send the access token in the Authorization header.");
        res.status(401).json({
          jsonrpc: "2.0",
          error: { code: -32001, message: "Access tokens must be sent in the Authorization header." },
          id: null,
        });
        return;
      }

      try {
        const auth = await oauthProvider.verifyAccessToken(token);
        const extra = auth.extra as {
          userId: string;
          companyId: string;
          profileId: string;
          profileName: string;
        };

        req.scope = {
          userId: extra.userId,
          companyId: extra.companyId,
          profileId: extra.profileId,
          profileName: extra.profileName,
        };
        next();
        return;
      } catch (error) {
        // Expired, revoked, or unknown. The client's move is to refresh or to
        // re-run consent, and the challenge tells it where to do that.
        const message = error instanceof Error ? error.message : "Invalid access token.";
        challenge(res, "invalid_token", message);
        res.status(401).json({
          jsonrpc: "2.0",
          error: { code: -32001, message },
          id: null,
        });
        return;
      }
    }

    const profile = await ProfileModel.query().findOne({ gateway_token: token });

    if (!profile) {
      challenge(res, "invalid_token");
      res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Invalid gateway token." },
        id: null,
      });
      return;
    }

    req.scope = {
      userId: profile.user_id,
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
