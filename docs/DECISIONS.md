# Decisions log

Append-only. One line per judgment call: date, area, decision, why.

- 2026-09-25 infra: MediaMTX pinned to v1.21.1 with `authMethod: http`; `hlsCDNSecret` gives the API HLS proxy one shared cookieless session.
- 2026-09-25 infra: Railway buckets are private, so all media is served through the API `/media/*` proxy with immutable caching.
- 2026-09-25 infra: Recording = MediaMTX 60s fMP4 segments uploaded to the API as they finish; the API stitches and trims on End. Survives API restarts.
- 2026-09-25 auth: passphrase-only login uses HMAC lookup + argon2id verify; superadmin is a virtual principal from env.
- 2026-09-25 web: local dev web port is 3300 (3000 is used by another project on this machine).
- 2026-09-25 content: event-related publications reference Publication records (with quick-create stubs) so every paper mention links to /publications/[slug].
- 2026-09-25 routes: speaker pages live at /speakers/[slug]; /speaker/[slug] redirects.
