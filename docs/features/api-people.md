# api-people: registrations, tickets, attendance, people emails, PDF

Owner: api-people. Code: `apps/api/src/modules/registrations/**`, `apps/api/src/modules/attendance/**`,
`apps/api/src/modules/mail/templates/{registration-*,event-*,people-parts}.tsx`. Fonts for the PDF in
`apps/api/assets/fonts/` (static OFL instances, licenses next to them).

Everything below is under `/api/v1`. Error bodies follow SPEC 7 (`{ error: { code, message, details? } }`).

## 1. Public (no session)

| route | what |
|---|---|
| `POST /public/events/:id/registrations` | `RegisterInput` -> `RegisterResult`. Rate limit 5/min and 20/hour per IP (429 + `Retry-After`) |
| `GET /public/tickets/:token` | `Ticket` (email masked), `no-store` |
| `POST /public/tickets/:token/cancel` | releases the seat, emails `registration-cancelled`, returns the `Ticket`. Idempotent. 10/min per IP |
| `GET /public/tickets/:token/qr.svg` / `qr.png` | branded QR (1024 px PNG), `Cache-Control: public, max-age=31536000, immutable`. 404 for unknown tokens |
| `GET /public/tickets/:token/calendar.ics` | one VEVENT, UID `event-<eventId>@zemi.labmgm.org` (re-import updates it), same `SEQUENCE`/`CREATED`/`LAST-MODIFIED` and title rule as the event's own .ics (`modules/events/ics.ts`), so the two files never fight over the entry. Cancelled events: `STATUS:CANCELLED`, `TRANSP:TRANSPARENT`, no alarm. 30 min alarm, 5 min cache |

Sign-up rules, in this order:

1. Honeypot `website` filled: 400 `rejected` ("That didn't go through...") before any validation, so bots don't learn the field.
2. `registerInput` (zod) -> 400 `validation`. Email is lowercased. Phone goes to E.164 with libphonenumber (region ID;
   `0812...`, `+62 812...` and `62812...` all become `+62812...`); unparsable but plausible numbers (6 to 15 digits,
   phone characters only) are kept as typed; anything else is a 400 with `details[0].path = ['phone']`.
3. Event row locked `FOR UPDATE` (capacity check and insert see the same count). Missing or `draft`: 404.
   Cancelled: 422 `event_cancelled`. `now >= endsAt`: 422 `event_past` (an ongoing event still takes sign-ups).
4. Same email already active on this event:
   - phone matches (digits compare): 200 `{ existing: true }` with the full ticket, and the ticket email is re-sent
     (at most once per 10 minutes, checked in `email_logs`, so restarts don't reset it; only `sent`/`logged` attempts count, so a
     failed delivery is retried on the next try).
   - phone doesn't match: the ticket is re-sent to the inbox and the API answers **409 `already_registered`** with
     `details: AlreadyRegisteredDetails { email (masked), emailSent }`. Knowing someone's email is not enough to get
     their ticket token (which can cancel the seat). The web should show the message as a friendly "check your inbox".
5. Otherwise `registrationWindow()` (see 6) decides: 422 `registration_closed` or `event_full` (with `details.spotsLeft`).
6. A cancelled registration for that email is reactivated (new name/phone/mode, check-in cleared, same code and token).
   Otherwise a new row: `ticketCode` `ZM-` + 6 from `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`, `qrToken` 16 random bytes base64url.
   `online` / `offline` events force the attendance mode.
7. Confirmation email, audit (`registration.create|reactivate`, masked email), debounced revalidate of `events` +
   `event:<id>`, counts pushed to open door dashboards.

`registration-rules.ts#registrationWindow()` is the one "is it open?" rule; `modules/events/event-logic.ts#registrationInfo`
mirrors it for `EventDetail.registration`.

QR: `qrcode` matrix at error correction H, ink dots (r = 0.44 module), finder and alignment patterns drawn as solid
rounded squares, the Zemi mark on a white plate (about 22% of the width, about 5% of the modules), 4 module quiet
zone. It encodes `PUBLIC_WEB_URL + '/t/' + token` (short = small code). Decoded by zxing-cpp and the WeChat QR engine at
1024, 200 and 120 px (plain OpenCV `QRCodeDetector` can't read dot styles at all, phones and zxing-wasm can).

## 2. Admin

All need the session cookie; non-GET needs `x-zemi-csrf: 1`. Permission checks are against the event (for
`/admin/registrations/:id` routes: the registration's own event, loaded first). 403 is checked before 404.

| route | permission | notes |
|---|---|---|
| `GET /admin/events/:id/registrations` | `registrations.view` | `registrationListQuery` (pageSize up to 500), `Paginated<RegistrationRow>`, `otherEvents` = other events with an active seat for that email. Search: name, email, phone, code, notes |
| `GET /admin/events/:id/registrations/stats` | `registrations.view` | `RegistrationStats`. Counts are active seats. `timeline` per Jakarta day (gaps filled, cumulative), `arrivals` per 5 min WIB on the event day (from 30 min before start), `byHour` 0 to 23 WIB, top 8 `domains`, `sources`, `returning` = active here and active on an earlier event |
| `POST /admin/events/:id/registrations` | `registrations.manage`; walk-ins: `attendance.manage` is enough. `checkIn: true` also needs `attendance.manage` | `adminRegistrationInput`. Ignores capacity and deadlines (admin override), refuses cancelled events. Active duplicate: 409 with `details.issues[path=email]`, `registrationId`, `ticketCode`, `fullName`, `checkedIn`. Cancelled duplicate: reactivated. `sendEmail` sends the ticket (walk-in copy for walk-ins). Returns `RegistrationRow` (email/phone masked unless `registrations.view`) |
| `PATCH /admin/registrations/:id` | `registrations.manage` | `registrationUpdateInput`; email uniqueness per event (409 on `email`), phone normalized, `status` sets/clears `cancelledAt`. No email is sent |
| `DELETE /admin/registrations/:id` | `registrations.manage` | hard delete (check-in history cascades, email logs keep a null link) |
| `POST /admin/registrations/:id/resend` | `registrations.manage` | `ResendResult`; 422 `cancelled` for cancelled seats, 422 `event_cancelled` when the event is cancelled (bulk resend too) |
| `POST /admin/events/:id/registrations/bulk` | resend/cancel/restore/delete: `registrations.manage`; check-in/undo-check-in: `attendance.manage` | ids outside the event are ignored. `BulkRegistrationResult { affected, skipped, emails, counts }` |
| `GET /admin/events/:id/registrations/export?format=csv\|xlsx` | `registrations.export` | `registrationExportQuery` (list filters, `status` default `all`, sort default `name`). File name `zemi-97-participatory-ai-registrations-2026-09-26.xlsx` (a slug that already starts with `zemi-97` isn't prefixed twice). XLSX: ink header row, frozen header + first two columns, autofilter, zebra rows, phones as text, WIB times as real dates, an "About" sheet with counts. CSV: UTF-8 BOM, CRLF, formula-injection guard that keeps `+62...` phones intact. Audited |
| `GET /admin/events/:id/attendance-sheet.pdf?sort=name\|registered&blankRows=10&mode=all\|in-person` | `registrations.export` | "Kertas Absensi", A4, see section 4. Audited |
| `GET /admin/audience?search&page&pageSize` | capability `audience.view` | `Paginated<AudienceRow>`: unique emails with an active seat anywhere, most recent first, latest name, latest phone, attended count, events newest first |
| `POST /admin/events/:id/broadcast` | `emails.send` | `broadcastInput`. HTML sanitized (section 5). `testEmail` sends exactly one "[Test]" email to that address and never touches registrants. Otherwise one email per person (never a shared To line) in batches of 10 with a 400 ms pause, max 3 real broadcasts per event per 10 minutes. `{{name}}` / `{{fullName}}` placeholders. Returns `BroadcastResult` counts (synchronous) |
| `GET /admin/events/:id/emails?template&status&page` | `emails.send` or `registrations.view` | `Paginated<EmailLogRow>`; `to` is masked without `registrations.view` |

### Door (AttendanceModule)

| route | permission | notes |
|---|---|---|
| `POST /admin/events/:id/attendance/scan {payload, device}` | `attendance.scan` | `parseTicketPayload` (ticket URL, `/t/` short link, raw token, or `ZM-XXXXXX` typed by hand). Outcomes `checked-in`, `already` (with who and when), `wrong-event` (+ `otherEvent`), `cancelled`, `not-found`. Idempotent: two phones scanning the same ticket give one check-in and one `already`. Only the scanned person's name, code and mode are returned. 90 scans/min per admin per event |
| `POST /admin/registrations/:id/check-in` / `undo-check-in` `{device?}` | `attendance.manage` | `CheckinResult { changed, message, registration: RosterRow, item, counts }`. Cancelled seats: 422 (add them as a walk-in, which reactivates) |
| `GET /admin/events/:id/attendance` | `attendance.scan` | `AttendanceSummary`. Scan-only principals get `recent` limited to their own scans |
| `GET /admin/events/:id/attendance/roster?search&checkedIn&page&pageSize` | `attendance.manage` | `Paginated<RosterRow>` (active seats, sorted by name, masked email/phone, pageSize up to 500) |
| `GET /admin/events/:id/attendance/stream` | `attendance.scan` | SSE on `event:<id>:attendance`, JSON `AttendanceStreamMessage`: first `snapshot {summary, counts}`, then `checkin {item, counts}` on every check-in/undo/walk-in/bulk from any device, `counts` on sign-ups, cancels and deletes, `ping` every 20 s. Scan-only subscribers get `item: null` for other people's scans |

Every mutation writes `checkins` history (check-in and undo) and an audit entry: `registration.check-in`,
`registration.undo-check-in`, `registration.walk-in`, `registration.admin-create`, `registration.update`,
`registration.delete`, `registration.resend`, `registration.bulk-<action>`, `registration.export`,
`registration.attendance-sheet`, `event.broadcast`, `event.broadcast-test`, and system ones
`event.email-reminder|starting|thanks|cancelled`. Summaries use "Rina S." and masked emails, never full contact data.

## 3. Emails (React Email, brand components)

| template key | when | notes |
|---|---|---|
| `registration-confirmed` | sign-up, duplicate sign-up ("no need to sign up twice" copy), admin add, walk-in (walk-in copy), admin resend ("in case the first one got lost" copy, `resendReason: 'organizer'`) | QR inline as CID `qr` (attachment `qr.png`, 600 px) with a hosted fallback link, ticket code, when/where (WIB), Google Maps button, "Show my ticket" + "Add to calendar" (hosted .ics, and the .ics is attached), how to join online (hybrid/online events), cancel link `/tickets/<token>?cancel=1`. Online attendees see the join help first and the QR lower down. Sets `registrations.email_status` (`pending` then `sent`/`logged`/`failed`) |
| `registration-cancelled` | public cancel | "Take me back to the event" only while the event is ahead and open |
| `event-reminder` | 09:00 WIB the Jakarta day before (cron) | "Tomorrow at 13:15", code, ticket + directions buttons, release-seat link |
| `event-starting` | 10 min before start (cron) | in-person: room + ticket, online: "Watch live" (red) to the event page |
| `event-thanks` | after the end, within 3 h (cron) | subject, preview and lead follow what the person did: checked in "Thanks for coming", online "Thanks for tuning in", in-person no-show "We saved you a seat at ..." (never a thank-you for coming to someone who didn't). Recording link (`/events/<slug>#recording`) when a public ready recording exists, photos link (`#photos`) when documentation exists. Waits up to 2 h while the stream is live or a recording is still processing |
| `event-update` | admin broadcast | wraps the sanitized HTML, adds when/where + the person's ticket button, `[Test]` banner for tests |
| `event-cancelled` | worker for `event.cancelled.notify` | reason in a red callout |

All seven are registered as previews (`GET /admin/system/email-preview/<key>`). Signature and reply-to come from
`site_settings.email` (reply-to only when it is a real address). Recipients with active seats only.

### Lifecycle scheduler

pg-boss cron `people.lifecycle` every 5 minutes (Asia/Jakarta), queue policy `singleton`. Candidates: visibility
`published` or `unlisted` (both take sign-ups, so unlisted people get reminders too), not cancelled, starting within
48 h or ended within 3 h. Windows:

- reminder: `now >= 09:00 WIB on the Jakarta day before` and `now < startsAt - 1h`. (SPEC 10 wins over the "starts
  within 24h" wording: a Friday 13:15 session gets its reminder Thursday 09:00, which is 28 h ahead.)
- starting: `startsAt - 10min <= now < endsAt - 15min`.
- thanks: `endsAt <= now < endsAt + 3h` (deferred as described above).

Each stage is claimed with `UPDATE events SET <stage>_sent_at = now WHERE id = $1 AND (<stage>_sent_at IS NULL OR
<stage>_sent_at < <window opens> - 6h)` before sending (the columns already existed in `schema.ts`, no migration needed).
A sent time more than 6 hours before the stage's current window belongs to an earlier schedule: when an event is moved
to another day after its reminder went out, the reminder (and starting/thanks) runs again for the new date. Same-day
nudges (the start slips 20 minutes after "starting now" went out, the end moves 30 minutes after the thank you) never
re-send (`registration-rules.ts#lifecycleStageSent`, covered in `people.spec.ts`). Recipient dedupe (`email_logs`) uses
the same cutoff, so people reminded about the old date hear about the new one, while a retried batch never double-sends. Toggles `sendReminders`, `sendStartingNow`, `sendThankYou` (default on)
skip a stage without claiming it.

`event.cancelled.notify { eventId }` (sent by the events workstream on cancel with `notify: true`): skips when the
event was restored meanwhile, emails active seats, dedupes against `email_logs` since `cancelledAt` so retries never
double-send, retries 3 times.

## 4. The attendance sheet PDF

@react-pdf/renderer, A4 portrait. Fixed + absolutely positioned page header (mark, "Kertas Absensi · Attendance sheet ·
Zemi #n", title clipped to two lines, date, time WIB, venue and room, a counts box), brand strip, and the ink table
header, so all of it repeats on every page. Columns: No, Name, Ticket, Phone (`••• 1234`), Joining, Here (checkbox,
green tick when already checked in), Signature box. Zebra rows, rows never split across pages, numbered blank
"WALK-IN" rows at the end, footer note + "Page x of y" on every page. Fonts: Atkinson Hyperlegible Next 400/700,
Recursive display 700/900 and mono 400/700, static instances made with `fonttools varLib.instancer` from the variable
TTFs in `scripts/brand/fonts`. If the font files are missing it falls back to Helvetica/Courier instead of failing.

## 5. Broadcast sanitizing

`sanitize-html` allowlist: p, br, strong/b, em/i, u, s, a (http, https, mailto; `target=_blank rel=noopener noreferrer`),
ul, ol, li, h2, h3, blockquote, hr, img (https only), code. No classes, iframes, scripts, forms, handlers; admin inline
styles are replaced by brand inline styles per tag (email clients ignore `<style>`). Links whose href and images whose
src get stripped are dropped entirely (no dead links, no broken image boxes). A message that is empty after
sanitizing is a 400 on `html`.

## 6. Shared contract additions (additive, `packages/shared/src/schemas/registrations.ts`)

`AttendanceCounts`, `AttendanceStreamMessage`, `CheckinResult`, `rosterQuery`, `audienceQuery`,
`registrationExportQuery`, `attendanceSheetQuery`, `BulkRegistrationResult`, `BroadcastResult`, `emailLogQuery`,
`ResendResult`, `AlreadyRegisteredDetails`.

## 7. Decisions

- **Deviation from the task text:** a duplicate sign-up with a *different* phone answers 409 `already_registered`
  (ticket re-sent to the inbox) instead of returning the ticket with `existing: true`. Returning it would hand the
  ticket token, which can cancel the seat, to anyone who knows the email. Same email + same phone still gets
  `200 { existing: true }` with the ticket, as specified.
- Reminder timing follows SPEC 10 (09:00 WIB the day before), until one hour before the start.
- Unlisted events get lifecycle emails (their registrants are real people).
- Admin adds and walk-ins ignore capacity and deadlines; they refuse cancelled events.
- `email_status` tracks ticket delivery only (confirmation and resends), not reminders or broadcasts.
- Admin cancel via PATCH/bulk sends no email (the organizers usually already talked to the person).
- `attendance.scan` only: summary `recent` and SSE items are limited to your own scans (SPEC 6: "only the scanned person").
- Broadcasts send synchronously in paced batches. Around 300 recipients takes about a minute on Resend.
- Registration stays open during the event (people join the stream late) and closes at `endsAt`.

## 8. Verification (resume run, on the re-seeded DB)

Review pass (2026-09-26): 33 unit tests in `people.spec.ts` (was 28), including schedule-change cases for the lifecycle
stale margin. Live: a "starting now" sent at 04:40 WIB was not re-sent after the start moved 5 minutes later (04:45 tick),
and a week-old `starting_sent_at` was re-claimed at the 04:50 tick with email_logs dedupe skipping the person already
emailed. RBAC matrix re-run with scan-only, door (attendance.manage), view-only and emails.send admins; scan-only SSE
gets `item: null` for other people's check-ins; a stream without a grant is a JSON 403.

Throwaway events and admins created through the admin API, deleted afterwards.

- Sign-up: new, duplicate same phone (`existing: true`, resend throttled), duplicate other phone (409), full (422
  `event_full`), closed, past, draft (404), honeypot (400), bad phone/email (400 with `path`), rate limit (429 on the
  6th/min), phone normalization (`0812-3456-7890` -> `+6281234567890`, `+1 415 555 2671` -> `+14155552671`), cancel
  (idempotent, one email), reactivation (same code and token).
- Ticket JSON, 404/400 tokens, QR PNG (1024 px, immutable) decoded with zxing-cpp at 1024, 300 and 160 px to
  `http://localhost:3300/t/<token>` (the web redirects `/t/:token` to `/tickets/:token`), SVG, .ics (confirmed and
  cancelled).
- Admin: list, stats (seeded Zemi #97: 88 active, 70 checked in, arrivals sum to 70), add, walk-in + check-in,
  duplicate 409, CSRF 403, PATCH cancel/restore/phone, delete (then 404), resend (organizer copy rendered), bulk
  (check-in with a foreign id skipped, undo, resend, cancel, restore), CSV (BOM, 94 rows), XLSX (checked with
  openpyxl: ink header, freeze `C2`, autofilter, phones as text, WIB dates, About sheet), PDF (5 pages, page 1 and
  the blank-row page viewed via `pdftoppm`, header repeats), audience, broadcast (test + real, sanitizer strips
  script/iframe/`javascript:`/handlers/http images, empty after sanitize is 400), email log list.
- Door: scan outcomes checked-in, already (second device), typed lowercase code, wrong-event, cancelled, not-found
  (unknown code and foreign URL), manual check-in/undo, summary, roster. SSE with `curl -N`: snapshot, then a `checkin`
  message for every walk-in, scan, manual, undo and bulk item, `counts` on sign-up/cancel/delete, pings.
- RBAC with two scoped admins: `attendance.scan` only (scan ok, own-only `recent`, roster/list/walk-in/other event
  403) and `attendance.manage` only (masked roster, walk-in ok, `source: admin`, export, audience, bulk resend, emails
  403, bulk check-in ok).
- Lifecycle: real cron ticks sent reminder ("Today at 13:15 WIB"), starting (online "Going live"), thanks (came /
  missed variants, earlier recipients deduped) and a re-reminder for an event whose `reminder_sent_at` predated its
  window. `event.cancelled.notify` emailed all four seats after `POST /admin/events/:id/cancel`.
- Every template rendered from `.mail-outbox` with Playwright at 390 and 1200 px, no console errors
  (`scratchpad/shots/api-people/live-*.png`).

## 9. Known gaps

- Broadcasts are synchronous; a very large audience (1000+) would want a job with progress.
- `emailSettings.senderName` is not applied (MailService owns `from`).
- The QR logo plate would cover a center alignment pattern from QR version 7 up (URLs above ~58 bytes). Our
  `https://<host>/t/<22 chars>` links stay at version 6.
- Rate limits are in memory (one API instance), like the rest of the API.
- Names in scripts the brand fonts don't cover (CJK, for example) print as blank boxes in the PDF.

## 10. Contract the web relies on (for the public-site and admin teammates)

- Sign-up form: 409 `already_registered` with `details: AlreadyRegisteredDetails { email (masked), emailSent }` means
  "that email already has a seat, check your inbox", not an error state. 422 codes: `event_full` (`details.spotsLeft`),
  `registration_closed`, `event_past`, `event_cancelled`. 400 `rejected` is the honeypot. 429 has `Retry-After`.
- `/tickets/[token]?cancel=1` (the email's "Cancel my seat" link) should open the cancel confirmation right away.
- Event page anchors `#recording` and `#photos` (the thank you email links to them).
- Admin resend buttons: 422 `event_cancelled` on a cancelled event.
