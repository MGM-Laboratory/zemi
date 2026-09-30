import {
  DEFAULT_SESSION,
  formatJakarta,
  fromJakartaInput,
  jakartaDateInput,
  nextFridaySession,
  type EventAction,
  type EventAdmin,
  type EventMode,
  type EventStatus,
  type Visibility,
} from '@zemi/shared';

/**
 * Pure helpers for the admin events area (no React). Shared by the overview, the list,
 * the new-event form and the event workspace.
 */

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string | null | undefined): s is string =>
  typeof s === 'string' && UUID_RE.test(s);

export const MODE_LABEL: Record<EventMode, string> = {
  hybrid: 'Hybrid',
  offline: 'In person only',
  online: 'Online only',
};

export const MODE_HINT: Record<EventMode, string> = {
  hybrid: 'In the room and on the livestream.',
  offline: 'Only in the room. No livestream.',
  online: 'Only on the livestream. No room needed.',
};

export const VISIBILITY_COPY: Record<Visibility, { label: string; hint: string }> = {
  draft: { label: 'Draft', hint: 'Hidden from the site while you get it right. Nobody can register yet.' },
  published: {
    label: 'Published',
    hint: 'On the site, in the events list and open for registration.',
  },
  unlisted: {
    label: 'Unlisted',
    hint: 'Works for anyone with the link, but hidden from lists and search.',
  },
};

/** Jakarta ISO date (YYYY-MM-DD) of an instant. */
export const jakartaDay = (iso: string | Date) => jakartaDateInput(iso);

/** "Fri, 2 Oct" style label for a Jakarta ISO date. */
export function fridayLabel(date: string, format: 'date' | 'date-short' | 'date-long' = 'date') {
  return formatJakarta(fromJakartaInput(date, '12:00'), format);
}

/**
 * The next Fridays (Jakarta dates) that have no event yet, starting after `from`.
 * Used when the overview's `emptyFridays` is not available.
 */
export function nextFreeFridays(
  taken: readonly string[],
  count = 1,
  from: Date = new Date(),
  maxWeeks = 52,
): string[] {
  const out: string[] = [];
  const set = new Set(taken);
  for (let week = 0; week < maxWeeks && out.length < count; week++) {
    const d = jakartaDateInput(nextFridaySession(from, week).startsAt);
    if (!set.has(d)) out.push(d);
  }
  return out;
}

/** Default Friday session instants for a Jakarta date. */
export function sessionFor(
  date: string,
  start: string = DEFAULT_SESSION.start,
  end: string = DEFAULT_SESSION.end,
) {
  const startsAt = fromJakartaInput(date, start);
  let endsAt = fromJakartaInput(date, end);
  if (endsAt <= startsAt) endsAt = new Date(endsAt.getTime() + 86_400_000);
  return { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
}

/**
 * Payload for "Plan this Friday": a draft on that date at the default times. The API names it
 * "Zemi #<next number>" and picks the slug, so one click is enough.
 */
export function planFridayPayload(date: string) {
  const { startsAt, endsAt } = sessionFor(date);
  return { startsAt, endsAt, visibility: 'draft' as const, mode: 'hybrid' as const };
}

/** Trim a text field and turn empty into null (nullable columns). */
export function nullIfEmpty(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t ? t : null;
}

/** Quacks like an EventAdmin (mutation responses can be the event, or something else). */
export function isEventAdmin(v: unknown): v is EventAdmin {
  return Boolean(
    v &&
    typeof v === 'object' &&
    'id' in v &&
    'permissions' in v &&
    'startsAt' in v &&
    'speakersFull' in v,
  );
}

/* ------------------------------------------------------------------ workspace tabs */

export type WorkspaceTabKey =
  | 'overview'
  | 'details'
  | 'speakers'
  | 'rundown'
  | 'publications'
  | 'registrations'
  | 'attendance'
  | 'stream'
  | 'bumpers'
  | 'media'
  | 'emails'
  | 'settings';

export interface WorkspaceTab {
  key: WorkspaceTabKey;
  label: string;
  /** Sub-route ('' for the overview). */
  path: string;
  visible: (perms: ReadonlySet<EventAction>) => boolean;
}

const has = (perms: ReadonlySet<EventAction>, ...actions: EventAction[]) =>
  actions.some((a) => perms.has(a));

/** Every tab of the event workspace, in order, with the action it needs. */
export const WORKSPACE_TABS: WorkspaceTab[] = [
  { key: 'overview', label: 'Overview', path: '', visible: (p) => has(p, 'view') },
  { key: 'details', label: 'Details', path: 'details', visible: (p) => has(p, 'view') },
  { key: 'speakers', label: 'Speakers', path: 'speakers', visible: (p) => has(p, 'view') },
  { key: 'rundown', label: 'Rundown', path: 'rundown', visible: (p) => has(p, 'view') },
  {
    key: 'publications',
    label: 'Publications',
    path: 'publications',
    visible: (p) => has(p, 'view'),
  },
  {
    key: 'registrations',
    label: 'Registrations',
    path: 'registrations',
    visible: (p) => has(p, 'registrations.view'),
  },
  {
    key: 'attendance',
    label: 'Attendance',
    path: 'attendance',
    visible: (p) => has(p, 'attendance.scan'),
  },
  { key: 'stream', label: 'Stream', path: 'stream', visible: (p) => has(p, 'stream.view') },
  { key: 'bumpers', label: 'Bumpers', path: 'bumpers', visible: (p) => has(p, 'bumpers.run') },
  // Documentation is managed here; people who can only look see it on the public event page.
  { key: 'media', label: 'Media', path: 'media', visible: (p) => has(p, 'media.manage') },
  { key: 'emails', label: 'Emails', path: 'emails', visible: (p) => has(p, 'emails.send') },
  { key: 'settings', label: 'Settings', path: 'settings', visible: (p) => has(p, 'view') },
];

/* ------------------------------------------------------------------ readiness */

export interface ReadinessItem {
  key: string;
  label: string;
  /** true done, false missing, null unknown (the API did not say). */
  done: boolean | null;
  hint: string;
  /** Workspace tab that fixes it. */
  tab: WorkspaceTabKey;
  /** Soft items do not block "ready". */
  optional?: boolean;
}

/** What still needs doing before a Friday is good to go. */
export function readinessChecklist(e: EventAdmin): ReadinessItem[] {
  const descriptionText = JSON.stringify(e.description ?? []);
  const hasDescription =
    Array.isArray(e.description) &&
    e.description.length > 0 &&
    /"text"\s*:\s*"[^"]+/.test(descriptionText);
  const needsRoom = e.mode !== 'online';
  const needsStream = e.mode !== 'offline';
  const items: ReadinessItem[] = [
    {
      key: 'cover',
      label: 'Cover image',
      done: Boolean(e.cover),
      hint: 'A 4:5 cover makes the card pop on the site.',
      tab: 'details',
    },
    {
      key: 'summary',
      label: 'Summary and description',
      done: Boolean(e.summary?.trim()) && hasDescription,
      hint: 'One line for cards, a few paragraphs for the event page.',
      tab: 'details',
    },
    {
      key: 'speakers',
      label: 'Speakers',
      done: e.speakersFull.length > 0,
      hint: 'Who is sharing this Friday?',
      tab: 'speakers',
    },
    {
      key: 'rundown',
      label: 'Rundown',
      done: e.rundown.length > 0,
      hint: 'Doors, talks, questions, coffee.',
      tab: 'rundown',
    },
  ];
  if (needsRoom) {
    items.push({
      key: 'venue',
      label: 'Room',
      done: Boolean(e.venueId || e.venueFull),
      hint: 'So people know which door to walk through.',
      tab: 'details',
    });
  }
  items.push({
    key: 'published',
    label: 'Published',
    done: e.visibility !== 'draft',
    hint: 'Drafts are invisible. Publish when it looks right.',
    tab: 'settings',
  });
  if (needsStream) {
    items.push({
      key: 'stream',
      label: 'Stream keys generated',
      done:
        typeof e.streamConfigured === 'boolean'
          ? e.streamConfigured
          : e.stream.state !== 'idle'
            ? true
            : null,
      hint: 'Open the Stream tab once to get the OBS keys.',
      tab: 'stream',
    });
  }
  return items;
}

/* ------------------------------------------------------------------ misc */

export function statusTone(status: EventStatus): 'blue' | 'red' | 'neutral' {
  return status === 'scheduled' ? 'blue' : status === 'ongoing' ? 'red' : 'neutral';
}

/** Registration fill fraction (null when no cap). */
export function fillFraction(
  registrations: number,
  capacity: number | null | undefined,
): number | null {
  if (!capacity || capacity <= 0) return null;
  return Math.min(1, registrations / capacity);
}

/** Check-in rate as a fraction (null when nobody registered). */
export function checkInRate(checkedIn: number, registrations: number): number | null {
  if (!registrations) return null;
  return checkedIn / registrations;
}

/** Minutes since midnight for `HH:mm`. */
export function hhmmToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function minutesToHhmm(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Given ids before and after a single drag (arrayMove), return `{ from, to }`, or null when
 * nothing moved. Lets field arrays use `move()` and keep their row keys.
 */
export function detectMove(
  before: readonly string[],
  after: readonly string[],
): { from: number; to: number } | null {
  if (before.length !== after.length) return null;
  let i = 0;
  while (i < before.length && before[i] === after[i]) i++;
  if (i === before.length) return null;
  let j = before.length - 1;
  while (j > i && before[j] === after[j]) j--;
  if (after[i] === before[j]) return { from: j, to: i };
  if (before[i] === after[j]) return { from: i, to: j };
  return null;
}
