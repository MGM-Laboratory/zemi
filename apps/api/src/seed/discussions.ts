/** Plausible, synthetic conversations for preview. Every participant and token is disposable. */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { blocksToPlainText } from '../common/blocks.js';
import {
  discussionComments,
  discussionIdentities,
  discussionReactions,
  discussionReports,
  discussionThreads,
  discussionVotes,
} from '../db/schema.js';
import type { SeedCtx, SeededEvent } from './content.js';
import { doc, p } from './lib/blocks.js';
import { insertChunked } from './util.js';

const DAY = 86_400_000;
const NAMES = [
  'Alya', 'Bima', 'Citra', 'Dimas', 'Eka', 'Farah', 'Galih', 'Hana', 'Indra', 'Jasmine',
  'Kevin', 'Laras', 'Maya', 'Nadia', 'Omar', 'Putri', 'Rafi', 'Salsa', 'Tari', 'Umar',
  'Vina', 'Wahyu', 'Yasmin', 'Zahra', 'Adi', 'Bunga', 'Chandra', 'Dewi', 'Fajar', 'Gita',
  'Hendra', 'Intan', 'Joko', 'Kirana', 'Luthfi', 'Mira', 'Niko', 'Olivia', 'Pradipta', 'Qori',
  'Rania', 'Satria', 'Tiara', 'Utami', 'Vito', 'Wulan', 'Yoga', 'Ziva', 'Amira', 'Bagas',
  'Clara', 'Daniel', 'Elisa', 'Fikri', 'Gracia', 'Hafiz', 'Inez', 'Jihan', 'Karim', 'Laila',
  'Melati', 'Naufal', 'Oki', 'Prita', 'Rizky', 'Sekar', 'Taufik', 'Uli', 'Yudha', 'Zaki',
];

const EVENT_QUESTIONS = [
  (topic: string) => ({ title: `What should I read before ${topic}?`, body: `I am coming to this Friday's conversation and would like a little context first. Is there one paper, demo, or introductory idea you would recommend?`, tags: ['reading', 'first-timers'] }),
  (topic: string) => ({ title: `A question about the methods in ${topic}`, body: `The approach behind this talk sounds interesting. Which assumptions matter most, and what would change if the data looked different? I would love to hear how the speaker tested that.`, tags: ['methods', 'research'] }),
  (topic: string) => ({ title: `Can we try the ideas from ${topic} ourselves?`, body: `Does anyone know whether there is a small dataset, notebook, or open source example for this topic? A hands-on starting point would help me follow the discussion.`, tags: ['resources', 'hands-on'] }),
  (topic: string) => ({ title: `How does ${topic} hold up outside the lab?`, body: `I am curious about the gap between the research setting and everyday use. What failed in the field, and what would you change in a second version?`, tags: ['fieldwork', 'discussion'] }),
  (topic: string) => ({ title: `Could we discuss the limits of ${topic}?`, body: `The description raises an interesting question about where this approach stops working. I would like to hear an honest account of its limitations and possible next steps.`, tags: ['limitations', 'questions'] }),
  (topic: string) => ({ title: `Follow-up from ${topic}`, body: `I enjoyed the talk and want to keep the conversation going. Which result surprised the team most, and is there an experiment you still want to run?`, tags: ['follow-up', 'research'] }),
];

const GENERAL_QUESTIONS = [
  ['How do I join a Zemi Friday for the first time?', 'I have never been to a seminar here. Do I need to register, and is it okay to come alone? I would appreciate a quick guide from regulars.', ['first-timers', 'visiting']],
  ['Where can I find slides from previous Fridays?', 'I missed a talk and would love to catch up. Are slides or recordings collected anywhere, and how soon do they usually appear?', ['resources', 'recordings']],
  ['Can students suggest a future speaker?', 'There is a researcher whose work would fit a Friday conversation. What is the best way to suggest them to the organizers?', ['speakers', 'ideas']],
  ['What makes a good question after a talk?', 'I often have a thought but hesitate to ask it in a room full of experts. How do you frame a useful question without overthinking it?', ['questions', 'first-timers']],
  ['Is there a quiet place to take notes?', 'I am planning to attend in person and would like to write during the talk. Is the room set up for laptops, or is paper easier?', ['visiting', 'accessibility']],
  ['Do talks have an online option?', 'I am away from campus some Fridays. How can I tell which events have a stream and where the link will appear?', ['online', 'visiting']],
  ['Can I share a small work-in-progress?', 'My project is early and I would benefit from friendly feedback. Are there Friday sessions for short demos or unfinished ideas?', ['research', 'community']],
  ['How does the discussion continue after Friday?', 'The best ideas often arrive on the way home. Do people use this space to post follow-ups or reading links after a seminar?', ['discussion', 'community']],
  ['Are the seminars open to people outside the lab?', 'A friend at another department is interested in the next talk. Can they register too, and are there any attendance limits?', ['visiting', 'registration']],
  ['What should I bring to a hands-on session?', 'Some event descriptions mention workshops. Should I bring a laptop with software installed, or will everything be provided?', ['workshops', 'first-timers']],
  ['How do you choose a research question?', 'I am at the start of a thesis and have too many possible directions. What helped you narrow yours down?', ['thesis', 'research']],
  ['Where do people meet after the talk?', 'The conversation often runs past the official ending. Is there a usual place nearby where everyone gathers?', ['community', 'visiting']],
  ['How can I make a technical talk accessible?', 'I will be presenting to people from several fields. What has worked for you when explaining a specialized method to a mixed room?', ['presenting', 'accessibility']],
  ['Can recordings include captions?', 'Captions would help me revisit fast explanations and follow along in a noisy place. Are they available for past sessions?', ['accessibility', 'recordings']],
  ['What is a good way to share a paper here?', 'I found a paper related to a recent seminar. Should I post a short summary in the event thread or start a new general discussion?', ['papers', 'discussion']],
  ['How long is the Q and A usually?', 'I am trying to plan my Friday afternoon. Does the Q and A finish at the listed end time, or do questions continue informally?', ['questions', 'visiting']],
  ['Are there opportunities to volunteer?', 'I enjoy helping events run smoothly and would like to meet the community. Is there a way to help with setup or welcoming people?', ['community', 'volunteering']],
  ['What was your favorite Zemi moment?', 'I am collecting little stories from Fridays past. A surprising question, a demo that worked, or even a projector mishap all count.', ['stories', 'community']],
] as const;

const REPLIES = [
  'I had the same question. The short explanation during the Q and A helped, and I would love a link to the source as well.',
  'One useful starting point is the event description and the related papers on its page. They give enough context without needing a whole course first.',
  'I tried a small version of this idea in my own project. The hardest part was choosing a fair baseline, so I hope we can ask about that.',
  'Thanks for raising this. I would be interested in how the answer changes with a smaller dataset or a different community.',
  'This is exactly the kind of thing that makes the Friday conversation useful. I will bring it up if there is time after the talk.',
  'A practical example would help me too. Even a rough sketch of the workflow would make the methods easier to follow.',
  'I remember a related point from another Zemi. There may be a useful connection between the two sessions.',
  'I asked one of the organizers about this last week. The event page is usually the best place to check for updates.',
  'For newcomers, it is completely fine to ask a basic question. People here are usually happy to explain the context.',
];

function timeBetween(now: Date, earliest: Date, latest: Date, fraction: number): Date {
  const end = Math.min(now.getTime() - 60_000, latest.getTime());
  const start = Math.min(end, earliest.getTime());
  return new Date(start + (end - start) * fraction);
}

export async function seedDiscussions(ctx: SeedCtx, seeded: SeededEvent[]) {
  const rng = ctx.rng.fork('discussions');
  const now = ctx.now;
  type IdentityInsert = typeof discussionIdentities.$inferInsert;
  type ThreadInsert = typeof discussionThreads.$inferInsert;
  type CommentInsert = typeof discussionComments.$inferInsert;
  type VoteInsert = typeof discussionVotes.$inferInsert;
  type ReactionInsert = typeof discussionReactions.$inferInsert;
  type ReportInsert = typeof discussionReports.$inferInsert;

  // Tokens are random and discarded, so none of these fictional accounts can sign in later.
  const people: IdentityInsert[] = NAMES.map((name, index) => ({
    id: randomUUID(), name, tag: String(1000 + index * 37),
    tokenHash: createHash('sha256').update(randomBytes(32)).digest('hex'),
    createdAt: new Date('2024-08-15T03:00:00Z'),
    updatedAt: new Date(now.getTime() - DAY * rng.int(0, 3)),
  }));
  // Two matching names make the subtle #tag distinction visible in preview.
  people[60].name = 'Alya';
  people[61].name = 'Bima';

  const threads: ThreadInsert[] = [];
  const comments: CommentInsert[] = [];
  const votes: VoteInsert[] = [];
  const reactions: ReactionInsert[] = [];
  const reports: ReportInsert[] = [];
  const activeEvents = seeded.filter(e => e.plan.visibility === 'published' && !e.plan.cancelled);
  const recentEvents = activeEvents.slice(-48);
  const olderEvents = rng.sample(activeEvents.slice(0, -48), 12);
  const eventPool = [...olderEvents, ...recentEvents];

  function addThread(event: SeededEvent | null, title: string, bodyText: string, tags: readonly string[], index: number) {
    const author = rng.pick(people);
    const earliest = event?.plan.past
      ? new Date(event.plan.startsAt.getTime() - 7 * DAY)
      : new Date(now.getTime() - 9 * DAY);
    const latest = event?.plan.past
      ? new Date(event.plan.endsAt.getTime() + 12 * DAY)
      : now;
    const createdAt = timeBetween(now, earliest, latest, rng.next());
    const body = doc(p(bodyText), p(event
      ? `I am thinking about Zemi #${event.plan.number}, ${event.plan.title}. What do you think?`
      : 'Curious to hear how other people in the Zemi community see this.'));
    const id = randomUUID();
    const status: ThreadInsert['status'] = index % 43 === 0 ? 'archived' : index % 31 === 0 ? 'locked' : 'open';
    const replyCount = rng.int(2, 7);
    const threadComments: CommentInsert[] = [];
    for (let j = 0; j < replyCount; j++) {
      const commenter = rng.pick(people.filter(person => person.id !== author.id));
      const replyAt = timeBetween(now, new Date(createdAt.getTime() + 5 * 60_000), new Date(createdAt.getTime() + (j + 1) * 3 * DAY), rng.next());
      threadComments.push({
        id: randomUUID(), threadId: id, parentId: j > 1 && j % 3 === 0 ? threadComments[j - 2].id : null,
        authorId: commenter.id, authorLabel: `${commenter.name} #${commenter.tag}`,
        body: REPLIES[(index + j * 3) % REPLIES.length], createdAt: replyAt, updatedAt: replyAt,
      });
    }
    const voterPool = rng.sample(people.filter(person => person.id !== author.id), rng.int(5, 23));
    const threadVotes = voterPool.map(person => ({ identityId: person.id!, targetType: 'thread' as const, targetId: id, value: rng.chance(0.12) ? -1 : 1, createdAt }));
    const score = threadVotes.reduce((sum, vote) => sum + vote.value, 0);
    const accepted = status === 'open' && index % 4 === 0 ? threadComments[0].id : null;
    threads.push({
      id, authorId: author.id, authorLabel: `${author.name} #${author.tag}`,
      eventId: event?.id ?? null, title, body, bodyText: blocksToPlainText(body), tags: [...tags],
      status, pinned: !event && title === GENERAL_QUESTIONS[0][0], acceptedCommentId: accepted,
      score, commentCount: replyCount, createdAt, updatedAt: createdAt,
    });
    comments.push(...threadComments);
    votes.push(...threadVotes);
    for (const reply of threadComments) {
      const replyVoters = rng.sample(people.filter(person => person.id !== reply.authorId), rng.int(0, 4));
      for (const person of replyVoters) {
        const value = rng.chance(0.08) ? -1 : 1;
        votes.push({ identityId: person.id!, targetType: 'comment', targetId: reply.id!, value, createdAt: reply.createdAt });
        reply.score = (reply.score ?? 0) + value;
      }
    }
    for (const person of rng.sample(people.filter(person => person.id !== author.id), rng.int(1, 5))) {
      reactions.push({ identityId: person.id!, targetType: 'thread', targetId: id, kind: rng.pick(['curious', 'insightful', 'thanks']), createdAt });
    }
  }

  eventPool.forEach((event, eventIndex) => {
    const count = eventIndex >= olderEvents.length ? 3 : 1;
    for (let i = 0; i < count; i++) {
      const question = EVENT_QUESTIONS[(eventIndex * 2 + i) % EVENT_QUESTIONS.length](event.plan.title);
      addThread(event, question.title, question.body, [...question.tags, ...event.plan.theme.tags.slice(0, 1)], threads.length);
    }
  });
  GENERAL_QUESTIONS.forEach(([title, body, tags]) => addThread(null, title, body, tags, threads.length));

  // A small, explicit moderation queue gives the admin preview something to review.
  for (const index of [7, 38, 92, 131]) {
    const target = threads[index];
    if (!target) continue;
    const reporter = rng.pick(people.filter(person => person.id !== target.authorId));
    reports.push({ reporterId: reporter.id, targetType: 'thread', targetId: target.id!, reason: 'Needs moderator review', note: 'Preview moderation example.', status: 'open', createdAt: now });
    target.reportCount = 1;
    target.flagged = true;
  }

  await insertChunked(ctx.db, discussionIdentities, people);
  await insertChunked(ctx.db, discussionThreads, threads);
  await insertChunked(ctx.db, discussionComments, comments);
  await insertChunked(ctx.db, discussionVotes, votes);
  await insertChunked(ctx.db, discussionReactions, reactions);
  await insertChunked(ctx.db, discussionReports, reports);
  return { identities: people.length, threads: threads.length, comments: comments.length, votes: votes.length, reactions: reactions.length, reports: reports.length };
}
