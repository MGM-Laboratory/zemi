# public-events: events index, event page in every state, registration, ticket

Owner: public-events. Built on the web-public foundation (`@/components/public/ui`, `motion`, `brand`,
`three`, `media`, `@/lib/api/*`, `@/lib/hooks`) and the player (`ZemiPlayerLazy`).
No shared contract, schema or dependency changes.

## Routes

| route | file | what |
|---|---|---|
| `/events` | `app/(public)/events/page.tsx` | "The Friday archive": hero, Friday ribbon, LIVE strip, Coming up, archive grid with filters |
| `/events/[slug]` | `app/(public)/events/[slug]/page.tsx` | state-aware event page. `{redirect}` gives a 308 (`unwrapLookup`), missing gives the public 404, API down gives `ApiUnavailable`. Metadata (title, description, canonical, OG/Twitter image = cover `src`) and JSON-LD `Event` |
| `/tickets/[token]` | `app/(public)/tickets/[token]/page.tsx` | the ticket (noindex, no-referrer). Malformed tokens 404 before any fetch. `?cancel=1` opens the cancel confirmation (email contract) |
| `/live` | `app/(public)/live/route.ts` | 307 to the stream-live event, else the next event (`/public/events/next`), else `/events` |

Deep links other pages can use: `/events/<slug>#register` opens the register sheet, `#recording` and
`#photos` scroll to the player and the gallery (the thank-you email uses them), `/events?tag=x`,
`?q=`, `?when=past|upcoming|all`, `?year=2025`, `?speaker=<slug>`.

## Files

```
components/public/events/
  lib.ts                 server-safe helpers: accent maps + CSS vars, labels, whenLine, mapsLink, venueLine,
                         toRibbonEvent (slim ribbon shape), relativeDay, recordingPending, seeded, siteUrl
  cover-frame.tsx        4:5 cover in an accent frame: pointer tilt, translateZ badge layer, glare, optional DistortImage
  events.module.css      frame, stamp/sticker, countdown boxes, rundown rail, dark stage, stop-motion hop/sway,
                         masonry gallery tiles, ribbon ticks/playhead/preview, staggered archive grid
  archive/
    events-hero.tsx      big CaslHeading + real counts (wrapped Fridays, recordings, first month)
    friday-ribbon.tsx    every Friday since the first as tick marks (breaks included), dock-style magnify around the
                         playhead, hover/drag scrub with a preview card, click/Enter to open, role="slider" keyboard
    live-strip.tsx       dark LIVE NOW strip (stream live, or ongoing by time) with a scroll-reactive marquee
    coming-up.tsx        next Friday big (summary + Save my seat), the rest compact; relative day chips, seats left
    archive-browser.tsx  filters synced to the URL with nuqs (shallow), debounced search, React Query infinite list
                         seeded with the server page, "More Fridays" then infinite scroll, empty + error states
    archive-card.tsx     one cover card (whole card is a link, labelled by title + date), status and Watch badges
  detail/
    event-experience.tsx the state machine (see below), sections per state, register sheet + #register sync
    hero.tsx             ScheduledHero, OngoingInfo, PastHeader, CancelledHero, RegisterCta
    stage.tsx            LiveStage (ZemiPlayer live), WaitingStage ("13:14:5x" + the cast, 15 fps steps),
                         EndedStage (recording on its way, or the recording once ready), InRoomStage (offline events)
    countdown.tsx        rolling TickingDigits countdown; first render uses the server time so it hydrates cleanly
    facts.tsx            date, WIB time, room + note + Open in Maps, join mode chips, online note
    speakers-section.tsx cards with per-event org/position/talk title linking to /speakers/<slug>
    rundown.tsx          vertical clock timeline, rail fills on scroll, "Now" item by WIB wall clock on the day
    publications-section.tsx  cards linking to /publications/<slug>
    venue-card.tsx       room card (Open in Maps) + livestream card
    recordings.tsx       ZemiPlayer VOD with chapters + storyboard; several recordings become "parts" tabs
    gallery.tsx          masonry documentation wall, hover preview for clips, lightbox (arrows, swipe, swipe down
                         to close, Esc, focus returns to the last photo), videos play in the lightbox
    stats.tsx            "people saved a seat", speakers, minutes on tape, photos, papers (only real numbers)
    next-friday.tsx      "Next up" CTA from the layout's next event
    prev-next.tsx        previous / next Friday
    sticky-cta.tsx       phones and tablets: bottom "Save my seat" bar once the hero button scrolls away
    actions.tsx          CalendarButton (.ics), ShareButton (Web Share on touch, copy link elsewhere)
components/public/register/
  register-sheet.tsx     bottom Sheet on phones, Dialog from 768px. Views: form, success, already registered, closed
  register-form.tsx      react-hook-form + zodResolver(registerInput), honeypot, attendance mode adapted to event.mode,
                         opt-in "Remember me on this device" (off by default, so shared lab PCs keep nobody's
                         email or phone; unticking clears it), "13:14... 13:15" wait label, API error mapping
  register-success.tsx   shapeConfetti + the cast cheering, the ticket card, Save ticket / Add to calendar / Show my ticket
components/public/ticket/
  ticket-card.tsx        graph-paper ticket: accent stripe, perforated stub, branded QR (API qr.svg), code, mode
  ticket-view.tsx        the ticket page: status copy, QR brightness hint, Wake Lock, 12s check-in polling on the
                         event day, green checked-in state with confetti, cancel (confirm dialog), sign up again
  save-ticket.ts         draws the ticket on a 2D canvas (QR from the same-origin rewrite, so no taint) and downloads a PNG
  ticket.module.css
```

## The event page state machine

- `status = useEventStatus(event, stream.state)` where `stream` is the SSE value from `useLiveEvent` (seeded
  with the server's `stream`), so it flips Coming up, Happening now, Wrapped on its own. Status comes first:
  stream state is only read inside `ongoing` (event #98 in the seed has an old ended stream and recordings
  while still scheduled, and correctly shows the scheduled page).
- The SSE only opens from 3 h before the start to 3 h after the end, or when the stream is already
  `preview`/`live`. Archive pages never open it.
- Ongoing: stream `live` shows the dark player stage (reactions, viewers, heartbeats come from the player);
  `idle`/`preview` shows the waiting stage and swaps to the player when the SSE says live; `ended` shows
  "Stream ended, the recording is on its way" and then the recording itself once it is public; offline events
  show "Happening now in <room>". Registration stays open while the API allows it (for people walking in).
- Past: dark header ("You missed it, but here's everything." when there is a recording or photos, else
  "That's a wrap."), recording player or "on its way" (polls `router.refresh()` every 45 s for up to a day
  after the end) or a cover + facts card, then gallery, stats, speakers, rundown, details, papers, next Friday.
- Cancelled: struck-through title, the reason in a kind callout, "Next Friday: ..." from the layout's next event.
- A status flip triggers `router.refresh()` so registration info and recordings are fresh.

## Registration errors (from docs/features/api-people.md)

| API answer | what the person sees |
|---|---|
| 200 `existing: true` | "You were already on the list." + the ticket (email re-sent) |
| 409 `already_registered` | "That email already has a seat." + masked email, no ticket (privacy) |
| 400 with issues | inline field errors (focus goes to the first) |
| 400 `rejected` | honeypot message |
| 422 `event_full` | last seat gone, livestream is open to everyone (hybrid/online) |
| 422 `registration_closed` / `event_past` / `event_cancelled` | the API message |
| 429 | "Whoa, lots of sign ups from here. Give it a minute." |

## Decisions

- Archive grid defaults to `when=past` with a Wrapped / Coming up / Everything switch; cancelled Fridays show
  under Everything, on the ribbon and on their page (public `past`/`upcoming` exclude them). Logged in DECISIONS.md.
- No check-in count is public, so the stats say "people saved a seat" (`registrationCount`, hidden when the
  event hides it). Logged.
- No `loading.tsx` in these routes: streaming the shell first would turn old-slug 308s and 404s into 200s. Logged.
- The ribbon slider starts on the Friday nearest today; ticks are not individually focusable (100+ tab stops);
  the archive grid below has a link per Friday.
- Whole-card links in the archive (`aria-labelledby` title + date) so the pointer tilt keeps working; the
  Coming up cards use a stretched title link with the cover link raised above it.
- Countdown and relative-day chips render from the server time first (`renderedAt`), so hydration matches.
- Save ticket draws with canvas (no html-to-image dependency). The code uses the system mono because canvas
  can't set Recursive's MONO axis.
- Characters on the stages step at 15 fps (CSS `steps()`), UI stays smooth. Reduced motion: no hop/sway,
  no ribbon grow-in, Reveal drops transforms, the wait clock stops ticking.

## Verified

- `pnpm --filter @zemi/web typecheck` clean; `eslint` clean on all my files; prettier applied; no U+2013/U+2014.
- Playwright (Chromium) against seeded data, screenshots in the session scratchpad `shots/public-events/`:
  - `/events` at 390, 820, 1440 and 2560 (hero, ribbon hover preview, LIVE strip, Coming up, grid, filters empty
    state). Ribbon keyboard: focus, ArrowLeft twice lands on #96 with a correct `aria-valuetext`, Enter opens it.
    Filters: `?tag=security` gives 7, switching to Everything and searching updates the URL, Clear filters resets
    it, "More Fridays" loads page 2 (48 cards).
  - Scheduled (#101, and #98 with the stale ended stream) at all four sizes, plus reduced motion on a phone
    with the sticky Save my seat bar.
  - Past with recording + gallery (#97) at all four sizes; lightbox opens with Enter, ArrowRight goes to 2/5,
    Esc closes and focus returns to the last photo.
  - Cancelled (#20) at all four sizes.
  - Registration end to end on desktop (#101, with empty-submit validation first) and phone (#99): form, loading,
    success with confetti and ticket, Save ticket PNG downloaded (checked the image), Show my ticket.
  - Ticket page: registered, `?cancel=1` confirm then "You released this seat", checked in (desktop + phone),
    and a live flip: ticket page open on a phone, door scan through the admin API, the page turned green with
    confetti within one poll.
  - Live: a throwaway unlisted event (starts 5 min ago), waiting stage, ffmpeg push to MediaMTX (preview), Go
    live, the player stage playing the HLS through the public proxy at 390/820/1440/2560, the rundown "Now"
    marker, End stream ("recording is on its way"), then the finished recording on the same page, the LIVE
    strip on `/events` and `/live` redirecting to it.
  - No-reload transitions on ONE open page (desktop, then 844x390 landscape), asserting `[data-event-status]`
    and a `window` marker that survives only without a reload: scheduled flips to ongoing on the clock (~75 s),
    "Mics are on" appears via SSE when OBS connects, the player appears on Go live, "recording is on its way"
    on End, and the recording replaces it about 45 s later. Same JS realm throughout.
  - Duplicate sign-ups on #101: new (landscape phone, dialog scrolls, submit reachable), same email + phone
    (tablet, "You were already on the list." + ticket), same email + other phone (2560, 409 view with the masked
    email). Ticket page for that online ticket at 820, 2560 and 844x390.
  - Landscape 844x390: scheduled hero, register dialog, sticky bar, past page and recording, `/events`, stages.
  - All test events and test registrations were deleted afterwards.
- No console errors on these runs, apart from dev noise: Next's CSS preload warnings, HMR websocket and CSS
  chunk messages while the shared dev server restarted, and the browser's own "409 (Conflict)" network line
  for the already-registered case.
- Bugs found by those runs and fixed: `Rundown` called `useScroll` with a target that never mounted when an
  event had no rundown (motion threw "Target ref is defined but not hydrated"); the live stage unmounts on
  the SSE message that ends the stream, so the page now refreshes on every stream state change itself; the
  player wrappers now share the player's max width so landscape phones don't show an empty framed gutter.

## Known gaps

- No Matter.js physics rain on success (not installed); the celebration is shapeConfetti plus the cast.
- No R3F scene on event pages: depth comes from the tilted cover frames, the ShaderBackdrop (one WebGL canvas)
  on the scheduled hero and 2D characters. The awwwards "3D clay numeral per row" idea is not done.
- Gallery clips preview on hover with a mouse; on touch they play in the lightbox only.
- Share uses the Web Share API on touch devices and copies the link elsewhere.

## Changes outside my ownership

- `components/public/player/player.module.css`: one selector. In live mode `.root[data-mode='live'] .floatChip`
  set `bottom` with higher specificity than the top-right variant, so the "Playing muted / Unmute" chip stretched
  from top to bottom as a huge pill. The top-right rule now also matches `.root[data-mode='live']`.
- `docs/DECISIONS.md`: three appended lines (above).

## Requests

- web-public foundation: `useNavTheme` probes 36 px from the viewport top, which is inside the AnnouncementBar
  while it shows, so dark heroes (past header, live stage) keep a dark wordmark until you scroll 40 px. Probe at
  the nav bar's center instead (measure the bar, or add the announcement height).
- api-events: an optional public `checkedInCount` on `EventDetail` (only when `showRegistrantCount`) would let
  past pages say how many people actually came.
- errors/404 owner: `LostPage` takes no props; `title`/`body` props would let `/tickets/*` say "We couldn't find
  that ticket" instead of the generic copy.

## Review (public-events reviewer)

Checked against SPEC, DESIGN and the shared contract: HTTP (missing slug 404, old slug 308 through a
temporary `slug_redirects` row, bad and unknown ticket tokens 404, `/live` 307 + `no-store`, draft 404,
unlisted 200), JSON-LD parses, absolute `og:image` + canonical (`metadataBase` is set), list filters
(`speaker=<slug>`, `search=#42`, tag, year), cold `#register` deep links with and without the first-visit
loader at 390 and 1440, client navigation from Coming up "Save my seat", `#recording` / `#photos`, a
phone registration end to end, `?cancel=1`, and a real ffmpeg push on a throwaway event (waiting, preview,
Go live, End, then the two-part recording) on one open page without a reload. Screenshots in the session
scratchpad `shots/rev-public-events/` (`r2-*`) and `shots/rev-public-events2/`. Test data deleted.

Fixed:
- Register form no longer saves name, email and phone on every device. "Remember me on this device" is
  opt in (off by default) and unticking forgets it at once. Shared lab PCs were leaking the last person's
  details into the next person's form.
- Cancelled page: the "Next Friday: <title>" button ran off 360 to 390 px phones (the magnet wrapper sized
  to the text). It now truncates inside the page.
- Register sheet on a closed Friday said "Save your seat", then "Sign ups are closed." twice. The title
  now says "Sign ups are closed" and the body gives the reason once.
- Live stage: on 16:10 laptops (1440x900, 1280x720) the player ran below the fold. From 600 px of height
  up it now fits under the nav and the title. Landscape phones keep the full-height player.
- Rundown: the rail `<span>` sat directly in the `<ol>` (only `<li>` is valid). It moved to a wrapper.
- Archive cards: the link name now includes "coming up", "live now" or "recording available" (the
  badges on the cover were not part of it). The Wrapped / Coming up / Everything switch uses
  `aria-pressed` buttons instead of radios without arrow-key support.
