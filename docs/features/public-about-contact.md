# Public: about, contact, errors (`public-about-contact`)

`/about` tells the story of Zemi, `/contact` is "Say hi." with a paper plane, and the error
pages (404, error boundary, global error) keep the brand when things go sideways. Everything is
built on the foundation (brand, motion, ui, three, lib/api); nothing new was added to shared,
the schema or the API.

```
apps/web/src/app/
  (public)/about/page.tsx          /about (server): resolveAbout(getSiteOrDefaults()) -> sections
  (public)/contact/page.tsx        /contact (server): reads ?topic=, next event for the room note
  (public)/not-found.tsx           a public page called notFound() (bad slug): <LostPage/> in the shell
  not-found.tsx                    every unmatched URL: composes the public layout + <LostPage/>
  error.tsx                        root error boundary (public + admin): <ErrorScreen/>, uses `retry`
  global-error.tsx                 root layout failed: own <html>/<body>, globals.css, fonts, plain SVG
apps/web/src/components/public/
  about/
    lib.ts                resolveAbout() (fallbacks), PRESENT_HREF = /contact?topic=present
    lib.test.ts           vitest: pillars always four, fallbacks, drafts hidden
    about-hero.tsx        big CaslHeading, intro, stats (CountUp), clock + drag layer + readout
    clock-state.ts        shared mutable store between the drag layer and the scene; clockLabel()
    wall-clock-scene.tsx  R3F: wall-clock.glb stuck at 13:15, springy hands, tilt, Q peeking
    zemi-word.tsx         "Why zemi?": dictionary card (ゼミ, from the German "Seminar"), since-stamp
    pillars.tsx           "Four shapes. Four habits.": tabs + stacked meaning panels + stage
    pillars-scene.tsx     R3F: the four Character3Ds on a turning clay table (lazy susan)
    story.tsx             about.story blocks (BlocksRenderer), sticky title
    audiences.tsx         "Same table, different name tags.": swinging name tags + "just curious"
    friday-timeline.tsx   "Two hours, five beats.": FRIDAY_BEATS on a scroll-filled rail + mini clock
    present-steps.tsx     "Bring the messy version.": presentSteps as a shape path + CTA
    team.tsx              organizers: photo on their brand shape, LinkIcon links
    faq.tsx               radix Accordion (animated), FAQPage JSON-LD, buddy character
    lab.tsx               marquee + "Made at MGM Laboratory." card with labUrl
    about.module.css
  contact/
    lib.ts                resolveContact(), matchTopic(), whatsappHref(), mapsHref(), safeLinks()
    lib.test.ts           vitest: topic matching, wa.me, maps fallback, unsafe socials dropped
    contact-view.tsx      layout (head / form / details), success swap (AnimatePresence)
    contact-form.tsx      react-hook-form + shared contactInput, topic chips, counter, honeypot, draft
    contact-success.tsx   characters cheer, shapeConfetti, focus + "Send another"
    contact-details.tsx   email + copy, WhatsApp, office hours, address + Maps, socials, room note
    plane-bus.ts          PlaneBus: form <-> plane renderer (mode, dock, focus, roll, launch promise)
    plane-layer.tsx       PlaneStage (one canvas over the stage) + PlaneDock (perch, flat SVG plane)
    paper-plane-scene.tsx R3F: paper-plane.glb perched, follows the cursor, launches, returns
    icons.tsx             WhatsApp, clock (13:15), pin, copy, check, door, plane (link-icon style)
    contact.module.css
  errors/
    lost-page.tsx         404 body: copy, ways back (admin paths get "Back to the studio")
    lost-planet.tsx       DOM physics playground: tiny planet, radial gravity, drag + throw
    lost.module.css
    error-screen.tsx      error boundary UI: fallen Block, unplugged cable, Try again (retry)
    error-screen.module.css
    route-loading.tsx     mark loading + "13:14... 13:15" (NOT wired, see Known gaps)
    errors.module.css
```

## Routes and data

| route | data | notes |
|---|---|---|
| `/about` | `getSiteOrDefaults()`: `settings.about`, `settings.general` (labName, labUrl), `faqs`, `team`, `stats` | static-ish (cached 30s, tag `site`) |
| `/contact` | `getSiteOrDefaults()` (`settings.contact`), `getNextEvent()` | dynamic (reads `searchParams`) |
| `/contact?topic=present` | preselects the chip matching the keyword (exact label or substring, any case) | footer, about CTA (`present`), FAQ (`question`) link here |
| `POST /api/v1/public/contact` | `sendContact()` from `@/lib/api/client` | honeypot sent as `website` |

Fallbacks: when the API is down (`isFallback`), the rich `SITE_DEFAULTS` from shared stand in.
Otherwise stored values win. Only the fields a page can't live without fall back when empty
(about title, intro, CTA; contact title, intro, email, topics). The four pillars are always
four (one per shape, a missing shape borrows its default). An emptied story, audiences, steps,
FAQ, team or address hides its section. Admin free-text URLs (socials, team links, labUrl) only
reach an `href` when they are `http(s):` or `mailto:`.

## Interactions (what to try)

- **Clock** (about hero): drag either hand (the one closest to where you press; the hour hand
  near the middle). Dragging the minute hand moves the hour hand 1/12 as fast, dragging the hour
  hand spins the minute hand 12x. Let go and they spring back to 13:15 (wild spins are capped
  to 3 hours of rewind). Every few seconds the minute hand tries to sneak to 13:16. The readout
  shows the dragged time and a quip ("Nice try."). Keyboard: the clock is a `role="slider"`
  (arrows = 5 min, Shift = 1 h; springs back 1.1 s after the last key). Touch: only the round
  face captures the gesture, the rest of the box scrolls.
- **Pillars**: tabs (roving tabindex, arrows/Home/End), hover (mouse), focus or tap bring a
  character to the front of the turning table (it cheers). Meanings share one grid cell, so the
  list never jumps under the cursor. Auto-advances every 5.2 s while visible until you touch it.
  Click a 3D character to pick it too.
- **Name tags** swing on hover; timeline beats move the mini clock on hover/focus/click; steps,
  team cards, socials, FAQ shapes all have hover and press states.
- **Contact form**: zod (shared `contactInput` minus the honeypot) with the friendly messages,
  `mode: onTouched`. Topic chips are native radios in a fieldset. The counter talks ("3 more
  characters and we're good.", "This is basically an abstract now.") and Block smiles at 10+.
  The draft (name, email, message) survives a reload in sessionStorage.
- **Plane**: perched on the card's top-right edge with a soft shadow, drifts up to ~22 px toward
  the cursor and glances at the focused field. Barrel-rolls the first time the form is valid.
  On send it winds up and flies off the top while the request travels with it; the success
  view appears when both are done. On an error it swoops back in and the error box ("The plane
  came back.") gets focus, with the email as a way out.
- **Success**: four characters cheer twice, shapeConfetti from the card, heading focused
  (`role="status"`), copy changes for "present" topics, "Send another" brings the plane back.
- **404**: the four characters stand on a tiny planet with central gravity. Drag and throw them
  (they tumble, bounce off each other and the box, land, and stand back up). They wander (hop
  decisions at 15 fps) and mutter in a speech bubble. Each character is a button: Enter/Space
  tosses it, arrows walk it. "Shake the planet" tosses everyone.
- **Error boundary**: "Someone tripped over a cable." Try again plugs the cable back in, the
  crew hops, then `retry()` runs. Shows `error.digest` for support.

## Decisions

- **No `(public)/loading.tsx`.** Measured on the running dev server: with it, every public page
  streams, so `notFound()` returns HTTP 200 (`/events/definitely-not-real` 404 -> 200) and slug
  redirects lose their 308 (`/events/zemi-107` 308 -> 200 with a client redirect). SPEC
  section 4 requires the 308. Removing it restores 404 and 308. Also, the PageTransition curtain
  already is the wait state (it waits for the new route and shows the loading mark after
  350 ms); a loading.tsx would lift the curtain early to show a second loader. `RouteLoading`
  is built and ready (see Requests).
- **Root `not-found.tsx` composes the public layout** (imports `app/(public)/layout.tsx` as a
  component) so unmatched URLs get the real nav, footer, cursor and curtain. It renders for
  `/admin/*` typos too, so the lost page swaps its buttons for "Back to the studio".
- **One WebGL canvas per section**: about has two (clock hero, pillars table), never on screen
  together; contact has one (the plane) over the top of the stage, `pointer-events: none`
  (forced with `!important`, R3F sets `auto` inline), unlabelled (decorative). Its height is
  capped (1500px under 1024px wide, 2200px above) so a tall phone layout never asks for a
  drawing buffer over 4096 device px (measured 682x4382 before the cap, 682x2625 after).
  The 404 uses DOM physics (no WebGL) so it works even when the 3D stack can't load.
- **Pillars are tabs, not accordions.** Hover-to-expand accordions shifted the list under the
  cursor and flip-flopped; stacked panels in one grid cell keep the height stable.
- **Characters face the camera** on the turning table (carousel), instead of facing outward,
  where the extruded shapes read as thin slabs.
- **Honeypot** input is named `zemi_extra_notes_2` (autofill ignores it), off-screen,
  `tabIndex -1`, `aria-hidden`, and read from the submit event, then sent as `website`. The API
  answers `{ok:true}` and stores nothing when it's filled (verified).
- **Plane paper** is recolored to warm off-white clay (`#f2f0ea`) and gets a soft canvas-texture
  shadow; the stock white paper disappeared on the white page.
- Graph paper is not used on the contact card (DESIGN section 6 reserves it). No inverse
  sections on about (reserved for the home beat, the player and the footer).
- `app/error.tsx` has no public shell (it replaces everything below the root layout), so it
  carries its own small header with the logo.
- `global-error.tsx` avoids app components on purpose (plain SVG built from the shared
  geometry) and uses `<a href="/">` (full reload) with a lint exception.
- `wall-clock-scene.tsx` disables `react-hooks/immutability` at file level: the clock store and
  GLB pivots are imperative, written only in `useFrame`/effects. Other files are lint-clean.

## Verified

### Review pass (2026-09-26, 09:05 to 09:25 WIB)

An independent review re-checked the status codes (a temporary `slug_redirects` row gave 308, then deleted;
`/events/<nonsense>` and `/nope` 404, `/home` 308). It sent a real keyboard-only submission, which landed as
topic "A question" and status `new`, and deleted the row afterwards. The submission's `contact.create` audit
row and two `.mail-outbox` files remain. It also checked mocked 500 and 400 responses, the error boundary
through a thrown server component (Try again recovers into the shell; the temporary route is deleted) and
emulated touch on the 404 (a character drags without scrolling the page, and the empty stage still scrolls).
An axe scan found WCAG AA contrast failures, now fixed:
- Timeline beats still to come were at 2.9:1 (opacity 0.55). They are now 0.75, which gives 4.9:1.
- The pillar panel label was ink-3 on the tint and is now ink-2.
- The dictionary card's "See also" was ink-4 and is now ink-3.
- The counter's "/ 5,000" was ink-4 and is now ink-3.

The 404 hint "Drag us. We bounce." now sits on a soft white pill, so the orbit ring no longer strikes
through it. Still open, foundation side: axe `aria-prohibited-attr` on the SplitText span of every
`CaslHeading` (see Requests).

### Re-verified after the reseed (2026-09-26, 08:40 to 09:10 WIB)

The first round of checks below ran against the database that was lost in the incident. This
round ran against the reseeded stack (native Postgres, MinIO, MediaMTX; 6 team members,
10 FAQs, real stats, an active announcement bar):

- `pnpm --filter @zemi/web typecheck` clean, eslint clean on every file I own, vitest 8/8.
- Real submission through the UI (`/contact?topic=present`, no mocks) landed in
  `contact_messages` with topic "I want to present" and status `new`. A honeypot submission
  through the UI (hidden field filled, sent as `website`) got `{ok:true}` and stored nothing.
  My test rows (`playwright.contact%@example.com`) were deleted afterwards; the 15 seed
  messages were not touched.
- Screenshots (full page) at 390, 820, 1440, 2560 and 844x390 landscape: `/about`, `/contact`,
  `/nope`, contact states (errors, filled, in flight, error, success) at 390 and 2560, error
  boundary and global error (temporary preview routes under `about/`, deleted afterwards).
  Team photos from MinIO load, no 4xx on any asset.
- Status codes with the new seed: a temporary `slug_redirects` row for an event gave 308 to
  the current slug (row deleted afterwards), `/events/<nonsense>` 404, `/nope` 404, `/home` 308.
- Console sweep at 1440 and 390 on `/about`, `/contact`, `/contact?topic=collab`, `/nope`, a
  missing event and an admin typo: no console errors (one run caught the watchdog restarting
  the dev server mid-load; the rerun was clean). Client navigation through the root 404 is
  still clean (one main, one footer, no stuck curtain).
- Fixed after looking at the shots: on phones held sideways (landscape, height up to ~520px,
  640 to 1023px wide) the about hero and the 404 now go two columns, so the clock and the
  planet sit next to the title instead of below the fold. Overflow checked at 640x360,
  667x375, 740x360, 844x390 and 360x740 on `/about` and `/nope`: none.
- The "first Friday" stat now reads "Sep 2024" (short month from `formatJakarta` 'month-year'),
  so it stays on the same row as the numbers at 1440 instead of dropping to a row of its own.

### First round (before the incident)

- `pnpm --filter @zemi/web typecheck` clean; eslint clean on all my files.
- Playwright (chromium) screenshots at 390x844, 820x1180, 1440x900, 2560x1440 (+ 360x740,
  844x390 landscape, 1024x768 overflow checks) under `scratchpad/shots/public-about-contact/`:
  about (full page), contact idle / validation errors / filled / in flight / error / success /
  send another, reduced-motion contact and about, 404 (public and admin paths), error boundary
  and global error (via temporary preview routes, deleted afterwards).
- No horizontal overflow at 360 / 844 / 1024 on /about, /contact, 404.
- No console errors on /about, /contact, /contact?topic=collab, /nope, a missing event and an
  admin typo at 1440 and 390 (the only noise is foundation-level: THREE.Clock deprecation,
  headless GPU stall, dev preload hints). The contact success path was clean in 6 fast mocked
  runs and the final real run; one earlier real run logged React's "state update on a
  component that hasn't mounted yet" right after a batch of file rewrites (likely Fast
  Refresh). Not reproduced since.
- End to end against the shared API: two real submissions landed in `contact_messages`
  (topic "I want to present" from `?topic=present`, status `new`); a honeypot submission
  returned `{ok:true}` and stored nothing. Mocked 500 and success states via `page.route`.
- Status codes (old DB): `/nope` 404, `/events/definitely-not-real` 404, an old event slug 308.
- Client-side navigation through the root 404 (it mounts its own copy of the public shell):
  404 -> "Take me home", /about -> a broken link -> 404, 404 -> "See the Fridays". Each lands
  with one nav, one main, one footer, no stuck curtain, no console errors.
- CSS: on admin pages `public.css` and my modules are not applied (checked `document.styleSheets`
  while logged in). Next does add unused `<link rel=preload>` hints for the not-found
  boundary's CSS on every route (dev), a small bandwidth cost of the shell-composing 404.
- `vitest`: 8 tests for the about/contact resolvers (API-down fallback, empty fields, unsafe
  links, topic matching, wa.me and maps links).
- Test data: the three real test messages (`playwright.contact*@example.com`) were deleted
  from `contact_messages` afterwards; their `contact.create` audit entries remain.
- Clock drag (13:15 -> 13:54 while dragging, back to 13:15 after release), keyboard (13:25 after
  two ArrowRight), pillar tabs, admin 404 buttons.

## Known gaps

- `RouteLoading` is not wired to a route (see Decisions). Drop-in if the lead accepts soft
  404s: `export default function PublicLoading() { return <RouteLoading />; }` in
  `app/(public)/loading.tsx`.
- Touch drag on the 404 planet and the clock was not tested on a real device (headless only),
  and neither was the WebGL buffer limit on an older phone GPU.
- The pillar stage's 3D characters are decorative for screen readers (the tabs carry the
  content); clicking a 3D character is mouse/touch only, the tabs cover keyboard.
- The about story headings come from settings and can repeat what the timeline says ("What a
  Friday looks like"); that's copy in the CMS, not layout.

## Requests (outside my ownership)

1. **Lead: `app/(public)/loading.tsx`.** Adding it makes every public route stream: a missing
   event goes from 404 to 200 and an old slug from 308 to 200 (client redirect), against SPEC
   section 4. I left it out. If you still want it, the file is one line (see Known gaps). The
   alternative the Next docs suggest is a slug existence check in `proxy.ts` before streaming.
2. **Lead / anyone: `docs/DECISIONS.md`** (append-only, not mine): please log the loading.tsx
   call, and that the root `not-found.tsx` composes the public layout.
3. **Shell owner (web-public):** `app/not-found.tsx` imports the default export of
   `app/(public)/layout.tsx` and renders `<PublicLayout>{children}</PublicLayout>`. Keep that
   signature children-only (no params or searchParams), or tell me and I will switch to
   composing `PublicNav` + `PublicFooter` directly. Optional: the curtain's "waiting" state
   could reuse `RouteLoading`'s "13:14... 13:15" line.
4. **Foundation (three):** `SceneCanvas` gives no way to pass `style`/`className` to the
   `<Canvas>` itself, so overlay canvases have to force `pointer-events: none !important` on
   descendants. A `canvasClassName` or `interactive={false}` prop would be cleaner.
5. **Foundation (motion):** the SplitText wrapper span inside `CaslHeading` / `SplitReveal` puts
   an `aria-label` on a plain `<span>`. Axe flags this as `aria-prohibited-attr` (serious) on every
   display heading. Either move the label to the heading element, or drop it and pair the
   `aria-hidden` split pieces with an `sr-only` copy of the text.
