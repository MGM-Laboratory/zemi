import {
  bumperControlInput,
  bumperSlideSchema,
  DEFAULT_BUMPER_THEME,
  pickBumperTransition,
  type BumperControlInput,
  type BumperKind,
  type BumperSlide,
  type BumperSlideInput,
} from '@zemi/shared';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../common/errors.js';
import {
  advanceDeadline,
  currentSlide,
  planAuto,
  planControl,
  planSlidesChange,
  toLiveState,
  type LivePatch,
  type LiveRow,
} from './live-logic.js';
import { parseAgent, PresenceRegistry } from './presence.js';

const NOW = new Date('2026-10-02T06:10:00.000Z'); // 13:10 WIB, a Friday
const YESTERDAY = new Date('2026-10-01T06:10:00.000Z');

const slide = (
  id: string,
  kind: BumperKind,
  extra: Omit<BumperSlideInput, 'id' | 'kind'> = {},
): BumperSlide => bumperSlideSchema.parse({ ...extra, id, kind });

/** standby -> agenda -> rules (loops to standby) -> welcome -> [hidden brb] -> speaker -> closing */
const SLIDES: BumperSlide[] = [
  slide('stby', 'standby', { timing: { autoAdvanceSec: 20 } }),
  slide('agnd', 'agenda', { timing: { autoAdvanceSec: 15 } }),
  slide('rule', 'house-rules', { timing: { autoAdvanceSec: 15, loopToId: 'stby' } }),
  slide('wlcm', 'welcome'),
  slide('brbx', 'brb', { hidden: true }),
  slide('spkr', 'speaker'),
  slide('clos', 'closing', { timing: { autoAdvanceSec: 30 } }),
];

function show(over: Partial<LiveRow> = {}): LiveRow {
  return {
    id: 'show',
    version: 4,
    slides: SLIDES,
    theme: DEFAULT_BUMPER_THEME,
    liveSlideId: 'wlcm',
    liveFromSlideId: null,
    liveTransition: null,
    liveDir: 1,
    liveMode: 'show',
    liveAutoplay: true,
    liveAdvanceAt: null,
    liveStartedAt: null,
    liveUpdatedAt: NOW,
    liveSeq: 7,
    liveCue: 0,
    liveSlideSince: null,
    liveVia: 'admin',
    liveBy: 'Rina',
    ...over,
  };
}

const input = (
  v: Partial<BumperControlInput> & { action: BumperControlInput['action'] },
): BumperControlInput => bumperControlInput.parse(v);
const applied = (s: LiveRow, patch: LivePatch | null): LiveRow => ({ ...s, ...(patch ?? {}) });
const plus = (sec: number) => new Date(NOW.getTime() + sec * 1000);

function failure(fn: () => unknown): { status: number; code: string } | null {
  try {
    fn();
    return null;
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
    return { status: err.getStatus(), code: err.code };
  }
}

describe('next and prev', () => {
  it('steps over hidden slides and never wraps', () => {
    const next = planControl(show(), input({ action: 'next' }), NOW)!;
    expect(next.liveSlideId).toBe('spkr');
    expect(next.liveFromSlideId).toBe('wlcm');
    expect(next.liveDir).toBe(1);
    const back = planControl(show({ liveSlideId: 'spkr' }), input({ action: 'prev' }), NOW)!;
    expect(back.liveSlideId).toBe('wlcm');
    expect(back.liveDir).toBe(-1);
    expect(
      planControl(
        show({ liveSlideId: 'clos', liveAdvanceAt: plus(5), liveStartedAt: NOW }),
        input({ action: 'next' }),
        NOW,
      ),
    ).toBeNull();
    expect(
      planControl(
        show({ liveSlideId: 'stby', liveAdvanceAt: plus(5), liveStartedAt: NOW }),
        input({ action: 'prev' }),
        NOW,
      ),
    ).toBeNull();
  });

  it('fromSlideId makes two clickers pressing at once move one step', () => {
    const first = planControl(show(), input({ action: 'next', fromSlideId: 'wlcm' }), NOW);
    expect(first?.liveSlideId).toBe('spkr');
    const after = applied(show(), first);
    expect(planControl(after, input({ action: 'next', fromSlideId: 'wlcm' }), NOW)).toBeNull();
    expect(planControl(after, input({ action: 'prev', fromSlideId: 'wlcm' }), NOW)).toBeNull();
    // Without fromSlideId every press counts.
    expect(planControl(after, input({ action: 'next' }), NOW)?.liveSlideId).toBe('clos');
  });

  it('the server picks the transition for the pair, and a per-change override wins', () => {
    const next = planControl(show(), input({ action: 'next' }), NOW)!;
    expect(next.liveTransition).toBe(
      pickBumperTransition(SLIDES[3], SLIDES[5], { motion: 'full' }),
    );
    expect(
      planControl(show(), input({ action: 'next', transition: 'cut' }), NOW)?.liveTransition,
    ).toBe('cut');
  });

  it('a show whose live slide is gone or hidden plays from its first slide', () => {
    expect(currentSlide(SLIDES, 'brbx')?.id).toBe('stby');
    expect(currentSlide(SLIDES, null)?.id).toBe('stby');
    expect(
      planControl(show({ liveSlideId: null }), input({ action: 'next' }), NOW)?.liveSlideId,
    ).toBe('agnd');
  });
});

describe('goto, first, last, modes', () => {
  it('goto by id or by 1-based playback position (hidden slides do not count)', () => {
    expect(planControl(show(), input({ action: 'goto', slideId: 'agnd' }), NOW)?.liveSlideId).toBe(
      'agnd',
    );
    expect(planControl(show(), input({ action: 'goto', position: 5 }), NOW)?.liveSlideId).toBe(
      'spkr',
    );
    expect(
      failure(() => planControl(show(), input({ action: 'goto', slideId: 'brbx' }), NOW)),
    ).toEqual({ status: 409, code: 'hidden' });
    expect(
      failure(() => planControl(show(), input({ action: 'goto', slideId: 'nope' }), NOW)),
    ).toEqual({ status: 404, code: 'not_found' });
    expect(failure(() => planControl(show(), input({ action: 'goto', position: 7 }), NOW))).toEqual(
      { status: 404, code: 'not_found' },
    );
    expect(failure(() => planControl(show(), input({ action: 'goto' }), NOW))).toEqual({
      status: 400,
      code: 'bad_request',
    });
  });

  it('first and last', () => {
    expect(planControl(show(), input({ action: 'first' }), NOW)?.liveSlideId).toBe('stby');
    expect(planControl(show(), input({ action: 'last' }), NOW)?.liveSlideId).toBe('clos');
  });

  it('black, clear and show only change the mode; repeats are no-ops', () => {
    const black = planControl(show(), input({ action: 'black' }), NOW)!;
    expect(black).toMatchObject({ liveMode: 'black', liveSlideId: 'wlcm' });
    expect(planControl(applied(show(), black), input({ action: 'black' }), NOW)).toBeNull();
    expect(
      planControl(applied(show(), black), input({ action: 'toggle-black' }), NOW)?.liveMode,
    ).toBe('show');
    expect(planControl(show(), input({ action: 'toggle-black' }), NOW)?.liveMode).toBe('black');
    expect(planControl(show(), input({ action: 'clear' }), NOW)?.liveMode).toBe('clear');
  });

  it('replay bumps the cue; reset goes home and clears startedAt', () => {
    expect(planControl(show({ liveCue: 2 }), input({ action: 'replay' }), NOW)?.liveCue).toBe(3);
    const reset = planControl(
      show({ liveSlideId: 'spkr', liveMode: 'black', liveAutoplay: false, liveStartedAt: NOW }),
      input({ action: 'reset' }),
      NOW,
    )!;
    expect(reset).toMatchObject({
      liveSlideId: 'stby',
      liveMode: 'show',
      liveAutoplay: true,
      liveStartedAt: null,
      liveDir: -1,
    });
    expect(reset.liveAdvanceAt).toEqual(plus(20));
  });

  it('startedAt is set by the first control of the (Jakarta) day', () => {
    expect(planControl(show(), input({ action: 'next' }), NOW)?.liveStartedAt).toEqual(NOW);
    expect(
      planControl(show({ liveStartedAt: YESTERDAY }), input({ action: 'next' }), NOW)
        ?.liveStartedAt,
    ).toEqual(NOW);
    const earlier = new Date(NOW.getTime() - 3600_000);
    expect(
      planControl(show({ liveStartedAt: earlier }), input({ action: 'next' }), NOW)?.liveStartedAt,
    ).toEqual(earlier);
  });
});

describe('auto-advance', () => {
  it('arms the clock only on screen, with autoplay, when the slide has somewhere to go', () => {
    expect(advanceDeadline(SLIDES, 'stby', 'show', true, NOW)).toEqual(plus(20));
    expect(advanceDeadline(SLIDES, 'stby', 'black', true, NOW)).toBeNull();
    expect(advanceDeadline(SLIDES, 'stby', 'show', false, NOW)).toBeNull();
    expect(advanceDeadline(SLIDES, 'wlcm', 'show', true, NOW)).toBeNull();
    // The last slide without a loop just stays.
    expect(advanceDeadline(SLIDES, 'clos', 'show', true, NOW)).toBeNull();
  });

  it('the first press on a fresh show starts its clock, even when nothing moves', () => {
    const fresh = show({ liveSlideId: 'stby' });
    expect(planControl(fresh, input({ action: 'first' }), NOW)).toEqual({
      liveAdvanceAt: plus(20),
      liveStartedAt: NOW,
      liveSlideSince: NOW,
    });
    // A clock that runs keeps its deadline; the first press of the day still stamps "running since".
    expect(
      planControl({ ...fresh, liveAdvanceAt: plus(3) }, input({ action: 'first' }), NOW),
    ).toEqual({ liveStartedAt: NOW, liveSlideSince: NOW });
    expect(
      planControl({ ...fresh, liveAdvanceAt: plus(3), liveStartedAt: NOW }, input({ action: 'first' }), NOW),
    ).toBeNull();
  });

  it('pausing clears the deadline and playing again restarts it', () => {
    const on = show({ liveSlideId: 'agnd', liveAdvanceAt: plus(4) });
    const off = planControl(on, input({ action: 'autoplay-off' }), NOW)!;
    expect(off).toMatchObject({ liveAutoplay: false, liveAdvanceAt: null });
    expect(
      planControl(applied(on, off), input({ action: 'autoplay-on' }), NOW)?.liveAdvanceAt,
    ).toEqual(plus(15));
  });

  it('moves along the loop, forwards, and re-arms for the next slide', () => {
    const due = show({ liveSlideId: 'agnd', liveAdvanceAt: NOW });
    expect(planAuto(due, NOW)).toMatchObject({
      liveSlideId: 'rule',
      liveFromSlideId: 'agnd',
      liveDir: 1,
      liveAdvanceAt: plus(15),
    });
    const loop = planAuto(show({ liveSlideId: 'rule', liveAdvanceAt: NOW }), NOW)!;
    expect(loop).toMatchObject({ liveSlideId: 'stby', liveDir: 1, liveAdvanceAt: plus(20) });
    expect(loop.liveTransition).toBe(
      pickBumperTransition(SLIDES[2], SLIDES[0], { motion: 'full' }),
    );
  });

  it('does nothing early, and drops a deadline that no longer applies', () => {
    expect(planAuto(show({ liveSlideId: 'agnd', liveAdvanceAt: plus(1) }), NOW)).toBeNull();
    expect(
      planAuto(show({ liveSlideId: 'agnd', liveAdvanceAt: NOW, liveAutoplay: false }), NOW),
    ).toEqual({ liveAdvanceAt: null });
    expect(
      planAuto(show({ liveSlideId: 'agnd', liveAdvanceAt: NOW, liveMode: 'black' }), NOW),
    ).toEqual({ liveAdvanceAt: null });
    expect(planAuto(show({ liveSlideId: 'clos', liveAdvanceAt: NOW }), NOW)).toEqual({
      liveAdvanceAt: null,
    });
  });

  it('skips a hidden loop target and goes to the next slide instead', () => {
    const slides = [
      slide('aaaa', 'standby', { timing: { autoAdvanceSec: 5, loopToId: 'hide' } }),
      slide('hide', 'agenda', { hidden: true }),
      slide('bbbb', 'welcome'),
    ];
    expect(
      planAuto(show({ slides, liveSlideId: 'aaaa', liveAdvanceAt: NOW }), NOW)?.liveSlideId,
    ).toBe('bbbb');
  });

  it('a slide that loops onto itself replays its entrance', () => {
    const slides = [
      slide('self', 'break', { timing: { autoAdvanceSec: 30, loopToId: 'self' } }),
      slide('next', 'speaker'),
    ];
    expect(
      planAuto(show({ slides, liveSlideId: 'self', liveAdvanceAt: NOW, liveCue: 4 }), NOW),
    ).toEqual({ liveCue: 5, liveSlideSince: NOW, liveAdvanceAt: plus(30) });
  });
});

describe('edits during playback', () => {
  it('moves off a deleted live slide to the slide now at its position', () => {
    const without = SLIDES.filter((s) => s.id !== 'wlcm');
    const patch = planSlidesChange(show(), without, NOW)!;
    expect(patch.liveSlideId).toBe('spkr');
    expect(patch.liveFromSlideId).toBeNull();
    // The last slide deleted while live: the new last one takes over.
    expect(
      planSlidesChange(show({ liveSlideId: 'clos' }), SLIDES.slice(0, -1), NOW)?.liveSlideId,
    ).toBe('spkr');
    expect(planSlidesChange(show(), [], NOW)).toMatchObject({
      liveSlideId: null,
      liveAdvanceAt: null,
    });
  });

  it('a live slide that gets hidden counts as gone', () => {
    const hidden = SLIDES.map((s) => (s.id === 'spkr' ? { ...s, hidden: true } : s));
    expect(planSlidesChange(show({ liveSlideId: 'spkr' }), hidden, NOW)?.liveSlideId).toBe('clos');
  });

  it('restarts or clears the clock when the live slide timing changes, and leaves it alone otherwise', () => {
    const faster = SLIDES.map((s) =>
      s.id === 'wlcm' ? { ...s, timing: { autoAdvanceSec: 3, loopToId: null } } : s,
    );
    expect(planSlidesChange(show(), faster, NOW)).toEqual({ liveAdvanceAt: plus(3) });
    const manual = SLIDES.map((s) =>
      s.id === 'agnd' ? { ...s, timing: { autoAdvanceSec: null, loopToId: null } } : s,
    );
    expect(
      planSlidesChange(show({ liveSlideId: 'agnd', liveAdvanceAt: plus(9) }), manual, NOW),
    ).toEqual({ liveAdvanceAt: null });
    const renamed = SLIDES.map((s) => (s.id === 'spkr' ? { ...s, label: 'Rani' } : s));
    expect(planSlidesChange(show(), renamed, NOW)).toBeNull();
  });
});

describe('state DTO', () => {
  it('counts playable slides only and carries serverNow and the version', () => {
    const state = toLiveState(show({ liveSlideId: 'spkr', liveAdvanceAt: plus(5) }), NOW);
    expect(state).toMatchObject({
      slideId: 'spkr',
      position: 4,
      total: 6,
      advanceAt: plus(5).toISOString(),
      serverNow: NOW.toISOString(),
      version: 4,
      seq: 7,
      via: 'admin',
    });
    expect(toLiveState(show({ slides: [] }), NOW)).toMatchObject({
      slideId: null,
      position: -1,
      total: 0,
    });
    expect(
      toLiveState(show({ liveTransition: 'not-a-transition', liveVia: 'weird' }), NOW),
    ).toMatchObject({ transition: null, via: 'system' });
  });
});

describe('presence', () => {
  it('reads OBS, Chrome, Safari and Firefox from the user agent', () => {
    expect(
      parseAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.6533.120 Safari/537.36 OBS/32.0.1',
      ),
    ).toBe('OBS 32 (Chromium 127)');
    expect(
      parseAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      ),
    ).toBe('Chrome 131');
    expect(
      parseAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
      ),
    ).toBe('Safari');
    expect(
      parseAgent('Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0'),
    ).toBe('Firefox');
    expect(parseAgent('curl/8.7.1')).toBeNull();
    expect(parseAgent(null)).toBeNull();
  });

  it('counts each client once and forgets it on disconnect', () => {
    const reg = new PresenceRegistry();
    const a = reg.add('show', {
      cid: 'obs-1',
      kind: 'output',
      obs: true,
      agent: 'OBS 32 (Chromium 127)',
    });
    const b = reg.add('show', {
      cid: 'obs-1',
      kind: 'output',
      obs: true,
      agent: 'OBS 32 (Chromium 127)',
    }); // reconnect before the old socket closed
    reg.add('show', { cid: 'dock-1', kind: 'dock', obs: true, agent: null });
    reg.add('show', { cid: null, kind: 'controller', obs: false, agent: 'Chrome 131' });
    expect(reg.snapshot('show')).toMatchObject({ outputs: 1, docks: 1, controllers: 1 });
    a();
    expect(reg.outputs('show')).toBe(1);
    b();
    expect(reg.outputs('show')).toBe(0);
    expect(reg.snapshot('other')).toEqual({ outputs: 0, docks: 0, controllers: 0, clients: [] });
  });
});
