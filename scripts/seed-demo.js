/**
 * Creates a demo account with a live upstream MCP server connected, so the
 * dashboard can be viewed with real data.
 *
 * Usage: node scripts/seed-demo.js
 * Then sign in with demo@sirup.gg / demo12345
 */
const BASE = process.env.BASE_URL || "http://localhost:5173";
const EMAIL = "demo@sirup.gg";
const PASSWORD = "demo12345";

let cookie = "";

async function call(method, path, body) {
  const response = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];

  const text = await response.text();
  return { status: response.status, payload: text ? JSON.parse(text) : null };
}

async function main() {
  let session = await call("POST", "/auth/register", { email: EMAIL, password: PASSWORD });

  if (session.status === 409) {
    console.log("Demo account exists; signing in.");
    session = await call("POST", "/auth/login", { email: EMAIL, password: PASSWORD });
  }

  if (!session.payload?.company) {
    await call("POST", "/auth/company", { name: "Acme Inc" });
  }

  const { servers } = (await call("GET", "/mcp-servers")).payload;

  if (servers.length === 0) {
    for (const server of [
      { name: "DeepWiki", url: "https://mcp.deepwiki.com/mcp", auth_type: "none" },
      { name: "Cloudflare Docs", url: "https://docs.mcp.cloudflare.com/mcp", auth_type: "none" },
      // Deliberately broken, to exercise the error state in the UI.
      { name: "Gmail", url: "https://mcp.example-broken.dev/mcp", auth_type: "none" },
    ]) {
      const result = await call("POST", "/mcp-servers", server);
      console.log(`  ${server.name}: ${result.payload?.server?.status}`);
    }
  }

  const final = (await call("GET", "/auth/session")).payload;
  console.log(`\nSigned in as ${EMAIL} / ${PASSWORD}`);
  console.log(`Gateway token: ${final.company.gateway_token}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
