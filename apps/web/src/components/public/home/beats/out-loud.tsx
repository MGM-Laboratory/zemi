'use client';

import { lazy, useRef } from 'react';
import { Character } from '@/components/brand/character';
import { CaslHeading } from '@/components/motion/casl-heading';
import { gsap, useGSAP } from '@/components/motion/gsap';
import { SceneCanvas } from '@/components/three/scene-canvas';
import { useMediaQuery } from '@/lib/hooks/use-media-query';
import { cn } from '@/lib/utils';
import { BeatStamp } from '../beat-stamp';
import { MQ, pinEnd } from '../motion-config';
import type { StoryScene } from '../types';
import styles from './beats.module.css';

const TableScene = lazy(() => import('./table-scene'));

/**
 * 13:30, we say it out loud. Pinned 3D scene: the characters roll in and gather around the
 * seminar table while the camera dollies in. The models were preloaded and cached by the
 * first-visit loader, so the scene never waits for a download mid-scroll.
 */
export function OutLoudBeat({ scene, models }: { scene: StoryScene; models: string[] }) {
  const root = useRef<HTMLElement>(null);
  const progress = useRef(0);
  const narrow = useMediaQuery('(max-width: 1023.98px)', false);

  useGSAP(
    () => {
      const el = root.current;
      if (!el) return;
      const mm = gsap.matchMedia();
      mm.add(MQ, (ctx) => {
        const c = ctx.conditions as Record<string, boolean>;
        if (c.reduced) {
          progress.current = 1;
          return;
        }
        const end = pinEnd(c, 2.2, 1.3);
        gsap.fromTo(
          '[data-loud-copy]',
          { y: 40, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            stagger: 0.08,
            duration: 0.9,
            ease: 'expo.out',
            scrollTrigger: { trigger: el, start: 'top 70%', once: true },
          },
        );
        gsap.timeline({
          scrollTrigger: {
            trigger: el,
            start: end ? 'top top' : 'top 80%',
            end: end ?? 'bottom 20%',
            pin: !!end,
            scrub: true,
            onUpdate: (self) => {
              progress.current = self.progress;
            },
          },
        });
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <section
      ref={root}
      id={scene.id}
      className={cn(styles.pinned, styles.loud)}
      aria-labelledby={`${scene.id}-title`}
    >
      <div className={cn('container-page', styles.split)}>
        <div className={styles.copy}>
          <div data-loud-copy="">
            <BeatStamp n={scene.n} label={scene.label} />
          </div>
          <CaslHeading id={`${scene.id}-title`} size="l" reveal className="mt-6 text-ink">
            {scene.beat.title}
          </CaslHeading>
          <p className="text-body-l mt-6 max-w-[32rem] text-ink-2" data-loud-copy="">
            {scene.beat.body}
          </p>
        </div>
        <div className={styles.stage}>
          <SceneCanvas
            className="absolute inset-0"
            camera={{ position: [0, 10.5, 19], fov: 30 }}
            studio={{ floor: 0.001, shadowScale: 22, shadowOpacity: 0.34 }}
            rootMargin="120% 0px"
            label="Q, Hunch, Block and Bridge roll in and sit on stools around a round seminar table. Hunch talks into a microphone."
            placeholder={null}
            fallback={
              <div className="flex items-end gap-3" aria-hidden="true">
                <Character shape="circle" size={88} seed={0} />
                <Character shape="triangle" size={104} seed={1} mood="happy" />
                <Character shape="square" size={84} seed={2} />
                <Character shape="arch" size={88} seed={3} />
              </div>
            }
          >
            <TableScene progress={progress} models={models} narrow={narrow} />
          </SceneCanvas>
        </div>
      </div>
    </section>
  );
}
