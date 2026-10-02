# Discussion

Public routes: `/discussion`, `/discussion/create`, `/discussion/[id]`. `/q` permanently redirects
to `/discussion`. Studio route: `/admin/discussion`.
The discussion is a place for seminar questions. A thread belongs to a published event or to
General. The currently running or next scheduled event leads the feed, then General, then other
events. Moderators can pin a thread above those automatic groups.

## Identity

The first visit asks for a display name only. A four-digit suffix distinguishes people who choose
the same name. A random 256-bit token is stored in a Secure, httpOnly, SameSite=Lax cookie for up
to one year; only its SHA-256 hash is stored in Postgres. One active identity is allowed per browser
session. Name changes affect future posts; previous posts keep the label used when written.
Deleting an identity anonymizes its posts and public audit entries, removes its votes and reactions,
and clears the cookie. Because no account or other credential exists, someone who clears cookies or
uses another browser can create another identity. No claim of global uniqueness is made.

## Participation

- Threads have a title, BlockNote body, up to five tags, an optional published event and,
  inside that event, an optional speaker from its lineup (`speaker_id`, set null if the speaker
  is deleted). The API rejects a speaker without an event or one that is not on the event's
  public lineup. The composer shows the lineup with photo, role, affiliation, talk title, rundown
  slot and an "On stage now" / "Up next" badge (Jakarta clock against the rundown), plus a
  detailed preview of the chosen speaker. `/discussion/create?event=<id>&speaker=<id>` opens it
  preselected; `/discussion?event=<id>&speaker=<id>` opens the feed filtered. Cards and the
  question page show who a question is for, and the feed filters by speaker within an event.
  `GET /public/discussion/events` returns each event's `lineup`; `GET /events/:id` returns one.
- BlockNote offers slash commands. Uploaded JPG, PNG, WebP and AVIF images are capped at 5 MB,
  re-encoded to WebP to strip metadata, stored under `assets/discussion/`, and served by the
  existing media proxy. The author must complete a fresh Turnstile check for each image.
- Participants can edit or delete their own open threads, reply to open threads, reply to replies,
  delete their replies, vote once per target, react, report, and mark one reply as helpful on their
  own thread. Bookmarks live in localStorage on that browser.
- Locked and archived threads remain readable but cannot receive replies. Hidden and deleted
  threads are not available through public endpoints. The public API checks identity for all
  discussion reads and writes, independently of the client-side name gate.

## Live questions

While an event's stream is live, its page shows a questions window under the player
(`components/public/discussion/live-questions.tsx`, rendered by `LiveStage` only). It is the
event's regular discussion, not a chat: questions sorted by votes or newest, filtered by speaker,
refreshed every 10 seconds while the tab is visible. Viewers join with a name inline, vote, open a
question to read it and its replies, reply, and ask their own (title, optional details, and who it
is for; it defaults to the speaker on stage per the rundown). Everything posts through the same
public endpoints, Turnstile checks and rate limits, so questions stay in the discussion after the
stream ends. "Longer question" opens the full composer in a new tab, preselected.

## Moderation and abuse control

The `discussion.view` capability reads every thread, reply and report. `discussion.manage`
can flag, pin, lock, archive, hide, delete or reopen threads; edit tags; hide, delete or restore replies; resolve
or dismiss reports; and suspend or unsuspend participants. Every moderator mutation is audited.
The dashboard sorts reported threads first and exposes search and state filters. Suspensions take
effect on the next request because identity status is read from Postgres each time.

Cloudflare Turnstile is checked server-side for joining, renaming, posting, editing, replying,
reporting and image upload. The API validates success, action and the production web hostname.
Unsafe discussion requests also require `x-zemi-csrf: 1`. Per-IP and per-identity rate limits
constrain joins, posts, replies, uploads, votes, reactions and reports. The limiter is process-local;
if the API scales beyond one instance, replace it with a shared limiter. Read and write endpoints
are under `/api/v1/public/discussion`; moderation is under `/api/v1/admin/discussion`.

Production uses the managed Turnstile widget restricted to `zemi.ac`.
`TURNSTILE_SECRET_KEY` is stored only on Railway's API service;
`NEXT_PUBLIC_TURNSTILE_SITE_KEY` is a web build variable. Local development may leave the
secret unset and uses Cloudflare's test site key. The Railway IaC preserves both variables.
