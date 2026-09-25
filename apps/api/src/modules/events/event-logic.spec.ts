import { describe, expect, it } from 'vitest';
import {
  cleanTags,
  eventStatus,
  firstFreeFriday,
  nextAccent,
  recordingChapters,
  registrationInfo,
  sessionOn,
  shiftToDate,
  sortRundown,
  streamPublic,
  upcomingFridays,
  type RegistrationRuleInput,
} from './event-logic.js';

// Fri 2 Oct 2026, 13:15 to 15:15 WIB
const START = new Date('2026-10-02T06:15:00.000Z');
const END = new Date('2026-10-02T08:15:00.000Z');
const before = new Date('2026-10-01T03:00:00.000Z');
const during = new Date('2026-10-02T07:00:00.000Z');
const after = new Date('2026-10-02T09:00:00.000Z');

const ev = (over: Partial<RegistrationRuleInput> = {}): RegistrationRuleInput => ({
  registrationOpen: true,
  cancelledAt: null,
  startsAt: START,
  endsAt: END,
  registrationClosesAt: null,
  capacity: null,
  mode: 'hybrid',
  ...over,
});

const DASHES = new RegExp(String.raw`[\u2013\u2014]`);
const noDashes = (s: string | null) => expect(s ?? '').not.toMatch(DASHES);

describe('eventStatus', () => {
  it('follows the shared rules with the stream state joined in', () => {
    expect(eventStatus(ev(), null, before)).toBe('scheduled');
    expect(eventStatus(ev(), undefined, during)).toBe('ongoing');
    expect(eventStatus(ev(), 'idle', after)).toBe('past');
    // Running long on stream: still ongoing after endsAt.
    expect(eventStatus(ev(), 'live', after)).toBe('ongoing');
    // Live early (before startsAt) counts as ongoing too.
    expect(eventStatus(ev(), 'live', before)).toBe('ongoing');
    expect(eventStatus(ev({ cancelledAt: before }), 'live', during)).toBe('cancelled');
  });
});

describe('registrationInfo', () => {
  it('is open for a scheduled event with room, and counts spots left', () => {
    expect(registrationInfo(ev({ capacity: 40 }), 12, before)).toEqual({
      open: true,
      closesAt: null,
      spotsLeft: 28,
      reason: null,
    });
    expect(registrationInfo(ev(), 500, before)).toMatchObject({ open: true, spotsLeft: null });
  });

  it('stays open while the event is happening, and closes at endsAt even if the stream runs long', () => {
    expect(registrationInfo(ev(), 3, during).open).toBe(true);
    expect(registrationInfo(ev(), 3, after).open).toBe(false);
  });

  it('is never open for a draft', () => {
    const draft = registrationInfo(ev({ visibility: 'draft' }), 0, before);
    expect(draft.open).toBe(false);
    expect(draft.reason).toMatch(/isn't open/);
    expect(registrationInfo(ev({ visibility: 'unlisted' }), 0, before).open).toBe(true);
  });

  it('closes for cancelled, past, switched off, past deadline and full, in that order', () => {
    const cancelled = registrationInfo(
      ev({ cancelledAt: before, registrationOpen: false, capacity: 1 }),
      5,
      before,
    );
    expect(cancelled.open).toBe(false);
    expect(cancelled.reason).toMatch(/cancelled/i);

    const past = registrationInfo(ev({ registrationOpen: false }), 0, after);
    expect(past.open).toBe(false);
    expect(past.reason).toMatch(/wrap/i);

    const off = registrationInfo(ev({ registrationOpen: false }), 0, before);
    expect(off.open).toBe(false);
    expect(off.reason).toMatch(/aren't open/i);

    const deadline = new Date('2026-10-01T02:00:00.000Z'); // Thu 1 Oct 09:00 WIB
    const late = registrationInfo(ev({ registrationClosesAt: deadline }), 0, before);
    expect(late).toMatchObject({ open: false, closesAt: deadline.toISOString() });
    expect(late.reason).toBe('Sign ups closed on Thu, 1 Oct 2026, 09:00 WIB.');

    const full = registrationInfo(ev({ capacity: 30 }), 30, before);
    expect(full).toMatchObject({ open: false, spotsLeft: 0 });
    expect(full.reason).toMatch(/livestream/);
    const fullOffline = registrationInfo(ev({ capacity: 30, mode: 'offline' }), 31, before);
    expect(fullOffline.spotsLeft).toBe(0);
    expect(fullOffline.reason).not.toMatch(/livestream/);

    for (const r of [cancelled, past, off, late, full, fullOffline]) noDashes(r.reason);
  });

  it('is still open right before the deadline', () => {
    const deadline = new Date(before.getTime() + 60_000);
    expect(registrationInfo(ev({ registrationClosesAt: deadline }), 0, before)).toMatchObject({
      open: true,
      closesAt: deadline.toISOString(),
    });
  });
});

describe('recordingChapters', () => {
  const rundown = [
    { time: '13:15', agenda: 'Doors and coffee' },
    { time: '14:30', agenda: 'Q&A' },
    { time: '13:30', agenda: 'Talk: robots that fold laundry' },
    { time: '13:30', agenda: 'Duplicate slot' },
    { time: '15:00', agenda: 'Wrap up' },
  ];

  it('computes second offsets from the session start and skips negative ones', () => {
    // Stream went live at 13:20:30 WIB.
    const session = { startedAt: new Date('2026-10-02T06:20:30.000Z') };
    expect(recordingChapters(rundown, session, START)).toEqual([
      { title: 'Talk: robots that fold laundry', startSec: 570 },
      { title: 'Q&A', startSec: 4170 },
      { title: 'Wrap up', startSec: 5970 },
    ]);
  });

  it('keeps an item that starts exactly at the recording start and drops ones past the end', () => {
    const session = { startedAt: new Date('2026-10-02T06:15:00.000Z'), durationSec: 4500 };
    // 75 minutes long: ends at 14:30 WIB, so Q&A (exactly at the end) and the wrap up are dropped.
    expect(recordingChapters(rundown, session, START)).toEqual([
      { title: 'Doors and coffee', startSec: 0 },
      { title: 'Talk: robots that fold laundry', startSec: 900 },
    ]);
  });

  it('anchors times to the event day in Jakarta, even for a UTC-previous-day start', () => {
    // 07:00 WIB on 2 Oct is 00:00 UTC on 2 Oct; 06:30 WIB is 23:30 UTC on 1 Oct.
    const early = { startsAt: new Date('2026-10-01T23:30:00.000Z') };
    const items = [
      { time: '06:30', agenda: 'Opening' },
      { time: '07:00', agenda: 'Main' },
    ];
    expect(recordingChapters(items, { startedAt: early.startsAt }, early.startsAt)).toEqual([
      { title: 'Opening', startSec: 0 },
      { title: 'Main', startSec: 1800 },
    ]);
  });

  it('returns nothing for an empty rundown or a recording on another day', () => {
    expect(recordingChapters([], { startedAt: START }, START)).toEqual([]);
    const nextDay = { startedAt: new Date('2026-10-03T06:15:00.000Z') };
    expect(recordingChapters(rundown, nextDay, START)).toEqual([]);
  });
});

describe('streamPublic', () => {
  it('only exposes the HLS url while live', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    expect(streamPublic(null, id, 'http://api.test/')).toEqual({
      state: 'idle',
      ingestOnline: false,
      liveStartedAt: null,
      hlsUrl: null,
      viewers: 0,
    });
    expect(
      streamPublic(
        { state: 'preview', ingestOnline: true, liveStartedAt: null },
        id,
        'http://api.test',
      ).hlsUrl,
    ).toBeNull();
    const live = streamPublic(
      { state: 'live', ingestOnline: false, liveStartedAt: START },
      id,
      'http://api.test',
    );
    expect(live).toMatchObject({
      state: 'live',
      ingestOnline: false,
      liveStartedAt: START.toISOString(),
      hlsUrl: `http://api.test/api/v1/public/live/${id}/index.m3u8`,
    });
  });
});

describe('Fridays', () => {
  it('lists the next Fridays in Jakarta', () => {
    // Fri 25 Sep 2026, 23:15 WIB: today's session is over, so the list starts next week.
    const now = new Date('2026-09-25T16:15:00.000Z');
    expect(upcomingFridays(now, 3)).toEqual(['2026-10-02', '2026-10-09', '2026-10-16']);
    // Fri 2 Oct 09:00 WIB: today still counts.
    expect(upcomingFridays(new Date('2026-10-02T02:00:00.000Z'), 1)).toEqual(['2026-10-02']);
  });

  it('finds the first Friday without an event', () => {
    const now = new Date('2026-09-25T16:15:00.000Z');
    expect(firstFreeFriday(new Set(), now)).toBe('2026-10-02');
    expect(firstFreeFriday(new Set(['2026-10-02', '2026-10-09']), now)).toBe('2026-10-16');
  });

  it('builds sessions on a date and falls back on bad times', () => {
    expect(sessionOn('2026-10-02')).toEqual({ startsAt: START, endsAt: END });
    expect(sessionOn('2026-10-02', '14:00', '13:00')).toEqual({
      startsAt: new Date('2026-10-02T07:00:00.000Z'),
      endsAt: new Date('2026-10-02T09:00:00.000Z'),
    });
    expect(sessionOn('2026-10-02', 'nope', '25:00')).toEqual({ startsAt: START, endsAt: END });
  });

  it('shifts an event to another date keeping wall time and length', () => {
    const src = {
      startsAt: new Date('2026-10-02T07:00:00.000Z'),
      endsAt: new Date('2026-10-02T09:30:00.000Z'),
    };
    const moved = shiftToDate(src, '2026-10-16');
    expect(moved.startsAt.toISOString()).toBe('2026-10-16T07:00:00.000Z');
    expect(moved.endsAt.toISOString()).toBe('2026-10-16T09:30:00.000Z');
    expect(moved.deltaMs).toBe(14 * 86_400_000);
  });
});

describe('small helpers', () => {
  it('rotates accents in brand order', () => {
    expect(nextAccent(null)).toBe('blue');
    expect(nextAccent('blue')).toBe('yellow');
    expect(nextAccent('yellow')).toBe('red');
    expect(nextAccent('red')).toBe('green');
    expect(nextAccent('green')).toBe('blue');
  });

  it('sorts the rundown by time, then end time, stable', () => {
    const items = [
      { time: '14:00', endTime: null, agenda: 'b' },
      { time: '13:15', endTime: '13:30', agenda: 'a2' },
      { time: '13:15', endTime: '13:20', agenda: 'a1' },
      { time: '14:00', endTime: null, agenda: 'c' },
    ];
    expect(sortRundown(items).map((i) => i.agenda)).toEqual(['a1', 'a2', 'b', 'c']);
  });

  it('cleans tags', () => {
    expect(cleanTags([' AI ', 'ai', '', 'Robots', 'robots '])).toEqual(['AI', 'Robots']);
  });
});
