/**
 * Builds a bumper show from an event (docs/features/bumpers.md section 4). Pure: no Nest, no DB, no
 * clock. The data service hands in the event and its records; the seeder uses the same function.
 *
 * Slides only carry refs (speaker, publication, rundown item...) and leave template fields empty
 * wherever a template can default from data, so a renamed speaker or a new talk title flows into
 * the show without generating it again.
 */
import {
  BUMPER_MAX_SLIDES,
  bumperSlideSchema,
  bumperThemeSchema,
  type BumperEventData,
  type BumperEventSpeaker,
  type BumperGenerateInput,
  type BumperKind,
  type BumperPersonPick,
  type BumperPublicationData,
  type BumperRefs,
  type BumperRundownItem,
  type BumperRundownRef,
  type BumperSlide,
  type BumperSlideInput,
  type BumperSpeakerData,
  type BumperTeamData,
  type BumperTheme,
  type BumperThreadData,
} from '@zemi/shared';
import { randomBase62 } from '../../common/crypto.js';

/** Everything the generator reads. Built by `BumpersDataService.generatorSource` (admin audience). */
export interface GeneratorSource {
  event: BumperEventData;
  speakers: Record<string, BumperSpeakerData>;
  publications: Record<string, BumperPublicationData>;
  /** Published team in page order (the host fallback looks for a host or MC role here). */
  team: BumperTeamData[];
  /** Visible discussion threads of the event, top first. */
  threads: BumperThreadData[];
  /** The next published Friday after this one, if any. */
  nextEvent: BumperEventData | null;
}

export interface GeneratedShow {
  title: string;
  theme: BumperTheme;
  slides: BumperSlide[];
  /** Plain-language notes about the choices, shown under the preview. */
  notes: string[];
}

export type IdFactory = () => string;

/** Default slide ids: `s` + 10 base62 characters from node:crypto. */
export const randomSlideId: IdFactory = () => `s${randomBase62(10)}`;

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** Ids from a seeded source of randomness (the seeder passes its Rng), so a run is repeatable. */
export function seededSlideIds(next: () => number): IdFactory {
  return () => {
    let out = 's';
    for (let i = 0; i < 10; i++) out += BASE62[Math.floor(next() * 62) % 62];
    return out;
  };
}

/** One slide through the shared schema (defaults for style, timing, layers...). */
export function makeSlide(
  id: string,
  kind: BumperKind,
  extra: Omit<BumperSlideInput, 'id' | 'kind'> = {},
): BumperSlide {
  return bumperSlideSchema.parse({ ...extra, id, kind });
}

/* ---------------------------------------------------------------- rundown classification */

export type RundownKind =
  | 'talk'
  | 'ceremony'
  | 'closing'
  | 'opening'
  | 'panel'
  | 'qna'
  | 'break'
  | 'photo'
  | 'keynote'
  | 'welcome'
  | 'section';

export type CeremonyPreset = 'prayer' | 'anthem' | 'silence';

/** Case-insensitive, English and Indonesian. Word boundaries keep "breakthrough" out of the breaks. */
const RE = {
  prayer: /\b(prayer|doa|berdoa)\b/i,
  anthem: /\b(anthem|indonesia raya|lagu kebangsaan)\b/i,
  silence: /\b(silence|mengheningkan cipta)\b/i,
  closing: /\b(closing|wrap|wrap-up|penutup|penutupan)\b/i,
  opening: /\b(opening|remarks|sambutan|welcome speech|pembukaan)\b/i,
  panel: /\b(panel|panelists?)\b/i,
  qna: /\bq\s*&\s*a\b|\bq\s+and\s+a\b|\bqna\b|\bquestions?\b|\btanya\s+jawab\b|\bdiskusi\b|\bdiscussion\b/i,
  break: /\b(break|coffee|istirahat|ishoma|networking|lunch|makan siang)\b/i,
  photo: /\b(photos?|foto)\b/i,
  keynote: /\bkeynote\b/i,
  // Doors, arrival and hellos: the welcome card already covers them.
  welcome: /\b(doors?|welcome|registration|registrasi|check-?in|arrival|kedatangan|intro)\b/i,
} as const;

const norm = (s: string | null | undefined) => (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

export function ceremonyPreset(agenda: string): CeremonyPreset | null {
  if (RE.prayer.test(agenda)) return 'prayer';
  if (RE.anthem.test(agenda)) return 'anthem';
  if (RE.silence.test(agenda)) return 'silence';
  return null;
}

/**
 * What a rundown row becomes. Precedence (first match wins):
 * a lineup speaker's own talk title, then prayer/anthem/silence ("Opening prayer" is a ceremony, not
 * remarks), closing words (skipped: the closing block comes last), opening remarks, doors and
 * welcome rows (skipped: the welcome card covers them), panel (before
 * Q and A so "Panel discussion" stays a panel), Q and A, breaks, photo, keynote, a row with a lineup
 * speaker, and anything else as a section.
 */
export function classifyRundownItem(
  item: Pick<BumperRundownItem, 'agenda' | 'speakerId'>,
  ctx: { lineup: BumperEventSpeaker[] },
): RundownKind {
  const agenda = item.agenda ?? '';
  const talker = item.speakerId
    ? ctx.lineup.find(
        (l) => l.speakerId === item.speakerId && (l.role === 'speaker' || l.role === 'keynote'),
      )
    : undefined;
  if (talker?.talkTitle && norm(talker.talkTitle) === norm(agenda)) return 'talk';
  if (ceremonyPreset(agenda)) return 'ceremony';
  if (RE.closing.test(agenda)) return 'closing';
  if (RE.opening.test(agenda)) return 'opening';
  if (RE.welcome.test(agenda) && !talker) return 'welcome';
  if (RE.panel.test(agenda)) return 'panel';
  if (RE.qna.test(agenda)) return 'qna';
  if (RE.break.test(agenda)) return 'break';
  if (RE.photo.test(agenda)) return 'photo';
  if (RE.keynote.test(agenda)) return 'keynote';
  if (talker) return 'talk';
  return 'section';
}

/** Is this team member the host? Their role mentions host or MC. */
const HOST_ROLE = /\b(host|hosts|mc|emcee|master of ceremon(y|ies)|pembawa acara)\b/i;

const CEREMONY_COPY: Record<CeremonyPreset, { title: string; body: string }> = {
  prayer: { title: 'Opening prayer', body: "Let's pray, each in our own way." },
  anthem: { title: 'National anthem', body: 'Please rise for Indonesia Raya.' },
  silence: { title: 'A minute of silence', body: 'A quiet moment together.' },
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function rundownRef(item: BumperRundownItem, index: number): BumperRundownRef {
  return {
    index,
    time: HHMM.test(item.time) ? item.time : null,
    agenda: item.agenda.slice(0, 200),
  };
}

function firstName(name: string): string {
  const clean = name.replace(/^(dr|prof|mr|mrs|ms|ir)\.?\s+/i, '').trim();
  return clean.split(/\s+/)[0] ?? clean;
}

/* ---------------------------------------------------------------- generator */

export function generateShow(
  input: BumperGenerateInput,
  src: GeneratorSource,
  opts: { newId?: IdFactory } = {},
): GeneratedShow {
  const newId = opts.newId ?? randomSlideId;
  const event = src.event;
  const notes: string[] = [];
  const slides: BumperSlide[] = [];
  const push = (
    kind: BumperKind,
    extra: Omit<BumperSlideInput, 'id' | 'kind'> = {},
  ): BumperSlide => {
    const s = makeSlide(newId(), kind, extra);
    slides.push(s);
    return s;
  };
  const speakerName = (id: string) => src.speakers[id]?.fullName ?? 'A speaker';

  const lineup = event.speakers;
  const rundown = event.rundown;
  const hasRundown = rundown.length > 0;
  const talkers = lineup.filter((l) => l.role === 'speaker' || l.role === 'keynote');
  const eventPubs = event.publicationIds
    .map((id) => src.publications[id])
    .filter((p): p is BumperPublicationData => !!p);
  const usedPubs = new Set<string>();
  const covered = new Set<string>();
  let hadQna = false;
  let hadPhoto = false;

  /* 1. pre-show loop */
  if (input.preshow) {
    const loop: BumperSlide[] = [];
    loop.push(push('standby', { timing: { autoAdvanceSec: 20 } }));
    if (hasRundown) loop.push(push('agenda', { timing: { autoAdvanceSec: 15 } }));
    if (input.houseRules) loop.push(push('house-rules', { timing: { autoAdvanceSec: 15 } }));
    const first = loop[0];
    const last = loop[loop.length - 1];
    if (loop.length > 1) {
      last.timing.loopToId = first.id;
      notes.push('The pre-show loop plays by itself until you press next.');
    } else {
      // A loop of one would replay the same card every 20 seconds: let the countdown run instead.
      first.timing.autoAdvanceSec = null;
    }
  }

  /* 2. welcome + agenda */
  if (input.welcome) push('welcome');
  if (input.agenda && hasRundown) push('agenda');

  /* 3. host */
  const host = pickHost(input.host, src);
  if (host.slide) push('mc', host.slide);
  if (host.note) notes.push(host.note);
  /** Where a hand-picked opening card goes when the rundown has no opening item: right after the host. */
  const openingAt = slides.length;

  /* speaker block (shared by the rundown walk and the lineup fallback) */
  const speakerBlock = (
    speakerId: string,
    role: 'speaker' | 'keynote',
    ref: BumperRundownRef | null,
  ) => {
    covered.add(speakerId);
    if (ref) push('up-next', { refs: { rundown: ref } });
    push(role === 'keynote' ? 'keynote' : 'speaker', { refs: { speakerId } });
    let papers = 0;
    if (input.papers) {
      for (const pub of eventPubs) {
        if (usedPubs.has(pub.id) || !pub.authors.some((a) => a.speakerId === speakerId)) continue;
        usedPubs.add(pub.id);
        papers++;
        push('paper', { refs: { publicationId: pub.id, speakerId } });
      }
    }
    const talk = lineup.find((l) => l.speakerId === speakerId)?.talkTitle;
    if (!papers && talk) push('talk-title', { refs: { speakerId } });
    if (input.thanks) push('thanks-speaker', { refs: { speakerId } });
    if (input.qna === 'after-each') {
      push('qna');
      hadQna = true;
    }
  };

  const qnaBlock = () => {
    // "After each talk" already put a Q and A card right before: only add the questions.
    if (slides[slides.length - 1]?.kind !== 'qna') push('qna');
    push('featured-question');
    hadQna = true;
  };

  const openingSlide = (itemSpeakerId: string | null): void => {
    const pick = input.opening;
    if (pick.mode === 'none') {
      notes.push('You turned off the opening remarks card, so the opening item has no bumper.');
      return;
    }
    const person = openingPerson(pick, itemSpeakerId, lineup);
    if (!person)
      notes.push('Nobody is set for the opening remarks yet. Pick who opens in the builder.');
    push('opening', person ?? {});
  };

  /* 4. the rundown (or the lineup) */
  let explicitOpeningPlaced = false;
  if (hasRundown) {
    const skipped: string[] = [];
    rundown.forEach((item, index) => {
      const ref = rundownRef(item, index);
      const kind = classifyRundownItem(item, { lineup });
      switch (kind) {
        case 'talk': {
          const l = talkers.find((t) => t.speakerId === item.speakerId)!;
          speakerBlock(l.speakerId, l.role === 'keynote' ? 'keynote' : 'speaker', ref);
          return;
        }
        case 'keynote': {
          const id = item.speakerId ?? talkers.find((t) => t.role === 'keynote')?.speakerId ?? null;
          if (id) speakerBlock(id, 'keynote', ref);
          else {
            push('up-next', { refs: { rundown: ref } });
            push('keynote');
            notes.push(
              `"${item.agenda}" is a keynote without a speaker yet. Pick one on the keynote card.`,
            );
          }
          return;
        }
        case 'opening':
          explicitOpeningPlaced = true;
          openingSlide(item.speakerId);
          return;
        case 'ceremony': {
          const preset = ceremonyPreset(item.agenda)!;
          push('ceremony', {
            refs: { rundown: ref },
            fields: { preset, ...CEREMONY_COPY[preset] },
          });
          return;
        }
        case 'qna':
          if (input.qna === 'none') skipped.push(item.agenda);
          else qnaBlock();
          return;
        case 'break': {
          if (!input.breaks) {
            skipped.push(item.agenda);
            return;
          }
          const next = rundown[index + 1];
          const until =
            item.endTime && HHMM.test(item.endTime)
              ? item.endTime
              : next && HHMM.test(next.time)
                ? next.time
                : null;
          const brk = push('break', { refs: { rundown: ref }, fields: until ? { until } : {} });
          if (next) {
            brk.timing.autoAdvanceSec = 30;
            push('up-next', {
              refs: { rundown: rundownRef(next, index + 1) },
              timing: { autoAdvanceSec: 12, loopToId: brk.id },
            });
            if (!notes.some((n) => n.startsWith('The break')))
              notes.push('The break loops with an up-next card until you press next.');
          }
          return;
        }
        case 'photo':
          if (!input.photo) {
            skipped.push(item.agenda);
            return;
          }
          push('photo');
          hadPhoto = true;
          return;
        case 'panel': {
          const panelists = lineup.filter((l) => l.role === 'panelist').map((l) => l.speakerId);
          const ids = panelists.length ? panelists : item.speakerId ? [item.speakerId] : [];
          ids.forEach((id) => covered.add(id));
          if (!ids.length)
            notes.push(
              `"${item.agenda}" has no panelists on the lineup yet, so the panel card is empty for now.`,
            );
          push('panel', {
            refs: { rundown: ref, ...(ids.length ? { speakerIds: ids.slice(0, 12) } : {}) },
            fields: { title: item.agenda.slice(0, 160) },
          });
          return;
        }
        case 'closing':
          skipped.push(item.agenda);
          return;
        case 'welcome':
          // "Doors open and welcome" is what the welcome card is for.
          if (!input.welcome) push('section', { refs: { rundown: ref }, fields: { title: item.agenda.slice(0, 160) } });
          return;
        case 'section':
          push('section', { refs: { rundown: ref }, fields: { title: item.agenda.slice(0, 160) } });
          return;
      }
    });
    const closers = skipped.filter((a) => RE.closing.test(a));
    if (closers.length)
      notes.push(
        `Skipped ${quoteList(closers)} in the rundown: the closing cards at the end cover it.`,
      );
    const others = skipped.filter((a) => !RE.closing.test(a));
    if (others.length)
      notes.push(`Left out ${quoteList(others)} because you turned that part off.`);
  } else {
    const keynotes = lineup.filter((l) => l.role === 'keynote');
    const speakers = lineup.filter((l) => l.role === 'speaker');
    const panelists = lineup.filter((l) => l.role === 'panelist');
    for (const k of keynotes) speakerBlock(k.speakerId, 'keynote', null);
    for (const s of speakers) speakerBlock(s.speakerId, 'speaker', null);
    if (panelists.length) {
      panelists.forEach((p) => covered.add(p.speakerId));
      push('panel', { refs: { speakerIds: panelists.slice(0, 12).map((p) => p.speakerId) } });
    }
    notes.push(
      lineup.length
        ? 'No rundown yet, so we followed the lineup.'
        : 'No rundown or lineup yet, so this is a starter show. Generate again once the speakers are in.',
    );
  }

  // An opening picked by hand still gets its card when the rundown has no opening item.
  if (
    !explicitOpeningPlaced &&
    (input.opening.mode === 'speaker' ||
      input.opening.mode === 'team' ||
      input.opening.mode === 'name')
  ) {
    const person = openingPerson(input.opening, null, lineup);
    if (person) slides.splice(openingAt, 0, makeSlide(newId(), 'opening', person));
  }

  const missing = talkers
    .filter((t) => !covered.has(t.speakerId))
    .map((t) => firstName(speakerName(t.speakerId)));
  if (hasRundown && missing.length) {
    notes.push(
      `${listWords(missing)} ${missing.length === 1 ? 'is' : 'are'} on the lineup but not in the rundown, so there is no card for them yet.`,
    );
  }

  /* 5. Q and A at the end */
  if (input.qna === 'end' && !hadQna) qnaBlock();
  if (slides.some((s) => s.kind === 'featured-question') && !src.threads.length) {
    notes.push(
      'Nobody has posted on the discussion page for this Friday yet. The question card fills in as people post.',
    );
  }

  /* 6. closing block */
  if (input.photo && !hadPhoto) push('photo');
  if (input.credits) push('credits');
  if (input.nextEvent) {
    if (src.nextEvent) push('next-event');
    else notes.push('No next Friday is published yet, so we left out the next-event card.');
  }
  if (input.closing) push('closing');

  if (slides.length > BUMPER_MAX_SLIDES) {
    slides.length = BUMPER_MAX_SLIDES;
    notes.push(
      `That came to more than ${BUMPER_MAX_SLIDES} bumpers, so we kept the first ${BUMPER_MAX_SLIDES}.`,
    );
  }
  // Loop targets must point at a slide that is still there.
  const ids = new Set(slides.map((s) => s.id));
  for (const s of slides)
    if (s.timing.loopToId && !ids.has(s.timing.loopToId)) s.timing.loopToId = null;

  const title = (
    input.title?.trim() || (event.number !== null ? `Zemi #${event.number} bumpers` : event.title)
  ).slice(0, 120);
  const theme = bumperThemeSchema.parse({ accent: 'event', ...(input.theme ?? {}) });
  return { title, theme, slides, notes };
}

type PersonSlide = { refs?: Partial<BumperRefs>; fields?: Record<string, string> };

function pickHost(
  pick: BumperPersonPick,
  src: GeneratorSource,
): { slide: PersonSlide | null; note: string | null } {
  const lineup = src.event.speakers;
  switch (pick.mode) {
    case 'none':
      return { slide: null, note: null };
    case 'speaker':
      return pick.id
        ? { slide: { refs: { speakerId: pick.id } }, note: null }
        : { slide: null, note: 'Pick a speaker for the host card, or type a name.' };
    case 'team':
      return pick.id
        ? { slide: { refs: { teamMemberId: pick.id } }, note: null }
        : { slide: null, note: 'Pick a team member for the host card, or type a name.' };
    case 'name': {
      const name = pick.name?.trim();
      if (!name) return { slide: null, note: 'Type the host name to get a host card.' };
      return {
        slide: { fields: { name, ...(pick.role?.trim() ? { role: pick.role.trim() } : {}) } },
        note: null,
      };
    }
    default: {
      const moderator = lineup.find((l) => l.role === 'moderator');
      if (moderator) {
        return {
          slide: { refs: { speakerId: moderator.speakerId } },
          note: `${firstName(src.speakers[moderator.speakerId]?.fullName ?? 'The moderator')} hosts, since they moderate on the lineup.`,
        };
      }
      const teamHost = src.team.find((t) => t.role && HOST_ROLE.test(t.role));
      if (teamHost)
        return {
          slide: { refs: { teamMemberId: teamHost.id } },
          note: `${firstName(teamHost.name)} hosts, from the team page.`,
        };
      return {
        slide: null,
        note: 'No moderator on the lineup and no host on the team page, so we skipped the host card.',
      };
    }
  }
}

function openingPerson(
  pick: BumperPersonPick,
  itemSpeakerId: string | null,
  lineup: BumperEventSpeaker[],
): PersonSlide | null {
  if (itemSpeakerId) return { refs: { speakerId: itemSpeakerId } };
  switch (pick.mode) {
    case 'speaker':
      return pick.id ? { refs: { speakerId: pick.id } } : null;
    case 'team':
      return pick.id ? { refs: { teamMemberId: pick.id } } : null;
    case 'name': {
      const name = pick.name?.trim();
      return name
        ? { fields: { name, ...(pick.role?.trim() ? { role: pick.role.trim() } : {}) } }
        : null;
    }
    case 'auto': {
      const keynote = lineup.find((l) => l.role === 'keynote');
      return keynote ? { refs: { speakerId: keynote.speakerId } } : null;
    }
    default:
      return null;
  }
}

function quoteList(items: string[]): string {
  return listWords(items.map((a) => `"${a}"`));
}

function listWords(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
