import { CoffeeBeat } from './beats/coffee';
import { GenericBeat } from './beats/generic-beat';
import { LonelyBeat } from './beats/lonely';
import { OutLoudBeat } from './beats/out-loud';
import { QuestionBeat } from './beats/question';
import { SameTableBeat } from './beats/same-table';
import { Hero } from './hero/hero';
import { Closing } from './closing';
import { IdlePeek } from './idle-peek';
import { PastGallery } from './past-gallery';
import { PublicationsTeaser } from './publications-teaser';
import { SkipStoryLink } from './skip-story';
import { SpeakersMarquee } from './speakers-marquee';
import { Stats } from './stats';
import { UpNext } from './up-next';
import type { HomeData } from './types';

const ROOT_ID = 'home-story';

/**
 * The home page composition (server). Sections run in story order, stamped 1, 2, 3... from the
 * first beat to the closing.
 */
export function HomeStory({ data }: { data: HomeData }) {
  const { home, doors, scenes, closing } = data;
  const storyId = scenes[0]?.id ?? 'up-next';

  return (
    <div id={ROOT_ID}>
      <SkipStoryLink targetId="up-next">Skip the story, jump to the next Friday</SkipStoryLink>
      <Hero
        home={home}
        doors={doors}
        next={data.next}
        lastFriday={data.past[0] ?? null}
        storyId={storyId}
        offline={data.scheduleOffline}
      />
      {scenes.map((scene, i) => {
        switch (scene.kind) {
          case 'lonely':
            return <LonelyBeat key={scene.id} scene={scene} />;
          case 'table':
            return <SameTableBeat key={scene.id} scene={scene} />;
          case 'question':
            return <QuestionBeat key={scene.id} scene={scene} />;
          case 'coffee':
            return (
              <CoffeeBeat
                key={scene.id}
                scene={scene}
                models={data.models}
                people={data.speakers}
              />
            );
          case 'loud':
            return <OutLoudBeat key={scene.id} scene={scene} models={data.models} />;
          default:
            return <GenericBeat key={scene.id} scene={scene} index={i} />;
        }
      })}
      <UpNext
        data={{
          featured: data.featured,
          featuredDetail: data.featuredDetail,
          next: data.next,
          offline: data.scheduleOffline,
        }}
      />
      <PastGallery events={data.past} total={data.pastTotal} offline={data.archiveOffline} />
      <SpeakersMarquee people={data.speakers} total={data.speakersTotal} />
      <Stats
        stats={data.stats}
        funStat={home.funStat}
        enabled={home.statsEnabled}
        offline={data.offline}
      />
      <PublicationsTeaser items={data.publications} total={data.publicationsTotal} />
      <Closing beat={closing} n={scenes.length + 1} next={data.next} />
      <IdlePeek />
    </div>
  );
}
