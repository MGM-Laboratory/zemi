# admin-stream-media: stream control room + documentation media (web)

Owner: admin-stream-media. Built on the admin kit (`docs/foundation/web-admin.md`), the event workspace
(`docs/features/admin-events.md`), the stream engine (`docs/features/api-stream.md`) and the event media endpoints
(`docs/features/api-events.md`). No shared contract, `schema.ts` or API changes.

## Routes

| route | file | needs |
|---|---|---|
| `/admin/events/[id]/stream` | `app/admin/(dashboard)/events/[id]/stream/page.tsx` | `stream.view` (the workspace layout gates it); every control also checks `stream.control` |
| `/admin/events/[id]/media` | `app/admin/(dashboard)/events/[id]/media/page.tsx` | `view` to look, `media.manage` to change anything |

## Files

`apps/web/src/components/admin/stream/`

| file | what |
|---|---|
| `control-room.tsx` | `StreamControlRoom`: composes the tab. Callouts for cancelled and room-only (`mode: offline`) events, skeleton, error state |
| `state-header.tsx` | The big header. Five looks: Waiting for OBS (dashed, sleepy), Receiving signal (yellow, "only admins see this"), LIVE (red, breathing glow, live timer), Signal lost (red stripes, still live), Ended (ink). Characters, signal arcs, viewers now + peak (rolling numbers), SSE dot, Go live / End stream behind confirm dialogs. State changes are announced in a stable `role=status` region |
| `preview-player.tsx` | Admin-only HLS preview (hls.js, lazy imported; native HLS on Safari). Attaches on its own when ingest is online, retries while the first playlist warms up, refreshes the 10 min `pt` token every 8 min in place (xhrSetup), shows height and latency, mute and full screen, a branded slate when there's no picture. No heartbeats, so admins are never counted as viewers |
| `health-panel.tsx` | `GET /stream/health` every 3 s: bitrate with verdict + sparkline (client history, 40 points), resolution, codecs, sample rate, channels, uptime, bytes. Container queries so it works in the side column and full width |
| `obs-setup.tsx` | "Connect OBS": the combined `Stream key for OBS` (masked, the obvious one), Server, then the two parts (stream key, private key masked). CopyFields burst shapes on copy; fields flash after a rotate. Rotate keys (`stream.control`, destructive confirm, copy differs while live). Five-step illustrated OBS guide (a drawn OBS settings window with the fields to change highlighted and a gliding cursor; real text next to it; tabs with arrow keys / Home / End) |
| `recordings.tsx` | Sessions list: status chip (recording / waiting / processing / ready / failed / none), pipeline track + REC timer while building, poster with storyboard hover scrub and inline MP4/WebM playback when ready, inline title edit, public/hidden switch, "Make it the main one", menu (Rebuild the video, Download MP4, Delete with confirm). "Upload a recording" panel (`FileUpload purpose=recording`, attached as soon as the upload lands, guarded against double attach) |
| `inline-edit.tsx` | `InlineEdit`: click to edit, Enter or blur saves, Escape cancels, spinner then check. Also used by media captions |
| `use-stream.ts` | Queries (`useStreamConfig`, `useStreamHealth`, `useRecordings` polling while busy), `useStreamEvents` (admin SSE into the React Query cache with reconnect/backoff), `useStreamActions` (live, end, rotate), `useRecordingActions` (patch optimistic, reprocess, delete, attach) |
| `lib.ts` | Pure helpers: query keys (under the event detail key), `roomState`, `canGoLive`, cache patchers (keep the workspace header and banner in step), recording status meta, pipeline, clock, codec labels, bitrate verdict, `withPreviewToken` |
| `stream.css` | `zemi-stripes`, `zemi-ready-pulse`, `zemi-live-breathe`, `zemi-tile-shimmer` (all animation behind `prefers-reduced-motion: no-preference`) |

`apps/web/src/components/admin/media-docs/`

| file | what |
|---|---|
| `media-tab.tsx` | `MediaDocsTab`: header with counts, the whole tab is a drop target (overlay "Let go, we've got it."), compact "drop more" strip, big graph-paper drop zone as the empty state, grid, lightbox, remove confirm. Read-only callout without `media.manage` |
| `upload-queue.tsx` | `useUploadQueue`: up to 3 uploads in parallel (`uploadAsset(..., { wait: false })`), per-file progress, attach one at a time (`POST /media`, server appends at max+1), then the item follows the gallery until ready. Cancel, retry, clear finished, `beforeunload` guard while uploading, object URL previews for processing tiles. `UploadQueueList` renders it |
| `media-grid.tsx` | Sortable grid (dnd-kit `rectSortingStrategy`): mouse drag anywhere on the tile, long-press on touch (page still scrolls), keyboard on the handle (Space, arrows, Space) with announcements. Star (featured) with a shape burst, inline caption, menu (Open big, Move to the front, earlier, later, Take out of the gallery). Videos play a muted loop on hover (fine pointers only) |
| `lightbox.tsx` | Full-screen viewer: arrows and swipes, counter, star, native video controls, focus returns to the tile of the item on screen |
| `use-media.ts` | `useEventMedia` (polls every 3 s while anything processes), `useMediaActions` (add, update, remove, reorder; optimistic with rollback) |

## Endpoints used

`GET /admin/events/:id/stream`, `POST .../stream/live|end|rotate`, `GET .../stream/health`, `GET .../stream/preview-token`,
`GET .../stream/events` (SSE), `GET|POST /admin/events/:id/recordings`, `PATCH|DELETE /admin/recordings/:id`,
`POST /admin/recordings/:id/reprocess`, `POST /admin/assets` (purpose `recording` or `documentation`), `GET /admin/assets/:id`,
`GET|POST /admin/events/:id/media`, `PATCH|DELETE /admin/events/:id/media/:mediaId`, `PUT /admin/events/:id/media/order`.

## Decisions

- **Keyboard safe controls.** No shortcuts for Go live or End. Both open an alert dialog with focus on Cancel. Go live is
  disabled until OBS is connected, and says why ("Wakes up when we see a signal from OBS.").
- **State comes from SSE, polls are the safety net.** State, viewers and recording changes are written straight into the
  cache (and into the workspace event, so the header chip, banner and tab dot flip too). A state flip into or out of
  `live`, or a new `currentSessionId`, refetches the recordings list (Go live from another device shows the new
  "Recording" card). Config refetches every 60 s, recordings every 4 s while busy.
- **Preview token refresh without reloading.** hls.js `xhrSetup` swaps `pt` on every request, so an hour of preview never
  breaks. A 403 retries with a fresh token.
- **Documentation attaches as soon as the upload lands, not when processing is done.** The API accepts processing assets
  and the admin list returns them with `status`. Waiting for "ready" would orphan files when someone closes the tab while a
  video transcodes. Processing tiles show the local file with a shimmer and a "Processing/Transcoding" chip.
- **Attach POSTs are serialized** so the server's `max(sortOrder) + 1` never ties. Uploads run 3 at a time, so files land in
  the order they finish uploading (not always the order picked); reorder afterwards if it matters.
- **Recording upload attaches right away** too (the API flips it to ready when the transcode finishes). The title typed
  before the file lands is sent with it; it can be edited inline later.
- **Read-only Media tab is a plain div**, not a disabled dropzone root (react-dropzone puts `aria-disabled` on the root,
  which marked the whole gallery disabled for assistive tech and for Playwright).
- **Accept map uses `image/*` and `video/*` wildcards** plus extensions, so phones open the camera roll. A validator keeps the
  types the API allows for `documentation` (JPG, PNG, WebP, AVIF, HEIC/HEIF, GIF, MP4, MOV, WebM, MKV), photos up to
  100 MB and videos up to 4 GB. HEIC previews that the browser can't draw fall back to an icon.
- **Reorder saves right away** (optimistic, rollback + refetch on error). The menu's move actions do the same, for people
  who don't drag.
- **Reprocess is disabled** while recording, waiting or processing; **Delete** while recording or processing (the API 409s).
- **Copy** says what happens: "This stops the public stream and starts building the recording.", "Everyone on the event
  page will see this.", "The file stays in the media library, so nothing is lost."
- OBS numbers follow the task brief: CBR 3500 to 4500 kbps for 1080p30 or 2500 kbps for 720p30, keyframe 2 s, profile high,
  tune zerolatency optional, audio 160 kbps 48 kHz.

## Verified (local, 2026-09-26, shared API :4400, native MediaMTX, MinIO, Postgres)

Playwright against http://localhost:3300 as superadmin. Screenshots in the scratchpad `shots/admin-stream-media/` (390, 820,
1440, 2560; all looked at). No horizontal page scroll at any size. Scripts in the scratchpad `asm/`.

- **Stream end to end** on Zemi #98 (published, upcoming, hybrid). The "Copy" button on "Stream key for OBS" put exactly
  `obsStreamKey` on the clipboard. ffmpeg `testsrc2` + `sine`, H.264 `-g 60`, AAC 48k to
  `rtmp://localhost:51935/live/<streamKey>?key=<privateKey>`:
  - Waiting for OBS, then Receiving signal **1.8 s** after the push started; preview playing (hls.js with `pt`) after
    6.3 s, "720p", "4.2 s behind"; health 2,700 kbps, 1280 x 720, H.264, AAC 48 kHz, bytes, uptime, sparkline.
  - Go live: button enabled only with signal; confirm dialog opens with focus on **Cancel**; confirming flips to LIVE with
    the timer. Public playlist `GET /api/v1/public/live/<id>/index.m3u8` answered **200** (master playlist with
    `video1_stream.m3u8` + `audio2_stream.m3u8`, 1280x720). Two heartbeats: "Watching now 2", peak 2.
  - End stream (after 80 s): confirm, Ended, recording card **waiting, then processing, then ready** within 15 s, 1:22,
    25.9 MB, poster, storyboard scrub on hover, inline MP4 plays. The public event payload lists it.
  - Rotate keys while live: confirm, OBS kicked, header **Signal lost** (stripes), keys flash; the private key changed, the
    stream key stayed; pushing again with the new key went back to LIVE (1080p, 4,276 kbps). That extra session was
    ended, finalized (ready, 20 s) and deleted.
- **SSE**: Go live through the API (not this page) made the "Recording" card appear in 89 ms without a reload; End moved it
  to ready on its own; that test session was deleted.
- **Read-only** (scoped admin with only `view` + `stream.view` on Zemi #98, removed afterwards), 1440 and 390: no Go live,
  End, Rotate, Upload or recording menu, title not editable, switch disabled, keys visible; Media shows the callout, no
  add button, drop strip, handles, stars or caption edit, the menu only has "Open big", the lightbox opens without a star.
- **Recordings**: upload a recording (throttled to 250 KB/s to see the progress bar), attached with its title, transcoded
  to ready; inline title edit; hide and show; "Make it the main one" (the other one loses primary); Rebuild the video
  (waiting, processing, ready); delete with confirm (the remaining one is promoted to primary by the API).
- **Media**: 4 photos + 1 video in one drop, 3 uploading in parallel (throttled run shows progress bars and "Waiting for a
  free lane"), attached one at a time in the order they finished, processing tiles with local previews, all ready; star (shape burst, "1 starred");
  caption via Enter; Escape cancels an edit without saving; keyboard reorder of photo 3 one step earlier saved
  (`PUT order`, confirmed by the API); lightbox arrows through photos to the video (plays), Escape returns focus to the
  tile of the item on screen; remove with confirm (4 left). Mouse drag of tile 1 onto tile 3 saved the new order and did
  not open the lightbox on drop. Finished queue rows clear themselves about 3 s after their tiles are ready. Phone (390, reduced motion on) run of the same flow. The public
  event payload shows the media in the new order with the caption and star.
- `pnpm --filter @zemi/web typecheck`: no errors in these files. `npx eslint` on these folders: 0 problems (React Compiler
  rules included). No console errors from these pages (the only console noise during runs came from another teammate's
  in-progress public home page import, and one transient `ECONNRESET` in the Next dev rewrite on a recordings GET that
  retried fine).

## Test data left behind

Zemi #98 now has one public recording ("Zemi #98, the full session", 1:22, primary), 4 documentation items (3 photos, 1
video, 2 captions, 1 starred) and stream state `preview` with ingest offline. Zemi #99 was used for upload tests and cleaned.

## Known gaps

- Frame rate is not shown: `StreamHealth` has no fps field (MediaMTX 1.21 doesn't report it in `/v3/paths/get`).
- In-app navigation away from the Media tab mid-upload cancels the uploads (the App Router has no blocking API). The tab
  close/reload case asks first (`beforeunload`), and the queue says "Keep this tab open".
- Drag to reorder needs a mouse, a long press or the keyboard handle; there is no multi-select move.
- The featured star is stored per item (`featured`); how big "the big spots" are is up to the public event page.

## Requests (outside my ownership)

- **api-stream**: `StreamHealth.fps` (optional) if MediaMTX ever exposes it, the health panel has a spot ready.
- **public event page owner**: `media[].featured` is set from this tab ("starred ones get the big spots"); please give
  starred items the larger tiles.
