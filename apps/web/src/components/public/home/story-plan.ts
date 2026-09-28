import { SITE_DEFAULTS } from '@zemi/shared';
import type { SceneKind, StoryBeat, StoryScene } from './types';

/**
 * Turns the admin-editable beats (site settings "home") into the scenes the home page stages.
 * Server-safe, pure.
 *
 * Rules:
 * 1. No beats saved: use the shipped defaults (the story is the page, it can't be empty).
 * 2. Beats are sorted by time. The first one at or before 13:15 is the hero's "doors open" stamp.
 *    The last one at or after 15:00 is the closing.
 * 3. Staged scenes match a beat by their default time first (so text edits never move a scene),
 *    then leftover beats fill leftover scenes in time order.
 * 4. Beats that still have no scene render as a plain stamped beat. Scenes with no beat are dropped.
 */

const STAGED: Array<{ kind: SceneKind; time: string; label: string }> = [
  { kind: 'lonely', time: '13:20', label: 'the lonely part' },
  { kind: 'loud', time: '13:30', label: 'first talk' },
  { kind: 'table', time: '14:00', label: 'same table' },
  { kind: 'question', time: '14:30', label: 'questions' },
];

const toMin = (hhmm: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return Number.NaN;
  return Number(m[1]) * 60 + Number(m[2]);
};

export const minutesOf = toMin;

const clean = (b: StoryBeat): StoryBeat => ({
  time: b.time.trim(),
  title: b.title.trim(),
  body: b.body.trim(),
});

function shortLabel(title: string): string {
  const words = title
    .replace(/[.!?]+$/g, '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const out: string[] = [];
  for (const w of words) {
    if ((out.join(' ') + ' ' + w).trim().length > 18) break;
    out.push(w);
  }
  return out.join(' ') || 'zemi';
}

export function planStory(input: StoryBeat[] | null | undefined): {
  doors: StoryBeat;
  scenes: StoryScene[];
  closing: StoryBeat;
} {
  const source = (input?.length ? input : SITE_DEFAULTS.home.beats)
    .map(clean)
    .filter((b) => Number.isFinite(toMin(b.time)) && b.title && b.time !== '14:50');
  const beats = (
    source.length ? source : SITE_DEFAULTS.home.beats.map(clean).filter((b) => b.time !== '14:50')
  ).sort((a, b) => toMin(a.time) - toMin(b.time));
  const defaults = SITE_DEFAULTS.home.beats;

  const pool = [...beats];
  const doorsIdx = pool.findIndex((b) => toMin(b.time) <= toMin('13:15'));
  const doors = doorsIdx >= 0 ? pool.splice(doorsIdx, 1)[0]! : defaults[0]!;
  const last = pool[pool.length - 1];
  const closing =
    last && toMin(last.time) >= toMin('15:00') ? pool.pop()! : defaults[defaults.length - 1]!;

  const assigned = new Map<SceneKind, StoryBeat>();
  // 1. exact time match
  for (const s of STAGED) {
    const i = pool.findIndex((b) => b.time === s.time);
    if (i >= 0) assigned.set(s.kind, pool.splice(i, 1)[0]!);
  }
  // 2. leftovers fill leftover scenes in order
  for (const s of STAGED) {
    if (assigned.has(s.kind) || !pool.length) continue;
    assigned.set(s.kind, pool.shift()!);
  }

  const scenes: StoryScene[] = [];
  for (const s of STAGED) {
    const beat = assigned.get(s.kind);
    if (beat) scenes.push({ kind: s.kind, beat, label: s.label, n: 0, id: `story-${s.kind}` });
  }
  pool.forEach((beat, i) =>
    scenes.push({
      kind: 'generic',
      beat,
      label: shortLabel(beat.title),
      n: 0,
      id: `story-beat-${i + 1}`,
    }),
  );
  scenes.sort((a, b) => toMin(a.beat.time) - toMin(b.beat.time));
  // Number the story 1, 2, 3... in order (the stamps read "1 - THE LONELY PART" and so on).
  scenes.forEach((s, i) => (s.n = i + 1));
  return { doors, scenes, closing };
}
