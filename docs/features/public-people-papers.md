# public-people-papers: speakers + publications pages

Owner: public-people-papers. Code: `apps/web/src/app/(public)/{speakers,publications}/**`,
`apps/web/src/components/public/{speakers,publications}/**`. Verified 2026-09-26 against the shared dev
servers (web :3300, API :4400) on the re-seeded database (40 speakers, 58 publications).

## Routes

| route | what |
|---|---|
| `/speakers` | "People who sat at the front." Header with a 3-portrait collage, counters and a nickname marquee. Directory: search, "where from" filter (Everyone / From the lab / Visitors), sort (Most talks, Newest, A to Z), Shuffle (re-deals the grid with a FLIP layout animation and re-rolls the backdrop shapes). URL mirrors `?q&sort&from`. |
| `/speakers/[slug]` | Big portrait in the person's frame shape on a brand backdrop, scroll parallax on both layers, their backdrop character peeking over the edge (cheers on hover). Full name (CaslHeading), nickname, headline, position, links with the brand link icons (new tab, `noopener noreferrer`; mailto without a target), counters, "Catch X on 16 Oct" when a talk is coming up. Bio (BlocksRenderer), talks timeline, papers (rich rows with cover preview), "Other speakers" strip. JSON-LD `Person`. Old slug: 308. Unknown or draft: segment `not-found.tsx`. |
| `/publications` | "Papers that sat at our table." Graph-paper page. Header: counters + a procedural 3D paper stack that fans out as the header scrolls away and fans more on hover (Q sits on top, watches the pointer, cheers at full fan). Browser: search, type chips with counts, year / keyword / speaker selects (a bottom Sheet on phones), sort (Newest, Oldest, Title), list or grid view (remembered in localStorage), year groups with sticky year labels, "Show 30 more" paging, and a cover that follows the cursor. URL mirrors `?q&type&year&tag&speaker&sort`. |
| `/publications/[slug]` | Editorial layout: type + status chips, title (word reveal), subtitle, authors (speaker authors link to `/speakers/<slug>`, manual authors to their URL in a new tab, avatars, corresponding mark + legend), venue line (container, volume(issue), pages, publisher, date), cover (4:5 or a generated paper cover). Aside: Read the PDF (in-page viewer), Download (size), publisher / DOI / other links with kind icons, "The fine print" table (DOI, ISBN, ISSN, arXiv, cite key, language, license with CC deed link, publisher). Main: abstract with a drop cap and 68ch measure, body blocks, keyword chips linking to `/publications?tag=`, Cite this (all 9 `CITATION_FORMATS`), Presented at Zemi (event cards). JSON-LD + Highwire tags. Old slug: 308. Unknown or draft: `not-found.tsx`. |

## Files

```
app/(public)/speakers/page.tsx, [slug]/page.tsx, [slug]/not-found.tsx
app/(public)/publications/page.tsx, [slug]/page.tsx, [slug]/not-found.tsx
components/public/speakers/
  data.ts                  server fetchers: getAllSpeakers(), getAllPublications(params) (loops pages of 100, cap 1000)
  lib.ts                   server-safe: siteUrl, safeHref, jsonLdString, fold (accent-free search), hashString,
                           frame shapes + masks (speakerLook), positionLine, publicLinks, firstParam, isLabOrg
  speaker-portrait.tsx     photo in a frame mask (arch, circle, rounded square, drop) on a brand shape; squish on active
  speaker-card.tsx         directory card: nickname bubble + talk count pop on hover/focus, "Next 16 Oct" if within 21 days
  speakers-directory.tsx   search / filter / sort / shuffle grid (motion layout + AnimatePresence popLayout)
  front-row.tsx            header collage of the three most frequent speakers
  speaker-hero-portrait.tsx, talks-timeline.tsx, other-speakers.tsx, speaker-papers.tsx
  search-box.tsx, enter.tsx (mount entrance gated on useSiteReady), use-url-sync.ts, speakers.module.css
components/public/publications/
  lib.ts                   type look (label, shape, tone), status labels, venueParts, publishedLabel, highwireDate,
                           splitPages, doiUrl, arxivUrl, licenseUrl, languageName, sitePdfPath, hasKeyword
  publications-browser.tsx filters + list/grid + groups + paging + cover preview
  publication-row.tsx      PublicationRow (list) and PublicationTile (grid, foundation Card)
  cover-preview.tsx        DOM cover that lerps after the cursor (fine pointers, not under reduced motion)
  paper-cover.tsx          generated graph-paper cover for papers without one
  paper-stack-stage.tsx    SceneCanvas + scroll ref; paper-stack-scene.tsx is the lazy R3F scene
  cite-box.tsx             ARIA tabs, copy with confetti + drawn check, .bib / .ris / .txt downloads
  pdf-reader.tsx           Read (dialog + iframe when the browser can show PDFs, else a new tab) and Download
  publication-parts.tsx    AuthorsRow, VenueLine, MetaTable, LinkList, RelatedEvents (server)
  pub-link-icon.tsx        icons for PUBLICATION_LINK_KINDS (pdf, publisher, code, dataset, slides, video, poster) + DOI, download
  publications.module.css
```

## Decisions

- **Filtering is client-side over the full list.** Both indexes fetch every published item on the server
  (cached 30s, tagged `speakers` / `publications`) and filter in the browser, so chips, search and shuffle are
  instant. `useUrlSync` writes the query string with `history.replaceState` (debounced 250ms): no RSC round trip
  per keystroke, shareable links still work, and the page reads `searchParams` for the first render.
  Keyword matching is case-insensitive exact like the API `tag` filter; API order is the sort tie-break
  (cards have no month/day). Past a few hundred papers this should move to server paging (see gaps).
- **Frames.** Each person gets a stable frame (arch, circle, rounded square or a "drop" with one sharp corner)
  and a brand backdrop from a hash of the slug. Triangles never crop faces: Hunch only appears as a backdrop.
  Shuffle re-rolls backdrops, never frames. The seed portraits are 128px upscaled, so the big portrait photo
  stays at about 280 to 340 CSS px and the shapes carry the size.
- **PDF on the site origin.** `sitePdfPath()` turns the API media URL into `/media/...` (the web rewrite).
  That makes `download` work, keeps the viewer iframe first-party, and puts `citation_pdf_url` on the article
  host (Google Scholar prefers that). The viewer opens only where `navigator.pdfViewerEnabled` is true, the
  pointer is fine and the viewport is 768px+; phones get a plain new-tab link (it is also the no-JS behavior).
- **Highwire** via `metadata.other` (arrays emit one `citation_author` per author). Container maps to
  `citation_journal_title`, `citation_conference_title` (conference paper, poster), `citation_inbook_title`
  (chapter), `citation_dissertation_institution` (thesis) or `citation_technical_report_institution` (report).
  Institutions per author are not emitted (Next can't interleave them with authors).
- **JSON-LD** always has `ScholarlyArticle`; datasets, software, books, theses, chapters and reports add their
  closer type (`["ScholarlyArticle", "Dataset"]`...). Journal volume/issue as `PublicationIssue` /
  `PublicationVolume` / `Periodical`; DOI as `identifier` + `sameAs`; PDF as `encoding`; presenting events as
  `subjectOf`. Speaker pages: `Person` with `sameAs` (http links only), `affiliation`, `performerIn`.
- **Wide screens.** The project's `3xl` breakpoint is in px while Tailwind's are in rem, so `3xl:` rules are
  emitted before `xl:` and lose the cascade (checked: 5 columns at 2560). These pages use `min-[120rem]:`
  (1920px) instead, which sorts correctly (6 speaker columns at 1920 and 2560).
- **Citations** are formatted on the server (`formatAllCitations(publicationToCitationSource(...))`, accessed
  date in Jakarta) and passed as strings, so there is no hydration drift. The cite key shown is the stored one
  or `makeCitationKey()` (the seed leaves it empty).
- **Link safety.** Link fields are free text in the contract, so every speaker/publication/author URL goes
  through `safeHref` (http, https, mailto only).
- **3D budget.** One canvas on the publications index (the stack), none on detail pages (DESIGN restraint in
  the reading column). The cursor preview is DOM. Reduced motion: still fanned pose, no preview, no parallax,
  no squish, fades only.
- **Graph paper** only on the publications index (DESIGN section 6). Detail pages stay on plain paper.
- Fine print sits in the sticky aside on desktop and after the reading on phones/tablets (rendered twice,
  one copy `display: none` per breakpoint).

## Verified (how)

- Playwright (headless Chromium, SwiftShader GL) at 390x844, 820x1180, 1440x900, 2560x1440 for all four
  pages; shots in `scratchpad/shots/public-people-papers/`. No horizontal overflow (scrollWidth check), no
  console errors or page errors on any page.
- Interactions: speakers shuffle (order changes, backdrops re-dealt), sort A to Z (URL `?sort=name`),
  search ("kyoto" gives 2), empty state; card hover (squish, nickname bubble, talk count); publications type
  chip + search + grid toggle (URL `?type=dataset&q=batik`), `?tag=Batik` deep link (4 results), mobile
  filter sheet; cite box: tab click, ArrowLeft/Right roving focus, copy (clipboard holds the BibTeX), confetti;
  PDF viewer opens in a dialog and renders the PDF (full Chromium, 1440 and 2560); at 390 and 820 (touch) it
  opens the PDF in a new tab instead, as designed. Cite box checked at all four sizes.
- `curl`: Highwire tags and JSON-LD present in the HTML. With a Googlebot UA the `citation_*` tags are in
  `<head>`; for normal browsers Next streams metadata into `<body>` (that's Next's default, fine for Scholar); `/media/...` PDF on the web origin answers 200
  `application/pdf` with no framing headers; old slugs answer 308 (tested with temporary `slug_redirects`
  rows, removed after); unknown slugs 404 with the segment not-found page.
- Reduced motion pass (`reducedMotion: 'reduce'`): still frame of the stack, content visible, no motion.
- `pnpm --filter @zemi/web typecheck` passes. Prettier applied. No en or em dashes in these files.

## Known gaps

- Headless Chromium only runs IntersectionObservers and the R3F canvas after input, so screenshots needed a
  wheel/mouse nudge. Not an issue in real browsers, but worth knowing for anyone automating shots.
- Talk statuses on speaker pages come from the API at render time (cached 30s); they don't tick live
  (SpeakerTalk has no `endsAt`).
- Client-side filtering ships every card to the browser. Cards are trimmed first (`slimCard`: 320w author
  avatars without LQIP, covers up to 640w), so `/publications` is about 470 KB of HTML, 55 KB gzipped, for 58
  papers. At several hundred papers switch the browser to server paging (`/public/publications` supports it).
- No co-speaker data on the public speaker payload, so "Other speakers" favors the same organization, then a
  stable mix, instead of "people they shared a Friday with".
- Not verified on real iOS/Android devices (PDF viewer is deliberately bypassed there).
- Once Chrome's PDF viewer has focus it swallows Esc, so the dialog closes with the close button (or a click
  outside) in that case.

## Requests (outside my ownership)

- **web foundation**: `getSpeakers()` in `lib/api/server.ts` is typed as `SpeakerRef & { talkCount? }`; the API
  returns `SpeakerCard` (with `latestTalkAt`). I used `apiGet` directly in `components/public/speakers/data.ts`.
  Consider retyping it to `SpeakerCard` and adding `sort`.
- **web foundation**: `--breakpoint-3xl` / `--breakpoint-xs` in `globals.css` are px while the defaults are rem,
  so `3xl:` / `xs:` utilities sort before `sm:`...`2xl:` and get overridden (e.g. `admin/stream/obs-setup.tsx`,
  `admin/ui/button.tsx` use them). Switching them to `120rem` / `23.75rem` fixes the order.
- **api-content** (optional): a `?download=1` on `/media/*` (Content-Disposition: attachment) would make
  "Download" work even cross-origin; and co-speaker slugs on `SpeakerPublic` would improve "Other speakers".
