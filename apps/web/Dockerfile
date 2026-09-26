# Zemi web (Next.js 16, standalone). Build context: repository root.
FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@11.3.0 --activate
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
ENV CI=true
RUN pnpm install --frozen-lockfile --filter "@zemi/web..."

FROM deps AS build
COPY packages/shared packages/shared
COPY apps/web apps/web
# NEXT_PUBLIC_* values are inlined at build time, and next.config rewrites() are baked into the
# routes manifest at build time too, so API_INTERNAL_URL must be present here as well.
# Railway passes service variables as build args.
ARG NEXT_PUBLIC_API_PUBLIC_URL
ARG NEXT_PUBLIC_SITE_URL
ARG API_INTERNAL_URL
ARG SITE_INDEXING
ENV NEXT_PUBLIC_API_PUBLIC_URL=$NEXT_PUBLIC_API_PUBLIC_URL \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    API_INTERNAL_URL=$API_INTERNAL_URL \
    SITE_INDEXING=$SITE_INDEXING
RUN pnpm --filter @zemi/shared build && pnpm --filter @zemi/web build

FROM node:24-slim AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=:: NEXT_TELEMETRY_DISABLED=1
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
