# admin-content: speakers, publications, venues, media library

Owner: admin-content. The dashboard pages for the content that events point at. Everything is built
on the admin kit (`@/components/admin/ui`, `@/components/admin/fields`, `@/lib/admin/*`) and the
shared contract (`@zemi/shared`). No new dependencies.

## Routes

| route | file | what |
|---|---|---|
| `/admin/speakers` | `speakers/page.tsx` -> `content/speakers/speakers-list.tsx` | search, visibility filter, sort (name / recently updated / most talks), grid of faces or a table (choice remembered per browser), talk counts, visibility chips, row menu (edit, view on site, delete) |
| `/admin/speakers/new` | `speakers/new/page.tsx` -> `speaker-editor.tsx` | create. Needs `speakers.create`, otherwise a friendly "you can't add speakers yet" |
| `/admin/speakers/[id]` | `speakers/[id]/page.tsx` | edit, or a read-only view without `edit`. Title comes from `generateMetadata` |
| `/admin/publications` | `publications/page.tsx` -> `content/publications/publications-list.tsx` | search, type, year, visibility, sort. Table on tablets and up (column toggles, density), cards on phones |
| `/admin/publications/new`, `/[id]` | `publication-editor.tsx` | the sectioned editor (below). Create needs `publications.create` |
| `/admin/venues` | `venues/page.tsx` -> `content/venues/venues-page.tsx` + `venue-sheet.tsx` | table (cards on phones), client search + kind filter, usage counts, create/edit Sheet, delete with a warning |
| `/admin/media` | `media/page.tsx` -> `content/media/media-library.tsx` + `asset-sheet.tsx` | every asset, filters (kind, purpose, status), search, infinite scroll with a "Load more" fallback, detail Sheet |

All list filters live in the URL through `nuqs` (`?q=&vis=&sort=&page=` and so on), so a filtered view
can be shared or reloaded. The media Sheet is deep linkable with `?asset=<id>`.

## Endpoints used

```
GET  /admin/speakers?search&visibility&sort&page&pageSize   Paginated<SpeakerAdminRow>
GET|PATCH|DELETE /admin/speakers/:id   POST /admin/speakers   GET /admin/speakers/lookup?q
GET  /admin/publications?search&type&year&visibility&sort&page&pageSize   Paginated<PublicationAdminRow>
GET|PATCH|DELETE /admin/publications/:id   POST /admin/publications   GET /admin/publications/doi?doi=
GET|POST /admin/venues   PATCH|DELETE /admin/venues/:id
GET  /admin/assets?purpose&kind&status&search&page&pageSize[&mine=true]
GET|PATCH|DELETE /admin/assets/:id   POST /admin/assets/:id/recrop   GET /admin/assets/:id/original
```

List responses go through `toPaginated()` (`content/shared/types.ts`), which accepts a
`Paginated<T>`, a bare array or `{ items }`, like the kit's pickers do.

## Building blocks in `components/admin/content/shared`

- `types.ts`: list row types (a required core plus optional extras, so the UI never trusts a field
  that might be missing), `toPaginated`, `effectiveActions(item.permissions, ability)`.
- `form-utils.ts`: `blankToNull`, `pickDirty` (PATCH bodies only carry fields that changed),
  `wordCount`, `cleanDoi` + `DOI_PATTERN`, `newKey`.
- `use-dirty-guard.ts`: `beforeunload` plus a capture-phase click listener that asks "Leave without
  saving?" before in-app links navigate away. `release()` lets a programmatic navigation through.
- `content-ui.tsx`: `VisibilityField` (three cards, read-only without `publish`), `SectionNav`
  (sticky scrollspy on desktop, chip strip on phones), `EditorCard`, `EditorSkeleton`,
  `ViewToggle`, `useStoredState` (localStorage with try/catch), `NoCreateAccess`, `ReadOnlyNote`.
- `scoped-form-field.tsx`: `ScopedFormField`, a `FormField` that also honours `<ReadOnlyScope>`
  (see Known gaps).

## Speakers

- Editor sections: basics (full name, nickname, headline, `SlugField` at `/speakers/<slug>`), where
  they work (default org + position), bio (`BlockEditor`), links (`LinksEditor` with the custom icons),
  private email. Aside: photo (`ImageUploadCrop`, purpose `speaker-avatar`, 1:1, round crop,
  zoom/rotate/adjust), a live "On the site" preview, visibility, talks, publications, dates, delete.
- Talks are read-only, built from event line-ups. Each row opens the event workspace
  (`adminRoutes.event(eventId)`), with cover thumb, Zemi number, date, role and status.
- Publications link to the admin editor when the payload has an `id`, else to the public page.
- Delete warns with the real numbers: talks (and how many are coming up), papers, and the public URL.
  People on talks must type the name. The success toast reports `affectedEvents` and
  `authorshipsKept` from the API.
- Permissions: create needs `speakers.create`. Without `edit` the whole page is read-only with a
  note. Without `publish` the visibility cards are locked and `visibility` is never sent in the PATCH.

## Publications

Sections (with a sticky section nav, error dots per section):

1. **Basics**: type, status, title, subtitle, `SlugField` (`/publications/<slug>`), visibility.
2. **Authors**: `AuthorsEditor`, sortable (pointer, touch, keyboard). Add from `SpeakerPicker`
   (speaker reference, optional organization override for this paper; "Add X as a new speaker" when
   allowed) or "Add someone else" (full name, organization, profile link, photo through a small
   dialog with `ImageUploadCrop` purpose `author-avatar`). Corresponding author switch per row.
3. **Where it appeared**: container title (label changes with the type: Journal, Conference,
   University...), volume, issue, pages, publisher, year / month / day (month and day unlock in order).
4. **Identifiers**: DOI (accepts `doi:`, `https://doi.org/...`, cleans on blur) with **Fill from DOI**,
   ISBN, ISSN, arXiv id (with a link), citation key with a "Suggest" button (`lecun2015deep`).
5. **Files and links**: PDF mirror (`FileUpload`, `publication-pdf`), publisher link, extra links
   (`PubLinksEditor`: `PUBLICATION_LINK_KINDS`, required label filled from the kind, kind guessed
   from the URL), cover (`ImageUploadCrop`, `publication-cover`, 4:5).
6. **Content**: abstract textarea with a live word count, body `BlockEditor`, keywords `TagsInput`
   (30 max, 60 chars, case kept), language and license with suggestions.
7. **Cite this**: every `CITATION_FORMATS` entry through `formatCitation` from `@zemi/shared`, live as
   you type (`useDeferredValue`), copy per format, "See every format at once". The source is built with
   the shared `publicationToCitationSource` and the same options the public page passes (its own URL as
   the fallback when there is no DOI or publisher link, today's WIB date as `accessedAt`), so status,
   thesis degree and the publisher-link fallback match. "Suggest" for the citation key uses the shared
   `makeCitationKey`. On 2xl screens it sits in a sticky third column.
8. **Related events** (edit only, read-only list to the event workspace).

Duplicate DOI heads-up: once the DOI field holds a valid DOI, the editor searches the list
(`GET /admin/publications?search=<doi>`, the list search covers DOIs) and, on an exact match with another
publication, shows a yellow note with its title and an "Open it" link (new tab, so unsaved work stays).
It warns, it never blocks: the API has no unique DOI rule. The create page does not autofocus the title,
so pasting a DOI first does not flash a "required" error on a field nobody has touched.

Fill from DOI: `GET /admin/publications/doi?doi=`, then a diff dialog. Each changed field shows
"now" and "from Crossref"; empty fields are ticked by default, fields you already typed are not.
Authors use `authorsRaw`: a `speaker` match from the API becomes a linked author, `null` stays
manual, and if the API did not match at all the web tries `/admin/speakers/lookup` by exact name.
404 and 5xx get their own friendly copy.

The form uses a form-local zod schema (`publicationFormSchema`: strings stay strings, author and
link rows carry UI keys and display refs), converted with `formToInput()` and checked again with the
shared `publicationInput` / `publicationUpdateInput` before sending. Server field errors land on the
fields through `applyApiErrorToForm`.

## Venues

Table with kind icon, where (building, floor, address), seats, events using it, and a Maps button.
The Sheet edits name, kind, building, floor, capacity, address, Google Maps URL (with an "Open" link
once it is a valid URL) and crew notes; closing with unsaved changes asks first. Delete says how many
events lose the room and needs the name typed when any do. People without `venues.manage` (the nav
shows Venues to event editors too) get a read-only Sheet and no create/delete.

## Media library

Grid tiles per kind: image variants with LQIP, video poster with duration and a play badge (a
missing poster falls back quietly), document/audio "paper" tiles on graph paper. An image that has no
variants yet stays photo-shaped: a shimmering tile with an image glyph while processing, a red tile with
a broken-image glyph when it failed. Badges for
processing/failed and "No alt". Processing tiles refresh every 5 s until they settle.
The Sheet shows the preview (image on a checkerboard, `<video>` with WebM + MP4, PDF in an iframe when
`navigator.pdfViewerEnabled` is not false, otherwise a card with "Open the file" since Android Chrome and
headless shells would download a framed PDF; `<audio>`), editable alt / caption / credit (`PATCH /admin/assets/:id`), facts (file name, type,
size, dimensions, length, uploaded, id), every public variant URL with copy and open, "Original"
download, **Re-crop** for images (the kit's crop dialog on the private original, locked to the
purpose's aspect, then `recropAsset` and a toast when the new sizes are live) and delete with a
warning that every place using it turns empty. Without `media.library` the page shows "your uploads"
(`mine=true`) instead of an error.

## Decisions

- Visibility is its own permission (`publish`), so PATCH bodies are built from dirty fields only
  and never include `visibility` without it. A view-only admin never sees a Save button.
- BlockNote may normalize content on load, so editor changes only reach the form after a real
  interaction (pointer, key, paste, drop). Discard remounts the editor.
- After a create, `/auth/me` is refetched so the new ownership grant is in the ability before the
  record opens.
- On phones, tables become cards; filter selects shrink to share a row.
- Tables pick their columns by width (`useMediaQuery`) so nothing scrolls sideways from 360px up:
  speaker names wrap to 2 lines, speakers drop "Updated" under 1280px and, on phones, keep name, talks
  and the menu, with a visibility chip under the name and no column/density buttons. Publications fold
  "Where" under the title under 1280px and show "Updated" from 1536px. SSR renders the narrow set and
  the client switches after hydration; the sweeps logged no console errors (so no hydration
  mismatch), but the first paint on a laptop was not measured.

## Verified (Playwright, real shared API on :4400, superadmin and a limited admin)

Screenshots in the scratchpad `shots/admin-content/`. The resume run's shots start with `r-` and `r2-`.

**Redone after the incident** (Postgres rebuilt and re-seeded, S3 now versitygw instead of MinIO,
2026-09-26 around 03:50 WIB). Every test record below was deleted through the UI afterwards, so the seed
data is untouched.

- **Width sweep** at 360, 390, 820, 1024, 1280, 1440 and 2560 over speakers (grid and table),
  publications, venues, media, speaker new and publication new: no page or table scrolls sideways, no
  console errors, no 5xx. Shots read at 390, 820, 1440 and 2560.
- **Created a speaker with an avatar crop**: seed photo, zoomed in the crop dialog, uploaded, processed
  on versitygw, saved. The API returned a 483x483 avatar with three WebP sizes and the GitHub link. Edit
  page shot at 390, 820, 1440, 2560.
- **Created a publication with DOI fill** (`https://doi.org/10.1038/nature14539` pasted): the diff dialog
  offered 13 changes, all ticked because the form was empty. Applying filled title, journal, volume,
  issue, pages, publisher, date (2015-05-27), ISSN, URL, language and 3 authors. Then a directory speaker
  and a manual author (with organization) were added, corresponding toggled, keywords and abstract
  filled, saved (201, redirect in about 260 ms), reopened at 390, 820, 1440, 2560. The saved record had
  every field. The live APA preview read "LeCun, Y., Bengio, Y., Hinton, G., ..., & Courville, A. (2015).
  Deep learning. Nature, 521(7553), 436-444. https://doi.org/10.1038/nature14539". With the new seed no
  Crossref author matches a directory speaker, so all three came in as manual authors.
- A second save with the same slug came back 409 and landed as an inline field error ("The address ...
  is already taken"), no toast.
- **Duplicate DOI note**: typing a seed DOI (`10.5555/ZEMI.2026.001`, upper case on purpose) on the new
  page shows the note at 1440, 390 and 360; the twin's own edit page shows none. With the form dirty,
  "Open it" opened a new tab with no "Leave without saving?" prompt, and the first tab kept its URL and
  unsaved changes (the dirty guard skips `target=_blank`).
- **Created a venue** in the Sheet (kind, building, floor, seats, address, maps link with its "Open"
  link, notes), toast "... is ready for Fridays.", reopened in the Sheet at 390, 820, 1440, 2560.
- **Deletes through the UI**: the speaker dialog said "not on any talks yet, 2 papers list them as an
  author", the toast reported "2 papers kept their name as a plain author", and the paper still listed
  the name afterwards. The publication dialog named its public URL; the venue dialog said no events use
  it. The busy seed room "Classroom 3.12" asks to type its name and says 29 events lose the room
  (cancelled, nothing deleted). The media Sheet deleted the test avatar (the API then answers 404).
- **Re-crop from the media Sheet**, end to end: crop `{x:14, y:14, 483x483}` became `{x:44, y:44, 423x423}`,
  the toasts went "Re-cropping..." then "The new version is live everywhere it is used.", new variants
  shown in the Sheet.
- **PDF in the media Sheet** with a real seed PDF: headless Chromium has no PDF viewer, so the fallback
  card with "Open the file" shows, plus the file row with "Open".
- Processing and failed image tiles checked with a mocked list response at 390 and 1440.
- Empty states (search with no hits) for speakers, publications, media and venues.

- **Permissions on the new seed**, with a temporary admin created and then deleted through
  `/admin/admins` (speakers view only, publications view + edit, `venues.manage`, no media library):
  speaker page read-only with the note, no Save, no Delete; publication editable with visibility locked
  ("Changing visibility needs publish access...") and no Delete; media shows "Showing your uploads";
  `/admin/speakers/new` shows the no-access state; venues keep "New room".
- Final width sweep after the last edits (same 7 widths, same routes): no sideways scroll, no console
  errors. One later partial sweep logged React's "state update on a component that hasn't mounted yet"
  once on `/admin/speakers/new` at 360 while teammates' saves were hot-reloading the dev server; ten
  more loads of that page at 360, 820 and 1440 did not bring it back.

`pnpm --filter @zemi/web typecheck`: clean for this area (the last run fails only on another team's
in-progress `app/(public)/page.tsx` import).

Not verified: a PDF inside the iframe in a browser that has a PDF viewer (only the headless fallback
was seen), and BlockNote image upload inside the speaker bio or publication body.

## Known gaps

- The kit's `<Field>` now honours `<ReadOnlyScope>` itself, so `ScopedFormField` is redundant (it is
  harmless and was left in place; it can be swapped back to the kit `FormField` any time).
- An `?asset=<id>` deep link to someone else's file still shows Delete, Re-crop and Original; the API
  answers 403 with a clear message. The `Asset` payload has no uploader field, so the web cannot hide them.
- In-app navigation guard covers anchors (sidebar, breadcrumbs, back links). Keyboard jumps (`g s`),
  the command palette and the browser back button are not intercepted; `beforeunload` still covers
  reload and tab close.
- No upload button in the media library itself; files arrive through the fields that use them.
- Speaker list sorting is the select, not clickable table headers (the API sorts one way per key).

## Requests

- ~~**web-admin (kit):** make `Input`, `Textarea` and `Select` honour `<ReadOnlyScope>`.~~ Done in the kit
  (`Field` reads `ReadOnlyScopeContext`).
- **web-admin (kit):** a `<Field>` hands one `id` and its invalid state to every control inside, so a
  composite editor wrapped in `FormField` (link rows, author rows) gets duplicate ids and every row turns
  red when one row has an error. This area now uses a plain `Controller` plus a local `FieldGroup` for
  those; the kit `LinksEditor` could also give its rows their own ids. Also worth adding an optional
  `createdBy` (or `canEdit`) to `Asset` so the media sheet can hide actions on other people's files.
- **api-content:** consider a soft duplicate check for DOIs (for example a `duplicateOf` hint on create,
  or a unique index on `lower(doi)` if the team wants a hard rule). Today two publications can share a
  DOI; the editor only warns.
- **`app/providers.tsx` owner (dev only):** the TanStack Query devtools button sits bottom right on every
  page in dev and covers the last Sheet button at some sizes. Moving it (bottom left is taken by the
  Next dev badge, so maybe top right) would clear the admin Sheets. Not a production issue, noted so nobody files it
  as a layout bug.

## Shared contract

- Additive: `SpeakerPublic.publications[].id?: string` (optional), so the speaker editor can link to
  the admin publication page. `pnpm --filter @zemi/shared build` was run. No schema.ts change.

## Review (2026-09-26)

Reviewed against SPEC, DESIGN, the shared contract and the task, with Playwright on :3300 and the shared API.
Every test record (two publications, three speakers, one limited admin) was deleted afterwards; seed counts
are back to 60 publications and 40 speakers.

Fixed:
- **Clearing the year left a stale month and day.** PATCH bodies are built from dirty fields only, so
  clearing the year sent `{"publishedYear":null}` and the server kept month 5, day 10 (reproduced). Year,
  month and day now travel together whenever any of them changed. Re-checked: the body is all three nulls
  and the stored record matches.
- **"Add X as a new speaker" from the authors picker sent `slug: slugify(name)`**, so any name whose slug
  already existed answered 409 (checked with curl), and names that slugify to nothing would 400. The slug
  is left out now and the API makes a unique one: adding "Larasati Anindya." gave 201 and
  `larasati-anindya-2`.
- **Server author errors landed nowhere.** The API reports `authors.N.speakerId` and `authors.N.avatarAssetId`;
  the rows only showed `speaker`, `fullName` and `url`, and the toast is skipped when there are field errors,
  so a deleted speaker only produced a red dot. Rows now show those messages ("That speaker is gone. Pick
  them again?", checked by deleting a speaker while it was on an open form).
- **Duplicate ids and red spill in composite editors.** Author rows, publication link rows and speaker link
  rows sat inside one `FormField`, so they all shared one `id` (probe found 2 to 12 duplicates per page) and
  all turned red when one row had an error. They use `Controller` + `FieldGroup` now: no duplicate ids on
  either editor, only the broken row is red.
- **Cite preview matched the public page only partly.** It skipped the publisher-link and public-URL
  fallback, `status` ("in press") and the thesis degree guess. It now goes through `publicationToCitationSource`
  (no DOI, no URL: APA ends with the public `/publications/<slug>` link, as on the site). "Suggest" uses
  `makeCitationKey` instead of a local copy that broke on particles and "Family, Given" names.
- **Speaker create autofocus** scrolled phones and tablets past the photo and visibility cards and would pop
  the keyboard. The name is focused only from 1024px up (checked at 390, 820, 1440).
- Publication link rows squashed the label box to about 55px on phones; below 640px the row is now kind and
  delete, then the URL, then the label, each full width (checked at 390 and 1440).
- A11y: publication row menus were all called "More actions"; they now name the paper. The section-nav error
  dot used `aria-label` on a bare span; it has screen-reader text now.

Checked and fine: typecheck (only another team's `components/public/home/up-next.tsx` fails), sweep of all 9
routes at 390, 820, 1440 and 2560 (no sideways scroll, no 4xx/5xx, no error screens; the sweep now fails on
an error screen), DOI fill at 390 (13 changes, 3 authors, APA as expected, 201, redirect), a view-only admin
(read-only note, no Save/Add/Delete, no console errors), no en or em dashes or banned words in this area,
asset FKs are `set null` (event media `cascade`), so the delete warning is accurate.

Still open: React's "state update on a component that hasn't mounted yet" warning showed once more (speaker
edit at 820, during a sweep while teammates' edits were recompiling). 20 more cold loads at 360 and 820 did
not bring it back, so the source is still unknown.

