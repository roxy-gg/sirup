# sirup.gg

**One MCP endpoint for your whole company.**

Connect every MCP server your team uses — GitHub, Linear, Sentry, your own
internal ones — and sirup exposes them through a single endpoint. Point Claude,
Cursor, or any MCP client at that one URL. Add a server later and every client
picks it up without touching a config file.

Free, open source, and self-hostable.

```
┌──────────┐                                      ┌──────────────┐
│  Claude  │ ──┐                              ┌── │  GitHub MCP  │
├──────────┤   │   ┌──────────────────────┐   │   ├──────────────┤
│  Cursor  │ ──┼── │  sirup.gg/mcp        │ ──┼── │  Linear MCP  │
├──────────┤   │   │  one endpoint, one   │   │   ├──────────────┤
│  VS Code │ ──┘   │  token, all tools    │   └── │  Your MCP    │
└──────────┘       └──────────────────────┘       └──────────────┘
```

## Quick start

```bash
npm install
docker compose -f docker-compose.dev.yml up -d   # Postgres
npm run dev
```

<http://localhost:5173>. Migrations run automatically at boot, so there is no
separate setup step. The app itself runs on the host — one command, one port,
one process — so you keep HMR.

No Docker locally? Any Postgres will do; point `DATABASE_URL` at it.

For production, see [Deploying](#deploying-to-dokploy).

## How it works

1. **Register** and name your company. That mints your gateway token.
2. **Connect** MCP servers from the catalog, or paste any `http(s)` endpoint.
3. **Point your AI client** at `https://your-host/mcp`.

### Two ways to authenticate

Clients differ in what they can send, so the endpoint accepts both. Same URL,
same tools; only the credential differs.

**A profile token**, for anything that lets you set a header — Cursor, scripts,
CI:

### Managed OAuth

Gmail connects through a managed OAuth integration. One sign-in creates one
normal sirup connection, so linking several Google accounts gives each account
its own label, tool namespace, permissions, profile attachments, and
connection-pool entry — exactly like connecting two API keys.

Before Gmail becomes connectable in the catalog:

1. Enable `gmail.googleapis.com` and `gmailmcp.googleapis.com` in a Google Cloud
   project enrolled in the Workspace Developer Preview.
2. Create a Web application OAuth client and register
   `https://your-host/api/integrations/oauth/callback` as an exact redirect URI.
3. Configure `APP_ORIGIN`, `CREDENTIAL_ENCRYPTION_KEY`,
   `GOOGLE_OAUTH_CLIENT_ID`, and `GOOGLE_OAUTH_CLIENT_SECRET`.

The integration requests `https://mail.google.com/` — Gmail's full-access scope
— so every tool the endpoint advertises actually works. Requesting the narrower
`gmail.readonly` + `gmail.compose` pair only authorizes 8 of the 23 tools;
labelling, trashing, and spam all fail without `gmail.modify`. OAuth tokens and
PKCE verifiers are encrypted at rest with AES-256-GCM; state is hashed,
single-use, short-lived, and bound to the browser that started the flow.

Note that the Gmail MCP server currently exposes **no send tool** — the closest
is `create_draft`. That is Google's decision, not a scope we are withholding.

Adding another provider is one file in `server/integrations/` plus a catalog
entry with an `integration_key`.

```json
{
  "mcpServers": {
    "sirup": {
      "type": "http",
      "url": "https://your-host/mcp",
      "headers": { "Authorization": "Bearer sirup_..." }
    }
  }
}
```

**OAuth**, for clients that only accept a URL. Claude's "Add custom connector"
dialog has one field and no place to put a token; VS Code is the same. Those
clients get the endpoint on its own:

```json
{
  "mcpServers": {
    "sirup": { "type": "http", "url": "https://your-host/mcp" }
  }
}
```

The client then discovers everything else on its own: it calls the endpoint,
gets a `401` carrying a `resource_metadata` pointer, reads the metadata,
registers itself, and opens a browser where you choose which profile it may
see. No token is ever copied or pasted.

That flow is OAuth 2.1 with PKCE, implemented against the MCP authorization
spec — RFC 8414 metadata, RFC 7591 dynamic client registration, RFC 9728
protected resource metadata, and RFC 8707 resource indicators. Access tokens
last an hour, refresh tokens rotate on every use, and replaying a rotated one
revokes the whole grant. Authorized clients are listed in the dashboard and can
be revoked there.

Both paths resolve to exactly one profile, so a client — however it
authenticated — sees precisely the tools that profile exposes and nothing else.

### Tool namespacing

Two servers can easily both expose a `search` tool. sirup prefixes every tool
with its server slug, so the model can tell them apart and names never collide:

```
gmail__search_threads  linear__search      github__create_issue
```

### Transports

The gateway speaks **Streamable HTTP** and tries it against upstreams first,
falling back to the deprecated **HTTP+SSE** transport on a 4xx — the
compatibility strategy the spec recommends.

`stdio` upstreams are intentionally **not** supported: a hosted multi-tenant
gateway must not spawn arbitrary subprocesses on its users' behalf.

The gateway itself runs **stateless** (a fresh MCP server per request), so it
scales horizontally with no sticky sessions. The only long-lived state is the
upstream connection pool, which reuses connections so each tool call doesn't
pay for a fresh `initialize` handshake.

### `/mcp` serves two audiences

The same URL is the MCP endpoint and the dashboard. They're told apart by the
`Accept` header: browser navigations get the app, everything else gets MCP. That
way there's one memorable address to hand out.

## Architecture

Single repo, single process. Express owns the HTTP server; in dev, Vite runs as
middleware (so HMR works with no second server, no proxy, no CORS), and in prod
the same server serves `dist/`.

### Backend — `route → logic → data`

Each feature is one folder with the same three layers. Routes do HTTP only,
logic holds the rules, data holds every Objection query.

```
server/features/mcp-servers/
├── mcpServers.route.ts     HTTP: parse, call logic, respond
├── mcpServers.logic.ts     validation, orchestration
└── mcpServers.data.ts      Objection queries, nothing else
```

```
server/
├── index.ts routes, then /mcp, then the SPA catch-all
├── config.ts
├── database/               migrations, Objection models
├── integrations/           managed OAuth providers and encrypted grants
├── mcp/                    the aggregator
│   ├── gatewayRoutes.ts    the public /mcp endpoint
│   ├── gatewayServer.ts    MCP server exposing aggregated tools
│   ├── aggregator.ts       namespacing, fan-out, routing, logging
│   ├── connectionPool.ts   reuses upstream connections
│   └── upstreamClient.ts   connects out, with transport fallback
└── features/               auth · mcp-servers · mcp-logs · mcp-catalog
```

### Frontend — `components / hooks / data`

One folder per full screen, always the same three subfolders. Components are
stateless, hooks hold state and orchestration, data holds interfaces and API
calls.

```
app/src/features/mcp-manage/
├── components/    stateless UI (.tsx)
├── hooks/         state, orchestration
└── data/          API calls, typed by shared/api.ts
```

Screens: `marketing` · `onboarding` · `mcp-manage` · `mcp-discover` ·
`mcp-logs` · `skills` · `auth` · `theme`.

Routes: `/` is the public landing page, `/start` is onboarding, and everything
else sits behind a finished workspace. The landing page reads the catalog from
`GET /api/public/apps` — the same list the dashboard uses, so the logos and
counts it shows cannot drift from what the product actually connects to.

## Stack

TypeScript · React · Express · Objection.js · Knex · Postgres · shadcn/ui ·
Tailwind v4 · `@modelcontextprotocol/sdk`

### One API contract, checked on both sides

`shared/` holds the domain types and the HTTP contract, and both the server and
the browser import them. A route that changes its response shape fails to
compile until every caller is updated — the mismatch surfaces at build time
instead of as a runtime `undefined`.

```
shared/
├── domain.ts    entities: Company, McpServer, McpTool, McpLog
└── api.ts       request bodies and response envelopes per endpoint
```

Renaming one field in `shared/domain.ts` currently produces errors in the
server, the frontend, and the check scripts simultaneously. That is the point.

Type checking is strict (`noUncheckedIndexedAccess`, `noImplicitOverride`,
`verbatimModuleSyntax`) and runs as three projects — server, app, scripts —
behind `npm run typecheck`. `npm run build` runs it first, so a type error
fails the Docker image build rather than shipping.

The server runs straight from TypeScript via `tsx`, so there is no compile step
and no `dist/` for the backend. `tsx` is therefore a **runtime** dependency, not
a dev one.

### Data model

Every primary key is a **UUIDv4**, generated by Postgres via
`gen_random_uuid()` so the database stays the source of truth. Ids are
unguessable and safe to expose in URLs, and nothing leaks how many companies or
tool calls exist.

One consequence worth knowing: **random ids carry no ordering**, so the logs
feed cannot paginate on `id DESC`. It uses a composite `(created_at, id)`
keyset cursor instead, matched by an index on the same tuple. The cursor is
base64-encoded and opaque — don't construct one by hand.

Indexes are built against the actual hot paths, and `scripts/check-indexes.ts`
runs `EXPLAIN` to prove the planner uses each one rather than trusting that it
exists:

| Index | Serves |
| --- | --- |
| `mcp_logs_company_created_idx` | the keyset log feed |
| `mcp_logs_company_status_created_idx` | the 24h rollup |
| `mcp_logs_server_created_idx` *(partial)* | per-server logs |
| `mcp_tools_namespaced_name_idx` | resolving a tool on every `tools/call` |
| `mcp_tools_server_enabled_idx` *(partial)* | `tools/list` |
| `mcp_servers_company_created_idx` | the dashboard list |

## Deploying to Dokploy

The app and Postgres run side by side on one server. `docker-compose.yml` is
written for it.

1. **Create** a Docker Compose service pointed at this repo.
2. **Environment tab** — set:
   ```
   JWT_SECRET=<64 random hex chars>
   POSTGRES_PASSWORD=<a strong password>
   APP_ORIGIN=https://your-host
   CREDENTIAL_ENCRYPTION_KEY=<64 random hex chars>
   GOOGLE_OAUTH_CLIENT_ID=<optional; enables Gmail>
   GOOGLE_OAUTH_CLIENT_SECRET=<optional; enables Gmail>
   ```
   Generate the encryption key independently from `JWT_SECRET`; changing it
   later makes existing OAuth grants unreadable and requires reconnecting them.
   The Google variables are optional when Gmail is not enabled. Generate a
   secret with:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
   `JWT_SECRET` and `POSTGRES_PASSWORD` are declared `${VAR:?}`, so a deploy
   fails loudly rather than silently booting with insecure defaults.
   `APP_ORIGIN` must be the https URL users actually reach: it is both the
   callback origin for outbound OAuth and the issuer MCP clients compare
   literally when authenticating to your endpoint.
3. **Domains tab** — add your domain, service `app`, port `3000`. Dokploy
   injects the Traefik labels and attaches `dokploy-network` itself, which is
   why neither appears in the compose file.
4. **Deploy.** Migrations run on boot; there is no release step.

Notes on the setup:

- **Postgres is not published.** No `ports:` on `db` — it is reachable only
  over the private `sirup_internal` network, and it is deliberately kept off
  `dokploy-network` so Traefik has no route to it.
- **The volume is a named volume** (`sirup_db_data`), which is what Dokploy's
  Volume Backups can snapshot to S3. Bind mounts cannot be backed up.
- **The app waits for Postgres**, on top of the compose healthcheck, so a cold
  start doesn't crash-loop.
- `DATABASE_SSL` stays `false`: the database is on the same private network.
  Set it to `true` only if you move to a managed provider.

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Everything, one port, with HMR and server auto-restart |
| `npm run typecheck` | Strict type check across server, app, and scripts |
| `npm run build` | Type check, then build the React app |
| `npm start` | Production server |
| `npm run db:up` / `db:down` | Local Postgres via Docker |
| `npm run pg:dev` | Local Postgres without Docker (embedded binary) |
| `npm run migrate` | Run migrations manually |
| `npm run db:schema` | Print the live schema and indexes |
| `npm test` | Type check plus the full suite, against a running dev server |
| `npm run seed:demo` | Demo account with servers connected |

`npm test` covers: strict type checking, build/deploy preflight, connection
config, encrypted OAuth state, an end-to-end run against a live MCP server,
regressions, keyset pagination correctness, upstream connection reuse,
database-side timestamps, index usage via `EXPLAIN` on 43k seeded rows, the
dual-purpose `/mcp` route, and a full inbound OAuth 2.1 flow (discovery,
dynamic registration, PKCE, consent, token exchange, refresh rotation, and
revocation).

## Configuration

The core app has working defaults in development. Managed OAuth requires its
provider credentials and encryption key. See `.env.example`.

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `5173` locally, `3000` in the image | |
| `JWT_SECRET` | ephemeral | **Required in production** |
| `APP_ORIGIN` | local app URL in dev | **Required in production.** Outbound OAuth callbacks, and the issuer/resource identifier for inbound OAuth |
| `CREDENTIAL_ENCRYPTION_KEY` | — | 32-byte base64 or 64-char hex key; required for managed OAuth |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | - | Enables Gmail, Drive, Sheets, Docs, and Slides |
| `PGHOST` / `PGPORT` / `PGUSER` / `PGPASSWORD` / `PGDATABASE` | — | Preferred; what compose uses |
| `DATABASE_URL` | `postgres://sirup:sirup@localhost:5432/sirup` | Fallback when `PGHOST` is unset |
| `DATABASE_SSL` | `false` | `true` only for a managed provider |
| `DB_POOL_MIN` / `DB_POOL_MAX` | `2` / `10` | |
| `UPSTREAM_TIMEOUT_MS` | `30000` | Bound on upstream calls |

Compose passes the discrete `PG*` variables rather than composing a
`DATABASE_URL`, because a URL has to be escaped — a generated password
containing `/`, `#`, or `@` makes URL parsing throw and the app crash-loop.

## Status

Working today: registration and onboarding, connecting upstream MCP servers,
tool discovery and namespacing, the aggregated gateway, per-tool enable/disable,
and the audit log.

Not built yet, and worth being honest about:

- **Generic OAuth for upstreams.** The five Google Workspace apps have managed
  OAuth integrations with encrypted per-account grants. Other OAuth providers
  still need an explicit, reviewed integration before they can be connected.
- **Teams.** One user per company. No invites or roles.
- **Skills.** The nav entry is a placeholder. Skills-over-MCP is still an open
  working group at the MCP project, and guessing at the shape now would mean
  rewriting it when the spec lands.
- **Tool-count pressure.** Aggregating many servers puts a lot of tools in the
  model's context. Per-tool disabling exists; smarter filtering doesn't yet.

## License

MIT
