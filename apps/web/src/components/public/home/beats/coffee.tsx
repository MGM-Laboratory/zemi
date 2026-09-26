'use client';

import { lazy, useCallback, useRef, useState } from 'react';
import { Character } from '@/components/brand/character';
import { CaslHeading } from '@/components/motion/casl-heading';
import { gsap, useGSAP } from '@/components/motion/gsap';
import { SceneCanvas } from '@/components/three/scene-canvas';
import { cn } from '@/lib/utils';
import { BeatStamp } from '../beat-stamp';
import type { HomeSpeaker, StoryScene } from '../types';
import styles from './coffee.module.css';
import { NetworkCanvas } from './network-canvas';

const CoffeeScene = lazy(() => import('./coffee-scene'));

function collabLine(n: number, last: [string, string] | null): string {
  if (n === 0) return 'Move around the table. Tap or click near someone to introduce them.';
  const pair =
    last && last[0] && last[1] ? `${last[0].split(' ')[0]} meets ${last[1].split(' ')[0]}. ` : '';
  if (n === 1) return `${pair}That is how it starts.`;
  if (n < 4) return `${pair}Someone is already drafting a grant.`;
  if (n < 8) return `${pair}You are basically running the coffee table now.`;
  return `${pair}The coffee ran out. The ideas did not.`;
}

/**
 * 14:50, coffee, the good part. A warm room full of drifting people you can link with the
 * cursor, and a steaming clay cup you can clink.
 */
export function CoffeeBeat({
  scene,
  models,
  people,
}: {
  scene: StoryScene;
  models: string[];
  people: HomeSpeaker[];
}) {
  const root = useRef<HTMLElement>(null);
  const [collabs, setCollabs] = useState(0);
  const [last, setLast] = useState<[string, string] | null>(null);
  const [clinks, setClinks] = useState(0);
  // The cup's 3D click runs first; the constellation behind skips that same click.
  const cupClick = useRef(-1);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.fromTo(
          '[data-coffee-in]',
          { y: 40, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            stagger: 0.1,
            duration: 0.9,
            ease: 'expo.out',
            scrollTrigger: { trigger: root.current, start: 'top 65%', once: true },
          },
        );
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  const onConnect = useCallback((a: string, b: string) => {
    setCollabs((c) => c + 1);
    setLast([a, b]);
  }, []);

  return (
    <section
      ref={root}
      id={scene.id}
      className={styles.coffee}
      data-story-time={scene.beat.time}
      aria-labelledby={`${scene.id}-title`}
    >
      <NetworkCanvas
        people={people}
        onConnect={onConnect}
        className={styles.network}
        handledAt={cupClick}
      />
      <div className={cn('container-page', styles.layout)}>
        <div className={styles.copy}>
          <div data-coffee-in="">
            <BeatStamp time={scene.beat.time} label={scene.clockLabel} />
          </div>
          <CaslHeading
            id={`${scene.id}-title`}
            size="l"
            reveal
            className="mt-6 max-w-[11ch] text-ink"
          >
            {scene.beat.title}
          </CaslHeading>
          <p className="text-body-l mt-6 max-w-[30rem] text-ink-2" data-coffee-in="">
            {scene.beat.body}
          </p>
          <div className={styles.tally} data-coffee-in="">
            <div className={styles.tallyItem}>
              <span className={styles.tallyNum}>{collabs}</span>
              <span className="label text-ink-3">
                {collabs === 1 ? 'collab started' : 'collabs started'}
              </span>
            </div>
            <div className={styles.tallyItem}>
              <span className={styles.tallyNum}>{clinks}</span>
              <span className="label text-ink-3">
                {clinks === 1 ? 'cup clinked' : 'cups clinked'}
              </span>
            </div>
          </div>
          <p className={styles.hint} aria-live="polite" data-coffee-in="">
            {collabLine(collabs, last)}
          </p>
        </div>
        <div className={styles.stage}>
          <SceneCanvas
            className="absolute inset-0"
            camera={{ position: [0, 1.6, 9.5], fov: 30 }}
            studio={{ floor: -1.6, shadowOpacity: 0.3, shadowScale: 10 }}
            rootMargin="100% 0px"
            label="A clay coffee cup, steaming, with Block the yellow square sitting next to it."
            fallback={
              <div className="flex items-end gap-4" aria-hidden="true">
                <Character shape="square" size={96} seed={4} mood="happy" />
              </div>
            }
          >
            <CoffeeScene
              models={models}
              clinks={clinks}
              onClink={() => {
                cupClick.current = performance.now();
                setClinks((c) => c + 1);
              }}
            />
          </SceneCanvas>
          <button type="button" className={styles.clink} onClick={() => setClinks((c) => c + 1)}>
            Clink the cup
          </button>
        </div>
      </div>
    </section>
  );
}
