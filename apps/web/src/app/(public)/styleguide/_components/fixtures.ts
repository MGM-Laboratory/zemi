import { nextFridaySession, type Blocks, type EventCard, type ImageRef } from '@zemi/shared';

/** Real files in /public so the image pipeline can be seen without the API. */
export const cupImage: ImageRef = {
  id: 'fixture-cup',
  width: 800,
  height: 800,
  alt: 'A clay coffee cup on a saucer',
  lqip: null,
  color: '#eeeeea',
  avif: [],
  webp: [{ width: 800, url: '/models/previews/coffee-cup.webp' }],
  src: '/models/previews/coffee-cup.webp',
};

export const laptopImage: ImageRef = {
  id: 'fixture-laptop',
  width: 800,
  height: 800,
  alt: 'A clay laptop',
  lqip: null,
  color: '#ecf1fa',
  avif: [],
  webp: [{ width: 800, url: '/models/previews/laptop.webp' }],
  src: '/models/previews/laptop.webp',
};

export const ogImage: ImageRef = {
  id: 'fixture-og',
  width: 1200,
  height: 630,
  alt: 'Zemi',
  lqip: null,
  color: '#ffffff',
  avif: [],
  webp: [{ width: 1200, url: '/brand/og-default.png' }],
  src: '/brand/og-default.png',
};

export function eventFixtures(now = new Date()): { upcoming: EventCard; live: EventCard } {
  const { startsAt, endsAt } = nextFridaySession(now);
  const base: EventCard = {
    id: '00000000-0000-4000-8000-000000000001',
    slug: 'robots-that-ask-for-help',
    number: 42,
    title: 'Robots that ask for help',
    summary: 'Teaching a warehouse robot to say "I am not sure" before it drops your parcel.',
    cover: laptopImage,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    status: 'scheduled',
    isLive: false,
    venue: { name: 'Theater 2, Building F', kind: 'theater' },
    mode: 'hybrid',
    accent: 'blue',
    tags: ['robotics', 'hri'],
    speakers: [
      { id: 's1', slug: 'nadia-putri', fullName: 'Nadia Putri', nickname: 'Nad', avatar: null, organization: 'MGM Lab', role: 'speaker' },
      { id: 's2', slug: 'arif-wicaksono', fullName: 'Arif Wicaksono', nickname: null, avatar: null, organization: 'MGM Lab', role: 'speaker' },
    ],
    registrationCount: 38,
    capacity: 60,
    hasRecording: false,
  };
  const live: EventCard = {
    ...base,
    id: '00000000-0000-4000-8000-000000000002',
    slug: 'what-makes-a-good-question',
    number: 41,
    title: 'What makes a good question?',
    cover: cupImage,
    startsAt: new Date(now.getTime() - 30 * 60_000).toISOString(),
    endsAt: new Date(now.getTime() + 90 * 60_000).toISOString(),
    status: 'ongoing',
    isLive: true,
    accent: 'red',
  };
  return { upcoming: base, live };
}

const t = (text: string, styles: Record<string, unknown> = {}) => ({ type: 'text', text, styles });

/** Every BlockNote block type the renderer supports, plus one it doesn't know. */
export const blocksFixture: Blocks = [
  { id: 'h1', type: 'heading', props: { level: 1 }, content: [t('What we are trying to find out')], children: [] },
  {
    id: 'p1',
    type: 'paragraph',
    props: {},
    content: [
      t('Most robots fail '),
      t('quietly', { italic: true }),
      t('. We want ours to fail '),
      t('out loud', { bold: true }),
      t(', early, and with a '),
      t('clear question', { textColor: 'yellow' }),
      t('. Code lives in '),
      t('src/policy.py', { code: true }),
      t(', notes are '),
      { type: 'link', href: 'https://labmgm.org', content: [t('on the lab site')] },
      t(' and the '),
      { type: 'link', href: '/events', content: [t('schedule is here')] },
      t('. '),
      t('Old plan', { strike: true }),
      t(' New plan, '),
      t('underlined', { underline: true }),
      t(' and '),
      t('tinted', { backgroundColor: 'blue' }),
      t('.'),
    ],
    children: [],
  },
  { id: 'h2', type: 'heading', props: { level: 2 }, content: [t('The plan')], children: [] },
  {
    id: 'b1',
    type: 'bulletListItem',
    props: {},
    content: [t('Collect 400 near-miss clips')],
    children: [
      { id: 'b1a', type: 'bulletListItem', props: {}, content: [t('From the Friday demo floor')], children: [
        { id: 'b1a1', type: 'bulletListItem', props: {}, content: [t('With consent, obviously')], children: [] },
      ] },
      { id: 'b1b', type: 'bulletListItem', props: {}, content: [t('And from simulation')], children: [] },
    ],
  },
  { id: 'b2', type: 'bulletListItem', props: {}, content: [t('Label when a human would have asked')], children: [] },
  { id: 'n1', type: 'numberedListItem', props: {}, content: [t('Train the uncertainty head')], children: [] },
  { id: 'n2', type: 'numberedListItem', props: {}, content: [t('Ask five people to break it')], children: [] },
  { id: 'n3', type: 'numberedListItem', props: {}, content: [t('Present the messy version here')], children: [] },
  { id: 'c1', type: 'checkListItem', props: { checked: true }, content: [t('Ethics form')], children: [] },
  { id: 'c2', type: 'checkListItem', props: { checked: false }, content: [t('Pilot study')], children: [] },
  {
    id: 'q1',
    type: 'quote',
    props: {},
    content: [t('A robot that knows when to ask is more useful than one that is always sure.')],
    children: [],
  },
  { id: 'h3', type: 'heading', props: { level: 3 }, content: [t('A tiny bit of code')], children: [] },
  {
    id: 'code',
    type: 'codeBlock',
    props: { language: 'python' },
    content: [t('def should_ask(p: float, threshold=0.62) -> bool:\n    return p < threshold')],
    children: [],
  },
  {
    id: 'tbl',
    type: 'table',
    props: {},
    content: {
      type: 'tableContent',
      headerRows: 1,
      rows: [
        { cells: [{ type: 'tableCell', content: [t('Setup')], props: {} }, { type: 'tableCell', content: [t('Asks')], props: {} }, { type: 'tableCell', content: [t('Drops')], props: {} }] },
        { cells: [[t('Baseline')], [t('0')], [t('14')]] },
        { cells: [[t('Ours')], [t('9')], [t('2', { bold: true })]] },
      ],
    },
    children: [],
  },
  {
    id: 'tg',
    type: 'toggleListItem',
    props: {},
    content: [t('Why not just add more sensors?')],
    children: [{ id: 'tgp', type: 'paragraph', props: {}, content: [t('We tried. The robot got more confident, not more careful.')], children: [] }],
  },
  {
    id: 'img',
    type: 'image',
    props: { url: '/models/previews/coffee-cup.webp', caption: 'Figure 1. The coffee that powered this study.', previewWidth: 420, textAlignment: 'left' },
    children: [],
  },
  { id: 'div', type: 'divider', props: {}, children: [] },
  { id: 'file', type: 'file', props: { url: '/brand/lockup.svg', name: 'slides-v3-final-FINAL.pdf' }, children: [] },
  { id: 'unknown', type: 'alert', props: { kind: 'info' }, content: [t('An unknown block keeps its words.')], children: [] },
  { id: 'bad', type: 'paragraph', props: {}, content: [{ type: 'link', href: 'javascript:alert(1)', content: [t('A link with a bad protocol renders as text.')] }], children: [] },
];
