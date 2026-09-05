/** Verifies /mcp serves the dashboard to browsers and MCP to clients. */
import { BASE, Checks } from "./_harness.js";

const t = new Checks(`Dual-purpose /mcp route against ${BASE}`);

const cases = [
  {
    label: "browser navigation gets the SPA shell",
    headers: { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9" },
    expect: (status: number, body: string) => status === 200 && body.includes('id="root"'),
  },
  {
    label: "MCP client SSE probe gets 405",
    headers: { Accept: "text/event-stream" },
    expect: (status: number) => status === 405,
  },
  {
    label: "generic JSON client gets 405",
    headers: { Accept: "application/json" },
    expect: (status: number) => status === 405,
  },
];

for (const testCase of cases) {
  const response = await fetch(`${BASE}/mcp`, { headers: testCase.headers });
  const body = await response.text();
  t.check(testCase.label, testCase.expect(response.status, body), response.status);
}

t.finish();
