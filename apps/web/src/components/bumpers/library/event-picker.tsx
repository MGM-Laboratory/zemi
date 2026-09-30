'use client';

import { formatJakarta, type BumperEventPick } from '@zemi/shared';
import { ShapeGlyph } from '@/components/admin/ui/badge';
import { Combobox, type ComboOption } from '@/components/admin/ui/combobox';
import type { ControlSize } from '@/components/admin/ui/input';
import { bumpersApi } from '../api';
import { ACCENT_SHAPE } from '../engine/palette';

/** Combobox value for "no event" when a standalone show is allowed. */
export const STANDALONE = '__standalone__';

const ACCENT_TEXT = { blue: 'text-blue', red: 'text-red', yellow: 'text-yellow-600', green: 'text-green' } as const;

export type EventPickLike = Pick<BumperEventPick, 'id' | 'number' | 'title' | 'startsAt' | 'accent'> & Partial<Pick<BumperEventPick, 'canBuild' | 'status'>>;

export function eventPickLabel(e: Pick<BumperEventPick, 'number' | 'title'>): string {
  return e.number != null ? `#${e.number} ${e.title}` : e.title;
}

/** A picker option for an event. `next` marks the next Friday. */
export function eventOption(e: EventPickLike, opts: { buildableOnly?: boolean; next?: boolean } = {}): ComboOption<EventPickLike> {
  const locked = opts.buildableOnly && e.canBuild === false;
  const date = formatJakarta(e.startsAt, 'date');
  return {
    value: e.id,
    label: eventPickLabel(e),
    icon: <ShapeGlyph shape={ACCENT_SHAPE[e.accent]} className={`size-2.5 ${ACCENT_TEXT[e.accent]}`} />,
    description: locked
      ? `${date} · you can't build bumpers for this one`
      : opts.next
        ? `${date} · ${new Date(e.startsAt).getTime() <= Date.now() ? 'today' : 'next Friday'}`
        : date,
    disabled: locked,
    data: e,
  };
}

const STANDALONE_OPTION: ComboOption<EventPickLike> = {
  value: STANDALONE,
  label: 'No event (standalone)',
  icon: <ShapeGlyph shape="dot" className="size-2.5 text-ink-4" />,
  description: 'For kits you reuse any Friday, like the tech trouble cards.',
};

/** A Friday that started less than this long ago still counts as the next one (it is on right now). */
const STILL_ON_MS = 6 * 60 * 60 * 1000;
const isUpcoming = (e: { startsAt: string }, now: number) => new Date(e.startsAt).getTime() > now - STILL_ON_MS;

/**
 * The soonest upcoming (or running) Friday the principal can build for, else the most recent one
 * they can. Picks by date, whatever order the list came in.
 */
export function nextBuildable<T extends { canBuild: boolean; startsAt: string }>(list: readonly T[] | undefined): T | null {
  const now = Date.now();
  let next: T | null = null;
  let latest: T | null = null;
  for (const e of list ?? []) {
    if (!e.canBuild) continue;
    const t = new Date(e.startsAt).getTime();
    if (isUpcoming(e, now) && (!next || t < new Date(next.startsAt).getTime())) next = e;
    if (!latest || t > new Date(latest.startsAt).getTime()) latest = e;
  }
  return next ?? latest;
}

/** Loads events for the pickers, with the next buildable Friday first and marked. */
export async function loadEventOptions(q: string, signal: AbortSignal, opts: { buildableOnly?: boolean; standalone?: boolean } = {}): Promise<ComboOption<EventPickLike>[]> {
  const list = await bumpersApi.sources.events({ q: q.trim() || undefined, limit: 30 }, signal);
  const next = q.trim() ? null : nextBuildable(list);
  const nextUpcoming = next && isUpcoming(next, Date.now()) ? next : null;
  const ordered = nextUpcoming ? [nextUpcoming, ...list.filter((e) => e.id !== nextUpcoming.id)] : list;
  const options = ordered.map((e) => eventOption(e, { buildableOnly: opts.buildableOnly, next: e.id === nextUpcoming?.id }));
  const wantsStandalone = opts.standalone && (!q.trim() || /stand|none|no event|kit/i.test(q));
  return wantsStandalone ? [STANDALONE_OPTION, ...options] : options;
}

export interface EventPickerProps {
  /** Event id, STANDALONE, or null for nothing picked. */
  value: string | null;
  onChange: (value: string | null, event: EventPickLike | null) => void;
  /** Label source for a preselected event (the options load lazily). */
  selected?: EventPickLike | null;
  buildableOnly?: boolean;
  standalone?: boolean;
  clearable?: boolean;
  placeholder?: string;
  size?: ControlSize;
  className?: string;
  id?: string;
  'aria-label'?: string;
}

/** Search every Friday the principal can see; buildable ones first, soonest first. */
export function EventPicker({ value, onChange, selected, buildableOnly, standalone, clearable, placeholder = 'Pick a Friday', size, className, id, 'aria-label': ariaLabel }: EventPickerProps) {
  const selectedOption = value === STANDALONE ? STANDALONE_OPTION : selected && selected.id === value ? eventOption(selected) : null;
  return (
    <Combobox<EventPickLike>
      id={id}
      value={value}
      onValueChange={(v, o) => onChange(v, v === STANDALONE ? null : (o?.data ?? null))}
      selectedOption={selectedOption}
      loadOptions={(q, signal) => loadEventOptions(q, signal, { buildableOnly, standalone })}
      placeholder={placeholder}
      searchPlaceholder="Search by number or title"
      emptyText="No Friday matches that."
      clearable={clearable}
      size={size}
      className={className}
      aria-label={ariaLabel}
    />
  );
}
