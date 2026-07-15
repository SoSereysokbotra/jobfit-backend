# syntax=docker/dockerfile:1
#
# Phase 6 — production image for Cloud Run. Multi-stage:
#   builder  — installs all deps, generates the Prisma client, compiles TS -> dist/.
#   runtime  — slim, non-root, prod deps only + compiled output.
#
# The app reads $PORT (Cloud Run injects 8080) and logs JSON to stdout (Cloud Logging picks
# it up automatically). Tracing self-starts only when TRACE_ENABLED=true.

# ---------- builder ----------
FROM node:22-slim AS builder
WORKDIR /app
RUN corepack enable

# Prisma needs OpenSSL to build/generate its query engine.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

# Install deps against the committed lockfile (cached unless manifests change).
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Generate the Prisma client, then compile.
COPY prisma ./prisma
RUN pnpm prisma generate
COPY . .
RUN pnpm build

# Drop dev dependencies from node_modules (keeps the generated Prisma client).
RUN pnpm prune --prod

# ---------- runtime ----------
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --system --uid 10001 --create-home appuser

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json

USER appuser
EXPOSE 8080
# main.ts imports ./tracing first (self-starting, guarded by TRACE_ENABLED).
CMD ["node", "dist/main"]
