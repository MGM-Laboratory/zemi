# Zemi brand + design system

Read this before touching anything visual. Public site and admin share one brand; the public site
turns the volume up, the admin keeps it calm.

## 1. The idea

**"A Friday at Zemi."** Research is lonely. Fridays aren't. Zemi is the table where half-finished
ideas get said out loud.

Four primitive shapes are the ingredients of every research conversation. They are also our
characters, our logo, our loaders, our confetti:

| shape | color | character | meaning |
|---|---|---|---|
| Circle | Blue `#3a6dc5` | **Q** | the question |
| Triangle (rounded) | Red `#f94141` | **Hunch** | the hypothesis, the spark |
| Square (rounded) | Yellow `#f7bf33` | **Block** | data, evidence, the solid stuff |
| Arch (half-disc on a stem) | Green `#0f8657` | **Bridge** | the conversation that connects them |

Characters have two small ink eyes (with a white glint) that follow the cursor, blink every 3 to 6 s,
squash-and-stretch when clicked, and cheer (jump + spin) on success. They never have mouths or limbs.
Keep them simple: that's the charm.

## 2. Signature: the Friday clock

The home page is a session that runs from **13:15 to 15:15**. Each story beat is stamped
**1, 2, 3...** in story order (doors open, then "1 - THE LONELY PART" through "N - SEE YOU NEXT
WEEK"), so the structure reads without clock times. Beat times still exist in the data model: they
order the scenes and drive the admin's beat-time preview (Admin > Site > Home). Don't use clock
times or numbers anywhere else as decoration.

Second signature, used with restraint: **type that loosens up.** Display headings are Recursive.
Hovering or scrolling into them animates the `CASL` axis from 0 (formal) to 1 (casual) and a little
`wght`, like research talk turning into Friday chat. Use it on hero lines, section titles, and the
wordmark. Not on body text.

## 3. Logo system (`apps/web/src/components/brand`)

- **Mark** (`<ZemiMark />`): 2x2 grid on a 100x100 viewBox. TL blue circle, TR red rounded triangle,
  BL yellow rounded square, BR green arch. Gap 8. Each shape is its own `<g>` so it can animate.
  Animation API: `variant="idle" | "shuffle" | "loading" | "cheer" | "sleep"`, `tone="color" | "ink" | "paper"`.
  - `loading`: shapes tumble in one by one (spring), then rotate 90deg in turn, forever.
  - `shuffle`: shapes swap positions clockwise (used on hover and route change).
  - `cheer`: all four hop with 60ms stagger.
  - `tone="paper"` renders white shapes for dark backgrounds; `ink` for monochrome.
- **Wordmark** (`<ZemiWordmark />`): the word `zemı` (dotless i, U+0131) set live in Recursive
  (wght 900, CASL 0.35, tracking -0.04em). The i's dot is replaced by a small shape that **cycles
  through the four shapes** (the "idea dot"): on hover, on route change, and every ~6s idle. Hover
  also eases CASL to 1. Color follows `currentColor` so the nav can flip it on dark sections.
- **Lockup** (`<ZemiLogo />`): mark + wordmark. Nav uses the lockup; collapses to mark under 380px.
- Static assets for email/OG/favicon live in `apps/web/public/brand/` (SVG + PNG): generated from the
  same geometry (favicon = mark only).
- Clear space = one shape cell. Never stretch, outline, add gradients, or rotate the whole mark.

## 4. Color tokens

White is the page. Color is used like highlighter and toy blocks: in shapes, fills, and
moments. Never as long text color except blue links.

```css
--bg: #ffffff;            --surface: #ffffff;      --surface-muted: #f7f7f5;   --surface-inverse: #0e1116;
--blue: #3a6dc5;          --yellow: #f7bf33;       --red: #f94141;             --green: #0f8657;
--blue-50: #ecf1fa;       --yellow-50: #fef6e0;    --red-50: #fee5e5;          --green-50: #e2f1ea;
--blue-600: #2f5aa6;      --red-600: #d92f2f;      --green-600: #0b6b45;       --yellow-600: #d99e12;
--ink: #0e1116;  --ink-2: #3b4150;  --ink-3: #6b7280;  --ink-4: #9aa1ad;  --ink-inverse: #f5f6f8;
--line: #ececea; --line-strong: #d8d8d2; --graph: #eef1f6; --focus: #3a6dc5;
```

- Yellow fails contrast as text on white. Use yellow only for fills, shapes, highlighter swipes
  (`mix-blend-mode: multiply` behind ink text), and chips with ink text.
- Red is for live states, errors, and energy. Green is success/check-in. Blue is action/links.
- Inverted sections (`--surface-inverse`) are used exactly for the "research gets lonely" beat,
  the live player stage, and the footer. Nav flips to paper tone over them.
- Per-event `accent` (blue/yellow/red/green) tints that event's card, cover frame, and page details.

## 5. Typography

| role | family | notes |
|---|---|---|
| Display | **Recursive** (variable: wght 300 to 1000, CASL 0 to 1, slnt, MONO) | headings, big numbers, wordmark. wght 800 to 950, tracking -0.035em, line-height 0.9 to 1.0 |
| Body / UI | **Atkinson Hyperlegible Next** (200 to 800) | body copy, forms, admin UI. Picked because the audience is broad and legibility is kindness |
| Mono / utility | **Recursive** with `MONO 1, CASL 0` | times, dates, ticket codes, labels, metadata, the clock |

CSS variables: `--font-display`, `--font-body`, `--font-mono` (the mono variable points to the same
Recursive family; apply `font-variation-settings: "MONO" 1, "CASL" 0` via the `.mono` utility).

Fluid scale:
```
display-xl  clamp(3.25rem, 10.5vw, 11rem) / 0.88
display-l   clamp(2.5rem, 7vw, 6.5rem)   / 0.92
display-m   clamp(2rem, 4.4vw, 4rem)      / 0.98
title       clamp(1.5rem, 2.4vw, 2.25rem) / 1.1
body-l      1.25rem / 1.5
body        1.0625rem / 1.6
small       0.875rem / 1.45
label       0.75rem mono, uppercase, tracking 0.08em
```

## 6. Shape, space, depth

- Radius: cards `28px`, inputs `14px`, chips/buttons pill. The 4:5 event cover frame uses `24px`.
- Spacing: 4px base. Section padding `clamp(80px, 14vh, 200px)` vertical on public pages.
- Grid: 12 columns, gutter `clamp(16px, 2.5vw, 40px)`, page margin `clamp(16px, 4vw, 64px)`,
  max content width 1680px. Asymmetric compositions are encouraged.
- Shadows are rare and soft (`--shadow-1/2/3` from the lab tokens). Depth mainly comes from 3D and motion.
- Graph-paper texture (`--graph` 1px lines every 24px) marks "work in progress" surfaces: the
  register form card, the ticket, and the publications index. Nowhere else.

## 7. Motion

- Libraries: `motion` (React UI springs, layout, presence), GSAP + ScrollTrigger + SplitText
  (scroll stories, text splitting), Lenis (smooth scroll, synced to GSAP ticker), anime.js (SVG
  logo and micro loops), R3F (3D).
- Easing tokens: `--ease-out: cubic-bezier(.22,1,.36,1)`, `--ease-in-out: cubic-bezier(.65,0,.35,1)`,
  springs `{ stiffness: 320, damping: 22 }` (playful) and `{ stiffness: 180, damping: 26 }` (calm).
- Durations: micro 160ms, small 280ms, medium 520ms, large 900ms.
- Text reveal: lines slide up from a mask, 40ms stagger. Headings also run the CASL loosen.
- Every interactive thing responds: hover (magnetic pull on primary buttons, shape icon spin),
  press (scale 0.96 spring), focus (2px focus ring offset 3px, blue).
- Idle: characters blink and sway. After 25s idle on the home page, Q peeks in from the screen edge.
- Celebrate: shape confetti (four brand shapes) + characters cheer. Use for registration success,
  check-in success on the ticket page, publishing an event in admin.
- Wait: the mark's `loading` loop, or a "13:14... 13:15" ticking clock for long waits. On a first
  visit the loader holds its curtain (capped, with a no-JS fallback lift) until every GLB model is
  downloaded, parsed and cached, so pinned 3D scenes never wait for a model mid-scroll; repeat
  visits preload in the background.
- Page transitions: the four shapes sweep across as a curtain (motion + View Transitions where possible).
- `prefers-reduced-motion: reduce`: no smooth scroll, no parallax, 3D renders a still frame,
  transitions become 150ms fades, confetti is a static burst.

## 8. Cursor

On `(pointer: fine)` only: a 12px white dot that lerps to the pointer with a distance-adaptive
follow (fast catch-up on long jumps, gentle glide on small moves). The dot blends with
`mix-blend-mode: difference`, so it renders black on light backgrounds and white on dark ones,
photos included. Over links/buttons it grows into a 56px shape (circle by default;
`data-cursor="play|drag|open|register|question"` shows a label and picks a shape; `question` is Q
saying "Open" on discussion posts). Hidden on touch devices. Never hide the native cursor on inputs
or over video players (`data-native-cursor`).

## 9. 3D art direction

"Soft toy clay on white." Chunky rounded primitives, `MeshPhysicalMaterial` (roughness ~0.35,
clearcoat ~0.5, subtle sheen), soft studio lighting via drei `Lightformer`s in an `Environment`,
and `ContactShadows` on an invisible ground. Colors exactly the brand hexes (convert to linear).
Props (Blender-generated GLB in `apps/web/public/models/`): round seminar table, stools, coffee
cup, paper stack, paper plane, microphone, wall clock. Draco/meshopt compressed, each < 300KB.

Performance: one canvas per section, lazy mounted when near viewport, paused offscreen,
`dpr={[1, 1.75]}`, `PerformanceMonitor` to drop effects, no postprocessing on mobile. All GLB
models are preloaded and cached by the first-visit loader (`preload-models.ts` warms the shared
drei `useGLTF` cache), so scenes never wait mid-scroll and client-side navigation never
re-downloads them. The home hero has no 3D scene (it was too heavy on low-end machines): the 3D
stays in the pinned story sections (out-loud table, coffee cup), one live canvas at a time.

## 10. Voice

Casual English, like texting a friend who's also doing a PhD. Short sentences. Warm, a bit funny,
never corporate.

- Yes: "Bring the messy version." "Nobody expects slides to be perfect." "Coffee's on the left."
- No: em dashes, en dashes, "unlock", "elevate", "seamless", "journey", "delve", "empower",
  "cutting-edge", "in today's fast-paced world", "whether you're X or Y", exclamation spam.
- Buttons say what happens: "Save my seat", "Add to calendar", "Show my ticket", "Send message".
- Errors explain the fix: "That email looks off. Mind checking it?"
- Status words: Coming up / Happening now / Wrapped / Cancelled.

## 11. Admin look

Calm studio. White surfaces, hairline borders, a left sidebar (shape icons per section), sticky
page headers, dense but breathable tables. Headings in Recursive (CASL 0.2, wght 800), UI in
Atkinson. Status chips: scheduled blue-50, live red (pulsing dot), past ink-3 on surface-muted,
draft yellow-50, published green-50. Characters appear in empty states and success toasts. ⌘K
command palette. Every destructive action confirms and says exactly what will happen.
