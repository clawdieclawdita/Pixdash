# ---- Stage 1: Build ----
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.17.1 --activate

# sharp needs vips on Alpine
RUN apk add --no-cache vips-dev build-base

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter @pixdash/shared build && \
    pnpm --filter backend build && \
    pnpm --filter frontend build

# ---- Stage 2: Runtime ----
FROM node:20-alpine

RUN corepack enable && corepack prepare pnpm@10.17.1 --activate

# sharp needs vips at runtime for collision grid generation
RUN apk add --no-cache vips

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/packages/shared/dist ./packages/shared/dist/
COPY --from=builder /app/packages/backend/dist ./packages/backend/dist/
COPY --from=builder /app/packages/frontend/dist ./packages/frontend/dist/

# Assets mounted via docker-compose volume
COPY --from=builder /app/assets ./assets

# Pixdash configuration
COPY pixdash.json ./pixdash.json

EXPOSE ${PIXDASH_PORT:-5555}

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:${PIXDASH_PORT:-5555}/api/v1/health || exit 1

CMD ["sh", "-c", "node packages/backend/dist/server.js"]
