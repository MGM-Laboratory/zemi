import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  formatJakarta,
  type LinkKind,
  type PublicationCard,
  type SpeakerCard,
  type SpeakerPublic,
} from '@zemi/shared';
import { CaslHeading } from '@/components/motion/casl-heading';
import { LinkIcon, LINK_KIND_LABELS, linkDisplay } from '@/components/icons';
import { BlocksRenderer, hasBlocks } from '@/components/public/media/blocks-renderer';
import { slimCard } from '@/components/public/publications/lib';
import { SectionTitle } from '@/components/public/publications/publication-parts';
import { getAllPublications, getAllSpeakers } from '@/components/public/speakers/data';
import { Enter } from '@/components/public/speakers/enter';
import {
  hashString,
  isHttp,
  isLabOrg,
  jsonLdString,
  positionLine,
  publicLinks,
  siteUrl,
  talkWord,
} from '@/components/public/speakers/lib';
import { OtherSpeakers } from '@/components/public/speakers/other-speakers';
import { SpeakerHeroPortrait } from '@/components/public/speakers/speaker-hero-portrait';
import { SpeakerPapers } from '@/components/public/speakers/speaker-papers';
import styles from '@/components/public/speakers/speakers.module.css';
import { TalksTimeline } from '@/components/public/speakers/talks-timeline';
import { Button } from '@/components/public/ui/button';
import { ApiUnavailable, EmptyState } from '@/components/public/ui/empty-state';
import { Eyebrow, SectionHeader } from '@/components/public/ui/section-header';
import { getSpeaker, unwrapLookup } from '@/lib/api/server';

type Props = { params: Promise<{ slug: string }> };

function firstName(s: Pick<SpeakerPublic, 'fullName' | 'nickname'>) {
  return s.nickname?.trim() || s.fullName.split(/\s+/)[0]!;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const lookup = await getSpeaker(slug);
  if (lookup.kind === 'redirect') return { alternates: { canonical: `/speakers/${lookup.slug}` } };
  if (lookup.kind !== 'found') return { title: 'Speaker' };
  const s = lookup.data;
  const url = `/speakers/${s.slug}`;
  const where = positionLine(s.defaultPosition, s.defaultOrganization);
  const description = [
    s.headline,
    where,
    s.talkCount
      ? `${talkWord(s.talkCount)} at Zemi, the Friday seminar of MGM Laboratory.`
      : 'Speaker at Zemi, the Friday seminar of MGM Laboratory.',
  ]
    .filter(Boolean)
    .join('. ')
    .replace(/\.\./g, '.');
  const images = s.avatar
    ? [{ url: s.avatar.src, width: s.avatar.width, height: s.avatar.height, alt: s.fullName }]
    : undefined;
  return {
    title: s.fullName,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'profile',
      url,
      title: `${s.fullName} at Zemi`,
      description,
      ...(images ? { images } : null),
    },
    twitter: {
      card: 'summary',
      title: `${s.fullName} at Zemi`,
      description,
      ...(images ? { images: images.map((i) => i.url) } : null),
    },
  };
}

/** schema.org Person. https://schema.org/Person */
function jsonLd(s: SpeakerPublic) {
  const links = publicLinks(s.links);
  const sameAs = links.filter((l) => isHttp(l.href)).map((l) => l.href);
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': siteUrl(`/speakers/${s.slug}`),
    url: siteUrl(`/speakers/${s.slug}`),
    name: s.fullName,
    ...(s.nickname && s.nickname !== s.fullName ? { alternateName: s.nickname } : null),
    ...(s.headline ? { description: s.headline } : null),
    ...(s.defaultPosition ? { jobTitle: s.defaultPosition } : null),
    ...(s.defaultOrganization
      ? { affiliation: { '@type': 'Organization', name: s.defaultOrganization } }
      : null),
    ...(s.avatar ? { image: s.avatar.src } : null),
    ...(sameAs.length ? { sameAs } : null),
    ...(s.talks.length
      ? {
          performerIn: s.talks
            .filter((t) => t.status !== 'cancelled')
            .slice(0, 20)
            .map((t) => ({
              '@type': 'Event',
              name: t.talkTitle || t.eventTitle,
              startDate: t.startsAt,
              url: siteUrl(`/events/${t.eventSlug}`),
            })),
        }
      : null),
  };
}

/** Other people to meet: same organization first, then a stable mix (no randomness on the server). */
function pickOthers(all: SpeakerCard[], me: SpeakerPublic, n = 10): SpeakerCard[] {
  const lab = isLabOrg(me.defaultOrganization);
  return all
    .filter((s) => s.slug !== me.slug)
    .map((s) => ({
      s,
      score:
        (s.defaultOrganization && s.defaultOrganization === me.defaultOrganization
          ? 0
          : isLabOrg(s.defaultOrganization) === lab
            ? 1
            : 2) *
          1e10 +
        (hashString(`${me.slug}:${s.slug}`) % 1e9),
    }))
    .sort((a, b) => a.score - b.score)
    .slice(0, n)
    .map((x) => x.s);
}

export default async function SpeakerPage({ params }: Props) {
  const { slug } = await params;
  const speaker = unwrapLookup(await getSpeaker(slug), '/speakers');
  if (!speaker) {
    return (
      <section className="container-page pb-[var(--section-y)] pt-[calc(var(--nav-h)+64px)]">
        <ApiUnavailable what="this person" />
      </section>
    );
  }

  const [allSpeakers, papers] = await Promise.all([
    getAllSpeakers(),
    getAllPublications({ speaker: speaker.slug }),
  ]);
  const renderedAt = Date.now();
  const others = pickOthers(allSpeakers.items, speaker);
  const links = publicLinks(speaker.links);
  const where = positionLine(speaker.defaultPosition, speaker.defaultOrganization);
  const name = firstName(speaker);
  const liveTalks = speaker.talks.filter((t) => t.status !== 'cancelled');
  const firstTalk = liveTalks.length ? liveTalks[liveTalks.length - 1] : null;
  const nextTalk =
    [...liveTalks].reverse().find((t) => t.status === 'scheduled' || t.status === 'ongoing') ??
    null;
  const pubCards: PublicationCard[] = papers.items.map(slimCard);
  const pubCount = pubCards.length || speaker.publications.length;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd(speaker)) }}
      />

      <section className="relative overflow-hidden pb-16 pt-[calc(var(--nav-h)+28px)] md:pb-24 md:pt-[calc(var(--nav-h)+56px)]">
        <div className="container-page">
          <Enter y={10}>
            <Link
              href="/speakers"
              className="group mb-4 inline-flex items-center gap-2 rounded-full py-1 pr-2 text-[0.9375rem] font-bold text-ink-2 transition-colors hover:text-ink md:mb-12"
            >
              <span className="grid size-8 place-items-center rounded-full border border-line-strong transition-transform duration-300 group-hover:-translate-x-1">
                <ArrowLeft className="size-4" aria-hidden="true" />
              </span>
              All speakers
            </Link>
          </Enter>
          <div className="grid items-center gap-8 md:grid-cols-12 md:gap-[var(--gutter)]">
            <div className="md:col-span-5 lg:col-span-5">
              <SpeakerHeroPortrait
                slug={speaker.slug}
                name={speaker.fullName}
                image={speaker.avatar}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-6 md:col-span-7 lg:col-span-6 lg:col-start-7">
              <Enter delay={0.05} y={12}>
                <Eyebrow shape="triangle">
                  {speaker.talkCount >= 5
                    ? 'Friday regular'
                    : speaker.talkCount > 1
                      ? 'Came back for more'
                      : 'Speaker'}
                </Eyebrow>
              </Enter>
              <CaslHeading as="h1" size="l" reveal className="text-ink [overflow-wrap:anywhere]">
                {speaker.fullName}
              </CaslHeading>
              <Enter delay={0.2} className="flex flex-col gap-4">
                {speaker.nickname && speaker.nickname !== speaker.fullName ? (
                  <p className="text-body-l text-ink-2">
                    Goes by{' '}
                    <span
                      className="display relative inline-block text-[1.35em] text-ink"
                      style={{ fontVariationSettings: "'CASL' 1, 'MONO' 0" }}
                    >
                      {speaker.nickname}
                      <svg
                        viewBox="0 0 120 12"
                        preserveAspectRatio="none"
                        className="absolute -bottom-1.5 left-0 h-2.5 w-full text-yellow"
                        aria-hidden="true"
                      >
                        <path
                          d="M2 8 Q30 2 60 7 T118 5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="4"
                          strokeLinecap="round"
                        />
                      </svg>
                    </span>
                    .
                  </p>
                ) : null}
                {speaker.headline ? (
                  <p className="text-body-l max-w-[36rem] text-ink">{speaker.headline}</p>
                ) : null}
                {where ? <p className="label text-ink-3">{where}</p> : null}
              </Enter>
              {links.length ? (
                <Enter delay={0.3}>
                  <ul className="flex flex-wrap gap-2" aria-label={`${name} online`}>
                    {links.map((l) => {
                      const label =
                        l.label?.trim() ||
                        LINK_KIND_LABELS[l.kind as LinkKind] ||
                        linkDisplay(l.href);
                      const external = isHttp(l.href);
                      return (
                        <li key={`${l.kind}-${l.href}`}>
                          <a
                            href={l.href}
                            className={styles.linkPill}
                            {...(external
                              ? { target: '_blank', rel: 'noopener noreferrer' }
                              : null)}
                            title={linkDisplay(l.href)}
                          >
                            <LinkIcon kind={l.kind} size={20} />
                            {label}
                            {external ? (
                              <span className="sr-only"> (opens in a new tab)</span>
                            ) : null}
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </Enter>
              ) : null}
              <Enter delay={0.4}>
                <dl className="grid max-w-[34rem] grid-cols-3 gap-4 border-t border-line pt-6">
                  <div className="flex flex-col gap-1">
                    <dt className="label text-ink-3">Talks</dt>
                    <dd className="display text-[2rem] text-ink">{speaker.talkCount}</dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="label text-ink-3">Papers</dt>
                    <dd className="display text-[2rem] text-ink">{pubCount}</dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="label text-ink-3">First Friday</dt>
                    <dd className="display text-[1.35rem] leading-[1.2] text-ink">
                      {firstTalk ? formatJakarta(firstTalk.startsAt, 'month-year') : 'Soon'}
                    </dd>
                  </div>
                </dl>
              </Enter>
              {nextTalk ? (
                <Enter delay={0.45}>
                  <Button href={`/events/${nextTalk.eventSlug}`} size="lg" cursor="register">
                    {nextTalk.status === 'ongoing'
                      ? `Watch ${name} now`
                      : `Catch ${name} on ${formatJakarta(nextTalk.startsAt, 'date-short')}`}
                  </Button>
                </Enter>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {hasBlocks(speaker.bio) ? (
        <section className="container-page pb-[var(--section-y)]" aria-labelledby="bio">
          <div className="grid gap-8 md:grid-cols-12 md:gap-[var(--gutter)]">
            <div className="md:col-span-4 lg:col-span-3">
              <SectionTitle shape="circle" id="bio">
                The short version
              </SectionTitle>
            </div>
            <div className="max-w-[42rem] md:col-span-8 lg:col-span-7">
              <BlocksRenderer blocks={speaker.bio} size="lg" />
            </div>
          </div>
        </section>
      ) : null}

      <section className="container-page pb-[var(--section-y)]" aria-labelledby="talks">
        <SectionHeader
          id="talks"
          eyebrow="Talks"
          eyebrowShape="square"
          title={speaker.talks.length ? `${name}'s Fridays` : 'No Fridays yet'}
          size="m"
          description={
            speaker.talks.length
              ? 'Newest first. Every one of these started as a messy draft.'
              : undefined
          }
          className="mb-10 md:mb-14"
        />
        {speaker.talks.length ? (
          <TalksTimeline talks={speaker.talks} />
        ) : (
          <EmptyState
            shape="square"
            mood="thinking"
            size="sm"
            title={`${name} hasn't taken the front yet.`}
            body="When they do, it shows up here."
          />
        )}
      </section>

      {pubCount ? (
        <section className="container-page pb-[var(--section-y)]" aria-labelledby="papers">
          <SectionHeader
            id="papers"
            eyebrow="Papers"
            eyebrowShape="circle"
            title="Things they wrote"
            size="m"
            action={
              <Button
                href={`/publications?speaker=${encodeURIComponent(speaker.slug)}`}
                variant="secondary"
                shape="square"
                data-transition="off"
              >
                All their papers
              </Button>
            }
            className="mb-8 md:mb-10"
          />
          {pubCards.length ? (
            <SpeakerPapers pubs={pubCards} />
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {speaker.publications.map((p) => (
                <li key={p.slug} className="py-4">
                  <Link
                    href={`/publications/${p.slug}`}
                    className="display text-[1.25rem] text-ink underline-offset-4 hover:underline"
                  >
                    {p.title}
                  </Link>
                  {p.year ? <span className="label ml-3 text-ink-3">{p.year}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {others.length ? (
        <section className="pb-[var(--section-y)]" aria-labelledby="others">
          <div className="container-page">
            <SectionHeader
              id="others"
              eyebrow="Also at the front"
              eyebrowShape="arch"
              title="Other speakers"
              size="m"
              className="mb-4"
            />
          </div>
          <OtherSpeakers speakers={others} renderedAt={renderedAt} />
        </section>
      ) : null}
    </>
  );
}
