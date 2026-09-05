/**
 * Drives real traffic through the gateway so the Logs screen has data.
 * Usage: npm run seed:traffic
 */
import { ApiClient, mcpCall } from "./_harness.js";
import type { LogListResponse, SessionResponse } from "../shared/api.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

const api = new ApiClient();

const session = await api.call<SessionResponse>("POST", "/auth/login", {
  email: "demo@sirup.gg",
  password: "demo12345",
});
const token = session.payload.profiles.find((p) => p.is_default)?.gateway_token;
if (!token) throw new Error("Run `npm run seed:demo` first.");

const listed = await mcpCall<{ tools: Tool[] }>(token, "tools/list", {}, 1);
const tools = listed.payload?.result?.tools ?? [];
console.log(`tools/list -> ${tools.length} tools`);

// A real call against a live upstream.
const ask = tools.find((tool) => tool.name === "deepwiki__ask_question");
if (ask) {
  const result = await mcpCall<{ isError?: boolean }>(
    token,
    "tools/call",
    {
      name: ask.name,
      arguments: {
        repoName: "modelcontextprotocol/typescript-sdk",
        question: "What transports does this SDK support?",
      },
    },
    2,
  );
  console.log(`tools/call ${ask.name} -> ${result.payload?.result?.isError ? "error" : "ok"}`);
}

// A call that will fail, to populate the error state.
await mcpCall(token, "tools/call", { name: "gmail__send_email", arguments: {} }, 3);
console.log("tools/call gmail__send_email -> expected failure");

// A few more list calls for volume.
for (let i = 0; i < 3; i += 1) {
  await mcpCall(token, "tools/list", {}, 10 + i);
}

const logs = await api.call<LogListResponse>("GET", "/mcp-logs");
console.log(`\n${logs.payload.logs.length} log entries recorded.`);
