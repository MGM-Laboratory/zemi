import type { Metadata } from 'next';
import { ContactView } from '@/components/public/contact/contact-view';
import { matchTopic, resolveContact } from '@/components/public/contact/lib';
import { withOg } from '@/lib/api/seo';
import { getNextEvent, getSiteOrDefaults } from '@/lib/api/server';

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSiteOrDefaults();
  const contact = resolveContact(site);
  return withOg(
    {
      title: 'Contact',
      description: contact.intro,
      alternates: { canonical: '/contact' },
      openGraph: { url: '/contact', title: 'Contact Zemi', description: contact.intro },
    },
    { site },
  );
}

/**
 * /contact. `?topic=present` (the footer and the about page link here) preselects the matching
 * topic chip; any exact topic label works too.
 */
export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [site, nextEvent, sp] = await Promise.all([getSiteOrDefaults(), getNextEvent(), searchParams]);
  const contact = resolveContact(site);
  const raw = sp.topic;
  const initialTopic = matchTopic(contact.topics, Array.isArray(raw) ? raw[0] : raw);
  return <ContactView contact={contact} initialTopic={initialTopic} nextEvent={nextEvent} />;
}
