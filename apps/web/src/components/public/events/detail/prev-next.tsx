import Link from 'next/link';
import type { EventDetail } from '@zemi/shared';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { cn } from '@/lib/utils';
import { eventLabel } from '../lib';

function Side({ dir, e }: { dir: 'prev' | 'next'; e: NonNullable<EventDetail['prev']> }) {
  const next = dir === 'next';
  return (
    <Link
      href={`/events/${e.slug}`}
      rel={dir}
      className={cn(
        'group/pn relative flex min-h-[9.5rem] flex-col justify-between gap-6 overflow-hidden rounded-[28px] border border-line bg-white p-6 transition-[border-color,transform,box-shadow] duration-300 hover:-translate-y-1 hover:border-ink hover:shadow-3 sm:p-8',
        next && 'items-end text-right',
      )}
    >
      <span className="label inline-flex items-center gap-2 text-ink-3">
        {!next ? (
          <ShapeIcon
            shape="triangle"
            size="0.9em"
            style={{ rotate: '-90deg' }}
            className="transition-transform duration-500 group-hover/pn:-translate-x-1"
          />
        ) : null}
        {next ? 'Next Friday' : 'Previous Friday'}
        {next ? (
          <ShapeIcon
            shape="triangle"
            size="0.9em"
            style={{ rotate: '90deg' }}
            className="transition-transform duration-500 group-hover/pn:translate-x-1"
          />
        ) : null}
      </span>
      <span className="flex flex-col gap-1">
        <span className="mono text-[0.9375rem] text-ink-3">{eventLabel(e)}</span>
        <span
          className="display text-[clamp(1.375rem,2.4vw,2rem)] leading-[1.02] text-ink transition-[font-variation-settings] duration-500"
          style={{ fontVariationSettings: "'CASL' 0.2, 'MONO' 0" }}
        >
          {e.title}
        </span>
      </span>
    </Link>
  );
}

export function PrevNext({
  prev,
  next,
  className,
}: {
  prev: EventDetail['prev'];
  next: EventDetail['next'];
  className?: string;
}) {
  if (!prev && !next) return null;
  return (
    <nav aria-label="More Fridays" className={cn('container-page', className)}>
      <div className="grid gap-[var(--gutter)] sm:grid-cols-2">
        {prev ? <Side dir="prev" e={prev} /> : <span className="hidden sm:block" />}
        {next ? <Side dir="next" e={next} /> : null}
      </div>
    </nav>
  );
}
