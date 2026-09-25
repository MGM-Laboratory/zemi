# api-events: events, venues, overview (NestJS)

Owner: api-events. Code: `apps/api/src/modules/events/**`, `apps/api/src/modules/venues/**`,
`apps/api/src/modules/overview/**`. Built on the api-core building blocks (guards, `assertCan`, `visibleIds`,
`PermissionsService`, `SlugService`, `AssetRefsService`, `AuditService`, `RevalidateService`, `JobsService`).

## Files

| file | what |
|---|---|
| `events/event-logic.ts` | Pure rules, no Nest: `eventStatus`, `registrationInfo`, `streamPublic`, `recordingChapters`, `nextAccent`, `upcomingFridays`, `firstFreeFriday`, `sessionOn`, `shiftToDate`, `sortRundown`, `cleanTags`, `eventLabel`. Unit tested in `event-logic.spec.ts` (18 specs) |
| `events/events.sql.ts` | SQL fragments for lists: `whenCondition` (public vs admin buckets), `searchCondition`, `tagCondition`, `speakerCondition`, `yearCondition`, `isLive`, `listColumns` |
| `events/events.loader.ts` | `EventsLoader` (exported): batch loaders + mappers for `EventCard`, `EventAdminRow`, `EventDetail`, `EventAdmin`, `EventMediaAdminItem` |
| `events/events.admin.service.ts` | `EventsAdminService` (exported): list, create, update, publish, cancel, restore, duplicate, delete, speakers, rundown, publications |
| `events/events.media.service.ts` | documentation media (attach, caption, feature, reorder, detach) |
| `events/events.public.service.ts` | public list, next, detail by slug, calendar |
| `events/ics.ts` | `buildEventIcs(event, webUrl)`, `calendarTitle`, `calendarLocation`, `icsFilename` (plain functions, reusable) |
| `venues/*` | rooms CRUD (`VenuesService` exported) |
| `overview/*` | `GET /admin/overview` |

Shared contract (additive, `packages/shared/src/schemas/events.ts`): `eventCreateInput` / `EventCreateInput`
(every field optional) and `EventMediaAdminItem`. I also fill the web-admin teammate's optional
`EventAdmin.streamConfigured` and `EventAdminRow.speakerAvatars`. No schema.ts change, no migration.

## Endpoints (all under `/api/v1`)

### Venues

| route | who | notes |
|---|---|---|
| `GET /admin/venues?search` | any admin | `Venue[]` sorted by name, each with `eventCount`. Not paginated (`page`/`pageSize` accepted and ignored, the VenueSelect sends them) |
| `GET /admin/venues/:id` | any admin | `Venue` |
| `POST /admin/venues` | `venues.manage` | `venueInput`. 409 with a `name` field issue when the same name exists in the same building (case-insensitive) |
| `PATCH /admin/venues/:id` | `venues.manage` | partial `venueInput`. Revalidates every event using the room |
| `DELETE /admin/venues/:id` | `venues.manage` | always allowed: `{ ok, detachedEvents, warning }`. The FK sets `venue_id` null on those events; they get revalidated |

### Events, admin (session + `x-zemi-csrf: 1` on writes)

Every per-event check runs before the existence check, so a scoped admin gets 403 for ids they can't
see (existing or not). The superadmin gets 404 for unknown ids.

| route | permission | returns |
|---|---|---|
| `GET /admin/events?when=upcoming\|past\|live\|all&search&tag&speaker&year&visibility&page&pageSize` | view (list is filtered with `visibleIds`) | `Paginated<EventAdminRow>` with `permissions` per row |
| `POST /admin/events` | `events.create` | `EventAdmin` (201). Body `eventCreateInput`, all optional. See "Create defaults" |
| `GET /admin/events/:id` | view | `EventAdmin` |
| `PATCH /admin/events/:id` | edit | `EventAdmin`. `eventUpdateInput` |
| `DELETE /admin/events/:id` | delete | `{ ok, removed: { registrations } }` |
| `POST /admin/events/:id/publish {visibility}` | publish | `EventAdmin` (200) |
| `POST /admin/events/:id/cancel {reason?, notify=true}` | publish | `EventAdmin` (200) |
| `POST /admin/events/:id/restore` | publish | `EventAdmin` (200) |
| `POST /admin/events/:id/duplicate` | `events.create` + view on the source | `EventAdmin` (201) |
| `PUT /admin/events/:id/speakers {speakers}` | edit | `EventAdmin` |
| `PUT /admin/events/:id/rundown {items}` | edit | `EventAdmin` |
| `PUT /admin/events/:id/publications {items}` | edit | `EventAdmin` |
| `GET /admin/events/:id/media` | view | `EventMediaAdminItem[]` (includes processing items) |
| `POST /admin/events/:id/media {assetId, caption?, featured?}` | media.manage | `EventMediaAdminItem` (201) |
| `PATCH /admin/events/:id/media/:mediaId {caption?, featured?}` | media.manage | `EventMediaAdminItem` |
| `DELETE /admin/events/:id/media/:mediaId` | media.manage | `{ ok }` (the asset stays in the library) |
| `PUT /admin/events/:id/media/order {ids}` | media.manage | `EventMediaAdminItem[]`. `ids` must be every item exactly once, else 400 |

### Events, public (no auth)

| route | returns |
|---|---|
| `GET /public/events?when&search&tag&speaker&year&page&pageSize` | `Paginated<EventCard>`, published only |
| `GET /public/events/next` | `EventCard` or a JSON `null` (literal `null` body, not empty) |
| `GET /public/events/:slug` | `EventDetail`, or `{ redirect: slug }` (200) for an old or differently cased slug, else 404 |
| `GET /public/events/:id/calendar.ics` | `text/calendar`, `attachment; filename="zemi-12.ics"`, `Cache-Control: public, max-age=300` |

### Overview

`GET /admin/overview` (any admin) returns `AdminOverview`, scoped to the events, speakers and publications the
principal can view.

## Behaviour and decisions

**Status.** Always `computeEventStatus` (shared) with `event_streams.state` joined in (no row means `idle`).

**When buckets.**
- Public follows the status: `upcoming` = scheduled or ongoing (not cancelled, `endsAt > now` or stream live), sorted by start ascending. `past` = past (not cancelled), newest first. `live` = stream live and not cancelled. `all` = everything published, newest first. Cancelled events only appear in `all` and on their own page.
- Admin buckets go by time only, so a cancelled Friday stays in "upcoming" where someone can restore it, and moves to "past" once its date has gone by.

**Search.** Matches title, summary, slug, description text, tags, and speaker full name or nickname. `12` or `#12` also matches Zemi #12. Public search ignores draft speakers.

**Public filtering.**
- Only `published` events show in lists. `unlisted` works by slug and calendar. `draft` is 404, including through an old-slug redirect (the new slug would leak).
- Draft speakers are hidden on cards, the speaker list and rundown refs.
- Only publications with visibility `published` are shown, and author speaker slugs link only when the speaker isn't a draft.
- Media shows only when it can play: an image needs variants, a video must be ready. The caption falls back to the asset caption.
- `registrationCount` is null unless `showRegistrantCount` is on.
- `mapsUrl` falls back to the venue's.
- Per-event organization and position fall back to the speaker's defaults.

**Admin detail.**
- Returns raw values: `mapsUrl`, and speaker organization and position, where null means "use the default". The editor can show the defaults as placeholders.
- Includes draft speakers and publications, and every media item with its `status`.
- Recordings are the same as public: `public` + `ready` + a ready video asset.

**Registration info (`registrationInfo`).**
- Counts registrations with `status = 'registered'`, in-person and online together, against `capacity`.
- Checks run in this order: draft, cancelled, over (`now >= endsAt`, even when the stream runs long), switched off, deadline passed, full.
- These are the same semantics as the registrations module's `registrationWindow` in `registration-rules.ts`, which enforces them on POST. The page never shows an open form the API then refuses. The wording differs slightly.

**Recordings and chapters.**
- A recording comes from a `stream_sessions` row with visibility `public` and `recordingStatus: 'ready'`, plus a ready video asset. Primary first, then oldest first.
- Chapters: each rundown `HH:mm` is read as a Jakarta time on the event's date. It becomes seconds after the session's `startedAt`, computed exactly, not rounded to minutes. Negative offsets are skipped, and so is anything at or after the video duration. One chapter per offset.

**Stream (public).** `{ state, ingestOnline, liveStartedAt, hlsUrl, viewers: 0 }`. `hlsUrl` is `PUBLIC_API_URL/api/v1/public/live/<id>/index.m3u8` only while live.

**Create defaults.**
- Runs in a transaction with `pg_advisory_xact_lock(hashtext('zemi:events:create'))`, shared with duplicate, so `number` and generated slugs can't collide.
- `number`: max(number) + 1 unless the body sends `number`. `null` means no number.
- `title`: defaults to `Zemi #<n>`.
- `slug`: from the title with `slugify`, made unique. It also skips old slugs that still redirect to another event, so it never silently takes over that event's old links. A typed slug goes through `ensureUniqueSlug` (400/409) and may claim an old slug, which follows the SlugService semantics.
- Time: the first Friday (from `nextFridaySession`) whose Jakarta date has no event. Cancelled events count as occupying their Friday, so a Friday called off on purpose (a holiday) isn't offered again. The time is `general.defaultStart` to `defaultEnd` from site settings (13:15 to 15:15). If only `startsAt` is sent, `endsAt` is start + 2h.
- `venueId` and `capacity` come from `general.defaultVenueId` and `defaultCapacity` when the body doesn't send them. A stale venue id is ignored.
- `accent`: the one after the accent of the highest numbered event (blue, yellow, red, green).
- `visibility`: `draft` unless the body says otherwise. `publishedAt` is set if it's created published.
- A normal admin gets an owner grant in the same transaction. The response's `permissions` already include that grant, because it's computed from `withOwnerGrant(policy)`.

**Update.**
- `endsAt > startsAt` is validated after the merge (400 on `endsAt`).
- `venueId` and `coverAssetId` are checked, and the cover must be an image that didn't fail. Otherwise you get a 400 with a field issue.
- Empty strings become null.
- Tags are trimmed and deduped case-insensitively.
- `descriptionText` comes from `blocksToPlainText`.
- A slug change is recorded in `slug_redirects` in the same transaction.

**Publish.** Sets `visibility`. `publishedAt` is set the first time the event becomes `published`. Audit actions: `event.publish`, `event.unpublish` (to draft), `event.unlist`.

**Cancel.**
- Sets `cancelledAt` (kept if it's already set) and `cancelReason`.
- With `notify`, it queues `event.cancelled.notify` `{ eventId }` after the write, using `jobs.reschedule(queue, 'event-cancelled:<id>', ...)`. A double click leaves one queued job.
- Restore clears both and cancels a still-queued notice. The registrations worker also skips restored events.

**Duplicate.**
- Copies content, cover, room, mode, tags, capacity and settings, plus speakers, rundown and publications, to the next free Friday. The Jakarta wall-clock start and the length stay the same.
- The copy is a draft with a new number, a fresh slug and the next accent.
- `registrationClosesAt` shifts by the same amount as the start.
- Registrations, media and recordings are not copied.

**Delete.**
- The FKs cascade registrations, check-ins, speakers, rundown, media links and stream sessions.
- `removeResourceGrants` cleans every admin's policy, and `forgetResource` drops the slug redirects.
- Assets, including recording videos, stay in the media library.

**Relations.**
- `PUT speakers` dedupes by (speaker, role). `PUT publications` dedupes by publication.
- `PUT rundown` sorts by time, then end time, stable. An `endTime` before `time` is a 400.
- Unknown ids give a 400 with `details[].path` like `['speakers', 2, 'speakerId']`. You never get a 23503 or 409 that the form can't place.

**Media.**
- The asset must be an image or a video, must not have failed, and may still be processing.
- A normal admin can only attach files they uploaded, unless they have `media.library`. Attaching the same asset twice gives a 409.
- New items go last.

**Audit.**
- Every mutation is logged with `resourceType: 'event'` and `resourceId: <eventId>`, sub-actions included: `event.create|update|publish|unpublish|unlist|cancel|cancel-update|restore|duplicate|delete|speakers|rundown|publications|media.add|media.update|media.remove|media.reorder`.
- Venue actions are `venue.create|update|delete` with `resourceType: 'venue'`.

**Revalidation.**
- Every event mutation revalidates `events` and `event:<id>`. Detail pages are cached under `events` on the web, because the id isn't known before the fetch.
- When the event has speakers or publications, it also revalidates `speakers`, `speaker:<id>`, `publications` and `publication:<id>`, because those pages embed the event.
- `PUT speakers` and `PUT publications` also revalidate the removed ids.
- A drafted create or duplicate doesn't revalidate, since nothing public changed.

**Overview.**
- `live`: the visible, not cancelled event that is stream-live, else the one ongoing by time.
- `next`: the next scheduled visible event.
- `upcoming`: up to 6, cancelled included (with their status), excluding `live`.
- `recent`: the last 6 past events.
- `trend`: the last 12 past, not cancelled events, oldest first. The label is `#n`, or the date.
- `emptyFridays`: of the next 8 Friday sessions (Jakarta), the ones with no event at all. This looks at every event, not just the visible ones, so a scoped admin isn't offered a taken date. The same rule as create.
- `totals` are scoped to what the principal can view. `unreadMessages` counts `contact_messages.status = 'new'` and is only included with `inbox.view`.
- `activity`: the latest 15 entries. The superadmin and `audit.view` see everything. Everyone else sees `event.*` entries on events they can view, with `ip` and `meta` stripped, plus their own actions. Registration and check-in entries can name people, so those are left out.

## Verified (2026-09-25, curl against the shared API on :4400)

**Venues**
- Create, the case-insensitive duplicate 409, and list with `pageSize=100` and `search`.
- Patch.
- Delete: an unused room gives `detachedEvents: 0`. A used room gives `1` plus a warning, and the event's `venueId` becomes null.

**Create**
- The defaults: the next free Friday, 2 Oct 13:15 to 15:15 WIB, then 9 Oct for the next one.
- `number` = max + 1, the accent rotating (blue, yellow, red), `Zemi #2` as the default title, and a unique slug (`-2`).
- The tags deduped.
- Explicit past dates, `number: 0`, and a 400 for `endsAt` before `startsAt`.
- 409 for a taken slug and 400 for a bad slug.

**Speakers, rundown, publications** (speakers and publications were inserted in SQL)
- `PUT speakers`: the duplicate dropped, and a 400 path for an unknown id.
- `PUT rundown`: sorted, with a 400 for `endTime`.
- `PUT publications`: deduped, with the authors and the speaker slug.

**Public**
- Publish, then the public list for `upcoming`, `past` and `all`.
- Filters: search (text, number, draft speaker hidden), tag (case-insensitive), speaker slug (draft speaker gives 0), year.
- `next`: `application/json`.
- Detail: the defaults resolved, the draft speaker hidden in the list and in the rundown, only published publications, and prev/next among published events.
- Slug change: the old slug and the uppercase slug give `{redirect}`, the new slug gives 200, and unknown or draft slugs give 404.
- ICS: headers and body, with UTC times, WIB in the description, the location and the URL. A cancelled event gives `STATUS:CANCELLED` and no alarm. A draft gives 404, and unlisted gives 200.

**Live** (an `event_streams` row set to `live` via SQL)
- `when=live`, `next` preferring the live event, `status: ongoing`, `isLive`, and `hlsUrl`.
- A fake ready recording: chapters with second offsets, and the hidden session excluded.

**Registration info** (registrations inserted via SQL)
- Full at capacity gives the livestream hint, the deadline passed gives the WIB date, and cancelled is closed.
- `showRegistrantCount=false` hides the public count, while the admin still sees `counts`.

**Cancel and restore**
- Cancel with notify queues one job, and a second cancel replaced the queued one.
- Restore cancels the queued job. Audit summaries checked.

**Scoped admin** (created via `POST /admin/admins` with `events.create` + `edit` on one event)
- The list shows only that event, with `permissions: ["view","edit"]`.
- 403 on another event, on an unknown uuid, on publish, on patching another event, and on `POST /admin/venues`. `GET` venues works.
- Create returns 13 permissions right away, and the grant is in the policy.
- Duplicate copies speakers, rundown and publications.
- Deleting their copy removed its grant from their policy.
- The overview is scoped: activity strips ip and meta on others' entries, `unreadMessages` is null, and `emptyFridays` accounts for events they can't see.

**Media**
- Upload (documentation) and attach while processing.
- A duplicate attach gives 409. An admin without media.manage gets 403. Another person's file gives 403.
- Reorder, and 400 for a partial list.
- Patch: a blank caption goes to null, and public falls back to the asset caption.
- Delete, and 404 on a second delete.

**Other checks**
- Revalidate POSTs answered 200 on the web (`/api/revalidate`).
- `pnpm --filter @zemi/api typecheck` shows no errors in these modules.
- `vitest run src/modules/events`: 18 pass. ESLint is clean on my three folders.

## Known gaps

- `GET /admin/events/:id/media` requires `view`, not `media.manage`. The brief grouped it under media.manage, but `EventAdmin.media` already exposes the same list to viewers, so a 403 there would be inconsistent. Writes need `media.manage`.
- Event deletion doesn't cancel other teams' queued jobs (reminders and so on). Their handlers must tolerate a missing event (the cancel worker already does).
- Changing `startsAt` doesn't emit a job. The registrations lifecycle should compare `events.reminders_scheduled_for` with `starts_at`, or ask for a hook.
- Recording chapters use the rundown times only. No chapter comes from a speaker's talk title.
- A stream teammate's test event `zz-stream-test-e2e` has `number: 9901`, so "max + 1" currently gives 9902 and up until it's removed.

## Requests (outside my ownership)

- **Stream owner:** the test event `zz-stream-test-e2e` has `number: 9901`. Remove it, or set its number to null. While it exists, auto-numbering for new events starts at 9902.
- **Registrations owner:**
  - Keep `registration-rules.ts` (`registrationWindow`) and `events/event-logic.ts` (`registrationInfo`) in sync. If you change one, change both, or import `registrationInfo` from `../events/event-logic.js` (it's a pure function, no Nest). Both close at `endsAt`, count only `registered` seats against the whole capacity, and treat drafts as closed.
  - There is no hook when `startsAt` changes. Reschedule reminders by comparing `events.reminders_scheduled_for` with `starts_at`, or ask me for a job such as `event.rescheduled`.
  - Every job handler keyed on an event must tolerate a deleted event. Your cancel worker already does.
  - `event.cancelled.notify` is sent through `jobs.reschedule` with the key `event-cancelled:<id>`. Restore calls `cancelByKey`.
- **Lead (`docs/DECISIONS.md`)**, please add these lines:
  - public `upcoming`/`past` exclude cancelled events (they show in `all` and on their page), while admin buckets go by time
  - a cancelled event still occupies its Friday (for create defaults and `emptyFridays`)
  - generated event slugs skip old slugs that still redirect to another event
  - `GET /admin/events/:id/media` needs `view`, and writes need `media.manage`
  - for admins without `audit.view`, the overview activity shows only `event.*` entries on events they can view (no ip or meta), plus their own actions
  - registration capacity counts in-person and online registrations together
- **FYI for the web-public and web-admin owners:**
  - `GET /public/events/next` returns a literal JSON `null` when there is nothing coming.
  - `POST /admin/events` accepts `{}` (a one-click "New Friday") and returns `EventAdmin` with the creator's permissions.
  - `EventAdmin.media` items are `EventMediaAdminItem` (with `status` and `assetId`).
  - `DELETE /admin/venues/:id` returns `{ ok, detachedEvents, warning }`. Show the warning.
  - Mutations return the full `EventAdmin`, so you can `setQueryData` instead of refetching.
