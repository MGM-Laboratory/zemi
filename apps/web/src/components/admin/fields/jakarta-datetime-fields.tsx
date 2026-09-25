'use client';

import { DEFAULT_SESSION, formatJakarta, fromJakartaInput, jakartaDateInput, jakartaParts, jakartaTimeInput, nextFridaySession } from '@zemi/shared';
import { useId, useMemo, useState } from 'react';
import { cn } from '@/lib/admin/cn';
import { useMounted } from '@/lib/admin/hooks';
import { Input } from '../ui/input';
import { useReadOnly } from './read-only';

export interface JakartaRange {
  /** ISO instant (UTC, with Z). */
  startsAt: string;
  endsAt: string;
}

export interface JakartaDateTimeFieldsProps {
  value: Partial<JakartaRange> | null | undefined;
  onChange: (value: JakartaRange) => void;
  /** Error messages from the form (zod paths startsAt / endsAt). */
  errors?: { startsAt?: string; endsAt?: string };
  readOnly?: boolean;
  /** Show the Friday quick chips. Default true. */
  quickPicks?: boolean;
  /** ISO dates (YYYY-MM-DD, Jakarta) that already have an event: chips skip them and a note appears. */
  takenDates?: string[];
  className?: string;
}

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function minutesBetween(a: string, b: string) {
  const [ah, am] = a.split(':').map(Number);
  const [bh, bm] = b.split(':').map(Number);
  return (bh! * 60 + bm!) - (ah! * 60 + am!);
}

function durationText(min: number) {
  if (min <= 0) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h ? `${h}h` : ''}${h && m ? ' ' : ''}${m ? `${m}m` : ''}`;
}

/**
 * Date + start + end, always in Jakarta time (WIB, UTC+7), whatever the browser's timezone.
 * Produces ISO `startsAt`/`endsAt`. Chips jump to the next free Friday 13:15 to 15:15.
 *
 * @example
 * <JakartaDateTimeFields value={{ startsAt, endsAt }} onChange={({ startsAt, endsAt }) => { setValue('startsAt', startsAt); setValue('endsAt', endsAt); }}
 *   errors={{ startsAt: errors.startsAt?.message, endsAt: errors.endsAt?.message }} />
 */
export function JakartaDateTimeFields({ value, onChange, errors, readOnly: ro, quickPicks = true, takenDates = [], className }: JakartaDateTimeFieldsProps) {
  const readOnly = useReadOnly(ro);
  const mounted = useMounted();
  const id = useId().replace(/:/g, '');
  // Times typed before a date is picked have nowhere to go yet, so hold them locally.
  const [draft, setDraft] = useState<{ start: string; end: string }>({ start: DEFAULT_SESSION.start, end: DEFAULT_SESSION.end });
  const date = value?.startsAt ? jakartaDateInput(value.startsAt) : '';
  const start = value?.startsAt ? jakartaTimeInput(value.startsAt) : draft.start;
  const end = value?.endsAt ? jakartaTimeInput(value.endsAt) : draft.end;

  const emit = (d: string, s: string, e: string) => {
    if (!d) {
      setDraft({ start: s || draft.start, end: e || draft.end });
      return;
    }
    if (!s || !e) return;
    const startsAt = fromJakartaInput(d, s);
    let endsAt = fromJakartaInput(d, e);
    // An end before the start means it runs past midnight.
    if (endsAt <= startsAt) endsAt = new Date(endsAt.getTime() + 86_400_000);
    onChange({ startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() });
  };

  const picks = useMemo(() => {
    if (!mounted) return [];
    const out: Array<{ label: string; date: string; r: ReturnType<typeof nextFridaySession> }> = [];
    let week = 0;
    while (out.length < 2 && week < 12) {
      const r = nextFridaySession(new Date(), week);
      const d = jakartaDateInput(r.startsAt);
      if (!takenDates.includes(d)) out.push({ label: out.length === 0 ? 'Next Friday' : 'Friday after', date: d, r });
      week++;
    }
    return out;
  }, [mounted, takenDates]);

  const weekday = date ? jakartaParts(fromJakartaInput(date, '12:00')).weekday : null;
  const dur = durationText(minutesBetween(start, end) < 0 ? minutesBetween(start, end) + 1440 : minutesBetween(start, end));
  const taken = date && takenDates.includes(date);

  return (
    <div className={cn('space-y-3', className)}>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-1.5">
          <label htmlFor={`${id}-date`} className="block text-sm font-semibold text-ink">
            Date
          </label>
          <Input
            id={`${id}-date`}
            type="date"
            value={date}
            readOnly={readOnly}
            aria-invalid={Boolean(errors?.startsAt) || undefined}
            aria-describedby={errors?.startsAt ? `${id}-err-start` : `${id}-hint`}
            onChange={(e) => emit(e.target.value, start, end)}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${id}-start`} className="block text-sm font-semibold text-ink">
            Starts
          </label>
          <Input
            id={`${id}-start`}
            type="time"
            step={300}
            mono
            value={start}
            readOnly={readOnly}
            onChange={(e) => emit(date, e.target.value, end)}
            aria-describedby={`${id}-hint`}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${id}-end`} className="block text-sm font-semibold text-ink">
            Ends
          </label>
          <Input
            id={`${id}-end`}
            type="time"
            step={300}
            mono
            value={end}
            readOnly={readOnly}
            aria-invalid={Boolean(errors?.endsAt) || undefined}
            aria-describedby={errors?.endsAt ? `${id}-err-end` : `${id}-hint`}
            onChange={(e) => emit(date, start, e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id={`${id}-hint`} className="text-[0.8125rem] text-ink-3">
          {value?.startsAt ? (
            <>
              <span className="font-medium text-ink-2">{formatJakarta(value.startsAt, 'date-long')}</span>
              {', '}
              <span className="mono">
                {start} to {end} WIB
              </span>
              {dur ? <span className="text-ink-4"> ({dur})</span> : null}
            </>
          ) : (
            'Times are Jakarta time (WIB), for everyone.'
          )}
        </p>
        {quickPicks && !readOnly && picks.length ? (
          <div className="flex flex-wrap gap-1.5">
            {picks.map((p) => {
              const on = date === p.date && start === DEFAULT_SESSION.start && end === DEFAULT_SESSION.end;
              return (
                <button
                  key={p.date}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChange({ startsAt: p.r.startsAt.toISOString(), endsAt: p.r.endsAt.toISOString() })}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[0.8125rem] font-medium transition focus-visible:outline-2 focus-visible:outline-focus active:scale-95',
                    on ? 'border-blue bg-blue-50 text-blue-600' : 'border-line-strong bg-white text-ink-2 hover:border-ink-4 hover:text-ink',
                  )}
                >
                  {p.label}
                  <span className="mono text-[0.75rem] text-ink-4">{formatJakarta(p.r.startsAt, 'date-short')}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {errors?.startsAt ? (
        <p id={`${id}-err-start`} role="alert" className="text-[0.8125rem] font-medium text-red-600">
          {errors.startsAt}
        </p>
      ) : null}
      {errors?.endsAt ? (
        <p id={`${id}-err-end`} role="alert" className="text-[0.8125rem] font-medium text-red-600">
          {errors.endsAt}
        </p>
      ) : null}
      {weekday != null && weekday !== DEFAULT_SESSION.weekday ? (
        <p className="text-[0.8125rem] text-[#7a5600]">Heads up: that is a {WEEKDAY[weekday]}, not a Friday. Totally fine if it is on purpose.</p>
      ) : null}
      {taken ? <p className="text-[0.8125rem] text-[#7a5600]">Another event is already on this date.</p> : null}
    </div>
  );
}
