'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { PublicationCard } from '@zemi/shared';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { Avatar } from '@/components/public/ui/avatar';
import { Card, CardLink } from '@/components/public/ui/card';
import { Chip } from '@/components/public/ui/chip';
import { cn } from '@/lib/utils';
import { doiText, statusNote, STATUS_TONE, typeLook } from './lib';
import { PdfIcon } from './pub-link-icon';
import styles from './publications.module.css';

export interface PublicationItemProps {
  pub: PublicationCard;
  /** Pointer enters / leaves (for the floating cover preview). */
  onPreview?: (id: string | null) => void;
  /** Heading level for the title. Default h3. */
  titleAs?: 'h2' | 'h3';
  /** Hide the year column (when rows are grouped by year). */
  hideYear?: boolean;
}

/** "Nadia Putri Rahmawati, Bagus Adi Nugroho and 2 more" with speaker authors linked. */
function Authors({
  pub,
  max = 3,
  withAvatars = true,
}: {
  pub: PublicationCard;
  max?: number;
  withAvatars?: boolean;
}) {
  const shown = pub.authors.slice(0, max);
  const extra = pub.authors.length - shown.length;
  if (!pub.authors.length) return null;
  return (
    <div className="flex min-w-0 items-center gap-3">
      {withAvatars ? (
        <span className="flex flex-none items-center" aria-hidden="true">
          {pub.authors.slice(0, 4).map((a, i) => (
            <span
              key={`${a.fullName}-${i}`}
              className="relative"
              style={{ marginLeft: i ? -8 : 0, zIndex: 4 - i }}
            >
              <Avatar name={a.fullName} image={a.avatar} size={28} ring="#ffffff" />
            </span>
          ))}
        </span>
      ) : null}
      <p className="min-w-0 text-[0.9375rem] leading-snug text-ink-2">
        {shown.map((a, i) => (
          <span key={`${a.fullName}-${i}`}>
            {i > 0 ? (i === shown.length - 1 && extra === 0 ? ' and ' : ', ') : null}
            {a.speakerSlug ? (
              <Link
                href={`/speakers/${a.speakerSlug}`}
                className={cn(
                  styles.lift,
                  'font-semibold text-ink underline decoration-ink/20 underline-offset-[0.2em] transition-[text-decoration-color] hover:decoration-ink',
                )}
              >
                {a.fullName}
              </Link>
            ) : (
              <span>{a.fullName}</span>
            )}
          </span>
        ))}
        {extra > 0 ? <span>{` and ${extra} more`}</span> : null}
      </p>
    </div>
  );
}

function Badges({ pub, className }: { pub: PublicationCard; className?: string }) {
  const doi = doiText(pub.doi);
  return (
    <span className={cn('flex flex-wrap items-center gap-2', className)}>
      {pub.hasPdf ? (
        <span className="inline-flex h-7 items-center gap-1 rounded-full bg-red-50 pl-2 pr-2.5 text-[0.8125rem] font-bold leading-none text-red-600">
          <PdfIcon size={15} strokeWidth={2} className="inline-block" />
          PDF
        </span>
      ) : null}
      {doi ? (
        <span className="mono inline-flex h-7 max-w-[16rem] items-center truncate rounded-full border border-line-strong bg-white px-2.5 text-[0.75rem] text-ink-2">
          <span className="truncate">doi:{doi}</span>
        </span>
      ) : null}
    </span>
  );
}

/**
 * A paper as a list row (index list view, speaker pages): type chip, year, title (stretched
 * link), authors with avatars, venue, PDF and DOI badges. Lifts on hover.
 */
export function PublicationRow({ pub, onPreview, titleAs = 'h3', hideYear }: PublicationItemProps) {
  const look = typeLook(pub.type);
  const note = pub.type === 'preprint' && pub.status === 'preprint' ? null : statusNote(pub.status);
  const Title = titleAs;
  return (
    <article
      className={styles.row}
      onPointerEnter={(e) => e.pointerType === 'mouse' && onPreview?.(pub.id)}
      onPointerLeave={() => onPreview?.(null)}
      data-cursor="open"
    >
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={look.tone} shape={look.shape}>
            {look.label}
          </Chip>
          {note ? <Chip tone={STATUS_TONE[pub.status]}>{note}</Chip> : null}
          {!hideYear && pub.publishedYear ? (
            <span className="label text-ink-3">{pub.publishedYear}</span>
          ) : null}
        </div>
        <Title
          className={cn(
            styles.rowTitle,
            'display max-w-[48rem] text-[clamp(1.25rem,2vw,1.75rem)] tracking-[-0.03em] text-ink',
          )}
          style={{ lineHeight: 1.12 }}
        >
          <CardLink href={`/publications/${pub.slug}`} className="outline-none">
            {pub.title}
          </CardLink>
        </Title>
        {pub.subtitle ? (
          <p className="-mt-1 max-w-[48rem] text-[1rem] text-ink-2">{pub.subtitle}</p>
        ) : null}
        <Authors pub={pub} />
        {pub.containerTitle ? (
          <p className="text-[0.9375rem] italic text-ink-3">
            {pub.containerTitle}
            {pub.publishedYear && hideYear ? (
              <span className="not-italic">{`, ${pub.publishedYear}`}</span>
            ) : null}
          </p>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-3 md:flex-col md:items-end md:justify-between">
        <Badges pub={pub} className="md:justify-end" />
        <span
          className={cn(
            styles.rowArrow,
            'grid size-10 flex-none place-items-center rounded-full border border-line-strong bg-white text-ink',
          )}
          aria-hidden="true"
        >
          <ArrowRight className="size-4" />
        </span>
      </div>
    </article>
  );
}

/** A paper as a grid tile: the same facts on a sheet of paper, with a tilt from the Card. */
export function PublicationTile({ pub, onPreview, titleAs = 'h3' }: PublicationItemProps) {
  const look = typeLook(pub.type);
  const note = pub.type === 'preprint' && pub.status === 'preprint' ? null : statusNote(pub.status);
  const Title = titleAs;
  return (
    <div
      className="h-full"
      onPointerEnter={(e) => e.pointerType === 'mouse' && onPreview?.(pub.id)}
      onPointerLeave={() => onPreview?.(null)}
    >
      <Card
        as="article"
        accent={look.tone}
        className="flex h-full flex-col gap-4 p-5 sm:p-6"
        cursor="open"
        maxTilt={4}
      >
        <span className={styles.fold} aria-hidden="true" />
        <span className={styles.tileShape} aria-hidden="true">
          <ShapeIcon shape={look.shape} size="100%" color={look.hex} />
        </span>
        <div className="flex flex-wrap items-center gap-2 pr-10">
          <Chip tone={look.tone} shape={look.shape}>
            {look.label}
          </Chip>
          {pub.publishedYear ? <span className="label text-ink-3">{pub.publishedYear}</span> : null}
        </div>
        <Title
          className={cn(
            styles.rowTitle,
            'display line-clamp-5 text-[clamp(1.2rem,1.5vw,1.5rem)] tracking-[-0.03em] text-ink',
          )}
          style={{ ['--row-casl' as string]: 0.3, lineHeight: 1.12 }}
        >
          <CardLink href={`/publications/${pub.slug}`}>{pub.title}</CardLink>
        </Title>
        {note ? <Chip tone={STATUS_TONE[pub.status]}>{note}</Chip> : null}
        <div className="mt-auto flex flex-col gap-3">
          <Authors pub={pub} max={2} />
          {pub.containerTitle ? (
            <p className="line-clamp-1 text-[0.875rem] italic text-ink-3">{pub.containerTitle}</p>
          ) : null}
          <Badges pub={pub} />
        </div>
      </Card>
    </div>
  );
}
