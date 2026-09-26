'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { PUBLICATION_TYPE_LABELS, type PublicationCard } from '@zemi/shared';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { gsap, useGSAP } from '@/components/motion/gsap';
import { ZemiImage } from '@/components/public/media/zemi-image';
import { AvatarStack } from '@/components/public/ui/avatar';
import { Button } from '@/components/public/ui/button';
import { SectionHeader } from '@/components/public/ui/section-header';
import { cn } from '@/lib/utils';
import styles from './publications-teaser.module.css';

const STATUS_LABEL: Record<string, string> = {
  published: 'Published',
  'in-press': 'In press',
  accepted: 'Accepted',
  'under-review': 'Under review',
  preprint: 'Preprint',
  'in-progress': 'In progress',
};

/**
 * "Born at the table": a few recent papers as paper cards that float, scatter a little as you
 * scroll, and straighten up when you hover them.
 */
export function PublicationsTeaser({ items, total }: { items: PublicationCard[]; total: number }) {
  if (!items.length) return null;
  return <Desk items={items} total={total} />;
}

function Desk({ items, total }: { items: PublicationCard[]; total: number }) {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference) and (min-width: 768px)', () => {
        gsap.utils.toArray<HTMLElement>('[data-paper]').forEach((el, i) => {
          gsap.fromTo(
            el,
            { y: 120 + i * 40, rotation: [-10, 8, -6, 12][i] ?? 0 },
            {
              y: [0, 40, -20, 30][i] ?? 0,
              rotation: 0,
              ease: 'none',
              scrollTrigger: {
                trigger: root.current,
                start: 'top 90%',
                end: 'center 45%',
                scrub: 0.8,
              },
            },
          );
        });
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <section ref={root} className={styles.pubs} aria-labelledby="pubs-title">
      <div className="container-page">
        <SectionHeader
          id="pubs-title"
          eyebrow="Born at the table"
          eyebrowShape="square"
          title="Some questions grew up into papers."
          description="A Friday talk, a hard question, a few months of work. Here are the latest ones."
          action={
            <Button href="/publications" variant="secondary" shape="square">
              {total > items.length ? `All ${total} publications` : 'All publications'}
            </Button>
          }
        />
        <ul className={styles.desk}>
          {items.map((p, i) => (
            <li key={p.id} className={cn(styles.slot, styles[`slot${i}`])} data-paper="">
              <Link href={`/publications/${p.slug}`} className={styles.paper}>
                <span className={styles.clipTop} aria-hidden="true" />
                <span className="flex items-center justify-between gap-3">
                  <span className="label text-ink-3">
                    {PUBLICATION_TYPE_LABELS[p.type] ?? 'Paper'}
                  </span>
                  <span className="mono text-[0.8125rem] text-ink-3">
                    {p.publishedYear ?? STATUS_LABEL[p.status] ?? ''}
                  </span>
                </span>
                {p.cover ? (
                  <span className={styles.figure}>
                    <ZemiImage
                      image={p.cover}
                      fill
                      sizes="(min-width: 1024px) 22vw, 80vw"
                      alt=""
                      className="size-full"
                    />
                  </span>
                ) : (
                  <span className={cn(styles.figure, styles.figureBlank)} aria-hidden="true">
                    <ShapeIcon
                      shape={(['square', 'circle', 'triangle', 'arch'] as const)[i % 4]}
                      size="34%"
                    />
                    <span className={styles.lines} />
                  </span>
                )}
                <span className={styles.title}>{p.title}</span>
                {p.containerTitle ? (
                  <span className="mt-1.5 block truncate text-[0.875rem] italic text-ink-3">
                    {p.containerTitle}
                  </span>
                ) : null}
                <span className="mt-4 flex items-center justify-between gap-3">
                  <AvatarStack
                    people={p.authors.map((a) => ({ name: a.fullName, image: a.avatar }))}
                    size={30}
                    max={4}
                  />
                  {p.status !== 'published' ? (
                    <span className={styles.status}>{STATUS_LABEL[p.status] ?? p.status}</span>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
