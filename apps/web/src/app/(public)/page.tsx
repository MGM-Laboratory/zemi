import type { Metadata } from 'next';
import { loadHome } from '@/components/public/home/data';
import { HomeStory } from '@/components/public/home/home-story';
import { withOg } from '@/lib/api/seo';
import { getSiteOrDefaults } from '@/lib/api/server';

export async function generateMetadata(): Promise<Metadata> {
  // The title and description come from the layout (SEO settings), og:title and twitter follow them.
  return withOg({ alternates: { canonical: '/' }, openGraph: { url: '/' } }, { site: await getSiteOrDefaults() });
}

/**
 * Home: "A Friday at Zemi". A session that runs from 13:15 to 15:15 as you scroll
 * (DESIGN.md sections 1, 2, 7, 9). Data is fetched here once; every section is resilient to an
 * API that is down.
 */
export default async function HomePage() {
  const data = await loadHome();
  return <HomeStory data={data} />;
}
