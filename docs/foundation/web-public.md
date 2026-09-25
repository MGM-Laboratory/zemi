# Web public foundation

The design system, brand, motion, 3D core, shell and data layer for the public site
(`apps/web`). Page teammates build home, about, events, speakers, publications, contact and
tickets on top of this. Everything here is live on **`/styleguide`** (noindex): if you are not
sure how something looks or behaves, open it there first.

```
src/app/(public)/layout.tsx          shell: loader, announcement, nav, smooth scroll, curtain, footer, cursor, toaster
src/app/(public)/page.tsx            TEMPORARY home (replace it)
src/app/(public)/styleguide/         living styleguide (+ _components/ fixtures and demos)
src/app/api/revalidate/route.ts      POST { secret, tags } -> revalidateTag(tag, { expire: 0 })
src/app/robots.ts                    disallows /admin, /api, /tickets, /t, /styleguide
src/app/providers.tsx                React Query + nuqs NuqsAdapter
src/styles/public.css                html-level public rules (cursor hiding, sonner theme)
src/components/brand/                ShapeIcon, ZemiMark, ZemiWordmark, ZemiLogo, Character, SiteLoader
src/components/motion/               SmoothScroll, SplitReveal, CaslHeading, Magnetic, Marquee, Reveal, Parallax,
                                     CountUp, TickingDigits, HighlightSwipe, shapeConfetti, gsap
src/components/public/shell/         PublicNav, MobileMenu, NextEventPill, PublicFooter, Cursor, PageTransition,
                                     AnnouncementBar, ScrollProgress, SkipLink, FridayClock, PublicSiteProvider
src/components/public/ui/            Button, Chip, StatusBadge, SectionHeader, Card, Avatar, Field/Input..., Dialog,
                                     Sheet, Tooltip, EmptyState, TextLink
src/components/public/media/         ZemiImage, BlocksRenderer
src/components/three/                SceneCanvas, Character3D, ModelProp, Fit, StudioLights, ShaderBackdrop, DistortImage
src/lib/api/                         server.ts (Server Components), client.ts (browser), errors.ts, tags.ts
src/lib/hooks/                       pointer, reduced motion, viewport, media query, now/status, live event, scroll
src/lib/utils.ts                     cn(), clamp, lerp, mapRange, damp
```

Every folder has an `index.ts` barrel (`@/components/brand`, `@/components/motion`,
`@/components/public/ui`, `@/components/public/shell`, `@/components/public/media`,
`@/components/three`, `@/lib/hooks`). There is deliberately **no** `@/lib/api` barrel: import
`@/lib/api/server` or `@/lib/api/client` explicitly so server code never reaches the browser.

---

## 1. Page conventions

- **The nav overlays the page.** It is sticky with a negative bottom margin, so your first
  section starts at the very top, under it. Give the first section top padding, for example
  `pt-[calc(var(--nav-h)+48px)]` (`--nav-h` is 72px).
- Layout helpers from `globals.css`: `.container-page` (max 1680px + page margin),
  `--section-y` (section padding), `--gutter`, `.display`, `.text-display-xl|l|m`, `.text-title`,
  `.text-body-l`, `.mono`, `.label`, `.graph-paper`.
- **Dark sections**: add `data-nav-theme="dark"` to any inverse (`bg-surface-inverse`) section.
  The nav flips to paper tone while that section is under it. The footer already does this.
- **Cursor labels**: `data-cursor="play|drag|open|register"` on any element shows a labelled
  brand shape instead of the dot (fine pointers only). `Button` and `Card` take a `cursor` prop.
- **Opt out of the route curtain**: `data-transition="off"` on a link, or `data-no-transition`
  on a container. Use it for links that only swap a tab or use `replace`.
- **Scrollable areas inside the page** (carousels, code, tables, dialogs) need
  `data-lenis-prevent` so Lenis leaves the wheel alone. Dialog, Sheet and the mobile menu
  already do it and pause Lenis with `useScrollLock(open)`.
- Copy: casual, short, no em or en dashes anywhere (DESIGN.md section 10).
- Site settings and the next event are fetched once in the layout. In client components use
  `useSite()` (general, contact, seo slice) and `useNextEvent()` from
  `@/components/public/shell`. In server components call `getSiteOrDefaults()` again (fetches
  are deduped and cached).

## 2. Data layer

### Server (`@/lib/api/server`, Server Components, route handlers, generateMetadata only)

All helpers call `API_INTERNAL_URL`, cache with `next: { revalidate: 30, tags }` and **never
throw**. When the API is down they log one `console.warn` and return a fallback.

| function | returns | notes |
|---|---|---|
| `getSite()` | `PublicSite \| null` | tag `site` |
| `getSiteOrDefaults()` | `PublicSite & { isFallback }` | schema defaults when the API is down. The shell uses this. |
| `getEvents(params)` | `PageResult<EventCard>` | params: `when, search, tag, speaker, year, page, pageSize`. Empty page with `unavailable: true` when down |
| `getNextEvent()` | `EventCard \| null` | next upcoming or live |
| `getEvent(slug)` | `Lookup<EventDetail>` | `{kind:'found'\|'redirect'\|'missing'\|'unavailable'}` |
| `getSpeakers(params)` / `getSpeaker(slug)` | `PageResult<SpeakerListItem>` / `Lookup<SpeakerPublic>` | |
| `getPublications(params)` / `getPublication(slug)` | `PageResult<PublicationCard>` / `Lookup<PublicationDetail>` | params: `search, type, year, tag, speaker, sort` |
| `getTicket(token)` | `Lookup<Ticket>` | `no-store` |
| `unwrapLookup(lookup, '/events')` | `T \| null` | redirect -> `permanentRedirect`, missing -> `notFound()`, unavailable -> `null` |
| `publicApiUrlServer(path)` | `string` | absolute URL on the public API origin |
| `apiGet<T>(path, opts)` | `ApiResult<T>` | low level, for anything not covered |

```tsx
export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = unwrapLookup(await getEvent(slug), '/events');
  if (!event) return <ApiUnavailable what="this Friday" />;
  ...
}
```

Detail fetches are tagged with the collection tag (`events`, `speakers`, `publications`)
because the id is unknown before the fetch, so **the API must send the collection tag on item
edits too** (see Requests).

### Browser (`@/lib/api/client`)

`register(eventId, input)`, `cancelTicket(token)`, `fetchTicket(token)`, `sendContact(input)`,
`heartbeat(eventId, viewerId)` (never throws), `react(eventId, kind)`, `getViewerId()`,
`publicApiUrl(path)`, `ticketUrls(token)` (qr svg/png, calendar), `eventUrls(eventId)`
(calendar, SSE live, HLS). JSON calls go to same-origin `/api/v1`; media, HLS, SSE and `.ics`
go to `NEXT_PUBLIC_API_PUBLIC_URL`.

Errors are `ApiError` (`status`, `code`, `message`, `details`, `isValidation`, `isNetwork`,
`isRateLimited`, `fieldErrors()` -> `{ email: 'That email looks off...' }`). `status 0` means
the request never reached the API. `errorMessage(e)` gives a friendly sentence for anything.

```tsx
try { await register(event.id, values); }
catch (e) {
  if (isApiError(e) && e.isValidation) Object.entries(e.fieldErrors()).forEach(([k, m]) => form.setError(k as never, { message: m }));
  else toast.error(errorMessage(e));
}
```

### Revalidation

`POST /api/revalidate { secret, tags: string[] }`, `secret` = `REVALIDATE_SECRET`. 401 on a bad
secret, 400 on bad tags. Tags must match `site|events|speakers|publications|event:<id>|speaker:<id>|publication:<id>`
(`cacheTags` in `@/lib/api/tags`).

## 3. Hooks (`@/lib/hooks`)

| hook | what |
|---|---|
| `usePointer(cb?)`, `pointer.get()` | one shared rAF pointer store `{x, y, nx, ny, vx, vy, active, down, type}`. Never render from it |
| `useReducedMotion()`, `prefersReducedMotion()` | false during SSR/hydration, then real |
| `useInViewport(ref, { once, rootMargin, amount })` | IntersectionObserver boolean |
| `useMediaQuery(q)`, `useFinePointer()`, `useIsDesktop()` | |
| `useNow(ms)` | ticking `Date \| null` (null on the server) |
| `useEventStatus(event, streamState?)` | status that flips Coming up -> Happening now -> Wrapped without reload |
| `useLiveEvent(eventId, { initial, onReaction })` | SSE `/public/events/:id/live` with reconnect: `{ connection, stream, status, viewers, reactions }` |
| `useScrollDirection()` | `{ direction, atTop }` |
| `useHydrated()`, `useIsomorphicLayoutEffect` | |

## 4. Brand (`@/components/brand`)

- `<ShapeIcon shape size color="brand|current|#hex" title? />` server-safe. Size via `size` prop.
- `<ZemiMark variant="idle|shuffle|loading|cheer|sleep" tone="color|ink|paper" size interactive loop trigger />`.
  `interactive`: hover shuffles, click cheers. Change `trigger` to replay (the nav passes the pathname).
  `ink` uses currentColor. Reduced motion: still (loading pulses opacity).
- `<ZemiWordmark cycle interval={6000} dot="color|current" />` live text "zemı", size with font-size
  (`className="text-[3rem]"`). Idea dot cycles on hover, route change, and every 6s on screen.
- `<ZemiLogo tone markVariant interactive trigger collapse />` lockup, 1.12em mark, collapses to the mark under 380px.
  Renders no link; wrap it.
- `<Character shape mood="idle|happy|sleepy|surprised|thinking" size track interactive cheer={n} color label seed ref />`
  2D character. `ref` gives `{ cheer(), squash(), blink() }`. Bump `cheer` to celebrate.
  `size` accepts CSS lengths (`"clamp(64px, 12vw, 140px)"`). `label` true = "Q, the question".
- `<SiteLoader />` + `<SiteBootScript />` (layout only). `useSiteReady()` is true when the
  first-visit curtain lifts (or immediately when skipped): pass it to hero reveals:
  `<SplitReveal play={useSiteReady()}>`.

## 5. Motion (`@/components/motion`)

- `SmoothScroll` (layout only): Lenis on the GSAP ticker, ScrollTrigger synced, native scroll under
  reduced motion and on touch. `useLenis()` to scroll programmatically, `useScrollLock(active)`.
  Import GSAP from `@/components/motion/gsap` (`gsap, ScrollTrigger, SplitText, useGSAP` registered).
- `<SplitReveal as by="lines|words" stagger delay duration play start>` masked slide-up. **Children
  must be static text** (SplitText rewrites the DOM); change `key` to re-run. `useSplitReveal(ref, opts)` for your own element.
  Hidden until split only when JS runs (2.5s failsafe).
- `<CaslHeading as size="xl|l|m|title" reveal from={0} to={1} weight={900} wghtNudge={60} scroll hover>`
  signature 2: CASL loosens on hover and as it scrolls in, weight nudges up.
- `<Magnetic strength padding>` hover pull (mouse only). `Button` uses it for primary.
- `<Marquee speed direction reactToScroll pauseOnHover paused gap fade label>` copies are aria-hidden and inert.
- `<Reveal as y x scale delay duration once amount>` fade/slide in view. `stagger(i)` (from
  `@/components/motion/stagger`, server-safe) for delays.
- `<Parallax speed xSpeed>`, `<CountUp value from duration decimals prefix suffix format>`,
  `<TickingDigits value="13:15">` (server-safe odometer), `<HighlightSwipe color="yellow|blue|red|green" delay>`.
- `shapeConfetti({ from: el | origin, count, spread, angle })`, `shapeConfettiCannons()`:
  the four shapes in their colors, lazy-loaded. Reduced motion gets a short static puff.

## 6. Friday clock (`@/components/public/shell/friday-clock`)

```tsx
const ref = useRef<HTMLDivElement>(null);
const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
<section ref={ref}>...beats...</section>
<FridayClock progress={inStory ? scrollYProgress : null} />   // MotionValue: no re-renders, hands sweep smoothly
```

Props: `progress` (0..1 number or MotionValue, null hides), `time="14:50"` (overrides),
`label` (default: latest of `FRIDAY_BEATS` at or before the time: doors open, first talk,
questions, coffee, see you next week), `beats`, `start`/`end` (13:15/15:15),
`position="auto|bottom-left|top-center|static"` (auto = bottom-left on desktop, under the nav on
mobile and it slides up when the nav hides).

## 7. Shell (`@/components/public/shell`)

Composed by the layout; you rarely touch these directly. `PublicNav` (hide on scroll down,
dark flip, morphing ink indicator, next Friday pill or LIVE badge, full-screen menu under 1024px),
`PublicFooter` (server), `Cursor`, `PageTransition` (four brand columns sweep up, about 600ms,
reduced motion fades), `AnnouncementBar` (from `general.announcement`, dismiss remembered per
text), `ScrollProgress`, `SkipLink` (targets `#main`). `NextEventPill` and `NAV_LINKS` are exported
for reuse.

## 8. UI (`@/components/public/ui`)

- `<Button variant="primary|secondary|ghost|paper|outlinePaper|accent|danger" size="sm|md|lg|icon" href? external?
  shape={ShapeName|false} icon loading magnetic cursor asChild />`. Primary shows a right-pointing
  triangle that spins on hover. `href` renders a Link (external http(s) opens safely in a new tab).
  Full-width buttons: pass `magnetic={false}` (the magnet wrapper is inline-block).
  `<IconButton label>` for icon-only.
- `<Chip tone="neutral|ink|outline|blue|red|yellow|green" size shape mono>`, `ChipLink`, `ChipButton selected`.
- `<StatusBadge status label? />` Coming up / Happening now (pulsing red) / Wrapped / Cancelled.
  Pair with `useEventStatus`. `<LiveBadge />`. Anything with white text on red uses `red-600`:
  brand red `#f94141` is only 3.6:1 against white and fails AA for small text. Keep brand red for
  shapes, dots and fills without text.
- `<SectionHeader eyebrow eyebrowShape title as size description action align reveal inverse />`, `<Eyebrow>`.
- `<Card accent tinted graph tilt maxTilt as cursor>` 28px radius, lift + tilt + glare. Clickable cards:
  put `<CardLink href>` on the title (stretched link, text stays selectable). Its keyboard focus
  ring is drawn on the Card (it looks for `[data-card-link]:focus-visible`), because the card is
  `overflow-hidden` and would clip a ring on the link itself. Use CardLink inside Card, not a bare
  stretched `<Link>`.
- `<Avatar name image size shape ring />` photo or initials on a brand shape (stable per name), `<AvatarStack people max />`.
- `<Field label hint error required>` + `Input` (size `lg` 56px default, `md`), `Textarea`, `Select` (native),
  `Choice` (big radio/checkbox card), `FormCard` (graph paper). Field wires id, aria-describedby,
  aria-invalid automatically. Works with `register()` from react-hook-form (ref is a prop).
- `<Dialog trigger title description footer size>`, `<Sheet side="bottom|right">`, `DialogClose`,
  `<Tooltip content side>` (trigger must be focusable).
- `<EmptyState shape mood friend title body action size inverse />`, `<ApiUnavailable what="..." />`.
- `<TextLink href tone external>`.
- `toast` from `sonner` works on every public page (Toaster is in the layout).

## 9. Media (`@/components/public/media`)

- `<ZemiImage image={ImageRef|null} sizes priority alt aspect="4/5" fill fit position fallback placeholderShape className />`
  `<picture>` with AVIF + WebP srcsets, dominant color + LQIP blur, fade in, cached-image safe.
  `priority` for the LCP image (also preloads it). Always pass a real `sizes`.
- `<BlocksRenderer blocks headingOffset={1} size="sm|md|lg" wide />` server-safe BlockNote renderer:
  paragraphs, headings (h1 renders as h2 by default), bullet/numbered/check/toggle lists with
  nesting, quote, code, table (old and new cell shapes), image, video, audio, file, divider,
  pageBreak, inline bold/italic/underline/strike/code/colors/links. Yellow text becomes a
  highlighter. Links: http(s)/mailto/tel/relative only, external ones open in a new tab with
  `noopener noreferrer nofollow`. Unknown blocks keep their text. `hasBlocks(blocks)` to skip empty sections.

## 10. 3D (`@/components/three`)

Build scenes in a **client** file. three/R3F only download when a `SceneCanvas` nears the viewport.

```tsx
'use client';
import { Character } from '@/components/brand';
import { Character3D, Fit, ModelProp, SceneCanvas } from '@/components/three';

<SceneCanvas className="h-[60vh]" camera={{ position: [0, 0.3, 14], fov: 21 }}
  fallback={<Character shape="circle" size={160} />} label="Q waving at you">
  <Fit width={6}>
    <Character3D shape="circle" position={[-1.4, 0, 0]} />
    <ModelProp name="coffee-cup" size={0.9} position={[1.6, -1.2, 0.8]} />
  </Fit>
</SceneCanvas>
```

- `SceneCanvas`: lazy mount (`rootMargin` 50%), frameloop paused offscreen, dpr [1, 1.75],
  PerformanceMonitor drops to low quality (no contact shadows), reduced motion = still frame,
  no WebGL or a crash = `fallback`. Placeholder crossfades out once the scene is ready.
  `studio` (default true) adds `StudioLights` (Lightformer environment, no HDR download, contact
  shadows at y -1.2). **One canvas per section**; put several characters in one canvas.
- `Character3D shape mood="idle|happy|sleepy|surprised" position rotation scale color track bob interactive cheer={n} seed ref`:
  sphere for Q, extruded beveled shapes for the rest (~2 units wide, bottom at y -1), eyes look at
  the page pointer, blink, bob, squash on click, spring stretch on hover, cheer jumps and spins.
- `ModelProp name size position rotation color keepMaterials available fallback`: `/models/<name>.glb`
  (meshopt/draco) converted to clay. **The GLBs are in meters** (a cup is 0.15), so pass `size`
  (largest side in world units). Missing file = clay primitive. Server helper
  `availableModels()` in `components/three/models-server.ts` lists what exists; pass
  `available={list.includes(name)}` to skip a 404 in the console.
- `Fit width height max fill`: scales children to fit narrow canvases (portrait phones).
- `useSceneQuality()` -> `{ quality, reduced, visible }` for your own R3F components.
- `<ShaderBackdrop colors intensity speed grain follow resolution base className />` plain WebGL
  blobs + grain on white, pointer reactive, paused offscreen, CSS gradient fallback. Fills its box:
  `<section className="relative isolate"><ShaderBackdrop className="absolute inset-0 -z-10 size-full" />`.
- `<DistortImage strength>` liquid hover displacement for covers (SVG filter, so cross-origin media works).

## 11. Gotchas

- Anything exported from a `'use client'` file can't be *called* on the server (only rendered).
  That's why `stagger` lives in `motion/stagger.ts`.
- Effects that should skip mount compare against the previous value (`useRef(value)`), never a
  "first run" boolean: StrictMode runs effects twice.
- CSS modules and `styles/public.css` read tokens with `var(--color-*)`. Tailwind only emits
  theme variables something in its build uses, so `globals.css` ends with a `--zemi-token-refs`
  line that references all of them. Keep it if you edit globals, and give `var()` a fallback in
  your own CSS.
- The custom cursor hides the native one (`html[data-custom-cursor]`) except on text inputs,
  selects and iframes. Nothing to do on your side.
- `BlocksRenderer` code blocks: Tailwind preflight resets `font-variation-settings` on bare
  `<code>`, which turns Recursive back into a proportional face. `.code code` inherits it again. If
  you render your own `<pre><code>`, put the `.mono` class on the `<code>` too.
- `next dev` with a custom `NEXT_DIST_DIR` appends that dir's types to `tsconfig.json` `include`.
- Dev-only console noise you can ignore: `[zemi api] ... Rendering the fallback` (API down),
  `THREE.Clock ... deprecated` (from R3F), SwiftShader "GPU stall" in headless Chrome.
