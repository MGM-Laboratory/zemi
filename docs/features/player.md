# Player (`ZemiPlayer`)

The custom Zemi media player for Friday recordings (VOD) and the livestream. One component, client
only, branded, keyboard and screen reader friendly, sized by container queries so it works from a
320px phone to a 2560px screen.

```
apps/web/src/components/public/player/
  index.ts            barrel: ZemiPlayer, types, ReactionIcon, format helpers
  lazy.tsx            ZemiPlayerLazy (next/dynamic, ssr: false) + PlayerSkeleton
  zemi-player.tsx     the component (state, gestures, keyboard, layout)
  use-engine.ts       source selection: hls.js, native HLS (Safari), MP4/WebM, retries, quality levels
  use-media.ts        coarse <video> snapshot (re-renders about once a second, never per frame)
  live.tsx            useLiveFeed (props + SSE merge, 15s heartbeat), LIVE pill, viewers, elapsed
  reactions.tsx       ReactionBar (5 buttons) + ReactionLayer (pooled WAAPI particles)
  scrubber.tsx        timeline: buffered, chapters, storyboard hover preview, keyboard slider
  settings-menu.tsx   glass menu with pages: speed, quality, captions, chapters
  overlays.tsx        poster, big play, loading, error, signal slate, end card, OSD, ripple, shortcuts, chips
  icons.tsx           control icons + brand-shape reaction icons (no emoji fonts)
  format.ts           formatClock, spokenTime, chapterSpans, storyboardTile, sourceKey (server-safe)
  player.module.css   all styles (container queries on the player root)
  demo/               fixtures + demo for /styleguide/player (demo only, do not import in pages)
apps/web/src/app/(public)/styleguide/player/page.tsx   demo page (noindex)
```

## Using it

From a Server Component page, use the lazy wrapper. It is already `ssr: false` and shows a 16:9
poster skeleton with the loading mark while the chunk downloads, so nothing shifts.

```tsx
import { ZemiPlayerLazy } from '@/components/public/player/lazy';
```

(From a client component you can also `dynamic(() => import('@/components/public/player').then(m => m.ZemiPlayer), { ssr: false })`.)

### VOD, from `EventDetail.recordings`

```tsx
const rec = event.recordings[0];           // primary first
const v = rec?.video;
{v ? (
  <ZemiPlayerLazy
    mode="vod"
    title={rec.title ?? event.title}
    subtitle={`Recorded ${formatJakarta(rec.startedAt, 'date')}`}
    sources={{ hls: v.hls, mp4: v.mp4, webm: v.webm }}
    poster={v.poster}
    storyboard={v.storyboard}
    chapters={rec.chapters}
    durationSec={v.durationSec}
    accent={event.accent}
  />
) : null}
```

| prop | from |
|---|---|
| `sources` | `video.hls`, `video.mp4`, `video.webm` (any subset works) |
| `poster` | `video.poster` |
| `storyboard` | `video.storyboard` (sprite: `interval`, `columns`, `tileWidth`, `tileHeight`, `count`) |
| `chapters` | `recording.chapters` (`{ title, startSec }[]`) |
| `durationSec` | `video.durationSec` (used before metadata loads, so chapters and the time total show right away) |
| `accent` | `event.accent` |

### Live, from `EventDetail.stream`

```tsx
<ZemiPlayerLazy
  mode="live"
  eventId={event.id}
  title={event.title}
  sources={{ hls: event.stream.hlsUrl }}
  live={{
    ingestOnline: event.stream.ingestOnline,
    viewers: event.stream.viewers,
    startedAt: event.stream.liveStartedAt,
    state: event.stream.state,
  }}
  poster={event.cover?.src}
  posterLqip={event.cover?.lqip}
  posterColor={event.cover?.color}
  accent={event.accent}
  onStreamEnd={() => router.refresh()}  // swap to the recording when it lands
/>
```

- With `eventId`, the player opens the public SSE through `useLiveEvent`, sends a heartbeat every
  15s while the tab is visible (`heartbeat()` from `@/lib/api/client`, stops after the stream ends),
  sends reactions with `react()`, and floats everyone else's reaction bursts. Your own reactions are
  shown instantly and de-duplicated when the SSE echoes them back.
- Props and SSE merge "latest wins": the page can drive the player from its own data, the SSE keeps
  it fresh. If the page rendered before Go live (`hlsUrl: null`), the player picks up the url from
  the SSE `state` message. You can render the live player before the event starts.
- Stream states: `idle` / `preview` (public url answers 403 until Go live) show the **Almost on air**
  slate. `live` + `ingestOnline: false` (OBS dropped) shows **Signal lost, hang tight** with a
  waiting timer; playback resumes on its own when frames flow again (the engine retries with
  backoff, a stall of 8s+ counts as lost and rebuilds the stream every 10s, and while it
  re-attaches the viewer sees the loading mark, not a play button). `ended` shows
  **That's a wrap** (the cast cheers once) and fires `onStreamEnd`. A url with `?pt=` (admin
  preview token) is allowed to play in `preview`.

### All props

Contract props: `mode`, `sources`, `poster`, `title`, `subtitle`, `accent`, `eventId`, `live`,
`storyboard`, `chapters`, `durationSec`, `autoPlay`, `className`.

Additive extras (all optional):

| prop | what |
|---|---|
| `live.state` | `StreamState`, see above |
| `posterLqip`, `posterColor` | blurred placeholder and fill color under the poster (`ImageRef.lqip`, `ImageRef.color`) |
| `captions` | `{ src, srclang, label, kind?, default? }[]` WebVTT tracks. Cross-origin files need CORS (the player sets `crossorigin` only when a track is cross-origin). HLS subtitle tracks from hls.js show up too |
| `theater`, `onTheaterChange`, `showTheater` | controlled theater mode. Uncontrolled: the root gets `data-theater` and the class `zemi-player-theater`. The button shows when `onTheaterChange` or `theater` is passed |
| `rememberPosition` | default true. VOD position per source in `localStorage` (`zemi:player:pos:<host+path>`, query strings dropped so signed urls still match, 60 day expiry, cleared on end) |
| `reactions` | default true in live mode. False hides the reaction bar (incoming bursts still float) |
| `onPlay`, `onPause`, `onEnded`, `onStreamEnd` | callbacks |
| `ref` | `ZemiPlayerHandle`: `play()`, `pause()`, `seek(sec)`, `toggleFullscreen()`, `burst(kind, count)`, `video`. Works through `ZemiPlayerLazy` (React 19 ref as a prop) |

Volume and mute are remembered globally (`zemi:player:prefs`).

## What it does

- **Engine**: HLS through hls.js (worker, `capLevelToPlayerSize`, gentle live catch-up at up to
  1.15x), native HLS when MSE is missing (iOS Safari), then WebM (only when the browser answers
  "probably" for VP9/Opus) and MP4. Fatal errors fall through to the next source (VOD) and carry the
  playhead; live retries quietly with backoff. Media errors try `recoverMediaError` and
  `swapAudioCodec` first.
- **Live**: LIVE pill with a pulsing dot; when you fall behind (paused, or more than 4s from the
  edge) it turns into a **Go live** button, and a "You're 12s behind, Jump to live" chip appears
  after 8s. Viewers count rolls with mono digits and pops when it goes up. Elapsed live time.
  Reaction bar: clap, heart, fire, idea, laugh as brand-shape icons; on phones it folds into one
  heart button that fans out. Rate limit (429) cools the bar for 3s with a friendly note.
- **Floating reactions**: cloned SVG nodes animated with WAAPI (transform and opacity only), at most
  36 alive, bursts capped at 6 and drained from a queue every 90ms, skipped while the tab is hidden.
  Reduced motion: a short fade in place.
- **VOD**: scrubber with buffered ranges, a played fill written from rAF to a CSS variable (no React
  renders while playing), chapter notches, a brand-shape knob in the accent, and a hover preview with
  the storyboard tile, chapter title (2 lines) and time. The track grows on hover. Current chapter
  chip in the bar (rolls when it changes), chapter list page with thumbnails and "Now". Skip 10s,
  speeds 0.75x to 2x, quality menu (Auto shows the level playing) when HLS has 2+ levels, "Picked up
  at 03:10, Start over" chip when a saved position is restored. End card with the cast cheering.
- **Both**: big play button (accent shape morphing into pause), volume slider + mute, fullscreen on
  the player root (iPhone falls back to `webkitEnterFullscreen`, phones lock landscape for wide
  video), picture in picture (standard or `webkitSetPresentationMode`), theater mode, captions drawn
  by the player (brand type, lifts above the controls, works in fullscreen), glassy control bar that
  springs in with a stagger and auto-hides after 2.6s idle, loading mark after 280ms of waiting,
  error card with **Try again** (and a download link when the browser can't play the file at all),
  autoplay that falls back to muted with an "Unmute" chip. The player root carries
  `data-native-cursor`: the site's custom cursor steps aside and the system cursor stays visible
  over the video (live, VOD and recordings). Only fullscreen hides it, while idle.
- **Touch**: tap toggles controls, double tap left or right seeks 10s (repeated taps add up, with a
  ripple), double tap center toggles fullscreen.
- **Keyboard** (focus anywhere in the player): Space/K play, J/L 10s (L = back to live in live
  mode), arrows 5s and volume, Home/End, 0 to 9 seek to percent, M mute, F fullscreen, T theater
  (when shown), C captions, I picture in picture, `<` `>` speed, `?` shortcut overlay, Escape closes
  menus. The scrubber is a real `role="slider"` (arrows 5s, PageUp/PageDown 10%).
- **Screen readers**: the root is a labelled region (`aria-roledescription="video player"`), every
  control has a label and a tooltip with its key, menus are ARIA menus with roving focus (arrows,
  Home/End, Right opens a page, Left/Backspace goes back, Escape closes, focus returns to the
  trigger), a polite live region announces play/pause, seeks, volume, signal lost/back and the end.
  The slate is a `role="status"`, errors are `role="alert"`. Decorative layers are `aria-hidden`.
- **Motion**: springs from DESIGN.md, `MotionConfig reducedMotion="user"`, slate characters step at
  15 fps (stop-motion) while UI runs at 60, rolling mono digits via `TickingDigits`. Reduced motion:
  no morphs or bounces, reactions fade, menus switch pages without sliding.
- **Layout**: 16:9, never taller than the screen (`max-width: calc((100svh - 24px) * 16 / 9)`, so
  landscape phones get a centered player that fits), `overflow: clip`, container queries for every
  size, a `data-compact` layout under 560px (skip buttons, PiP and theater move into the settings
  menu, reactions fold), bigger targets on large screens and fullscreen.

## Demo: `/styleguide/player`

1. HLS VOD (Mux test stream, 5 quality levels) with a generated storyboard sprite, 6 chapters,
   accent switcher and controlled theater mode.
2. MP4 + WebM clip with a VTT caption track (blob url), plus the same clip in a 340px box.
3. Live mock (dark stage): toggles for signal online, crowd reacting and stream ended, a viewers
   slider, fake incoming bursts per kind, and inputs to paste a real HLS url and event id (turns on
   SSE, heartbeats and real reactions; with an event id and no url, the url comes from the SSE on
   Go live and the mock toggles step aside).
4. States: live not on air yet, and a broken file with retry.

## Decisions

- The player draws its own captions (tracks in `hidden` mode + `cuechange`) instead of native
  rendering, so they sit above the control bar, use the brand font and follow fullscreen.
- Controls re-render at most about once a second (`use-media.ts` coarse snapshot); the playhead,
  particles and preview are imperative. Long recordings stay smooth on low-end phones.
- Reactions are DOM + WAAPI instead of a canvas: crisp brand SVGs, GPU-composited, no extra WebGL
  context (the page budget is 2).
- The settings menu and shortcuts live inside the player root so they work in fullscreen.
- Live has no DVR scrubber on purpose (the proxy keeps a short window); J/Left say so in a flash.

## Verified

- `pnpm --filter @zemi/web typecheck`: no errors in player files (the last run's only error was a
  teammate's in-progress `events/[slug]/page.tsx` import).
- Playwright (Chrome, headless) on `/styleguide/player` at 390x844 and 844x390 (touch), 820x1180
  (touch), 1440x900 and 2560x1440, plus a reduced-motion pass: poster, playback of HLS and MP4,
  hover preview incl. the left edge, settings, quality, chapters menu, shortcuts overlay, OSD,
  theater, captions, end card, live reactions (local and incoming through the `ref` handle), signal
  lost slate and recovery, wrap slate, not-on-air and error states. No console errors from the player
  (only dev noise, plus HMR errors from a teammate's unfinished home page module). Screenshots in the session scratchpad under `shots/player/final2/`.
- Live edge against a real sliding-window live HLS (local ffmpeg `testsrc2` pushed as HLS, served
  from the scratchpad): pausing 12s turns the pill into **Go live**, pressing it lands back at the
  edge (about 6s behind, the hls.js sync point). Killing and restarting the push showed the lost
  slate and hands-free recovery. A delayed-network run confirmed the loading mark (not a play
  button) while the stream re-attaches.

- Review pass, real wire (throwaway unlisted event, ffmpeg `testsrc2` pushed to MediaMTX, shared
  API, deleted afterwards): demo with only the event id pasted (no url) showed **Almost on air** in
  `idle` and still in `preview`; admin **Go live** made the player attach from the SSE `hlsUrl`
  without a reload (public master 200 cross-origin); play, then 3 quick claps: 3 POSTs `202`, 3
  particles (the SSE echo was swallowed); heartbeats `{"live":true,"viewers":1}` and "1 watching"
  after the next viewers tick; killing the push showed **Signal lost** (SSE `ingestOnline:false`),
  restarting it resumed playback with no click in about 6s; **End stream** showed **That's a wrap**,
  fired `onStreamEnd`, hid the reaction bar and stopped heartbeats. No console errors. The resulting
  recording (MP4 + 6-tile storyboard) played in the VOD player on the event page with the right
  preview tile.
- Review fixes: the LIVE pill, L, End and the right arrow no longer "jump to live" over a slate
  (they say "No signal right now", "Not on air yet" or "The stream has ended", or "You're as live as
  it gets" at the edge), and Space/K over a slate no longer announces "Playing"; heartbeats continue
  while the video plays in a hidden tab or a PiP window; the settings menu shows a fade + chevron
  when rows hide below (phones fit about 2 rows); a file load failure (404, 5xx, expired url, broken
  file: browsers report all of them as SRC_NOT_SUPPORTED) now shows the generic "Well, that didn't
  work" card, and "Your browser can't play this one" plus the download link only shows when
  `canPlayType` says no; a failed reaction POST no longer swallows someone else's echo; the demo
  passes `hls: null` with a real event id so the SSE url pickup can be exercised.

## Known gaps

- Heartbeats while playing in a hidden tab or PiP: logic only, not exercised in a browser. Chrome
  still throttles hidden-tab timers unless audio is playing, so a muted background viewer may beat
  less often than every 15s.
- Not tested on real iOS/Android hardware (native HLS, `webkitEnterFullscreen`, orientation lock and
  PiP presentation mode are written to spec but only exercised in desktop Chrome emulation).
- No live DVR (seeking back in a live stream) and no audio-only mode.
- Captions for HLS VOD rely on hls.js exposing subtitle tracks as `textTracks`; no subtitle
  styling menu.
