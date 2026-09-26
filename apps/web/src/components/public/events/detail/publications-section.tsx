'use client';

import { FileText } from 'lucide-react';
import { PUBLICATION_TYPE_LABELS, type EventDetail } from '@zemi/shared';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { Reveal } from '@/components/motion/reveal';
import { stagger } from '@/components/motion/stagger';
import { ZemiImage } from '@/components/public/media/zemi-image';
import { AvatarStack } from '@/components/public/ui/avatar';
import { Card, CardLink } from '@/components/public/ui/card';
import { Chip } from '@/components/public/ui/chip';
import { SectionHeader } from '@/components/public/ui/section-header';
import { cn } from '@/lib/utils';

export function PublicationsSection({
  publications,
  className,
}: {
  publications: EventDetail['publications'];
  className?: string;
}) {
  if (!publications.length) return null;
  return (
    <section className={cn('container-page', className)} aria-labelledby="pubs-title">
      <SectionHeader
        eyebrow="Reading list"
        eyebrowShape="triangle"
        id="pubs-title"
        title="The papers behind the talks"
        size="m"
        description="For the ones who want the footnotes."
      />
      <ul className="mt-10 grid grid-cols-1 gap-[var(--gutter)] sm:grid-cols-2 xl:grid-cols-3">
        {publications.map((p, i) => (
          <Reveal as="li" key={p.id} delay={stagger(i, 0.07)}>
            <Card className="h-full" cursor="open" maxTilt={4}>
              <div className="flex h-full gap-5 p-5 sm:p-6">
                <div className="w-[88px] flex-none sm:w-[104px]">
                  <ZemiImage
                    image={p.cover}
                    aspect="4/5"
                    sizes="104px"
                    className="rounded-[14px]"
                    fallback={
                      <span
                        className="grid size-full place-items-center bg-surface-muted"
                        aria-hidden="true"
                      >
                        <FileText className="size-7 text-ink-4" />
                      </span>
                    }
                  />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    <Chip tone="outline" mono>
                      {PUBLICATION_TYPE_LABELS[p.type]}
                    </Chip>
                    {p.publishedYear ? (
                      <Chip tone="neutral" mono>
                        {p.publishedYear}
                      </Chip>
                    ) : null}
                  </div>
                  <h3 className="text-[1.125rem] font-extrabold leading-snug text-ink">
                    <CardLink href={`/publications/${p.slug}`}>{p.title}</CardLink>
                  </h3>
                  {p.containerTitle ? (
                    <p className="line-clamp-2 text-[0.875rem] italic text-ink-3">
                      {p.containerTitle}
                    </p>
                  ) : null}
                  {p.note ? (
                    <p className="flex items-start gap-2 text-[0.875rem] text-ink-2">
                      <ShapeIcon shape="arch" size="0.9em" className="mt-[0.25em]" />
                      {p.note}
                    </p>
                  ) : null}
                  {p.authors.length ? (
                    <div className="mt-auto flex items-center gap-2 pt-2">
                      <AvatarStack
                        people={p.authors.map((a) => ({ name: a.fullName, image: a.avatar }))}
                        max={4}
                        size={26}
                      />
                      <span className="truncate text-[0.8125rem] text-ink-3">
                        {p.authors
                          .slice(0, 2)
                          .map((a) => a.fullName)
                          .join(', ')}
                        {p.authors.length > 2 ? ` and ${p.authors.length - 2} more` : ''}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
            </Card>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}
