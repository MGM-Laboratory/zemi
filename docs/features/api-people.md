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
| `GET /public/tickets/:token/calendar.ics` | one VEVENT, UID `event-<eventId>@zemi.labmgm.org` (re-import updates it), 30 min alarm, 5 min cache |

Sign-up rules, in this order:

1. Honeypot `website` filled: 400 `rejected` ("That didn't go through...") before any validation, so bots don't learn the field.
2. `registerInput` (zod) -> 400 `validation`. Email is lowercased. Phone goes to E.164 with libphonenumber (region ID;
   `0812...`, `+62 812...` and `62812...` all become `+62812...`); unparsable but plausible numbers (6 to 15 digits,
   phone characters only) are kept as typed; anything else is a 400 with `details[0].path = ['phone']`.
3. Event row locked `FOR UPDATE` (capacity check and insert see the same count). Missing or `draft`: 404.
   Cancelled: 422 `event_cancelled`. `now >= endsAt`: 422 `event_past` (an ongoing event still takes sign-ups).
4. Same email already active on this event:
   - phone matches (digits compare): 200 `{ existing: true }` with the full ticket, and the ticket email is re-sent
     (at most once per 10 minutes, checked in `email_logs`, so restarts don't reset it).
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
| `POST /admin/registrations/:id/resend` | `registrations.manage` | `ResendResult`; 422 for cancelled seats |
| `POST /admin/events/:id/registrations/bulk` | resend/cancel/restore/delete: `registrations.manage`; check-in/undo-check-in: `attendance.manage` | ids outside the event are ignored. `BulkRegistrationResult { affected, skipped, emails, counts }` |
| `GET /admin/events/:id/registrations/export?format=csv\|xlsx` | `registrations.export` | `registrationExportQuery` (list filters, `status` default `all`, sort default `name`). XLSX: ink header row, frozen header + first two columns, autofilter, zebra rows, phones as text, WIB times as real dates, an "About" sheet with counts. CSV: UTF-8 BOM, CRLF, formula-injection guard that keeps `+62...` phones intact. Audited |
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
| `registration-confirmed` | sign-up, duplicate sign-up (resend copy), admin add, walk-in (walk-in copy), resend | QR inline as CID `qr` (attachment `qr.png`, 600 px) with a hosted fallback link, ticket code, when/where (WIB), Google Maps button, "Show my ticket" + "Add to calendar" (hosted .ics, and the .ics is attached), how to join online (hybrid/online events), cancel link `/tickets/<token>?cancel=1`. Online attendees see the join help first and the QR lower down. Sets `registrations.email_status` (`pending` then `sent`/`logged`/`failed`) |
| `registration-cancelled` | public cancel | "Take me back to the event" only while the event is ahead and open |
| `event-reminder` | 09:00 WIB the Jakarta day before (cron) | "Tomorrow at 13:15", code, ticket + directions buttons, release-seat link |
| `event-starting` | 10 min before start (cron) | in-person: room + ticket, online: "Watch live" (red) to the event page |
| `event-thanks` | after the end, within 3 h (cron) | recording link (`/events/<slug>#recording`) when a public ready recording exists, photos link (`#photos`) when documentation exists. Waits up to 2 h while the stream is live or a recording is still processing |
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

Each stage is claimed with `UPDATE events SET <stage>_sent_at = now WHERE id = $1 AND <stage>_sent_at IS NULL` before
sending (the columns already existed in `schema.ts`, no migration needed). Toggles `sendReminders`,
`sendStartingNow`, `sendThankYou` (default on) skip a stage without claiming it.

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
styles are replaced by brand inline styles per tag (email clients ignore `<style>`). A message that is empty after
sanitizing is a 400 on `html`.

## 6. Shared contract additions (additive, `packages/shared/src/schemas/registrations.ts`)

`AttendanceCounts`, `AttendanceStreamMessage`, `CheckinResult`, `rosterQuery`, `audienceQuery`,
`registrationExportQuery`, `attendanceSheetQuery`, `BulkRegistrationResult`, `BroadcastResult`, `emailLogQuery`,
`ResendResult`, `AlreadyRegisteredDetails`.

## 7. Decisions

- Duplicate sign-up with a different phone answers 409 `already_registered` instead of returning the ticket (privacy).
- Reminder timing follows SPEC 10 (09:00 WIB the day before), until one hour before the start.
- Unlisted events get lifecycle emails (their registrants are real people).
- Admin adds and walk-ins ignore capacity and deadlines; they refuse cancelled events.
- `email_status` tracks ticket delivery only (confirmation and resends), not reminders or broadcasts.
- Admin cancel via PATCH/bulk sends no email (the organizers usually already talked to the person).
- `attendance.scan` only: summary `recent` and SSE items are limited to your own scans (SPEC 6: "only the scanned person").
- Broadcasts send synchronously in paced batches. Around 300 recipients takes about a minute on Resend.
- Registration stays open during the event (people join the stream late) and closes at `endsAt`.

## 8. Known gaps

- Broadcasts are synchronous; a very large audience (1000+) would want a job with progress.
- `emailSettings.senderName` is not applied (MailService owns `from`).
- The QR logo plate would cover a center alignment pattern from QR version 7 up (URLs above ~58 bytes). Our
  `https://<host>/t/<22 chars>` links stay at version 6.
- Rate limits are in memory (one API instance), like the rest of the API.
- Names in scripts the brand fonts don't cover (CJK, for example) print as blank boxes in the PDF.
