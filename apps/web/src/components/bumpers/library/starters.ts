import type { BumperEventData, BumperEventSpeaker, BumperKind, BumperSlide, BumperTheme, ShapeName } from '@zemi/shared';
import { newSlide } from '../builder/factory';
import { getTemplate } from '../templates';

/**
 * Starter kits for "New show": ready-made show structures built from the template defaults.
 * When the show is tied to a Friday, the kit fills in the people from its lineup (host, speakers,
 * keynote, panel); without one, the person cards wait for a pick in the builder.
 */

export type StarterKey = 'classic-friday' | 'keynote-special' | 'panel-day' | 'thesis-practice' | 'break-loop' | 'tech-trouble';

export interface StarterContext {
  /** The Friday the show belongs to (resolved), or null for a standalone show. */
  event: BumperEventData | null;
}

export interface StarterKit {
  key: StarterKey;
  label: string;
  /** One line for the menu. */
  blurb: string;
  /** A little more for the dialog. */
  description: string;
  /** The character on the menu row. */
  shape: ShapeName;
  theme?: Partial<BumperTheme>;
  build(ctx: StarterContext): BumperSlide[];
}

type Overrides = NonNullable<Parameters<typeof newSlide>[1]>['overrides'];

/** A slide of `kind`, with one of the template's presets when it has that key. */
function card(kind: BumperKind, overrides: Overrides = {}, presetKey?: string): BumperSlide {
  const preset = presetKey ? (getTemplate(kind).presets?.find((p) => p.key === presetKey) ?? null) : null;
  return newSlide(kind, { preset, overrides });
}

/** Auto-advance every slide (seconds per slide) and send the last one back to the first. */
function loop(slides: BumperSlide[], seconds: number[]): BumperSlide[] {
  const first = slides[0];
  return slides.map((s, i) => ({
    ...s,
    timing: { autoAdvanceSec: seconds[i] ?? seconds[seconds.length - 1] ?? 15, loopToId: i === slides.length - 1 && slides.length > 1 ? (first?.id ?? null) : null },
  }));
}

const byRole = (event: BumperEventData | null, ...roles: BumperEventSpeaker['role'][]) => (event?.speakers ?? []).filter((s) => roles.includes(s.role));

/** Talk speakers in lineup order (keynotes first), or `fallback` empty slots to fill in later. */
function talkers(event: BumperEventData | null, max: number, fallback: number): Array<BumperEventSpeaker | null> {
  const list = [...byRole(event, 'keynote'), ...byRole(event, 'speaker')].slice(0, max);
  return list.length ? list : Array.from({ length: fallback }, () => null);
}

const personRefs = (s: BumperEventSpeaker | null | undefined) => (s ? { refs: { speakerId: s.speakerId } } : {});

function preshow(): BumperSlide[] {
  return loop([card('standby'), card('agenda'), card('house-rules')], [20, 15, 15]);
}

function breakLoop(): BumperSlide[] {
  return loop([card('break', {}, 'coffee'), card('up-next')], [30, 12]);
}

function speakerBlock(s: BumperEventSpeaker | null): BumperSlide[] {
  const intro = s?.role === 'keynote' ? 'keynote' : 'speaker';
  return [card(intro, personRefs(s)), card('talk-title', personRefs(s)), card('thanks-speaker', personRefs(s))];
}

export const STARTER_KITS: StarterKit[] = [
  {
    key: 'classic-friday',
    label: 'Classic Friday',
    blurb: 'Doors, welcome, talks, Q and A, coffee and goodbye.',
    description: 'The whole afternoon: a pre-show loop, the welcome and agenda, your host, a block for each speaker, Q and A, a coffee loop, the group photo and next Friday.',
    shape: 'circle',
    build: ({ event }) => [
      ...preshow(),
      card('welcome'),
      card('agenda'),
      card('mc', personRefs(byRole(event, 'moderator')[0])),
      ...talkers(event, 4, 2).flatMap(speakerBlock),
      card('qna'),
      card('featured-question'),
      ...breakLoop(),
      card('photo'),
      card('next-event'),
      card('closing'),
    ],
  },
  {
    key: 'keynote-special',
    label: 'Keynote special',
    blurb: 'One big talk, a grand intro and a long Q and A.',
    description: 'Built around one guest: the poster, opening remarks, a grand keynote intro, a quote card you fill in during the talk, a long Q and A and a proper thank-you.',
    shape: 'triangle',
    build: ({ event }) => {
      const star = byRole(event, 'keynote')[0] ?? byRole(event, 'speaker')[0] ?? null;
      const host = byRole(event, 'moderator')[0];
      return [
        ...loop([card('standby'), card('event-title')], [20, 15]),
        card('welcome'),
        card('opening', personRefs(host)),
        card('keynote', personRefs(star)),
        card('talk-title', personRefs(star)),
        card('quote', { ...personRefs(star), hidden: true, notes: 'Type the line worth repeating while they talk, then unhide this card.' }),
        card('qna'),
        card('featured-question'),
        card('thanks-speaker', personRefs(star)),
        card('photo'),
        card('closing'),
      ];
    },
  },
  {
    key: 'panel-day',
    label: 'Panel day',
    blurb: 'Everyone on stage, a room prompt and questions.',
    description: 'For a conversation rather than talks: the lineup in one frame, the panel with everyone on it, a talk-to-your-neighbor prompt, Q and A and the goodbye.',
    shape: 'arch',
    build: ({ event }) => {
      const panel = [...byRole(event, 'panelist'), ...byRole(event, 'speaker'), ...byRole(event, 'keynote')].slice(0, 6).map((s) => s.speakerId);
      return [
        ...loop([card('standby'), card('lineup')], [20, 15]),
        card('welcome'),
        card('mc', personRefs(byRole(event, 'moderator')[0])),
        card('lineup'),
        card('panel', panel.length >= 2 ? { refs: { speakerIds: panel } } : {}),
        card('prompt', {}, 'stuck'),
        card('qna'),
        card('featured-question'),
        card('photo'),
        card('next-event'),
        card('closing'),
      ];
    },
  },
  {
    key: 'thesis-practice',
    label: 'Thesis practice',
    blurb: 'Practice runs with a talk timer and feedback.',
    description: 'Dry runs before a defense: each presenter gets an intro, a talk timer and a thank-you, then a quick one-word round and a feedback QR.',
    shape: 'square',
    build: ({ event }) => [
      card('welcome'),
      card('section', { fields: { title: 'Practice round', eyebrow: 'Dry runs' } }),
      ...talkers(event, 5, 3).flatMap((s) => [card('speaker', personRefs(s)), card('countdown', {}, 'talk'), card('thanks-speaker', personRefs(s))]),
      card('prompt', {}, 'one-word'),
      card('feedback', {}, 'how-it-went'),
      card('closing'),
    ],
  },
  {
    key: 'break-loop',
    label: 'Break loop',
    blurb: 'Coffee on repeat until everyone is back.',
    description: 'A coffee break that loops by itself: the countdown, a save-your-seat card for next Friday and what comes after the break.',
    shape: 'square',
    build: () => loop([card('break', {}, 'coffee'), card('register', {}, 'next-friday'), card('up-next')], [30, 12, 12]),
  },
  {
    key: 'tech-trouble',
    label: 'Tech trouble kit',
    blurb: 'Be right back cards for when the mic dies.',
    description: 'Keep it in your back pocket: be right back cards for the mic, the projector and the internet, a black screen, a five minute timer and the recording notice.',
    shape: 'triangle',
    theme: { accent: 'blue' },
    build: () => [
      card('brb', { label: 'Mic trouble', fields: { reason: 'mic' } }),
      card('brb', { label: 'Projector trouble', fields: { reason: 'projector' } }),
      card('brb', { label: 'Internet trouble', fields: { reason: 'internet' } }),
      card('blank', { label: 'Black' }),
      card('countdown', { label: 'Back in 5', fields: { label: 'Back in', minutes: 5, done: "We're back" } }),
      card('announcement', { label: 'Recording notice' }, 'recording'),
    ],
  },
];

export function getStarter(key: string | null | undefined): StarterKit | null {
  return STARTER_KITS.find((k) => k.key === key) ?? null;
}
