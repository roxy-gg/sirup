/**
 * DATA -- the starter catalog shown on the Discover screen.
 *
 * Deliberately a static list, not a table. These are public, well-known remote
 * MCP servers; they are the same for every company and change only when we ship
 * a new version. Putting them in the database would mean seeding and migrating
 * rows that no user ever edits.
 *
 * `url` is null where a provider has no single public remote endpoint yet -- the
 * UI shows those as "Bring your own URL" rather than pretending to one-click.
 */
const CATALOG = [
  {
    key: "github",
    name: "GitHub",
    category: "Development",
    description: "Repositories, issues, and pull requests.",
    url: "https://api.githubcopilot.com/mcp/",
    auth_type: "bearer",
    auth_hint: "GitHub personal access token",
  },
  {
    key: "sentry",
    name: "Sentry",
    category: "Development",
    description: "Errors, traces, and release health.",
    url: "https://mcp.sentry.dev/mcp",
    auth_type: "none",
    auth_hint: "Authorizes in-app after connecting.",
  },
  {
    key: "linear",
    name: "Linear",
    category: "Productivity",
    description: "Issues, projects, and cycles.",
    url: "https://mcp.linear.app/mcp",
    auth_type: "none",
    auth_hint: "Authorizes in-app after connecting.",
  },
  {
    key: "notion",
    name: "Notion",
    category: "Productivity",
    description: "Pages, databases, and comments.",
    url: "https://mcp.notion.com/mcp",
    auth_type: "none",
    auth_hint: "Authorizes in-app after connecting.",
  },
  {
    key: "stripe",
    name: "Stripe",
    category: "Business",
    description: "Customers, payments, and subscriptions.",
    url: "https://mcp.stripe.com",
    auth_type: "bearer",
    auth_hint: "Stripe restricted API key",
  },
  {
    key: "cloudflare-docs",
    name: "Cloudflare Docs",
    category: "Development",
    description: "Search Cloudflare product documentation.",
    url: "https://docs.mcp.cloudflare.com/mcp",
    auth_type: "none",
    auth_hint: "No credentials required.",
  },
  {
    key: "deepwiki",
    name: "DeepWiki",
    category: "Research",
    description: "Ask questions about any public GitHub repo.",
    url: "https://mcp.deepwiki.com/mcp",
    auth_type: "none",
    auth_hint: "No credentials required.",
  },
  {
    key: "custom",
    name: "Custom server",
    category: "Custom",
    description: "Any MCP server with an http(s) endpoint.",
    url: null,
    auth_type: "none",
    auth_hint: "Paste your own endpoint URL.",
  },
];

export function listCatalog() {
  return CATALOG;
}

export function findCatalogEntry(key) {
  return CATALOG.find((entry) => entry.key === key) || null;
}
