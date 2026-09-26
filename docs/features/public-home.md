# public-home: "A Friday at Zemi"

The home page is one Friday session, 13:15 to 15:15 WIB, told as you scroll. Every beat is
stamped with its real time and drives the Friday clock. The four characters carry the story.
The copy comes from site settings `home`, and every piece has a default.

## Routes

| route | file | notes |
|---|---|---|
| `/` | `apps/web/src/app/(public)/page.tsx` | Server Component: `loadHome()` then `<HomeStory>`. Canonical `/`. OG image is the site default |
| `/sitemap.xml` | `apps/web/src/app/sitemap.ts` | static pages plus every public event, speaker and publication. Pages through the lists 100 at a time (the API max) and stops quietly with what it has if the API is down. `revalidate = 3600` |

No API endpoints were added. The page reads `GET /public/site`, `/public/events` (next,
upcoming, past), `/public/events/:slug` (featured detail), `/public/speakers` and
`/public/publications` through the foundation's `@/lib/api/server` helpers.

## Files (`apps/web/src/components/public/home/`)

| file | what |
|---|---|
| `data.ts` | `loadHome()`: every fetch in parallel, resilient. Picks the featured event (the admin's `featuredEventId` while it is upcoming, a live event always wins), fetches its detail, puts speakers with faces first, drops duplicate paper titles. Flags `offline` (site settings fell back), `scheduleOffline` and `archiveOffline` (those lists failed, even if cached settings loaded) |
| `story-plan.ts` | `planStory(beats)`: admin beats become the hero stamp (at or before 13:15), staged scenes, and the closing (at or after 15:00). Scenes match beats by their default time first, so text edits never move a scene. Extra beats render as `GenericBeat` |
| `home-story.tsx` | composition (server) plus the skip link |
| `skip-story.tsx` | "Skip the story, jump to the next Friday". Jumps with no smooth scroll and focuses the Up next heading. Lenis's own anchor handler is stopped because it left focus at the top |
| `story-clock.tsx` | wires `FridayClock` to scroll. Every `[data-story-time]` element is an anchor, and the time runs linearly between anchors, so the stamps and the clock always agree, pins included. Steps from stamp to stamp under reduced motion. At 15:15 it throws confetti and rewinds to "13:15 next friday". Hides when the footer arrives |
| `beat-stamp.tsx` | `13:30 WIB · first talk` pill with a tiny analog face, in a `<time>` |
| `motion-config.ts` | shared `gsap.matchMedia` conditions: `long` (laptops, full pins), `short` (portrait phones and tablets, shorter pins), `flow` (short landscape, no pins), `reduced` |
| `hero/` | 13:15. `SceneCanvas` with the four clay characters. They look at the cursor, lean into their velocity, squash on hover or click, and ripple to each other (60 ms per unit of distance). Poses step at 15 fps. Idea particles drift up and dodge the pointer. The camera parallaxes on the pointer and pushes in on scroll. Giant `CaslHeading` with a split reveal, highlighter on the last sentence, "Save me a seat" (to `/events/<next>#register`), "What happens here?" (smooth scroll, then focus on the story heading), the doors-open beat, and the next-Friday mini card (date, WIB range, room, rolling countdown, LIVE state). The 2D characters are both the loading placeholder and the no-WebGL fallback |
| `beats/lonely.tsx` | 13:20, the one inverse section (`data-nav-theme="dark"`). A dark room, Q alone at a laptop, a spotlight that follows the cursor (or sweeps with scroll on touch). Words light up one by one while pinned, then the lights come on: "Fridays aren't." |
| `beats/out-loud.tsx` + `table-scene.tsx` | 13:30, pinned scrub. The characters roll in and hop onto stools around `/models/seminar-table.glb`, the laptop opens, Hunch takes the mic, the camera dollies. A small ticker narrates |
| `beats/same-table.tsx` | 14:00. Three cards (Master's, PhD, undergrad) dealt as you scroll. Hover (mouse) or tap and Enter (touch, keyboard) flips each one to "brings / asks / superpower". Flip all three and Bridge cheers with confetti. Keyboard focus shows the whole hand even before the scroll deals it |
| `beats/question.tsx` | 14:30. A little lecture room: drag and throw the "?" bubble at the speaker (with aim assist), or press "Ask the question". Each hit squashes the speaker, cheers the audience, bumps a counter (`aria-live`) and moves the question to someone else. A button throw always counts, even if the lob misses or the stage is off screen |
| `beats/coffee.tsx` + `coffee-scene.tsx` + `network-canvas.tsx` | 14:50. A steaming clay cup (shader steam, `coffee-cup.glb`) with Block you can clink, over a 2D constellation of speaker faces. The cursor links whoever is near, and a click introduces two people for good ("Dita meets Arjun"). Tallies for collabs and clinks |
| `beats/generic-beat.tsx` | any extra admin beat |
| `up-next.tsx` | the featured Friday: a big 4:5 cover with tilt, `DistortImage` hover and a spinning sticker. Title, summary, speaker chips linking to `/speakers/<slug>`, when, where and how, a seats-left bar, countdown cells, "Save my seat", "Add to calendar" (.ics). A "But first" pill appears when the featured event is not the next one. LIVE state. Designed empty and API-down states |
| `past-gallery.tsx` | horizontal drag gallery. Native scroll for touch, trackpad and keys; mouse drag with inertia; skew on velocity; `data-cursor="drag"`; arrow buttons. Covers, number, title, speakers, a "Watch" badge when `hasRecording` |
| `speakers-marquee.tsx` | faces clipped to brand shapes with a colored twin behind, in a marquee that reacts to scroll speed and direction, pauses on hover, and grows the hovered face. A second row of big names runs the other way (decorative, `aria-hidden`) |
| `stats.tsx` | sessions, talks, speakers, seats filled, publications, each held by a character shape, counted up in view, plus the admin's fun stat on a sticky note. Hidden when `statsEnabled` is off, the API is down, or fewer than two stats are non-zero |
| `publications-teaser.tsx` | "Born at the table": up to four recent papers as floating paper cards (clip, type, year, figure, authors). They scatter a little on scroll and straighten on hover |
| `closing.tsx` | 15:05 to 15:15. "See you next Friday." The four colors pour up like a layered drink, each character riding a wave, then ink floods in and hands the page to the dark footer (the nav flips). The clock hits 15:15 at the end of the pin, celebrates, and resets |
| `idle-peek.tsx` | after 25 s idle, Q peeks in from the edge with a line. Any input sends it away; poking it makes it cheer |
| `countdown.tsx` | rolling mono countdown (`TickingDigits`), compact or cells, `role="timer"` with a spoken label |

## Decisions

- **One WebGL canvas per section and at most one on screen.** Hero, out-loud and coffee each
  mount a `SceneCanvas` near the viewport, and it pauses offscreen. Measured by scrolling the
  whole page at 1440x900 in quarter-screen steps: never more than 1 live WebGL canvas visible.
  The coffee constellation is canvas 2D.
- **Pins by media query.** Laptops pin and scrub. Portrait phones and tablets pin shorter.
  Short landscape screens don't pin (`flow`), scenes just scrub while they pass. Reduced motion
  means no pins, no scrub, final states, 3D as still frames, and the clock stepping between stamps.
- **Keyboard users are never trapped.** Skip link to Up next with a focus move. "What happens
  here?" moves focus with the scroll. Tab order follows the page. The same-table hand shows
  itself on `:focus-visible`.
- **Text stays HTML.** Canvases are `aria-hidden` or `role="img"` with a label. Every time,
  title and name is real text.
- **Hero fade only on laptops.** On phones the hero copy is taller than the screen and still
  being read, so it stays solid. Only the 3D camera reacts to scroll there.
- **Copy** is from settings `home` (hero eyebrow, title, body, CTAs, beats, fun stat, stats
  toggle, featured event). Section titles in the lower half ("Past Fridays", "The people at the
  table", "Every Friday, counted.", "Some questions grew up into papers.") are fixed copy for now.

## Verification

- Playwright (SwiftShader) screenshots of every beat at 390x844, 820x1180, 1440x900,
  2560x1440 and 844x390 (landscape), plus reduced motion at 1440x900. Scripts are in the
  session scratchpad (`ph-sections.mjs`, `ph-interact.mjs`, `ph-budget.mjs`,
  `ph-reduced-probe.mjs`).
- Interactions pass on desktop, touch (390) and reduced motion: question ask and throw,
  card flips and "met everyone", coffee links and clink, gallery drag (not a click), wheel and
  arrows, skip link (lands on Up next with focus there, next Tab goes into Up next), secondary
  CTA focus, keyboard reveal of the hand. No console errors from these files.
- A reduced-motion DOM probe finds no invisible story text at 1440 or 390, except the
  desktop-only scroll cue and the clock label animating out.
- The 3D scenes render at every size, including the coffee cup at 2560x1440 (SwiftShader needs
  6 to 12 s there, and the 2D placeholder covers the wait). Q's idle peek shows after 25 s.
- `pnpm --filter @zemi/web typecheck` is clean. `/sitemap.xml` returns 206 URLs against the seed.
- Console errors seen during the runs came from another teammate's in-progress
  `components/public/events/detail/rundown.tsx` (a parse error pushed through HMR), not from
  the home files.

## Review pass (fixes after the first finish)

- **Hero fits one laptop screen.** Before, "Save me a seat" was below the fold or under the
  Friday clock at 1024x768, 1280x720, 1366x657 and 1536x730, and also at 1440x900 and 1920x960
  whenever the announcement bar showed. `hero.module.css` now subtracts the bar
  (`--hero-bar`, set with `body:has([role='region'][aria-label='Announcement'])`, so it is
  keyed to the shell bar's role and label), uses a smaller minimum gap under the nav, and sizes
  the laptop title with `min(9.2vw, 16.5vh, 16cqi, (100svh - bar - 420px) / 3.1)`. The `cqi`
  term (the title's own column) stops "half-" / "finished" splitting at 1024 and 1280. Under
  800px tall on laptops the doors note steps aside for the clay cluster. Measured with the fold
  probe (`rph-fold.mjs`) at 1024 to 2560, with and without the bar: CTAs always on screen and
  clear of the clock. 1440x900 is unchanged; 2560 goes from 176px to 173px.
- **Friday clock under the nav on phones and tablets.** At the top of the page the bar pushes
  the nav down 40px and the clock sat on top of it. `story-clock.tsx` sets `--clock-drop` from
  `#main`'s top while the bar is on screen and passes `max-lg:mt-[var(--clock-drop)]` to
  `FridayClock`.
- **Closing waves.** `globals.css` caps every `svg` at `max-width: 100%`, so the 200%-wide wave
  edge was half as wide as it should be and left a flat step as it slid. `.edge` sets
  `max-width: none`.
- **Stats triangle.** The number sat on the triangle's eyes at 390 and 820. It is lower and a
  bit smaller now.
- **Coffee hint** says "Tap or click" (it said "Click" on phones too).
- **`data.ts`:** if `/events/next` fails but the upcoming list loads, the hero uses the first
  upcoming Friday that is not cancelled, so it doesn't say "Nothing booked yet".

## Known gaps

- API-down and empty states were screenshotted in the earlier run. They could not be re-run
  now without stopping the shared API or starting another web server. The new
  `scheduleOffline` and `archiveOffline` flags are checked by reading the code only.
- The home footer repeats the closing ("See you next Friday." then the footer's "See you
  Friday."). See Requests.
- The publications teaser uses 2D paper cards, not a 3D scene: the paper-stack model already
  sits on the 13:30 seminar table, and this keeps the lower half free of WebGL.
- Lower-half section titles are not admin-editable.

## Requests (outside my ownership)

- **web-public foundation, `PublicFooter`:** on `/` the footer headline (`home.closingTitle`,
  "See you Friday.") comes right after the home closing ("See you next Friday."). Consider a
  `compact` variant, or skipping the big headline on `/`.
- **web-public foundation, docs:** a `Marquee` inside a CSS grid needs
  `grid-template-columns: minmax(0, 1fr)` (or `min-width: 0` on the item). Otherwise the
  implicit `auto` column grows to the track's max-content width, and the edge fade mask
  stretches across the whole screen. Worth adding to the gotchas.
- **web-public foundation, `SmoothScroll`:** Lenis `anchors` intercepts every same-page hash
  link on `window` and ignores `defaultPrevented`, and focus doesn't move to the target. A skip
  link built on a plain `href="#..."` scrolls but leaves keyboard focus at the top. The home
  page has its own `SkipStoryLink` for this. The layout's `SkipLink` (`#main`) may be affected
  too.
- **web-public foundation, `AnnouncementBar` + `FridayClock`:** expose the bar's visible height
  (for example `--announcement-h` on `:root`, 0 when dismissed). The home hero now detects the
  bar through its `role` and `aria-label`, and the story clock nudges itself below the nav. A
  shared variable would let both use one value, and it would let the clock's `top-center`
  position handle the bar itself.
