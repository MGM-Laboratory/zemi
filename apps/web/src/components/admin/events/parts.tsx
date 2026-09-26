'use client';

import { SHAPE_PATHS_46, type Accent, type ImageRef, type Visibility } from '@zemi/shared';
import { ChevronDown, EyeOff, Globe, Link2, Send } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useRef, type ReactNode } from 'react';
import { Button } from '@/components/admin/ui/button';
import { useConfirm } from '@/components/admin/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/admin/ui/dropdown-menu';
import { AdminImage } from '@/components/admin/ui/media';
import { Tooltip } from '@/components/admin/ui/tooltip';
import { cn } from '@/lib/admin/cn';
import { formatCountdown } from '@/lib/admin/format';
import { useMounted, useNow } from '@/lib/admin/hooks';
import { publicPaths, SITE_URL } from '@/lib/admin/paths';

const ACCENT_BG: Record<Accent, string> = {
  blue: 'bg-blue',
  yellow: 'bg-yellow',
  red: 'bg-red',
  green: 'bg-green',
};
const ACCENT_SOFT: Record<Accent, string> = {
  blue: 'bg-blue-50',
  yellow: 'bg-yellow-50',
  red: 'bg-red-50',
  green: 'bg-green-50',
};
const ACCENT_SHAPE: Record<Accent, keyof typeof SHAPE_PATHS_46> = {
  blue: 'circle',
  yellow: 'square',
  red: 'triangle',
  green: 'arch',
};
const ACCENT_HEX: Record<Accent, string> = {
  blue: '#3a6dc5',
  yellow: '#f7bf33',
  red: '#f94141',
  green: '#0f8657',
};

export { ACCENT_BG, ACCENT_HEX, ACCENT_SHAPE, ACCENT_SOFT };

/* ------------------------------------------------------------------ cover thumbnail */

/**
 * 4:5 cover, or the event's accent shape on a soft tint when there is no cover yet.
 * Hover gives it a small tilt (every element answers the pointer a little).
 */
export function CoverThumb({
  image,
  accent = 'blue',
  title,
  width = 44,
  className,
  rounded = 'md',
  sizes,
  fluid,
}: {
  image: ImageRef | null | undefined;
  accent?: Accent;
  title?: string;
  width?: number;
  className?: string;
  rounded?: 'sm' | 'md' | 'lg' | 'none';
  sizes?: string;
  /** Fill the parent's width at 4:5 instead of a fixed size (cards). */
  fluid?: boolean;
}) {
  const height = Math.round((width * 5) / 4);
  const radius =
    rounded === 'none'
      ? ''
      : rounded === 'lg'
        ? 'rounded-[18px]'
        : rounded === 'sm'
          ? 'rounded-md'
          : 'rounded-[10px]';
  return (
    <span
      className={cn(
        'relative shrink-0 overflow-hidden',
        fluid
          ? 'block aspect-[4/5] w-full'
          : 'inline-block transition-transform duration-300 ease-[var(--ease-out)] group-hover:-rotate-2 group-hover:scale-[1.04]',
        radius,
        ACCENT_SOFT[accent],
        className,
      )}
      style={fluid ? undefined : { width, height }}
      aria-hidden={title ? undefined : true}
    >
      {image ? (
        <AdminImage
          image={image}
          sizes={sizes ?? `${width * 2}px`}
          alt={title ? `Cover of ${title}` : ''}
          className={cn(
            'size-full',
            fluid &&
              'transition-transform duration-500 ease-[var(--ease-out)] group-hover:scale-[1.04]',
          )}
        />
      ) : (
        <svg
          viewBox="0 0 46 46"
          className={cn(
            'absolute top-1/2 left-1/2 w-[46%] -translate-x-1/2 -translate-y-1/2',
            fluid &&
              'w-[34%] transition-transform duration-500 ease-[var(--ease-out)] group-hover:rotate-[14deg]',
          )}
          aria-hidden="true"
        >
          <path d={SHAPE_PATHS_46[ACCENT_SHAPE[accent]]} fill={ACCENT_HEX[accent]} />
        </svg>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ countdown */

/** Live "3d 4h" / "12m 09s" countdown. Renders a fallback until mounted (no hydration mismatch). */
export function Countdown({
  to,
  className,
  prefix,
  fallback = null,
  doneLabel = 'now',
}: {
  to: string;
  className?: string;
  prefix?: ReactNode;
  fallback?: ReactNode;
  doneLabel?: ReactNode;
}) {
  const mounted = useMounted();
  const now = useNow(1000);
  if (!mounted) return <>{fallback}</>;
  const text = formatCountdown(to, now);
  return (
    <span className={cn('mono tabular-nums', className)} suppressHydrationWarning>
      {prefix}
      {text || doneLabel}
    </span>
  );
}

/* ------------------------------------------------------------------ seats bar */

/** "42 / 80" with a thin fill bar (red when full). */
export function SeatsBar({
  registrations,
  capacity,
  className,
  compact,
}: {
  registrations: number;
  capacity: number | null;
  className?: string;
  compact?: boolean;
}) {
  const frac = capacity ? Math.min(1, registrations / capacity) : null;
  const full = frac != null && frac >= 1;
  return (
    <div className={cn('min-w-0', compact ? 'w-24' : 'w-full', className)}>
      <div className="flex items-baseline justify-between gap-2 text-[0.8125rem]">
        <span className="font-medium text-ink tabular-nums">
          {registrations.toLocaleString('en-US')}
          {capacity ? (
            <span className="font-normal text-ink-4">/{capacity.toLocaleString('en-US')}</span>
          ) : null}
        </span>
        {full ? <span className="text-xs font-semibold text-red-600">Full</span> : null}
      </div>
      {frac != null ? (
        <div
          className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted"
          role="meter"
          aria-label="Seats taken"
          aria-valuemin={0}
          aria-valuemax={capacity ?? 0}
          aria-valuenow={registrations}
        >
          <motion.span
            className={cn(
              'block h-full rounded-full',
              full ? 'bg-red' : frac > 0.8 ? 'bg-yellow' : 'bg-blue',
            )}
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(frac * 100, registrations ? 4 : 0)}%` }}
            transition={{ type: 'spring', stiffness: 180, damping: 26 }}
          />
        </div>
      ) : (
        <div className="mt-1 text-[0.75rem] text-ink-4">No cap</div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ view on site */

export function viewOnSiteUrl(slug: string) {
  return `${SITE_URL}${publicPaths.event(slug)}`;
}

/** "View on site" link. Drafts are hidden from the site, so the link is disabled with a tooltip. */
export function ViewOnSiteButton({
  slug,
  visibility,
  size = 'md',
  className,
}: {
  slug: string;
  visibility: Visibility;
  size?: 'sm' | 'md';
  className?: string;
}) {
  if (visibility === 'draft') {
    return (
      <Tooltip content="Drafts are hidden from the site. Publish to see it live.">
        <span tabIndex={0} className={cn('inline-flex rounded-full', className)}>
          <Button variant="secondary" size={size} icon={<Globe />} disabled aria-disabled>
            View on site
          </Button>
        </span>
      </Tooltip>
    );
  }
  return (
    <Button asChild variant="secondary" size={size} className={className}>
      <a href={viewOnSiteUrl(slug)} target="_blank" rel="noreferrer">
        <Globe />
        View on site
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </Button>
  );
}

/* ------------------------------------------------------------------ publish control */

export interface PublishControlProps {
  visibility: Visibility;
  onChange: (visibility: Visibility, from: Element | null) => void;
  pending?: boolean;
  size?: 'sm' | 'md';
  cancelled?: boolean;
}

/**
 * The workspace's primary action. Draft: "Publish" (+ "Publish unlisted").
 * Published: "Unpublish" (confirms first) + "Make unlisted". Unlisted: "Publish to everyone" + "Back to draft".
 */
export function PublishControl({
  visibility,
  onChange,
  pending,
  size = 'md',
  cancelled,
}: PublishControlProps) {
  const confirm = useConfirm();
  const ref = useRef<HTMLButtonElement>(null);
  const reduce = useReducedMotion();

  const unpublish = async () => {
    const ok = await confirm({
      title: 'Unpublish this Friday?',
      description:
        'It disappears from the site and new registrations stop. People who already registered keep their tickets, and nobody gets an email.',
      confirmLabel: 'Unpublish',
    });
    if (ok) onChange('draft', null);
  };

  const publishNow = () => onChange('published', ref.current);
  const primary =
    visibility === 'published'
      ? {
          label: 'Unpublish',
          icon: <EyeOff />,
          variant: 'secondary' as const,
          kind: 'unpublish' as const,
        }
      : {
          label:
            visibility === 'unlisted'
              ? 'Publish to everyone'
              : cancelled
                ? 'Publish anyway'
                : 'Publish',
          icon: <Send />,
          variant: 'primary' as const,
          kind: 'publish' as const,
        };
  const onPrimary = () => (primary.kind === 'unpublish' ? void unpublish() : publishNow());

  const extra: Array<{ label: string; hint: string; icon: ReactNode; run: () => void }> =
    visibility === 'draft'
      ? [
          {
            label: 'Publish unlisted',
            hint: 'Only people with the link',
            icon: <Link2 />,
            run: () => onChange('unlisted', null),
          },
        ]
      : visibility === 'published'
        ? [
            {
              label: 'Make unlisted',
              hint: 'Keep the link, hide it from lists',
              icon: <Link2 />,
              run: () => onChange('unlisted', null),
            },
          ]
        : [
            {
              label: 'Back to draft',
              hint: 'Hide it completely',
              icon: <EyeOff />,
              run: () => onChange('draft', null),
            },
          ];

  return (
    <div className="inline-flex items-center">
      <motion.div whileHover={reduce ? undefined : { y: -1 }} className="inline-flex">
        <Button
          ref={ref}
          variant={primary.variant}
          size={size}
          icon={primary.icon}
          loading={pending}
          onClick={onPrimary}
          className="rounded-r-none pr-3.5"
        >
          {primary.label}
        </Button>
      </motion.div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={primary.variant}
            size={size}
            disabled={pending}
            aria-label="More publishing options"
            className={cn(
              'rounded-l-none border-l px-2.5',
              primary.variant === 'primary' ? 'border-white/15' : 'border-l-line-strong',
            )}
          >
            <ChevronDown className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {extra.map((x) => (
            <DropdownMenuItem key={x.label} icon={x.icon} onSelect={x.run}>
              <span className="flex flex-col">
                <span>{x.label}</span>
                <span className="text-xs text-ink-3">{x.hint}</span>
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/* ------------------------------------------------------------------ misc */

/** Mono "Zemi #42" label. */
export function EventNumber({
  number,
  className,
}: {
  number: number | null | undefined;
  className?: string;
}) {
  if (number == null) return <span className={cn('label text-ink-4', className)}>No number</span>;
  return <span className={cn('label text-ink-3', className)}>Zemi #{number}</span>;
}

/** Pulsing red dot for live things. */
export function LiveDot({
  className,
  tone = 'red',
}: {
  className?: string;
  tone?: 'red' | 'white';
}) {
  return (
    <span className={cn('relative flex size-2.5 shrink-0', className)} aria-hidden="true">
      <span
        className={cn(
          'absolute inline-flex size-full animate-ping rounded-full',
          tone === 'red' ? 'bg-red/70' : 'bg-white/80',
        )}
      />
      <span
        className={cn(
          'relative inline-flex size-2.5 rounded-full',
          tone === 'red' ? 'bg-red' : 'bg-white',
        )}
      />
    </span>
  );
}
