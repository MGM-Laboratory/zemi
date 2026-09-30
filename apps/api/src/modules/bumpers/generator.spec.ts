import {
  bumperGenerateInput,
  bumperSlideSchema,
  type BumperEventData,
  type BumperEventSpeaker,
  type BumperGenerateInput,
  type BumperPublicationData,
  type BumperRundownItem,
  type BumperSpeakerData,
  type BumperTeamData,
} from '@zemi/shared';
import { describe, expect, it } from 'vitest';
import { assertNoDashes } from '../../seed/util.js';
import { classifyRundownItem, generateShow, type GeneratorSource } from './generator.js';

const EVENT = '11111111-1111-4111-8111-111111111111';
const NEXT = '22222222-2222-4222-8222-222222222222';
const RANI = '33333333-3333-4333-8333-333333333331';
const BUDI = '33333333-3333-4333-8333-333333333332';
const SARI = '33333333-3333-4333-8333-333333333333';
const MOD = '33333333-3333-4333-8333-333333333334';
const PAN1 = '33333333-3333-4333-8333-333333333335';
const PAN2 = '33333333-3333-4333-8333-333333333336';
const HEAD = '33333333-3333-4333-8333-333333333337';
const PUB_RANI = '44444444-4444-4444-8444-444444444441';
const PUB_BUDI = '44444444-4444-4444-8444-444444444442';
const PUB_OTHER = '44444444-4444-4444-8444-444444444443';
const TEAM_HOST = '55555555-5555-4555-8555-555555555551';

function speaker(id: string, fullName: string): BumperSpeakerData {
  return {
    id,
    slug: fullName.toLowerCase().replace(/\s+/g, '-'),
    fullName,
    nickname: null,
    headline: null,
    avatar: null,
    organization: 'MGM Lab',
    position: 'PhD candidate',
    links: [],
    url: `https://zemi.ac/speakers/${id}`,
  };
}

const SPEAKERS: Record<string, BumperSpeakerData> = Object.fromEntries(
  [
    speaker(RANI, 'Rani Kusuma'),
    speaker(BUDI, 'Budi Santoso'),
    speaker(SARI, 'Sari Wulandari'),
    speaker(MOD, 'Maya Putri'),
    speaker(PAN1, 'Pandu Wijaya'),
    speaker(PAN2, 'Putu Ayu'),
    speaker(HEAD, 'Hartono Wicaksono'),
  ].map((s) => [s.id, s]),
);

function pub(id: string, title: string, authorIds: Array<string | null>): BumperPublicationData {
  return {
    id,
    slug: title.toLowerCase().replace(/\s+/g, '-'),
    type: 'conference-paper',
    typeLabel: 'Conference paper',
    title,
    subtitle: null,
    containerTitle: 'CHI',
    publishedYear: 2025,
    doi: null,
    cover: null,
    authors: authorIds.map((a, i) => ({
      name: a ? SPEAKERS[a].fullName : `Author ${i}`,
      speakerId: a,
      avatar: null,
      organization: null,
    })),
    keywords: [],
    url: `https://zemi.ac/publications/${id}`,
  };
}

const PUBS: Record<string, BumperPublicationData> = {
  [PUB_RANI]: pub(PUB_RANI, 'Drones over rice', [RANI, null]),
  [PUB_BUDI]: pub(PUB_BUDI, 'Rovers and ditches', [null, BUDI]),
  [PUB_OTHER]: pub(PUB_OTHER, 'Somebody else entirely', [null]),
};

const ls = (
  speakerId: string,
  role: BumperEventSpeaker['role'],
  talkTitle: string | null = null,
): BumperEventSpeaker => ({ speakerId, role, organization: null, position: null, talkTitle });
const row = (time: string, agenda: string, speakerId: string | null = null): BumperRundownItem => ({
  time,
  endTime: null,
  agenda,
  note: null,
  speakerId,
});

function event(over: Partial<BumperEventData> = {}): BumperEventData {
  return {
    id: EVENT,
    slug: 'zemi-98',
    number: 98,
    title: 'Robots, rice fields and the stuff in between',
    summary: null,
    cover: null,
    startsAt: '2026-10-02T06:15:00.000Z',
    endsAt: '2026-10-02T08:15:00.000Z',
    accent: 'green',
    mode: 'hybrid',
    tags: [],
    status: 'scheduled',
    venue: null,
    roomNote: null,
    onlineNote: null,
    url: 'https://zemi.ac/events/zemi-98',
    speakers: [
      ls(RANI, 'speaker', 'Drones that scout pests'),
      ls(BUDI, 'speaker', 'A rover that respects ditches'),
    ],
    rundown: [
      row('13:15', 'Doors open and intro'),
      row('13:25', 'Drones that scout pests', RANI),
      row('14:00', 'A rover that respects ditches', BUDI),
      row('14:35', 'Q and A'),
      row('14:55', 'Coffee and networking'),
      row('15:15', 'Wrap and see you next Friday'),
    ],
    publicationIds: [PUB_RANI, PUB_BUDI, PUB_OTHER],
    registrationOpen: true,
    ...over,
  };
}

const NEXT_EVENT = event({
  id: NEXT,
  number: 99,
  title: 'Security folklore',
  speakers: [],
  rundown: [],
  publicationIds: [],
});

function source(over: Partial<GeneratorSource> = {}): GeneratorSource {
  return {
    event: event(),
    speakers: SPEAKERS,
    publications: PUBS,
    team: [],
    threads: [],
    nextEvent: NEXT_EVENT,
    ...over,
  };
}

function counter() {
  let n = 0;
  return () => `s${String(++n).padStart(4, '0')}`;
}

const input = (over: Partial<BumperGenerateInput> = {}): BumperGenerateInput =>
  bumperGenerateInput.parse({ eventId: EVENT, ...over });
const kinds = (g: ReturnType<typeof generateShow>) => g.slides.map((s) => s.kind);

describe('generateShow: rundown walk', () => {
  it('follows the rundown in order with speaker blocks, Q and A, the break loop and the closing block', () => {
    const g = generateShow(input(), source(), { newId: counter() });
    expect(kinds(g)).toEqual([
      'standby',
      'agenda',
      'house-rules',
      'welcome',
      'agenda',
      // "Doors open and intro" folds into the welcome card.
      'up-next',
      'speaker',
      'paper',
      'thanks-speaker',
      'up-next',
      'speaker',
      'paper',
      'thanks-speaker',
      'qna',
      'featured-question',
      'break',
      'up-next',
      'photo',
      'next-event',
      'closing',
    ]);
    expect(g.title).toBe('Zemi #98 bumpers');
    expect(g.theme.accent).toBe('event');
    // Every slide is valid against the shared schema and has a unique id.
    for (const s of g.slides) expect(bumperSlideSchema.parse(s)).toEqual(s);
    expect(new Set(g.slides.map((s) => s.id)).size).toBe(g.slides.length);
  });

  it('points up-next cards at their rundown item and fills refs, not fields', () => {
    const g = generateShow(input(), source(), { newId: counter() });
    const upNext = g.slides.find((s) => s.kind === 'up-next')!;
    expect(upNext.refs.rundown).toEqual({
      index: 1,
      time: '13:25',
      agenda: 'Drones that scout pests',
    });
    const sp = g.slides.find((s) => s.kind === 'speaker')!;
    expect(sp.refs.speakerId).toBe(RANI);
    expect(sp.fields).toEqual({});
  });

  it('loops the pre-show and the break', () => {
    const g = generateShow(input(), source(), { newId: counter() });
    const [standby, agenda, rules] = g.slides;
    expect(standby.timing).toEqual({ autoAdvanceSec: 20, loopToId: null });
    expect(agenda.timing.autoAdvanceSec).toBe(15);
    expect(rules.timing).toEqual({ autoAdvanceSec: 15, loopToId: standby.id });
    const brk = g.slides.find((s) => s.kind === 'break')!;
    const after = g.slides[g.slides.indexOf(brk) + 1];
    expect(brk.timing.autoAdvanceSec).toBe(30);
    expect(brk.fields.until).toBe('15:15');
    expect(after.kind).toBe('up-next');
    expect(after.refs.rundown?.agenda).toBe('Wrap and see you next Friday');
    expect(after.timing).toEqual({ autoAdvanceSec: 12, loopToId: brk.id });
    // Every other slide waits for the operator.
    const paced = g.slides.filter((s) => ![standby, agenda, rules, brk, after].includes(s));
    expect(paced.every((s) => s.timing.autoAdvanceSec === null)).toBe(true);
  });

  it('a break at the very end has no loop to fall out of', () => {
    const g = generateShow(
      input(),
      source({ event: event({ rundown: [row('13:15', 'Talk', RANI), row('14:00', 'Lunch')] }) }),
      { newId: counter() },
    );
    const brk = g.slides.find((s) => s.kind === 'break')!;
    expect(brk.timing.autoAdvanceSec).toBeNull();
    expect(g.slides[g.slides.indexOf(brk) + 1].kind).not.toBe('up-next');
  });

  it('explains what it skipped and why', () => {
    const g = generateShow(input(), source(), { newId: counter() });
    expect(g.notes.join(' ')).toContain('Skipped "Wrap and see you next Friday"');
    for (const n of g.notes) assertNoDashes('generator note', n);
    for (const s of g.slides) assertNoDashes('generated slide', s);
  });

  it('turns a row it has no card for into a section with the agenda as the title', () => {
    const g = generateShow(input({ welcome: false, preshow: false }), source(), {
      newId: counter(),
    });
    expect(g.slides[0].kind).toBe('agenda');
    expect(g.slides[1].kind).toBe('section');
    expect(g.slides[1].fields.title).toBe('Doors open and intro');
    expect(g.slides[1].refs.rundown).toEqual({
      index: 0,
      time: '13:15',
      agenda: 'Doors open and intro',
    });
  });
});

describe('generateShow: lineup fallback', () => {
  it('uses keynotes first, then speakers, then the panelists as one panel', () => {
    const e = event({
      rundown: [],
      speakers: [
        ls(RANI, 'speaker', 'Drones'),
        ls(PAN1, 'panelist'),
        ls(SARI, 'keynote', 'Floods'),
        ls(PAN2, 'panelist'),
        ls(MOD, 'moderator'),
      ],
      publicationIds: [],
    });
    const g = generateShow(input({ preshow: false }), source({ event: e }), { newId: counter() });
    expect(kinds(g)).toEqual([
      'welcome',
      'mc',
      'keynote',
      'talk-title',
      'thanks-speaker',
      'speaker',
      'talk-title',
      'thanks-speaker',
      'panel',
      'qna',
      'featured-question',
      'photo',
      'next-event',
      'closing',
    ]);
    expect(g.slides.find((s) => s.kind === 'keynote')!.refs.speakerId).toBe(SARI);
    expect(g.slides.find((s) => s.kind === 'panel')!.refs.speakerIds).toEqual([PAN1, PAN2]);
    expect(g.notes).toContain('No rundown yet, so we followed the lineup.');
    // No rundown means no up-next cards and no agenda.
    expect(kinds(g)).not.toContain('up-next');
    expect(kinds(g)).not.toContain('agenda');
  });

  it('an empty Friday still gives a starter show', () => {
    const g = generateShow(
      input({ preshow: false }),
      source({ event: event({ rundown: [], speakers: [], publicationIds: [] }) }),
      { newId: counter() },
    );
    expect(kinds(g)).toEqual([
      'welcome',
      'qna',
      'featured-question',
      'photo',
      'next-event',
      'closing',
    ]);
    expect(g.notes.join(' ')).toContain('starter show');
  });
});

describe('generateShow: host and opening', () => {
  it('auto host is the first moderator on the lineup', () => {
    const e = event({
      speakers: [
        ls(RANI, 'speaker', 'Drones that scout pests'),
        ls(MOD, 'moderator'),
        ls(BUDI, 'speaker', 'A rover that respects ditches'),
      ],
    });
    const g = generateShow(input(), source({ event: e }), { newId: counter() });
    const mc = g.slides.find((s) => s.kind === 'mc')!;
    expect(mc.refs.speakerId).toBe(MOD);
    expect(g.slides.indexOf(mc)).toBe(g.slides.findIndex((s) => s.kind === 'welcome') + 2);
  });

  it('falls back to a team member whose role says host, else skips with a note', () => {
    const team: BumperTeamData[] = [
      {
        id: '55555555-5555-4555-8555-555555555550',
        name: 'Aulia',
        role: 'Lead organizer',
        avatar: null,
      },
      { id: TEAM_HOST, name: 'Rendy', role: 'MC and program chair', avatar: null },
    ];
    const withTeam = generateShow(input(), source({ team }), { newId: counter() });
    expect(withTeam.slides.find((s) => s.kind === 'mc')!.refs.teamMemberId).toBe(TEAM_HOST);
    const without = generateShow(input(), source(), { newId: counter() });
    expect(kinds(without)).not.toContain('mc');
    expect(without.notes.join(' ')).toContain('skipped the host card');
  });

  it('a typed host becomes name and role fields', () => {
    const g = generateShow(
      input({ host: { mode: 'name', name: 'Dimas', role: 'Friday host' } }),
      source(),
      { newId: counter() },
    );
    expect(g.slides.find((s) => s.kind === 'mc')!.fields).toEqual({
      name: 'Dimas',
      role: 'Friday host',
    });
  });

  it('detects opening remarks and uses the item speaker', () => {
    const e = event({
      rundown: [
        row('13:15', 'Opening remarks', HEAD),
        row('13:25', 'Drones that scout pests', RANI),
      ],
    });
    const g = generateShow(input({ preshow: false }), source({ event: e }), { newId: counter() });
    const opening = g.slides.find((s) => s.kind === 'opening')!;
    expect(opening.refs.speakerId).toBe(HEAD);
    expect(kinds(g).slice(0, 4)).toEqual(['welcome', 'agenda', 'opening', 'up-next']);
  });

  it('opening without a speaker takes the pick, or the first keynote on auto', () => {
    const e = event({
      speakers: [ls(SARI, 'keynote', 'Floods'), ls(RANI, 'speaker', 'Drones that scout pests')],
      rundown: [row('13:15', 'Sambutan ketua lab'), row('13:25', 'Floods', SARI)],
    });
    const auto = generateShow(input({ preshow: false }), source({ event: e }), {
      newId: counter(),
    });
    expect(auto.slides.find((s) => s.kind === 'opening')!.refs.speakerId).toBe(SARI);
    const team = generateShow(
      input({ preshow: false, opening: { mode: 'team', id: TEAM_HOST } }),
      source({ event: e }),
      { newId: counter() },
    );
    expect(team.slides.find((s) => s.kind === 'opening')!.refs.teamMemberId).toBe(TEAM_HOST);
  });

  it('a hand-picked opening gets a card after the host even without an opening item', () => {
    const g = generateShow(
      input({
        preshow: false,
        host: { mode: 'name', name: 'Dimas' },
        opening: { mode: 'name', name: 'Prof. Hartono', role: 'Head of the lab' },
      }),
      source(),
      { newId: counter() },
    );
    expect(kinds(g).slice(0, 4)).toEqual(['welcome', 'agenda', 'mc', 'opening']);
    expect(g.slides[3].fields).toEqual({ name: 'Prof. Hartono', role: 'Head of the lab' });
  });

  it('"Opening prayer" is a ceremony, not remarks', () => {
    expect(classifyRundownItem({ agenda: 'Opening prayer', speakerId: null }, { lineup: [] })).toBe(
      'ceremony',
    );
    expect(
      classifyRundownItem({ agenda: 'Opening remarks', speakerId: null }, { lineup: [] }),
    ).toBe('opening');
    // A talk whose title happens to contain "opening" stays a talk.
    const lineup = [ls(RANI, 'speaker', 'Opening the black box')];
    expect(
      classifyRundownItem({ agenda: 'Opening the black box', speakerId: RANI }, { lineup }),
    ).toBe('talk');
  });
});

describe('generateShow: papers', () => {
  it('matches event papers to the speakers who wrote them, once each', () => {
    const shared = pub(PUB_OTHER, 'Written together', [BUDI, RANI]);
    const g = generateShow(input(), source({ publications: { ...PUBS, [PUB_OTHER]: shared } }), {
      newId: counter(),
    });
    const papers = g.slides.filter((s) => s.kind === 'paper');
    expect(papers.map((p) => [p.refs.publicationId, p.refs.speakerId])).toEqual([
      [PUB_RANI, RANI],
      [PUB_OTHER, RANI],
      [PUB_BUDI, BUDI],
    ]);
  });

  it('uses the talk title card when a speaker has no paper, or papers are off', () => {
    const none = generateShow(input(), source({ event: event({ publicationIds: [] }) }), {
      newId: counter(),
    });
    expect(none.slides.filter((s) => s.kind === 'talk-title').map((s) => s.refs.speakerId)).toEqual(
      [RANI, BUDI],
    );
    const off = generateShow(input({ papers: false }), source(), { newId: counter() });
    expect(kinds(off)).not.toContain('paper');
    expect(off.slides.filter((s) => s.kind === 'talk-title')).toHaveLength(2);
    const noThanks = generateShow(input({ thanks: false }), source(), { newId: counter() });
    expect(kinds(noThanks)).not.toContain('thanks-speaker');
  });
});

describe('generateShow: Q and A modes', () => {
  it('end: the rundown Q and A item, or one before the closing when the rundown has none', () => {
    const g = generateShow(input({ qna: 'end' }), source(), { newId: counter() });
    expect(kinds(g).filter((k) => k === 'qna')).toHaveLength(1);
    const noItem = event({
      rundown: [
        row('13:15', 'Drones that scout pests', RANI),
        row('14:00', 'A rover that respects ditches', BUDI),
      ],
    });
    const g2 = generateShow(input({ qna: 'end', preshow: false }), source({ event: noItem }), {
      newId: counter(),
    });
    expect(kinds(g2).slice(-5)).toEqual([
      'qna',
      'featured-question',
      'photo',
      'next-event',
      'closing',
    ]);
  });

  it('after-each: a Q and A card after every talk, no duplicate for the rundown item', () => {
    const g = generateShow(input({ qna: 'after-each', preshow: false }), source(), {
      newId: counter(),
    });
    const k = kinds(g);
    expect(k.filter((x) => x === 'qna')).toHaveLength(2);
    expect(k[k.indexOf('thanks-speaker') + 1]).toBe('qna');
    // The rundown's own Q and A row adds only the questions card after the last talk's Q and A.
    const lastQna = k.lastIndexOf('qna');
    expect(k[lastQna + 1]).toBe('featured-question');
  });

  it('none: no Q and A anywhere', () => {
    const g = generateShow(input({ qna: 'none' }), source(), { newId: counter() });
    expect(kinds(g)).not.toContain('qna');
    expect(kinds(g)).not.toContain('featured-question');
  });

  it('says when there are no questions yet', () => {
    const g = generateShow(input(), source(), { newId: counter() });
    expect(g.notes.join(' ')).toContain('Nobody has posted on the discussion page');
  });
});

describe('generateShow: closing block', () => {
  it('leaves out next Friday when none is published and says so', () => {
    const g = generateShow(input(), source({ nextEvent: null }), { newId: counter() });
    expect(kinds(g)).not.toContain('next-event');
    expect(g.notes).toContain(
      'No next Friday is published yet, so we left out the next-event card.',
    );
  });

  it('credits when asked, and no second photo when the rundown had one', () => {
    const e = event({
      rundown: [row('13:15', 'Drones that scout pests', RANI), row('15:00', 'Group photo')],
    });
    const g = generateShow(input({ credits: true, preshow: false }), source({ event: e }), {
      newId: counter(),
    });
    expect(kinds(g).slice(-6)).toEqual([
      'photo',
      'qna',
      'featured-question',
      'credits',
      'next-event',
      'closing',
    ]);
    expect(kinds(g).filter((k) => k === 'photo')).toHaveLength(1);
  });

  it('uses the event title when there is no number, and the title from the input first', () => {
    expect(
      generateShow(input(), source({ event: event({ number: null }) }), { newId: counter() }).title,
    ).toBe('Robots, rice fields and the stuff in between');
    expect(generateShow(input({ title: 'Big Friday' }), source(), { newId: counter() }).title).toBe(
      'Big Friday',
    );
    expect(
      generateShow(input({ theme: { accent: 'red', motion: 'calm' } }), source(), {
        newId: counter(),
      }).theme,
    ).toMatchObject({ accent: 'red', motion: 'calm', bug: true });
  });
});

describe('generateShow: Indonesian agenda words', () => {
  it('reads sambutan, doa, tanya jawab, istirahat, ishoma, foto and penutup', () => {
    const e = event({
      rundown: [
        row('13:00', 'Doa pembuka'),
        row('13:05', 'Menyanyikan Indonesia Raya'),
        row('13:10', 'Sambutan kepala laboratorium', HEAD),
        row('13:25', 'Drones that scout pests', RANI),
        row('14:00', 'Sesi tanya jawab'),
        row('14:20', 'Istirahat dan ishoma'),
        row('14:50', 'Diskusi kelompok'),
        row('15:00', 'Foto bersama'),
        row('15:10', 'Penutup'),
      ],
    });
    const g = generateShow(input({ preshow: false }), source({ event: e }), { newId: counter() });
    expect(kinds(g)).toEqual([
      'welcome',
      'agenda',
      'ceremony',
      'ceremony',
      'opening',
      'up-next',
      'speaker',
      'paper',
      'thanks-speaker',
      'qna',
      'featured-question',
      'break',
      'up-next',
      'qna',
      'featured-question',
      'photo',
      'next-event',
      'closing',
    ]);
    const [prayer, anthem] = g.slides.filter((s) => s.kind === 'ceremony');
    expect(prayer.fields.preset).toBe('prayer');
    expect(anthem.fields.preset).toBe('anthem');
    expect(g.notes.join(' ')).toContain('Skipped "Penutup"');
    expect(g.notes.join(' ')).toContain('Budi is on the lineup but not in the rundown');
  });

  it('keeps "breakthrough" out of the breaks', () => {
    expect(
      classifyRundownItem(
        { agenda: 'A breakthrough in rice genomics', speakerId: null },
        { lineup: [] },
      ),
    ).toBe('section');
    expect(classifyRundownItem({ agenda: 'Coffee break', speakerId: null }, { lineup: [] })).toBe(
      'break',
    );
    expect(
      classifyRundownItem({ agenda: 'Panel discussion', speakerId: null }, { lineup: [] }),
    ).toBe('panel');
    expect(classifyRundownItem({ agenda: 'Q&A', speakerId: null }, { lineup: [] })).toBe('qna');
  });
});
