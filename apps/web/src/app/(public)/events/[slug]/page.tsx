import type { Metadata } from 'next';
import { formatJakarta, type EventDetail } from '@zemi/shared';
import { EventExperience } from '@/components/public/events/detail/event-experience';
import { eventLabel, siteUrl, venueLine } from '@/components/public/events/lib';
import { BlocksRenderer, hasBlocks } from '@/components/public/media/blocks-renderer';
import { ApiUnavailable } from '@/components/public/ui/empty-state';
import { getEvent, unwrapLookup } from '@/lib/api/server';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const lookup = await getEvent(slug);
  if (lookup.kind !== 'found') return { title: 'Friday' };
  const e = lookup.data;
  const title = `${e.title} (${eventLabel(e)})`;
  const description =
    e.summary ??
    `${eventLabel(e)} at Zemi, ${formatJakarta(e.startsAt, 'date-long')}, ${formatJakarta(e.startsAt, 'time')} WIB. Free, hybrid, bring questions.`;
  const url = `/events/${e.slug}`;
  const images = e.cover
    ? [
        {
          url: e.cover.src,
          width: e.cover.width,
          height: e.cover.height,
          alt: e.cover.alt ?? e.title,
        },
      ]
    : undefined;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: 'website', url, title, description, ...(images ? { images } : null) },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(images ? { images: images.map((i) => i.url) } : null),
    },
  };
}

/** schema.org Event. https://schema.org/Event */
function jsonLd(e: EventDetail) {
  const url = siteUrl(`/events/${e.slug}`);
  const place = e.venueFull
    ? {
        '@type': 'Place',
        name: venueLine(e) ?? e.venueFull.name,
        ...(e.venueFull.address
          ? {
              address: {
                '@type': 'PostalAddress',
                streetAddress: e.venueFull.address,
                addressCountry: 'ID',
              },
            }
          : null),
      }
    : null;
  const virtual = { '@type': 'VirtualLocation', url };
  const location =
    e.mode === 'online' ? virtual : e.mode === 'offline' ? place : [place, virtual].filter(Boolean);
  const status =
    e.status === 'cancelled'
      ? 'https://schema.org/EventCancelled'
      : 'https://schema.org/EventScheduled';
  const attendance =
    e.mode === 'online'
      ? 'https://schema.org/OnlineEventAttendanceMode'
      : e.mode === 'offline'
        ? 'https://schema.org/OfflineEventAttendanceMode'
        : 'https://schema.org/MixedEventAttendanceMode';
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: e.title,
    description: e.summary ?? undefined,
    url,
    startDate: e.startsAt,
    endDate: e.endsAt,
    eventStatus: status,
    eventAttendanceMode: attendance,
    location: location ?? undefined,
    image: e.cover ? [e.cover.src] : undefined,
    isAccessibleForFree: true,
    inLanguage: 'en',
    organizer: { '@type': 'Organization', name: 'MGM Laboratory', url: 'https://labmgm.org' },
    performer: e.speakersFull.map((s) => ({
      '@type': 'Person',
      name: s.fullName,
      url: siteUrl(`/speakers/${s.slug}`),
      ...(s.organization
        ? { affiliation: { '@type': 'Organization', name: s.organization } }
        : null),
    })),
    offers: {
      '@type': 'Offer',
      price: 0,
      priceCurrency: 'IDR',
      url: `${url}#register`,
      availability:
        e.registration.open && (e.registration.spotsLeft ?? 1) > 0
          ? 'https://schema.org/InStock'
          : 'https://schema.org/SoldOut',
    },
  };
}

/** Request time on the server (kept out of render so the purity lint stays happy). */
function requestTime() {
  return Date.now();
}

export default async function EventPage({ params }: Props) {
  const { slug } = await params;
  const now = requestTime();
  const event = unwrapLookup(await getEvent(slug), '/events');
  if (!event) {
    return (
      <section className="container-page pb-[var(--section-y)] pt-[calc(var(--nav-h)+64px)]">
        <ApiUnavailable what="this Friday" />
      </section>
    );
  }

  // `<` escaped so a title can never close the script tag.
  const ld = JSON.stringify(jsonLd(event)).replace(/</g, '\\u003c');

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld }} />
      <EventExperience
        event={event}
        renderedAt={now}
        description={
          hasBlocks(event.description) ? (
            <BlocksRenderer blocks={event.description} size="md" />
          ) : null
        }
      />
    </>
  );
}
