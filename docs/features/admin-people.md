# admin-people: registrations, attendance, door scanner, emails, audience (web)

Owner: admin-people. Built on the admin kit (`docs/foundation/web-admin.md`), the event workspace from admin-events
(`useWorkspaceEvent()`), and the api-people endpoints (`docs/features/api-people.md`). Everything is fetched in the
browser with React Query. People data lives under `adminKeys.events.part(id, ...)`, so one invalidate of the event
refreshes the header counts and every people tab at once (`invalidatePeople()` in `people/lib.ts`).

## Routes

| route | file | needs | what |
|---|---|---|---|
| `/admin/events/[id]/registrations` | `app/admin/(dashboard)/events/[id]/registrations/page.tsx` | `registrations.view` (the workspace blocks the tab otherwise) | Stats row, charts, the list, detail sheet, add, export, print |
| `/admin/events/[id]/attendance` | `.../attendance/page.tsx` | `attendance.scan` (roster and walk-ins need `attendance.manage`) | Live door board |
| `/admin/events/[id]/emails` | `.../emails/page.tsx` | `emails.send` | Broadcast composer + email log |
| `/admin/scan/[eventId]` | `app/admin/scan/[eventId]/page.tsx` + `app/admin/scan/layout.tsx` | `attendance.scan` | Full-screen camera scanner, outside the dashboard chrome |
| `/admin/scan` | `app/admin/scan/page.tsx` | | Redirects to the events list |
| `/admin/scan/zxing-reader.wasm` | `app/admin/scan/zxing-reader.wasm/route.ts` | none (open-source binary) | Serves the installed `zxing-wasm` reader binary from our origin, immutable with `?v=` |
| `/admin/audience` | `app/admin/(dashboard)/audience/page.tsx` | capability `audience.view` (`AccessGate`) | People across every Friday |

The scan layout re-checks the session with `getMeServer()` like the dashboard (401 goes to login with `?next`, API
down shows `GateError`), mounts `AdminProviders` + `AdminToaster`, imports `admin.css`, and paints a dark full-bleed
screen (`viewportFit: cover`, dark theme color).

## Components (`apps/web/src/components/admin/people/`, `.../scanner/`)

| file | what |
|---|---|
| `lib.ts` (pure) | `peopleKeys`, `invalidatePeople`, labels (`MODE_LABEL`, `SOURCE_LABEL`, `EMAIL_STATUS_LABEL`), chart colors (`CHART`, `SOURCE_COLOR`, validated), list params, `shortName`, `formatPhone`, `whatsappUrl`, `toCsv`/`csvCell` (BOM, CRLF, formula guard that keeps `+62`), `downloadBlob`, `downloadUrl` |
| `queries.ts` | `useRegistrationStats`, `useRegistrationList`, `useAttendanceSummary`, `useRoster`, `useEmailLog`, `useBulkRegistrations`, `useRegistrationActions(eventId, device)` |
| `use-attendance-stream.ts` | `useAttendanceStream(eventId, { onMessage })`: EventSource on `/api/v1/admin/events/:id/attendance/stream` (same origin, cookie), snapshot then live `checkin`/`counts`, `freshIds` for enter animations, `pulse`, reconnect with backoff; a closed stream probes the JSON endpoint so 403 stops and 401 goes to login |
| `charts.tsx` / `charts-impl.tsx` | `ChartCard` (chart and table twin, caption, headline, dims while refetching), `BarList`, `StackedShare`, `Meter`; recharts `TimelineChart`, `HourChart`, `ArrivalsChart` loaded with `next/dynamic` (`ssr: false`) |
| `animated-number.tsx` | Count-up number whose final text is always the real value |
| `add-registrant-dialog.tsx` | Manual add (`registrations.manage`) or walk-in (`attendance.manage`), duplicate email gets "Check them in" / "Open them"; exports `duplicateFrom`, `EMAIL_RE` |
| `registrations/*` | `RegistrationsTab`, `StatsRow`, `ChartsGrid`, `RegistrationsTable` + `useRegistrationFilters` (nuqs), `RegistrationSheet`, `ExportMenu`, `PrintSheetDialog` |
| `attendance/*` | `AttendanceBoard`, `LiveFeed`, `Roster`, `QuickWalkIn`, `ScannerCard` (+ `scannerPath`) |
| `emails/*` | `EmailsTab`, `ComposeBroadcast`, `EmailLog` (+ `TEMPLATE_LABEL`), `blocks-to-html.ts` |
| `audience/audience-page.tsx` | `AudiencePage` (table, person sheet, CSV export) |
| `people.css` | Keyframes for the feed wash, live dot, ring glow, QR sweep (reduced motion safe) |
| `scanner/scanner-app.tsx` | `ScannerApp`: access checks, intro, live camera UI, feedback, recent scans, settings |
| `scanner/use-camera.ts` | `useCamera(videoRef)`: tap-only start, device memory, constraints, torch, zoom, tap to focus, stop |
| `scanner/use-scan-loop.ts` | `useScanLoop`: requestVideoFrameCallback loop at about 13 to 15 fps, back-pressured, rotating frame variants |
| `scanner/preprocess.ts` | Pure RGBA filters: gray, percentile contrast stretch, invert, bilinear upscale, sharpen; `VARIANT_CYCLE` |
| `scanner/detect-core.ts`, `detector.worker.ts`, `detector-client.ts` | Engine choice (native `BarcodeDetector` with `qr_code`, else the `barcode-detector` ponyfill on ZXing wasm), run in a module Web Worker with a main-thread fallback |
| `scanner/feedback-card.tsx`, `feedback.ts`, `manual-entry.tsx`, `scanner.css` | Full-screen result card, WebAudio blips + vibration + device label, "Type a code" dialog, scanner keyframes |

## Registrations tab

- **Numbers:** registered with a capacity meter (red once full, "8 over the 80 seats"), checked-in count with a
  rate ring, in-person or online split, walk-ins, returning or first-timers.
- **Charts** (dataviz method, brand blue for sign-ups, brand green for arrivals, every chart has a table view and a
  hover tooltip, text in ink tokens):
  - cumulative sign-ups by day with a capacity line and an event-day marker;
  - sign-ups by hour of day (peak labeled);
  - arrivals per 5 minutes on the day with a "Starts 13:15" line;
  - email domains as a ranked bar list with "Everything else";
  - sources as one stacked bar with a legend that carries the numbers;
  - "How early people sign up", bucketed from the daily timeline.
- **List:** server-side paging, sorting (name, registered, checked in) and debounced search.
  - Filters for status, checked in, mode and source live in the URL: `q, status, in, mode, src, sort, page, size`,
    plus `r` for the open sheet.
  - Columns: name with a "Returning" badge and a notes icon, checked in (time, with who and how in a tooltip),
    email, phone, mode, ticket, registered ("25 Sept, 13:16 WIB", full date in the tooltip), source, and a row menu.
    Checked in sits next to the name so it stays on screen at laptop widths.
  - A new search, filter or sort clears the selection, so a bulk action only ever touches rows you can see.
  - Bulk actions are gated by permission: check in and undo (`attendance.manage`); resend, cancel, restore and
    delete (`registrations.manage`). Destructive ones confirm and say what happens.
- **Detail sheet:** status, returning badge, check-in toggle, resend, restore, edit details (409 on the email shows
  inline), history timeline, notes (1000 chars), and a careful zone for cancel and delete. It loads the selected
  registrant's actual ticket from `GET /admin/registrations/:id/ticket` (scoped to `registrations.view`), shows the
  branded QR card, and lets admins download its PNG to attach manually in WhatsApp. The message below is filled with
  the person's name, ticket code, event time and location, and private ticket link; it can be copied or opened in
  WhatsApp with the text prefilled. Cancelled registrations show a void ticket and cancellation text, and cannot
  download a valid ticket image.
- **Add registrant:** a manual add or a walk-in, "Check them in now", "Email them the ticket", and friendly handling
  of duplicates.
- **Export** (`registrations.export`): XLSX or CSV of what you see (current filters), or everyone including
  cancelled seats. **Print attendance paper**: order, blank walk-in rows, in-person only (hybrid events), a
  page estimate, then download or open the PDF.

## Attendance tab (live board)

- **Header:** "At the door", a live pill (Live, Connecting, Reconnecting, No live access), and "Open scanner".
- **Hero:**
  - counts: checked in over registered with a big green percent ring;
  - "still to come" and the in-person count;
  - last 10 minutes, walk-ins, and the busiest 5 minutes.
  - Every live check-in pops the number and glows the ring, and the Bridge character cheers.
  - An `aria-live` line announces the new count.
- **Door scanner card:** a QR of the scanner URL (drawn on the client from `window.location.origin`), "Open scanner
  here", a copy field, and a note when the address is localhost (phones cannot reach it).
- **Live feed:** every check-in and undo from any device, newest first. It shows who, how (a QR or hand badge), the
  admin, the device, the WIB time and a relative time. New items slide in with a green wash that fades.
- **Arrivals chart:** refetches (debounced 1.2 s) after each SSE check-in, so a rush is one request. The bucket
  that just got someone is drawn darker for 4 s.
- **With `attendance.manage`:**
  - **Roster:** search, not yet / here / all with counts, and a big "Check in" or "Undo" per person. Contact
    details stay masked.
  - **Quick walk-in:** name, email, optional phone, and "Add and check in". A duplicate offers "Check them in".
- **Scan-only (`attendance.scan`):** no roster or walk-ins, and the feed says it only shows your own scans (the API
  filters them).
- **Layout:** online-only events get a friendly empty state. On phones the order is hero, scanner, feed, arrivals,
  walk-in, roster. From `lg` the right-hand column is one flex column (`display: contents` below `lg`).

## Door scanner (`/admin/scan/[eventId]`)

- **Never auto-starts.** Every visit shows "Door duty, ready?" with an "Enable camera" button, and `getUserMedia` runs
  only on that tap.
  - Tracks stop when you leave (unmount, `pagehide`), press Stop, or the tab goes hidden. A hidden tab shows
    "Camera paused." and needs another tap.
  - There are dedicated screens for blocked (with iPhone, Android and laptop instructions), insecure (http),
    missing, busy and failed cameras. Each offers "Type codes instead".
- **Camera:**
  - The default is `facingMode: environment`, `ideal` 1920x1080 at 30 fps, with fallbacks. The chosen device is
    remembered per browser.
  - A device picker appears for 3 or more cameras, and a one-tap switch for 2.
  - `applyConstraints` sets continuous focus, exposure and white balance when `getCapabilities` lists them.
  - The torch toggle and zoom slider show only when supported.
  - Tap to focus uses `pointsOfInterest`, maps the tap through `object-fit: cover`, and returns to continuous focus
    after 3 s.
  - A screen wake lock is held while live.
- **Detection:**
  - Native `BarcodeDetector` is used when it supports `qr_code` (Android Chrome, Chrome on macOS). Otherwise the
    `barcode-detector` ponyfill runs ZXing in WebAssembly (iOS Safari, Firefox), with the `.wasm` served from our
    own origin first and jsDelivr as the fallback.
  - Both run in a module Web Worker (frames are transferred, not copied), with a main-thread fallback.
  - The loop uses `requestVideoFrameCallback` (rAF where missing), about 13 to 15 fps, and grabs a new frame only
    after the detector answers.
  - Frames rotate raw, enhanced (gray + 1 to 99% contrast stretch), raw, inverted, raw, then a sharpened center
    crop. The crop is at sensor resolution, upscaled to about 900 px and matches the on-screen guide.
  - `?detector=native|zxing` forces an engine and `?debug=1` shows fps, ms and hits per variant.
- **Dedupe:** a payload is ignored for 3 s after it was last seen. A code held in front of the camera keeps
  refreshing that window, so it produces exactly one card. It reads again once it has been out of view for 3 s. A
  second device gets "Already in since 13:21 WIB".
- **Results:** `POST /api/v1/admin/events/:id/attendance/scan { payload, device }`, then a full-screen card:
  - green "Welcome, Rina!" (name, mode, code, "#57 through the door");
  - yellow "Already in since 13:21 WIB" (and who let them in);
  - red for wrong Friday (names the other event), cancelled ticket, and unknown ticket;
  - dark for too many scans (429), offline or network trouble (with "Try again"), and lost access (403).
  - Cards close on a timer (green 1.8 s, yellow 2.6 s) with a countdown bar, or on tap, Enter, Space or Escape.
    Enter and Space on a focused button (like "Try again") run that button instead.
- **Feedback:** a WebAudio blip per outcome (unlocked on the Enable tap, with a mute toggle remembered per device)
  and `navigator.vibrate` patterns where supported.
- **Around the camera:**
  - a live counter ring fed by the same SSE plus each scan answer;
  - a recent scans strip and panel (this device, with retry for failed ones);
  - "Type a code" (ZM-XXXXXX, links and tokens work too, lookalike characters are excluded);
  - an offline banner, and cancelled or past event banners;
  - a device name setting ("Door A phone"), sent as `device` so the board says which door let who in.
- **Layout:** works in portrait and landscape (the card lays out in a row in landscape) and respects safe areas.
  On short screens (height under 32rem, phones in landscape) the characters, the aim hint and the recent strip step
  aside so the guide and the Enable button stay visible, and the intro scrolls from the top instead of clipping.

## Emails tab

- **Compose:** subject (200 chars), who gets it (everyone, in person, online on hybrid events, checked in, not
  checked in), and the message in `BlockEditor`.
  - The live counts come from `event.counts`, so an admin with only `emails.send` never hits a 403 on
    `/registrations/stats`.
  - `{{name}}` is the first name and `{{fullName}}` is the full name (the API fills them in per recipient).
- **HTML conversion:** on send, one headless `BlockNoteEditor.create()` (never mounted, lazy imported) runs
  `blocksToHTMLLossy`. H1 becomes h2 and h4 to h6 become h3, to fit the API allowlist.
  - We warn when images are not https (the API drops them) and when tables, checklists, files or videos will turn
    into plain text.
  - A 400 on `html` (empty after sanitizing) shows inline.
- **Test first:** "Send me a test" goes to an address you type, remembered in localStorage. The line under it says
  "sent" or "saved to the dev outbox" and notes when the subject changed since.
- **Send:** the confirm dialog says the exact count, the subject and the audience, and warns when no test of this
  subject went out. It shows a result callout (sent, outbox, failed). A 429 (3 per event per 10 minutes) gives a
  wait time. After a real send the editor resets.
- **Log:** every email for the event (tickets, reminders, starting, thanks, broadcasts, tests), filtered by kind and
  status, paginated on the server. `to` is always masked on the client (the API only masks without
  `registrations.view`). A failed row shows its error in a tooltip.
- **Autopilot:** the side card lists the automatic emails, so nobody writes a reminder by hand.

## Audience page

- **Search:** debounced, in the URL (`q`, `page`, `size`, `p` for the open person).
- **Table:** name with a Regular (3+ attended) or New badge, email, phone, and a "Fridays" strip: newest first, a
  filled green dot for came, a blue ring for coming up, a gray ring for missed, each with a tooltip. Then "Came"
  (attended over Fridays that already happened, with a rate, or "Coming up" before their first one) and last signed
  up. First time is hidden by default and can be turned on in the column menu. Names stay on one line; the badge
  drops under a long name.
- **Person sheet:** show-up rate, contact (mailto, WhatsApp), and their Fridays, each linking to that event's
  registrations filtered to them.
- **CSV export:** built in the browser from every page of the current search (pageSize 100, the API cap), with a
  progress pill and Stop. It uses the same `toCsv` as elsewhere.

## Decisions

- **Scanner "always ask".** Browsers keep a granted permission, so the honest version is: never start the camera
  without a tap on this visit, and release it on every exit (leave, hide, stop). Where the browser keeps asking
  (Safari by default), it asks every time.
- **Dedupe window refreshes while the code stays in view.** It is 3 s from the last sighting, not the first, so a
  steady hand never shows a second card.
- **Counts on the scanner:** the newer of the stream counts and the last scan answer wins, so a scan never shows
  an older number than the one it just produced.
- **Show-up rate** in Audience only counts Fridays that already happened (or that they already came to), so
  someone with only an upcoming seat reads "First one coming up", not 0%.
- **The email log masks `to` for everyone,** as the task asked, even for admins whose API response is unmasked.
- **Broadcast recipient counts** come from `event.counts` (active seats), which match the API's audience filters.
- **The QR on the board** encodes the scanner URL of whatever origin the studio is served from.
- **scanner.css is imported by the scanner client component, not the layout.** In the layout it was merged with
  admin.css into a different CSS chunk, and Next dev then warned that the preloaded admin.css chunk was unused.

No shared contract (`packages/shared`, `schema.ts`) or foundation files were changed. Everything is inside the
ownership list.

## Verified (resume run, re-seeded DB, shared dev servers)

Run after the last edit (review pass included): `pnpm --filter @zemi/web typecheck` exits 0 for the whole package, and
ESLint (with the React Compiler rules) reports 0 problems across every file above.

Playwright scripts are in `scratchpad/people/*.mjs`, and the screenshots are in `scratchpad/shots/admin-people/`.

- **Screenshots:**
  - Registrations, Attendance, Emails and Audience at 390, 820, 1440 and 2560 (`reg-*`, `att-*`, `em-*`, `aud-*`).
  - No horizontal page scroll at any width, and no console errors.
  - Registrations uses Zemi #97 (79 active, 57 checked in).
- **Scanner with a fake camera** (`e2e-door.mjs`):
  - Setup: a real #98 ticket QR from `GET /public/tickets/<token>/qr.png`, turned into a y4m with ffmpeg, and
    Chromium started with `--use-fake-device-for-media-stream --use-file-for-fake-video-capture`.
  - Timing: tap to "Welcome, Ahmad!" took 0.8 to 1.3 s warm. The first cold run took 15 s while dev compiled the
    worker. The native path ran at 13 fps and 11 to 15 ms per frame, and ZXing wasm (`?detector=zxing`) also read it.
  - Live board: a second page showed it move from "0 of 58" to "1 of 58" over SSE through the `:3300` rewrite, with
    the new feed item carrying the fresh wash.
  - Dedupe: the same code held in view gave no repeat card. A second scanner page gave "Already in since 04:02 WIB".
  - Manual entry: `ZZZZZZ` gave "We don't know this ticket".
  - Camera release: the track was live while scanning. Hiding the tab released it and showed "Camera paused."
  - Screenshots: portrait 390x844, landscape 844x390 and laptop 1440x900. Each test check-in was undone and its
    history rows removed afterwards.
- **Live arrivals, offline, retry** (`e2e-live.mjs`, throwaway event starting a few minutes earlier):
  - The board QR rendered, and the arrivals card started empty.
  - The first scan ran with the scan request aborted and showed "That scan didn't go through". After the route was
    restored, Try again gave "Welcome, Dewi!".
  - On the board, 1.3 s later: "1 of 1", one arrivals bar in the 04:20 bucket drawn in the darker highlight green,
    back to normal after about 4 s.
- **Door RBAC** (`e2e-rbac.mjs`): a throwaway event and two scoped admins, all deleted afterwards.
  - `attendance.manage`: roster check-in, then undo, then a walk-in (the counts went 0/1, 1/1, 0/1, then 1/2), and
    the duplicate walk-in callout. The Registrations tab was blocked.
  - `attendance.scan` only: no roster or walk-in, the "own scans" note, a dimmed low-contrast QR read ("Welcome,
    Sari!"), the feed updated with their own scan, and the Registrations tab was blocked.
- **Registrations** (`e2e-list.mjs`, throwaway event):
  - search `?q=bima` synced to the URL, `?mode=online` from the URL, and the sheet via `?r=`;
  - notes saved, a check-in from the sheet, bulk check-in ("2 people, 1 skipped") and bulk undo;
  - XLSX, CSV and PDF downloads with the API's file names, and the duplicate add callout.
- **Emails** (`e2e-emails.mjs`, throwaway event with 2 seats):
  - inline errors on an empty send;
  - a test to a typed address;
  - the confirm dialog with the count, then a real send ("2 people saved to the dev outbox");
  - three new log rows (masked, with the Test badge).
  - The posted HTML was `<p>… <strong>…</strong></p><h2>Bring snacks</h2><ul><li>…</li></ul><p>…{{fullName}}.</p>`
    (the H1 was mapped), and the outbox files read "Hi Budi," and "Hi Rina,".

## Known gaps

- Not tested on real hardware: iOS Safari and Android Chrome, torch, zoom and tap to focus. The Chromium fake
  camera has none of those. The code paths are gated on `getCapabilities` and `getSupportedConstraints`, and the
  ZXing path that iOS uses was exercised in Chromium.
- iOS has no Vibration API, so iPhones get sound only.
- Offline scans are not queued in the background. They show "That scan didn't go through" with Try again (checked),
  and stay in Recent scans with a Retry button.
- The arrivals histogram follows the API's range: the event day, from 30 minutes before the start. Before or after
  that day it shows its empty state, while the counters and feed keep moving.
- The feed holds the 60 newest items. "Last 10 min" is counted from the feed, so it only covers your own scans for
  scan-only door crew.
- Broadcasts are synchronous in the API. Around 300 recipients takes about a minute, and a very large audience
  could run into the proxy timeout in production.
- On phones the Audience table scrolls sideways inside its card, because the kit DataTable has no card mode.

## Review pass (2026-09-26)

Fixed:

- **Bulk selection outlived the view.** Selecting rows, then searching or filtering, kept the old ids in the bulk bar
  (and showed every action, Delete included, for rows that were no longer on screen). The selection now resets when
  search, filters or sort change. Checked in the browser: 2 selected, type `budi`, the bar is gone.
- **Feed scope matched the API.** The board said "Every device" to admins with `registrations.view` + `attendance.scan`
  but no `attendance.manage`, while the API only sends them their own scans. `ownOnly` is now `!attendance.manage`.
  Checked with a temporary admin: the note reads "Your own scans" and `recent` from the API was empty.
- **Scanner "Try again" from the keyboard.** The card's window key handler cancelled Enter and Space on every button,
  so a focused Try again just dismissed the card. Checked: offline scan, Shift+Tab to Try again, Enter, "Welcome, Budi!".
- **Landscape phones.** The live controls covered the guide, and the intro and blocked screens clipped their top
  (centered overflow). See Layout above. Screenshots at 844x390 and 390x844.
- Walk-in added with "Check them in now" off no longer toasts "is in".
- Laptop widths: the registrations list shows name, checked in, contact, mode and ticket at 1440; the audience list
  shows through "Came".

Verified with a throwaway event and admin (both deleted): fake-camera scan through ZXing in the worker (1.35 s to
"Welcome, Rina!", 14 to 15 fps), no request to jsDelivr (the wasm came from `/admin/scan/zxing-reader.wasm`, 200,
`application/wasm`, `X-Zxing-Wasm-Version: 3.1.3`), the board moving 0 of 2 to 1 of 2 with the fresh wash, a hidden
tab stopping the track, "We don't know this ticket" for `ZZZZZZ`, and "Already in since 05:14 WIB" on a second device.

## Requests (outside my ownership, none blocking)

- api-people: `RegistrationStats` could add check-ins by mode (in person vs online showed up). `AudienceRow` could
  carry a past-Fridays count, so the client doesn't have to derive it.
- api-people: scan-only filtering (summary `recent` and SSE items) matches `checkins.actor_name` against the
  principal's name, and admin names are not unique, so two door crew admins with the same name see each other's
  scans. An additive `actor_id` on `checkins` would make it exact.
