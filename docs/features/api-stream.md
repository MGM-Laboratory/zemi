# api-stream: the livestream engine

Owner: api-stream. Code: `apps/api/src/modules/stream/**`, `apps/media/**`. It is built on api-core
(`CryptoService`, `JobsService`, `RealtimeService`, `StorageService`, `AuditService`, `RevalidateService`,
ffmpeg helpers, `RateLimitService`). No shared contract or `schema.ts` changes: every type used here was already
in `packages/shared/src/schemas/stream.ts` and `events.ts`.

This doc covers the flow, the endpoints, OBS settings, the media server setup, what was verified end to end, and known gaps.

## 1. How it fits together

```
OBS ──RTMP──> MediaMTX live/<streamKey>?key=<privateKey>
               ├─ authHTTP ───────> POST /internal/media/auth      (Basic mediamtx:<secret> from the URL userinfo)
               ├─ runOnOnline ────> POST /internal/media/online    (hook.sh, x-media-secret)
               ├─ runOnOffline ───> POST /internal/media/offline
               ├─ 60s fMP4 files ─> POST /internal/media/segments  (upload-segment.sh, then sweeper.sh retries)
               └─ HLS (private) <── API HLS proxy, Authorization: Bearer <secret> (hlsCDNSecret)
API ──> /v3/paths/list every 10s (reconcile), /v3/paths/get (health), /v3/rtmpconns/kick (rotate)
Viewers ──> GET /public/live/:eventId/*.m3u8|mp4 (proxy + LRU)   POST heartbeat/reactions   GET SSE
```

### Stream states (SPEC 9)

| state | means | how you get there |
|---|---|---|
| `idle` | no signal yet | new row; rotating keys during `preview` |
| `preview` | OBS is connected, only admins can watch (with a preview token) | `online` hook from `idle` or `ended` |
| `live` | public | admin **Go live** (needs `ingestOnline`) |
| `ended` | over | admin **End stream** |

`ingestOnline` is separate from the state. If OBS drops while `live`, the state stays `live` and
`ingestOnline` goes false: the public playlist answers 404 `no_signal` ("No signal right now. Hang tight"),
the public SSE pushes the new state, and when OBS is back the same playlist works again (same path, same session).
Going live again after **End** is allowed and creates a new session.

## 2. Files

| file | what |
|---|---|
| `stream.module.ts` | Module. Exports `StreamService` and `RecordingsService` |
| `stream.service.ts` | Stream rows and keys, OBS config, MediaMTX auth decision, hooks, go live / end / rotate, health (bitrate sampling), preview tokens, public snapshots, the cached gate, 10s reconcile, 3s admin health tick |
| `recordings.service.ts` | Segment ingest, `recording.finalize` job (wait, stitch, trim, upload, poster, storyboard), late segment revival, admin recording actions, hourly `recording.cleanup`, `publicRecordings()` + `chaptersFor()` |
| `audience.service.ts` | Heartbeat viewer counting (distinct ids in 40s), peaks (event and session), reactions batched per second |
| `hls-proxy.service.ts` + `byte-lru.ts` | Upstream fetch with in-flight sharing, byte-capped LRU (200 MB, 32 MB per entry), playlists 1s, segments and init 60s |
| `mediamtx.client.ts` | MediaMTX control API + HLS client. "Unreachable" is reported apart from "not there" so a hiccup never reads as "OBS went offline" |
| `media-secret.guard.ts` | `x-media-secret`, `Bearer` or `Basic` (user or password) equal to `MEDIA_INTERNAL_SECRET`, constant time |
| `internal-media.controller.ts`, `admin-stream.controller.ts`, `public-live.controller.ts` | Routes below |
| `stream.util.ts` (+ `stream.util.spec.ts`, 19 specs) | Pure helpers: keys, path/query parsing, segment filename to UTC, Go durations, safe HLS paths, content types, playlist `pt` rewrite, bitrate, cut planning, coverage gaps, backoff |
| `apps/media/*` | MediaMTX 1.21.1 image: `mediamtx.yml`, `entrypoint.sh`, `hook.sh`, `upload-segment.sh`, `sweeper.sh`, `Dockerfile`, `railway.json` |

## 3. Endpoints (all under `/api/v1`)

### Internal (media server only)

`@Public()` for the session guard, then `MediaSecretGuard` (runs before multer, so strangers can't even upload).
Wrong or missing secret: 401 `unauthorized`.

| route | body | behaviour |
|---|---|---|
| `POST /internal/media/auth` | MediaMTX authHTTP JSON | 200 allows, 401 `media_denied` denies. **publish**: path `live/<streamKey>` of an existing `event_streams` row, query `key` equals the decrypted private key (constant time), event not cancelled. **read**: only protocol `hls` or `rtsp` AND the internal secret as user, password or token. Anything else (RTMP read, WebRTC, playback, unknown actions): denied. Every denial is logged with the reason |
| `POST /internal/media/online` | `{path, query, sourceType, sourceId}` | `ingestOnline=true`, `ingestOnlineAt=now`; `idle`/`ended` become `preview`; `live` stays `live` (signal back). Publishes admin + public state |
| `POST /internal/media/offline` | same | `ingestOnline=false`, state kept. Publishes |
| `POST /internal/media/segments` | multipart `path, duration, filename, file` | Multer streams the file to `os.tmpdir()/zemi/segments` (4 GiB limit), then `putFile` to `recordings/raw/<streamKey>/<filename>` (multipart above 16 MB). `startedAt` from the filename (UTC), duration from the form (seconds or a Go duration) or ffprobe. Idempotent per `(streamKey, filename)`. Unknown keys answer 201 `{stored:false}` so the media server deletes the file instead of retrying forever. The temp file is always removed. 201 `{stored, id}` |

### Admin (session + `x-zemi-csrf: 1` on writes)

| route | permission | returns |
|---|---|---|
| `GET /admin/events/:id/stream` | `stream.view` (keys: `stream.control`) | `StreamConfig`. Creates the row on first call: `streamKey = "zm" + 16 base62`, private key 32 base62, AES-GCM (`CryptoService.encrypt`, AAD = event id). `obs = { server: RTMP_PUBLIC_URL, streamKey, privateKey, obsStreamKey: "<streamKey>?key=<privateKey>" }` **only with `stream.control`** on the event (or the superadmin). With just `stream.view`, `obs` is `null` (the key is never decrypted): state, `viewers`, `peakViewers`, health, preview token, SSE and recordings still work. Least privilege: with the private key a view-only admin could push their own feed into the live stream. Live, end and rotate already needed `stream.control` and return the keys as before |
| `POST /admin/events/:id/stream/rotate` | `stream.control` | `StreamConfig` with new keys, and the current publisher is kicked (`/v3/rtmpconns/kick/<id>`, or the rtsp/srt/webrtc equivalent). While **live** only the private key changes (same path, so the recording and viewers' playlist keep going; OBS reconnects with the new key). Otherwise both keys change, `ingestOnline` resets, `preview` goes back to `idle`. SSE `keys-rotated`. Audited |
| `POST /admin/events/:id/stream/live` | `stream.control` | `StreamConfig`. 409 `no_signal` "We don't see OBS yet. Hit Start Streaming in OBS, wait for the preview, then go live." 409 `already_live`, 409 for cancelled events. Sets `live`, `liveStartedAt`, creates a `stream_sessions` row (`recording`), SSE, revalidate `events` + `event:<id>`, audit `stream.live` |
| `POST /admin/events/:id/stream/end` | `stream.control` | `StreamConfig`. 409 `not_live`. `ended`, `liveEndedAt`, session `endedAt` + `waiting`, queues `recording.finalize {sessionId}` (10s delay), SSE, revalidate, audit `stream.end`. **Auto end**: the 10s reconcile also ends a stream that is still `live` with no signal for 20 minutes when the event's end time is 20+ minutes past (nobody pressed End). It runs as `system` (audit `stream.end`, `meta.auto: true`), and `liveEndedAt` + the session's `endedAt` are the moment the signal went away, not the moment we noticed. The dashboard should expect `ended` to arrive over SSE without anyone pressing the button |
| `GET /admin/events/:id/stream/health` | `stream.view` | `StreamHealth` from `/v3/paths/get/live%2F<key>`: `tracks2` codec, width, height, sampleRate, channels; `bytesReceived` (1.21 `inboundBytes`); `readers`; `bitrateKbps` from in-memory byte samples (20s window, reset when the counter drops). MediaMTX unreachable: the DB's `ingestOnline` without numbers |
| `GET /admin/events/:id/stream/preview-token` | `stream.view` | `StreamPreviewToken { token, expiresAt, hlsUrl }`: `CryptoService.sign('hls-preview', {e: eventId}, 600)`, 10 minutes, `hlsUrl` already has `?pt=` |
| `GET /admin/events/:id/stream/events` | `stream.view` | SSE on `event:<id>:stream`: `StreamAdminEvent` (`state` first and on every change, `health` every 3s while someone listens, `viewers` + `peakViewers` every 5s while live, `recording` on status changes, `recording-removed`, `keys-rotated`, `ping` 20s) |
| `GET /admin/events/:id/recordings` | `stream.view` | `StreamSessionAdmin[]`, newest first |
| `POST /admin/events/:id/recordings {assetId, title?}` | `stream.control` + may use the asset | Attach an uploaded video (`POST /admin/assets` with `purpose=recording`) as a public session (`streamKey = external:<assetId>`, times = the event's). Same asset rule as gallery attach: superadmin, `media.library`, or the uploader, else 403 "You can only attach videos you uploaded yourself." (asset ids are visible in public `/media` URLs). `ready` when the asset is ready, else `processing` until reconcile sees the asset finish. First one becomes primary. 409 if already attached |
| `PATCH /admin/recordings/:id {title?, visibility?, isPrimary?}` | `stream.control` on its event | Only one primary per event (others are unset in the same transaction). Revalidates, audited |
| `DELETE /admin/recordings/:id` | `stream.control` | 204. Deletes the session and raw segments no other unfinished session needs; promotes the next public ready recording to primary. The video asset (row + `assets/<id>/`) is deleted only when it is `purpose: recording`, no other session points at it (the seeded sessions share one) and no gallery item holds it, in one conditional statement; otherwise it is just detached (audit `meta.assetDeleted`). Re-stitching a session releases its old asset by the same rule. 409 while `recording` or `processing` |
| `POST /admin/recordings/:id/reprocess` | `stream.control` | 202 `StreamSessionAdmin` (`waiting`). Re-stitches from raw segments when they still exist, else rebuilds poster + storyboard + duration from the stored MP4. 409 while recording, waiting or processing, 422 when there is nothing to rebuild from |

### Public (no auth, CORS `*`)

| route | behaviour |
|---|---|
| `GET /public/live/:eventId/<file>` | HLS proxy to `MEDIA_HLS_URL/live/<streamKey>/<file>` with `Authorization: Bearer MEDIA_INTERNAL_SECRET` (no query for segments; playlists pass only valid `_HLS_msn`/`_HLS_part`/`_HLS_skip`). Allowed when state is `live` and the event isn't a draft, or with a valid `?pt=` for this event in `preview`/`live`/`ended` (or while ingest is online). Otherwise 404 `not_live` JSON. Bad or expired `pt`: 403 `preview_expired`. Upstream 404: 404 `no_signal`. Upstream down or redirecting (secret mismatch, logged once): 502 `media_unavailable`. Only plain file names with `m3u8/mp4/m4s/ts/aac/vtt`, at most 3 levels, no `..`. Content types per extension. `Cache-Control: public, max-age=1` for playlists and `max-age=60` for segments (`private` with `pt`). `X-Cache: HIT/MISS`. With `pt`, every URI in a playlist (lines and `URI="..."`) gets `?pt=` appended |
| `POST /public/events/:id/heartbeat {viewerId}` | `{live, viewers}`. Counts distinct ids seen in the last 40s, only while live. Rate limit 600/min per IP (a campus shares one IP). 404 for unknown or draft events |
| `POST /public/events/:id/reactions {kind}` | 202. `clap, heart, fire, idea, laugh`. 20 per 10s per IP per event (429 "Easy on the applause"). 409 `not_live` when not live. Batched per second into `{type:'reaction', kind, count}` |
| `GET /public/events/:id/live` | SSE `event:<id>:live`: `LiveEvent`. `state` right away and on every change (`stream` = `EventStreamPublic`, `status` = `computeEventStatus`), `viewers` every 5s while live, `reaction` bursts, `ping` every 20s. 404 for unknown or draft events |

For the events module: `StreamService.publicStreams(ids)`, `liveEventIds()`, and
`RecordingsService.publicRecordings(ids)` exist (import `StreamModule`). api-events currently builds
`EventDetail.stream` and `recordings` with its own queries, which match these rules.

## 4. Recording pipeline

1. MediaMTX records every publish on `live/<key>` into 60s fMP4 files (`recordPath %Y-%m-%d_%H-%M-%S-%f`,
   wall clock, **TZ must be UTC**; the Docker image and `scripts/dev/media.sh` both set it). `runOnRecordSegmentComplete`
   runs `upload-segment.sh` (6 tries, 5 to 25s apart, deletes the file after a 2xx). `sweeper.sh` re-sends
   anything older than 3 minutes every 2 minutes (API restarts, bucket hiccups). `recordDeleteAfter: 72h` is the safety net.
2. **End** queues `recording.finalize {sessionId}` (queue: concurrency 1, 4h expiry, 2 retries with backoff).
3. The job waits (10, 15, 20, 30s backoff) until one of:
   - the segments cover `[startedAt, endedAt]` with no hole longer than 3s (`coverageGaps`);
   - the end is not covered, ingest is offline, and nothing arrived for 90s (the last file isn't coming);
   - 4 minutes after `endedAt` (a hole in the middle waits this long, since it can be a queued upload).
4. It claims the session (`processing`), downloads the overlapping segments to a temp dir, trims the first and
   last one by their own clock (`trimCopy`, keyframe accurate), concats with the concat demuxer (`-c copy`,
   faststart), probes, uploads `assets/<id>/video.mp4`, makes `poster.webp` + `storyboard.webp`, and inserts a
   ready `assets` row (`kind video`, `purpose recording`, no transcode). No re-encode anywhere. Poster and
   storyboard are best effort: if either fails (a clip of a few seconds, say) the recording still ships with
   `poster`/`storyboard` null and a warning in the log.
5. Session: `ready`, `recordingAssetId`, primary if the event has none. The previous asset (reprocess) is released: deleted only if nothing else uses it (see DELETE).
   Raw segments are deleted, unless the recording has a hole (then the hourly cleanup takes them after 2h, so a
   late upload can still fill it). Audit `recording.ready`, revalidate.
6. Zero segments: `none` (audited). Errors: `failed` with a friendly `error` (ffmpeg, disk, full bucket), audited.
7. **Late segments.** A newly uploaded segment that overlaps a `none`, `failed` or `ready` session sends it back to
   `waiting` when the raw segments now in hand would make a longer recording than the one it has (never shorter),
   and the wait restarts from that moment. Verified: a session that failed because the bucket was full re-queued itself
   when the sweeper delivered the backlog.
8. `MediaMTX first-file naming`: the first file of a publish is named a couple of seconds late; `alignedStarts`
   pulls it back onto the next file so the trim lands where the admin pressed the button.
9. Hourly `recording.cleanup` (cron `23 * * * *`): raw segments older than 2h that no `recording`/`waiting`/`processing`/`failed`
   session needs (preview before Go live, strays), and anything older than 7 days.

Chapters: `chaptersFor(rundown, eventStartsAt, recordingStartedAt, duration)` maps WIB rundown times to offsets
(a slot up to 15 min before the recording started opens it at 0).

## 5. OBS settings (what admins paste)

The dashboard shows these from `GET /admin/events/:id/stream`:

- **Settings, Stream**: Service `Custom...`. Server: `obs.server` (`rtmp://<host>:<port>/live`). Stream Key:
  `obs.obsStreamKey` (`<streamKey>?key=<privateKey>`, one field). Leave "Use authentication" off.
- **Settings, Output** (Advanced): Encoder x264, Apple VT H.264 or NVENC H.264. Rate control CBR.
  Bitrate 4500 Kbps for 1080p30 (2500 to 3500 for 720p30, 6000 max). **Keyframe interval 2 s** (HLS cuts 2s
  segments on keyframes, so this keeps latency and seeking tidy). Profile high or main. B-frames 2 or fewer.
- **Audio**: AAC, 48 kHz, stereo, 128 or 160 Kbps.
- **Video**: base and output 1920x1080 (or 1280x720) at 30 fps.
- Flow: Start Streaming in OBS, the dashboard flips to **Preview** within a second or two (preview player uses the token),
  press **Go live**, and **End stream** when done. Stopping OBS first is fine: viewers see the slate until you end.
- Rotate keys if a key leaked. While live, only the private key changes: update OBS and it reconnects to the same stream.

## 6. Media server (apps/media) and local dev

- `mediamtx.yml`: `authMethod: http`, RTMP :1935 (public, Railway TCP proxy), HLS :8888 + API :9997 (private
  network), RTSP :8554 (tcp, internal reads only), fMP4 HLS (2s segments, 8 in the playlist, muxer closes after
  60s idle, `hlsAlwaysRemux` so the first viewer doesn't wait), recording as above, WebRTC/SRT/playback/metrics off.
- `entrypoint.sh` builds `MTX_AUTHHTTPADDRESS=<scheme>://mediamtx:<secret>@<host>/api/v1/internal/media/auth`
  (authHTTP can't send headers, Go turns userinfo into Basic) and `MTX_HLSCDNSECRET=<secret>`. The secret must be URL safe
  (`openssl rand -hex 32`).
- Env on Railway (media service): `ZEMI_API_INTERNAL_URL=http://api.railway.internal:4000`, `MEDIA_INTERNAL_SECRET`
  (same as the API). API: `MEDIA_HLS_URL=http://media.railway.internal:8888`, `MEDIA_API_URL=http://media.railway.internal:9997`,
  `RTMP_PUBLIC_URL=rtmp://<tcp proxy host>:<port>/live`. Give the media service a volume on `/recordings` so a redeploy
  mid-event keeps unsent segments (the sweeper uploads them after boot).
- Local, no Docker: `sh scripts/dev/media.sh` (RTMP :51935, HLS :58888, API :59997, RTSP :58554, files in
  `~/.zemi-dev/recordings`). I fixed two things in it (see Requests): the authHTTP URL had no credentials (every
  publish was a 401) and `TZ` wasn't UTC (this Mac is in WIB, so filenames were 7 hours off).
- Handy checks: `curl localhost:59997/v3/paths/list`, `ls ~/.zemi-dev/recordings/live/<key>/`.

## 7. Decisions

- Rotate while live keeps the stream key (path) and only changes the private key, so the recording, the HLS
  playlist URL and the session continue. Rotating outside live changes both.
- Preview tokens also work in `ended` or while ingest is online, so an admin can check OBS again before a second Go live.
- Unknown keys on `/segments` answer 201 `{stored:false}` (not 4xx) so MediaMTX deletes strays instead of retrying for 72h.
- Holes wait the full 4 minutes, and recordings with holes keep their raw segments for 2h: a late upload revives the
  session instead of leaving a partial video forever.
- Late segments may revive `ready` sessions, but only when the result is longer. During the re-stitch the session is
  `waiting`/`processing`, so the public page hides that recording for a few minutes (see Requests).
- Reaction kinds follow the shared contract (`idea`, not `lightbulb` as SPEC's endpoint map says).
- Heartbeat limit is generous (600/min per IP) because a whole campus sits behind one NAT.
- Auto end after 20 quiet minutes past the event's end time. Before the end time a dropped OBS always waits for a
  human (the room may be fixing a cable). The end time used is when the signal went away (in-memory offline time,
  or the row's `updatedAt`, which the offline flip bumps, after an API restart).
- In-memory state (audience, bitrate samples, "when did it go offline", HLS cache) is per process, like the SSE hub.
  On boot, live streams are loaded back into the audience tracker; reconcile fixes `ingestOnline` within 10s.

## 8. What is verified (local, 2026-09-26, shared API :4400, native MediaMTX, local S3 gateway, Postgres)

Scripts and outputs live in the scratchpad (`stream/run4.sh` to `run6.sh`, `big-upload.sh`, `r4/`, `r6/`).
Pushes are ffmpeg `testsrc2` 1280x720 30 fps + sine, H.264 `-g 60`, AAC 48k, `-f flv` (OBS-like: 2s keyframes).

### 8a. Fresh database run (after the reseed, event `zz-stream-e2e`)

- `GET /admin/events/:id/stream` created the row: `streamKey` "zm" + 16 base62 (18 chars), private key 32 base62,
  `private_key_enc` in the DB is not the key. `server` = `rtmp://localhost:51935/live`, `obsStreamKey` = `<key>?key=<pk>`.
- Publish rejected (ffmpeg "Operation not permitted", API logs "Denied publish ... wrong private key / missing private
  key / unknown stream key"). Direct HLS on :58888 without the bearer: 302 to `?cookieCheck=1` (then 401).
- OBS connect: `preview` + `ingestOnline` within 2s. Public playlist without `pt`: 404 `not_live`; garbage `pt`: 403
  `preview_expired`; token (10 min) master 200 `private, max-age=1` with `?pt=` on the audio `URI="..."` and the video
  line. Headless Chromium + hls.js played the preview (5s played, 1280x720, no errors, no console errors).
- Health: H264 1280x720, MPEG-4 Audio 48000 Hz (1 ch for lavfi `sine`, 2 with `-ac 2`), bitrate 2629 to 2680 kbps
  for a 2500k + 128k push, `bytesReceived` growing. Admin SSE: `state` x3, `health` every 3s, `viewers`, `ping`.
- Go live: `live`, second press 409 `already_live`. Public master + child 200 `public, max-age=1`,
  `application/vnd.apple.mpegurl`, CORS `*`; segment 200 `video/mp4`, `public, max-age=60`, `X-Cache: MISS` then
  `HIT`; init + segment probe as H.264 1280x720. `..%2F`, 5 levels deep and `.php` paths: 404. hls.js played the
  public stream (5s, no errors).
- Heartbeats from 3 ids: 1, 2, 3; public SSE `viewers: 3` every 5s. Reactions `clap clap heart fire` arrived as
  `clap x2, heart, fire`; `boo` 400. Public SSE state went `idle, preview, live` with the right `hlsUrl`.
- End: `ended`, second press 409 `not_live`, public playlist 404 right after. OBS stopped 5s later.
- **Finalize: ready 7s after OBS stopped.** 3 raw segments, 0 holes. Window 20:50:41.385 to 20:52:55.680 UTC
  (134.3s); MP4 134.5s. First frame shows the push clock at 00:00:20.000, last at 00:02:34.433, which is exactly
  go live and End (push started 20s before go live), so the trim is keyframe exact. `ffprobe` on the `/media` URL:
  h264 1280x720 + aac 48000. `curl -r 0-1023` on it: `206 Partial Content`, `Accept-Ranges: bytes`,
  `Content-Range: bytes 0-1023/44460906`. Poster + storyboard (14 tiles, 10 columns, 10s) served as `image/webp`.
  Raw segments for the key afterwards: 0 rows, 0 objects. First recording became primary.
- 1 GiB segment (`/dev/urandom`, `duration=60`, 2020 filename so no session overlaps) through
  `/internal/media/segments`: 201 in 6.9s (155 MB/s), object byte-identical to the source, no temp file left.
  API RSS 117 MB before, peak 395 MB during, 123 MB after (a 200 MB upload peaked at 370 MB, so memory does not grow
  with the file). Row, object and file were deleted afterwards.

### 8b. Short clips, reprocess, attach, primary, delete (event `zz-stream-e2e-short`)

- Live for 4 seconds: recording `ready`, 5.5s (keyframe snap), poster and a 1 tile storyboard. This used to fail
  (`storyboard()` wrote nothing for clips under 5s, see Requests), and now poster/storyboard are best effort anyway.
- Reprocess: 202, back to `ready` (raw segments were already gone, so it rebuilt poster + storyboard from the MP4).
- Attach an uploaded 8s video (`POST /admin/assets purpose=recording`): `processing`, then `ready` once the asset
  finished; second attach 409. `PATCH {isPrimary:true}` left exactly one primary; `GET /public/events/:slug` lists
  both with the primary first. `DELETE`: 204, asset row and files gone, the live recording promoted back to primary.

### 8c. Earlier runs on this infra (before the reseed wiped them)

- A 6.5 min session with a 67s OBS drop in the middle: stitched around the hole to 327.84s (window 393.6s, covered
  spans 327.1s), H.264 1280x720 + AAC 48k stereo, moov before mdat, poster + 33 tile storyboard. Its raw segments were
  kept for the late-upload rule, as designed.
- Rotate while live (`run2.log`): `streamKey` unchanged, private key new, state stays `live`, push A kicked, the old
  key refused, push B with the new key streamed 50s, and End reported the original `liveStartedAt` (same session).
  Rotate in preview (`run3.log`): both keys change, publisher kicked, old path 404, state back to `idle`.
- OBS stopped while live: state stays `live`, `ingestOnline: false`, public playlist 404 `no_signal`, back on reconnect.
- Reconcile: `ingest_online=true` forced by SQL on an idle stream went back to false within 10s.
- MinIO full-disk episode: uploads failed and queued on the media server, finalize marked the session `failed`
  ("The storage bucket is full..."), the sweeper delivered the backlog later and the late-segment rule re-queued it.
  (Local S3 is now the Versity gateway, which has no 99% cutoff.)
- Auto end: a stream left `live` with no signal after its event ended was ended by reconcile (`meta.auto: true`).
  That run exposed the end time bug fixed now (it used "now" instead of when the signal went away): see 8d.
- Survived many API restarts from teammates' saves: live state, audience and queued jobs came back.

### 8d. Auto end with the fix

Same event, pushed 65s, went live, then OBS stopped at 20:55:46 UTC; the event was moved to end an hour earlier.
Nobody pressed End. At 21:15:56 (20 min 10s later) reconcile logged "live with no signal for 20 minutes after
its end time" and ended it: `liveEndedAt` and the session's `endedAt` = 20:55:46.527 (the moment the signal went
away, not 21:15), audit `stream.end` with `meta.auto: true`. Finalize did not wait (it is long past `endedAt`):
`ready` 13s later, 65.0s MP4 for a 64.6s window, 2 segments, 0 holes, not primary (the first recording keeps it).

### 8e. Reaction limit and the `none` path (event `zz-stream-e2e-rl`)

- Reaction before going live: 409 "Reactions open when we go live." While live, 22 reactions in about a second:
  19 x 202, then 429 `rate_limited` "Easy on the applause. Try again in a few seconds." (`retryAfterSec: 5`); the
  409 call counted too, so exactly 20 per 10s.
- That stream was live for 164 ms (Go live, 22 reactions, End). The one segment overlaps, but a cut shorter than
  0.5s is dropped, so finalize marked the session `none` and audited `recording.none`, as designed.

Test events (`zz-stream-e2e`, `zz-stream-e2e-short`, `zz-stream-e2e-rl`) and their recordings were deleted afterwards through
`DELETE /admin/recordings/:id` and `DELETE /admin/events/:id`; none of their raw segments are left in the bucket.

Unit: `npx vitest run src/modules/stream` (19 specs), `pnpm --filter @zemi/api typecheck` clean.

### 8f. Review pass (2026-09-26, reviewer)

Fixed: `DELETE /admin/recordings/:id` used to delete the recording's asset unconditionally. With the seed (8 sessions
share one 124 min asset) that would have wiped 7 other events' recordings, and since `event_media` cascades on asset
delete, deleting a recording whose video was also in a gallery removed the gallery item. `attach` had no asset
ownership check, so a stream operator on one event could attach (and then delete) another event's video by its id.
The HLS proxy forwarded any query string upstream and into the cache key, so `?x=<random>` bypassed the cache. Now
segments and init files forward no query at all, and playlists forward only valid LL-HLS directives (`_HLS_msn` and
`_HLS_part` as digits, `_HLS_skip` as `YES` or `v2`); `pt` and everything else are dropped.

Verified on the shared API (`scratchpad/review-stream/delete-test.sh`, `hls-test.sh`, `hls-cache2.sh` + logs):
one 3s `recording` clip attached to two scratch events and put in one gallery: deleting either recording kept the asset
row, its `/media` URL (200) and the gallery item. A clip attached to one event only: asset row and files gone (`/media` 404).
A `documentation` video attached as a recording: kept after delete. Scoped admin with `stream.control` on one event and no
`media.library`: 403 attaching the superadmin's upload, 403 on the other event, 201 attaching its own upload (and its
delete removed it). Seed sessions on the shared asset: 8 before and after. Preview push (`hls-cache2.sh`): master with `?_HLS_msn=abc&x=1` 200 and its child URIs
carry only `pt` (MediaMTX echoes what it gets, so before the fix the junk spread to every child request), child 200 with
and without `_HLS_msn=12&_HLS_skip=YES`, one segment `MISS` then `HIT` for `?x=1`, `?_HLS_msn=<random>`, `?_HLS_zz=1`
and `?_HLS_part=3&_HLS_skip=v2`; init + segment probe as h264 640x360. Heartbeat limit: 600 answers then 429 on the 601st from one `X-Real-IP`.
Scratch events, assets, admin and raw segments were deleted afterwards. Not run directly: releasing the old asset
when a session with raw segments is re-stitched (it goes through the same conditional delete).

### 8g. Integration fixes (2026-09-26, fix-api)

- `GET /admin/events/:id/stream` as a throwaway admin with `view` + `stream.view` on every event: `obs: null`, `state` present,
  `health` 200, `preview-token` 200, SSE `state` + `health` events without keys, `rotate` 403. The superadmin still gets
  `obs.server/streamKey/privateKey/obsStreamKey`. Spec: `stream-keys.spec.ts` (view vs control, a grant on another event,
  superadmin, 403 without stream access, no decrypt without keys).
- The shared recording asset (`9d7e7d29...`, 8 seeded sessions) attached to a throwaway event and that recording deleted:
  204, audit `meta.assetDeleted: false`, the asset row, its `/media/.../video.mp4` (206) and all 8 seeded sessions intact.
- The `stream.view` / `stream.control` hints in `rbac.ts` now say where the OBS keys live.

## 9. Known gaps

- Single API instance: audience counts, bitrate samples, "went offline at", HLS cache and SSE are in memory.
- The public page hides a recording while it is re-stitched (status is not `ready` for those minutes).
- Health `bitrateKbps` needs two samples (about 3s after someone opens the dashboard, or the next reconcile).
  `readers` counts MediaMTX readers (our HLS muxer while someone watches), not viewers; viewers come from heartbeats.
- If the media server loses its disk before uploading (no volume on Railway), those minutes are gone.
- Trims snap to keyframes, so a recording can start up to one keyframe interval (2s with the OBS settings) early.
- Not exercised on this infra: the "no poster / no storyboard" branch (the
  helper fix made the short clip succeed, so the fallback never ran). The storyboard's keyframe-only mode (over 10
  minutes) was checked with ffmpeg alone: a 725s file gives 73 frames for `count: 73` (72 before the fix).

## 10. Requests (outside my ownership)

- **api-core (`apps/api/src/common/ffmpeg.ts`)**: smallest fix made: `storyboard()` now uses
  `fps=1/<interval>:eof_action=pass`. Without it a clip shorter than half an interval (5s) produced no frame and
  `sharp` threw "Input file is missing" (this failed a 3s live recording, and would fail any short uploaded video
  in `assets.service`), and longer clips lost their last tile (324s gave 32 frames for `count: 33`). The assets
  pipeline already ran with it: the 8s `POST /admin/assets` upload in 8b reached `ready` with its storyboard.
- **scripts/dev/media.sh (lead)**: earlier smallest fix, still in place: `MTX_AUTHHTTPADDRESS` carries
  `mediamtx:<secret>@` like `entrypoint.sh` (without it every OBS publish got a 401), plus `export TZ=UTC`
  (recording filenames are wall clock, this Mac is in WIB).
- **Machine**: the data volume is at 97 to 98% (12 to 15 GB free). The local S3 gateway no longer refuses writes
  there, but a long recording plus its raw segments needs about 2x its size free while stitching.
- **admin stream dashboard (web)**: `ended` can now arrive over SSE without an admin pressing End (auto end, section 3).
- **api-events**: `EventDetail.stream.viewers` is always 0 in the events loader; the web gets live counts from the SSE,
  which is fine, or use `StreamService.publicStreams()`. Optionally show a session's existing ready asset while it is
  `waiting`/`processing` (a re-stitch), like images keep their old variants during a recrop.
- **Lead / contract (from the review)**: `StreamConfig.obs` (with the private key) goes to anyone with `stream.view`, as
  the task and the contract say. MediaMTX's default `overridePublisher: true` means that key can also take over a live
  feed, so a view-only admin could replace the picture. Options: send `obs: null` without `stream.control` (contract
  call), or set `overridePublisher: false` (a reconnecting OBS may then be refused until `readTimeout`, 60s). Not changed.
