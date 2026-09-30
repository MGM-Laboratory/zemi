'use client';

import { fromJakartaInput, jakartaDateInput, jakartaTimeInput } from '@zemi/shared';
import { Braces } from 'lucide-react';
import { forwardRef, useRef, useState } from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/admin/ui/dropdown-menu';
import { Input, NumberInput, type NumberInputProps } from '@/components/admin/ui/input';
import { Tooltip } from '@/components/admin/ui/tooltip';
import { TOKEN_HELP } from '../../engine/resolve';

/** "{ }" menu that inserts a token (like {speaker.first}) where the cursor is. */
export function TokenMenu({ onInsert, disabled }: { onInsert: (token: string) => void; disabled?: boolean }) {
  return (
    <DropdownMenu>
      <Tooltip content="Insert a token">
        <DropdownMenuTrigger asChild disabled={disabled}>
          <button
            type="button"
            aria-label="Insert a token"
            className="inline-flex size-7 items-center justify-center rounded-full text-ink-3 transition hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-40"
          >
            <Braces className="size-4" />
          </button>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="end" className="max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))] w-72 overflow-y-auto">
        <DropdownMenuLabel>Fills in from the data</DropdownMenuLabel>
        {TOKEN_HELP.map((t) => (
          <DropdownMenuItem key={t.token} onSelect={() => onInsert(t.token)}>
            <span className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
              <span className="truncate">{t.label}</span>
              <span className="mono shrink-0 text-xs text-ink-3">{t.token}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Insert text into an input or textarea at its selection and report the new value and caret. */
export function insertAt(el: HTMLInputElement | HTMLTextAreaElement | null, current: string, token: string): { value: string; caret: number } {
  const start = el?.selectionStart ?? current.length;
  const end = el?.selectionEnd ?? current.length;
  const value = current.slice(0, start) + token + current.slice(end);
  return { value, caret: start + token.length };
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Accepts 14:50, 14.50, 1450 or 930 and gives back HH:mm, or null if it can't. */
export function normalizeTime(raw: string): string | null {
  const v = raw.trim().replace('.', ':');
  if (!v) return '';
  if (HHMM.test(v)) return v;
  const m = /^(\d{1,2}):?(\d{2})$/.exec(v);
  if (!m) return null;
  const out = `${m[1]!.padStart(2, '0')}:${m[2]}`;
  return HHMM.test(out) ? out : null;
}

export interface TimeFieldInputProps {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  id?: string;
  readOnly?: boolean;
  onInvalid?: (invalid: boolean) => void;
  'aria-label'?: string;
}

/** HH:mm in WIB. Keeps what you type until it is a real time, then saves it. */
export const TimeFieldInput = forwardRef<HTMLInputElement, TimeFieldInputProps>(function TimeFieldInput({ value, onCommit, placeholder, id, readOnly, onInvalid, 'aria-label': ariaLabel }, ref) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
  }
  const bad = normalizeTime(draft) === null;
  return (
    <Input
      ref={ref}
      id={id}
      mono
      inputMode="numeric"
      autoComplete="off"
      maxLength={5}
      placeholder={placeholder || 'HH:mm'}
      value={draft}
      readOnly={readOnly}
      aria-label={ariaLabel}
      aria-invalid={bad || undefined}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = normalizeTime(e.target.value);
        onInvalid?.(n === null);
        if (n !== null && HHMM.test(e.target.value.trim())) onCommit(n);
        else if (n === '') onCommit('');
      }}
      onBlur={() => {
        const n = normalizeTime(draft);
        if (n !== null) {
          setDraft(n);
          onCommit(n);
        }
      }}
    />
  );
});

/** Date and time (WIB) stored as an ISO instant. */
export function DateTimeFieldInput({ value, onCommit, readOnly, label }: { value: string; onCommit: (iso: string) => void; readOnly?: boolean; label: string }) {
  const valid = value && Number.isFinite(Date.parse(value));
  const date = valid ? jakartaDateInput(value) : '';
  const time = valid ? jakartaTimeInput(value) : '';
  const emit = (d: string, t: string) => {
    if (!d) return onCommit('');
    onCommit(fromJakartaInput(d, t || '00:00').toISOString());
  };
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-2">
      <Input type="date" aria-label={`${label}: date`} value={date} readOnly={readOnly} onChange={(e) => emit(e.target.value, time)} />
      <TimeFieldInput aria-label={`${label}: time (WIB)`} value={time} readOnly={readOnly} onCommit={(t) => emit(date || jakartaDateInput(new Date()), t)} />
    </div>
  );
}

export interface DraftNumberInputProps extends Omit<NumberInputProps, 'value' | 'onChange'> {
  value: number | null;
  /** Called with the clamped number on Enter, blur, arrow keys and the steppers (not on every keystroke). */
  onCommit: (value: number) => void;
}

/**
 * A number field that keeps what you type until you are done (Enter, Tab away, arrows or the
 * steppers), so "600" never passes through a clamped 8 and a live canvas can't overwrite the
 * digits under your cursor.
 */
export function DraftNumberInput({ value, onCommit, min, max, onFocus, onBlur, onKeyDown, ...rest }: DraftNumberInputProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<number | null>(value);
  const editingRef = useRef(false);
  const latest = useRef<number | null>(value);
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
  const commit = (n: number | null) => {
    if (n == null || !Number.isFinite(n)) {
      setDraft(value);
      return;
    }
    const c = clamp(n);
    setDraft(c);
    latest.current = c;
    if (c !== value) onCommit(c);
  };
  return (
    <NumberInput
      {...rest}
      min={min}
      max={max}
      value={editing ? draft : value}
      onChange={(n) => {
        latest.current = n;
        if (editingRef.current) setDraft(n);
        else commit(n);
      }}
      onFocus={(e) => {
        editingRef.current = true;
        latest.current = value;
        setDraft(value);
        setEditing(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        editingRef.current = false;
        setEditing(false);
        commit(latest.current);
        onBlur?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'ArrowUp' || e.key === 'ArrowDown') commit(latest.current);
        onKeyDown?.(e);
      }}
    />
  );
}
