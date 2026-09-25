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
   you type (`useDeferredValue`), copy per format, "See every format at once". On 2xl screens it sits
   in a sticky third column.
8. **Related events** (edit only, read-only list to the event workspace).

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
missing poster falls back quietly), document/audio "paper" tiles on graph paper. Badges for
processing/failed and "No alt". Processing tiles refresh every 5 s until they settle.
The Sheet shows the preview (image on a checkerboard, `<video>` with WebM + MP4, PDF in an iframe,
`<audio>`), editable alt / caption / credit (`PATCH /admin/assets/:id`), facts (file name, type,
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

## Verified (Playwright, real shared API on :4400, superadmin and a limited admin)

Screenshots in the scratchpad `shots/admin-content/`.

- Speakers list (grid and table), new, edit at 390, 820, 1440 and 2560. **Created a speaker with an
  avatar crop** (seed photo, zoomed in the crop dialog, uploaded, processed, saved, then reopened).
- **Created a publication with DOI fill** (`10.1038/nature14539` pasted as a doi.org link): the
  diff dialog offered 13 changes, applying filled title, journal, volume, issue, pages, publisher,
  date, ISSN, URL, language and 3 authors (Yann LeCun matched a directory speaker), then a directory
  speaker and a manual author were added, corresponding toggled, keywords and abstract filled, saved,
  and reopened at 390, 820, 1440 and 2560. The APA preview read
  "LeCun, Y., Bengio, Y., Hinton, G., ... (2015). Deep learning. Nature, 521(7553), 436-444."
- **Created a venue** in the Sheet (kind, building, floor, seats, address, maps link, notes) and
  reopened it at 390 and 820.
- Media library grid and detail Sheet at 1440 and 390.
- A limited admin (speakers view only, publications view + edit, `venues.manage`, no media library):
  speaker page read-only with the note and no Save, publication visibility locked, media shows
  "Showing your uploads", `/admin/speakers/new` shows the no-access state.
- No horizontal scroll at any tested width after fixes, no page errors from these pages.
- `pnpm --filter @zemi/web typecheck`: no errors in these files.

Not verified: speaker and publication delete through the UI (the dialogs are wired and typed; I did
not want to delete teammates' seed rows), re-crop from the media Sheet end to end, PDF preview with a
real PDF asset, 2560 for venues and media.

## Known gaps

- `ReadOnlyScope` only reaches the `fields` package. Kit `Input`/`Textarea`/`Select` read read-only
  from their `<Field>` only, so this area wraps `FormField` in `ScopedFormField`. Other teams will hit
  the same thing (see Requests).
- In-app navigation guard covers anchors (sidebar, breadcrumbs, back links). Keyboard jumps (`g s`),
  the command palette and the browser back button are not intercepted; `beforeunload` still covers
  reload and tab close.
- No upload button in the media library itself; files arrive through the fields that use them.
- Speaker list sorting is the select, not clickable table headers (the API sorts one way per key).

## Shared contract

- Additive: `SpeakerPublic.publications[].id?: string` (optional), so the speaker editor can link to
  the admin publication page. `pnpm --filter @zemi/shared build` was run. No schema.ts change.
