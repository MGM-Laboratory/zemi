import type { Accent, EventMode, SpeakerRole } from '@zemi/shared';
import { CANCELLED_THEME, EVENT_THEMES, FIRST_FRIDAY, HOLIDAY_FRIDAYS, type EventTheme } from './data/events.js';
import type { Area, SpeakerSeed } from './data/speakers.js';
import type { Rng } from './lib/rng.js';
import type { ManifestItem } from './media.js';
import { addDays, jakartaDate, wib } from './util.js';

export interface PlannedTalk {
  title: string;
  area: Area;
  speakerKey: string;
  organization: string;
  position: string;
  role: SpeakerRole;
}

export interface PlannedEvent {
  index: number;
  number: number;
  date: string;
  startsAt: Date;
  endsAt: Date;
  theme: EventTheme;
  title: string;
  visibility: 'published' | 'draft' | 'unlisted';
  cancelled: boolean;
  /** Ended before `now`. */
  past: boolean;
  /** Happening right now (seeding on a Friday afternoon). */
  ongoing: boolean;
  /** 0 = the next Friday, null for past events. */
  upcomingIndex: number | null;
  venueKey: string;
  mode: EventMode;
  coverId: string;
  accent: Accent;
  talks: PlannedTalk[];
}

/** How many Fridays after today get an event (the task: 8). */
export const UPCOMING_FRIDAYS = 8;

/** Upcoming slots with a special visibility (0 = next Friday). */
const UNLISTED_SLOT = 4;
const DRAFT_SLOTS = new Set([6, 7]);

const ROOMS: Array<[string, number]> = [
  ['c312', 30],
  ['c314', 20],
  ['c401', 20],
  ['thA', 15],
  ['c407', 8],
  ['sr2', 7],
];

function themeFor(i: number): EventTheme {
  if (i < EVENT_THEMES.length) return EVENT_THEMES[i]!;
  // Seeding long after the canonical date: recycle the middle of the list.
  const pool = EVENT_THEMES.slice(20, 90);
  const base = pool[(i - EVENT_THEMES.length) % pool.length]!;
  return { ...base, title: `Encore: ${base.title}`.slice(0, 200) };
}

/**
 * Every Friday from the first Friday of September 2024 until `UPCOMING_FRIDAYS` Fridays after today,
 * minus holidays, with themes, rooms, covers and a speaker for every talk. Pure: no database.
 */
export function planEvents(rng: Rng, now: Date, covers: ManifestItem[], speakers: SpeakerSeed[]): PlannedEvent[] {
  const today = jakartaDate(now);
  const byKey = new Map(speakers.map((s) => [s.key, s]));
  const talkCount = new Map<string, number>();
  const lastEvent = new Map<string, number>();
  const out: PlannedEvent[] = [];

  let date = FIRST_FRIDAY;
  let fridaysAfterToday = 0;
  let upcoming = 0;
  for (;;) {
    if (date > today) fridaysAfterToday++;
    if (fridaysAfterToday > UPCOMING_FRIDAYS) break;
    if (!HOLIDAY_FRIDAYS[date]) {
      const index = out.length;
      const theme = themeFor(index);
      const startsAt = wib(date, '13:15');
      const endsAt = wib(date, '15:15');
      const past = endsAt.getTime() <= now.getTime();
      const ongoing = !past && startsAt.getTime() <= now.getTime();
      const upcomingIndex = past || ongoing ? null : upcoming++;
      const visibility = upcomingIndex === UNLISTED_SLOT ? 'unlisted' : upcomingIndex !== null && DRAFT_SLOTS.has(upcomingIndex) ? 'draft' : 'published';

      let venueKey: string;
      if (theme.online) venueKey = 'online';
      else if (theme.big) venueKey = 'thB';
      else if (upcomingIndex === 0) venueKey = 'thA';
      else if (theme.small) venueKey = rng.pick(['lab', 'c407', 'sr2']);
      else {
        const weights = ROOMS.map(([key, w]) => (key === 'thA' && index > 60 ? w * 2 : w));
        venueKey = rng.weighted(ROOMS.map(([k]) => k), weights);
      }
      const mode: EventMode = venueKey === 'online' ? 'online' : theme.small ? 'offline' : 'hybrid';
      const cover = covers[(index * 11) % covers.length]!;

      const talks: PlannedTalk[] = [];
      const inEvent = new Set<string>();
      theme.talks.forEach(([title, area, pinned], ti) => {
        let key = pinned && byKey.has(pinned) ? pinned : null;
        if (!key) {
          const candidates = speakers.filter((s) => s.areas.includes(area) && !inEvent.has(s.key) && (s.visibility ?? 'published') === 'published');
          const pool = candidates.length ? candidates : speakers.filter((s) => !inEvent.has(s.key));
          let best: SpeakerSeed | null = null;
          let bestScore = Infinity;
          for (const s of pool) {
            const recent = index - (lastEvent.get(s.key) ?? -99) < 3 ? 2 : 0;
            const score = (talkCount.get(s.key) ?? 0) / s.weight + (s.areas[0] === area ? 0 : 0.8) + recent + rng.next() * 0.6;
            if (score < bestScore) {
              bestScore = score;
              best = s;
            }
          }
          key = best!.key;
        }
        const s = byKey.get(key)!;
        inEvent.add(key);
        talkCount.set(key, (talkCount.get(key) ?? 0) + 1);
        lastEvent.set(key, index);
        const position = s.earlier && date < s.earlier.until ? s.earlier.position : s.position;
        talks.push({ title, area, speakerKey: key, organization: s.org, position, role: theme.big && ti === 0 ? 'keynote' : 'speaker' });
      });

      out.push({
        index,
        number: index + 1,
        date,
        startsAt,
        endsAt,
        theme,
        title: theme.title,
        visibility,
        cancelled: index === CANCELLED_THEME && past,
        past,
        ongoing,
        upcomingIndex,
        venueKey,
        mode,
        coverId: cover.id,
        accent: (cover.accent ?? 'blue') as Accent,
        talks,
      });
    }
    date = addDays(date, 7);
  }
  return out;
}

/** Standard Friday rundown, adapted to one, two or three talks. */
export function rundownFor(e: PlannedEvent): Array<{ time: string; endTime: string | null; agenda: string; note: string | null; speakerKey: string | null }> {
  const intro = { time: '13:15', endTime: '13:25', agenda: 'Doors open and intro', note: 'Grab a seat and a coffee. We start on time, mostly.', speakerKey: null };
  const tail = (qa: string, coffee = '14:55') => [
    { time: qa, endTime: coffee, agenda: 'Q and A', note: 'Questions from the room and the livestream chat.', speakerKey: null },
    { time: coffee, endTime: '15:15', agenda: 'Coffee and networking', note: 'The good part. Stay and talk.', speakerKey: null },
    { time: '15:15', endTime: null, agenda: 'Wrap and see you next Friday', note: null, speakerKey: null },
  ];
  const t = e.talks;
  if (t.length <= 1) {
    return [
      intro,
      { time: '13:25', endTime: '14:25', agenda: t[0]?.title ?? 'Talk', note: null, speakerKey: t[0]?.speakerKey ?? null },
      ...tail('14:25'),
    ];
  }
  if (t.length === 2) {
    return [
      intro,
      { time: '13:25', endTime: '14:00', agenda: t[0]!.title, note: null, speakerKey: t[0]!.speakerKey },
      { time: '14:00', endTime: '14:35', agenda: t[1]!.title, note: null, speakerKey: t[1]!.speakerKey },
      ...tail('14:35'),
    ];
  }
  return [
    intro,
    { time: '13:25', endTime: '13:50', agenda: t[0]!.title, note: null, speakerKey: t[0]!.speakerKey },
    { time: '13:50', endTime: '14:15', agenda: t[1]!.title, note: null, speakerKey: t[1]!.speakerKey },
    { time: '14:15', endTime: '14:40', agenda: t[2]!.title, note: null, speakerKey: t[2]!.speakerKey },
    ...tail('14:40'),
  ];
}
