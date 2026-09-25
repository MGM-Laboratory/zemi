# Zemi

A pnpm + Turborepo workspace containing a Next.js web app and a NestJS API.

## Apps

- `apps/web` — Next.js App Router frontend (`http://localhost:3000`)
- `apps/api` — NestJS API using the Express adapter (`http://localhost:4000`)

## Getting started

```bash
pnpm install
pnpm dev
```

Copy each app's `.env.example` to `.env.local` (web) or `.env` (API) before configuring non-default values.

## Workspace commands

```bash
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm format
```

The API exposes `GET /api/v1/health` and interactive OpenAPI docs at `/docs` outside production.
