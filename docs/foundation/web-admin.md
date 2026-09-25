# Web admin foundation

This is the base every admin page builds on: the dashboard shell, login, the UI kit, form fields, permission helpers and the admin data layer. The look is "calm studio" (DESIGN.md section 11).

Open **`/admin/kit`** to see every component running, with sample data.

## File map

```
apps/web/src/
  proxy.ts                               cookie gate for /admin/* (Next 16 proxy, matcher is /admin only)
  app/admin/login/page.tsx               server: sanitizes ?next / ?reason, skips the form when the session is valid
  app/admin/login/login-screen.tsx       client: passphrase form + characters
  app/admin/(dashboard)/layout.tsx       server gate (getMeServer) + AdminProviders + AdminShell + AdminToaster
  app/admin/(dashboard)/page.tsx         TEMPORARY overview placeholder (the overview teammate replaces it)
  app/admin/(dashboard)/kit/page.tsx     living kit
  app/admin/not-found.tsx                what notFound() shows inside /admin (rendered outside the shell)
  components/admin/admin.css             keyframes, .zemi-admin base, BlockNote theme. Imported by the layouts above
  components/admin/ui/*                  UI kit        -> import from '@/components/admin/ui'
  components/admin/fields/*              form fields   -> import from '@/components/admin/fields'
  components/admin/shell/*               sidebar, topbar, palette, principal menu (used by the layout)
  components/admin/characters/character.tsx   Q, Hunch, Block, Bridge
  components/admin/brand/admin-mark.tsx, admin-wordmark.tsx   admin-local mark + wordmark
  components/admin/access-summary.tsx    "what you can do" in plain words + useGreeting()
  components/icons/*                     link icons for every LINK_KINDS value (server and client safe; public pages use them too)
  lib/admin/*                            data layer (below)
```

## Data layer (`@/lib/admin/...`)

There is no barrel file, so import each module by its own path. `server.ts` is server-only (it reads request headers). Never import it from a client component.

| module | exports |
|---|---|
| `api.ts` | `adminFetch<T>(path, { method, query, body, signal, headers, redirectOn401 })`, `api.get/post/put/patch/delete`, `ApiError`, `isApiError`, `isAbortError`, `errorMessage(err)`, `formatWait(sec)`, `adminUrl(path, query)` (for download links), `apiPath`, `buildQuery`, `redirectToLogin()`, `markSigningOut()` |
| `upload.ts` | `uploadAsset(file, { purpose, crop, adjust, alt, caption, credit, signal, wait }, onProgress)`, `waitForAsset(id)`, `recropAsset(id, { crop, adjust })` |
| `hooks.ts` | `useAdminMutation`, `useAssetPoll(id)`, `useHotkeys`, `useDebouncedValue`, `useDebouncedCallback`, `useNow(ms)`, `useMediaQuery`, `usePrefersReducedMotion`, `useMounted`, `isMac` |
| `ability.tsx` | `<AbilityProvider me>`, `useAbility()`, `useMe()` (sync `Me`), `useRefetchMe()`, `useCan(type, id?, action)`, `useCanAny`, `useHas(cap)`, `useIsSuperadmin`, `<Can>`, `checkAbility` |
| `me.ts` | `fetchMe(signal)`, `useLogout(onFailure?)` (leaves the page only after a confirmed logout or a 401; otherwise calls `onFailure(message)` and stays) |
| `query-keys.ts` | `adminKeys`, `invalidateResource(qc, resource, id?)`, `invalidateKeys`, `invalidateAdmin`, `clearAdmin` |
| `form.ts` | `useZodForm(schema, options)`, `applyApiErrorToForm(form, err, { map, focus })` |
| `server.ts` | `getMeServer()` (cached per request), `adminServerFetch<T>(path, { query })`, `currentAdminPath()` |
| `breadcrumbs.tsx` | `useBreadcrumbs(crumbs)`, `<SetBreadcrumbs items>`, `BreadcrumbsProvider`, `useCurrentBreadcrumbs` |
| `nav.ts` | `adminRoutes` (canonical URLs), `ADMIN_NAV`, `visibleNav(ability)`, `flattenNav`, `isActivePath` |
| `describe.ts` | `describeAccess(me)`, `principalRole(me)`, `firstName(name)` |
| `format.ts` | `formatBytes`, `formatDuration`, `formatRelative`, `formatCountdown`, `formatNumber`, `formatPercent` |
| `paths.ts` | `safeAdminNext(raw)`, `publicPaths.event/speaker/publication/ticket`, `SITE_URL` |
| `providers.tsx` | `<AdminProviders me>` (reuses the root QueryClient; adds admin retry defaults, ability, breadcrumbs, tooltip provider) |
| `cn.ts` | `cn` (re-export of `@/lib/utils`) |

### adminFetch

- Calls relative `/api/v1/...` through the same-origin rewrite, so the `zemi_session` cookie comes along. `'/admin/events'` and `'/api/v1/admin/events'` both work.
- Plain `body` values are sent as JSON. `FormData`, `Blob` and strings go as they are. The method defaults to POST when there is a body.
- Every non-GET request carries `x-zemi-csrf: 1`.
- Any failure throws `ApiError { status, code, message, details, fieldErrors, retryAfterSec }`, which also has the getters `isNetwork/isForbidden/isNotFound/isValidation/isRateLimited/isConflict`. A network failure is `status 0`.
- `fieldErrors` is built from zod issues (`details` as an array, or `details.issues`, or zod's `flatten()` shape) and keyed by dot path, like `speakers.0.talkTitle`.
- A 401 sends the browser to `/admin/login?next=<here>&reason=expired`. Pass `redirectOn401: false` to handle it yourself.
- **Admin code uses the `ApiError` from `@/lib/admin/api` only.** `lib/api/errors.ts` has a different `ApiError` for the public site, and `instanceof` does not work across the two.

```ts
const page = await api.get<Paginated<EventAdminRow>>('/admin/events', { search, page: 2 });
await api.patch<EventAdmin>(`/admin/events/${id}`, patch);
```

### React Query conventions

- Keys come from `adminKeys`: `adminKeys.events.list(params)`, `.detail(id)`, `.part(id, 'registrations', params)` and `.lookup(q)`. Every key starts with `'admin'`, so logout can drop them all at once.
- Invalidating `detail(id)` also refreshes every `part(id, ...)` under it, because matching is by prefix.
- Mutations go through `useAdminMutation({ mutationFn, invalidate: [keys], successMessage, celebrate, errorToast })`. It invalidates the keys, shows toasts through `AdminToaster`, and types the error as `ApiError`.
- The admin defaults never retry 4xx responses.

```ts
const save = useAdminMutation({
  mutationFn: (patch: EventUpdateInput) => api.patch<EventAdmin>(`/admin/events/${id}`, patch),
  invalidate: [adminKeys.events.detail(id), adminKeys.events.lists()],
  successMessage: 'Saved.',
  errorToast: (err) => (err.hasFieldErrors ? false : errorMessage(err)), // field errors show inline
  onError: (err) => applyApiErrorToForm(form, err),
});
```

### Permissions

```tsx
const ability = useAbility();               // createAbility(me.principal, me.policy) from @zemi/shared
ability.can('event', id, 'stream.control'); ability.has('events.create'); ability.canAny('event', 'registrations.view');

<Can cap="events.create"><Button>New event</Button></Can>
<Can type="event" id={id} action="stream.control" fallback={<p>Ask for stream access.</p>}>...</Can>
<Can type="speaker" action="edit">{(ok) => <Input readOnly={!ok} />}</Can>   // no id means "at least one"; id="*" means canAll
<Can superadmin>...</Can>   <Can when={(a) => a.isSuperadmin || a.has('audit.view')}>...</Can>
```

`useMe()` stays fresh on its own: it refetches `/auth/me` every 5 minutes and on window focus, so policy edits and revocations show up without a reload. List items also carry `permissions: Action[]` from the API. Prefer those for per-row buttons: `row.permissions.includes('edit')`.

Server components get the same data from `getMeServer()` and `adminServerFetch()`. The dashboard layout already handles 401 (redirect) and "API down" (error screen), so pages under `(dashboard)` can assume a valid session.

### Uploads and the crop contract

```ts
const asset = await uploadAsset(file, { purpose: 'event-cover', crop, adjust, alt }, (p) => setProgress(p));
// p.phase: 'uploading' (fraction 0..1) -> 'processing' (fraction null, p.asset set) -> 'ready' | 'failed' (throws ApiError 'asset_failed')
```

- The upload is multipart `POST /api/v1/admin/assets`. Text fields go first: `purpose`, `crop` (JSON), `adjust` (JSON), `alt`, `caption`, `credit`. The `file` goes last.
- The client uploads the **original** file and the server renders every variant.
- The client then polls `GET /admin/assets/:id` with backoff (1.2 s rising to 4 s, 10 min timeout). Pass `wait: false` to get the processing asset back straight away. `FileUpload` does this so the form can save while a video transcodes.

**Crop contract.** `apps/api/src/modules/assets/image-pipeline.ts` implements exactly this, and it was checked end to end against the real API: an EXIF-orientation-6 photo, rotated 90°, zoomed and dragged off-center, came out pixel-for-pixel as the crop window showed (to within 1px of rounding). Keep both sides in step:

1. Auto-orient the original from EXIF. Browsers show images already oriented, so the editor sees the same pixels.
2. If `crop.rotation != 0`, rotate by `crop.rotation` degrees (clockwise) around the center and expand the canvas to the rotated bounding box, like sharp's `.rotate(deg, { background })`. This is react-easy-crop's coordinate space.
3. Extract `{ x, y, width, height }` from that (rotated) image. With rotation 0 these are plain original pixels.
4. Apply `adjust`: brightness, contrast and saturation are multipliers (1 = unchanged), hue is in degrees, then `grayscale` and `sharpen` (light).
5. Resize to the widths in `IMAGE_WIDTHS` (never upscale) and encode AVIF and WebP.

The editor previews the adjustments with CSS filters: `brightness() contrast() saturate() hue-rotate() grayscale()`, plus an SVG convolve for sharpen. Keep the server roughly in line with that.

## Login (`/admin/login`)

The form posts `POST /auth/login { passphrase }` with `redirectOn401: false`. On success it waits for one cheer, then does a full navigation to the sanitized `?next` (or `/admin`). `?reason=expired|signed-out` shows a banner.

**Error contract.** The form branches on the `code`, and falls back to the HTTP status when the code is unknown:

| status | `error.code` | copy |
|---|---|---|
| 401 | `invalid_passphrase` | "That passphrase didn't open the door. Check for typos and try again." |
| 403 | `admin_expired` (optional `details.expiresAt` ISO) | "Your access ended on Fri, 19 Sept 2026. Ask the superadmin to extend it." |
| 403 | `admin_disabled` | "This passphrase was switched off. Ask the superadmin if that's a surprise." |
| 429 | `rate_limited` + `Retry-After` header or `details.retryAfterSec` | live countdown; the button stays disabled until it runs out |

`POST /auth/login` returns the `Me` payload (the API does this), so the greeting says "Hey, Rani." If it ever returns nothing, the greeting falls back to "Come on in." A bare 5xx with no JSON body (the rewrite answering for an API that is down) or a 502 to 504 shows "We can't reach the server right now." instead of the generic server error.

## Shell

The dashboard layout wraps every page, in this order: `AdminProviders`, then `AdminShell` (sidebar, topbar, `ConfirmProvider`, palette, shortcuts), then `AdminToaster`.

- **Sidebar.** The sections come from `ADMIN_NAV` in `lib/admin/nav.ts`, and each one has a `visible(ability)` rule, so any change to the nav goes there.
  - It collapses to a rail with `[` or the footer button, and the choice is remembered.
  - On phones it becomes a drawer.
  - The inbox badge reads `GET /admin/inbox?status=new&pageSize=1` and uses `.total`. A 403 or 404 is ignored silently.
- **Breadcrumbs.** Without anything set, the topbar derives crumbs from the nav. Pages set their own like this:
  ```ts
  useBreadcrumbs([{ label: 'Events', href: adminRoutes.events }, { label: event.title }]);
  // or <SetBreadcrumbs items={[...]} /> from a server component
  ```
- **Command palette (Cmd/Ctrl+K).** It covers nav, actions, and search once the query has 2 or more characters:
  - `GET /admin/events?search=q&pageSize=5`, expecting `Paginated<EventAdminRow>`
  - `GET /admin/speakers/lookup?q=`, expecting `SpeakerRef[]`
  - `GET /admin/publications/lookup?q=`, expecting `{ id, title, type?, publishedYear? }[]`

  Each lookup accepts either an array or `{ items }`. A 403, 404 or 400 counts as "no results".
- **Shortcuts.**
  - `mod+k` opens the palette.
  - `[` toggles the sidebar.
  - `?` lists every shortcut.
  - `g o/e/s/p/v/m/i` jump to a section.
  - `mod+s` saves (inside `FormSaveBar`).
  - `/` focuses a `SearchInput` that has `slashToFocus`.
- **Principal menu.** It shows the name and role, the admin's access expiry as a countdown (red when under 3 days), the session expiry, links, and logout.
  - "Session ends" is `me.session.expiresAt`, the 7 day cap. The API also ends a session after 12 hours idle, and the menu says so.
  - Logout calls `POST /auth/logout`. On success (or a 401) it clears the admin queries and goes to `/admin/login?reason=signed-out`. If the request fails (network, 5xx), the cookie is still valid, so it stays on the page and shows an error toast rather than claiming you're logged out.
- `useAdminShell()` gives pages `openPalette()`, `openShortcuts()` and `toggleSidebar()`.
- `useConfirm()` gives a promise-based confirm dialog.

## UI kit (`@/components/admin/ui`)

Every control picks up `id`, `aria-describedby`, `aria-invalid`, required and read-only from an enclosing `<Field>`.

- **Button**:
  - `variant`: `primary | secondary | ghost | danger | danger-soft | blue | link`
  - `size`: `xs | sm | md | lg`
  - Other props: `loading`, `icon`, `iconRight`, `asChild` (wrap a Link), `fullWidth`
  - **IconButton**: required `label`, which becomes both aria-label and tooltip
- **Field**: `label`, `hint`, `error`, `required`, `optional`, `count={{ value, max }}`, `action`, `layout="inline"`, `hideLabel`, `readOnly`. **Fieldset**: `legend`, `description`.
- **Input**: `size`, `leading`, `trailing`, `mono`, `wrapperClassName`.
  - **Textarea**: `autosize`, `minRows`, `maxRows`.
  - **NumberInput**: `value: number | null`, `onChange`, `min`, `max`, `step`, `unit`, `steppers`.
- **Select** (Radix):
  - `value`, `onValueChange(v | null)`
  - `options`: items `{ value, label, description, icon, disabled }`, or groups `{ label, options }`
  - `clearable="No room yet"`, `placeholder`
- **Combobox**:
  - `value`, `onValueChange(value, option)`
  - `options`, or async `loadOptions(q, signal)`
  - `selectedOption` (label source for async values), `onCreate(q)`, `createLabel`, `clearable`, `renderOption`
  - **MultiCombobox**: `values`, `onValuesChange(values, options)`, `selectedOptions`, `max`
- **Checkbox**, **Switch**, **RadioGroup** (`variant="list" | "cards"`), **SegmentedControl** (`options[].count`), **Slider** (`centered`, `defaultValue`, double-click resets).
- **Form** (react-hook-form):
  - `useZodForm(schema, { defaultValues })`
  - `<FormField control name label maxLength>{(field, state) => <Input {...field} />}</FormField>`
  - `<FormError errors={form.formState.errors} />`
  - `<FormSaveBar form saving onSave />`: a floating "Unsaved changes" bar; Cmd/Ctrl+S saves
  - After a failed save: `applyApiErrorToForm(form, err)`. Unknown paths land on `root.server`.
- **Card** (`padding`, `muted`, `interactive`, `as`), **CardHeader**, **Section** (`aside` gives the two-column settings layout), **Divider** (`label`).
- **PageHeader**:
  - `title`, `description`, `actions`, `back={{ href, label }}`, `eyebrow`, `meta`, `children` (put a `TabNav` here)
  - The title row sticks under the topbar; `sticky` is on by default.
- **StatusChip** `kind`:
  - `event`: scheduled, ongoing, past, cancelled
  - `visibility`: draft, published, unlisted
  - `stream`: idle, preview, live (pulsing), ended
  - `asset`: processing, ready, failed
  - `registration`: registered, checked-in, cancelled
- **Badge** (`tone`, `shape`, `icon`, `size`), **CountBadge**, **ShapeGlyph**.
- **Tabs** (in page): `items[]` with `value`, `label`, `count`, `hidden`, `content`.
  - **TabNav** (route based): `items[]` with `href`, `label`, `count`, `hidden`, `exact`, `live`. Arrow keys move between tabs, and the most specific match wins.
- **Dialog**:
  - Props: `title`, `description`, `footer`, `size` (`sm..full`), `accent`, `dismissible={false}` for long forms
  - Becomes a bottom sheet on phones.
  - **Sheet**: side panel with `side` and `width`.
  - **ConfirmDialog**: `destructive`, `typeToConfirm`, and `onConfirm` returning a promise shows a loading state. **useConfirm()** is the promise version.
- **DropdownMenu** + `DropdownMenuContent/Item` (`icon`, `shortcut`, `destructive`, `href`, `external`), plus `CheckboxItem`, `RadioItem`, `Label`, `Separator`, `Sub*`. **Popover**, **Tooltip** (`shortcut`).
- **Skeleton**, **SkeletonText**, **Spinner** (the mark's loading loop), **LoadingBlock**.
- **EmptyState** (`title`, `description`, `action`, `cast` of characters), **ErrorState** (gives 403 and 404 their own copy; `onRetry`), **Callout** (`tone`, `title`, `action`).
- **DataTable** (TanStack v8):
  - Server mode: pass `total` + `pagination` + `onPaginationChange` (1-based `page`), and `sorting` + `onSortingChange`.
  - Otherwise it paginates and sorts on the client (`clientPageSize`).
  - Selection: `selectable` plus `bulkActions={({ rows, ids, clear }) => ...}`, which shows a floating bulk bar.
  - Rows: `onRowClick` (Enter and Space work), `activeRowId`.
  - View: `storageKey` remembers column visibility and density; `toolbar`; `empty`; `loading`/`fetching`.
  - The header sticks inside `maxHeight`. Pass `null` to let the table grow with the page.
  - Column `meta`: `align`, `width`, `label`, `hideable`, `stopRowClick`, `className`.
- **Pagination**, **SearchInput** (debounced; Escape clears; `slashToFocus`), **FilterBar** (`search`, `filters`, `chips[]`, `onClearAll`, `actions`).
- **StatCard** (`value`, `delta` as a fraction, `deltaInverse`, `chart={<Sparkline data />}`, `accent`), **KeyValue** (`items`, `columns`), **CopyField** (`secret` masks the value with a reveal toggle; copying bursts four shapes), **useCopy()**.
- **Avatar** (`image` or initials on a brand color; `variant="shape"`), **AvatarStack**, **AdminImage** (`<picture>` with AVIF and WebP srcsets on an LQIP background), **Kbd** (`keys={['mod','k']}`).
- **Progress** (`null` = indeterminate), **ProgressRing**, **Stepper**, **Timeline**.
- **DateText**:
  - `format`: any Jakarta format from shared, plus `relative` and `time-range` (with `end`)
  - Adds " WIB" to formats that show a time.
  - The `relative` format renders the absolute date on the server to avoid hydration mismatches.
- **notify**: `.success(msg, { celebrate })` shows a tiny cheering character; also `.error(err | string)`, `.info`, `.warning`, `.promise`, `.dismiss`.

## Fields (`@/components/admin/fields`)

- **ImageUploadCrop**:
  - Props: `purpose`, `value` (asset id), `onChange(assetId | null, asset)`, `initialImage` (the current ImageRef when editing), `alt`, `maxSize`, `round`, `hint`
  - Drop, paste or browse. The crop is locked to `PURPOSE_ASPECT[purpose]`.
  - The editor zooms, rotates in 90° steps with a fine straighten slider, and adjusts with a live preview. Hold to compare against the original.
  - A progress ring shows during upload, followed by the processing state and the server image. The field shows a canvas preview straight away.
  - Re-crop goes through `POST /admin/assets/:id/recrop`.
  - react-easy-crop loads only when the dialog opens.
- **FileUpload**:
  - Props: `purpose`, `accept` (`FILE_ACCEPT.pdf | video | any`), `value`, `onChange`, `initialFile`, `initialVideo`, `maxSize`
  - Shows progress; the upload can be cancelled. A video shows its poster and duration once processed.
- **SlugField**:
  - Props: `value`, `onChange`, `source` (the watched title), `basePath` ('/events/'), `savedSlug`
  - Follows the title until someone types in it; "Match the title" brings the link back.
  - Shows the public URL, and explains that the old slug keeps redirecting.
  - On edit forms for content that is already public, pass `auto={false}`. Otherwise the slug starts in auto mode whenever it equals `slugify(title)`, and renaming the title quietly changes the public URL. The old link still redirects, but people rarely mean to do that.
- **JakartaDateTimeFields**:
  - Props: `value={{ startsAt, endsAt }}`, `onChange` (receives ISO strings), `errors`, `takenDates`
  - Times are always WIB. Chips pick "Next Friday" and "Friday after".
  - Warns when the date is not a Friday.
- **BlockEditor**:
  - Props: `value` (Blocks JSON, read on mount; remount with `key` to reset), `onChange`, `readOnly`, `placeholder`, `uploadPurpose`
  - BlockNote 0.55 with Mantine, client-only, themed with the brand.
  - Images pasted into the editor upload through `uploadAsset`.
- **SpeakerPicker**:
  - Props: `value: SpeakerRef | null`, `onChange`, `exclude`, `onCreate(name)` (offered only with `speakers.create`; return the new SpeakerRef to select it)
  - Search: `GET /admin/speakers/lookup?q=`.
  - Also exports `speakerOption()`.
- **PublicationPicker**:
  - Props: `value: PublicationRef | null`, `onChange`, `exclude`, `allowQuickCreate`
  - Search: `GET /admin/publications/lookup?q=`.
  - Quick-create: a dialog that calls `POST /admin/publications/quick { title, url }`.
- **VenueSelect**:
  - Props: `value` (venue id), `onChange(id, venue)`
  - Reads `GET /admin/venues`, cached through `useVenues()`.
  - With `venues.manage`, people can add a room inline via `POST /admin/venues`.
- **LinksEditor**: `value: LinkItem[]`, `onChange`, `errors`. Rows are sortable, the kind is detected from the URL, and emails become `mailto:`.
- **TagsInput**:
  - Props: `value: string[]`, `onChange`, `suggestions`, `max`, `normalize` (lowercases by default)
  - Enter or a comma adds a tag; pasting "a, b" adds two.
- **SortableList** + **DragHandle**:
  - Props: `items`, `getId`, `onReorder`, `renderItem(item, { handle, index, isDragging, readOnly })`, `itemLabel`
  - Works with pointer, touch and keyboard (Space to lift, arrows to move, Space to drop), and announces moves to screen readers.
- **AccentPicker**: the four brand swatches, each drawn as its shape.
- **ReadOnlyScope** (`readOnly`) makes every field inside read-only. `useReadOnly(prop)` resolves the prop, then the enclosing Field, then the scope.

## Icons (`@/components/icons`)

- `LinkIcon kind={link.kind}` covers every `LINK_KINDS` value, and each icon is also exported alone (`GithubIcon`, ...).
- They use a 24px grid, 1.75 stroke and `currentColor`. Pass `title` or `labelled` for an accessible name.
- The helpers `LINK_KIND_LABELS`, `detectLinkKind(url)`, `normalizeLinkUrl(kind, url)` and `linkDisplay(url)` live alongside.
- They have no hooks, so server components can use them.

## Gotchas

- **Server and client.** The kit and fields are client components. Server pages can still render them; pass plain data as props.
- **Form defaults.** Give every field a default value in `useZodForm`, since inputs need `''`, not `undefined`.
- **Select.** Radix Select cannot hold an empty value. `null` shows the placeholder, and `clearable` adds a "None" row.
- **SortableList ids.** They must be stable. LinksEditor keeps its own keys, so you do not need ids on links.
- **Dates.** Always show them with `DateText` or `formatJakarta`, never with `toLocaleString`.
- **Copy.** No em dashes or en dashes in user-facing text. Use commas, colons or "to".
- **Heavy libraries.** Keep BlockNote and react-easy-crop out of shared barrels you write. The fields already load them lazily.
- **Admin CSS.** An admin page outside `(dashboard)` must import `@/components/admin/admin.css` and wrap its content in `.zemi-admin`.
- **Unknown /admin URLs.** `app/admin/not-found.tsx` only renders for `notFound()`. Unmatched `/admin/foo` URLs go to the root not-found (see Requests).
- **AGENTS.md.** `next dev` writes `apps/web/AGENTS.md` and `CLAUDE.md` (Next 16 agent rules) the first time it runs.
- **Rate limit and `X-Forwarded-For` (API and web config owners).** The login lockout (8 tries per 10 minutes) works through the rewrite: the `Retry-After` header arrives, and the form counts down with the button disabled. But a client that sends its own `X-Forwarded-For` header gets a fresh bucket. With `TRUST_PROXY=true`, Express takes the leftmost, client-supplied address, and the Next rewrite passes that header through. For the api-core and web config owners: set `TRUST_PROXY` to the real hop count, or key the limiter on the rightmost trusted address. The fix has to hold for both paths: browser to rewrite to API, and server-side fetches, because `getMeServer`/`adminServerFetch` forward the incoming `X-Forwarded-For` as is. Also check that in prod the limiter keys on the real client and not on the web service's private IP. If it keys on the private IP, one person's typos lock out every admin.

## What was verified against the real API

The compiled API ran on a side port (`API_INTERNAL_URL=http://localhost:4302`) against the shared Postgres and MinIO.

- **Login:**
  - With no cookie, `/admin/events?tab=x` goes to `/admin/login?next=...`.
  - A wrong passphrase gets the 401 copy.
  - The real superadmin passphrase logs in and greets "Hey, Superadmin.", then returns to `next`.
  - `zemi_session` is set through the rewrite (httpOnly, Lax, path `/`).
- **Logout:** it sends the CSRF header and clears the cookie. Afterwards `/admin` redirects to login again.
- **Rate limit:** a 429 arrives with `Retry-After`, the countdown runs and the button is disabled.
- **Uploads:**
  - `POST /admin/assets` works, then processing, then ready, with the variant served from `/media`.
  - Re-cropping loads the private `/admin/assets/:id/original` and restores the saved crop, rotation and zoom. `POST /recrop` then produces the new variant.
- **Endpoints not built yet:** the inbox badge, the palette lookups and VenueSelect answered 404 and stayed quiet: no toasts, no retry loops.
- **Screenshots:** login, shell, drawer and kit at 390x844, 820x1180 and 1440x900. None of them scroll sideways, and none have page errors.

**Not verified yet:**
- `/admin/speakers/lookup` and `/admin/publications/lookup`, `POST /admin/publications/quick` and `/admin/venues`. Their controllers don't exist yet.
- BlockNote image upload.
- Video processing in `FileUpload`.
