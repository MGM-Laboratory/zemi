# Zemi: patterns to reuse from award-winning sites, 2023 to 2026

I found 18 reference sites and 25 patterns mapped to Zemi's pages. Three limits apply:

- **Few published numbers.** Most studio case studies describe techniques but give few values. Values marked **[S]** come from a case study, an Awwwards page, a tutorial or a public rebuild, and the text names which. Values marked **[P]** are my proposed starting values for Zemi, not measured from any site.
- **Site of the Year status is unconfirmed.** The Awwwards "Sites of the Year" page lists winners and nominees together, and I couldn't reach the annual-awards pages that name the single winner. I call those sites "SOTY 2025 list" rather than "winner". Site of the Month (SOTM) months come from the monthly listing and are reliable.
- **Brand details are left to design.** Which shape is which color, whether the characters have faces, and what happens at each clock time are placeholders for the design team.

---

## Part 1: Reference sites

**1. [Messenger](https://messenger.abeto.co), by abeto.** SOTY 2025 list, SOTD. Memorable because it is a calm, slightly odd multiplayer planet where you deliver mail.
- A single 16×16 px color-atlas texture holds every color in the world, so the whole mood can be changed in one place [S].
- A custom outline pass gives a hand-drawn look, with per-pixel control of thickness, color and alpha [S].
- 3D emoji replace text chat, so nothing needs moderating. Rooms are capped at 10 players [S].
- It uses one-finger controls on mobile and mouse only on desktop, with no tutorial. The first load is 5.7 MB, there are 4 levels of detail, and assets are cleaned up aggressively to avoid iOS Safari tab kills [S].

**2. [Igloo Inc](https://igloo.inc), by abeto.** SOTY 2024 list. Memorable because a landing page with only three sections feels endless thanks to the camera work.
- Scroll drives real-time camera journeys. Section changes use chromatic-aberration, displacement and frost shaders [S].
- Text scrambles by offsetting SDF glyph textures in the shader, not by changing the DOM [S].
- A particle cloud swirls into a different shape for each hovered link. Particles are colored by velocity and glow during the change [S].
- Sound is timed to the particle motion. Shaders compile in the background after first paint [S].

**3. [Bruno Simon portfolio](https://bruno-simon.com), 2025 rebuild.** SOTM January 2026. Memorable because you drive a toy car around an island that other people are visiting at the same time.
- Shared-world features [S]:
  - "Whispers": 30 messages at a time, moderated with OpenAI's free moderation model.
  - A global cookie counter.
  - A lap leaderboard that resets daily.
- A palette texture replaces vertex colors. About 78,400 grass blades are drawn as one triangle each. Instancing, KTX2 textures (ETC1S/UASTC) and Draco geometry keep it light [S].
- Mobile automatically gets a low-quality preset: no water blur, no depth of field, lower shadow resolution. Each UI click plays at a random playback rate so it never sounds identical [S].

**4. [Ponpon Mania](https://ponpon-mania.com), by Patrick Heng and Justine Soulié.** SOTM October 2025. Memorable because it is a WebGL comic about a sheep who wants to be a DJ.
- Chapters behave like albums and panels like songs, with a chapter-select screen [S].
- Every panel loops, so nothing is ever static, and hovering reveals clickable details [S].
- Illustrator layers are packed into texture atlases, GPU-compressed, and reassembled in OGL with GSAP timelines. The layout is stored as JSON and edited in an in-browser Tweakpane debug view [S].
- The art is mostly black and white, and color appears only in dream sequences. The About page uses Matter.js physics, and scrolling uses Lenis [S].

**5. [Oryzo AI](https://oryzo.ai), by Lusion.** SOTM April 2026 plus a Developer Award. (Lusion's own v3 site is on the SOTY 2023 list.) Memorable because it is a satirical premium product launch for a cork coaster.
- The hero object moves with real weight and inertia, and scroll moves the camera through actual depth instead of sliding flat layers [S].
- It uses one typeface family and four colors, and the orange accent is kept only for calls to action [S].
- An earlier Lusion site (a pre-v3 SOTM, not v3) shows a running character in the contact scene. It uses vertex-animation textures stored as PNGs, with 11 keyframes interpolated from 16-bit data, and a point light that follows the cursor [S].

**6. [Slosh Seltzer](https://www.awwwards.com/sites/slosh-seltzer), by Active Theory.** SOTM June 2024. Memorable because you "pop the can" to enter the site.
- Scrolling fills the screen with liquid [S].
- The cursor is a fluid effect with carbonation bubbles, and hidden cursor-effect zones act as surprises [S].
- It includes a pong mini-game and a "cheers" interaction. Flat patterned backgrounds make the 3D can stand out [S].

**7. [Active Theory V6](https://www.awwwards.com/sites/active-theory-v6).** SOTM February 2024. Memorable because other visitors are visibly there with you.
- The navigation is a single pill that reacts to scroll speed [S].
- Colored tubes spawn from your cursor and are shared over the network, so you see other visitors live [S].
- An AI chat moves you around the portfolio, answering requests like "Show me a fun project" [S].

**8. [Zentry](https://www.awwwards.com/sites/zentry), by Resn.** SOTM August 2024. Memorable because its high-energy "portal" masks are built from plain page elements, not WebGL.
- The portal masks use CSS `clip-path` [S]. A public rebuild (adrianhajdin/award-winning-website) uses `polygon(16% 0, 89% 15%, 75% 100%, 0 97%)`.
- In the rebuild, title words animate from `translate3d(10px,51px,-60px) rotateY(60deg) rotateX(-40deg)` to their resting position, and bento cards tilt with a 300 ms ease-out [S, rebuild].
- The soundtrack moves from upbeat to ambient as you explore [S].

**9. [Dropbox Brand](https://www.awwwards.com/sites/dropbox-brand), by Daybreak Studio.** SOTM February 2025. Memorable because it is brand guidelines you want to play with.
- The menu tab indicator squashes and stretches. The motion was fitted to keyframes with a quartic regression [S].
- Color chips use non-linear easing and a custom grid so hover states don't collide [S].
- It includes a variable-font widget with synced sliders, a Bézier editor that flies a paper airplane, and a drawing tool. It is built with Rive and Webflow, and QA tracked more than 200 timing issues [S].

**10. [Immersive Garden](https://www.awwwards.com/sites/immersive-garden-website).** SOTM January 2025. Memorable for its carved, bas-relief 3D look.
- Large 3D Roman numerals act as anchors in the navigation [S].
- It uses Lenis and GSAP, server-side KTX texture compression, channel-packed textures and a gltf-transform export pipeline [S].

**11. [Mana Yerba Mate](https://en.manayerbamate.com), by Louis Paquet.** SOTY 2023 list, SOTD 8.03. Memorable because an energy-drink can becomes the center of a playful Shopify store.
- One scroll position drives layered parallax, a Three.js product scene and a sequence of Lottie animations together [S].
- Bright colors and playful interactions emphasize "energy boost" rather than health [S].

**12. [Noomo Agency](https://noomoagency.com).** SOTY 2023 list. Memorable because its logo carries handwritten marks from every team member.
- The page scrolls upward, from the banner to the projects. Testing showed this made the site more engaging and memorable [S].
- Every hover has its own purpose. It is built with Three.js, GSAP and Nuxt 3 [S].

**13. [Unseen Studio 2025 Wrapped](https://2025.unseen.co).** SOTD March 2026. Memorable as a studio's year in review.
- A scrolling timeline, an ASCII liquid-simulation effect and a designed loading sequence [S].
- Two colors only, black and gold [S].

**14. [Digital Design Days X](https://palermo.ddd.live), an event site.** SOTD June 2025.
- Hero shader, scroll animation on the home page, and animated schedule sections [S].
- Two colors, #F55AC2 on #201A39 [S].

**15. [FlowFest 2025](https://www.flowfest.co.uk), an event site.** SOTD July 2025. Memorable as an illustrated community festival.
- Illustration plus GSAP animation inside Webflow, in two colors [S].
- The jury gave animation 8.20 but accessibility only 6.40 [S]. That is the gap Zemi should avoid.

**16. [Config 2025](https://config.figma.com), Figma's conference. I found no Awwwards award; it is included because it fits the brand so closely.**
- The identity is built from primitive glyphs with inner and outer parts that respond to each other. Moving one glyph sends a ripple through the whole layout [S].
- Motion was dropped from 60 to **15 fps** so it feels handmade [S].
- Each talk track has its own color variables, with matching speaker-photo backgrounds. Interface corners alternate between round and sharp, taken from the glyphs [S].

**17. [The Renaissance Edition](https://www.shopify.com/editions/winter2026), by Shopify Design.** SOTM February 2026, with 9.40 for animation. Memorable because it mixes generative paintings with commerce.
- The intro animation and its loading states hand straight off into the hero [S].
- It has a designed 404 page and hidden layers that reveal on interaction [S].

**18. Codrops tutorials.** These are not award entries, but they have the most usable numbers. All values are tutorial values.
- **Cinematic 3D scroll:** a camera array with a start %, end % and position per segment. Motion is linear (`ease:"none"`) inside a segment and uses CustomEase at the joins, for example `cinematicSilk` = `0.45,0.05,0.55,0.95`. A fixed canvas sits over a 500–900vh spacer. Text scrub is 0.5–0.8, SplitText characters move x −100 to 0 with a 0.02 stagger, pixel ratio is capped at 2, and the progress bar uses `gsap.quickSetter`.
- **3D text cylinder:** perspective 70vw (400px on mobile), rotateX from −80 to 270, scrub 2, length `+=2000svh`, `backface-visibility:hidden`.
- **R3F image tube:** `vel += deltaY*0.004`, damping `0.92^(dt*60)`, speed clamped to ±2, lerp 0.12, and hover slows time to 0.35×. All motion state lives in refs, never in React state.
- **SVG mask transitions:** a grid of 14 / 10 / 6 columns (desktop / tablet / phone), `power3.out`, duration 1, stagger 0.02, 30 blinds, and a +0.01 overlap to hide subpixel gaps.

---

## Part 2: 25 patterns mapped to Zemi

| # | Zemi slot | Pattern and spec | Source |
|---|---|---|---|
| 1 | Loader | The four characters drop in one by one (stepped at 15 fps) and lock into the ZEMI logo. A clock hand sweeps 13:00→13:15, driven by real asset progress (drei `useProgress`). The camera then pushes straight into the hero with no fade. Show it for at least 600 ms, and skip it on repeat visits in the same session [P]. | Igloo intro handoff, Renaissance loader |
| 2 | Nav | Pill nav: `scaleX = 1 + min(abs(v)/3000, 0.15)` from Lenis velocity [P]. It hides on scroll down and returns on scroll up. In the full-screen menu, a particle cloud reshapes into the character that owns the hovered link, with particles colored by speed. | Active Theory V6, Igloo |
| 3 | Page transitions and section titles | Grid wipe of 14 / 10 / 6 cells, each cell a random brand color, stagger 0.02 from "random", `power3.out`, 0.6 s to cover and 0.6 s to uncover [P]. Section titles use Zentry's rotated-word entrance, 0.9 s `expo.out`, 0.04 stagger [P]. | Codrops masks, Zentry rebuild |
| 4 | Home hero | Characters have weight: each follows a cursor-offset target (lerp 0.08) and leans into its velocity (`rotZ = −vx·0.002`) [P]. On hover a character squashes (scaleY 0.9, XZ 1.06, 0.5 s elastic return) and a ripple reaches the other three, delayed 60 ms per unit of distance [P]. | Oryzo inertia, Config ripple |
| 5 | Story clock beats | A `beats[]` array of `{start, end, clock, cam, target}`, linear inside each beat, CustomEase between beats, `scrub: 1`. Clock: `minutes = 795 + p*120`, minute hand +720°, hour hand +60°. Digits use Recursive `MONO 1` so they don't jitter. `CASL` follows smoothed scroll speed: `casl += (min(abs(v)/2500,1) − casl)*0.1` [P]. What happens at each beat is for design to decide. | Codrops cinematic scroll |
| 6 | Character motion (everywhere) | Stepped stop-motion for character poses only. In `useFrame`, add up `dt` and apply the next pose when it reaches 1/15 s. Camera, scroll and interface stay at 60 fps. This gives the clay look for free. | Config 15 fps |
| 7 | Next-event card | The card is a clip-path portal onto a looping scene. On click it expands to full screen (clip-path to `inset(0)`, 0.8 s `power3.inOut` [P]) and becomes the event page hero. Countdown digits use `MONO 1`. | Zentry portals |
| 8 | Past sessions gallery | R3F image tube or wavy carousel using the Codrops constants above. Hover slows time to 0.35× and brings up a pill with the session title and date. | Codrops tube |
| 9 | Speakers marquee | Speaker names on a CSS 3D cylinder (70vw perspective, scrub 2). Phones get a flat marquee whose speed is a base value plus scroll speed, and which flips direction with scroll direction [P]. | Codrops cylinder |
| 10 | Stats | One ScrollTrigger drives both the number counters and a small Rive or Lottie scene per stat. | Mana, Dropbox (Rive) |
| 11 | Closing (15:15) | The four colors pour up from the bottom as SVG waves, or a fluid shader, until the screen is flooded. The footer then rises out of the color. | Slosh |
| 12 | Footer | A giant ZEMI wordmark whose letters change Recursive `CASL` and `wght` as the cursor comes within 240 px [P]. Clicking turns the letters into Matter.js bodies that tumble, then reset. | Ponpon physics, Dropbox variable font |
| 13 | Events index | Seasons are albums and sessions are tracks: a track list with a play-head. Each row carries its session number as a 3D clay numeral, and the character on the hovered row starts looping. | Ponpon, Immersive Garden numerals |
| 14 | Event detail, all states | A small palette texture feeds every character material, with one row per state: scheduled at full color, live with a 1.2 Hz glow pulse, past as desaturated "dry clay" [P]. Tabs (Overview, Recording, Photos, Materials) get a squash-and-stretch indicator. | Messenger atlas, Bruno palette, Dropbox tabs |
| 15 | Event detail, scheduled | A pinned countdown in `MONO 1`. The register button's character "waits" in a stepped idle loop and hops when the button is hovered. "Add to calendar" is an obvious secondary action. | Ponpon always-looping panels |
| 16 | Event detail, live | Other viewers appear as tiny primitive-shape cursors, broadcast about 10 times a second, smoothed on arrival, and capped at 30 shown [P]. A shared "clap" counter. 3D emoji reactions instead of chat. | Active Theory V6, Bruno, Messenger |
| 17 | Event detail, past | The recording starts full screen and scroll-morphs into a tilted clip-path frame as the notes slide in. The photo gallery reveals through 30 SVG blinds at scrub 2, opens to a lightbox, and uses the image-tube inertia for swiping. | Zentry, Codrops blinds |
| 18 | Speakers index | Tilt cards: rotateX and rotateY up to ±8° from the cursor offset, perspective 800 px, 300 ms ease-out. The cursor turns into a "View talk" label. | Zentry rebuild [S] plus [P] |
| 19 | Speaker detail | The speaker's handwritten signature draws itself in with an SVG `stroke-dashoffset` animation over 1.2 s [P]. Their talks reuse the events track rows. | Noomo handwritten logo |
| 20 | Publications index | A horizontal timeline by year, pinned to scroll. Thumbnails get an ASCII or halftone shader on hover. | Unseen Wrapped |
| 21 | Publications detail | Restraint: one type family, the four brand colors plus ink, and no 3D inside the reading column. A `quickSetter` progress bar with a small character walking along it. The title's characters slide in (x −100→0, 0.02 stagger). | Oryzo, Codrops |
| 22 | About | An origin story told in comic panels: layered art on OGL or R3F planes, each looping gently. The panels start as grey clay, and the four colors arrive at the first seminar. | Ponpon's color-only-in-dreams approach |
| 23 | Contact | The characters act like game characters: the one nearest the focused field turns toward it, and validation messages appear in its speech bubble. The error in the page text stays the real source, linked with `aria-describedby`. | Messenger speech bubbles |
| 24 | 404 | A tiny planet with central gravity that you can drag. A lost character wanders on it, with a "Back to the seminar" button. | Messenger planet, Renaissance 404 |
| 25 | Registration success and ticket page | **Success:** about 40 Matter.js primitive shapes in the four colors rain down and pile up, and can be dragged [P]. **Ticket page:** a ticket card that tilts in 3D, whose code resolves with a text scramble (real text, final value in `aria-label`), plus a QR code and "Add to calendar". | Ponpon physics, Igloo scramble, Zentry tilt |

---

## Part 3: Performance and accessibility cautions

- **One canvas only.** Mount a single `<Canvas>` in the root layout and draw page regions with drei `<View>`. Browsers cap the number of WebGL contexts, and iOS Safari kills tabs that use too much memory (Messenger).
- **Event routing through the fixed canvas.** A full-screen canvas behind the page needs `eventSource` set to a parent element, with `eventPrefix="client"`. Otherwise hover and cursor-follow on the characters never fire.
- **On-demand rendering needs `invalidate()`.** `frameloop="demand"` only helps if you call `invalidate()` from the Lenis or ScrollTrigger update. Pause scenes that are offscreen (IntersectionObserver), and set `dpr={[1,2]}`.
- **Lenis, not ScrollSmoother.** The Codrops cinematic demo uses ScrollSmoother; use Lenis instead, never both. Wire them with `lenis.on('scroll', ScrollTrigger.update)`, `gsap.ticker.add(t => lenis.raf(t*1000))` and `gsap.ticker.lagSmoothing(0)`.
- **Page transitions in the Next App Router.** Exit animations don't reliably run when a page unmounts. Cover the screen, call `router.push`, and uncover when the pathname changes.
- **Asset pipeline.** Use Draco or meshopt geometry, KTX2 textures and gltf-transform (as Bruno and Immersive Garden do). Free geometries and textures on route change. Ship a low-quality mobile preset like Bruno's.
- **Variable-font animation is costly.** Changing `font-variation-settings` re-lays out text on every frame. Limit it to a few display headings and update only when the value changes; never on body text.
- **Keep text in the page, not in WebGL.** Igloo and Messenger draw text in WebGL, which screen readers can't read. On Zemi, every time, title and speaker name should be real HTML, and the canvas should be `aria-hidden`.
- **Reduced motion.** When `prefers-reduced-motion` is set, replace scrubbed and pinned scenes with static cards (the clock shows fixed times) and turn off Lenis smoothing, particles and physics rain. Keep audio off unless the user turns it on.
- **Pinned sections and keyboard users.** Pinned sections must not trap keyboard users. Add a "Jump to next event" skip link, keep tab order following the page order, and put the clock time in a `<time>` element.
- **Forms stay plain.** Keep registration, ticket and contact forms fast and simple, and save the delight for after success. FlowFest's 6.40 accessibility score shows where event sites usually fall short.
- **Live presence.** Throttle cursor broadcasts, smooth them on arrival, cap how many other visitors are drawn, and fall back to a simple counter under load.

---

**Sources**
- [Awwwards Sites of the Year (winners and nominees)](https://www.awwwards.com/websites/sites_of_the_year/)
- [Awwwards Sites of the Month](https://www.awwwards.com/websites/sites_of_the_month/)
- [Messenger case study](https://www.awwwards.com/messenger.html)
- [Igloo Inc case study](https://www.awwwards.com/igloo-inc-case-study.html)
- [Bruno's Portfolio case study](https://www.awwwards.com/brunos-portfolio-case-study.html)
- [Ponpon Mania case study](https://www.awwwards.com/ponpon-mania-a-comic-that-breathes-through-web-interaction.html)
- [Earlier Lusion site case study](https://www.awwwards.com/case-study-for-lusion-by-lusion-winner-of-site-of-the-month-may.html)
- [Oryzo BTS, part 3](https://blog.lusion.co/oryzo-bts-part-3-7-website-ux-ui-and-illustrations)
- [Utsubo: best Three.js websites 2026](https://www.utsubo.com/blog/best-threejs-websites-2026)
- [The Story of Slosh](https://www.awwwards.com/the-story-of-slosh.html)
- [Active Theory V6 on Awwwards](https://www.awwwards.com/sites/active-theory-v6)
- [Zentry case study](https://www.awwwards.com/zentry-case-study.html)
- [Zentry rebuild on GitHub](https://github.com/adrianhajdin/award-winning-website)
- [Dropbox Brand case study](https://www.awwwards.com/case-study-dropbox-brand-guidelines.html)
- [Immersive Garden case study](https://www.awwwards.com/case-study-immersive-gardens-new-website.html)
- [Mana Yerba Mate on Awwwards](https://www.awwwards.com/sites/mana-yerba-mate)
- [Noomo on its Awwwards recognition](https://noomoagency.com/insights/noomo-agency-best-websites-design-on-awwwards)
- [Unseen Studio 2025 Wrapped on Awwwards](https://www.awwwards.com/sites/unseen-studio-2025-wrapped)
- [Digital Design Days X on Awwwards](https://www.awwwards.com/sites/digital-design-days-x)
- [FlowFest 2025 on Awwwards](https://www.awwwards.com/sites/flowfest-2025)
- [How Figma shaped the Config 2025 identity](https://www.figma.com/blog/how-we-shaped-the-visual-identity-for-config-2025/)
- [The Renaissance Edition on Awwwards](https://www.awwwards.com/sites/the-renaissance-edition)
- [Codrops: cinematic 3D scroll with GSAP](https://tympanus.net/codrops/2025/11/19/how-to-build-cinematic-3d-scroll-experiences-with-gsap/)
- [Codrops: 3D scroll-driven text](https://tympanus.net/codrops/2025/11/04/creating-3d-scroll-driven-text-animations-with-css-and-gsap/)
- [Codrops: R3F image tube](https://tympanus.net/codrops/2026/02/17/reactive-depth-building-a-scroll-driven-3d-image-tube-with-react-three-fiber/)
- [Codrops: SVG mask transitions](https://tympanus.net/codrops/2026/03/11/svg-mask-transitions-on-scroll-with-gsap-and-scrolltrigger/)