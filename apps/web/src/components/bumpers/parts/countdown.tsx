'use client';

import type { CSSProperties } from 'react';
import { pad2, splitDuration, useBumperNow } from '../engine/clock';
import { fontStyle } from '../engine/fit-text';

/** Parse a countdown target: an ISO instant, or HH:mm on the given day (Jakarta), or null. */
export function countdownTarget(value: string | null | undefined, dayIso?: string | null): number | null {
  if (!value) return null;
  const v = String(value).trim();
  if (/^\d{2}:\d{2}$/.test(v)) {
    const base = dayIso ? new Date(dayIso) : new Date();
    // Jakarta is fixed UTC+7: build the day in Jakarta, then subtract 7h.
    const j = new Date(base.getTime() + 7 * 3600_000);
    const [h, m] = v.split(':').map(Number) as [number, number];
    const t = Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate(), h, m) - 7 * 3600_000;
    return t;
  }
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

export interface CountdownProps {
  /** Target instant (ms). */
  to: number | null;
  /** What to show when it reaches zero (or has no target). */
  done?: string;
  variant?: 'cells' | 'big' | 'inline';
  color?: string;
  accent?: string;
  /** Font size of the digits in canvas px. */
  size?: number;
  /** Hide hours when under an hour (default true). */
  compact?: boolean;
  style?: CSSProperties;
}

/**
 * Live countdown (server-corrected). Digits are mono so they never jitter.
 * cells: digit boxes with labels. big: one huge mm:ss. inline: small text.
 */
export function Countdown({ to, done = 'Now', variant = 'big', color, accent = '#3a6dc5', size = 220, compact = true, style }: CountdownProps) {
  const now = useBumperNow(1000, to != null);
  if (to == null) return <span style={{ ...fontStyle('display', { weight: 900, casl: 0.5 }), fontSize: size * 0.6, color, ...style }}>{done}</span>;
  const left = to - now;
  if (left <= 0) {
    return (
      <span data-countdown-done="" style={{ ...fontStyle('display', { weight: 900, casl: 0.6 }), fontSize: size * 0.7, color, lineHeight: 1, ...style }}>
        {done}
      </span>
    );
  }
  const { h, m, s } = splitDuration(left);
  const showH = !compact || h > 0;
  if (variant === 'inline') {
    return (
      <span suppressHydrationWarning style={{ ...fontStyle('mono'), fontSize: size, color, ...style }}>
        {showH ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`}
      </span>
    );
  }
  if (variant === 'cells') {
    const cells: Array<[string, string]> = [...(showH ? ([[pad2(h), 'hours']] as Array<[string, string]>) : []), [pad2(m), 'min'], [pad2(s), 'sec']];
    return (
      <div suppressHydrationWarning style={{ display: 'flex', gap: size * 0.18, alignItems: 'flex-start', color, ...style }}>
        {cells.map(([v, label], i) => (
          <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: size * 0.18 }}>
            {i > 0 ? <span style={{ ...fontStyle('mono'), fontSize: size * 0.8, lineHeight: 1.05, opacity: 0.35 }}>:</span> : null}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: size * 0.08 }}>
              <span data-count-cell="" style={{ ...fontStyle('mono', { weight: 700, tracking: 0 }), fontSize: size, lineHeight: 1, padding: `${size * 0.08}px ${size * 0.14}px`, borderRadius: size * 0.18, background: 'rgba(127,127,127,0.1)', minWidth: size * 1.3, textAlign: 'center' }}>{v}</span>
              <span style={{ ...fontStyle('mono'), fontSize: Math.max(14, size * 0.16), textTransform: 'uppercase', opacity: 0.6, color: accent }}>{label}</span>
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <span suppressHydrationWarning data-countdown="" style={{ ...fontStyle('mono', { weight: 700, tracking: -0.02 }), fontSize: size, lineHeight: 0.9, color, fontVariantNumeric: 'tabular-nums', ...style }}>
      {showH ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`}
    </span>
  );
}
