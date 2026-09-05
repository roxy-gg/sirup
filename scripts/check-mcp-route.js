/** Verifies /mcp serves the dashboard to browsers and MCP to clients. */
const BASE = process.env.BASE_URL || "http://localhost:5173";

const cases = [
  {
    label: "browser navigation gets the SPA shell",
    headers: { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9" },
    expect: (status, body) => status === 200 && body.includes('id="root"'),
  },
  {
    label: "MCP client SSE probe gets 405",
    headers: { Accept: "text/event-stream" },
    expect: (status) => status === 405,
  },
  {
    label: "generic JSON client gets 405",
    headers: { Accept: "application/json" },
    expect: (status) => status === 405,
  },
];

const run = async () => {
  let failed = 0;

  for (const testCase of cases) {
    const response = await fetch(`${BASE}/mcp`, { headers: testCase.headers });
    const body = await response.text();
    const ok = testCase.expect(response.status, body);
    if (!ok) failed += 1;
    console.log(`${ok ? "PASS" : "FAIL"}  ${testCase.label} (${response.status})`);
  }

  process.exit(failed === 0 ? 0 : 1);
};

run();
