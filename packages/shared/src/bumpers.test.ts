import { describe, expect, it } from 'vitest';
import { createAbility, normalizePolicy, type Principal } from './rbac.js';
import {
  bumperAutoNext,
  bumperPermissions,
  bumperSlideSchema,
  bumperStep,
  canUseBumpers,
  pickBumperTransition,
  planBumperTransitions,
  type BumperKind,
  type BumperSlide,
} from './schemas/bumpers.js';

const admin: Principal = { kind: 'admin', id: 'a1', name: 'Rani', expiresAt: null };
const EVENT = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const SP1 = '33333333-3333-4333-8333-333333333333';
const SP2 = '44444444-4444-4444-8444-444444444444';

function slide(id: string, kind: BumperKind, extra: Partial<BumperSlide> = {}): BumperSlide {
  return bumperSlideSchema.parse({ id, kind, ...extra });
}

describe('bumper RBAC', () => {
  it('stream.control implies building and running bumpers on that event only', () => {
    const a = createAbility(admin, { capabilities: [], grants: [{ type: 'event', id: EVENT, actions: ['stream.control'] }] });
    expect(bumperPermissions(a, EVENT)).toEqual(['run', 'edit']);
    expect(bumperPermissions(a, OTHER)).toEqual([]);
    expect(bumperPermissions(a, null)).toEqual([]);
    expect(canUseBumpers(a)).toBe(true);
  });

  it('show runners can run but not edit', () => {
    const a = createAbility(admin, { capabilities: [], grants: [{ type: 'event', id: EVENT, actions: ['bumpers.run'] }] });
    expect(bumperPermissions(a, EVENT)).toEqual(['run']);
    expect(a.can('event', EVENT, 'view')).toBe(true);
    expect(a.can('event', EVENT, 'stream.view')).toBe(false);
  });

  it('bumpers.manage covers standalone shows', () => {
    const a = createAbility(admin, { capabilities: ['bumpers.manage'], grants: [] });
    expect(bumperPermissions(a, null)).toEqual(['run', 'edit']);
    expect(bumperPermissions(a, OTHER)).toEqual(['run', 'edit']);
  });

  it('door crew never sees bumpers', () => {
    const a = createAbility(admin, { capabilities: [], grants: [{ type: 'event', id: EVENT, actions: ['attendance.scan', 'attendance.manage'] }] });
    expect(canUseBumpers(a)).toBe(false);
  });

  it('an unknown capability no longer wipes the policy', () => {
    const p = normalizePolicy({ capabilities: ['site.edit', 'from.the.future'], grants: [{ type: 'event', id: EVENT, actions: ['view'] }] });
    expect(p.capabilities).toEqual(['site.edit']);
    expect(p.grants).toHaveLength(1);
  });
});

describe('bumper playback order', () => {
  const slides = [slide('aaaa', 'standby', { timing: { autoAdvanceSec: 20, loopToId: null } }), slide('bbbb', 'agenda', { timing: { autoAdvanceSec: 20, loopToId: 'aaaa' } }), slide('cccc', 'welcome', { hidden: true }), slide('dddd', 'mc')];

  it('steps over hidden slides without wrapping', () => {
    expect(bumperStep(slides, 'bbbb', 1)?.id).toBe('dddd');
    expect(bumperStep(slides, 'dddd', 1)).toBeNull();
    expect(bumperStep(slides, 'aaaa', -1)).toBeNull();
    expect(bumperStep(slides, null, 1)?.id).toBe('aaaa');
    expect(bumperStep(slides, 'gone', -1)?.id).toBe('dddd');
  });

  it('auto-advance follows loops', () => {
    expect(bumperAutoNext(slides, 'aaaa')?.id).toBe('bbbb');
    expect(bumperAutoNext(slides, 'bbbb')?.id).toBe('aaaa');
  });
});

describe('transition picking', () => {
  it('is deterministic per pair and varies across pairs', () => {
    const a = slide('s-a1', 'section');
    const b = slide('s-b1', 'custom');
    const c = slide('s-c1', 'custom');
    expect(pickBumperTransition(a, b)).toBe(pickBumperTransition(a, b));
    const picks = new Set(['s1', 's2', 's3', 's4', 's5', 's6'].map((id) => pickBumperTransition(a, slide(`${id}zz`, 'custom'))));
    expect(picks.size).toBeGreaterThan(1);
    expect(pickBumperTransition(null, c)).toBe('crossfade');
  });

  it('tells stories with meaningful pairs', () => {
    expect(pickBumperTransition(slide('p1xx', 'paper'), slide('t1xx', 'thanks-speaker'))).toBe('paper-plane');
    expect(pickBumperTransition(slide('x1xx', 'speaker'), slide('q1xx', 'qna'))).toBe('q-iris');
    expect(pickBumperTransition(slide('x1xx', 'speaker'), slide('b1xx', 'break'))).toBe('coffee-pour');
    expect(pickBumperTransition(slide('x1xx', 'standby'), slide('w1xx', 'welcome'))).toBe('eyelids');
    const s1 = slide('sp1x', 'speaker', { refs: { speakerId: SP1 } });
    expect(pickBumperTransition(s1, slide('th1x', 'thanks-speaker', { refs: { speakerId: SP1 } }))).toBe('magic-move');
    expect(pickBumperTransition(slide('th1x', 'thanks-speaker', { refs: { speakerId: SP1 } }), slide('sp2x', 'speaker', { refs: { speakerId: SP2 } }))).toBe('bridge-arc');
  });

  it('respects overrides, motion levels and overlays', () => {
    const a = slide('a1xx', 'speaker');
    const b = slide('b1xx', 'qna', { transitionIn: 'stamp' });
    expect(pickBumperTransition(a, b)).toBe('stamp');
    expect(pickBumperTransition(a, b, { override: 'cut' })).toBe('cut');
    expect(pickBumperTransition(a, slide('c1xx', 'qna'), { motion: 'still' })).toBe('crossfade');
    expect(pickBumperTransition(a, slide('d1xx', 'lower-third'))).toBe('crossfade');
    const calm = pickBumperTransition(a, slide('e1xx', 'qna'), { motion: 'calm' });
    expect(['blinds', 'clock-wipe', 'halftone', 'page-turn', 'split-doors']).toContain(calm);
  });

  it('plans a whole show', () => {
    const plan = planBumperTransitions([slide('aaaa', 'standby'), slide('bbbb', 'welcome'), slide('cccc', 'qna', { hidden: true }), slide('dddd', 'closing')]);
    expect(plan).toEqual({ aaaa: 'crossfade', bbbb: 'eyelids', dddd: 'curtain-call' });
  });
});
