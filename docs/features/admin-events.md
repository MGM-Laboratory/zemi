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

Registrations, Attendance, Stream, Media and Emails tabs are owned by teammates; the layout links to them and
wraps them.

## Components (`apps/web/src/components/admin/events/`)

| file | exports |
|---|---|
| `lib.ts` (pure, server safe) | `isUuid`, `WORKSPACE_TABS` (tab list + the action each needs), `readinessChecklist`, `planFridayPayload`, `nextFreeFridays`, `sessionFor`, `fridayLabel`, `detectMove`, `nullIfEmpty`, `MODE_LABEL`, `VISIBILITY_COPY`, `hhmmToMinutes`, `minutesToHhmm`, `checkInRate` |
| `use-event.tsx` | `eventDetailKey(id)`, `useEventAdmin(id)`, `useWorkspaceEvent()`, `useOptionalWorkspaceEvent()`, `useLiveStatus(event)`, `rowStatus(row, now)`, `useEventActions(id)` (publish, duplicate, cancel, restore, remove), `createEvent(payload)`, `patchEventCache`, `acceptEvent`, `eventListKeys` |
| `use-unsaved-guard.ts` | `useUnsavedChangesGuard(dirty)`: `beforeunload` + a confirm before in-app link clicks |
| `parts.tsx` | `CoverThumb` (4:5, accent shape fallback, `fluid` for cards), `Countdown`, `SeatsBar`, `ViewOnSiteButton`, `PublishControl` (split button), `EventNumber`, `LiveDot` |
| `fields.tsx` | `useUpcomingEvents`, `useTakenDates(excludeId)`, `JakartaDateTimeInput` (one WIB instant with presets) |
| `overview/*` | `OverviewDashboard`, `TrendChart` (recharts, loaded with `next/dynamic`, `ssr:false`) |
| `list/events-list.tsx` | `EventsList` |
| `new/new-event-form.tsx` | `NewEventForm` |
| `workspace/*` | `EventWorkspace` (layout client), `StateBanner`, `EventOverviewTab` |
| `details/details-form.tsx` | `EventDetailsForm` |
| `speakers/*` | `SpeakersEditor`, `NewSpeakerSheet`, `ROLE_LABEL` |
| `rundown/*` | `RundownEditor`, `RundownTimeline`, `standardRundown(event)` |
| `publications/publications-editor.tsx` | `PublicationsEditor` |
| `settings/settings-panel.tsx` | `EventSettingsPanel` |

### For teammates who own workspace tabs

```tsx
import { useWorkspaceEvent, eventDetailKey } from '@/components/admin/events/use-event';

const { event, id, can, status, perms } = useWorkspaceEvent(); // EventAdmin, live status, server permissions
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
  banner, all tabs and teammates' tabs; every mutation that returns an `EventAdmin` writes it straight into the
  cache (`acceptEvent`) and then invalidates the detail, the lists and the overview.
- **Permissions come from the server per event.** Tabs and buttons use `event.permissions` (list rows use
  `row.permissions`). The global ability is only used for capabilities (`events.create`, `speakers.create`,
  `publications.create`) and for "can I open this speaker/publication" links.
- **Fresh grants after create.** Creating, duplicating or "Plan this Friday" gives a normal admin a full grant
  on the API side, so the client re-fetches `/auth/me` before routing into the new workspace.
- **Create defaults come from the API.** The new-event form sends title, dates, room and an optional number.
  It leaves out the slug and (when empty) the number, so the API picks a unique slug and `max + 1`.
  "Plan this Friday" sends only the date and times, and the API names it "Zemi #n".
- **Default date.** The new-event form jumps to the first Friday without a (non-cancelled) upcoming event,
  unless you already touched the date. The Friday chips in `JakartaDateTimeFields` skip taken dates too.
- **Details save.** Explicit Save (button or Cmd/Ctrl+S) sends only dirty fields (empty nullable text becomes
  `null`; start and end travel together). Server field errors land under the right input
  (`applyApiErrorToForm`). A local draft (`localStorage` key `zemi.event-draft.<id>`, wrapped in try/catch) is
  written while dirty and offered back as "Restore" only when it is newer than `event.updatedAt`. It is never
  applied silently, and it is cleared on save or discard. Leaving with unsaved changes asks first (links) or
  uses the browser prompt (tab close, reload). The form follows server updates only while it is clean.
- **Slug.** `SlugField auto={false}` once the event was ever published, so renaming a public event never moves
  its URL by accident.
- **Maps link** is prefilled from the room when empty (or when it still equals the old room's link), with
  "Use the room's link" to go back after overriding. Seats suggest the room capacity.
- **Sorting is optimistic.** Speakers, rundown rows and publications reorder with `SortableList`
  (pointer, touch, keyboard). If nothing else is pending, the new order saves right away with an optimistic cache
  patch and a rollback on error ("Order saved."). If other edits are pending, the move just joins them.
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
- **List state lives in the URL** with nuqs: `tab`, `q`, `page`, `size`, `view`. "Drafts" is
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

## Verified

- Typecheck: `pnpm --filter @zemi/web typecheck` has no errors in these files.
- Playwright against the shared web and API (superadmin), screenshots in the scratchpad
  `shots/admin-events/`: overview at 390, 820, 1440 and 2560; events list table and cards at 390, 820 and 1440;
  workspace tabs (see the report). No console errors on those pages and no horizontal page scroll.
- End to end in the browser: create a draft from `/admin/events/new` (201, lands on Details), edit the summary
  and room note and save (PATCH 200, save bar clears), then the speakers and rundown tabs.

## Known gaps

- Browser back/forward is not intercepted by the unsaved-changes guard (the App Router has no blocking API).
  The local draft covers it.
- No conflict detection when two admins edit the same event (the API has no ETag or version field). The form
  follows server changes only while clean, and the last save wins.
- Events list sorting is per page (the API has no `sort` param for events).
- Tab counts on the list cost five tiny requests; an API `counts` field would be cheaper.
