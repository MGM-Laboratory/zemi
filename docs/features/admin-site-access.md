# admin-site-access: site CMS, inbox, admins and RBAC, audit, system

Owner: admin-site-access. Web only. It uses the endpoints from api-core (admins, sessions, audit, system) and api-site-seed (site settings, FAQ, team, inbox, content reset).

## Files

```
apps/web/src/app/admin/(dashboard)/
  site/layout.tsx, page.tsx (redirects to general), general|seo|home|about|contact|emails|faq|team/page.tsx
  inbox/page.tsx
  admins/page.tsx, admins/new/page.tsx, admins/[id]/page.tsx
  audit/page.tsx
  system/page.tsx
apps/web/src/components/admin/site/
  site-shell.tsx         header, section tabs, "View page", gate on site.edit
  site-kit.tsx           SITE_SECTIONS, useSiteSetting, SiteSettingLoader, useSiteSettingSave (sends only dirty top-level
                         fields), SettingsForm (save bar + dirty guard), SiteBlock, WithPreview, reorderToMove
  general-form.tsx       name, tagline, lab, default weekday/start/end/venue/capacity, announcement bar + live preview, footer
  seo-form.tsx           title/description with length hints + SERP preview, keywords, OG image (1200x630 crop) + chat/card previews
  home-form.tsx          hero + preview, Friday clock beats editor (sortable, HH:mm, order/range/duplicate warnings,
                         "Sort by time"), stats toggle, fun stat, featured event picker, closing copy
  friday-clock-preview.tsx  live mini clock: rail 13:15 to 15:15, analog pill, beat card, play/prev/next
  about-form.tsx         title, intro, story (BlockEditor), pillars (shape select), audiences, "how to present" steps + CTA
  rows-field.tsx         sortable title/body rows used by the about page
  contact-form.tsx       email, WhatsApp (test link), office hours, address, maps (open link), topics, notify emails, socials (LinksEditor)
  emails-form.tsx        sender name, reply-to, sign-off with an inbox preview, lifecycle toggles, link to email previews
  collection-kit.tsx     useOrderedCollection (optimistic reorder with a sequence guard, visibility switch, delete, upsert),
                         EditorSheet (dirty guard on Escape/X/outside click), VisibilitySwitch, CollectionCounts, linkRowErrors
  faq-manager.tsx        FAQ CRUD, drag or keyboard reorder, inline draft switch, sheet editor, "Save and add another",
                         live accordion preview, `n` for a new question
  team-manager.tsx       team CRUD, round avatar crop (purpose team-avatar), role, bio, links, draft switch, reorder, grid preview
  inbox-page.tsx         inbox (see below)
apps/web/src/components/admin/access/
  access-ui.tsx          AccessGate (superadmin or a capability), NoAccess, AdminStatusChip, ExpiryHint, describeUserAgent
  admins-list.tsx        table of admins + the superadmin's own sessions
  admin-create.tsx       create flow + show-once reveal, sticky "create bar" with a live access line (mod+s creates)
  admin-detail.tsx       edit everything, rotate passphrase dialog, switch off/on, delete (typed), sessions, recent activity
  admin-form.tsx         shared schema + ProfileFields, ExpiryFormField, PassphraseFormField, AccessEditor (editor + summary)
  expiry-field.tsx       date + time (WIB) or never, chips 1 day / 1 week / 1 month / end of semester (31 Jan, 30 Jun)
  passphrase-field.tsx   generate (GET /admin/passphrase/generate, dice spin + scramble) or type your own with a strength meter
  passphrase-reveal.tsx  show-once card, copy, "copy a message to send", "you won't see this again"
  policy-model.ts        pure RBAC editing helpers (bundles, presets, locked implied actions, clean/compare)
  policy-editor.tsx      the RBAC editor (below)
  policy-summary.ts      plain-English summary, least-privilege hints, compact list line
  policy-summary-card.tsx live summary card + "their sidebar" preview (runs the real visibleNav on the draft policy)
  use-grant-labels.ts    names for granted items (remembered when picked, fetched by id otherwise, 404 = deleted)
  sessions-list.tsx      sessions with sign out, "sign out everywhere", folds after 6 rows
  audit-log.tsx, audit-meta.ts, json-view.tsx   audit log
  system-page.tsx        system status, counts, environment, test email + previews, content reset
```

## Pages

### Site (`site.edit`)

`/admin/site/{general,seo,home,about,contact,emails,faq,team}`. Every settings page loads one section
(`GET /admin/site/settings/:key`) and saves it with `PUT /admin/site/settings/:key`, sending only the top-level
fields that changed. The API merges them. Field errors from the API land under the right input. Each page has
the floating save bar (Cmd/Ctrl+S), a "leave without saving?" guard on in-app links and tab close, and a
"View page" link to the public page.

FAQ and Team use `GET|POST /admin/site/{faqs,team}`, `PATCH|DELETE .../:id` and `PUT .../order { ids }`. A reorder
shows up at once and is rolled back with a toast if the PUT fails. Only the newest reorder writes the server's answer
back, so a slow reply can't undo a later drag. Visibility switches are optimistic too.

### Inbox (`inbox.view`)

`/admin/inbox?view=open|new|read|replied|archived|all&q&id&page`, all kept in the URL.
- Tabs show counts for new, open and archived. The sidebar badge reads `?status=new&pageSize=1`.
- Wide screens get two panes. Phones get a sheet.
- The detail view shows sender, email (copy), topic, and the time in WIB plus a relative time.
- Opening a new message marks it read after 600 ms. "Mark unread" undoes that.
- Actions: read/unread, replied, archive/unarchive, delete (with a confirm).
- "Reply by email" is a `mailto:` with `Re: <topic>`, a greeting and the quoted message. After you click it, a nudge offers "Mark replied".
- Keys: `j`/`k` move, `e` archives, `u` marks unread, `r` replies, `Esc` closes, `/` searches.

### Admins and access (superadmin only)

- `/admin/admins`:
  - Search and status filter.
  - Each row shows the status chip, preset or "Custom" with counts ("Door crew · 1 event"), a red flag when personal data is in reach, when access ends, and an Activity column (last login plus live sessions).
  - It is a table from 1280 px up (cells clamp, so nothing scrolls sideways) and 2-column or 1-column cards below that.
  - Your own sessions are listed below.
- `/admin/admins/new` has four steps: who, until when, passphrase, access. Creating shows the reveal once. Leaving without copying asks first. "Add another" rolls a fresh passphrase.
- `/admin/admins/[id]`:
  - Edits name, note, expiry and policy with `PATCH` (dirty fields only).
  - New passphrase (`POST .../passphrase`, reveal once).
  - Switch off/on (`PATCH { disabled }`).
  - Delete: you type the name, then `DELETE`.
  - Sessions with sign out (`GET .../sessions`, `DELETE /admin/sessions/:id`).
  - The last 8 audit entries by them, with a link to all of them.

**The RBAC editor:**
1. **Presets.** These are the `POLICY_PRESETS` cards (buttons with `aria-pressed`).
   - The "pick events" presets (event editor, door crew, stream operator) keep the events already chosen, re-cut to that bundle, then open the event picker.
   - If you already set something up, it asks before replacing it.
   - Under the cards: "Matches X", "Custom mix" or "No access yet".
2. **Global powers.** One toggle card per capability, with its `CAPABILITY_META` hint. Personal-data powers carry a flag.
3. **Scopes.** Events, Speakers and Publications each have:
   - A searchable picker. Items you already added are hidden.
   - A "New ones get" bundle select.
   - An "All <type>" wildcard button.
4. **Scope rows.** Each row has:
   - The item (cover or avatar, number, title, status), or a "Deleted event" warning.
   - Bundle shortcuts from `EVENT_ACTION_BUNDLES`.
   - The action matrix, grouped by `EVENT_ACTION_META` (Content, People, Door, Stream, Media). Implied actions show checked, with a lock and "Comes with X" (`expandActions`). On event rows the matrix folds away behind "Fine-tune", with chips showing the result.
   - A warning when nothing is ticked. Empty scopes are dropped on save.
5. **Live summary.** For example: "Can look at Zemi #97. Can scan tickets and check people in for Zemi #98. Cannot see full emails or phone numbers. The check-in list shows them masked. Cannot manage admins...".
   - It also previews "Their sidebar".
   - Least-privilege hints: `registrations.view` or `emails.send` on every event, wildcard delete, `audience.view`, stream control everywhere, `events.create` meaning ownership, `media.library` seeing drafts, broad access with no end date, and nothing granted.
   - On large screens it sits sticky beside the editor. On smaller screens it is a collapsible card above the editor and a full card below.

### Audit log (superadmin or `audit.view`)

`/admin/audit`. Filters live in the URL:
- actor (a combobox of admins plus superadmin and system)
- action family
- resource type
- date range (WIB days, with Today, 7 days and 30 days chips)

Entries are grouped by WIB day. Each row has a tone dot, the summary, the actor, the time, the action code and a link to the resource. It expands to show the exact time, IP and a JSON viewer for `meta`. Pagination is 50 per page.

### System (superadmin)

`/admin/system`. It polls `GET /admin/system` every 30 s.
- **Status cards:** DB latency, storage bucket, email, media server (active inputs) and jobs (queued, failed in 24 h).
- **Outbox warning:** when `email.provider` is `outbox`, a yellow callout says emails are only being written to `apps/api/.mail-outbox/` because `RESEND_API_KEY` is missing, and the Email card says "Outbox only".
- **Counts and environment:** row counts per table; the environment (API version, server time in WIB, the browser's time zone, public URLs, the OBS server with a copy button).
- **Email tools:** a test email (`POST /admin/system/test-email`) and a list of email previews that open in a new tab.
- **Danger zone:** `POST /admin/system/reset-content`. You type "delete everything", then it shows the rows and files removed.

## Contract changes

- `packages/shared/src/schemas/admins.ts`: `auditQuery` gained optional `from` and `to` (ISO instants). This was an additive change from my first run. The API's `auditLog()` already filters on them (`gte`/`lt`). Verified: a one-hour window returned 117 of 283 entries.
- No `schema.ts` change, no migration.

## Decisions

- **Settings saves send only dirty top-level fields.** Two admins editing different blocks of the same section don't overwrite each other.
- **Passphrase on create.** The first roll on the create page becomes the form's default value, so an untouched form isn't "unsaved". The create page has its own sticky bar that reads "Rani · Door crew: 1 event", instead of the kit's "All saved" (which would be misleading on a form nothing has been saved from yet).
- **Least privilege by default.** New admins get a one-week expiry. Empty scopes are dropped. Creating an admin with no access asks first.
- **End of semester.** The next of 31 Jan or 30 Jun, 23:59 WIB (Indonesian odd and even semesters).
- **Event labels.** They don't repeat the number when the title already has it ("Zemi #100: the big one").
- **Sessions list.** It folds after 6 rows, because the superadmin had 100+ sessions from test logins. "Sign out everywhere" sends 6 requests at a time.
- **Admins table.** "Last login" and "Sessions" are merged into one Activity column, and the access line clamps to 2 lines. At 1440 the old 6-column table scrolled sideways inside itself and hid the sessions column.

## Verified (2026-09-26, against the shared API on :4400 and web on :3300, seeded DB)

- **Screenshots.** Every page at 390x844 and 1440x900. Home, inbox, admins, new admin, audit and system also at 820x1180 and 2560x1440. No horizontal scroll and no console errors on any of them. Files are in `scratchpad/shots/admin-site-access/`.
- **Admin flow (Playwright, `scratchpad/access/flows.mjs`).** As superadmin:
  - Filled in the new-admin form: name, note, the 1 day chip, a generated passphrase (seen), then a custom one.
  - Picked the Door crew preset, which auto-opened the picker; chose #98; set "New ones get" to Read-only and added #97.
  - The summary read as expected. Created the admin; the reveal matched and copy worked. "Done" went to the detail page.
  - Stored policy: `#98 [attendance.scan, attendance.manage]`, `#97 [view]`.
- **Signed in as that admin, in a fresh context:**
  - The sidebar shows only Overview and Events, with 2 events listed and permissions `#98 [view, attendance.scan, attendance.manage]`, `#97 [view]`.
  - `/admin/admins` and `/admin/site/general` show the no-access screen.
  - The API gave 403 for #98 registrations, #97 roster, PATCH #97, admins, site settings, inbox and audit, and 200 for the #98 roster.
  - Dashboard and event workspace screenshots at 1440 and 390.
- **Back as superadmin, on their detail page:**
  - Policy edit with the crew session still live: clicked the Door crew shortcut on #97 and saved (PATCH). The stored policy updated, the crew's next `GET /auth/me` showed #97 as door crew without signing in again, and the #97 roster went from 403 to 200.
  - Rotate: set a typed passphrase in the dialog. The reveal matched and copy worked. The old passphrase then gets 401, the new one 200, and their old session 401.
  - Signed out their remaining session: 0 sessions left.
  - Switched them off: login gave 403 `admin_disabled`. Switched them back on.
  - Delete stays disabled until you type the name; after deleting, the admin returns 404.
- **Site flows (`scratchpad/access/site-flows.mjs`):**
  - `n` opens a new FAQ. Escape with changes asks "Throw away your changes?", and "Keep editing" keeps the text.
  - Save adds the FAQ at the end. The row switch sets it to draft.
  - Keyboard reorder (Space, ArrowUp, Space) moved it up one on the server. Deleting it restored the original order.
  - The team edit sheet shows the current avatar. A clean sheet closes without asking.
- **Team avatar (`scratchpad/access/avatar.mjs`).**
  - Picking a portrait in the Add sheet opens the crop dialog on top of the sheet. Escape closes only the crop dialog.
  - "Upload" processes the image and the member saves with an `avatar` ImageRef (512x512, AVIF and WebP).
  - The test member and its asset were deleted afterwards.
- **Layout.** The screenshot script also flags inner sideways scrollers (`overflow-x: auto|scroll` with hidden content). Admins, admin detail, audit, inbox, system, FAQ, team and home are clean at 820, 1280 and 1440.
- **Expiry field.** Never/on a date, chips, a typed date, and "Start over" resetting it (`scratchpad/access/expiry.mjs`).
- **Checks.** `tsc --noEmit` and `eslint` pass for every owned file. Other people's in-progress files still have errors. No em or en dashes in owned files.

## Known gaps

- The public `/about` and `/contact` pages aren't built yet, so "View page" opens whatever the public team has there now.
- The OG image upload on the SEO page was not exercised in this run. It uses the same `ImageUploadCrop` as the team avatar, which was.
- The audit log's actor filter offers admins that still exist. Entries from deleted admins still show and can be searched by name through the API's `actor` ILIKE, but they aren't in the picker.

## Requests (outside my ownership)

- **admin-events.** A view-only or door-crew admin still sees the Details, Speakers, Rundown, Publications, Media and Settings tabs on the event workspace, plus the Lineup "Edit" link and the "Documentation" quick card. The server rejects writes. Please confirm each of those renders read-only for `view`, and hide Media without `media.manage`.
- **web-admin foundation (small).** When a Dialog opens over an open Sheet (for example the crop dialog over the team sheet), the Dialog overlay doesn't dim the Sheet, because both contents sit at `z-[61]` and the overlay sits below. Focus and Escape behave correctly. Raising a nested Dialog's overlay and content a step would fix the look.
- **api-core (optional).** The superadmin collects many live sessions from scripted logins. The UI folds them now. A "sign out every other superadmin session" endpoint would make that one request instead of N.
- **infra/lead.** The shared API on :4400 was down from 02:13 to about 03:49 WIB (the process exited cleanly). It is back now.

## Review (2026-09-26, reviewer pass)

Fixed:
- **Settings saves dropped field-array edits (`site-kit.tsx`).** The save sent only the keys in RHF `dirtyFields`, and RHF 7.88 only refreshes `dirtyFields` for `useFieldArray` moves and removes when something subscribed to it during render. On a fresh load of Home, editing the eyebrow and removing a beat saved the eyebrow and silently kept all 7 beats (the form then reset to 7). About's pillars, audiences and steps had the same problem. The save now deep-compares each top-level field against the values the form was loaded with (`sameJson`). When nothing differs after trimming, it skips the PUT instead of rewriting every field. Checked: Home (eyebrow + remove beat saves 6 beats), About (pillar keyboard move + CTA edit sends only `pillars` and `presentCta`), SEO (share image upload sends only `ogImageAssetId`), two saves in one session on Home, and a whitespace-only save (no PUT).
- **Home featured event for admins without event access (`home-form.tsx`).** A `site.edit`-only admin got a 403 (a console error) loading the featured event. The picker now skips the request when `ability.can('event', id, 'view')` is false and says "A Friday outside your access".
- **FAQ and Team sheets.** The footer's Cancel skipped the "Throw away your changes?" question. `EditorSheet` now passes its guarded close to a `footer` function.
- **Inbox keys behind a confirm.** With the delete confirm open, Escape also closed the message and `e`/`u`/`r`/`j`/`k` acted on the message behind it. They are ignored while an alertdialog is open.

Verified: capability-only admins (`site.edit`, `inbox.view`, `audit.view`) see only their pages and nav, with no 4xx or console errors; the share image upload end to end (crop 1.90:1, chat and card previews, `/public/site` returns `ogImage`); the content-reset confirm stays disabled until the phrase is exact (not run); every page at 390, 820, 1440 and 2560 with no sideways scroll, no inner scrollers and no console errors. `tsc` (web) is clean and `eslint` is clean for the owned files. Test admins, the share image and every changed setting were put back afterwards.

Not verified: re-crop of a share image or team avatar by a `site.edit`-only admin who did not upload it. The API limits re-crop and `/original` to the uploader, `media.library` and the superadmin, so this is likely refused.
