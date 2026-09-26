'use client';

import { formatJakarta, fromJakartaInput, jakartaDateInput, jakartaParts, jakartaTimeInput } from '@zemi/shared';
import { CalendarClock, Infinity as InfinityIcon, TriangleAlert } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Input, SegmentedControl, Tooltip } from '@/components/admin/ui';
import { cn } from '@/lib/admin/cn';
import { formatRelative } from '@/lib/admin/format';

/* ------------------------------------------------------------------ quick picks */

function endOfJakartaDay(date: string): Date {
  return fromJakartaInput(date, '23:59');
}

function addJakartaDays(from: Date, days: number): string {
  // Jakarta has no DST, so adding whole days in UTC and reading the Jakarta date is exact.
  return jakartaDateInput(new Date(from.getTime() + days * 86_400_000));
}

function addJakartaMonths(from: Date, months: number): string {
  const p = jakartaParts(from);
  const y = p.year + Math.floor((p.month - 1 + months) / 12);
  const m = ((p.month - 1 + months) % 12) + 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const d = Math.min(p.day, last);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * End of the current semester. Indonesian universities run the odd semester from about August to
 * January and the even one from about February to June, so the boundaries are 31 January and
 * 30 June, 23:59 WIB. Always the next boundary after now.
 */
export function endOfSemester(now: Date = new Date()): Date {
  const { year } = jakartaParts(now);
  const candidates = [`${year}-01-31`, `${year}-06-30`, `${year + 1}-01-31`].map(endOfJakartaDay);
  return candidates.find((c) => c.getTime() > now.getTime())!;
}

export const EXPIRY_PRESETS: Array<{ key: string; label: string; at: (now: Date) => Date }> = [
  { key: '1d', label: '1 day', at: (now) => endOfJakartaDay(addJakartaDays(now, 1)) },
  { key: '1w', label: '1 week', at: (now) => endOfJakartaDay(addJakartaDays(now, 7)) },
  { key: '1m', label: '1 month', at: (now) => endOfJakartaDay(addJakartaMonths(now, 1)) },
  { key: 'sem', label: 'End of semester', at: (now) => endOfSemester(now) },
];

/* ------------------------------------------------------------------ field */

export interface ExpiryFieldProps {
  /** ISO instant, or null for "never". */
  value: string | null;
  onChange: (value: string | null) => void;
  error?: string;
  readOnly?: boolean;
  /** Shown under the picker when "never" is chosen. */
  neverHint?: string;
}

/**
 * When access ends: a date and time in WIB, or never. Quick picks land on 23:59 WIB of the day
 * (1 day, 1 week, 1 month, end of semester). The stored value is a UTC instant.
 */
export function ExpiryField({ value, onChange, error, readOnly, neverHint = 'Access stays until you switch it off. Fine for the core crew.' }: ExpiryFieldProps) {
  const dateId = useId();
  const timeId = useId();
  const [mode, setMode] = useState<'date' | 'never'>(value ? 'date' : 'never');
  const [date, setDate] = useState(value ? jakartaDateInput(value) : '');
  const [time, setTime] = useState(value ? jakartaTimeInput(value) : '23:59');
  const [now, setNow] = useState(() => new Date());

  // Follow outside changes (form reset, discard) during render, the React way to derive state from a prop.
  const [synced, setSynced] = useState(value);
  if (synced !== value) {
    setSynced(value);
    if (value) {
      setMode('date');
      setDate(jakartaDateInput(value));
      setTime(jakartaTimeInput(value));
    } else {
      setMode('never');
    }
  }
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const commit = (d: string, t: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{2}:\d{2}$/.test(t)) return;
    onChange(fromJakartaInput(d, t).toISOString());
  };

  const pick = (at: Date) => {
    const d = jakartaDateInput(at);
    const t = jakartaTimeInput(at);
    setMode('date');
    setDate(d);
    setTime(t);
    onChange(at.toISOString());
  };

  const current = value ? new Date(value) : null;
  const past = current ? current.getTime() <= now.getTime() : false;
  const activePreset = current ? EXPIRY_PRESETS.find((p) => Math.abs(p.at(now).getTime() - current.getTime()) < 60_000)?.key : null;

  return (
    <div className="space-y-3">
      <SegmentedControl
        aria-label="Does access end?"
        size="sm"
        value={mode}
        onValueChange={(m) => {
          if (readOnly) return;
          setMode(m);
          if (m === 'never') onChange(null);
          else if (date) commit(date, time);
          else pick(EXPIRY_PRESETS[1]!.at(now));
        }}
        options={[
          { value: 'date', label: 'On a date', icon: <CalendarClock /> },
          { value: 'never', label: 'Never', icon: <InfinityIcon /> },
        ]}
      />

      {mode === 'date' ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick picks">
            {EXPIRY_PRESETS.map((p) => {
              const at = p.at(now);
              const on = activePreset === p.key;
              return (
                <Tooltip key={p.key} content={`${formatJakarta(at, 'datetime')} WIB`}>
                  <button
                    type="button"
                    disabled={readOnly}
                    aria-pressed={on}
                    onClick={() => pick(at)}
                    className={cn(
                      'inline-flex h-8 items-center rounded-full border px-3 text-[0.8125rem] font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-95',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-50',
                      on ? 'border-ink bg-ink text-white' : 'border-line-strong bg-white text-ink-2 hover:border-ink-4 hover:text-ink',
                    )}
                  >
                    {p.label}
                  </button>
                </Tooltip>
              );
            })}
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,8.5rem)] gap-2 sm:max-w-md">
            <div>
              <label htmlFor={dateId} className="mb-1 block text-[0.8125rem] font-medium text-ink-2">
                Date
              </label>
              <Input
                id={dateId}
                type="date"
                value={date}
                readOnly={readOnly}
                aria-invalid={error || past ? true : undefined}
                onChange={(e) => {
                  setDate(e.target.value);
                  commit(e.target.value, time);
                }}
              />
            </div>
            <div>
              <label htmlFor={timeId} className="mb-1 block text-[0.8125rem] font-medium text-ink-2">
                Time <span className="text-ink-3">(WIB)</span>
              </label>
              <Input
                id={timeId}
                type="time"
                value={time}
                readOnly={readOnly}
                onChange={(e) => {
                  setTime(e.target.value);
                  commit(date, e.target.value);
                }}
              />
            </div>
          </div>
          {current ? (
            <p className={cn('flex items-start gap-1.5 text-[0.8125rem]', past ? 'text-red-600' : 'text-ink-3')} aria-live="polite">
              {past ? <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" /> : null}
              <span>
                {past ? 'That is in the past, so they could not sign in at all. ' : 'Access ends '}
                <span className={cn('font-medium', past ? '' : 'text-ink-2')}>{formatJakarta(current, 'datetime')} WIB</span>
                {past ? '' : `, ${formatRelative(current, now)}.`} {past ? null : 'They are signed out right then.'}
              </span>
            </p>
          ) : (
            <p className="text-[0.8125rem] text-ink-3">Pick a day. Times are Jakarta time (WIB).</p>
          )}
        </div>
      ) : (
        <p className="text-[0.8125rem] text-ink-3">{neverHint}</p>
      )}
      {error ? (
        <p className="text-[0.8125rem] font-medium text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
