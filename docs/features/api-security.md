# api-security: hardening pass (2026-09-26, fixer-api-r1)

Cross-cutting API fixes from the e2e suite and the security audit. `docs/foundation/api-core.md` still describes the old
login reset and the urlencoded parser. Its owner should bring sections 2, 6 and 7 in line with this page.

## Sign-in (`POST /api/v1/auth/login`, auth/auth.controller.ts)

- **Per IP: 8 failed tries per 10 minutes.** Every attempt is counted up front (`consume`), so a burst of parallel guesses
  can't slip through while argon2 runs. A successful sign-in gives back only its own slot (`RateLimitService.refund`); the
  failures before it stay counted. Before, a success reset the counter, so anyone with one working passphrase got unlimited
  guesses. Verified live: 7 bad, 1 good, 8 bad gives `401 x7, 200, 401, 429 x7`. Successes alone never hit the limit, so a
  door crew sharing the venue's NAT can all sign in.
- **Global: 50 failed sign-ins per 10 minutes across every IP** (`login-fail:all`). Past that, each failure waits 4 s instead
  of 0.4 s, one `auth.login-throttled` audit entry and a warning log are written, and failures stop being audited one by one.
  This never locks anyone out: a hard global 429 would let anyone lock out the superadmin. A per-account limit isn't
  possible, because a passphrase alone doesn't say which account it was meant for.
- **Audit:** each failed sign-in writes `auth.login-failed` (actor "Unknown visitor", IP, user agent, never the passphrase).
  429s are not audited. The overview feed hides `auth.*` entries anyway.
- **Login CSRF:** anything that isn't `application/json` gets 415 `unsupported_media` before it is counted. A cross-site
  `<form>` can't send JSON, and a cross-site `fetch` with JSON needs a CORS preflight, which we refuse. `main.ts` now
  creates the app with `bodyParser: false` and registers only the JSON parser. Nest would otherwise add its own urlencoded
  parser, and no route takes form posts. Verified: urlencoded or `text/plain` with `Origin: https://evil.example` gives
  415 and no `Set-Cookie`, both straight to :4400 and through the web rewrite.

## Client IP (common/request.ts)

- `clientIp()` uses the `CLIENT_IP_HEADER` value (default `x-real-ip`) only when `net.isIP` accepts it. Otherwise it
  falls back to `req.ip` (also validated), else null. `203.0.113.11330` or a list can no longer become a rate-limit key
  or an audit IP. `::ffff:` mapped IPv4 is unwrapped.
- **Still open (outside apps/api):** the web's `/api/v1` rewrite (Next, httpxy) forwards headers unchanged, so a
  browser-sent `X-Real-IP` reaches the API as-is. Next only adds `x-forwarded-host`, and it sets `x-forwarded-for` with
  `??=`, so that header is client-controlled too. The API can't tell a client value from the edge's value, because the web
  server is the trusted hop in dev and in production. In production this is safe only if Railway's edge overwrites
  `X-Real-IP`. The e2e suite relies on the dev behaviour to isolate rate limits (`isolateRateLimits`, `newApiContext`).
  Deploy check: `curl -X POST https://<web>/api/v1/auth/login -H 'content-type: application/json' -H 'X-Real-IP: 198.18.0.9'
  -d '{"passphrase":"x"}'`, then read the newest `auth.login-failed` entry in the superadmin audit log. Its IP must be
  your real one, not 198.18.0.9. The global login limit above bounds guessing even if the header turns out spoofable.
  A probe that writes nothing: send 11 `POST https://<web>/api/v1/public/tickets/AAAAAAAAAAAAAAAAAAAA/cancel` with
  `X-Real-IP: 198.18.0.9` (10x 404, then 429), then one more with `X-Real-IP: 198.18.0.10`. A 429 means the edge
  replaced the header, so all is well. A 404 means the client picked its own bucket. Then the web has to set the
  header itself. Note that Next 15+ dropped `NextRequest.ip`, and behind the edge the socket address is the edge,
  not the visitor. So the fix would be a header the edge sets and the client can't forge.
- Re-checked 2026-09-26 (round 2): still reproducible locally through :3300. Nothing in apps/api can tell a
  client-sent value from the edge's, so this stays open for the web and deploy owners.

## Uploads (`POST /api/v1/admin/assets`, modules/assets/upload.guard.ts)

- `UploadGuard` runs before multer (guards come before interceptors), so a refused upload is never written to disk:
  - **Who may upload (`canUpload`):** the superadmin; `events.create`, `speakers.create`, `publications.create`,
    `site.edit` or `media.library`; or `edit` on any event, speaker or publication; or `media.manage` or `stream.control`
    on any event. Viewers and door crew get 403.
  - **Rate:** 150 uploads per 10 minutes per admin (`upload:<principalId>`), which leaves room for a big documentation
    drop (the web sends three at a time).
- **Size by detected kind:** photos and documents over 100 MB get 413 `too_large` ("That photo is 101 MB. Keep it under
  100 MB."), checked after sniffing and before anything reaches S3 or the job queue. This matches the web's own 100 MB
  limits. Video and audio keep `UPLOAD_MAX_BYTES` (4 GiB). Recordings and the seed call `ingestFile` without caps.
- Verified live: zero-grant 403, door crew 403, event editor 201, event editor with a 101 MB PNG 413. The temp upload
  folder was empty afterwards.

## Lookups (`GET /admin/speakers/lookup`, `GET /admin/publications/lookup`)

- `assertCanLookup(ability, type)` in auth/permissions.service.ts allows:
  - the pickers' users: the superadmin, any `*.create` capability, or `edit` on any event, speaker or publication
  - the command palette: `view` on at least one resource of that type (the palette is enabled on the same check)
- Everyone else gets 403. Results hide drafts the caller can't view (`visibleIds`).
- Verified: zero-grant 403 and door crew 403. An event editor gets published and unlisted items only (the one draft
  publication is left out). The superadmin still sees drafts.
- Not changed: `GET /admin/audience` (`audience.view`) still lists every event title a person registered for, drafts
  included. That capability is "everyone across all events" by definition.

## Public event detail

- `EventDetail.visibility` (shared, additive; typed as the full visibility enum so `EventAdmin` stays compatible). The
  public API only returns `published` or `unlisted`, because drafts 404. The web should send `noindex` for `unlisted`.
  Verified: `zemi-102-thesis-defense-rehearsal-invite-only` returns `unlisted`, directly and through :3300.

## @zemi/shared bundle size

- `packages/shared/package.json`: `"sideEffects": false`, plus subpath exports `@zemi/shared/brand`, `/time`, `/format`
  and `/constants`. None of these imports zod.
- esbuild check: a client entry importing `SHAPE_COLORS`, `SHAPE_ORDER` and `formatJakarta` from the barrel was 478 KB
  minified (all of zod plus every schema) before the change and 1.4 KB after. The subpaths give 1.3 KB.
- Turbopack production builds honour `sideEffects` too, but that is unconfirmed here: `next build` is off limits on
  this machine.
- Switching the public shell imports to the subpaths is optional hardening for the web owner.

## Already fixed before this pass (re-verified)

- `/media` keys with control characters (`%00`, `%0a`, `%7f`): 404 from `publicMediaKey`, no stack trace. Checked on
  :4400 and through the web's `/media` rewrite.
- Round 2 (same day): a fuzz pass found one more 500. A 300 character path segment made versitygw throw
  `KeyTooLongError`. `publicMediaKey` now refuses segments over 128 characters (ours are a uuid or a short variant
  name). `StorageService` also reads `KeyTooLongError`, `InvalidURI` and `InvalidObjectName` as "not found", so any
  other caller gets a 404 too. Bad UTF-8 (`%ff`, `%c0%af`) was already a 400 from Express.
- Door-crew feed: scoped by `checkins.actor_id` (migration 0002). Old rows without an id fall back to the display name,
  and the SSE filter compares `actorId`. The checkin and scanner e2e specs pass.

## Not changed on purpose

- A duplicate sign-up with the same email answers 409 `already_registered` with a masked email, or returns the ticket
  when email and phone match. This follows SPEC and api-people.md section 7, and the public register sheet and the
  registration e2e are built on it. It does reveal whether an email has a seat, within the sign-up rate limits.

## Tests

- New `auth/login-rate.spec.ts`: the 7/1/8 sequence, successes-only, the global slow mode with no lockout and the
  one-off throttle audit, and the 415.
- New `modules/assets/upload.guard.spec.ts`: `canUpload` by role, the guard's 403 and 429, and `assertCanLookup`.
- `common/common.spec.ts`: `clientIp` junk values and `RateLimitService.refund`.
- Suite: 21 files, 205 tests.
