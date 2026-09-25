# api-core: the NestJS foundation

Everything cross-cutting in `apps/api`: boot, config, DB, errors, validation, auth + RBAC, audit,
storage, `/media/*`, jobs, realtime (SSE), assets (upload + processing), mail, revalidation, and the
superadmin area (admins, sessions, audit log, system). Feature modules (events, speakers, ...) are
empty stubs registered in `AppModule`; fill them in on top of this.

Verified locally on 2026-09-25 against Postgres + MinIO (see "What is verified" at the end).

---

## 1. Quick start

```bash
pnpm --filter @zemi/shared build          # the API imports @zemi/shared from dist
pnpm --filter @zemi/api dev               # nest start --watch (tsc, decorator metadata), port 4000
pnpm --filter @zemi/api build && node apps/api/dist/main.js
pnpm --filter @zemi/api typecheck | test | lint
pnpm --filter @zemi/api db:generate       # drizzle-kit generate (after schema.ts changes)
pnpm --filter @zemi/api db:migrate        # apply migrations without booting the API
```

- `apps/api/.env` holds local values (gitignored); `apps/api/.env.example` lists every variable.
- Migrations in `apps/api/drizzle/` run automatically in `main.ts` **before** Nest boots
  (`MIGRATE_ON_BOOT=true`). The path is resolved from the module file, so it is the same from `src/` and `dist/`.
- Swagger UI: `http://localhost:4000/api/docs` (not in production). Bodies aren't described there because validation is zod.
- `tsx` can't run the app (no decorator metadata). Use `nest start` or the built `dist/`.

## 2. Routing, headers, limits (main.ts)

| thing | behaviour |
|---|---|
| Prefix | every controller is served at `/api/v1/...` (global prefix `api`, URI versioning default `1`) |
| `/media/*` | root path, version neutral (excluded from the prefix) |
| Body limits | JSON and urlencoded 2 MB. Multipart only where a route uses multer (assets: disk storage in `os.tmpdir()/zemi/uploads`, `UPLOAD_MAX_BYTES` default 4 GiB) |
| CORS | `WEB_ORIGIN` (+ `CORS_ORIGINS`) with credentials. Any origin, no credentials, for GET/HEAD on `/media/*` and `/api/v1/public/*` (HLS + public SSE) |
| helmet | on, with `Cross-Origin-Resource-Policy: cross-origin`, no CSP (we serve JSON + media). `/media` drops `X-Frame-Options` so PDFs embed |
| compression | on, except `/media/*`, `/api/v1/public/live/*` and anything `text/event-stream` |
| trust proxy | `TRUST_PROXY` (default `true`, Railway + the Next rewrite sit in front) |
| client IP | `CLIENT_IP_HEADER` (default `x-real-ip`, set by Railway's edge). `clientIp()` / `@Ip()` prefer it over `req.ip`, whose leftmost `X-Forwarded-For` a client can forge. `none` turns it off |
| listen | `HOST=::` (IPv6 + IPv4, Railway private networking) |
| shutdown | `enableShutdownHooks`; SSE streams complete, pg-boss stops (15s grace), pool closes; forced exit after 25s |

## 3. Config: `AppConfig` (src/config)

Validated with zod at boot (`src/config/env.ts`). A bad env stops the process with every problem listed:

```
Invalid API configuration:
  - WEB_ORIGIN must be an http(s) URL
  - APP_SECRET must be at least 32 characters
```

Inject the typed config anywhere (global module):

```ts
constructor(private readonly config: AppConfig) {}
this.config.env.PUBLIC_WEB_URL      // Readonly<Env>, URLs have no trailing slash
this.config.isProduction
this.config.mediaUrl(key, rev?)     // `${PUBLIC_API_URL}/media/<key>?v=<rev>`
this.config.cookieSecure
```

`apiPath('.mail-outbox')` / `API_ROOT` (src/config/paths.ts) give absolute paths inside `apps/api/`.

## 4. Database

```ts
import { DB, type Db, type DbOrTx } from '../../db/client.js';
import { events } from '../../db/schema.js';

constructor(@Inject(DB) private readonly db: Db) {}   // Drizzle (postgres-js), typed with the schema
await this.db.transaction(async (tx) => { ... });     // pass `tx` to helpers that accept DbOrTx
```

- `PG` token = raw postgres-js `Sql` (rarely needed).
- Use drizzle's `count()` (returns a number); a raw `count(*)` comes back as a string.
- `schema.ts` belongs to the lead. I only added two optional fields to the `AssetVariants` **type**
  (`rev`, `pages`); it's jsonb, so no migration was needed (`db:generate` says no changes).

## 5. Errors and validation (src/common)

Error body, always: `{ "error": { "code", "message", "details"? } }`. Messages are shown to people:
keep them short and friendly, no dashes.

```ts
import { notFound, forbidden, conflict, badRequest, unprocessable, tooManyRequests, AppError, ensureFound } from '../../common/index.js';
throw notFound("We couldn't find that event.");
throw conflict('That slug is taken.', { details: { field: 'slug' } });
throw new AppError(422, 'registration_closed', 'Registration closed yesterday.');
const row = ensureFound(await find(id), "We couldn't find that speaker.");
```

The global `AllExceptionsFilter` also maps: zod errors (400 `validation`), Nest built-ins (404 for
unknown routes, 413 for oversize bodies and uploads), bad JSON (400), and Postgres errors even when
wrapped by drizzle: `23505` unique becomes 409 `conflict` (with `details.constraint`), `23503` FK becomes 409,
`22P02` bad input becomes 400. Anything else is 500 with a generic message (logged with its stack).

Validation is zod only (no class-validator, no global ValidationPipe):

```ts
import { ZodBody, ZodQuery, ZodParam, UuidParam, ZodPipe, parseOrThrow } from '../../common/index.js';

@Post()  create(@ZodBody(eventCreateInput) body: z.infer<typeof eventCreateInput>) {}
@Get()   list(@ZodQuery(eventListQuery) q: z.infer<typeof eventListQuery>) {}
@Get(':id') get(@UuidParam() id: string) {}                 // 400 instead of a Postgres cast error
@Get(':slug') bySlug(@ZodParam('slug', slugSchema) slug: string) {}
```

A 400 looks like `{ error: { code: 'validation', message: 'title: Too small...', details: ZodIssue[] } }`.

## 6. Auth and RBAC (src/auth)

### Endpoints

- `POST /api/v1/auth/login { passphrase }` returns `Me` and sets `zemi_session` (httpOnly, SameSite=Lax,
  Secure in prod, path `/`, 7 days). Superadmin via constant-time compare with `SUPERADMIN_PASSPHRASE`,
  otherwise HMAC lookup + argon2id. Rate limit 8 attempts / 10 min per IP (429 `rate_limited` with `Retry-After`
  and `details.retryAfterSec`), about 400ms delay on failure. Error codes follow the web-admin login contract:
  401 `invalid_passphrase`, 403 `admin_disabled`, 403 `admin_expired` (with `details.expiresAt`).
- `POST /api/v1/auth/logout` (needs `x-zemi-csrf: 1`) revokes the session and clears the cookie.
- `GET /api/v1/auth/me` returns `{ principal, policy, session }`. For the superadmin, `policy` is a full wildcard policy (display only).

Sessions: DB stores the sha256 of the token; idle timeout 12h, absolute 7d. **Every request re-reads the
session and the admin row**, so disabling, expiring, deleting or editing an admin's policy takes effect
on the next request (and disabled/expired admins have their sessions revoked on the spot).

### Guards (global, in this order)

1. `CsrfGuard`: non-GET/HEAD/OPTIONS under `/api/v1/admin/**` and `/api/v1/auth/logout` need `x-zemi-csrf: 1` (403 `csrf`).
   The path match ignores case, because Express routing does (`/API/V1/ADMIN/...` reaches the same handlers).
2. `AuthGuard`: **secure by default.** Every route needs a session unless it is marked `@Public()`.
   Routes under `/api/v1/admin/**` and `/api/v1/auth/me|logout` always need one, `@Public()` or not.
   So: **public and internal controllers MUST be decorated with `@Public()`** (and internal ones add their own secret check).

### Decorators and helpers

```ts
import { Public, RequireSuperadmin, RequireCapability, CurrentPrincipal, CurrentAbility, CurrentAuth,
         PermissionsService, assertCan, visibleIds } from '../../auth/index.js';

@Public() @Controller('public/events') class PublicEventsController {}

@Get('venues') @RequireCapability('venues.manage') list() {}          // superadmin always passes
@RequireCapability('site.edit', 'inbox.view')                          // any of these
@RequireCapability('a') @RequireCapability('b')                        // stacked = all of these
@RequireSuperadmin()

update(@UuidParam() id: string, @CurrentAbility() ability: Ability, @CurrentPrincipal() principal: Principal) {
  assertCan(ability, 'event', id, 'edit');           // 403 with details { type, id, action }
}

// Lists: only what the principal can view
const ids = visibleIds(ability, 'event');           // 'all' | string[]
const where = ids === 'all' ? undefined : ids.length ? inArray(events.id, ids) : sql`false`;
item.permissions = ability.actionsOn('event', row.id);

// Creating something as a normal admin: give them a full grant (SPEC 6). Pass your tx.
await this.permissions.grantOwnership(principal, 'event', row.id, tx);   // no-op for superadmin, row-locked
// Deleting: clean grants out of every admin's policy
await this.permissions.removeResourceGrants('event', id, tx);
```

`@CurrentAuth()` gives `{ principal, ability, policy, session: { id, createdAt, expiresAt, lastSeenAt } }`.
The guard also sets `req.auth`, `req.principal` and `req.ability` (type the request as `ZemiRequest` from `common/request.ts`).
Implications (edit implies view, and so on) come from `createAbility` in `@zemi/shared`.

`PassphraseService` (`generate()`, `assertAvailable(p, excludeAdminId?)`, `prepare(p)`, `verify`) and
`SessionService` (`create`, `authenticate` / `validate`, `touch`, `revoke`, `revokeByToken`, `revokeAllForAdmin`,
`activeCondition()`, `setCookie` / `clearCookie`) are exported too.

Conflicts that belong to a form field (slug taken, passphrase taken) carry `details.issues: [{ path: ['slug'], message }]`,
so the web's `applyApiErrorToForm` puts the message under the right input.

## 7. Common helpers (src/common, barrel `common/index.js`)

| helper | use |
|---|---|
| `pageToLimitOffset(q)`, `paginated(items, total, q)` | `Paginated<T>` from `paginationQuery` (`page` 1-based, `pageSize` 20, max 100) |
| `searchPattern(s)`, `likeEscape(s)` | `%term%` for ILIKE with `%`/`_` escaped (null for empty) |
| `@Ip()`, `@UserAgent()`, `clientIp(req)` | proxy-aware caller info |
| `RateLimitService` | `hit(key, {limit, windowMs})` returns `{allowed, retryAfterSec}`; `consume(...)` throws 429 with `Retry-After`; `reset(key)`. Keys in use: `login:<ip>`. Suggested: `register:<ip>`, `contact:<ip>`, `react:<ip>:<eventId>` |
| `randomToken(32)`, `randomBase62(n)`, `randomFromAlphabet(abc, n)`, `sha256`, `hmacSha256`, `timingSafeEqualStr` | pure crypto (src/common/crypto.ts) |
| `CryptoService` | APP_SECRET-bound: `encrypt(text, aad?)` / `decrypt` (AES-256-GCM, HKDF-derived key, `v1.<iv>.<tag>.<ct>`), `hmac(data)`, `sign(purpose, data, ttlSec)` / `verify(purpose, token)` for short-lived tokens (e.g. HLS preview `pt`) |
| `blocksToPlainText(blocks)` | BlockNote `Block[]` to searchable text for `*_text` columns |
| `SlugService` | `ensureUniqueSlug(type, slug, excludeId?, tx?)` 400/409; `uniqueSlug(type, base, excludeId?)` gives `my-talk-2`; `recordSlugChange(type, id, oldSlug, newSlug, tx?)` (also deletes a redirect that the new slug now shadows); `resolveSlug(type, slug)` gives `{id}` \| `{redirect}` \| null; `forgetResource(type, id)` |
| `AssetRefsService` | `imageRefs(ids)` / `videoRefs` / `fileRefs` give `Map<id, Ref>` in one query; `imageRef(id)`; `image(row)`, `video(row)`, `file(row)`, `dto(row)`; `loadMany(ids)` gives rows |
| `toImageRef/toVideoRef/toFileRef/toAssetDto(row, urlFn)` | pure builders. Video/file refs need `status: 'ready'`. Image refs need variants: a re-cropping (`processing`) or failed re-crop keeps serving the previous variants so public pages never lose the photo; a brand-new upload gives null until ready |
| `withTmpDir(prefix, fn)` | temp folder under `os.tmpdir()/zemi`, always removed |
| `src/common/ffmpeg.ts` | see section 10 |

Typical public mapping:

```ts
const covers = await this.refs.imageRefs(rows.map((r) => r.coverAssetId));
return rows.map((r) => ({ ...card(r), cover: covers.get(r.coverAssetId ?? '') ?? null }));
```

## 8. Audit, revalidate

```ts
await this.audit.log({ principal, action: 'event.update', resourceType: 'event', resourceId: id,
  summary: `Updated "${title}"`, meta: { fields }, ip });              // never throws; tx optional 2nd arg
this.audit.log({ principal: 'system', action: 'recording.ready', ... });
this.audit.log({ principal: { kind: 'public', name: fullName }, action: 'registration.create', ... });

import { tags } from '../revalidate/revalidate.service.js';
void this.revalidate.revalidate([tags.events, tags.event(id)]);         // fire and forget, 3s timeout, never throws
```

Revalidate POSTs `{ secret, tags }` to `WEB_REVALIDATE_URL` (the web's `/api/revalidate` contract).
Unknown tag shapes are dropped client-side (`TAG_PATTERN`).

## 9. Storage and /media

`StorageService` (global): `putBuffer(key, buf, opts)`, `putFile(key, path, opts)` (multipart above 16 MB),
`putStream`, `getStream(key, { range, ifNoneMatch })` gives `{ body, status, contentLength, contentRange, contentType, etag, lastModified, contentDisposition }`,
`getBuffer`, `downloadToFile`, `head`, `exists`, `delete`, `deleteKeys`, `deletePrefix`, `list`, `copy`,
`ensureBucket` (auto-creates when `S3_AUTO_CREATE_BUCKET=true`), `ping`. Checksums are `WHEN_REQUIRED`
for MinIO/Railway compatibility. Keys under `assets/` default to `Cache-Control: public, max-age=31536000, immutable`.

`GET|HEAD /media/<key>`: Range (206, 416 with `bytes */size`), ETag + If-None-Match (304),
`Accept-Ranges`, stored `Content-Type` / `Content-Disposition`, immutable caching, `Access-Control-Allow-Origin: *`.
**Only keys under `assets/` are public, and never `assets/<id>/original.<image|video ext>`** (originals keep EXIF/GPS).
Documents and audio are served from their original key (that IS the public file).
To stream anything else (e.g. private files for admins) reuse `streamObject(storage, req, res, key, { cacheControl })`
from `modules/media-serve/media-stream.ts`.

Raw recording segments should live outside `assets/` (e.g. `segments/<streamKey>/...`) so they are never public.

## 10. Jobs (pg-boss 12, schema `pgboss`)

```ts
constructor(private readonly jobs: JobsService) {}

onModuleInit() {   // register in onModuleInit; workers start after the app boots
  this.jobs.register<{ eventId: string }>('mail.reminder', async (job) => {
    // job: { id, name, data, signal }. Throw to fail (retried per retryLimit). Pass job.signal to ffmpeg.
  }, { retryLimit: 3, retryDelay: 60, expireInSeconds: 600, concurrency: 1, policy: 'standard' });
}

await this.jobs.send('mail.reminder', { eventId }, { startAfter: date, singletonKey: `reminder:${eventId}` });
await this.jobs.reschedule('mail.reminder', `reminder:${eventId}`, { eventId }, newDate);  // cancel queued + send
await this.jobs.cancelByKey('mail.reminder', `reminder:${eventId}`);
await this.jobs.schedule('site.cleanup', '0 3 * * *', {}, { key: 'nightly' });            // cron in Asia/Jakarta
```

- Queue names: `<area>.<verb>`. Queues are created on first use. `send()` waits until pg-boss started.
- `singletonKey` on a `standard` queue does **not** dedupe (verified: a second send gets its own job).
  Use `reschedule(queue, key, ...)` (cancels queued jobs with the key, then sends: verified one job left), or
  register the queue with `policy: 'short'` (one queued per key) / `'singleton'` (one active per key).
- Handlers get ONE job (batch size 1 internally); pg-boss 12 hands arrays, the service unwraps them.
- Defaults: retryLimit 2, retryDelay 30s with backoff, expire 15 min, completed jobs kept 3 days.
  Long work must raise `expireInSeconds` (asset video queue uses 8h).
- `JOBS_ENABLED=false` keeps sending but runs no workers in that process.
- Queues in use: `asset.process` (photos/PDF/audio, concurrency 2, singleton per asset) and
  `asset.process-video` (concurrency 1, 8h).

## 11. Realtime (SSE)

Channels (keep to this convention):

| channel | audience | payload |
|---|---|---|
| `event:<id>:live` | public | `LiveEvent` from `@zemi/shared` (`state`, `viewers`, `reaction`, `ping`) |
| `event:<id>:attendance` | admin | check-in feed |
| `event:<id>:stream` | admin | ingest health, preview, go-live changes |

```ts
import { channels, RealtimeService } from '../realtime/realtime.service.js';

@Public() @Sse(':id/live')
live(@UuidParam() id: string): Observable<MessageEvent> {
  return this.realtime.stream(channels.live(id), { initial: () => this.snapshot(id), onClose: () => {} });
}
this.realtime.publish(channels.live(id), { type: 'viewers', viewers: 12 });
this.realtime.subscriberCount(channels.attendance(id));
```

Every stream gets `{ type: 'ping', t }` every 20s and is cleaned up on disconnect and on shutdown.
Nest sets `text/event-stream`, `no-transform` and `X-Accel-Buffering: no`; compression skips it.
Single process only (no Redis fan-out), which matches our one-container API.

## 12. Assets (SPEC 8)

Endpoints (admin, cookie + CSRF):

| route | who | notes |
|---|---|---|
| `POST /admin/assets` multipart `file, purpose, crop?, adjust?, alt?, caption?, credit?` | any admin | `crop`/`adjust` are JSON strings. Returns `Asset` with `status: 'processing'` right away (201) |
| `GET /admin/assets?purpose&kind&status&search&page&pageSize` | `media.library` or superadmin | `&mine=true` lists your own uploads for anyone |
| `GET /admin/assets/:id` | any admin | poll this until `ready` or `failed` (`error` holds a friendly message) |
| `GET /admin/assets/:id/original` | uploader, `media.library`, superadmin | the private original (EXIF/GPS intact, Range supported), for the re-crop tool. Same rule as recrop |
| `PATCH /admin/assets/:id { alt?, caption?, credit? }` | uploader, `media.library`, superadmin | |
| `POST /admin/assets/:id/recrop { crop, adjust }` | same | images only, re-runs from the original, replaces variants |
| `DELETE /admin/assets/:id` | same | row (FKs set null / cascade) + everything under `assets/<id>/` |

File types are sniffed from magic bytes and checked per purpose (`PURPOSE_KINDS` in `common/mime.ts`):
covers/avatars are images only; `documentation` takes images + video; `publication-pdf` takes PDF; `recording` takes video/audio;
`editor` takes anything we know; `site` takes images + video. Wrong type gives 415 with "We need a photo (JPEG, PNG...)".

Outputs (`variants` jsonb, public URLs through `AssetRefsService`):

- **Image**: auto-orient (EXIF), optional rotation, crop, adjustments, then AVIF q55 + WebP q80 at
  `[320, 480, 640, 960, 1280, 1600, 1920, 2560]` up to the cropped width (plus the exact width when it's
  in between, so there's always a full-size variant), `lqip` (24px WebP data URL), dominant `color`,
  `width/height` of the cropped master. sRGB, metadata stripped. HEIC falls back to ffmpeg decoding.
  Purposes with an aspect (`PURPOSE_ASPECT`: covers 4:5, avatars 1:1) get a centered crop when none is sent,
  and the applied crop is stored in `asset.crop`.
- **Video**: `video.mp4` (H.264 CRF 23, short side at most 1080, yuv420p, AAC 128k, faststart),
  `video.webm` (VP9 CRF 34, Opus 96k), `poster.webp` (1280, a quarter in, at most 5s), `storyboard.webp`
  (160x90 tiles every 10s, up to 10 columns; short clips get fewer columns, read `storyboard.columns`), `durationSec`.
- **PDF**: served as-is, `variants.pages` when cheap. **Audio**: as-is + duration.

**Crop contract** (for the admin crop UI): pixels refer to the EXIF-oriented original (what people see).
`rotation` (degrees, clockwise) is applied first around the center with the canvas expanded (white, or
transparent with alpha); `x/y/width/height` are then in that rotated frame. With `rotation: 0` they are plain
oriented original pixels (this matches react-easy-crop's `croppedAreaPixels`). Out-of-bounds values are clamped.

**Cache busting**: keys stay `assets/<id>/w<width>.<fmt>` (SPEC), and each processing run writes a new
`variants.rev`, which every URL carries as `?v=<rev>`. Recrop overwrites keys in place and deletes widths that
no longer exist. Jobs for the same asset run one at a time (singleton queue + singletonKey). A job that finds the
crop/adjust changed while it worked skips its write (the status stays `processing`) and the next queued job
produces the final result, so the last recrop always wins (verified with two back-to-back recrops during processing).
The crop contract below is the one in `docs/foundation/web-admin.md`.

When a processing job finishes, the service calls `revalidate(['events','speakers','publications','site'])`, so pages
rendered while the asset was still processing (a cover attached mid-upload, a documentation video still transcoding,
a re-crop) pick up the result without another save.

From another module (e.g. recordings), import `AssetsModule` and:

```ts
const row = await this.assets.ingestFile({
  filePath: '/tmp/.../recording.mp4', filename: 'Zemi #12 recording.mp4', purpose: 'recording',
  createdBy: 'system', videoMode: 'as-is',   // already H.264 faststart: skip transcodes, make poster + storyboard only
});
// row.status === 'processing'; the job sets 'ready' and variants.mp4 = assets/<id>/video.mp4
```

`ingestFile` doesn't delete your local file. It sniffs the type unless you pass a known `mime`.

## 13. ffmpeg helpers (src/common/ffmpeg.ts)

All take absolute paths and `{ signal?, timeoutMs? }`, and reject with `FfmpegError` (stderr tail attached).

```ts
probe(file)                                  // { durationSec, video: { width, height (rotation applied), codec, fps }, audio, ... }
transcodeMp4(in, out, { maxShortSide = 1080, crf = 23, preset = 'fast' })
transcodeWebm(in, out, { maxShortSide = 1080, crf = 34 })
poster(in, outWebp, { atSec, width = 1280 })  // posterTime(duration) picks a good time
storyboard(in, outWebp, { durationSec, interval = 10, tileWidth = 160, tileHeight = 90, columns = 10 })
concatCopy(files, out)                       // concat demuxer, stream copy, faststart
trimCopy(in, startSec, endSec, out)          // stream copy, snaps to keyframes (verified: 10..30s of a clip with 8s GOP gave 21.8s)
remuxFaststart(in, out)
extractFrame(in, outPng, atSec), decodeToPng(in, outPng), run(bin, args)
```

## 14. Mail (React Email)

```ts
import { createElement } from 'react';                     // or write the template call in a .tsx file
const result = await this.mail.send({
  to: reg.email, subject: 'Your seat is saved', template: 'registration-confirmed',
  react: <RegistrationConfirmed ... />,
  attachments: [{ filename: 'ticket.png', content: pngBuffer, contentType: 'image/png', contentId: 'qr' }, { filename: 'zemi.ics', content: ics, contentType: 'text/calendar' }],
  eventId, registrationId,
});
// result: { status: 'sent' | 'logged' | 'failed', logId, providerId, error, outboxFile? }   never throws
await this.mail.sendMany(inputs, { concurrency: 2 });        // gentle pacing for Resend
```

- `RESEND_API_KEY` set: sends via Resend from `MAIL_FROM` (`replyTo` defaults to `MAIL_REPLY_TO`).
  Unset: writes `apps/api/.mail-outbox/<timestamp>-<template>-xxxx.html` + `.json` (+ attachments, with `cid:` links
  rewritten so the preview shows inline images) and logs status `logged`. Every attempt writes `email_logs`.
- JSX works in the API (`jsx: react-jsx`, `.tsx` files). Imports still end in `.js`.
- Put templates in `src/modules/mail/templates/<name>.tsx` and build them from the components:

```tsx
import { Layout, Heading, Text, Button, InfoRow, Divider, Callout, useEmailContext } from './components/index.js';

export function RegistrationConfirmed({ name, ticketUrl }: Props) {
  const { webUrl } = useEmailContext();            // PUBLIC_WEB_URL / PUBLIC_API_URL, provided by MailService
  return (
    <Layout preview="Your seat is saved. See you Friday." footerNote="You got this because you registered on zemi.">
      <Heading>See you Friday, {name}.</Heading>
      <Text size="large">Bring the messy version.</Text>
      <InfoRow label="When">Fri, 2 Oct 2026, 13:15 to 15:15 WIB</InfoRow>
      <Callout tone="yellow">Doors open at 13:15. Coffee's on the left.</Callout>
      <Button href={ticketUrl}>Show my ticket</Button>      {/* tone: blue | ink | red | green */}
      <Divider />
      <img src="cid:qr" width="200" height="200" alt="Your ticket QR code" />
    </Layout>
  );
}
```

`Layout` = logo (`PUBLIC_WEB_URL/brand/email-logo.png`, centered at the top of the white card), white card, four-color strip, footer
"Zemi by MGM Laboratory. Fridays 13:15 WIB". Fonts: Recursive + Atkinson Hyperlegible Next via Google Fonts,
Arial fallback. Colors/fonts in `components/theme.ts`. The logo PNG is 720x160 (9:2) with an opaque white background,
so `LOGO` in `theme.ts` renders it at 270x60 on the white card; if the web changes the PNG's ratio, update `LOGO`.
Example: `templates/admin-test.tsx`, sent by `POST /api/v1/admin/system/test-email { to }` (superadmin).
No em or en dashes in any copy.

**Previews.** Register every template with sample props so the superadmin can eyeball it in a browser:

```tsx
// in your module (inject MailService), e.g. onModuleInit
this.mail.registerPreview({
  template: 'registration-confirmed',            // same key you pass to send({ template })
  subject: 'Your seat is saved',
  description: 'Sent right after someone registers.',
  render: () => <RegistrationConfirmed name="Rina" ticketUrl="https://zemi.labmgm.org/tickets/demo" />,
});
```

`GET /api/v1/admin/system/email-preview` lists them; `GET /api/v1/admin/system/email-preview/<template>` renders one
(`?format=html` default, opens in a tab, served with `Content-Security-Policy: sandbox`; `?format=text`; `?format=json`
gives `{ template, subject, html, text }` for an iframe `srcdoc`). The task text named this route only as
"GET /admin/system/email-...", so `email-preview` is our reading of it. `admin-test` is registered already.

## 15. Superadmin area (modules/admins)

All superadmin only, except the audit log:

```
GET  /admin/admins?search&status&page&pageSize   -> Paginated<AdminSummary>
POST /admin/admins                               adminCreateInput -> AdminSummary (409 if passphrase taken or equals the superadmin's)
GET|PATCH|DELETE /admin/admins/:id               PATCH adminUpdateInput (disabled, expiresAt, policy normalized). Disable/expire/delete revokes sessions
POST /admin/admins/:id/passphrase { passphrase } -> { ok } (409 if taken; ends that admin's sessions)
GET  /admin/passphrase/generate                  -> { passphrase } e.g. "shovel-jaguar-origami-lens-54" (checked unique, not stored)
GET  /admin/admins/:id/sessions                  -> SessionSummary[] (`superadmin` as :id lists the superadmin's sessions; `current` flags yours)
DELETE /admin/sessions/:id
GET  /admin/audit?actor&resourceType&resourceId&action&page&pageSize   (superadmin or audit.view) -> Paginated<AuditEntry>
                                                 action "event" or "event." matches every event.* action
GET  /admin/system                               -> SystemStatus (db latency, bucket, email provider, MediaMTX /v3/paths/list, pg-boss counts, table counts)
POST /admin/system/test-email { to }             -> { status, providerId, error, outboxFile }
GET  /admin/system/email-preview                 -> { items: [{ template, subject, description }] }
GET  /admin/system/email-preview/:template?format=html|text|json   rendered sample (sandboxed HTML)
GET  /api/v1/health                              -> 200 { status: 'ok', db: { ok, latencyMs } } or 503 (Railway healthcheck)
```

Everything is audited (`admin.create|update|disable|enable|delete|passphrase`, `session.revoke`,
`auth.login|logout|login-blocked`, `asset.upload|update|recrop|delete`).

## 16. Deploy files

- `apps/api/Dockerfile` (context = repo root): `node:24-bookworm-slim`, corepack pnpm 11.3.0, filtered
  `--frozen-lockfile` install, builds shared then api, separate prod-only `node_modules`, apt `ffmpeg` + `tini`,
  copies `apps/api/drizzle`, runs `node apps/api/dist/main.js` as `node`. `MAIL_OUTBOX_DIR=/tmp/...`.
- `apps/api/railway.json`: DOCKERFILE builder, healthcheck `/api/v1/health`, watch `apps/api/**`,
  `packages/shared/**`, `pnpm-lock.yaml`, overlap 20s, draining 30s.
- `/.dockerignore` (repo root, shared with the web image): excludes `node_modules`, `dist`, `.next`, `.env*`, `.git`, outbox.

Production env to set on Railway: everything in `.env.example`. Real `SUPERADMIN_PASSPHRASE` and `APP_SECRET`
are required (values containing "dev", "change-me" or "example" are rejected in production), and the documented
local values `MEDIA_INTERNAL_SECRET=dev-media-secret` / `REVALIDATE_SECRET=dev-revalidate` are rejected too.

## 17. Gotchas

- **Mark public/internal controllers `@Public()`**, otherwise they 401. Admin paths can't be made public.
- Non-GET admin calls need `x-zemi-csrf: 1` (the web client adds it). curl: `-H 'x-zemi-csrf: 1'`.
- Classes you inject must be value imports; Express types in decorated signatures must be `import type`.
- Keep modules a DAG. The infrastructure modules are `@Global()`; don't import feature modules from them.
- Specs run under vitest (no decorator metadata): construct services by hand with fakes (see `*.spec.ts`).
- Client IPs come from `X-Real-IP` (`CLIENT_IP_HEADER`), which Railway's edge sets. Without it, `req.ip` with
  `TRUST_PROXY=true` is the leftmost `X-Forwarded-For`, which a client can forge (verified: rotating it dodged the
  login limit; with `X-Real-IP` it no longer does). Not verified on Railway yet: that the edge overwrites a
  client-sent `X-Real-IP`, and that the Next rewrite forwards the header to the API. Check both after the first deploy.
- The rate limiter and SSE hub are in-memory: one API instance. Scale out needs Redis/Postgres for both.
- A `DrizzleQueryError` wraps driver errors; the filter unwraps `cause` to map Postgres codes.
- pg-boss validates option keys that are present: never pass `{ priority: undefined }` directly to `boss.*` (JobsService strips them).
- `Asset.originalUrl` is a relative admin URL (`/api/v1/admin/assets/<id>/original`), not a public one.

## What is verified (local, 2026-09-25)

Real runs against Postgres 16 + MinIO with curl and Playwright:

- Boot runs migrations and creates the bucket; `/api/v1/health` returns 200 with db latency; bad env fails fast with a list.
- Superadmin login (trimmed input), `/auth/me`, logout (CSRF enforced), cookie flags.
- Admin created with a scoped policy (unknown actions dropped, stored as a jsonb object), login, 403 on
  superadmin routes, 403 then 200 on audit after a live policy edit, disable/expire revoke sessions immediately,
  passphrase uniqueness 409 (incl. the superadmin's), new passphrase flow, rate limit 429 after 8 tries.
- Two recrops fired while the first run was still processing: the stale run skipped its write, final size = second crop.
- DB helpers via a throwaway script: slug 409/400, `uniqueSlug` -> `-3`, rename then `{redirect}`, rename back
  (stale redirect removed), concurrent `grantOwnership` keeps both grants, `removeResourceGrants`, `imageRefs`
  (ready only, deduped ids), jobs `cancelByKey`, `reschedule` (one queued job left).
- JPEG with EXIF orientation 6 + crop + adjust: AVIF/WebP variants in MinIO, `/media` 200/206/304/416/HEAD,
  immutable caching, CORS `*`, public original blocked (404) but served on the admin route. Recrop replaced
  variants and removed stale widths. PDF (page count 2, Content-Disposition with filename), HEIC (auto 1:1),
  wrong type 415, bad crop JSON 400, missing file 400, oversize multipart 413, tmp uploads cleaned.
- 25s 1080p MP4 with audio: H.264/AAC MP4 + VP9/Opus WebM + poster (1280x720) + storyboard; portrait MOV;
  odd-size 1441x2561 source gave 1080x1920, 4K gave 1920x1080; concat/trim/remux helpers.
- SSE via a temporary route (removed): initial snapshot, publish, pings, no compression, cleanup on disconnect.
- Email rendered to the outbox and screenshotted at 1200px and 390px; `email_logs` row written.
- SIGTERM: clean exit in about 0.2s with pg-boss stopped.
- `pnpm --filter @zemi/api typecheck`, `lint` and `test` (52 specs: passphrase, crypto, asset refs, guard/CSRF/RBAC helpers,
  blocks, pagination, rate limiter, mime sniffing, image math, media keys/ranges, exception filter, realtime, mail) all pass.

Review pass (same day): `/API/V1/ADMIN/...` without the CSRF header now 403s (it used to get through), a rotated
`X-Forwarded-For` no longer resets the login limit, email previews render (screenshots at 390px and 1200px),
`/original` is 403 for an admin without `media.library` who didn't upload it, a recrop response still carries the
previous `image` while processing, and both processing runs posted a revalidate.

Not verified: the Docker image build (not run locally to save memory), Resend delivery (no key),
MediaMTX reachability in `/admin/system` (media container not running locally), S3 against a real Railway Bucket.
