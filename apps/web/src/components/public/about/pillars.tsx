'use client';

import { lazy, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { SHAPE_CHARACTER } from '@zemi/shared';
import { Character } from '@/components/brand/character';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { SectionHeader } from '@/components/public/ui/section-header';
import { SceneCanvas } from '@/components/three/scene-canvas';
import { useInViewport } from '@/lib/hooks/use-in-viewport';
import { useReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { cn } from '@/lib/utils';
import styles from './about.module.css';
import type { Pillar } from './lib';

const PillarsScene = lazy(() => import('./pillars-scene'));

const AUTO_MS = 5200;

/**
 * "What we believe": the four shapes as four habits. The characters sit on a turning clay
 * table; hover, focus or tap a pillar (or click a character) to bring it to the front and
 * read what it means. Until you touch it, the table turns on its own every few seconds.
 */
export function Pillars({ pillars }: { pillars: Pillar[] }) {
  const [active, setActive] = useState(0);
  const [touched, setTouched] = useState(false);
  const root = useRef<HTMLElement>(null);
  const visible = useInViewport(root, { amount: 0.35 });
  const reduced = useReducedMotion();

  useEffect(() => {
    if (touched || reduced || !visible) return;
    const t = setInterval(() => setActive((i) => (i + 1) % pillars.length), AUTO_MS);
    return () => clearInterval(t);
  }, [touched, reduced, visible, pillars.length]);

  const pick = (i: number) => {
    setTouched(true);
    setActive(i);
  };

  const current = pillars[active]!;
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);

  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const n = pillars.length;
    const next =
      e.key === 'ArrowDown' || e.key === 'ArrowRight'
        ? (active + 1) % n
        : e.key === 'ArrowUp' || e.key === 'ArrowLeft'
          ? (active - 1 + n) % n
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? n - 1
              : -1;
    if (next < 0) return;
    e.preventDefault();
    tabs.current[next]?.focus();
  };

  return (
    <section ref={root} className={styles.section} aria-labelledby="pillars-title">
      <div className="container-page">
        <SectionHeader
          id="pillars-title"
          eyebrow="What we believe"
          eyebrowShape="triangle"
          title="Four shapes. Four habits."
          description="Every research conversation needs all four. They are also our logo, our loaders and our confetti."
        />
        <div className={styles.pillarsGrid}>
          <div className={styles.stage}>
            <SceneCanvas
              className="absolute inset-0"
              camera={{ position: [0, 4.6, 11.6], fov: 30 }}
              studio={{ floor: -2.9, shadowOpacity: 0.22, shadowScale: 14 }}
              label="Q, Hunch, Block and Bridge sit around a round clay table that turns to face you."
              fallback={
                <div className="flex flex-col items-center gap-3">
                  <Character shape={current.shape} mood="happy" size="clamp(120px, 20vw, 220px)" key={current.shape} />
                  <p className="label text-ink-3">{SHAPE_CHARACTER[current.shape].name}</p>
                </div>
              }
            >
              <PillarsScene active={active} onPick={pick} />
            </SceneCanvas>
            <p className={styles.stageCaption} aria-hidden="true">
              <ShapeIcon shape={current.shape} size="0.9em" />
              <span className="mono">
                {SHAPE_CHARACTER[current.shape].name}, {SHAPE_CHARACTER[current.shape].meaning}
              </span>
            </p>
          </div>

          <div className={styles.pillarSide}>
            <div
              role="tablist"
              aria-label="Our four habits"
              aria-orientation="vertical"
              className={styles.pillarList}
              onKeyDown={onTabKey}
            >
              {pillars.map((p, i) => {
                const c = SHAPE_CHARACTER[p.shape];
                const on = i === active;
                return (
                  <button
                    key={p.shape}
                    ref={(el) => void (tabs.current[i] = el)}
                    type="button"
                    role="tab"
                    id={`pillar-tab-${p.shape}`}
                    aria-selected={on}
                    aria-controls={`pillar-panel-${p.shape}`}
                    tabIndex={on ? 0 : -1}
                    className={cn(styles.pillar, on && styles.pillarOn)}
                    data-shape={p.shape}
                    onClick={() => pick(i)}
                    onFocus={() => pick(i)}
                    onPointerEnter={(e) => {
                      if (e.pointerType === 'mouse') pick(i);
                    }}
                  >
                    <span className={styles.pillarIcon} aria-hidden="true">
                      <ShapeIcon shape={p.shape} size="100%" />
                    </span>
                    <span className="flex min-w-0 flex-col items-start">
                      <span className="label text-ink-3">{c.name}</span>
                      <span className={styles.pillarTitle}>{p.title}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {/* All four meanings share one grid cell: the box is as tall as the longest, so nothing jumps. */}
            <div className={styles.pillarPanels}>
              {pillars.map((p, i) => (
                <div
                  key={p.shape}
                  role="tabpanel"
                  id={`pillar-panel-${p.shape}`}
                  aria-labelledby={`pillar-tab-${p.shape}`}
                  className={cn(styles.pillarPanel, i === active && styles.pillarPanelOn)}
                  data-shape={p.shape}
                  aria-hidden={i !== active}
                >
                  <p className="label flex items-center gap-2 text-ink-2">
                    <ShapeIcon shape={p.shape} size="1em" />
                    {SHAPE_CHARACTER[p.shape].name}, {SHAPE_CHARACTER[p.shape].meaning}
                  </p>
                  <p className="text-body-l text-ink">{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
