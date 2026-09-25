'use client';

import { jakartaParts } from '@zemi/shared';
import { useMemo } from 'react';
import { useMe } from '@/lib/admin/ability';
import { cn } from '@/lib/admin/cn';
import { describeAccess, firstName } from '@/lib/admin/describe';
import { useMounted } from '@/lib/admin/hooks';
import { Character } from './characters/character';
import { ShapeGlyph } from './ui/badge';

/** "Good afternoon, Rani." in Jakarta time, with a Friday twist. */
export function useGreeting(): { hello: string; line: string } {
  const me = useMe();
  const mounted = useMounted();
  return useMemo(() => {
    const name = firstName(me.principal.name);
    if (!mounted) return { hello: `Hi, ${name}.`, line: 'Welcome to the studio.' };
    const p = jakartaParts(new Date());
    const part = p.hour < 11 ? 'Good morning' : p.hour < 15 ? 'Good afternoon' : p.hour < 19 ? 'Good evening' : 'Working late';
    const friday = p.weekday === 5;
    const line = friday
      ? p.hour < 13 || (p.hour === 13 && p.minute < 15)
        ? "It's Friday. Doors open at 13:15."
        : p.hour < 16
          ? "It's Friday. The seminar is on."
          : 'Friday is wrapping up. Nice work.'
      : p.weekday === 4
        ? 'Tomorrow is Friday. Anything left to prep?'
        : 'Here is what you can do in the studio.';
    return { hello: `${part}, ${name}.`, line };
  }, [me.principal.name, mounted]);
}

const TONE: Record<string, { shape: 'circle' | 'triangle' | 'square' | 'arch'; color: string }> = {
  superadmin: { shape: 'triangle', color: 'text-red' },
  event: { shape: 'circle', color: 'text-blue' },
  speaker: { shape: 'arch', color: 'text-green' },
  publication: { shape: 'square', color: 'text-yellow' },
  capability: { shape: 'square', color: 'text-ink-3' },
};

/**
 * The principal's effective access in plain words (from `describeAccess`). Used by the
 * overview placeholder; the real overview can keep it as a "Your access" card.
 */
export function AccessSummary({ className }: { className?: string }) {
  const me = useMe();
  const lines = useMemo(() => describeAccess(me), [me]);
  if (!lines.length) {
    return (
      <div className={cn('flex items-center gap-4 rounded-[20px] border border-dashed border-line-strong p-5', className)}>
        <Character shape="square" mood="sleep" size={48} />
        <div>
          <p className="font-semibold">No access yet.</p>
          <p className="text-sm text-ink-3">Your passphrase works, but nothing is assigned to you. Ask the superadmin to add some events or powers.</p>
        </div>
      </div>
    );
  }
  return (
    <ul className={cn('grid gap-2.5 sm:grid-cols-2', className)}>
      {lines.map((l, i) => {
        const tone = TONE[l.kind === 'grant' ? (l.resource ?? 'event') : l.kind]!;
        return (
          <li key={i} className="flex gap-3 rounded-2xl border border-line bg-white p-4">
            <span className="mt-1.5 shrink-0">
              <ShapeGlyph shape={tone.shape} className={cn('size-3', tone.color)} />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold text-ink">{l.title}</span>
              <span className="mt-0.5 block text-sm leading-snug text-ink-3">{l.detail}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
