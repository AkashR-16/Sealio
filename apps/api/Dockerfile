# Sealio API (apps/api) container image.
# Build context MUST be the repo root so the pnpm workspace packages (@sealio/db, @sealio/types)
# are available — the API runs via tsx and consumes their TypeScript source directly (same as dev
# and the Render deploy). Works on any Docker host (Fly.io, Koyeb, Railway, etc.).
FROM node:22-slim

# Prisma needs OpenSSL at runtime.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@10
WORKDIR /app

# Install the whole workspace, then generate the Prisma client.
COPY . .
RUN pnpm install --frozen-lockfile \
    && pnpm --filter @sealio/db generate

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# The server binds 0.0.0.0:$PORT (apps/api/src/server.ts). Run pending migrations first
# (idempotent — "No pending migrations" is a fast no-op), then start the server. This matches the
# Render start command and works on hosts without a separate release phase (e.g. Koyeb).
CMD ["sh", "-c", "pnpm --filter @sealio/db exec prisma migrate deploy && pnpm --filter @sealio/api exec tsx src/server.ts"]
