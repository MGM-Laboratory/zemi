import { SHAPE_ORDER } from '@zemi/shared';
import { Character } from '@/components/brand/character';
import { CaslHeading } from '@/components/motion/casl-heading';
import { Reveal } from '@/components/motion/reveal';
import { BeatStamp } from '../beat-stamp';
import type { StoryScene } from '../types';

/**
 * Any extra beat an admin adds to the Friday (site settings "home"): stamped with its time, big
 * title, body, and whichever character's turn it is.
 */
export function GenericBeat({ scene, index }: { scene: StoryScene; index: number }) {
  const shape = SHAPE_ORDER[index % 4]!;
  const friend = SHAPE_ORDER[(index + 2) % 4]!;
  return (
    <section
      id={scene.id}
      data-story-time={scene.beat.time}
      aria-labelledby={`${scene.id}-title`}
      className="relative overflow-hidden bg-surface-muted py-[var(--section-y)]"
    >
      <div className="container-page grid items-center gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="flex flex-col items-start">
          <BeatStamp time={scene.beat.time} label={scene.clockLabel} />
          <CaslHeading
            id={`${scene.id}-title`}
            size="l"
            reveal
            className="mt-6 max-w-[14ch] text-ink"
          >
            {scene.beat.title}
          </CaslHeading>
          {scene.beat.body ? (
            <Reveal>
              <p className="text-body-l mt-6 max-w-[34rem] text-ink-2">{scene.beat.body}</p>
            </Reveal>
          ) : null}
        </div>
        <div className="flex items-end justify-center gap-4" aria-hidden="true">
          <Character
            shape={shape}
            size="clamp(120px, 16vw, 240px)"
            seed={index + 30}
            mood="happy"
          />
          <Character
            shape={friend}
            size="clamp(80px, 10vw, 150px)"
            seed={index + 31}
            mood="thinking"
          />
        </div>
      </div>
    </section>
  );
}
