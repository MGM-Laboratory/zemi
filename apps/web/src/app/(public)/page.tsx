import type { Metadata } from 'next';
import { loadHome } from '@/components/public/home/data';
import { HomeStory } from '@/components/public/home/home-story';

export async function generateMetadata(): Promise<Metadata> {
  return { alternates: { canonical: '/' } };
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
