'use client';

import { jakartaDateInput, jakartaTimeInput, type EventAdmin } from '@zemi/shared';
import { motion, useReducedMotion } from 'motion/react';
import { useMemo } from 'react';
import { ShapeGlyph } from '@/components/admin/ui/badge';
import { cn } from '@/lib/admin/cn';
import { useMounted, useNow } from '@/lib/admin/hooks';
import { hhmmToMinutes, minutesToHhmm } from '../lib';
import type { RundownRow } from './rundown-editor';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const TONES = [
  { bg: 'bg-blue', text: 'text-white', shape: 'circle' as const },
  { bg: 'bg-red', text: 'text-white', shape: 'triangle' as const },
  { bg: 'bg-yellow', text: 'text-ink', shape: 'square' as const },
  { bg: 'bg-green', text: 'text-white', shape: 'arch' as const },
];

interface Block {
  key: string;
  start: number;
  end: number;
  label: string;
  speaker: string | null;
  lane: number;
  tone: (typeof TONES)[number];
  open: boolean;
}

/**
 * Live visual preview of the rundown: blocks on a WIB time axis, overlapping rows stacked in
 * lanes, the session window shaded, and a "now" needle while it is happening.
 */
export function RundownTimeline({
  rows,
  startMin,
  endMin,
  event,
}: {
  rows: RundownRow[];
  startMin: number;
  endMin: number;
  event: EventAdmin;
}) {
  const reduce = useReducedMotion();
  const mounted = useMounted();
  const now = useNow(30_000);

  const { blocks, lanes, min, max } = useMemo(() => {
    const valid = rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => HHMM.test(r.time))
      .map(({ r, i }) => ({
        r,
        i,
        t: hhmmToMinutes(r.time) + (hhmmToMinutes(r.time) < startMin - 360 ? 1440 : 0),
      }))
      .sort((a, b) => a.t - b.t);
    const out: Block[] = [];
    const laneEnds: number[] = [];
    valid.forEach(({ r, i, t }, k) => {
      const explicit =
        r.endTime && HHMM.test(r.endTime)
          ? hhmmToMinutes(r.endTime) + (hhmmToMinutes(r.endTime) < t ? 1440 : 0)
          : null;
      const nextT = valid[k + 1]?.t;
      const end = explicit ?? (nextT && nextT > t ? nextT : t + 10);
      let lane = laneEnds.findIndex((e) => e <= t);
      if (lane < 0) {
        lane = laneEnds.length;
        laneEnds.push(end);
      } else laneEnds[lane] = end;
      const speaker = r.speakerId
        ? (event.speakersFull.find((s) => s.id === r.speakerId)?.fullName ?? null)
        : null;
      out.push({
        key: `${i}`,
        start: t,
        end: Math.max(end, t + 5),
        label: r.agenda || 'Untitled',
        speaker,
        lane,
        tone: TONES[k % TONES.length]!,
        open: explicit == null && !nextT,
      });
    });
    const lo = Math.min(startMin, ...out.map((b) => b.start));
    const hi = Math.max(endMin, ...out.map((b) => b.end));
    return {
      blocks: out,
      lanes: Math.max(1, laneEnds.length),
      min: Math.floor(lo / 15) * 15,
      max: Math.ceil(hi / 15) * 15,
    };
  }, [rows, startMin, endMin, event.speakersFull]);

  const span = Math.max(15, max - min);
  const pct = (m: number) => ((m - min) / span) * 100;
  const ticks: number[] = [];
  for (let m = min; m <= max; m += 15) ticks.push(m);

  // "Now" needle, only on the day of the event and inside the visible range.
  const today = mounted && jakartaDateInput(now) === jakartaDateInput(event.startsAt);
  const nowMin = today ? hhmmToMinutes(jakartaTimeInput(now)) : null;
  const showNow = nowMin != null && nowMin >= min && nowMin <= max;
  const laneH = 44;

  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1" data-lenis-prevent>
      <div
        className="relative min-w-[36rem]"
        role="img"
        aria-label={
          blocks.length
            ? `Timeline preview: ${blocks.length} rows from ${minutesToHhmm(min)} to ${minutesToHhmm(max)} WIB.`
            : 'Timeline preview: empty.'
        }
      >
        {/* Track */}
        <div
          className="relative rounded-2xl bg-surface-muted"
          style={{ height: lanes * laneH + 16 }}
        >
          {/* Session window */}
          <div
            className="absolute inset-y-0 rounded-2xl border border-dashed border-line-strong bg-white"
            style={{ left: `${pct(startMin)}%`, width: `${pct(endMin) - pct(startMin)}%` }}
            aria-hidden="true"
          />
          {ticks.map((m) => (
            <span
              key={m}
              className={cn('absolute inset-y-2 w-px', m % 60 === 0 ? 'bg-line-strong' : 'bg-line')}
              style={{ left: `${pct(m)}%` }}
              aria-hidden="true"
            />
          ))}
          {blocks.map((b, i) => (
            <motion.div
              key={b.key}
              layout={!reduce}
              initial={reduce ? false : { opacity: 0, scaleX: 0.6 }}
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{
                type: 'spring',
                stiffness: 320,
                damping: 30,
                delay: reduce ? 0 : i * 0.03,
              }}
              title={`${minutesToHhmm(b.start)}${b.open ? '' : ` to ${minutesToHhmm(b.end)}`}, ${b.label}${b.speaker ? ` (${b.speaker})` : ''}`}
              className={cn(
                'absolute flex origin-left items-center gap-1.5 overflow-hidden rounded-[10px] px-2 text-[0.75rem] leading-tight font-medium shadow-[0_1px_0_rgba(14,17,22,0.08)] transition-[filter,transform] duration-150 hover:z-10 hover:-translate-y-0.5 hover:brightness-105',
                b.tone.bg,
                b.tone.text,
                b.open && 'bg-[length:8px_8px] opacity-80',
              )}
              style={{
                left: `calc(${pct(b.start)}% + 1px)`,
                width: `calc(${Math.max(pct(b.end) - pct(b.start), 1.2)}% - 2px)`,
                top: 8 + b.lane * laneH,
                height: laneH - 6,
              }}
              aria-hidden="true"
            >
              <ShapeGlyph shape={b.tone.shape} className="size-2 shrink-0 opacity-70" />
              <span className="min-w-0 truncate">{b.label}</span>
            </motion.div>
          ))}
          {showNow ? (
            <div
              className="absolute inset-y-0 z-20 w-0.5 bg-red"
              style={{ left: `${pct(nowMin!)}%` }}
              aria-hidden="true"
            >
              <span className="absolute -top-1 -left-1 size-2.5 rounded-full bg-red" />
            </div>
          ) : null}
          {!blocks.length ? (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-ink-4">
              Rows show up here as you add them.
            </p>
          ) : null}
        </div>
        {/* Axis */}
        <div className="relative mt-1.5 h-4" aria-hidden="true">
          {ticks
            .filter((m) => m % 30 === 0 || m === min || m === max)
            .map((m) => (
              <span
                key={m}
                className="mono absolute -translate-x-1/2 text-[0.6875rem] text-ink-4 tabular-nums first:translate-x-0 last:-translate-x-full"
                style={{ left: `${pct(m)}%` }}
              >
                {minutesToHhmm(m)}
              </span>
            ))}
        </div>
      </div>
    </div>
  );
}
