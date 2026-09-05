/**
 * Drives real traffic through the gateway so the Logs screen has data.
 * Usage: node scripts/exercise-gateway.js
 */
const BASE = process.env.BASE_URL || "http://localhost:5173";

let cookie = "";

async function apiCall(method, path, body) {
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
  return text ? JSON.parse(text) : null;
}

async function mcpCall(token, method, params, id) {
  const response = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  const text = await response.text();
  if (text.includes("data:")) {
    const line = text.split("\n").find((l) => l.startsWith("data:"));
    return line ? JSON.parse(line.slice(5).trim()) : null;
  }
  return text ? JSON.parse(text) : null;
}

async function main() {
  const session = await apiCall("POST", "/auth/login", {
    email: "demo@sirup.gg",
    password: "demo12345",
  });
  const token = session.company.gateway_token;

  const listed = await mcpCall(token, "tools/list", {}, 1);
  const tools = listed?.result?.tools || [];
  console.log(`tools/list -> ${tools.length} tools`);

  // A real call against a live upstream.
  const ask = tools.find((tool) => tool.name === "deepwiki__ask_question");
  if (ask) {
    const result = await mcpCall(token, "tools/call", {
      name: ask.name,
      arguments: {
        repoName: "modelcontextprotocol/typescript-sdk",
        question: "What transports does this SDK support?",
      },
    }, 2);
    console.log(`tools/call ${ask.name} -> ${result?.result?.isError ? "error" : "ok"}`);
  }

  // A call that will fail, to populate the error state.
  await mcpCall(token, "tools/call", { name: "gmail__send_email", arguments: {} }, 3);
  console.log("tools/call gmail__send_email -> expected failure");

  // A few more list calls for volume.
  for (let i = 0; i < 3; i += 1) {
    await mcpCall(token, "tools/list", {}, 10 + i);
  }

  const logs = await apiCall("GET", "/mcp-logs");
  console.log(`\n${logs.logs.length} log entries recorded.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
