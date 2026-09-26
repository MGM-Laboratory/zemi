import type { Metadata } from 'next';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { CaslHeading } from '@/components/motion/casl-heading';
import { CountUp } from '@/components/motion/count-up';
import { Marquee } from '@/components/motion/marquee';
import { shareMeta } from '@/components/public/media/share-meta';
import { getAllSpeakers } from '@/components/public/speakers/data';
import { Enter } from '@/components/public/speakers/enter';
import { FrontRow } from '@/components/public/speakers/front-row';
import { firstParam } from '@/components/public/speakers/lib';
import {
  SpeakersDirectory,
  type SpeakerFrom,
  type SpeakerSort,
} from '@/components/public/speakers/speakers-directory';
import { AvatarStack } from '@/components/public/ui/avatar';
import { ApiUnavailable, EmptyState } from '@/components/public/ui/empty-state';
import { Eyebrow } from '@/components/public/ui/section-header';

export const metadata: Metadata = {
  title: 'Speakers',
  description:
    'Everyone who has stood at the front of a Zemi Friday: postgrad researchers, lecturers and friends of MGM Laboratory. Find a person, see their talks and papers.',
  alternates: { canonical: '/speakers' },
  ...shareMeta({
    title: 'Speakers at Zemi',
    description: 'People who sat at the front. Their talks, their papers, their nicknames.',
    url: '/speakers',
  }),
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const SORTS = new Set<SpeakerSort>(['talks', 'recent', 'name']);
const FROMS = new Set<SpeakerFrom>(['all', 'lab', 'guests']);
const MARQUEE_SHAPES = ['circle', 'triangle', 'square', 'arch'] as const;

export default async function SpeakersPage({ searchParams }: Props) {
  const sp = await searchParams;
  const { items: speakers, unavailable } = await getAllSpeakers();
  const renderedAt = Date.now();

  const sort = firstParam(sp.sort) as SpeakerSort | undefined;
  const from = firstParam(sp.from) as SpeakerFrom | undefined;
  const initial = {
    q: firstParam(sp.q, 120),
    sort: sort && SORTS.has(sort) ? sort : undefined,
    from: from && FROMS.has(from) ? from : undefined,
  };

  const places = new Set(speakers.map((s) => s.defaultOrganization?.trim()).filter(Boolean)).size;
  const talks = speakers.reduce((n, s) => n + s.talkCount, 0);
  const front = speakers.slice(3, 8).map((s) => ({ name: s.fullName, image: s.avatar }));
  const nicknames = speakers
    .map((s) => s.nickname?.trim() || s.fullName.split(/\s+/)[0]!)
    .filter((n, i, a) => a.indexOf(n) === i)
    .slice(0, 24);

  return (
    <>
      <section className="relative overflow-hidden pb-10 pt-[calc(var(--nav-h)+40px)] md:pb-14 md:pt-[calc(var(--nav-h)+88px)]">
        <div className="container-page grid items-end gap-10 lg:grid-cols-12">
          <div className="flex flex-col gap-6 lg:col-span-8">
            <Eyebrow shape="circle">Speakers</Eyebrow>
            <CaslHeading as="h1" size="xl" reveal className="max-w-[12ch] text-ink">
              People who sat at the front.
            </CaslHeading>
            <Enter delay={0.25} y={16}>
              <p className="text-body-l max-w-[36rem] text-ink-2">
                Every Friday someone brings their messy, half-finished research and says it out
                loud. These are those brave people. Find a face, see what they talked about, read
                what they wrote.
              </p>
            </Enter>
          </div>
          {speakers.length ? (
            <div className="flex flex-col gap-6 lg:col-span-4">
              <div className="mx-auto hidden w-full max-w-[26rem] sm:block lg:max-w-none">
                <FrontRow people={speakers.slice(0, 3)} />
              </div>
              <Enter delay={0.4} y={20}>
                <dl className="grid grid-cols-3 gap-4 rounded-[28px] border border-line bg-white p-5 shadow-1 sm:p-6">
                  <div className="col-span-3 flex items-center justify-between gap-3 border-b border-line pb-4">
                    <dt className="label text-ink-3">Regulars</dt>
                    <dd>
                      <AvatarStack people={front} size={40} max={5} />
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="label text-ink-3">People</dt>
                    <dd className="display text-[2rem]">
                      <CountUp value={speakers.length} />
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="label text-ink-3">Talks</dt>
                    <dd className="display text-[2rem]">
                      <CountUp value={talks} />
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="label text-ink-3">Places</dt>
                    <dd className="display text-[2rem]">
                      <CountUp value={places} />
                    </dd>
                  </div>
                </dl>
              </Enter>
            </div>
          ) : null}
        </div>
        {nicknames.length > 4 ? (
          <Marquee
            className="mt-12 md:mt-16"
            speed={40}
            gap="2.25rem"
            label="Nicknames of our speakers"
          >
            {nicknames.map((n, i) => (
              <span key={n} className="flex items-center gap-[2.25rem]">
                <span
                  className="display whitespace-nowrap text-[clamp(2rem,5vw,4.5rem)] text-ink"
                  style={{
                    fontVariationSettings: `'CASL' ${i % 2 ? 1 : 0.2}, 'MONO' 0`,
                    fontWeight: i % 3 ? 900 : 500,
                  }}
                >
                  {n}
                </span>
                <ShapeIcon shape={MARQUEE_SHAPES[i % 4]!} size="clamp(1.25rem, 2.6vw, 2.25rem)" />
              </span>
            ))}
          </Marquee>
        ) : null}
      </section>

      <section
        className="container-page pb-[var(--section-y)] pt-6 md:pt-10"
        aria-label="Speaker directory"
      >
        {unavailable ? (
          <ApiUnavailable what="the speakers" />
        ) : speakers.length ? (
          <SpeakersDirectory speakers={speakers} initial={initial} renderedAt={renderedAt} />
        ) : (
          <EmptyState
            shape="arch"
            friend="square"
            mood="sleepy"
            title="The front of the room is empty."
            body="No speakers yet. The first brave one gets a very warm welcome."
          />
        )}
      </section>
    </>
  );
}
