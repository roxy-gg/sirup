/**
 * Creates a demo account with live upstream MCP servers connected, so the
 * dashboard can be viewed with real data.
 *
 * Usage: npm run seed:demo
 * Then sign in with demo@sirup.gg / demo12345
 */
import { ApiClient } from "./_harness.js";
import type {
  ConnectServerBody,
  ServerListResponse,
  ServerResponse,
  SessionResponse,
} from "../shared/api.js";

const EMAIL = "demo@sirup.gg";
const PASSWORD = "demo12345";

const api = new ApiClient();

let session = await api.call<SessionResponse>("POST", "/auth/register", {
  email: EMAIL,
  password: PASSWORD,
});

if (session.status === 409) {
  console.log("Demo account exists; signing in.");
  session = await api.call<SessionResponse>("POST", "/auth/login", {
    email: EMAIL,
    password: PASSWORD,
  });
}

if (!session.payload?.company) {
  await api.call("POST", "/auth/company", { name: "Acme Inc" });
}

const { payload } = await api.call<ServerListResponse>("GET", "/mcp-servers");

if (payload.servers.length === 0) {
  const seeds: ConnectServerBody[] = [
    { name: "DeepWiki", url: "https://mcp.deepwiki.com/mcp", auth_type: "none" },
    {
      name: "Cloudflare Docs",
      url: "https://docs.mcp.cloudflare.com/mcp",
      auth_type: "none",
    },
    // Deliberately broken, to exercise the error state in the UI.
    { name: "Gmail", url: "https://mcp.example-broken.dev/mcp", auth_type: "none" },
  ];

  for (const seed of seeds) {
    const result = await api.call<ServerResponse>("POST", "/mcp-servers", seed);
    console.log(`  ${seed.name}: ${result.payload?.server?.status}`);
  }
}

const final = await api.call<SessionResponse>("GET", "/auth/session");
console.log(`\nSigned in as ${EMAIL} / ${PASSWORD}`);
console.log(`Gateway token: ${final.payload.profiles.find((p) => p.is_default)?.gateway_token}\n`);
