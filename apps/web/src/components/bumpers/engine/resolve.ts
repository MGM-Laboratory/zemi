import {
  formatJakarta,
  jakartaDateInput,
  jakartaTimeInput,
  fromJakartaInput,
  type BumperData,
  type BumperEventData,
  type BumperItem,
  type BumperSlide,
  type BumperSpeakerData,
  type BumperTeamData,
  type BumperTheme,
  type ImageRef,
} from '@zemi/shared';
import { shapeForName, slideAccent, slideBackground, slideColors } from './palette';
import type { BumperPerson, FieldDef, FieldValue, ResolveCtx, ResolvedRundownItem, SlideMode, TemplateDefinition } from './types';

export function firstName(name: string): string {
  const clean = name.replace(/^(dr|prof|mr|mrs|ms|ir)\.?\s+/i, '').trim();
  return clean.split(/\s+/)[0] ?? clean;
}

export function speakerPerson(s: BumperSpeakerData, event: BumperEventData | null): BumperPerson {
  const onEvent = event?.speakers.find((e) => e.speakerId === s.id) ?? null;
  return {
    kind: 'speaker',
    id: s.id,
    name: s.fullName,
    first: s.nickname || firstName(s.fullName),
    nickname: s.nickname,
    headline: s.headline,
    avatar: s.avatar,
    organization: onEvent?.organization ?? s.organization,
    position: onEvent?.position ?? s.position,
    role: onEvent?.role ?? null,
    talkTitle: onEvent?.talkTitle ?? null,
    url: s.url,
    shape: shapeForName(s.fullName),
  };
}

export function teamPerson(t: BumperTeamData): BumperPerson {
  return {
    kind: 'team',
    id: t.id,
    name: t.name,
    first: firstName(t.name),
    nickname: null,
    headline: null,
    avatar: t.avatar,
    organization: null,
    position: t.role,
    role: t.role,
    talkTitle: null,
    url: null,
    shape: shapeForName(t.name),
  };
}

export function manualPerson(name: string, role: string | null = null): BumperPerson {
  return {
    kind: 'manual',
    id: null,
    name,
    first: firstName(name),
    nickname: null,
    headline: null,
    avatar: null,
    organization: null,
    position: role,
    role,
    talkTitle: null,
    url: null,
    shape: shapeForName(name || 'Zemi'),
  };
}

const EMPTY = (v: unknown) => v === undefined || v === null || v === '';

/** Jakarta instant for a rundown HH:mm on the event's day. */
export function rundownInstant(event: Pick<BumperEventData, 'startsAt'>, hhmm: string): number {
  return fromJakartaInput(jakartaDateInput(event.startsAt), hhmm).getTime();
}

export function resolveRundown(event: BumperEventData | null, data: BumperData): ResolvedRundownItem[] {
  if (!event) return [];
  return event.rundown.map((r, index) => {
    const sp = r.speakerId ? data.speakers[r.speakerId] : undefined;
    return { ...r, index, speaker: sp ? speakerPerson(sp, event) : null };
  });
}

/** Find a referenced rundown item again: same time and agenda, then same agenda, then same time, then the index. */
export function findRundownItem(rundown: ResolvedRundownItem[], ref: BumperSlide['refs']['rundown']): ResolvedRundownItem | null {
  if (!ref) return null;
  const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
  return (
    rundown.find((r) => r.time === ref.time && norm(r.agenda) === norm(ref.agenda)) ??
    (ref.agenda ? rundown.find((r) => norm(r.agenda) === norm(ref.agenda)) : undefined) ??
    (ref.time ? rundown.find((r) => r.time === ref.time) : undefined) ??
    rundown[ref.index] ??
    null
  );
}

/** Index of the rundown item happening at `now` (or -1). */
export function currentRundownIndex(event: BumperEventData | null, now: number): number {
  if (!event || !event.rundown.length) return -1;
  const day = jakartaDateInput(event.startsAt);
  if (day !== jakartaDateInput(new Date(now))) return -1;
  let found = -1;
  event.rundown.forEach((r, i) => {
    const start = fromJakartaInput(day, r.time).getTime();
    if (start <= now) found = i;
  });
  const last = event.rundown[found];
  if (found >= 0 && last?.endTime && fromJakartaInput(day, last.endTime).getTime() < now && found === event.rundown.length - 1) return -1;
  return found;
}

export function eventNumberLabel(event: Pick<BumperEventData, 'number'> | null): string {
  return event?.number != null ? `#${event.number}` : '';
}

export function eventRoom(event: BumperEventData | null): string {
  if (!event) return '';
  const parts = [event.venue?.name, event.roomNote].filter(Boolean) as string[];
  if (!parts.length && event.mode === 'online') return 'Online';
  return parts.join(', ');
}

export function eventWhen(event: BumperEventData | null): string {
  if (!event) return '';
  return `${formatJakarta(event.startsAt, 'date-long')}, ${jakartaTimeInput(event.startsAt)} to ${jakartaTimeInput(event.endsAt)} WIB`;
}

/** {token} replacements. Unknown tokens are left as they are. */
export function tokenValues(ctx: Omit<ResolveCtx, 'field' | 'text' | 'num' | 'flag' | 'fill'>): Record<string, string> {
  const e = ctx.event;
  const p = ctx.person;
  const n = ctx.nextEvent;
  const pub = ctx.publication;
  const now = ctx.now();
  return {
    'event.title': e?.title ?? '',
    'event.number': eventNumberLabel(e),
    'event.n': e?.number != null ? String(e.number) : '',
    'event.date': e ? formatJakarta(e.startsAt, 'date-long') : '',
    'event.day': e ? formatJakarta(e.startsAt, 'weekday') : '',
    'event.time': e ? `${jakartaTimeInput(e.startsAt)} to ${jakartaTimeInput(e.endsAt)}` : '',
    'event.start': e ? jakartaTimeInput(e.startsAt) : '',
    'event.end': e ? jakartaTimeInput(e.endsAt) : '',
    'event.room': eventRoom(e),
    'event.summary': e?.summary ?? '',
    'speaker.name': p?.name ?? '',
    'speaker.first': p?.first ?? '',
    'speaker.org': p?.organization ?? '',
    'speaker.position': p?.position ?? '',
    'speaker.role': p?.role ?? '',
    'speaker.talk': p?.talkTitle ?? '',
    'speaker.headline': p?.headline ?? '',
    'paper.title': pub?.title ?? '',
    'paper.venue': pub?.containerTitle ?? '',
    'paper.year': pub?.publishedYear != null ? String(pub.publishedYear) : '',
    'next.title': n?.title ?? '',
    'next.number': eventNumberLabel(n),
    'next.date': n ? formatJakarta(n.startsAt, 'date-long') : '',
    'site.name': ctx.site.name,
    'site.url': ctx.site.shortUrl,
    'site.q': ctx.site.qnaShort,
    'time.now': jakartaTimeInput(new Date(now)),
  };
}

export function fillTokens(s: string, values: Record<string, string>): string {
  if (!s.includes('{')) return s;
  return s.replace(/\{([a-z]+\.[a-z]+)\}/gi, (m, key: string) => (key in values ? values[key]! : m));
}

/** The token list the inspector offers. */
export const TOKEN_HELP: Array<{ token: string; label: string }> = [
  { token: '{event.title}', label: 'Event title' },
  { token: '{event.number}', label: 'Zemi number, like #97' },
  { token: '{event.date}', label: 'Event date' },
  { token: '{event.time}', label: 'Start to end time' },
  { token: '{event.room}', label: 'Room' },
  { token: '{speaker.name}', label: 'Speaker or person name' },
  { token: '{speaker.first}', label: 'First name or nickname' },
  { token: '{speaker.org}', label: 'Affiliation' },
  { token: '{speaker.talk}', label: 'Talk title' },
  { token: '{paper.title}', label: 'Paper title' },
  { token: '{next.title}', label: 'Next Friday title' },
  { token: '{next.date}', label: 'Next Friday date' },
  { token: '{site.q}', label: 'Q and A link' },
  { token: '{site.url}', label: 'Site address' },
  { token: '{time.now}', label: 'Time now' },
];

export interface BuildCtxInput {
  slide: BumperSlide;
  theme: BumperTheme;
  data: BumperData;
  mode: SlideMode;
  showEventId: string | null;
  template: TemplateDefinition | null;
  now: () => number;
  /** When the slide came on screen (server clock ms), live playback only. */
  liveSince?: number | null;
}

export function buildResolveCtx({ slide, theme, data, mode, showEventId, template, now, liveSince = null }: BuildCtxInput): ResolveCtx {
  const eventId = slide.refs.eventId ?? showEventId;
  const event = (eventId ? data.events[eventId] : undefined) ?? null;
  const refs = slide.refs;
  let person: BumperPerson | null = null;
  if (refs.speakerId && data.speakers[refs.speakerId]) person = speakerPerson(data.speakers[refs.speakerId]!, event);
  else if (refs.teamMemberId && data.team[refs.teamMemberId]) person = teamPerson(data.team[refs.teamMemberId]!);
  const people = (refs.speakerIds ?? []).map((id) => data.speakers[id]).filter(Boolean).map((s) => speakerPerson(s!, event));
  const lineup = (event?.speakers ?? [])
    .map((es) => data.speakers[es.speakerId])
    .filter(Boolean)
    .map((s) => speakerPerson(s!, event));
  const rundown = resolveRundown(event, data);
  const rundownItem = findRundownItem(rundown, refs.rundown);
  const images = (refs.assetIds ?? []).map((id) => data.images[id]).filter((x): x is ImageRef => !!x);
  const accent = slideAccent(slide, theme, event);
  const background = slideBackground(slide, theme, template?.background);
  const colors = slideColors(accent, background);
  const nextEvent = data.nextEventId ? (data.events[data.nextEventId] ?? null) : null;

  const base = {
    slide,
    theme,
    data,
    mode,
    event,
    person,
    people,
    lineup,
    publication: (refs.publicationId ? data.publications[refs.publicationId] : undefined) ?? null,
    rundownItem,
    rundown,
    threads: (refs.threadIds ?? []).map((id) => data.threads[id]).filter((t): t is NonNullable<typeof t> => !!t),
    team: (refs.teamMemberIds ?? []).map((id) => data.team[id]).filter((t): t is BumperTeamData => !!t),
    image: (refs.assetId ? data.images[refs.assetId] : undefined) ?? null,
    images,
    backgroundImage: (slide.style.backgroundAssetId ? data.images[slide.style.backgroundAssetId] : undefined) ?? null,
    site: data.site,
    nextEvent,
    accent,
    background,
    colors,
    items: [] as BumperItem[],
    now,
    liveSince: () => (mode === 'live' ? liveSince : null),
  };
  let values: Record<string, string> | null = null;
  const tokens = () => (values ??= tokenValues(base));
  const defs = new Map<string, FieldDef>((template?.fields ?? []).map((f) => [f.key, f]));
  const ctx: ResolveCtx = {
    ...base,
    field(key) {
      const raw = slide.fields[key];
      if (!EMPTY(raw)) return raw as FieldValue;
      const def = defs.get(key)?.default;
      if (typeof def === 'function') return def(ctx) ?? null;
      return def ?? null;
    },
    text(key) {
      const v = ctx.field(key);
      if (v === null || v === undefined || typeof v === 'boolean') return '';
      const s = String(v);
      return defs.get(key)?.tokens === false ? s : fillTokens(s, tokens());
    },
    num(key, fallback = 0) {
      const v = ctx.field(key);
      const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
      return Number.isFinite(n) ? n : fallback;
    },
    flag(key, fallback = false) {
      const v = ctx.field(key);
      return typeof v === 'boolean' ? v : fallback;
    },
    fill(s) {
      return fillTokens(s, tokens());
    },
  };
  ctx.items = slide.items.length ? slide.items : (template?.items?.fallback?.(ctx) ?? []);
  return ctx;
}

/** Is this field showing its default (not overridden)? */
export function isDefaultField(slide: BumperSlide, key: string): boolean {
  return EMPTY(slide.fields[key]);
}
