import { describe, expect, it } from 'vitest';
import { HOLIDAY_FRIDAYS } from './data/events.js';
import { SPEAKERS } from './data/speakers.js';
import { Rng } from './lib/rng.js';
import type { ManifestItem } from './media.js';
import { UPCOMING_FRIDAYS, planEvents, rundownFor } from './plan.js';

const covers: ManifestItem[] = Array.from({ length: 30 }, (_, i) => ({
  id: `cover-${i}`,
  path: `covers/cover-${i}.jpg`,
  type: 'image',
  mime: 'image/jpeg',
  bytes: 1,
  accent: (['blue', 'yellow', 'red', 'green'] as const)[i % 4],
}));

// Friday 25 Sep 2026, 21:00 WIB: that afternoon's session is over.
const NOW = new Date('2026-09-25T14:00:00Z');
const plan = planEvents(new Rng(20240906), NOW, covers, SPEAKERS);

describe('planEvents', () => {
  it('runs every Friday from 6 Sep 2024, minus holidays, to 8 Fridays after today', () => {
    expect(plan[0].date).toBe('2024-09-06');
    expect(plan.every((e) => new Date(`${e.date}T00:00:00Z`).getUTCDay() === 5)).toBe(true);
    expect(plan.some((e) => HOLIDAY_FRIDAYS[e.date])).toBe(false);
    expect(plan.filter((e) => e.upcomingIndex !== null)).toHaveLength(UPCOMING_FRIDAYS);
    expect(plan.at(-1)!.date).toBe('2026-11-20');
    expect(plan.map((e) => e.number)).toEqual(plan.map((_, i) => i + 1));
  });

  it('treats today as past once 15:15 WIB is gone', () => {
    const today = plan.find((e) => e.date === '2026-09-25')!;
    expect(today.past).toBe(true);
    expect(today.startsAt.toISOString()).toBe('2026-09-25T06:15:00.000Z');
    expect(today.endsAt.toISOString()).toBe('2026-09-25T08:15:00.000Z');
  });

  it('has one cancelled past event, one upcoming unlisted and two upcoming drafts', () => {
    expect(plan.filter((e) => e.cancelled).map((e) => e.past)).toEqual([true]);
    expect(plan.filter((e) => e.visibility === 'unlisted').map((e) => e.upcomingIndex !== null)).toEqual([true]);
    expect(plan.filter((e) => e.visibility === 'draft').map((e) => e.upcomingIndex !== null)).toEqual([true, true]);
  });

  it('gives every event 1 to 3 distinct speakers', () => {
    for (const e of plan) {
      expect(e.talks.length).toBeGreaterThanOrEqual(1);
      expect(e.talks.length).toBeLessThanOrEqual(3);
      expect(new Set(e.talks.map((t) => t.speakerKey)).size).toBe(e.talks.length);
    }
  });

  it('is reproducible with the same seed', () => {
    const again = planEvents(new Rng(20240906), NOW, covers, SPEAKERS);
    expect(again.map((e) => [e.title, e.venueKey, e.talks.map((t) => t.speakerKey)])).toEqual(plan.map((e) => [e.title, e.venueKey, e.talks.map((t) => t.speakerKey)]));
  });
});

describe('rundownFor', () => {
  it('starts at 13:15, wraps at 15:15 and has one slot per talk', () => {
    for (const e of plan.slice(0, 12)) {
      const items = rundownFor(e);
      expect(items[0].time).toBe('13:15');
      expect(items.at(-1)!.time).toBe('15:15');
      expect(items.filter((i) => i.speakerKey).length).toBe(e.talks.length);
      const times = items.map((i) => i.time);
      expect([...times].sort()).toEqual(times);
    }
  });
});
