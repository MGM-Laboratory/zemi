# bumpers: animated agenda cards for the venue screen and the livestream (web + api)

Owner: bumpers. Web (`apps/web/src/components/bumpers/**`, `app/admin/(dashboard)/bumpers/**`,
`app/admin/stage/**`, `app/bumpers/**`), API (`apps/api/src/modules/bumpers/**`), shared contract
`packages/shared/src/schemas/bumpers.ts` (+ RBAC additions), tables `bumper_shows` and
`bumper_revisions` (migration `0005_bumpers.sql`, hand written like 0003/0004).

A **bumper** is a full-screen animated card played on the room screen and in OBS between the parts
of a Friday: welcome, the host, opening remarks, each speaker, their paper, the thank-you, Q and A
(zemi.ac/q plus a QR code), the coffee break, the group photo, next Friday and goodbye. A **show**
is an ordered list of bumpers. Operators build shows by hand or generate them from an event, play
them full-window in the browser (click right/left, arrow keys, presenter clickers), or put them in
OBS as a browser source that follows the controller. Every change between two bumpers plays a
transition chosen for that pair: A to B always plays the same one, A to C usually a different one.

Everything below is the contract for the people building it. Read `docs/DESIGN.md` first (brand,
characters, motion, voice) and keep the house rules: no em or en dashes in any user-facing copy,
casual voice, characters have two eyes and no mouths or limbs.

---

## 1. Routes

| Route | File | Who |
|---|---|---|
| `/admin/bumpers` | `app/admin/(dashboard)/bumpers/page.tsx` | anyone with `canUseBumpers` (library of shows) |
| `/admin/bumpers?new=1` | same | opens "New show" (palette action) |
| `/admin/bumpers/[id]` | `app/admin/(dashboard)/bumpers/[id]/page.tsx` | `run` to view, `edit` to change (the builder) |
| `/admin/events/[id]/bumpers` | `app/admin/(dashboard)/events/[id]/bumpers/page.tsx` | event tab, `bumpers.run` (this event's shows + generate) |
| `/admin/stage/bumpers/[id]/play` | `app/admin/stage/bumpers/[id]/play/page.tsx` | `run`: full-window player (covers the browser window) |
| `/admin/stage/bumpers/[id]/control` | `app/admin/stage/bumpers/[id]/control/page.tsx` | `run`: controller / presenter view |
| `/admin/stage/bumpers/lab` | `app/admin/stage/bumpers/lab/page.tsx` | any admin: every template and transition with sample data |
| `/bumpers/out/[key]` | `app/bumpers/out/[key]/page.tsx` | OBS browser source (output key, no session) |
| `/bumpers/dock/[key]` | `app/bumpers/dock/[key]/page.tsx` | OBS custom browser dock and phones (control key, no session) |

`/admin/stage/*` has its own layout (`app/admin/stage/layout.tsx`): session gate like the door
scanner, `AdminProviders`, `ConfirmProvider`, no sidebar or topbar. `/bumpers/*` has its own bare
layout (no public nav, loader, cursor, Lenis, toaster), transparent body for OBS, `noindex`, and its
own `not-found.tsx` / `error.tsx` so a bad key never paints the public site into the stream.
`robots.ts` disallows `/bumpers/`.

## 2. Permissions (RBAC)

- Capability **`bumpers.manage`**: build, run, archive and delete every show, including standalone
  shows not tied to an event. Full admins get it automatically.
- Event action **`bumpers.run`** ("Run bumpers", Stream group): play the event's shows, drive the
  screen and OBS, see the OBS links. Implies `view`.
- Event action **`bumpers.edit`** ("Build bumpers", Stream group): create, generate, edit, archive,
  delete the event's shows, rotate their OBS links. Implies `bumpers.run` and `view`.
- **`stream.control` implies `bumpers.edit`** (and so `bumpers.run`): every stream operator, existing
  ones included, can build and play the bumpers of the events they stream. No data migration.
- Bundles: `stream-operator` = `stream.view, stream.control, bumpers.run, bumpers.edit`; new
  `show-runner` = `bumpers.run` (a volunteer who only presses next); `read-write` gains both.
- `normalizePolicy` now drops unknown capabilities instead of failing the parse (version skew safety).

Shared helpers (use them on both sides): `bumperPermissions(ability, eventId)` returns
`('run' | 'edit')[]`; `canUseBumpers(ability)`; `canCreateBumpers(ability, eventId | null)`.
A show with `eventId = null` needs `bumpers.manage`.

## 3. Data model

`bumper_shows`: `id`, `title`, `event_id` (events, **cascade**), `status` active|archived,
`origin` blank|generated|duplicate|starter|restored, `theme` jsonb `BumperTheme`, `slides` jsonb
`BumperSlide[]` (validated with the shared zod schema on every write), `version` (optimistic
concurrency), `output_key` (plain, unique, `randomBase62(32)`), `control_key_hash` (sha256, unique)
+ `control_key_enc` (AES-GCM, AAD = show id, `randomBase62(40)`), `keys_rotated_at`, the live state
(`live_slide_id`, `live_from_slide_id`, `live_transition`, `live_dir`, `live_mode`, `live_autoplay`,
`live_advance_at`, `live_started_at`, `live_updated_at`, `live_seq`, `live_cue`, `live_via`,
`live_by`), `last_played_at`, `archived_at`, `created_by(_name)`, `updated_by(_name)`, timestamps.

`bumper_revisions`: `show_id` (cascade), `version`, `title`, `theme`, `slides`, `reason`
(save|checkpoint|generate|restore|duplicate), `created_by(_name)`, `created_at`. A revision is
written when a PATCH arrives and the latest revision is older than 5 minutes, for every named
checkpoint, on generate and before a restore. Keep the newest 40 per show.

Both tables are first in `WIPE` (content reset). Slides reference records by id inside jsonb, so
the renderer tolerates missing records (a deleted speaker simply falls back to typed text).

### Slides (`BumperSlide`, see the zod schema for limits)

`{ id, kind, label?, refs, fields, items, layers, extras, style, timing, transitionIn, notes?, hidden }`

- `refs`: `eventId` (overrides the show's event), `speakerId`, `speakerIds[]` (panel),
  `teamMemberId`, `teamMemberIds[]` (credits), `publicationId`, `threadIds[]`, `assetId` (photo),
  `assetIds[]` (logos), `rundown` `{index, time, agenda}`. **Rundown and lineup row ids change on
  every save**, so rundown items are found again by time + agenda, then agenda, then time, then index.
- `fields`: template field values (strings support `{tokens}`, see `TOKEN_HELP` in
  `engine/resolve.ts`). Missing or empty means "use the template default", and defaults usually
  come from data (the speaker's name), so edits to a profile flow into every show.
- `items`: rows for list templates (house rules, sponsors, credits, a hand-written agenda).
- `layers`: per-element overrides written by the builder: `box`, `hidden`, `scale`, `rotate`,
  `align`, `tone`, `z`, keyed by the element id the template uses in `<El id>`.
- `extras`: free elements added in the builder (`text`, `image`, `qr`, `shape`, `character`,
  `sticker`, `clock`, `countdown`, `logo`, `line`; props in `engine/extras.tsx`).
- `style`: `accent` (auto = theme), `background` (auto|paper|ink|accent|graph|image|transparent),
  `backgroundAssetId`, `dim`, `mascot` (auto|none|circle|triangle|square|arch|all), `variant`,
  `textScale`.
- `timing`: `autoAdvanceSec` (null = operator paced), `loopToId` (auto-advance jumps there: loops).
- `transitionIn`: 'auto' or a transition key, overriding the pair rules for the way into this slide.

### Theme (`BumperTheme`)

`accent` (event|blue|yellow|red|green), `background` (paper|ink|graph), `mascots`, `motion`
(full|calm|still), `bug` (corner Zemi mark + number), `clock` (corner WIB clock), `safeArea`
(shrink content 5% for projectors that overscan), `qrStyle` (rounded|dots|square), `sound`.

## 4. API

All admin routes need a session (and `x-zemi-csrf: 1` on writes). Show access = `bumperPermissions`.
403 before 404. Every mutation writes an audit entry (`resourceType: 'bumper'`, `resourceId: showId`,
`meta.eventId`), actions `bumper.create|update|archive|restore|delete|duplicate|generate|rotate|revision.restore`.
Playback changes are not audited one by one (too chatty); `bumper.live.start` is logged once per day
per show.

| Method and path | Permission | Behaviour |
|---|---|---|
| `GET /admin/bumpers?status&eventId&search&page&pageSize` | any | `Paginated<BumperShowRow>`, only shows with `run` |
| `POST /admin/bumpers` | `edit` on eventId (or manage) | `BumperShowCreateInput` → `BumperShowDetail` 201 |
| `POST /admin/bumpers/generate` | `edit` on eventId | `create: true` → detail 201, `false` → `BumperGeneratePreview` 200 |
| `POST /admin/bumpers/resolve` | any | `BumperResolveInput` → partial `BumperData` for records picked in the builder |
| `GET /admin/bumpers/sources/events?q` | any | `BumperEventPick[]` (buildable ones first, plus published events for references) |
| `GET /admin/bumpers/sources/speakers?q&eventId` | any | `BumperSpeakerData[]` (event lineup first) |
| `GET /admin/bumpers/sources/publications?q&eventId` | any | `BumperPublicationData[]` (event papers first) |
| `GET /admin/bumpers/sources/team?q` | any | published team members |
| `GET /admin/bumpers/sources/threads?eventId&q` | any | visible discussion threads (open, locked, archived), pinned then score |
| `GET /admin/bumpers/sources/images?eventId&q` | any | event documentation photos, event covers, own uploads (purpose `bumper`), the library with `media.library` |
| `GET /admin/bumpers/:id` | run | `BumperShowDetail` (slides, theme, data bundle, live state) |
| `PATCH /admin/bumpers/:id` | edit | `BumperShowUpdateInput`; 409 `version_conflict` with `details {version, updatedAt, updatedByName}` unless `force`; bumps version, broadcasts `{type:'show'}`; if the live slide was deleted, moves live to the slide now at its position |
| `DELETE /admin/bumpers/:id` | edit | 204, broadcasts `{type:'revoked', reason:'deleted'}` |
| `POST /admin/bumpers/:id/duplicate {title?, eventId?}` | run on source + edit on target | new show, new keys |
| `GET /admin/bumpers/:id/revisions` / `:revId` | run | list / full |
| `POST /admin/bumpers/:id/revisions/:revId/restore {baseVersion}` | edit | saves the current doc as a revision first |
| `GET /admin/bumpers/:id/output` | run | `BumperOutputLinks` (decrypts the control key) |
| `POST /admin/bumpers/:id/output/rotate {which}` | edit | new key(s), broadcasts `revoked` to old clients |
| `GET /admin/bumpers/:id/live` | run | `{ state, presence }` |
| `POST /admin/bumpers/:id/live` | run | `BumperControlInput` → `BumperLiveState` (200) |
| `GET /admin/bumpers/:id/live/stream?cid&client=controller` | run | SSE `BumperStreamMessage` |

Public (token in the path, CORS `*` on GET, `Cache-Control: no-store`, rate limited per ip+key):

| Method and path | Behaviour |
|---|---|
| `GET /public/bumpers/out/:key` | `BumperPublicShow` (hidden slides left out, `canControl: false`), 404 for unknown/rotated keys, 410-style `{error:{code:'archived'}}` 404 for archived shows |
| `GET /public/bumpers/out/:key/stream?cid&obs=1` | SSE (state, show, revoked, ping); registers an `output` presence client |
| `GET /public/bumpers/control/:key` | same payload with `canControl: true` |
| `GET /public/bumpers/control/:key/stream?cid` | SSE incl. `presence`; registers a `dock` client |
| `POST /public/bumpers/control/:key` | `BumperControlInput` → state. No cookies so no CSRF; 240 per minute per key+ip. Companion and Stream Deck POST here directly on the API domain. |

### Playback (the server is the authority)

- State lives in the `live_*` columns; SSE only fans it out. Every change bumps `live_seq`.
- The **server picks the transition** with `pickBumperTransition(from, to, { motion, override })`
  and sends it in the state, so the player, the dock preview and every OBS output play the same one.
- `next`/`prev` use `bumperStep` (hidden slides skipped, no wrap). `fromSlideId` makes them
  idempotent: two clickers pressing next at once move one step. `goto` by `slideId` or 1-based
  `position`. `first`/`last`. `show`/`black`/`clear`/`toggle-black` change `mode` only.
  `autoplay-on/off` pauses auto-advance. `replay` bumps `live_cue` (screens replay the entrance).
  `reset` goes to the first slide, mode show, autoplay on, clears `startedAt`.
- **Auto-advance** is server side: when the current slide has `autoAdvanceSec` and autoplay is on,
  `live_advance_at = now + sec` is stored; an in-process ticker (500 ms) advances with
  `bumperAutoNext` (loop target or next) and `via: 'auto'`. On boot the ticker reloads pending
  deadlines. Manual control resets the deadline for the new slide.
- `serverNow` goes with every state message; screens correct countdowns by the offset.
- Presence: each SSE connection registers `{cid, kind, obs, agent}` in memory (agent parsed from
  the user agent: "OBS 32 (Chromium 127)" when it contains `OBS/`); counts are published as
  `{type:'presence'}` to controllers and docks, and `outputs` goes into list rows (`live.onAir`).

### Generating a show from an event (`generator.ts`, pure, unit tested)

Input `BumperGenerateInput` + the event (admin audience, drafts included) + next event + site. Order:

1. Pre-show loop (if `preshow`): `standby` (auto 20 s) then `agenda` (auto 15 s) then
   `house-rules` (if `houseRules`, auto 15 s), the last one loops to standby.
2. `welcome`, then `agenda` (manual) if `agenda` and the rundown has items.
3. Host (`host`): `auto` = the first `moderator` on the lineup, else the first team member whose role
   mentions host/MC, else skip; `speaker|team` by id; `name` typed; `none` skips. Kind `mc`.
4. Walk the **rundown** when it exists (else the lineup order: keynotes first, then speakers, then
   panelists as one panel). For each item, classify its agenda text (case-insensitive):
   `opening|remarks|sambutan|welcome speech` → `opening` (person = item speaker, or the `opening`
   pick, or the first keynote); `keynote` → `keynote`; an item with a speaker who is a lineup
   speaker/keynote → **speaker block**: `up-next` (item), `speaker` (or `keynote`), `paper` for each
   event publication authored by that speaker (if `papers`; else `talk-title` when the lineup has a
   talk title), `thanks-speaker` (if `thanks`), plus `qna` after it when `qna = 'after-each'`;
   `q&a|q and a|questions|tanya jawab|diskusi|discussion` → `qna` + `featured-question`;
   `break|coffee|istirahat|ishoma|networking|lunch` → `break` (auto 30 s, loops with an `up-next`
   of the next item); `photo|foto` → `photo`; `panel` → `panel` with the panelists;
   `prayer|doa|anthem|indonesia raya|silence` → `ceremony` with the matching preset;
   `closing|wrap|penutup` → skipped here (the closing block comes last); anything else → `section`
   with the agenda as the title.
5. `qna = 'end'` adds `qna` + `featured-question` before the closing if the rundown had none.
6. `photo` (if not yet), `credits` (if `credits`), `next-event` (if `nextEvent` and one exists),
   `closing` (if `closing`).
7. Theme: `accent: 'event'`; merged with `theme` from the input. Title: "Zemi #98 bumpers" or the
   event title. Notes explain choices in plain words ("No rundown yet, so we followed the lineup.").

## 5. Web engine (`components/bumpers/`)

```
api.ts                   typed admin + public calls, query keys, SSE URLs, mergeData, newBumperId
engine/gsap.ts           GSAP + Flip, MorphSVG, DrawSVG, CustomEase, MotionPath, Physics2D, ScrambleText
                         eases BE.out (zemiOut), BE.inOut, BE.pop, BE.back... never rely on gsap defaults
engine/palette.ts        hex tokens, slideAccent, slideBackground, slideColors, toneHex, shapeForName
engine/types.ts          TemplateDefinition, FieldDef, ItemsDef, ResolveCtx, BumperPerson, EnterKind, IdleKind
engine/resolve.ts        buildResolveCtx (data resolution, fields with defaults, {tokens}), rundown helpers
engine/context.tsx       useSlide(), useEnter(fn), useIdle(fn), ElProvider
engine/element.tsx       <El id label box enter order delay idle morph align valign tone lockAspect locked>
engine/fit-text.tsx      <FitText max min font weight casl lineHeight valign uppercase>, fontStyle(), FONT_*
engine/choreography.ts   buildEntrance / prepareEntrance / settle / startIdle / buildExit
engine/slide-view.tsx    <SlideView slide theme data showEventId mode autoplay ref> + SlideHandle
engine/stage.tsx         <BumperStage> fits the 1920x1080 canvas into any box, useStage()
engine/extras.tsx        free elements renderer + defaultExtraProps/defaultExtraBox/EXTRA_LABELS
engine/clock.tsx         BumperClockProvider (server offset), useBumperNow, useNowFn
parts/character.tsx      <BumperCharacter shape mood lookX lookY>, characterMarkup(), charAnim.*
parts/shapes.tsx         BrandShape, StaticMark, Wordmark, BumperImage, BumperAvatar (photo clipped to a shape)
parts/qr.tsx             <BrandQr value style color logo> (white plate, quiet zone, H with the logo), QR_TONES
parts/backdrop.tsx       <Backdrop kind colors image dim floaters>, ShapeRow
parts/countdown.tsx      <Countdown to done variant size>, countdownTarget(HH:mm or ISO)
parts/stickers.tsx       STICKERS (coffee, mic, paper, plane, clock, spark, heart, star, pin, camera, bulb,
                         wifi, silent, rec, question, chat, trophy, calendar, laptop, flag, door, food)
parts/confetti.ts        stageConfetti(root, {x, y, count...}) timeline (brand shapes, Physics2D)
parts/bug.tsx            corner bug and clock
templates/kit.tsx        defineTemplate, f.* field builders, usePerson, useMascots, Eyebrow, Headline, Line, Portrait
templates/<cat>/<kind>.tsx   one file per template (default export)
templates/index.ts       TEMPLATES registry, getTemplate
transitions/types.ts     TransitionContext, TransitionDef (read the contract comment)
transitions/helpers.ts   mulberry, div, svg, overlaySvg, shapePath, character, cleanRoots, mirror
transitions/director.tsx <BumperDirector slides theme data showEventId target mode replay initial onTransition>
transitions/library/<key>.ts one file per transition (default export)
transitions/index.ts     TRANSITIONS registry, getTransition
builder/store.tsx        BuilderProvider + useBuilder (doc, undo/redo, selection, autosave, conflicts)
builder/factory.ts       newSlide, cloneSlides, SLIDE_BLOCKS
lab/                     sample fixtures + the lab page
```

### Template rules

- Author on the 1920x1080 canvas in px. Keep text inside x 96..1824, y 64..1016 (title-safe). The
  corner bug sits at top-left (x 64, y 48, about 300x50): leave that corner free or set `noBug`.
- Styling: inline styles and CSS modules with **hex colors from `palette.ts`** (`ctx.colors.*`).
  No Tailwind classes, no CSS variables for color, no `color-mix`. OBS 31+ ships Chromium 127, so
  modern CSS is fine, but slides must look identical everywhere.
- Every visible element goes in an `<El id>` with a stable id and a friendly `label`, so the
  builder can select, drag, resize, hide and restyle it. Text goes in `<FitText>`.
- Read everything from `useSlide()` (`ctx.text('title')`, `ctx.person`, `ctx.event`, `ctx.colors`,
  `ctx.items`...). Field defaults come from data: `default: (ctx) => ctx.person?.name ?? ''`.
- All four backgrounds must look good: paper, ink, accent (all four accents; yellow needs ink text:
  use `ctx.colors.fg`/`onAccent`), graph, and a photo background. Test with the lab's switches.
- Animations: `enter` on `<El>` for the basics, `useEnter((tl, root, {at, calm}) => ...)` for the
  bespoke choreography (always wrap times with `at()`), `useIdle` for loops (characters blink and
  sway, shapes drift; return a cleanup). GSAP only, never CSS keyframes (a machine with reduced
  motion would flatten the broadcast). Respect `calm` (smaller, slower). Nothing may loop fast or
  flash more than 3 times a second.
- Characters: `BumperCharacter` + `charAnim` (blinkLoop, cheer, squash, hop, idle, look, rollIn).
  Use `useMascots(defaultCast)` so the operator's mascot choice and the theme switch work.
- Morph keys for magic move: `person:<id>:photo`, `person:<id>:name`, `person:<id>:talk`,
  `event:<id>:title`, `pub:<id>:title`, `qr:<url>`, `rundown:<index>`. Put the same key on the
  element that means the same thing in another template.
- `describe(ctx)` names the slide in the rail ("Rani Kusuma"); `headline(ctx)` is the short word the
  word train, stamp and scramble transitions flash.
- Variants (`style.variant`) give 2 or 3 genuinely different layouts. Presets give one-click
  starting points in the gallery.
- Empty data never looks broken: a missing speaker shows a friendly placeholder ("Pick a speaker"),
  a missing photo shows initials on their shape.

### Transition rules

Read the contract comment in `transitions/types.ts`. In short: build curtains in `ctx.overlay`,
call `ctx.show()` when the new slide should be visible and `ctx.hide()` for the old one, put a
`'reveal'` label where the new content should start entering, end with the overlay empty or
invisible and `cleanRoots(ctx)`, work backwards (`ctx.dir`), use `ctx.rand()` for randomness, keep
0.8 to 2.4 s at speed 1, divide durations by `ctx.speed`, and survive `tl.progress(1)` at any
moment. Only transforms, opacity, clip-path and SVG attributes (no layout thrash, no big blurs).

## 6. Template catalog

Each entry: what it shows, layout, variants, motion. Defaults in parentheses come from data.
"Cast" is the default characters (`useMascots`).

**Before we start**
- `standby` Starting soon. Big live countdown to the start (`event.startsAt`; field `to` overrides),
  "We start in" eyebrow, the title, date, room, and a cheeky line field ("Grab a coffee, we'll wait").
  When the countdown hits zero it says "Any second now". Cast: all four on a bench, dozing (sleepy
  eyes) and waking up one by one as the countdown drops under a minute. Variants: countdown-hero,
  split (title left, clock right). Loops well.
- `countdown` A big timer to a time of day or N minutes from when the slide appears (field
  `minutes`, or `to` HH:mm), label ("We start in", "Back in", "Talk time left"), done text. Styles:
  big mono digits, or flip cells. A progress arc (clock wipe) shrinks as time runs out.
- `house-rules` Housekeeping. Title ("A few house rules"), 3 to 6 items with sticker icons: phones
  on silent (`silent`), the session is recorded (`rec`), questions at zemi.ac/q (`question`), Wi-Fi
  (`wifi`), coffee on the left (`coffee`), restrooms (`door`). Items pop in one by one, each icon
  wiggles once; idle: a highlighter slowly sweeps from one rule to the next.
- `wifi` Network name and password in huge mono, a Wi-Fi join QR (`WIFI:T:WPA;S:<ssid>;P:<pw>;;`),
  "Scan to join". Fields ssid, password, security (WPA/WEP/none).
- `sponsors` Thanks to: a grid of logos (items with `assetId`, or `refs.assetIds`), a title, an
  optional line. Logos flip in on a stagger; idle: a gentle shine sweep.

**Opening**
- `welcome` (built, reference template) Welcome to Zemi #n, the title loosening up, date and room,
  the four characters dropping onto a shelf and cheering, confetti. Variants split, center.
- `event-title` Event poster: 4:5 cover (or a shape collage when there is none) framed with the
  accent, the title, "Zemi #98", date, time, room, mode chip (hybrid/online), tags. Variants poster
  left, poster right, full-bleed cover background.
- `agenda` Today's rundown: time (mono) + agenda + speaker chip per row, up to 9 rows (two columns
  beyond 6). Field `highlight`: auto (the item on now by the clock), none, or a row number. The
  highlighted row gets a marker swipe and a tiny character pointing at it. Rows slide in on a
  stagger; morph key `rundown:<i>` on each row.
- `up-next` One rundown item (`refs.rundown`; default: the next item by the clock): "Up next" +
  time, the agenda in huge type, the speaker's portrait and name, a clock face whose hand sweeps to
  the time. Morph key `rundown:<index>` on the title.
- `mc` Your host: portrait, "Your host today", name, role, a microphone sticker; cast bops next to
  the mic. Person = speaker or team member or typed name.
- `opening` Opening remarks: "Opening remarks by" + name + position (Head of the lab), dignified
  layout (more whitespace, slower), accent underline draws in.
- `ceremony` A moment: icon + title + line. Presets: Opening prayer ("Let's pray, each in our own
  way."), National anthem ("Please rise for Indonesia Raya."), A minute of silence, A round of
  applause (confetti, clapping squash loop), Ice breaker. Calm motion by default except applause.

**Talks**
- `keynote` Grand: a huge "Keynote" word as a watermark, the portrait bigger than the speaker
  template, a halo of the four shapes orbiting slowly, name + position + talk title. Morph keys as
  speaker.
- `speaker` (built, reference template) Portrait in their shape + offset accent shape, a character
  peeking from behind, "Speaker 2 of 3", name loosening, role · affiliation, the talk on a
  graph-paper card. Variants left, right, center.
- `paper` Publication: type chip (Conference paper), the title big, authors as avatar chips with the
  speaker ones highlighted, venue + year, DOI in mono, the cover or a stack-of-paper illustration,
  optional QR to the publication page (field `showQr`). Morph key `pub:<id>:title`.
- `talk-title` The talk title huge (split words), the speaker's small portrait and name underneath,
  a paper-plane sticker that flies in and lands on the title's last line.
- `panel` 2 to 6 people (`refs.speakerIds`, default: lineup panelists) as portraits in their shapes
  on a row, names and orgs under them, the topic as the title. Portraits bounce in like the
  characters.
- `lineup` Everyone speaking today (lineup, moderator last), a grid of portraits with names, role
  chips, talk titles; the four characters as the frame corners.
- `thanks-speaker` "Thank you, Rani!" (first name), the portrait smaller with its shape, "Give it up
  for" eyebrow, an applause cue ("Clap clap"), characters clapping (fast squash loop in bursts),
  confetti. Optional line: "Slides and paper at zemi.ac/...". Morph keys person photo/name.
- `quote` A line worth repeating: big quote marks drawn in (DrawSVG), the quote in display type
  with a highlighter swipe on a chosen word (field `highlight`), attribution with a small portrait.

**Questions**
- `qna` Q and A: "Your turn." Huge `zemi.ac/q` (from `site.qnaShort`) and the QR (`site.qnaUrl`,
  or the field `url`), "Scan or type, ask anything, we'll pick a few", Q (the circle character)
  holding up the QR (Q sits under the QR and lifts it), the other characters hopping around it.
  The QR is big (at least 420px), on its white plate. Variants QR right, QR center.
- `featured-question` Questions from the discussion page (`refs.threadIds`, 1 to 3): the title as
  a big speech bubble, the asker's label ("Tegar #2231"), votes as a little counter; with 2 or 3
  they stack like cards. Default: the top voted thread of the event.
- `prompt` Talk to your neighbor: a big question, "2 minutes" timer chip (optional countdown),
  two characters facing each other with alternating thought dots.
- `feedback` Tell us how it went: title, line, QR to the `url` field, sticker hearts.
- `register` Save your seat: this event or the next one (`refs.eventId`), QR to its page
  (`event.url`), title, date, "Free, takes 20 seconds".

**Breaks**
- `break` Coffee break: "Back at 14:50" (field `until` HH:mm or `minutes`), live countdown, a big
  coffee cup illustration whose steam curls loop, the next item after the break. Loops.
- `brb` Be right back: "Hang tight, we're fixing the mic." Characters tinkering: the square
  bonks the circle, a spinning gear-like shape made of the four shapes. Field `reason` presets
  (mic, projector, internet, a short pause).
- `photo` Group photo: "Squeeze in!" with a 3, 2, 1 countdown (field `countdown` on) and a flash
  at zero (white flash overlay, no more than once), a camera sticker, the characters squeezing
  together into frame. Field `hashtag`.

**Closing**
- `awards` Award: the award name ("Best question of the day"), the winner (person or typed name)
  with portrait, a trophy sticker that drops in, a stamp "Winner", confetti cannons.
- `credits` Rolling credits: sections (host, speakers, moderator from the lineup; organizers from
  `refs.teamMemberIds` or published team; stream crew from items), scrolling upward slowly; the
  characters sit on the last line. Field `speed`.
- `next-event` Next Friday: the next published event (`data.nextEventId`, or `refs.eventId`),
  its number, title, date, speakers' avatars, a register QR. "See you next Friday".
- `closing` Thanks for coming: "That's a wrap", the event number, stats from `site.stats`
  optionally ("98 Fridays so far"), socials, the four characters waving by bouncing, a slow
  confetti drizzle. Variants center, split.
- `socials` Stay in touch: site address big, social handles with link icons (from `site.socials`
  or items), a QR to the site.

**Utility**
- `section` Chapter card: "Part 2" eyebrow + a title in giant type + a number in mono.
- `announcement` Headline + a few lines of body + an optional sticker; presets: Recording notice,
  Lunch is served, Room change, Next week's venue.
- `image` One photo full-bleed (`refs.assetId`) with an optional caption strip, a slow Ken Burns
  zoom as idle.
- `lower-third` Transparent background: a name strip (person name + role/org) in the bottom
  left safe area with a shape bullet; slides in from the left, the shape spins once. Variants
  left, right, center. `overlay: true`, `noBug: true`. Plays well on top of a camera in OBS.
- `custom` Blank canvas: only the backdrop; everything comes from extras. A gentle hint text in
  edit mode only ("Add text, images, QR codes and characters from the toolbar").
- `blank` Black (or clear with background transparent). `noBug`, no floaters.

## 7. Transition catalog

Storyboards. Timings are at speed 1. "Reveal" is where the incoming entrance starts. Every one of
these must be backwards-safe and progress-safe (see rules).

- `curtain-call` The four characters roll in from both sides (circle rolls, square tumbles, triangle
  hops, arch bunny-hops), each stretching into a tall colored panel as it reaches its column; the
  four panels close the screen like a curtain (0.7 s), a beat with their eyes blinking on the
  curtain, then they peel away upward one by one (0.6 s) revealing B. Reveal at the first peel.
- `q-iris` Q rolls in from the edge to the center (0.45 s), grows until it covers the screen (blue
  full screen with two giant eyes), blinks once (the cut happens during the blink), then the
  circle shrinks to a point revealing B (iris out, 0.6 s). Reveal as the iris opens.
- `eyelids` The screen goes sleepy: two ink lids close from top and bottom with a soft curve
  (0.5 s), two little glinting eyes appear closed in the dark, then snap open with the lids (0.45 s)
  and a tiny squash, B is there. Reveal on the open.
- `shape-morph` A giant shape grows from the center (circle), then morphs (MorphSVG) through
  triangle, square and arch while rotating and changing color (0.9 s), covering the screen, then the
  arch splits open like doors revealing B. Reveal at the split.
- `grid-mosaic` A 12x7 grid of tiles in the brand colors flips in (rotateY) from an origin corner
  (seeded) with a diagonal stagger, briefly showing tiny shapes on each tile, then flips out the
  other side showing B. Reveal at the first tile out.
- `magic-move` Elements with the same `data-morph` key fly from their old box to their new one
  (FLIP with scale and position, 0.8 s zemiInOut, text crossfades); everything else on A fades
  and drifts away, everything else on B enters with its entrance; the background color cross-fades.
  Reveal at 0.1 s. With no shared keys it falls back to a crossfade with a slight zoom.
- `paper-plane` A: the slide scales down to a sheet (0.35 s), folds in half twice (rotateX/Y with
  perspective), becomes a paper plane (SVG) that loops along a MotionPath and zips off screen,
  leaving a dashed trail that wipes B in behind it. Reveal as the trail passes the middle.
- `coffee-pour` Coffee rises from the bottom as two wavy SVG layers (different speeds, brand
  yellow over ink), covers the screen (0.7 s), a few bubbles pop, then drains down/away revealing B
  (0.6 s). Reveal while draining.
- `bridge-arc` Five concentric arches (green outermost, then yellow, red, blue, ink) sweep from the
  left like a rainbow bridge building across the screen (0.8 s), then the arches fall away
  downward to the right revealing B. Mirrored for dir -1. Reveal as they fall.
- `block-stack` Yellow rounded squares (and a few of the other shapes) drop from the top with
  bounce and stack up in columns until the screen is full (0.9 s), then the stack tumbles off to the
  side with Physics2D, revealing B. Reveal as the tumble starts.
- `hunch-shutter` A camera shutter: 8 red rounded triangles rotate in around the center and close
  (0.35 s), a white flash frame (once), then they rotate open (0.4 s) on B. Reveal at open.
- `confetti-pop` A white-to-accent radial flash pops from the center (scale 0 to cover, 0.35 s),
  a burst of shape confetti fills the screen, B pops in underneath with a squash scale. Reveal at
  the pop. Keep the flash soft (no strobe).
- `split-doors` The screen is cut into 6 horizontal bands; bands slide alternately left and right
  (0.7 s) carrying A away while B's bands slide in from the opposite sides, a thin accent line on
  each seam. Reveal at 0.3 s.
- `portal-zoom` A circle opens from a seeded point (or the main morph element of B) as a clip-path
  on B (circle 0% to 150%, 0.9 s zemiInOut) with a ring of the accent color riding its edge, while A
  scales up slightly (1.08) and dims. Reveal at 0.15 s.
- `stamp` A big rubber stamp with B's headline (in a rounded rectangle, ink border, slightly
  rotated) slams from 3x scale onto the center (0.25 s, back.out), the screen shakes 3 px twice, the
  ink "splashes" (a few dots), then the stamp lifts and fades as B appears behind. Reveal on lift.
- `blinds` 10 vertical slats rotate (rotateY 90) with a stagger from left to right, each showing
  the accent color on its edge, closing A and opening onto B (0.9 s). Reveal at the midpoint.
- `page-turn` A turns like a notebook page (rotateY -180 around the left edge with perspective
  2200, a shadow gradient sweeping across), its back side is graph paper, landing on B underneath.
  B must be under A (z order). Reveal at 0.25 s.
- `ribbon-sweep` Four thick diagonal ribbons (blue, red, yellow, green) streak across at 20 degrees
  with slightly different speeds (0.6 s), covering the screen, the last one pulls B in with it.
  Reveal as the last ribbon passes.
- `scramble-cut` A's text elements scramble (ScrambleText) into noise, glitch bars (thin brand
  color bars) slide in, a hard cut to B whose headline resolves out of the same noise. Reveal at
  the cut. Short (0.8 s).
- `clock-wipe` A clock hand sweeps 360 degrees from 12 o'clock around the center, and B is
  revealed behind the hand as a conic sector (a conic-gradient mask or an SVG pie clip), with small
  "13:14" to "13:15" ticking digits near the hub. Reveal at 0.1 s. 1.0 s.
- `ink-flood` Five ink blobs (gooey metaballs, SVG circles with a goo filter) spread from seeded
  points and merge to cover the screen (0.7 s), then shrink back into one drop that falls off the
  bottom, revealing B. Reveal as they shrink.
- `gravity-drop` A tilts slightly and falls down off the screen with gravity (0.55 s, power2.in,
  small rotation), while B drops in from the top and lands with a bounce and a squash of its
  content. Reveal on landing.
- `halftone` A grid of circles (48 px pitch) grows from 0 to overlapping (covering, 0.55 s) in a
  radial wave from the center, then shrinks away on B (0.55 s). Dots in the incoming accent color.
  Reveal while shrinking.
- `word-wipe` B's headline in giant display type (300 px, CASL 1) rushes across from right to left
  as a solid accent band carrying the word, wiping A away and leaving B. Reveal as the band's
  tail passes the middle.
- `crossfade` Calm fade (built). `cut` Instant (built).

Pair rules live in shared `pickBumperTransition` (so the server and the builder agree). Summary:
per-change override, the slide's `transitionIn`, motion `still` (crossfade), overlays (crossfade),
shared subject (same speaker, agenda to up-next, Q and A to question: magic move), special pairs
(standby to welcome: wake up; paper to thanks: paper plane; thanks to the next speaker: rainbow
bridge; speaker to paper: page turn; break to anything: clock wipe), then by destination (into Q
and A: Q iris, into a break: coffee pour, into the photo: shutter, into the closing: curtain
call...), seeded by the pair's ids, and `calm` motion maps to the calm set.

## 8. Builder (`/admin/bumpers/[id]`)

Wide screens (1280+): top bar, left rail (280 px), canvas in the middle, inspector on the right
(360 px). Tablets: rail as a horizontal filmstrip on top, inspector as a bottom sheet. Phones:
filmstrip + canvas + sheet tabs (Content, Style, Timing); dragging elements still works with
touch, fine positioning with the numeric fields.

- **Top bar**: back to the library, inline title, event chip, save status ("Saved", "Saving...",
  "Couldn't save, retrying", conflict banner with "Keep mine" / "Load theirs"), undo/redo,
  History (revisions sheet: preview, restore, named checkpoints), Theme (sheet: accent, background,
  mascots, motion, bug, clock, safe area, QR style), OBS (the setup guide), Controller, **Play**.
- **Rail**: sortable (dnd-kit, keyboard: Space lift, arrows move, Space drop), live thumbnails,
  index, label (`describe`), auto-advance and loop badges, hidden state, multi-select (shift/cmd),
  context menu (duplicate, hide, delete, move to top/bottom, make a loop). Between two slides a
  small chip shows the planned transition (`planBumperTransitions`) with a preview on hover and a
  picker on click (sets the next slide's `transitionIn`). "+" buttons between slides open the
  gallery at that position.
- **Gallery** (dialog): categories, search, live previews of every template rendered with the
  show's data (thumb mode, hover plays the entrance), presets, and the multi-slide blocks
  (`SLIDE_BLOCKS`: speaker block asks for a speaker and adds intro, paper, thanks).
- **Canvas**: the selected slide in edit mode inside `BumperStage`; click selects an element
  (`[data-el]`), drag moves, 8 handles resize (shift keeps aspect; `data-lock-aspect` always does),
  snap guides to the canvas center/thirds/safe area and to other elements' edges, arrow keys nudge
  (shift = 10 px), Delete removes an extra or hides a template element, double-click on text
  focuses its field in the inspector, Escape deselects. Toolbar: add text, image, QR, shape,
  character, sticker, clock, countdown, logo, line; zoom to fit; toggle guides; "Play this bumper"
  (live preview of its entrance) and "Play from previous" (the transition into it).
- **Inspector** tabs: *Content* (template fields generated from `FieldDef`s with "from the profile"
  hints, reset to default, token helper; data pickers per `BUMPER_KIND_META.refs`: event, speaker
  or team person, speakers list, publication, rundown item, threads, image, images; items editor
  for list templates), *Style* (variant cards, accent, background incl. photo, mascot, text size),
  *Timing* (manual or auto after N s, loop back to a slide, transition into this slide with
  previews), *Element* (when one is selected: x/y/w/h, rotation, align, tone, size, hide, reset to
  template, bring forward/back, delete for extras, and the extra's own props), *Notes* (operator
  notes shown in the controller). QR fields show a live "Scans fine" check with the
  `barcode-detector` polyfill.
- Keyboard: mod+z / shift+mod+z, mod+d duplicate, Delete, mod+s save now, mod+enter play,
  `[`/`]` previous/next slide, `n` new slide (gallery).

## 9. Library (`/admin/bumpers`) and the event tab

- Header: "Bumpers" + "New show" menu: Generate from an event (dialog below), Blank show (pick an
  event or none with `bumpers.manage`), Starter kits (Classic Friday, Keynote special, Panel day,
  Thesis practice, Break loop, Tech trouble kit).
- Tabs Active / Archived, event filter, search, a grid of show cards: animated cover (first slide,
  plays its entrance on hover), title, event chip, bumper count, auto runtime, updated relative,
  an "On air" badge when outputs are connected, actions (open, play, controller, duplicate, archive
  or restore, delete with the title typed).
- **Generate dialog**: event picker (buildable events, next Friday first), toggles for every
  generator option with plain descriptions, host/opening pickers, Q and A mode, then a live
  preview strip of the resulting bumpers (from `create: false`) with the notes; "Create show".
- Event workspace tab "Bumpers" (`bumpers.run`): this event's shows, generate, play, controller.

## 10. Player, controller, OBS

- **Player** (`/admin/stage/bumpers/[id]/play`): the show fills the browser window (not the
  Fullscreen API; an optional button offers true fullscreen). Right half click or tap, ArrowRight,
  Space, PageDown, Enter: next. Left half, ArrowLeft, PageUp, Backspace: previous. Home/End,
  number + Enter to jump, `g` grid of all slides to jump, `b` black, `c` clear, `r` replay, `p`
  pause auto-advance, `f` fullscreen, `?` help, Esc exits (to the builder). A HUD fades in on mouse
  move (position, current and next thumbnails, transition name, auto-advance countdown, connected
  outputs) and hides after 2 s. "Drive the OBS output" is on by default when the principal can
  run the show: navigation posts to `/live` and the screen follows the server state (so the room
  screen and OBS stay identical); off = local rehearsal. Screen Wake Lock while open. The cursor
  hides after 2 s idle.
- **Controller** (`/admin/stage/bumpers/[id]/control`): dark control room: current (large, live),
  next (and previous) previews, a filmstrip of every slide (click to jump, the current one
  highlighted, hidden ones dimmed), big Previous/Next buttons, Black/Clear/Show, autoplay toggle,
  replay, "Cut" (next change without transition), elapsed time since the show started, a clock,
  the slide's operator notes, the auto-advance countdown, presence (outputs and docks connected,
  their agents), SSE connection dot. Same keyboard as the player. Works on tablets.
- **OBS output** (`/bumpers/out/[key]`): the director on a 1920x1080 stage that fills the source,
  transparent where the slide is clear. Reconnects its SSE forever with backoff; refetches the show
  on `{type:'show'}`; on `revoked` shows a quiet card ("This link was replaced. Grab the new one in
  Zemi Studio."). Replays the current entrance when OBS makes the source active
  (`obsSourceActiveChanged`). No console errors. `?bg=black` paints black under clear slides,
  `?safe=1` draws title-safe guides for setup.
- **Dock** (`/bumpers/dock/[key]`): a compact controller for an OBS custom browser dock (320 to 600
  px wide) and phones: current + next thumbnails, big Prev/Next, a numbered list to jump, black and
  clear, connection state. Keyboard works when the dock is focused.
- **OBS setup guide** (dialog from the builder, controller and library): step by step with
  illustrations: 1) Sources, +, Browser; paste the output URL; width 1920, height 1080; FPS 30 or
  60; keep "Shutdown source when not visible" and "Refresh browser when scene becomes active" off;
  keep the default custom CSS (it makes the page transparent). 2) Optional: View, Docks, Custom
  Browser Docks, name "Zemi bumpers", paste the dock URL. 3) Test: the guide shows "OBS connected"
  live when the output connects (presence). Also: interacting with the source (right click,
  Interact), a Companion / Stream Deck recipe (HTTP POST to the control API URL with
  `{"action":"next"}`), rotating links if one leaks, and "OBS 31 or newer".

## 11. Performance and accessibility

- One director per page; at most two slides mounted during a transition. Thumbnails are static
  (`thumb` mode, no GSAP, no idle). The gallery renders previews lazily (IntersectionObserver).
- Fonts: wait for `document.fonts.ready` (the director and `SlideView.ready` do) before the first
  entrance so text never reflows mid-animation.
- Admin UI: keyboard reachable, visible focus, labelled controls, live region announcing the
  current bumper in the player and controller, reduced motion in admin chrome (not in the output).
- Every screen works at 360 px phones, tablets, laptops and 2560 px; no horizontal page scroll.
