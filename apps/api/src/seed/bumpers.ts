/**
 * Demo bumper shows: one generated show for each of the next two published Fridays (the real
 * generator over the rows the seeder just wrote), plus a standalone "Tech trouble kit" for when the
 * mic dies. Slide ids come from the seed's Rng, so a run is repeatable; OBS keys come from
 * node:crypto like every other secret.
 */
import { randomUUID } from 'node:crypto';
import {
  bumperGenerateInput,
  bumperPlayable,
  bumperThemeSchema,
  type BumperGenerateInput,
  type BumperSlide,
  type BumperTheme,
} from '@zemi/shared';
import type { DbOrTx } from '../db/client.js';
import { bumperRevisions, bumperShows } from '../db/schema.js';
import type { BumpersDataService } from '../modules/bumpers/data.service.js';
import {
  generateShow,
  makeSlide,
  seededSlideIds,
  type IdFactory,
} from '../modules/bumpers/generator.js';
import { newShowKeys } from '../modules/bumpers/keys.js';
import type { SeedCtx, SeededEvent } from './content.js';
import { assertNoDashes } from './util.js';

/** What this seeder needs. `db` may be a transaction (the dry run rolls it back). */
export type BumperSeedCtx = Pick<SeedCtx, 'rng' | 'now' | 'crypto'> & { db: DbOrTx };

/** The standalone kit for technical hiccups: a be-right-back card, black, a 5 minute timer, the recording notice. */
export function techTroubleSlides(newId: IdFactory): BumperSlide[] {
  return [
    makeSlide(newId(), 'brb', { label: 'Mic trouble', fields: { reason: 'mic' } }),
    makeSlide(newId(), 'blank', { label: 'Black' }),
    makeSlide(newId(), 'countdown', { label: 'Back in 5', fields: { minutes: 5 } }),
    makeSlide(newId(), 'announcement', {
      label: 'Recording notice',
      fields: {
        title: 'Heads up, we are recording',
        body: 'The talk goes online for everyone who could not make it. Rather stay off camera? The back rows are yours.',
        sticker: 'rec',
      },
    }),
  ];
}

export async function seedBumpers(
  ctx: BumperSeedCtx,
  seeded: SeededEvent[],
  data: BumpersDataService,
): Promise<{ shows: number; slides: number; revisions: number }> {
  const rng = ctx.rng.fork('bumpers');
  const newId = seededSlideIds(() => rng.next());
  const upcoming = seeded
    .filter((e) => e.plan.visibility === 'published' && !e.plan.cancelled && !e.plan.past)
    .sort((a, b) => a.plan.startsAt.getTime() - b.plan.startsAt.getTime())
    .slice(0, 2);

  type Planned = {
    title: string;
    eventId: string | null;
    origin: 'generated' | 'starter';
    theme: BumperTheme;
    slides: BumperSlide[];
  };
  const shows: Planned[] = [];
  // The first Friday gets the defaults; the second shows off the credits roll and Q and A after each talk.
  const options: Array<Partial<BumperGenerateInput>> = [{}, { credits: true, qna: 'after-each' }];
  for (const [i, event] of upcoming.entries()) {
    const source = await data.generatorSource(event.id, ctx.now);
    if (!source) continue;
    const input = bumperGenerateInput.parse({ eventId: event.id, ...options[i] });
    const show = generateShow(input, source, { newId });
    shows.push({
      title: show.title,
      eventId: event.id,
      origin: 'generated',
      theme: show.theme,
      slides: show.slides,
    });
  }
  shows.push({
    title: 'Tech trouble kit',
    eventId: null,
    origin: 'starter',
    theme: bumperThemeSchema.parse({ accent: 'blue' }),
    slides: techTroubleSlides(newId),
  });

  let slides = 0;
  for (const show of shows) {
    assertNoDashes(`bumper show ${show.title}`, show);
    const id = randomUUID();
    const [row] = await ctx.db
      .insert(bumperShows)
      .values({
        id,
        title: show.title,
        eventId: show.eventId,
        origin: show.origin,
        theme: show.theme,
        slides: show.slides,
        ...newShowKeys((plain, aad) => ctx.crypto.encrypt(plain, aad), id),
        keysRotatedAt: ctx.now,
        liveSlideId: bumperPlayable(show.slides)[0]?.id ?? null,
        liveUpdatedAt: ctx.now,
        createdBy: 'superadmin',
        createdByName: 'Superadmin',
        updatedBy: 'superadmin',
        updatedByName: 'Superadmin',
        createdAt: ctx.now,
        updatedAt: ctx.now,
      })
      .returning();
    await ctx.db.insert(bumperRevisions).values({
      showId: row.id,
      version: row.version,
      title: row.title,
      theme: row.theme,
      slides: row.slides,
      reason: show.origin === 'generated' ? 'generate' : 'save',
      createdBy: 'superadmin',
      createdByName: 'Superadmin',
      createdAt: ctx.now,
    });
    slides += show.slides.length;
  }
  return { shows: shows.length, slides, revisions: shows.length };
}
