'use client';

import { ACCENTS, isValidSlug, SLUG_MAX, slugify, SHAPE_PATHS_46, type Accent } from '@zemi/shared';
import { Link2, RotateCcw, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { RadioGroup as RRadio } from 'radix-ui';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/admin/cn';
import { SITE_URL } from '@/lib/admin/paths';
import { useFieldControlProps } from '../ui/field';
import { controlClass, Input } from '../ui/input';
import { useReadOnly } from './read-only';

/* ------------------------------------------------------------------ AccentPicker */

const ACCENT_META: Record<Accent, { label: string; shape: keyof typeof SHAPE_PATHS_46; fill: string; ring: string }> = {
  blue: { label: 'Blue', shape: 'circle', fill: '#3a6dc5', ring: 'data-[state=checked]:ring-blue' },
  yellow: { label: 'Yellow', shape: 'square', fill: '#f7bf33', ring: 'data-[state=checked]:ring-yellow' },
  red: { label: 'Red', shape: 'triangle', fill: '#f94141', ring: 'data-[state=checked]:ring-red' },
  green: { label: 'Green', shape: 'arch', fill: '#0f8657', ring: 'data-[state=checked]:ring-green' },
};

export interface AccentPickerProps {
  value: Accent | null | undefined;
  onChange: (value: Accent) => void;
  readOnly?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  'aria-label'?: string;
}

/** Four brand swatches, each drawn as its shape. Arrow keys move between them. */
export function AccentPicker({ value, onChange, readOnly: ro, size = 'md', className, 'aria-label': ariaLabel = 'Accent color' }: AccentPickerProps) {
  const readOnly = useReadOnly(ro);
  const reduce = useReducedMotion();
  const aria = useFieldControlProps({});
  const px = size === 'sm' ? 30 : 40;
  return (
    <RRadio.Root
      value={value ?? undefined}
      onValueChange={(v) => onChange(v as Accent)}
      disabled={readOnly}
      orientation="horizontal"
      loop
      aria-label={ariaLabel}
      aria-describedby={aria['aria-describedby']}
      className={cn('flex items-center gap-2.5', className)}
    >
      {ACCENTS.map((a) => {
        const m = ACCENT_META[a];
        const on = value === a;
        return (
          <RRadio.Item
            key={a}
            value={a}
            aria-label={m.label}
            title={m.label}
            className={cn(
              'group relative flex items-center justify-center rounded-2xl bg-white p-1.5 ring-2 ring-transparent ring-offset-2 transition-[box-shadow,transform] duration-150',
              'hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus disabled:cursor-default disabled:opacity-100',
              m.ring,
              !on && readOnly && 'opacity-35',
            )}
          >
            <motion.svg
              viewBox="0 0 46 46"
              width={px}
              height={px}
              animate={on && !reduce ? { rotate: [0, -12, 8, 0], scale: [1, 1.08, 1] } : { rotate: 0, scale: 1 }}
              transition={{ duration: 0.45 }}
              aria-hidden="true"
            >
              <path d={SHAPE_PATHS_46[m.shape]} fill={m.fill} />
              {on ? (
                <path d="M15 24.5 20.5 30 31 18.5" fill="none" stroke={a === 'yellow' ? '#0e1116' : '#fff'} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" transform={a === 'red' ? 'translate(0 4)' : a === 'green' ? 'translate(0 3)' : undefined} />
              ) : null}
            </motion.svg>
          </RRadio.Item>
        );
      })}
    </RRadio.Root>
  );
}

/* ------------------------------------------------------------------ TagsInput */

export interface TagsInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  max?: number;
  maxLength?: number;
  /** Lowercase and trim each tag. Default true. */
  normalize?: boolean;
  suggestions?: string[];
  readOnly?: boolean;
  id?: string;
  className?: string;
}

/**
 * Chips + text entry. Enter or comma adds, Backspace on empty removes the last one, pasting
 * "a, b, c" adds three.
 */
export function TagsInput({ value, onChange, placeholder = 'Add a tag', max = 20, maxLength = 40, normalize = true, suggestions = [], readOnly: ro, id, className }: TagsInputProps) {
  const readOnly = useReadOnly(ro);
  const aria = useFieldControlProps({ id });
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const clean = (t: string) => {
    const s = t.replace(/\s+/g, ' ').trim().slice(0, maxLength);
    return normalize ? s.toLowerCase() : s;
  };
  const add = (raw: string) => {
    const parts = raw.split(/[,\n]/).map(clean).filter(Boolean);
    if (!parts.length) return;
    const next = [...value];
    for (const p of parts) if (!next.includes(p) && next.length < max) next.push(p);
    onChange(next);
    setDraft('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',') && draft.trim()) {
      e.preventDefault();
      add(draft);
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };
  const open = suggestions.filter((s) => !value.includes(s) && (!draft || s.includes(draft.toLowerCase()))).slice(0, 8);
  const full = value.length >= max;

  return (
    <div className={cn('space-y-2', className)}>
      <div
        className={cn(controlClass, 'flex min-h-11 cursor-text flex-wrap items-center gap-1.5 px-1.5 py-1.5', readOnly && 'cursor-default bg-surface-muted')}
        onClick={() => inputRef.current?.focus()}
        aria-invalid={aria['aria-invalid']}
      >
        {value.map((t) => (
          <span key={t} className="inline-flex h-7 items-center gap-1 rounded-full bg-surface-muted pr-1 pl-2.5 text-sm text-ink">
            <span className="text-ink-4">#</span>
            {t}
            {readOnly ? (
              <span className="w-1.5" />
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(value.filter((v) => v !== t));
                }}
                aria-label={`Remove tag ${t}`}
                className="flex size-5 items-center justify-center rounded-full text-ink-3 transition hover:bg-white hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
              >
                <X className="size-3" />
              </button>
            )}
          </span>
        ))}
        {readOnly ? (
          value.length ? null : <span className="px-2 text-ink-4">No tags</span>
        ) : (
          <input
            ref={inputRef}
            id={aria.id}
            aria-describedby={aria['aria-describedby']}
            value={draft}
            disabled={full}
            onChange={(e) => {
              const v = e.target.value;
              if (v.includes(',')) add(v);
              else setDraft(v);
            }}
            onKeyDown={onKey}
            onBlur={() => draft.trim() && add(draft)}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text');
              if (/[,\n]/.test(text)) {
                e.preventDefault();
                add(text);
              }
            }}
            placeholder={full ? `That's ${max}, the max` : value.length ? '' : placeholder}
            className="h-7 min-w-[8rem] flex-1 bg-transparent px-1.5 text-[0.9375rem] outline-none placeholder:text-ink-4"
          />
        )}
      </div>
      {!readOnly && open.length ? (
        <div className="flex flex-wrap gap-1.5" aria-label="Suggestions">
          {open.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="h-6 rounded-full border border-dashed border-line-strong px-2.5 text-xs text-ink-3 transition hover:border-ink-4 hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
            >
              + {s}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ SlugField */

export interface SlugFieldProps {
  value: string;
  onChange: (slug: string) => void;
  /** Watched source text (the title). While the slug is "auto", it follows this. */
  source: string;
  /** Public path prefix, like '/events/'. */
  basePath: string;
  /** Current saved slug (edit forms). When the new value differs, we explain the redirect. */
  savedSlug?: string | null;
  /** Start in auto mode even if a value exists (create forms). Default: auto only when empty or equal to slugify(source). */
  auto?: boolean;
  readOnly?: boolean;
  id?: string;
  onBlur?: () => void;
}

/**
 * URL slug with a live public URL preview. Follows the title until someone edits it by hand
 * ("Match the title" brings the link back). Changing a published slug is safe: the old one
 * keeps redirecting.
 */
export function SlugField({ value, onChange, source, basePath, savedSlug, auto: autoProp, readOnly: ro, id, onBlur }: SlugFieldProps) {
  const readOnly = useReadOnly(ro);
  const [auto, setAuto] = useState(() => autoProp ?? (!value || value === slugify(source)));
  const derived = source.trim() ? slugify(source) : '';
  useEffect(() => {
    if (auto && !readOnly && derived !== value) onChange(derived);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, derived, readOnly]);
  const valid = !value || isValidSlug(value);
  const base = basePath.endsWith('/') ? basePath : `${basePath}/`;
  const changed = Boolean(savedSlug && value && savedSlug !== value);

  return (
    <div className="space-y-2">
      <Input
        id={id}
        mono
        value={value}
        readOnly={readOnly}
        maxLength={SLUG_MAX}
        spellCheck={false}
        autoCapitalize="none"
        autoComplete="off"
        leading={<Link2 />}
        onBlur={onBlur}
        aria-invalid={!valid || undefined}
        onChange={(e) => {
          setAuto(false);
          // Help people type: spaces and underscores become dashes, uppercase lowercases.
          onChange(e.target.value.toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, ''));
        }}
        trailing={
          !readOnly && !auto && derived && derived !== value ? (
            <button
              type="button"
              onClick={() => {
                setAuto(true);
                onChange(derived);
              }}
              className="mr-1 inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-blue transition hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-focus"
            >
              <RotateCcw className="size-3.5" />
              Match the title
            </button>
          ) : auto && !readOnly ? (
            <span className="label mr-3 rounded-full bg-surface-muted px-2 py-0.5 text-[0.625rem] text-ink-4">Auto</span>
          ) : null
        }
      />
      <p className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-[0.8125rem] text-ink-3">
        <span className="shrink-0">Public link:</span>
        <span className="mono min-w-0 truncate text-ink-2">
          {SITE_URL.replace(/^https?:\/\//, '')}
          {base}
          <span className={cn('font-semibold', valid ? 'text-ink' : 'text-red-600')}>{value || 'your-slug'}</span>
        </span>
      </p>
      {!valid ? <p className="text-[0.8125rem] font-medium text-red-600">Use lowercase letters, numbers and single dashes, like &quot;my-first-talk&quot;.</p> : null}
      {changed ? (
        <p className="text-[0.8125rem] text-ink-3">
          The old link <span className="mono text-ink-2">{base}{savedSlug}</span> keeps working. It redirects here for good.
        </p>
      ) : null}
    </div>
  );
}
