# syntax=docker/dockerfile:1

# ─── Build ────────────────────────────────────────────────────────────────
# Compiles the React app. Kept separate so build-only dependencies (Vite,
# Tailwind) never reach the runtime image.
FROM node:22-alpine AS build

WORKDIR /app

# Copy manifests first: this layer is cached until dependencies actually
# change, so code edits don't trigger a full reinstall.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
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
# the runtime image matches what was built.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Server code, migrations, and the compiled frontend.
COPY server ./server
COPY knexfile.js ./
COPY --from=build /app/dist ./dist

# Run unprivileged. The node image ships a `node` user for exactly this.
USER node

EXPOSE 3000

# A failing container should be restarted, not left serving errors. This hits
# the API's own health route, which only answers once Express is listening.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/index.js"]
