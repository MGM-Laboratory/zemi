'use client';

import type { ShapeName } from '@zemi/shared';
import { RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { errorMessage, isApiError } from '@/lib/admin/api';
import { cn } from '@/lib/admin/cn';
import { Character, type CharacterMood } from '../characters/character';
import { Button } from './button';

/* ------------------------------------------------------------------ Skeleton */

/** Shimmering placeholder block. Size it with classes: `<Skeleton className="h-5 w-40" />`. */
export function Skeleton({ className, rounded = 'md' }: { className?: string; rounded?: 'sm' | 'md' | 'lg' | 'full' }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'zemi-skeleton block bg-surface-muted',
        rounded === 'full' ? 'rounded-full' : rounded === 'lg' ? 'rounded-2xl' : rounded === 'sm' ? 'rounded' : 'rounded-lg',
        className,
      )}
    />
  );
}

/** A few lines of text skeleton. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <span className={cn('flex flex-col gap-2', className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn('h-3.5', i === lines - 1 ? 'w-3/5' : 'w-full')} />
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ EmptyState */

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  /** CTA buttons. */
  action?: ReactNode;
  /** Which characters show up. Default: Block sleeping next to Q looking at it. */
  cast?: Array<{ shape: ShapeName; mood?: CharacterMood; size?: number; lookAt?: { x: number; y: number } }>;
  size?: 'sm' | 'md' | 'lg';
  /** Wrap in a dashed card. Default true. */
  framed?: boolean;
  className?: string;
}

const DEFAULT_CAST: NonNullable<EmptyStateProps['cast']> = [
  { shape: 'square', mood: 'sleep', size: 56 },
  { shape: 'circle', mood: 'look', size: 40, lookAt: { x: -0.9, y: 0.3 } },
];

/**
 * Nothing here yet. Friendly copy + characters + a clear next step.
 * @example <EmptyState title="No Fridays yet" description="Add the first one and it shows up here." action={<Button variant="primary">New event</Button>} />
 */
export function EmptyState({ title, description, action, cast = DEFAULT_CAST, size = 'md', framed = true, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        size === 'sm' ? 'gap-2 px-4 py-8' : size === 'lg' ? 'gap-4 px-6 py-20' : 'gap-3 px-6 py-14',
        framed && 'rounded-[20px] border border-dashed border-line-strong bg-white sm:rounded-[var(--radius-card)]',
        className,
      )}
    >
      <div className="flex items-end gap-1.5" aria-hidden="true">
        {cast.map((c, i) => (
          <Character
            key={i}
            shape={c.shape}
            mood={c.mood ?? 'idle'}
            size={Math.round((c.size ?? 48) * (size === 'sm' ? 0.75 : size === 'lg' ? 1.2 : 1))}
            lookAt={c.lookAt}
            follow={!c.lookAt}
          />
        ))}
      </div>
      <div className="max-w-md">
        <h2 className={cn('font-display font-extrabold tracking-[-0.02em] text-ink [font-variation-settings:"CASL"_0.3]', size === 'sm' ? 'text-base' : 'text-xl')}>
          {title}
        </h2>
        {description ? <p className={cn('mt-1.5 text-ink-3', size === 'sm' ? 'text-sm' : 'text-[0.9375rem]')}>{description}</p> : null}
      </div>
      {action ? <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ ErrorState */

export interface ErrorStateProps {
  /** An error (ApiError gets a tailored message) or a custom title. */
  error?: unknown;
  title?: ReactNode;
  description?: ReactNode;
  onRetry?: () => void;
  retrying?: boolean;
  action?: ReactNode;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Something failed to load. 403 and 404 get their own copy.
 * @example if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
 */
export function ErrorState({ error, title, description, onRetry, retrying, action, size = 'md', className }: ErrorStateProps) {
  const api = isApiError(error) ? error : null;
  const forbidden = api?.isForbidden;
  const missing = api?.isNotFound;
  const autoTitle = forbidden ? 'This one is behind a door you do not have a key for.' : missing ? "We couldn't find that." : 'That did not load.';
  const autoDesc = forbidden
    ? 'Ask the superadmin if you think you should have access.'
    : missing
      ? 'It may have been moved or deleted.'
      : error
        ? errorMessage(error)
        : 'Give it another go in a moment.';
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-[20px] border border-line bg-white text-center sm:rounded-[var(--radius-card)]',
        size === 'sm' ? 'px-4 py-7' : 'px-6 py-14',
        className,
      )}
    >
      <div className="flex items-end gap-1" aria-hidden="true">
        <Character shape="triangle" mood={forbidden ? 'closed' : 'oops'} size={size === 'sm' ? 38 : 52} />
        <Character shape="arch" mood="look" lookAt={{ x: -0.9, y: 0 }} size={size === 'sm' ? 28 : 36} />
      </div>
      <div className="max-w-md">
        <h2 className={cn('font-display font-extrabold tracking-[-0.02em] [font-variation-settings:"CASL"_0.3]', size === 'sm' ? 'text-base' : 'text-xl')}>{title ?? autoTitle}</h2>
        <p className="mt-1.5 text-[0.9375rem] text-ink-3">{description ?? autoDesc}</p>
      </div>
      {onRetry || action ? (
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          {onRetry && !forbidden ? (
            <Button icon={<RotateCcw />} onClick={onRetry} loading={retrying}>
              Try again
            </Button>
          ) : null}
          {action}
        </div>
      ) : null}
    </div>
  );
}

/** Inline banner for a form-level or page-level message. */
export function Callout({
  tone = 'blue',
  title,
  children,
  icon,
  action,
  className,
}: {
  tone?: 'blue' | 'yellow' | 'red' | 'green' | 'neutral';
  title?: ReactNode;
  children?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const tones = {
    blue: 'bg-blue-50 border-blue/15',
    yellow: 'bg-yellow-50 border-yellow/40',
    red: 'bg-red-50 border-red/20',
    green: 'bg-green-50 border-green/20',
    neutral: 'bg-surface-muted border-line',
  } as const;
  const bar = { blue: 'bg-blue', yellow: 'bg-yellow', red: 'bg-red', green: 'bg-green', neutral: 'bg-ink-4' } as const;
  return (
    <div role={tone === 'red' ? 'alert' : 'status'} className={cn('relative flex gap-3 overflow-hidden rounded-2xl border py-3 pr-4 pl-5 text-[0.9375rem]', tones[tone], className)}>
      <span className={cn('absolute inset-y-0 left-0 w-1', bar[tone])} aria-hidden="true" />
      {icon ? <span className="mt-0.5 shrink-0 text-ink-2 [&_svg]:size-[18px]">{icon}</span> : null}
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold text-ink">{title}</p> : null}
        {children ? <div className={cn('text-ink-2', title && 'mt-0.5')}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </div>
  );
}
