import type { Metadata } from 'next';
import { PUBLICATION_TYPES, type PublicationType } from '@zemi/shared';
import { CaslHeading } from '@/components/motion/casl-heading';
import { CountUp } from '@/components/motion/count-up';
import { HighlightSwipe } from '@/components/motion/highlight-swipe';
import { getAllPublications } from '@/components/public/speakers/data';
import { Enter } from '@/components/public/speakers/enter';
import { firstParam } from '@/components/public/speakers/lib';
import { PaperStackStage } from '@/components/public/publications/paper-stack-stage';
import {
  PublicationsBrowser,
  type PublicationFilters,
} from '@/components/public/publications/publications-browser';
import styles from '@/components/public/publications/publications.module.css';
import { slimCard, type PubSort } from '@/components/public/publications/lib';
import { ApiUnavailable, EmptyState } from '@/components/public/ui/empty-state';
import { Eyebrow } from '@/components/public/ui/section-header';

export const metadata: Metadata = {
  title: 'Publications',
  description:
    'Papers, preprints, theses, datasets and software that were presented, argued about or born at Zemi, the Friday seminar of MGM Laboratory. Read them, cite them, borrow the good ideas.',
  alternates: { canonical: '/publications' },
  openGraph: {
    url: '/publications',
    title: 'Publications from Zemi',
    description: 'Papers that sat at our table.',
  },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const SORTS = new Set<PubSort>(['newest', 'oldest', 'title']);

export default async function PublicationsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const { items, unavailable } = await getAllPublications();
  const pubs = items.map(slimCard);

  const type = firstParam(sp.type) as PublicationType | undefined;
  const sort = firstParam(sp.sort) as PubSort | undefined;
  const year = Number(firstParam(sp.year));
  const initial: PublicationFilters = {
    q: firstParam(sp.q, 120),
    type: type && (PUBLICATION_TYPES as readonly string[]).includes(type) ? type : undefined,
    year: Number.isInteger(year) && year > 1900 && year < 2200 ? year : undefined,
    tag: firstParam(sp.tag, 60),
    speaker: firstParam(sp.speaker, 120),
    sort: sort && SORTS.has(sort) ? sort : undefined,
  };

  const withPdf = pubs.filter((p) => p.hasPdf).length;
  const years = pubs.map((p) => p.publishedYear).filter((y): y is number => !!y);
  const first = years.length ? Math.min(...years) : null;
  const kinds = new Set(pubs.map((p) => p.type)).size;

  return (
    <div className={styles.page}>
      <section className="container-page relative grid items-center gap-6 pb-8 pt-[calc(var(--nav-h)+40px)] md:pt-[calc(var(--nav-h)+72px)] lg:grid-cols-12 lg:gap-10 lg:pb-12">
        <div className="relative z-[1] flex flex-col gap-6 lg:col-span-7">
          <Eyebrow shape="square">Publications</Eyebrow>
          <CaslHeading as="h1" size="xl" reveal className="text-ink">
            Papers that sat at our table.
          </CaslHeading>
          <Enter delay={0.25} y={16}>
            <p className="text-body-l max-w-[36rem] text-ink-2">
              Every paper, preprint, thesis and dataset that got argued about on a Friday. Some came
              in finished. Most came in{' '}
              <HighlightSwipe color="yellow" delay={0.6}>
                messy
              </HighlightSwipe>{' '}
              and left a little better. Read them, cite them, borrow the good ideas (with credit).
            </p>
          </Enter>
          {pubs.length ? (
            <Enter delay={0.4} y={16}>
              <dl className="grid max-w-[34rem] grid-cols-4 gap-x-4 gap-y-4 sm:gap-x-8">
                <div className="flex flex-col gap-1">
                  <dt className="label text-ink-3">Papers</dt>
                  <dd className="display text-[clamp(1.5rem,6vw,2.25rem)]">
                    <CountUp value={pubs.length} />
                  </dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="label text-ink-3">With a PDF</dt>
                  <dd className="display text-[clamp(1.5rem,6vw,2.25rem)]">
                    <CountUp value={withPdf} />
                  </dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="label text-ink-3">Kinds</dt>
                  <dd className="display text-[clamp(1.5rem,6vw,2.25rem)]">
                    <CountUp value={kinds} />
                  </dd>
                </div>
                {first ? (
                  <div className="flex flex-col gap-1">
                    <dt className="label text-ink-3">Since</dt>
                    <dd className="display text-[clamp(1.5rem,6vw,2.25rem)]">{first}</dd>
                  </div>
                ) : null}
              </dl>
            </Enter>
          ) : null}
        </div>
        <PaperStackStage className="-mx-[var(--page-margin)] h-[clamp(300px,82vw,440px)] lg:col-span-5 lg:mx-0 lg:h-[clamp(420px,40vw,640px)]" />
      </section>

      <section
        className="container-page relative z-[1] pb-[var(--section-y)]"
        aria-label="All publications"
      >
        {unavailable ? (
          <ApiUnavailable what="the papers" />
        ) : pubs.length ? (
          <PublicationsBrowser pubs={pubs} initial={initial} />
        ) : (
          <EmptyState
            shape="square"
            mood="sleepy"
            title="The table is clear. For now."
            body="No publications yet. The first one gets framed. Metaphorically."
          />
        )}
      </section>
    </div>
  );
}
