'use client';

import { lazy, useEffect, useRef } from 'react';
import { Character } from '@/components/brand/character';
import { CaslHeading } from '@/components/motion/casl-heading';
import { gsap, useGSAP } from '@/components/motion/gsap';
import { preloadSceneRuntime, SceneCanvas } from '@/components/three/scene-canvas';
import { SceneLoading } from '@/components/three/scene-loading';
import { useMediaQuery } from '@/lib/hooks/use-media-query';
import { cn } from '@/lib/utils';
import { BeatStamp } from '../beat-stamp';
import { MQ, pinEnd } from '../motion-config';
import type { StoryScene } from '../types';
import styles from './beats.module.css';

const loadTableScene = () => import('./table-scene');
const TableScene = lazy(loadTableScene);

/**
 * 13:30, we say it out loud. Pinned 3D scene: the characters roll in and gather around the
 * seminar table while the camera dollies in. The models were preloaded and cached by the
 * first-visit loader (and warmed again on idle), so the scene rarely waits mid-scroll; when it
 * does, the stage shows a loading state, then the 2D cast if it takes too long.
 */
export function OutLoudBeat({ scene, models }: { scene: StoryScene; models: string[] }) {
  const root = useRef<HTMLElement>(null);
  const progress = useRef(0);
  const narrow = useMediaQuery('(max-width: 1023.98px)', false);

  // Fetch three.js, this scene and the models as soon as the page is idle, not when the scene
  // nears the viewport: on a slow connection a reader can reach 13:30 before they arrive.
  useEffect(() => {
    const warm = () => {
      void preloadSceneRuntime();
      void loadTableScene().catch(() => undefined);
      void import('@/components/three/preload-models')
        .then((m) => m.preloadModels())
        .catch(() => undefined);
    };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(warm, { timeout: 2500 });
      return () => window.cancelIdleCallback(id);
    }
    const t = window.setTimeout(warm, 1200);
    return () => window.clearTimeout(t);
  }, []);

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
            placeholder={<SceneLoading label="Pulling up the stools" />}
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
