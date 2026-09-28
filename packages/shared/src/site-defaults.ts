import type { Blocks } from './schemas/common.js';
import type { SiteSettings } from './schemas/site.js';

/**
 * Rich, ready-to-publish defaults for every site settings section. Owned by the site workstream.
 *
 * The zod schemas in `schemas/site.ts` keep thin defaults (empty arrays) so parsing stays predictable.
 * These are what a fresh Zemi shows before anyone edits a thing:
 * - the API merges a stored value over these (shallow: a stored array replaces the default array, so
 *   an admin who clears the beats keeps them cleared),
 * - the web can use them as its "API is down" fallback,
 * - the seeder writes them to the database.
 *
 * House rules apply: casual English, short sentences, no em or en dashes.
 */

let blockSeq = 0;
const bid = () => `site-default-${(++blockSeq).toString(36)}`;

type Styles = { bold?: true; italic?: true };
type Inline = string | { text: string; styles?: Styles };

function inline(parts: Inline[]) {
  return parts.map((p) => (typeof p === 'string' ? { type: 'text', text: p, styles: {} } : { type: 'text', text: p.text, styles: p.styles ?? {} }));
}

const props = { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' };

function paragraph(...parts: Inline[]) {
  return { id: bid(), type: 'paragraph', props: { ...props }, content: inline(parts), children: [] };
}
function heading(text: string, level: 2 | 3 = 2) {
  return { id: bid(), type: 'heading', props: { ...props, level }, content: inline([text]), children: [] };
}
function quote(text: string) {
  return { id: bid(), type: 'quote', props: { textColor: 'default', backgroundColor: 'default' }, content: inline([text]), children: [] };
}
function bullet(...parts: Inline[]) {
  return { id: bid(), type: 'bulletListItem', props: { ...props }, content: inline(parts), children: [] };
}

const ABOUT_STORY: Blocks = [
  heading('How it started'),
  paragraph(
    'Zemi started as a Friday habit at ',
    { text: 'MGM Laboratory', styles: { bold: true } },
    '. A few postgrads kept running into the same problem: months of work that nobody outside their supervisor had ever seen. So we booked a classroom, bought too much coffee, and took turns talking about research that was not finished yet.',
  ),
  paragraph(
    'The rule was simple and it still is: bring the messy version. Half-trained models, a survey with twelve responses, a proof that only works on Tuesdays. The point is to say it out loud while it can still change.',
  ),
  heading('What a Friday looks like'),
  paragraph(
    'Doors open at 13:15. One to three people present, usually 20 to 40 minutes each. Then the room asks questions, some polite, some that make the speaker open a new notebook. We wrap by 15:15 and the coffee table does the rest.',
  ),
  bullet({ text: 'Hybrid by default. ', styles: { bold: true } }, 'Sit in the room or watch the livestream. Questions from both count.'),
  bullet({ text: 'Recorded. ', styles: { bold: true } }, 'Most sessions go up on the talk page afterwards, with chapters.'),
  bullet({ text: 'Free. ', styles: { bold: true } }, 'Always. Registration just helps us pick a room that fits.'),
  quote('Nobody expects slides to be perfect. We expect questions.'),
  heading('Who keeps it running'),
  paragraph(
    'A small crew of students and staff at MGM Laboratory. We book the rooms, fight the projector, run the stream and keep the coffee coming. If you want to help, we would love that. Say hi on the contact page.',
  ),
];

export const SITE_DEFAULTS: SiteSettings = {
  general: {
    siteName: 'Zemi',
    tagline: 'The Friday seminar for half-finished research.',
    labName: 'MGM Laboratory',
    labUrl: 'https://labmgm.org',
    defaultWeekday: 5,
    defaultStart: '13:15',
    defaultEnd: '15:15',
    defaultVenueId: null,
    defaultCapacity: 80,
    announcement: { active: false, text: '', href: null },
    footerNote: 'Made with too much coffee at MGM Lab.',
  },
  seo: {
    title: 'Zemi, the Friday seminar',
    description:
      'Every Friday at 13:15 WIB, postgrads share research in progress. Undergrads welcome. Free, hybrid, a little chaotic.',
    ogImageAssetId: null,
    keywords: [
      'research seminar',
      'postgraduate research',
      'MGM Laboratory',
      'Friday seminar',
      'hybrid seminar',
      'livestream',
      'computer science',
      'Indonesia',
    ],
  },
  home: {
    heroEyebrow: 'Friday, FILKOM UB',
    heroTitle: 'Bring your half-finished research.',
    heroBody:
      'Every Friday we pull up chairs and talk about the stuff that is not done yet. Master’s, PhD, undergrads. Same table.',
    heroPrimaryCta: 'Save me a seat',
    heroSecondaryCta: 'What happens here?',
    beats: [
      {
        time: '13:15',
        title: 'Doors open.',
        body: 'Chairs scrape. Someone fights the projector. The coffee is still too hot to drink. Grab any seat, there is no wrong row.',
      },
      {
        time: '13:20',
        title: 'Research gets lonely.',
        body: 'Most weeks it is you, a laptop and a model that refuses to converge. Nobody else has read your related work. That is normal. It is also exactly why this room exists.',
      },
      {
        time: '13:30',
        title: 'We say it out loud.',
        body: 'Someone stands up with slides that are not done yet. That is the point. Saying an idea to a room is the fastest way to find out what it actually is.',
      },
      {
        time: '14:00',
        title: 'Master’s, PhD, undergrad, same table.',
        body: 'No titles at the door. A first year undergrad can ask the question a PhD forgot to ask. It happens more often than you would think.',
      },
      {
        time: '14:30',
        title: 'Someone asks the question.',
        body: 'You know the one. The speaker pauses, laughs, and opens a new notebook. We clap for those. They are the whole reason we meet.',
      },
      {
        time: '14:50',
        title: 'Coffee, the good part.',
        body: 'Half the collaborations here started next to the coffee table. Bring your curiosity, maybe a business card. There are snacks, usually.',
      },
      {
        time: '15:15',
        title: 'See you next Friday.',
        body: 'We wrap on time, mostly. The recording goes up, the slides get shared, and next Friday is already on the calendar.',
      },
    ],
    statsEnabled: true,
    funStat: '1 coffee machine we keep blaming',
    featuredEventId: null,
    closingTitle: 'See you Friday.',
    closingBody: 'Same time. Maybe a different room. Always free.',
  },
  about: {
    title: 'A room for research that is still figuring itself out.',
    intro:
      'Zemi is a weekly seminar run by MGM Laboratory. Every Friday from 13:15 to 15:15 WIB, Master’s and PhD students share research in progress, undergrads see what research looks like from the inside, and everyone gets better at asking questions. It happens in a classroom or a theater on campus and on the livestream at the same time. It is free, it is friendly, and nobody is grading you.',
    story: ABOUT_STORY,
    pillars: [
      {
        title: 'The question',
        shape: 'circle',
        body: 'Every talk starts with one. Ask it early, ask it badly, ask it anyway. Good research is mostly good questions that got a little braver.',
      },
      {
        title: 'The hunch',
        shape: 'triangle',
        body: 'The half-formed idea you are not sure about yet. Bring it before it is polished. Hunches get sharper when other people poke at them.',
      },
      {
        title: 'The data',
        shape: 'square',
        body: 'The solid stuff: results, plots, the table that finally worked. And the one that did not. Negative results are welcome at this table.',
      },
      {
        title: 'The bridge',
        shape: 'arch',
        body: 'The conversation that connects a question to the data. It usually happens during Q and A, by the coffee, or in the hallway after.',
      },
    ],
    audiences: [
      {
        title: 'Master’s and PhD students',
        body: 'Present your progress, rehearse your defense, get feedback before your supervisor sees the draft. Messy is expected.',
      },
      {
        title: 'Undergrads',
        body: 'See what research actually looks like from the inside. Ask anything. Some of our best questions come from the back row.',
      },
      {
        title: 'Lecturers and researchers',
        body: 'Drop by, share what your group is working on, meet students you might want to work with. Your feedback matters more than you think.',
      },
      {
        title: 'Industry folks and alumni',
        body: 'Tell us which problems you are stuck on. We will tell you which ones we are stuck on. Sometimes they match.',
      },
    ],
    presentSteps: [
      {
        title: 'Say hi',
        body: 'Send us a message with a working title. It does not need to be final. Most titles change three times anyway.',
      },
      {
        title: 'Pick a Friday',
        body: 'We find a slot that fits your timeline. Right before a conference deadline is popular. So is right after a rejection.',
      },
      {
        title: 'Make rough slides',
        body: 'Anywhere from 20 to 40 minutes, your call. Unfinished is fine. We care about the question more than the polish.',
      },
      {
        title: 'Talk, then listen',
        body: 'Present, take the questions, write down the good ones. The Q and A is where most of the useful stuff happens.',
      },
      {
        title: 'Get the recording',
        body: 'The session is recorded and goes up on your talk page, with your slides if you want. Handy for your portfolio and your mom.',
      },
    ],
    presentCta: 'I want to present',
  },
  contact: {
    title: 'Say hi.',
    intro:
      'Want to present, collaborate, or just ask something? Drop us a line. A real human reads every message, usually within two working days.',
    email: 'zemi@labmgm.org',
    whatsapp: null,
    address: 'MGM Laboratory, Faculty of Computer Science, Kampus Depok, West Java 16424, Indonesia',
    mapsUrl: '',
    officeHours: 'Weekdays, 09:00 to 16:00 WIB',
    socials: [{ kind: 'website', url: 'https://labmgm.org', label: 'MGM Laboratory' }],
    topics: ['I want to present', 'Collaboration', 'A question', 'Something else'],
    notifyEmails: [],
  },
  email: {
    replyTo: null,
    senderName: 'Zemi',
    signature: 'See you Friday,\nThe Zemi crew',
    sendReminders: true,
    sendStartingNow: true,
    sendThankYou: true,
  },
};
