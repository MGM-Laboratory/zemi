'use client';

import type { ShapeName, Visibility } from '@zemi/shared';
import { LayoutGrid, Rows3 } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { Card, EmptyState, RadioGroup, SegmentedControl, ShapeGlyph, Skeleton, SkeletonText, Tooltip } from '@/components/admin/ui';
import { cn } from '@/lib/admin/cn';

/* ------------------------------------------------------------------ Visibility */

const VIS_COPY: Record<Visibility, { label: string; shape: 'arch' | 'circle' | 'square'; hint: (noun: string) => string }> = {
  published: { label: 'Published', shape: 'arch', hint: (n) => `Live on the site. Anyone can find this ${n}.` },
  unlisted: { label: 'Unlisted', shape: 'circle', hint: () => 'Hidden from lists and search. People with the link can still open it.' },
  draft: { label: 'Draft', shape: 'square', hint: () => 'Only the crew sees it. Park it here while it is messy.' },
};

const VIS_TONE: Record<Visibility, string> = {
  published: 'text-green',
  unlisted: 'text-blue',
  draft: 'text-yellow',
};

export interface VisibilityFieldProps {
  value: Visibility | null | undefined;
  onChange: (v: Visibility) => void;
  /** "speaker", "publication" */
  noun: string;
  readOnly?: boolean;
  /** Why it is read-only (no publish permission). */
  lockedReason?: string;
}

/** Draft, published or unlisted as three friendly cards. Changing it needs `publish`. */
export function VisibilityField({ value, onChange, noun, readOnly, lockedReason }: VisibilityFieldProps) {
  return (
    <div className="space-y-2">
      <RadioGroup<Visibility>
        variant="cards"
        value={value ?? 'published'}
        onValueChange={onChange}
        disabled={readOnly}
        aria-label="Visibility"
        options={(['published', 'unlisted', 'draft'] as const).map((v) => ({
          value: v,
          label: VIS_COPY[v].label,
          description: VIS_COPY[v].hint(noun),
          icon: <ShapeGlyph shape={VIS_COPY[v].shape} className={cn('size-3.5', VIS_TONE[v])} />,
        }))}
      />
      {readOnly && lockedReason ? <p className="text-[0.8125rem] text-ink-3">{lockedReason}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ Field group */

/**
 * Label, hint and error for a composite editor (authors, link rows). Unlike the kit's `<Field>`, it
 * hands nothing down through context, so the rows inside keep their own ids and only the row
 * with a problem turns red.
 */
export function FieldGroup({
  label,
  hideLabel,
  optional,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  hideLabel?: boolean;
  optional?: boolean;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={`${id}-label`} aria-describedby={hint ? `${id}-hint` : undefined} className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <p id={`${id}-label`} className={cn('text-sm font-semibold text-ink', hideLabel && 'sr-only')}>
        {label}
        {optional ? <span className="ml-1.5 text-xs font-normal text-ink-3">Optional</span> : null}
      </p>
      {children}
      {error ? (
        <p className="text-[0.8125rem] font-medium text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={`${id}-hint`} className="text-[0.8125rem] leading-snug text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ Stored state */

/** useState backed by localStorage (per-viewer conveniences only). Falls back quietly. */
export function useStoredState<T extends string>(key: string, initial: T, allowed: readonly T[]): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(`zemi.${key}`);
      if (raw && (allowed as readonly string[]).includes(raw)) setValue(raw as T);
    } catch {
      /* private mode */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = useCallback(
    (v: T) => {
      setValue(v);
      try {
        window.localStorage.setItem(`zemi.${key}`, v);
      } catch {
        /* private mode */
      }
    },
    [key],
  );
  return [value, set];
}

/* ------------------------------------------------------------------ View toggle */

export type ListView = 'grid' | 'table';

export function ViewToggle({ value, onChange }: { value: ListView; onChange: (v: ListView) => void }) {
  return (
    <SegmentedControl<ListView>
      size="sm"
      value={value}
      onValueChange={onChange}
      aria-label="Layout"
      options={[
        { value: 'grid', label: <span className="sr-only sm:not-sr-only">Grid</span>, icon: <LayoutGrid className="size-4" /> },
        { value: 'table', label: <span className="sr-only sm:not-sr-only">Table</span>, icon: <Rows3 className="size-4" /> },
      ]}
    />
  );
}

/* ------------------------------------------------------------------ Section nav */

export interface EditorSection {
  id: string;
  label: string;
  shape?: ShapeName;
  /** Marks the section as having errors. */
  invalid?: boolean;
  hidden?: boolean;
}

/**
 * Sticky in-page navigation for long editors. Highlights the section in view (scrollspy).
 * Desktop: a vertical list. Phones and tablets: a horizontal chip strip.
 */
export function SectionNav({ sections, className }: { sections: EditorSection[]; className?: string }) {
  const visible = sections.filter((s) => !s.hidden);
  const [active, setActive] = useState(visible[0]?.id ?? '');
  const reduce = useReducedMotion();
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const els = visible.map((s) => document.getElementById(s.id)).filter((el): el is HTMLElement => Boolean(el));
    const seen = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0);
        const top = visible.find((s) => (seen.get(s.id) ?? 0) > 0);
        if (top) setActive(top.id);
      },
      { rootMargin: '-120px 0px -55% 0px', threshold: [0, 0.01, 0.5] },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible.map((s) => s.id).join('|')]);

  const go = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    setActive(id);
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    const focusable = el.querySelector<HTMLElement>('h2, [tabindex="-1"]');
    focusable?.focus({ preventScroll: true });
  };

  return (
    <nav aria-label="Sections" className={className}>
      <ul className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none] lg:flex-col lg:overflow-visible lg:pb-0">
        {visible.map((s) => {
          const on = active === s.id;
          return (
            <li key={s.id} className="shrink-0">
              <a
                href={`#${s.id}`}
                data-skip-dirty-guard=""
                onClick={(e) => {
                  e.preventDefault();
                  go(s.id);
                }}
                aria-current={on ? 'true' : undefined}
                className={cn(
                  'group relative flex h-9 items-center gap-2 rounded-full px-3 text-sm font-medium whitespace-nowrap transition-colors lg:rounded-xl',
                  'focus-visible:outline-2 focus-visible:outline-focus',
                  on ? 'text-ink' : 'text-ink-3 hover:bg-surface-muted hover:text-ink',
                )}
              >
                {on ? (
                  <motion.span
                    layoutId="zemi-section-nav"
                    className="absolute inset-0 rounded-full bg-surface-muted lg:rounded-xl"
                    transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 32 }}
                    aria-hidden="true"
                  />
                ) : null}
                <span className="relative flex items-center gap-2">
                  <ShapeGlyph
                    shape={s.shape ?? 'circle'}
                    className={cn('size-2.5 transition-transform duration-300 group-hover:rotate-90', on ? 'text-ink' : 'text-ink-4')}
                  />
                  {s.label}
                  {s.invalid ? (
                    <Tooltip content="Something here needs a look">
                      <span className="size-1.5 rounded-full bg-red" aria-hidden="true" />
                    </Tooltip>
                  ) : null}
                  {s.invalid ? <span className="sr-only">(needs a look)</span> : null}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* ------------------------------------------------------------------ Editor card section */

/** A titled card inside an editor. The heading is focusable for the section nav. */
export function EditorCard({
  id,
  title,
  description,
  actions,
  children,
  className,
}: {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card as="section" id={id} aria-labelledby={`${id}-title`} className={cn('scroll-mt-36 space-y-5', className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 id={`${id}-title`} tabIndex={-1} className="font-display text-lg leading-tight font-extrabold tracking-[-0.02em] outline-none [font-variation-settings:'CASL'_0.2]">
            {title}
          </h2>
          {description ? <p className="mt-1 text-sm text-ink-3">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </Card>
  );
}

/* ------------------------------------------------------------------ Skeletons + states */

export function EditorSkeleton({ aside = true }: { aside?: boolean }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Skeleton className="mb-3 h-4 w-28" />
      <Skeleton className="mb-8 h-10 w-72 max-w-full" />
      <div className={cn('grid gap-6', aside && 'lg:grid-cols-[minmax(0,1fr)_20rem]')}>
        <div className="space-y-6">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="space-y-4">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-11 w-full" rounded="lg" />
              <SkeletonText lines={3} />
            </Card>
          ))}
        </div>
        {aside ? (
          <div className="space-y-6">
            <Card className="space-y-4">
              <Skeleton className="mx-auto size-40" rounded="full" />
              <SkeletonText lines={2} />
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function NoCreateAccess({ what }: { what: string }) {
  return (
    <EmptyState
      size="lg"
      title={`You can't add ${what} yet.`}
      description="Your access lets you look around but not add new ones. Ask the superadmin if you need it."
      cast={[
        { shape: 'triangle', mood: 'closed', size: 52 },
        { shape: 'circle', mood: 'look', size: 36, lookAt: { x: -0.8, y: 0.2 } },
      ]}
    />
  );
}

/** Small "read only" banner line for people who can view but not edit. */
export function ReadOnlyNote({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="flex items-center gap-2 rounded-2xl border border-dashed border-line-strong bg-surface-muted px-4 py-2.5 text-sm text-ink-2">
      <ShapeGlyph shape="square" className="size-3 text-ink-4" />
      {children}
    </div>
  );
}
