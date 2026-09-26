# admin-events: overview dashboard, events list, event workspace core (web)

Owner: admin-events. Built on the admin kit (`docs/foundation/web-admin.md`) and the api-events endpoints
(`docs/features/api-events.md`). All data is fetched in the browser with React Query, so every screen shares
one cache and teammates' tabs can reuse it.

## Routes

| route | file | what |
|---|---|---|
| `/admin` | `app/admin/(dashboard)/page.tsx` | Overview dashboard (`GET /admin/overview`) |
| `/admin/events` | `app/admin/(dashboard)/events/page.tsx` | Events list: tabs, search, table or cards, row actions |
| `/admin/events/new` | `events/new/page.tsx` | Short "new event" form, creates a draft, lands on Details |
| `/admin/events/[id]/*` | `events/[id]/layout.tsx` | Workspace frame: header, state banner, route tabs, `useWorkspaceEvent()` |
| `/admin/events/[id]` | `events/[id]/page.tsx` | Overview tab: readiness checklist, key numbers, quick links |
| `/admin/events/[id]/details` | `details/page.tsx` | Full edit form |
| `/admin/events/[id]/speakers` | `speakers/page.tsx` | Lineup editor + "Create new speaker" sheet |
| `/admin/events/[id]/rundown` | `rundown/page.tsx` | Rundown rows + live timeline preview |
| `/admin/events/[id]/publications` | `publications/page.tsx` | Linked publications with notes |
| `/admin/events/[id]/settings` | `settings/page.tsx` | Visibility, cancel or restore, duplicate, delete |

Registrations, Attendance, Stream, Media and Emails tabs are owned by teammates. The layout links to them and
wraps them.

## Components (`apps/web/src/components/admin/events/`)

| file | exports |
|---|---|
| `lib.ts` (pure, server safe) | `isUuid`, `UUID_RE`, `WORKSPACE_TABS` (tab list + the action each needs), `readinessChecklist`, `planFridayPayload`, `nextFreeFridays`, `sessionFor`, `fridayLabel`, `jakartaDay`, `detectMove`, `nullIfEmpty`, `isEventAdmin`, `MODE_LABEL`, `MODE_HINT`, `VISIBILITY_COPY`, `statusTone`, `fillFraction`, `checkInRate`, `hhmmToMinutes`, `minutesToHhmm` |
| `use-event.tsx` | `eventDetailKey(id)`, `fetchEventAdmin`, `useEventAdmin(id)`, `EventWorkspaceProvider`, `useWorkspaceEvent()`, `useOptionalWorkspaceEvent()`, `usePermSet`, `useLiveStatus(event)`, `rowStatus(row, now)`, `useEventActions(id)` (publish, duplicate, cancel, restore, remove), `createEvent(payload)`, `patchEventCache`, `acceptEvent`, `eventListKeys`, `notifyPublished` |
| `use-unsaved-guard.ts` | `useUnsavedChangesGuard(dirty)`: `beforeunload` + a confirm before in-app link clicks |
| `parts.tsx` | `CoverThumb` (4:5, accent shape fallback, `fluid` for cards), `Countdown`, `SeatsBar`, `viewOnSiteUrl`, `ViewOnSiteButton`, `PublishControl` (split button), `EventNumber`, `LiveDot` |
| `fields.tsx` | `useUpcomingEvents`, `useTakenDates(excludeId)` (returns `{ dates, query, ready }`), `JakartaDateTimeInput` (one WIB instant with presets) |
| `overview/*` | `OverviewDashboard`, `TrendChart` (default export, recharts, loaded with `next/dynamic`, `ssr:false`), `TREND_COLORS` |
| `list/events-list.tsx` | `EventsList` |
| `new/new-event-form.tsx` | `NewEventForm` |
| `workspace/*` | `EventWorkspace` (layout client), `StateBanner`, `EventOverviewTab` |
| `details/details-form.tsx` | `EventDetailsForm` |
| `speakers/*` | `SpeakersEditor`, `NewSpeakerSheet`, `ROLE_LABEL`, `useEventSpeakerOptions` |
| `rundown/*` | `RundownEditor`, `RundownTimeline`, `standardRundown(event)`, `RundownRow` |
| `publications/publications-editor.tsx` | `PublicationsEditor` |
| `settings/settings-panel.tsx` | `EventSettingsPanel` |

### For teammates who own workspace tabs

```tsx
import { useWorkspaceEvent, eventDetailKey } from '@/components/admin/events/use-event';

const { event, id, can, status, perms, refetch } = useWorkspaceEvent(); // EventAdmin, live status, server permissions
if (!can('stream.control')) ...
// After a mutation that changes the event, refresh the header, banner and counts:
qc.invalidateQueries({ queryKey: eventDetailKey(id) });
```

- The layout sets the breadcrumbs (`Events / <title> / <Tab label>`), so tabs should not set their own.
- The layout already blocks a tab the event's `permissions` cannot use (friendly 403 card), using the rules in
  `WORKSPACE_TABS`: Registrations needs `registrations.view`, Attendance `attendance.scan`, Stream `stream.view`,
  Media `media.manage` or `view`, Emails `emails.send`.
- Status in the header and banner is recomputed every 15 s with `computeEventStatus(event, event.stream.state, now)`,
  so it flips to "Happening now" on its own. A stream tab that pushes state over SSE can `setQueryData` on
  `eventDetailKey(id)` and the header follows.

## Decisions

- **Client fetching, no server prefetch.** The workspace layout only validates the id (non-UUID gives
  `notFound()`) and renders the client frame. One cache entry (`adminKeys.events.detail(id)`) feeds the header,
  banner, all tabs and teammates' tabs. Every mutation that returns an `EventAdmin` writes it straight into the
  cache (`acceptEvent`), then invalidates the detail, the lists and the overview.
- **Permissions come from the server per event.** Tabs and buttons use `event.permissions` (list rows use
  `row.permissions`). The global ability is only used for capabilities (`events.create`, `speakers.create`,
  `publications.create`) and for "can I open this speaker/publication" links.
- **Fresh grants after create.** Creating, duplicating or "Plan this Friday" gives a normal admin a full grant
  on the API side, so the client re-fetches `/auth/me` before routing into the new workspace.
- **Create defaults come from the API.** The new-event form sends title, dates, and the room and number when
  filled in. It leaves out the slug and (when empty) the number and room, so the API picks a unique slug,
  `max + 1`, and the default room from site settings. "Plan this Friday" sends only the date and times, and the
  API names it "Zemi #n".
- **Taken Fridays follow the API's rule.** `useTakenDates` marks a date taken when any upcoming event is on
  it, cancelled ones included (a Friday called off on purpose is not offered again). The list only holds
  events the admin can view, so the next 8 Fridays also come from the overview's `emptyFridays` (computed over
  every event, shared cache entry with the dashboard): a Friday in that window that is not empty counts as
  taken. A scoped admin is never offered a Friday someone else already took. The 8-week window is computed from the overview's `now`, the
  same clock the server used for `emptyFridays`. The event being edited does not
  mark its own date as taken.
- **Default date.** The new-event form waits for `ready`, then jumps to the first free Friday, unless you
  already touched the date. The Friday chips in `JakartaDateTimeFields` skip taken dates too.
- **Dashboard.** Totals only count the events you can see, so the big "No Fridays yet" first-run screen shows
  only to someone who can see every event (superadmin, or `event:*` view). A scoped admin with nothing shared
  gets the normal layout with "Nothing on your calendar yet." and, with `events.create`, the free Fridays (or
  "Plan ahead"). Live banner (pulsing, links to the stream tab), next event card with countdown, seats and
  permission-aware quick actions (scanner, stream, registrations), "Fridays without a plan" with one-click
  planning. When all eight weeks are planned and you can create events, the card offers the first free
  Friday after that ("Plan ahead"). Totals, trend chart, "Coming up" list, activity, and "Your access".
- **Activity feed.** Shows "who changed what": `auth.*` entries (sign-ins, sign-outs) are left out, since the
  audit log keeps them. The API's summary is the line (it is already a sentence, and some start with the
  actor's name), with "by <actor>" and an event link underneath.
- **Details save.** Explicit Save (button or Cmd/Ctrl+S) sends only dirty fields (empty nullable text becomes
  `null`; start and end travel together). Server field errors land under the right input
  (`applyApiErrorToForm`). A local draft (`localStorage` key `zemi.event-draft.<id>`, wrapped in try/catch) is
  written while dirty and offered back as "Restore" only when it is newer than `event.updatedAt`. It is never
  applied silently, and it is cleared on save or discard. Leaving with unsaved changes asks first (links) or
  uses the browser prompt (tab close, reload). The form follows server updates only while it is clean.
  Without `edit` the whole form is read-only (`ReadOnlyScope`) with a "You can look, not touch." callout.
- **Slug.** `SlugField auto={false}` once the event was ever published, so renaming a public event never moves
  its URL by accident.
- **Maps link** is prefilled from the room when empty (or when it still equals the old room's link), with
  "Use the room's link" to go back after overriding. Seats suggest the room capacity.
- **Sorting is optimistic.** Speakers, rundown rows and publications reorder with `SortableList`
  (pointer, touch, keyboard). If nothing else is pending, the new order saves right away with an optimistic cache
  patch and a rollback on error ("Order saved."). If other edits are pending, the move just joins them.
- **The rundown follows the clock.** `PUT /rundown` stores rows sorted by start time (ties keep their order).
  A drag that still reads in time order (a tie) saves right away. A drag that breaks time order stays unsaved,
  with the "Saving puts the rows in time order" hint and "Sort by time", instead of saving and snapping back.
  After any save the form shows what the API stored, and the toast says "Rundown saved, in time order." when
  the server moved rows. The card copy says it: to move a row, change its time.
- **Rundown validation.** Format is strict (HH:mm, end after start, agenda required). Timing is gentle: rows
  outside the session or out of order get a hint, and "Sort by time" appears. "Use the standard Friday rundown"
  scales doors, talks (one slot per non-moderator speaker, titled from their talk), questions, coffee and
  "See you next Friday" to the event's own start and end.
- **Publish** is a split button in the header (and a card in Settings). Publishing celebrates with the cheering
  character toast and `shapeConfetti` (imported from `@/components/motion/shape-confetti` directly, lazily, so
  GSAP and Lenis never load in the admin). Unpublishing confirms first and says tickets keep working.
- **Destructive copy says exactly what happens.** Cancel explains the page stays up, registration closes and
  (with the toggle on) N people get an email. Delete lists what goes (page, registrations and QR codes,
  check-ins, rundown, links, stream keys, recordings) and what stays (speakers, publications), and needs the
  title typed. After delete the detail query is dropped only after navigating away, so nothing refetches a 404.
- **List state lives in the URL** with nuqs: `tab`, `q`, `page`, `size`, `view` (`table` or `grid`). "Drafts" is
  `when=all&visibility=draft`. Tab counts are tiny `pageSize=1` requests. Without an explicit `view`, phones get
  cards and wider screens the table. The actions column is pinned to the right edge.
- **Chart.** Registered vs checked in as grouped columns on one axis (same unit), brand blue and green
  (validated with the dataviz palette checker: CVD and normal-vision separation pass), 24px max bars with
  rounded tops, hairline grid, hover tooltip, HTML legend, and a table view toggle. Animation is off with
  reduced motion.

## Shared contract (additive)

`packages/shared/src/schemas/events.ts`: `EventAdmin.streamConfigured?: boolean` (OBS keys exist) and
`EventAdminRow.speakerAvatars?: Array<{ fullName, avatar }>`. Both are optional and the api-events teammate
already fills them. No `schema.ts` change.

## Verified (2026-09-26, against the reseeded shared web on :3300 and API on :4400)

Playwright scripts live in the scratchpad (`ae-*.mjs`), screenshots in `shots/admin-events/r2/`.

- **Typecheck and lint.** `pnpm --filter @zemi/web typecheck` has 0 errors. The workspace ESLint is clean on
  every file in this area.
- **End to end at 390, 820 and 1440** (`ae-flow2`). Create a draft from `/admin/events/new` (201, lands on
  Details). The form is clean on load and after tab hops. Edit the summary and room note, check that the leave
  guard asks, then save (PATCH 200). Add two speakers with a talk title (PUT 200), apply the standard rundown
  (PUT 200), and link a publication with a note (PUT 200). Publish (200), then check the public API: 200 by
  slug, with the speakers, rundown and summary. Then the Overview tab, and Settings delete: disabled until the
  title is typed, lands on `/admin/events`, and the event gives 404. No console errors.
- **Cover and field errors on Details** (`ae-details2`, 1440).
  - Cover: drop a jpg, and the crop dialog opens, locked to 4:5. Upload, wait for the asset to be ready, then
    Save. The admin detail now has `cover` and `coverAssetId`, the header thumbnail shows the image, and the
    public (unlisted) detail has the cover.
  - Field error: type another event's slug into Link and Save. The 409 shows inline under Link
    (`aria-invalid`, "The address ... is already taken"), the save bar stays up, and there is no toast.
- **Plan, duplicate, row actions** (`ae-flow3`). "Plan this Friday" makes a draft named "Zemi #106" on the
  chosen date at 13:15 to 15:15 WIB. Duplicate from Settings copies the lineup (2) and rundown (6) as a draft
  with a new number. From the list: the copy shows under Drafts, row publish and unpublish work, and row delete
  removes it. "Plan ahead" (every Friday in the window taken) plans 27 Nov (`ae-planahead`).
- **Scoped admins** (`ae-perm`, `ae-perm2`, both delete their admin afterwards). With view + `attendance.scan` on
  one event and view + edit on another:
  - The list shows exactly those 2 events. There is no "New event" and no "Plan".
  - Registrations, Stream and Emails tabs are hidden, and Attendance shows.
  - A view-only event has a read-only Details form with no save bar, and no delete or duplicate in Settings.
  - The registrations URL shows the friendly 403 card.
  - The edit event has an editable lineup, with no "Create new speaker" and no publish control.
  - `/admin/events/new` shows the forbidden card.

  An admin with only `events.create` sees 0 events, yet the new-event form defaults to 27 Nov (the first
  Friday free across all events), and the chips offer 27 Nov and 4 Dec.
- **Screenshots, all without console errors or horizontal scroll.** At 390, 820, 1440 and 2560: the dashboard,
  the list (upcoming, past table, all cards), the new-event form, and the workspace Overview, Details,
  Speakers, Rundown, Publications and Settings tabs. At 1440: the live, past, cancelled and draft state banners.
  The live banner was checked on a real stream-live event: it pulses on the dashboard, and the workspace
  shows "Happening now" with stream controls and the scanner.

## Review pass (2026-09-26)

A reviewer re-checked the area against SPEC, DESIGN and the contract and fixed:

- `rundown/rundown-editor.tsx`: dragging a row out of time order auto-saved, the API re-sorted it, and the row
  snapped back under an "Order saved." toast. Now it stays unsaved with a hint (see "The rundown follows the
  clock"). Checked with a keyboard drag on #100: no PUT, save bar and hint shown; Save then sends one PUT and
  toasts "Rundown saved, in time order.".
- `overview/overview-dashboard.tsx`: a scoped admin with no visible events got "No Fridays yet. Let's set the
  first table." (false, the calendar was full) and, with only `events.create`, no way to plan. Fixed as above;
  checked with a create-only and a no-grants admin (both deleted after). Activity entries for `event.delete`
  no longer link to the deleted event.
- `fields.tsx`: the 8-week taken-Friday window uses the overview's `now` instead of the browser clock.
- `speakers/speakers-editor.tsx`: "Use their usual" showed on rows whose organization or position was empty,
  which already means "use their usual". It now shows only for a typed override.
- Delete copy (`settings/settings-panel.tsx`, `list/events-list.tsx`) now says the photo, video and recording
  files stay in the media library (only the links go), which is what the API does.
- `workspace/overview-tab.tsx`: key numbers are two columns on phones instead of four stacked cards.

Also checked: a view + publish admin on #100 (publish split button shown; Details, Speakers, Rundown and
Publications read-only with no save bar; Settings visibility and cancel enabled, no delete or duplicate;
Registrations tab hidden and its URL shows the 403 card; the registrations API answers 403; the overview
`activity` has no registration or check-in entries).

## Known gaps

- Browser back/forward is not intercepted by the unsaved-changes guard (the App Router has no blocking API).
  The local draft covers it.
- No conflict detection when two admins edit the same event (the API has no ETag or version field). The form
  follows server changes only while clean, and the last save wins.
- Events list sorting is per page (the API has no `sort` param for events).
- Tab counts on the list cost five tiny requests; an API `counts` field would be cheaper.
- Beyond the overview's 8-week window, taken dates come from the visible list only, so a scoped admin could
  still be offered a Friday 9+ weeks out that someone else took. An API "is this date free" check (or a longer
  `emptyFridays` window) would close it.
- Native `<input type="time">` shows the browser's locale format (for example `13.15`); the stored value is
  always `HH:mm` WIB.
