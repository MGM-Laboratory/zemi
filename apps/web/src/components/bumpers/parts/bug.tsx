'use client';

import { jakartaTimeInput } from '@zemi/shared';
import { useBumperNow } from '../engine/clock';
import { fontStyle } from '../engine/fit-text';
import type { SlideColors } from '../engine/palette';
import { StaticMark } from './shapes';

/** Corner bug: the Zemi mark, "zemı" and the event number. Sits in the title-safe corner. */
export function Bug({ colors, number, corner = 'top-left' }: { colors: SlideColors; number: number | null; corner?: 'top-left' | 'bottom-left' }) {
  const top = corner === 'top-left';
  return (
    <div data-bug="" style={{ position: 'absolute', left: 64, top: top ? 48 : undefined, bottom: top ? undefined : 44, display: 'flex', alignItems: 'center', gap: 14, zIndex: 40, color: colors.fg }} aria-hidden="true">
      <div style={{ width: 44, height: 44 }}>
        <StaticMark tone={colors.bg === '#f7bf33' ? 'ink' : 'color'} />
      </div>
      <span style={{ ...fontStyle('display', { weight: 900, casl: 0.35, tracking: -0.04 }), fontSize: 34, lineHeight: 1 }}>zemı</span>
      {number != null ? <span style={{ ...fontStyle('mono'), fontSize: 20, opacity: 0.7, marginLeft: 4 }}>#{number}</span> : null}
    </div>
  );
}

/** Corner clock in WIB. */
export function CornerClock({ colors }: { colors: SlideColors }) {
  const now = useBumperNow(1000);
  return (
    <div data-corner-clock="" style={{ position: 'absolute', right: 64, top: 52, zIndex: 40, color: colors.fg, ...fontStyle('mono'), fontSize: 26, display: 'flex', gap: 10, alignItems: 'baseline' }} aria-hidden="true">
      <span suppressHydrationWarning>{jakartaTimeInput(new Date(now))}</span>
      <span style={{ fontSize: 16, opacity: 0.6 }}>WIB</span>
    </div>
  );
}
