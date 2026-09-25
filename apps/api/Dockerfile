# syntax=docker/dockerfile:1.7
# Zemi API (NestJS 11, ESM). Build context: repository root.
#   docker build -f apps/api/Dockerfile -t zemi-api .
# Runs `node apps/api/dist/main.js`; migrations (apps/api/drizzle) apply on boot.

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable && corepack prepare pnpm@11.3.0 --activate
WORKDIR /repo

# Full install (with dev deps) to compile shared + api.
FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter "@zemi/api..."
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @zemi/shared build && pnpm --filter @zemi/api build

# Production-only node_modules (no nest cli, typescript, vitest, eslint...).
FROM base AS prod-deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --prod --filter "@zemi/api..."

FROM node:24-bookworm-slim AS run
# ffmpeg/ffprobe for video + recordings, tini to forward signals and reap ffmpeg children.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=4000 \
    HOST=:: \
    NODE_OPTIONS=--enable-source-maps \
    FFMPEG_PATH=/usr/bin/ffmpeg \
    FFPROBE_PATH=/usr/bin/ffprobe \
    MAIL_OUTBOX_DIR=/tmp/zemi-mail-outbox
WORKDIR /repo
COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=prod-deps /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=prod-deps /repo/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=build /repo/package.json ./package.json
COPY --from=build /repo/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/drizzle ./apps/api/drizzle
USER node
EXPOSE 4000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "apps/api/dist/main.js"]
