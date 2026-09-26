import type { Metadata } from 'next';
import { AboutHero } from '@/components/public/about/about-hero';
import { Audiences } from '@/components/public/about/audiences';
import { Faq } from '@/components/public/about/faq';
import { FridayTimeline } from '@/components/public/about/friday-timeline';
import { Lab } from '@/components/public/about/lab';
import { resolveAbout } from '@/components/public/about/lib';
import { Pillars } from '@/components/public/about/pillars';
import { PresentSteps } from '@/components/public/about/present-steps';
import { Story } from '@/components/public/about/story';
import { Team } from '@/components/public/about/team';
import { ZemiWord } from '@/components/public/about/zemi-word';
import { withOg } from '@/lib/api/seo';
import { getSiteOrDefaults } from '@/lib/api/server';

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSiteOrDefaults();
  const { about } = resolveAbout(site);
  const description = about.intro.length > 200 ? `${about.intro.slice(0, 197).replace(/\s+\S*$/, '')}...` : about.intro;
  return withOg(
    {
      title: 'About',
      description,
      alternates: { canonical: '/about' },
      openGraph: { url: '/about', title: 'About Zemi', description },
    },
    { site },
  );
}

/**
 * /about: the story of Zemi. Everything comes from the site settings (about, general), the
 * published FAQ, the team and the stats, with the shared defaults when the API is down.
 */
export default async function AboutPage() {
  const data = resolveAbout(await getSiteOrDefaults());
  const { about } = data;
  return (
    <>
      <AboutHero title={about.title} intro={about.intro} stats={data.stats} />
      <ZemiWord firstEventAt={data.stats.firstEventAt} />
      <Pillars pillars={data.pillars} />
      <Story blocks={about.story} />
      <Audiences audiences={about.audiences} />
      <FridayTimeline />
      <PresentSteps steps={about.presentSteps} cta={about.presentCta} />
      <Team team={data.team} />
      <Faq faqs={data.faqs} />
      <Lab name={data.labName} url={data.labUrl} />
    </>
  );
}
