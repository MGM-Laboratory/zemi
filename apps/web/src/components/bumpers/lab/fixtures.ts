import { BUMPER_KINDS, bumperSlideSchema, DEFAULT_BUMPER_THEME, type BumperData, type BumperKind, type BumperSlide, type BumperSlideInput, type BumperTheme } from '@zemi/shared';
import { getTemplate } from '../templates';

/**
 * Sample data for the bumper lab, gallery previews and template screenshots. Realistic, public
 * style content (no emails), ids are stable uuids so transitions stay deterministic.
 */
export const SAMPLE_EVENT_ID = '5a3b0000-0000-4000-8000-000000000098';
export const SAMPLE_NEXT_ID = '5a3b0000-0000-4000-8000-000000000099';
const SP = {
  rani: '5a3b0000-0000-4000-8000-00000000a001',
  bima: '5a3b0000-0000-4000-8000-00000000a002',
  sari: '5a3b0000-0000-4000-8000-00000000a003',
  hadi: '5a3b0000-0000-4000-8000-00000000a004',
  nadia: '5a3b0000-0000-4000-8000-00000000a005',
};
const PUB = { p1: '5a3b0000-0000-4000-8000-00000000b001', p2: '5a3b0000-0000-4000-8000-00000000b002' };
const TEAM = { dimas: '5a3b0000-0000-4000-8000-00000000c001', ayu: '5a3b0000-0000-4000-8000-00000000c002', fajar: '5a3b0000-0000-4000-8000-00000000c003' };
const TH = { t1: '5a3b0000-0000-4000-8000-00000000d001', t2: '5a3b0000-0000-4000-8000-00000000d002', t3: '5a3b0000-0000-4000-8000-00000000d003' };

const speaker = (id: string, slug: string, fullName: string, headline: string, organization: string, position: string, nickname: string | null = null) => ({
  id,
  slug,
  fullName,
  nickname,
  headline,
  avatar: null,
  organization,
  position,
  links: [],
  url: `https://zemi.ac/speakers/${slug}`,
});

export const SAMPLE_DATA: BumperData = {
  events: {
    [SAMPLE_EVENT_ID]: {
      id: SAMPLE_EVENT_ID,
      slug: 'small-models-big-questions',
      number: 98,
      title: 'Small models, big questions',
      summary: 'Two postgrads, one keynote and a lot of coffee. What tiny models get right and where they should say "I don\'t know".',
      cover: null,
      startsAt: '2026-10-02T06:15:00.000Z',
      endsAt: '2026-10-02T08:15:00.000Z',
      accent: 'blue',
      mode: 'hybrid',
      tags: ['nlp', 'remote sensing'],
      status: 'scheduled',
      venue: { name: 'Theater 2', kind: 'theater', building: 'Gedung F, FILKOM UB', floor: '3' },
      roomNote: 'Third floor, next to the coffee',
      onlineNote: null,
      url: 'https://zemi.ac/events/small-models-big-questions',
      speakers: [
        { speakerId: SP.hadi, role: 'keynote', organization: 'MGM Laboratory', position: 'Head of the lab', talkTitle: 'Why we still meet on Fridays' },
        { speakerId: SP.rani, role: 'speaker', organization: 'Universitas Brawijaya', position: 'PhD candidate', talkTitle: 'Teaching tiny models to say "I don\'t know"' },
        { speakerId: SP.bima, role: 'speaker', organization: 'MGM Laboratory', position: 'Master\'s student', talkTitle: 'Counting rice fields from space' },
        { speakerId: SP.sari, role: 'moderator', organization: 'FILKOM UB', position: 'Lecturer', talkTitle: null },
      ],
      rundown: [
        { time: '13:15', endTime: '13:20', agenda: 'Doors open and welcome', note: null, speakerId: SP.sari },
        { time: '13:20', endTime: '13:30', agenda: 'Opening remarks', note: null, speakerId: SP.hadi },
        { time: '13:30', endTime: '14:00', agenda: 'Teaching tiny models to say "I don\'t know"', note: null, speakerId: SP.rani },
        { time: '14:00', endTime: '14:30', agenda: 'Counting rice fields from space', note: null, speakerId: SP.bima },
        { time: '14:30', endTime: '14:50', agenda: 'Q and A', note: 'Questions at zemi.ac/q', speakerId: SP.sari },
        { time: '14:50', endTime: '15:10', agenda: 'Coffee and networking', note: null, speakerId: null },
        { time: '15:10', endTime: '15:15', agenda: 'Group photo and wrap', note: null, speakerId: null },
      ],
      publicationIds: [PUB.p1, PUB.p2],
      registrationOpen: true,
    },
    [SAMPLE_NEXT_ID]: {
      id: SAMPLE_NEXT_ID,
      slug: 'maps-memes-and-meaning',
      number: 99,
      title: 'Maps, memes and meaning',
      summary: 'Geospatial data meets social media. Bring a map you love.',
      cover: null,
      startsAt: '2026-10-09T06:15:00.000Z',
      endsAt: '2026-10-09T08:15:00.000Z',
      accent: 'green',
      mode: 'hybrid',
      tags: ['gis'],
      status: 'scheduled',
      venue: { name: 'Classroom F2.4', kind: 'classroom', building: 'Gedung F, FILKOM UB', floor: '2' },
      roomNote: null,
      onlineNote: null,
      url: 'https://zemi.ac/events/maps-memes-and-meaning',
      speakers: [{ speakerId: SP.nadia, role: 'speaker', organization: 'Universitas Brawijaya', position: 'PhD student', talkTitle: 'Where the memes live' }],
      rundown: [],
      publicationIds: [],
      registrationOpen: true,
    },
  },
  speakers: {
    [SP.rani]: speaker(SP.rani, 'rani-kusuma', 'Rani Kusuma', 'Calibration, abstention and small language models', 'Universitas Brawijaya', 'PhD candidate', 'Rani'),
    [SP.bima]: speaker(SP.bima, 'bima-pratama', 'Bima Pratama', 'Remote sensing for food security', 'MGM Laboratory', 'Master\'s student', 'Bima'),
    [SP.sari]: speaker(SP.sari, 'sari-wulandari', 'Dr. Sari Wulandari', 'Human computer interaction', 'FILKOM UB', 'Lecturer'),
    [SP.hadi]: speaker(SP.hadi, 'hadi-santoso', 'Prof. Hadi Santoso', 'Machine learning and a lot of coffee', 'MGM Laboratory', 'Head of the lab'),
    [SP.nadia]: speaker(SP.nadia, 'nadia-putri', 'Nadia Putri', 'Computational social science', 'Universitas Brawijaya', 'PhD student', 'Nadia'),
  },
  publications: {
    [PUB.p1]: {
      id: PUB.p1,
      slug: 'calibrated-abstention-small-lms',
      type: 'conference-paper',
      typeLabel: 'Conference paper',
      title: 'Calibrated abstention for small language models under distribution shift',
      subtitle: null,
      containerTitle: 'Findings of ACL 2026',
      publishedYear: 2026,
      doi: '10.18653/v1/2026.findings-acl.412',
      cover: null,
      authors: [
        { name: 'Rani Kusuma', speakerId: SP.rani, avatar: null, organization: 'Universitas Brawijaya' },
        { name: 'Prof. Hadi Santoso', speakerId: SP.hadi, avatar: null, organization: 'MGM Laboratory' },
      ],
      keywords: ['abstention', 'calibration', 'small language models'],
      url: 'https://zemi.ac/publications/calibrated-abstention-small-lms',
    },
    [PUB.p2]: {
      id: PUB.p2,
      slug: 'rice-paddy-sentinel-2',
      type: 'journal-article',
      typeLabel: 'Journal article',
      title: 'Rice paddy segmentation from Sentinel-2 time series with weak labels',
      subtitle: null,
      containerTitle: 'Remote Sensing',
      publishedYear: 2025,
      doi: '10.3390/rs17051234',
      cover: null,
      authors: [
        { name: 'Bima Pratama', speakerId: SP.bima, avatar: null, organization: 'MGM Laboratory' },
        { name: 'Dr. Sari Wulandari', speakerId: SP.sari, avatar: null, organization: 'FILKOM UB' },
        { name: 'Ahmad Rizal', speakerId: null, avatar: null, organization: 'BRIN' },
      ],
      keywords: ['remote sensing', 'segmentation', 'agriculture'],
      url: 'https://zemi.ac/publications/rice-paddy-sentinel-2',
    },
  },
  team: {
    [TEAM.dimas]: { id: TEAM.dimas, name: 'Dimas Aditya', role: 'Host and chaos coordinator', avatar: null },
    [TEAM.ayu]: { id: TEAM.ayu, name: 'Ayu Lestari', role: 'Stream crew', avatar: null },
    [TEAM.fajar]: { id: TEAM.fajar, name: 'Fajar Nugroho', role: 'Coffee and chairs', avatar: null },
  },
  threads: {
    [TH.t1]: { id: TH.t1, title: 'How small can a model get before calibration falls apart?', excerpt: 'Asking for my 7B model that is very confident about everything.', authorLabel: 'Tegar #2231', score: 14, commentCount: 3, eventId: SAMPLE_EVENT_ID, createdAt: '2026-10-02T07:02:00.000Z' },
    [TH.t2]: { id: TH.t2, title: 'Do clouds ruin the rice counts in rainy season?', excerpt: 'Sentinel-2 in January over Java is mostly clouds.', authorLabel: 'Maya #0412', score: 9, commentCount: 1, eventId: SAMPLE_EVENT_ID, createdAt: '2026-10-02T07:10:00.000Z' },
    [TH.t3]: { id: TH.t3, title: 'Can undergrads join the reading group?', excerpt: '', authorLabel: 'Rafi #7780', score: 6, commentCount: 2, eventId: SAMPLE_EVENT_ID, createdAt: '2026-10-02T07:12:00.000Z' },
  },
  images: {},
  site: {
    name: 'Zemi',
    tagline: 'Research is lonely. Fridays aren\'t.',
    labName: 'MGM Laboratory',
    webUrl: 'https://zemi.ac',
    shortUrl: 'zemi.ac',
    qnaUrl: 'https://zemi.ac/q',
    qnaShort: 'zemi.ac/q',
    socials: [
      { kind: 'instagram', url: 'https://instagram.com/zemi.ac', label: '@zemi.ac' },
      { kind: 'youtube', url: 'https://youtube.com/@zemi', label: 'Zemi on YouTube' },
      { kind: 'website', url: 'https://labmgm.org', label: 'labmgm.org' },
    ],
    email: 'hello@zemi.ac',
    stats: { sessions: 98, talks: 187, speakers: 121, hoursOfTalk: 196 },
  },
  nextEventId: SAMPLE_NEXT_ID,
  generatedAt: '2026-10-02T05:00:00.000Z',
};

export const SAMPLE_IDS = { event: SAMPLE_EVENT_ID, next: SAMPLE_NEXT_ID, speakers: SP, publications: PUB, team: TEAM, threads: TH };

/** Refs that make each kind show something meaningful with the sample data. */
const SAMPLE_REFS: Partial<Record<BumperKind, BumperSlideInput['refs']>> = {
  'up-next': { rundown: { index: 2, time: '13:30', agenda: 'Teaching tiny models to say "I don\'t know"' } },
  mc: { speakerId: SP.sari },
  opening: { speakerId: SP.hadi },
  keynote: { speakerId: SP.hadi },
  speaker: { speakerId: SP.rani },
  paper: { publicationId: PUB.p1 },
  'talk-title': { speakerId: SP.bima },
  panel: { speakerIds: [SP.rani, SP.bima, SP.sari] },
  'thanks-speaker': { speakerId: SP.rani },
  quote: { speakerId: SP.hadi },
  'featured-question': { threadIds: [TH.t1] },
  awards: { teamMemberId: TEAM.dimas },
  credits: { teamMemberIds: [TEAM.dimas, TEAM.ayu, TEAM.fajar] },
  'next-event': { eventId: SAMPLE_NEXT_ID },
  'lower-third': { speakerId: SP.rani },
};

/** A slide of `kind` with sample refs, the template's starter items, its `sample()` content, then `extra`. */
export function sampleSlide(kind: BumperKind, extra: Partial<BumperSlideInput> = {}, id?: string): BumperSlide {
  const t = getTemplate(kind);
  const demo = t.sample?.() ?? {};
  const starter = (t.items?.starter?.() ?? []).map((it, i) => ({ id: `lab-item-${i}`, ...it }));
  return bumperSlideSchema.parse({
    id: id ?? `lab-${kind}`,
    kind,
    items: starter,
    ...demo,
    ...extra,
    refs: { ...(SAMPLE_REFS[kind] ?? {}), ...(demo.refs ?? {}), ...(extra.refs ?? {}) },
    fields: { ...(demo.fields ?? {}), ...(extra.fields ?? {}) },
    style: { ...(t.style ?? {}), ...(demo.style ?? {}), ...(extra.style ?? {}) },
    timing: { ...(t.timing ?? {}), ...(demo.timing ?? {}), ...(extra.timing ?? {}) },
  });
}

/** One slide per kind, in catalog order. */
export function sampleSlides(): BumperSlide[] {
  return BUMPER_KINDS.map((k) => sampleSlide(k));
}

/** A realistic Friday running order (what the generator would build for the sample event). */
export function sampleShow(): BumperSlide[] {
  const order: Array<[BumperKind, Partial<BumperSlideInput>?]> = [
    ['standby', { timing: { autoAdvanceSec: 20, loopToId: null } }],
    ['house-rules', { timing: { autoAdvanceSec: 15, loopToId: 'show-standby' } }],
    ['welcome'],
    ['agenda'],
    ['mc'],
    ['opening'],
    ['up-next'],
    ['speaker'],
    ['paper'],
    ['thanks-speaker'],
    ['speaker', { refs: { speakerId: SP.bima } }],
    ['paper', { refs: { publicationId: PUB.p2 } }],
    ['thanks-speaker', { refs: { speakerId: SP.bima } }],
    ['qna'],
    ['featured-question'],
    ['break'],
    ['photo'],
    ['next-event'],
    ['closing'],
  ];
  const seen = new Map<string, number>();
  return order.map(([k, extra]) => {
    const n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    return sampleSlide(k, extra, n ? `show-${k}-${n}` : `show-${k}`);
  });
}

export const SAMPLE_THEME: BumperTheme = { ...DEFAULT_BUMPER_THEME };
