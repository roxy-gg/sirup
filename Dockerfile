# syntax=docker/dockerfile:1

# ─── Build ────────────────────────────────────────────────────────────────
# Compiles the React app and type-checks the whole repo. Kept separate so
# build-only dependencies (Vite, Tailwind, typescript) never reach the runtime
# image.
FROM node:22-alpine AS build

WORKDIR /app

# Copy manifests first: this layer is cached until dependencies actually
# change, so code edits don't trigger a full reinstall.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# `npm run build` runs `tsc -b` first, so a type error fails the image build
# rather than shipping and breaking at runtime.
RUN npm run build

# ─── Runtime ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

ENV NODE_ENV=production
# Pin the port in the image so the app and the HEALTHCHECK below agree on it.
# Without this the app would fall back to its dev default (5173) while the
# healthcheck probed 3000, and the container would be killed as unhealthy.
ENV PORT=3000

# tini reaps zombies and forwards signals, so SIGTERM from `docker stop`
# actually reaches Node instead of being swallowed by PID 1.
RUN apk add --no-cache tini

WORKDIR /app

# Production dependencies only. `npm ci --omit=dev` respects the lockfile, so
# the runtime image matches what was built. tsx is a runtime dependency
# because the server is executed straight from TypeScript.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# The server runs from source via tsx, so the TypeScript sources ship rather
# than a compiled bundle. tsconfig files come along because tsx reads the
# compiler options (notably the path aliases) at load time.
COPY server ./server
COPY shared ./shared
COPY knexfile.ts ./
# All four: the root tsconfig references the others, and tsx reads the
# compiler options from it at load time.
COPY tsconfig.json tsconfig.base.json tsconfig.server.json tsconfig.app.json tsconfig.scripts.json ./

# The compiled frontend from the build stage.
COPY --from=build /app/dist ./dist

# Run unprivileged. The node image ships a `node` user for exactly this.
USER node

EXPOSE 3000

# A failing container should be restarted, not left serving errors. This hits
# the API's own health route, which only answers once Express is listening.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--import", "tsx", "server/index.ts"]
