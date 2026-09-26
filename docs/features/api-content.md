# api-content: speakers, publications, citations

Owner: api-content. Code: `apps/api/src/modules/speakers/**`, `apps/api/src/modules/publications/**`,
`packages/shared/src/citations.ts` (+ `citations.test.ts`). Verified locally on 2026-09-25 against the
shared API (port 4400), Postgres and live Crossref.

## Endpoints (all under `/api/v1`)

### Speakers

| route | who | returns |
|---|---|---|
| `GET /admin/speakers?search&visibility&sort=name\|recent\|talks&page&pageSize` | any admin, rows filtered to what they can `view` | `Paginated<SpeakerAdminRow>` |
| `GET /admin/speakers/lookup?q&limit` | any admin (all speakers, drafts too, max 20, prefix matches first) | `SpeakerRef[]` |
| `POST /admin/speakers` | `speakers.create` | `SpeakerAdmin` (201). `slug` optional: made unique from `fullName` |
| `GET /admin/speakers/:id` | `view` | `SpeakerAdmin` (talks on published events plus drafts/unlisted the caller can view, all their publications, private email) |
| `PATCH /admin/speakers/:id` | `edit`; changing `visibility` also needs `publish` | `SpeakerAdmin` |
| `DELETE /admin/speakers/:id` | `delete` | `SpeakerDeleteResult { ok, affectedTalks, affectedEvents, authorshipsKept }` |
| `GET /public/speakers?search&sort&page&pageSize` | public, `published` only | `Paginated<SpeakerCard>` (`SpeakerRef + talkCount + latestTalkAt`) |
| `GET /public/speakers/:slug` | public, `published` + `unlisted` | `SpeakerPublic` or `{ redirect }` (old slug), 404 for drafts |

- Search: `fullName`, `nickname`, `defaultOrganization`, `headline` (ILIKE).
- Sort `talks`: distinct events, desc. Sort `recent`: admin = last updated; public = latest published talk (nulls last).
- Talks are derived from `event_speakers` joined to events (+ `event_streams` for `computeEventStatus`),
  newest first, one entry per event (if someone is speaker and moderator on one event, the entry with a
  talk title wins). `organization` / `position` fall back to the speaker's defaults. Public talks: published
  events only. Public `talkCount` skips cancelled events; the list still shows them with status `cancelled`.
- `publications` on a speaker: where they are an author (`publication_authors.speaker_id`), published only on
  the public page, newest year first. Items carry `id` too.
- Delete: `event_speakers` rows go via FK cascade (counted in `affectedTalks`). Their paper authorships are turned
  into manual authors first (name, photo, organization, and their website/scholar/orcid link copied), so papers
  keep the name. Grants and slug redirects are cleaned up.

### Publications

| route | who | returns |
|---|---|---|
| `GET /admin/publications?search&type&year&tag&speaker&visibility&sort=year\|recent\|title&page&pageSize` | any admin, filtered to `view` | `Paginated<PublicationAdminRow>` (card + visibility, eventCount, dates, permissions) |
| `GET /admin/publications/lookup?q&limit` | any admin (all, max 20) | `PublicationLookupItem[]` (the web's `PublicationRef`) |
| `GET /admin/publications/doi?doi=` | `publications.create` or `edit` on any publication | `DoiLookupResult` |
| `POST /admin/publications/quick { title, url }` | `publications.create` | `PublicationLookupItem` (201): draft, type `other`, links `[{ kind: 'publisher', label: 'Link', url }]` |
| `POST /admin/publications` | `publications.create` | `PublicationAdmin` (201). `slug` optional: made unique from the title |
| `GET /admin/publications/:id` | `view` | `PublicationAdmin` (published events plus drafts/unlisted the caller can view, `authorInputs` for the form) |
| `PATCH /admin/publications/:id` | `edit`; changing `visibility` needs `publish` | `PublicationAdmin`. `authors`, when sent, replaces the whole list (order = `sortOrder`) |
| `DELETE /admin/publications/:id` | `delete` | `PublicationDeleteResult { ok, affectedEvents }` |
| `GET /public/publications?search&type&year&tag&speaker&sort&page&pageSize` | public, `published` only | `Paginated<PublicationCard>` |
| `GET /public/publications/:slug` | public, `published` + `unlisted` | `PublicationDetail` or `{ redirect }`, 404 for drafts |

- Filters: `type`, `year` (publishedYear), `tag` (keyword, case-insensitive exact), `speaker` (speaker slug or id;
  public ignores draft speakers), `search` over title, subtitle, abstract, container title, DOI, keywords and
  author names (manual + speaker full name / nickname). Default sort: year, month, day desc, then title.
- Authors: speaker authors show the speaker's current name and photo and link to `/speakers/<slug>` (`speaker`
  is a `SpeakerRef`, `url` null); manual authors carry `url` (opens in a new tab), `avatar`, `organization`.
  On public payloads a draft speaker keeps name and photo but loses the link (`speaker: null`, `speakerSlug: null`).
- Validation (400 with `details` as zod-like issues, so `applyApiErrorToForm` pins them): unknown or duplicate
  `authors.N.speakerId`, cover must be an image, `pdfAssetId` must be a PDF, author photos must be images,
  failed uploads refused. Slug taken: 409 with `details.issues[path=slug]`.
- `citationKey`: auto when empty (create, or PATCH with `""`): `makeCitationKey` from shared
  (`firstAuthorFamily + year + firstTitleWord`, lowercase ASCII, e.g. `lecun2015deep`), then `b`, `c`... when another
  publication already uses it. Once set it stays put (people cite it), even when the title changes.
- `hasPdf` / `pdf`: only when the PDF asset is `ready`. `events`: public = published events only.

### DOI prefill (Crossref)

`GET https://api.crossref.org/works/<encoded doi>` with `User-Agent: Zemi (mailto:zemi@labmgm.org)`, 8s timeout.
Input may be `10.x/y`, `doi:10.x/y` or a doi.org link. Errors: 422 not a DOI (`details.issues[path=doi]`),
404 unknown DOI, 503 Crossref down/bad body, 504 timeout.

Mapping: type (`journal-article`, `proceedings-article` -> `conference-paper`, `posted-content` -> `preprint`,
`book`/`monograph`/`edited-book` -> `book`, `book-chapter`/`book-section`/`book-part` -> `book-chapter`,
`dissertation` -> `thesis`, `report*` -> `report`, `dataset` -> `dataset`, else `other`), title and subtitle with
inline markup stripped, container title (falls back to the event name for proceedings and the institution for
preprints), volume, issue, page (dashes to hyphens), publisher (the institution for theses), date parts
(issued, then print, online, published, approved, created; nulls tolerated), first ISSN / ISBN, publisher URL
(`resource.primary.URL`, else `URL`), abstract with JATS stripped (paragraphs kept, "Abstract" heading dropped),
language, Creative Commons license as `CC BY-NC 4.0`, `authorsRaw` (given + family or organization `name`, first
affiliation, ORCID id). Extra: `authors` is ready for the form (manual authors with the ORCID URL), and each
`authorsRaw[i].speaker` is the directory speaker when exactly one has that name (case and accent insensitive),
in which case `authors[i]` is `{ speakerId }`. Every field is clamped to `publicationInput` limits.
Imported text gets en and em dashes replaced by hyphens (house rule).

### Revalidation and audit

Every mutation writes an audit entry (`speaker.create|update|delete`, `publication.create|update|delete|quick-create`,
with `fields`, slug and visibility changes in `meta`; no-op PATCHes write nothing) and, after the commit, posts tags:
speakers: `speakers`, `speaker:<id>`, plus `events` + `event:<id>` for every event they're on and `publications` +
`publication:<id>` for every paper they wrote. Publications: `publications`, `publication:<id>`, `events` +
`event:<id>` for referencing events, `speakers` + `speaker:<id>` for old and new speaker authors.

## Citations (`@zemi/shared`)

```ts
import { formatCitation, formatAllCitations, publicationToCitationSource, citationFileName, CITATION_FILE_TYPES, CITATION_FORMATS } from '@zemi/shared';
const src = publicationToCitationSource(detail, { fallbackUrl: `${SITE_URL}/publications/${detail.slug}`, accessedAt: '2026-09-25' });
formatCitation('apa', src);            // "LeCun, Y., Bengio, Y., & Hinton, G. (2015). Deep learning. Nature, 521(7553), 436-444. https://doi.org/10.1038/nature14539"
formatAllCitations(src);               // Record<CitationFormat, string> for a "Cite this" panel
citationFileName('bibtex', src);       // "lecun2015deep.bib"; CITATION_FILE_TYPES.bibtex.mime = "application/x-bibtex; charset=utf-8"
```

- Styles: APA 7, IEEE, MLA 9, Chicago author-date (17th), Harvard (Cite Them Right), Vancouver (NLM), BibTeX,
  RIS, plain text. Per type: journal, conference, book, chapter, thesis, report, dataset, software, preprint
  (arXiv aware), article (dated), poster, generic.
- Et al.: APA lists up to 20 (21+ gives 19, `. . .`, last); IEEE 7+ gives first + et al.; MLA 3+; Chicago 11+ gives 7
  + et al.; Harvard 4+ gives first + et al.; Vancouver 7+ gives 6 + et al.
- Names: "Given Family" or "Family, Given". Particles (van der, de, bin...), suffixes (Jr., III), honorifics (Dr.,
  Prof., Ir.) and degrees (", M.Kom.", ", Ph.D.") handled. Single names (Sukarno) are never inverted. `{MGM Laboratory}`
  or org words (Laboratory, Universitas, Team...) mean an organization. Hyphenated given names give `J.-P.`.
- BibTeX: `article`, `inproceedings`, `phdthesis`/`mastersthesis`, `book`, `incollection`, `techreport`, `software`,
  `misc`; LaTeX specials escaped; acronyms and inner capitals braced (`{CNN}`, `{LeCun}`-style); month macros; pages `--`;
  arXiv `eprint` + `archiveprefix`. RIS: `TY` codes JOUR/CONF/THES/BOOK/CHAP/RPRT/DATA/COMP/GEN, CRLF lines, `ER  - `.
- Titles keep the casing they were typed with (auto sentence case breaks names and acronyms). Page ranges use plain
  hyphens everywhere (MLA and Vancouver elide: `436-44`), never en dashes.
- Thesis degree: `CitationSource.thesisKind`; `publicationToCitationSource` guesses it from subtitle, container,
  publisher and keywords (Tesis/Magister/Master -> master's, Disertasi/PhD -> doctoral, Skripsi -> bachelor's).
  Unknown means doctoral.
- Software/dataset version: `volume` (or `CitationSource.version`).

Tests: `pnpm --filter @zemi/shared test` (22 cases, exact APA + BibTeX for journal/conference/thesis/book/software,
plus IEEE, MLA, Chicago, Harvard, Vancouver, RIS, text and edge cases). API: `npx vitest run src/modules/speakers
src/modules/publications` in `apps/api` (Crossref mapping, error mapping, PATCH defaults trap, dedupe helpers).

## For other workstreams

- **events**: `imports: [SpeakersModule, PublicationsModule]`, then
  `speakers.refsByIds(ids, { publicOnly: true })` gives `Map<id, SpeakerRef>` (drafts dropped) and
  `publications.cardsByIds(ids, { publicOnly: true })` gives `Map<id, PublicationCard>` (published + unlisted,
  draft speakers unlinked). Use them for `EventDetail.speakersFull`, `rundown[].speaker`, `publications`.
- **web admin**: POST bodies may omit `slug`. PATCH only changes keys you send. Lookups return plain arrays.
  DOI errors: 422 has `details.issues[path=doi]`. New shared types: `SpeakerCard`, `SpeakerAdminRow`,
  `SpeakerDeleteResult`, `speakerCreateInput`, `PublicationAdminRow`, `PublicationLookupItem`,
  `publicationCreateInput`, `PublicationDeleteResult`, `doiLookupQuery`, `authorsRaw[].speaker`.
- **web public**: `SpeakerCard` is a superset of the web's `SpeakerListItem`. Old slugs answer `{ redirect }` with 200.

## Decisions

- zod 4 `.partial()` still applies `.default()`s, so PATCH handlers keep only the keys present in the raw body
  (`presentOnly`). Anyone else using `xxxInput.partial()` for PATCH has the same trap.
- Quick-create stubs are `visibility: 'draft'` as specified. They don't show on the public site until someone
  publishes them, so an event page that lists only public publications won't show a fresh stub.
- Changing visibility needs `publish`; other fields need `edit`. Re-sending the same visibility is fine with `edit`.
- Public detail answers `unlisted` items; public lists show `published` only.
- Deleting a speaker keeps their paper authorships as manual authors instead of leaving nameless rows.
- Admin details never leak unannounced events: a draft or unlisted event shows in a speaker's talks or a
  publication's events only when the caller can `view` that event (published ones always show).
- DOI speaker matching only when exactly one directory name matches, to avoid linking the wrong person.

## Known gaps

- No accent-insensitive DB search (no `unaccent` extension); lookups match accents literally.
- Citation styles don't have editors, edition, place or report series (the schema has no fields for them).
- Crossref is called live on each lookup (no cache). Fine for an admin form; add a small LRU if it gets chatty.
- Not verified: the admin/public web pages consuming these endpoints (other workstreams), Crossref rate limiting.

## Review (2026-09-26)

Re-checked against the shared API (Postgres and MinIO back up) with a throwaway limited admin, then deleted every test record.

- **Draft-event fix confirmed.** Test admin had `view`+`edit` on `lukas-becker` and `view` on one paper. They no longer see the draft
  `zemi-104` event in that speaker's talks or in the paper's events. Superadmin still sees it. Lists are filtered to the grants.
  403 on edit without publish (visibility), delete, create without the capability, other people's records, and DOI lookup. 403 without CSRF, 401 anonymous.
- **Fixed: spaces-only names and titles.** zod `min(1)` lets `"   "` through, and the service trims it before saving. So a speaker
  create stored `fullName: ""` with slug `untitled`, and `PATCH {"fullName":"  "}` wiped a real name. The same happened to publication titles,
  manual author names and quick stubs. There's a new helper, `assertNotBlank` in `content.util.ts`. It returns 400 `validation` with
  `details[].path` (`fullName`, `title`, `authors.N.fullName`), so the form pins the error. It runs on speaker create and PATCH,
  publication create and PATCH, quick create, and on manual authors in `validateRefs`. All six cases were re-tested with curl, and the
  stored rows didn't change. There's a spec case too.
- **Fixed: speaker revalidation now includes events where the person appears only in the rundown.** `rundown_items.speaker_id` is
  `SET NULL` on delete, so those pages change too. Typechecked only: today every rundown speaker is also on the lineup.
- Web: `/speakers` renders API data. `/speakers/[slug]` and `/publications` aren't built yet (404), so the redirect is proven only
  at the API level (`{ redirect }`).

Known gaps found in review:
- For a speaker-only admin, the admin list's `talkCount` and `latestTalkAt` (speakers) and `eventCount` (publications) still count
  draft events. They show a number or date, never a title.
- All 60 seeded publications have `citation_key` null. Citations fall back to `makeCitationKey`, and the first PATCH saves a key.
