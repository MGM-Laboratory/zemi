'use client';

import Link from 'next/link';
import { SHAPE_ORDER, SHAPE_PATHS_46, type ShapeName } from '@zemi/shared';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { Marquee } from '@/components/motion/marquee';
import { ZemiImage } from '@/components/public/media/zemi-image';
import { Avatar } from '@/components/public/ui/avatar';
import { Button } from '@/components/public/ui/button';
import { SectionHeader } from '@/components/public/ui/section-header';
import styles from './speakers-marquee.module.css';
import type { HomeSpeaker } from './types';

/** clipPath defs for faces on brand shapes (objectBoundingBox, so any size works). */
function ShapeClips() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true" focusable="false">
      <defs>
        {SHAPE_ORDER.map((s) => (
          <clipPath key={s} id={`zemi-face-${s}`} clipPathUnits="objectBoundingBox">
            <path d={SHAPE_PATHS_46[s]} transform="scale(0.021739)" />
          </clipPath>
        ))}
      </defs>
    </svg>
  );
}

function Face({ person, shape, i }: { person: HomeSpeaker; shape: ShapeName; i: number }) {
  return (
    <Link
      href={`/speakers/${person.slug}`}
      className={styles.face}
      style={{ ['--tilt' as string]: `${((i * 37) % 13) - 6}deg` }}
      data-cursor="open"
      aria-label={`${person.fullName}, ${person.talkCount} ${person.talkCount === 1 ? 'talk' : 'talks'}`}
    >
      <span className={styles.shape} data-shape={shape}>
        {person.avatar ? (
          <span className={styles.clip} style={{ clipPath: `url(#zemi-face-${shape})` }}>
            <ZemiImage image={person.avatar} fill sizes="200px" alt="" className="size-full" />
          </span>
        ) : (
          <Avatar name={person.fullName} size={160} shape={shape} className={styles.initials} />
        )}
      </span>
      <span className={styles.name}>
        <span className="block font-bold text-ink">
          {person.nickname || person.fullName.split(' ')[0]}
        </span>
        <span className="block text-[0.8125rem] text-ink-3">
          {person.talkCount} {person.talkCount === 1 ? 'talk' : 'talks'}
        </span>
      </span>
    </Link>
  );
}

/**
 * The people who have stood at the table: faces on brand shapes in a marquee that speeds up with
 * the scroll, pauses on hover (the face grows), and a second row of names going the other way.
 */
export function SpeakersMarquee({ people, total }: { people: HomeSpeaker[]; total: number }) {
  if (!people.length) return null;
  const faces = people.slice(0, 20);
  const names = people.slice(0, 24);
  return (
    <section className={styles.speakers} aria-labelledby="speakers-title">
      <ShapeClips />
      <div className="container-page">
        <SectionHeader
          id="speakers-title"
          eyebrow="Who stood up"
          eyebrowShape="triangle"
          title="The people at the table"
          description={`${total} speakers and counting. Most of them were nervous. All of them were great.`}
          action={
            <Button href="/speakers" variant="secondary" shape="triangle">
              Meet them all
            </Button>
          }
        />
      </div>
      <div className={styles.rows}>
        <Marquee label="Speakers" speed={48} gap="clamp(20px, 3vw, 44px)" fade="4%">
          {faces.map((p, i) => (
            <Face key={p.id} person={p} shape={SHAPE_ORDER[i % 4]!} i={i} />
          ))}
        </Marquee>
        {/* The same people again, big and going the other way. Decorative: the faces above are the links for keyboards and screen readers. */}
        <div aria-hidden="true">
          <Marquee
            speed={70}
            direction="right"
            gap="clamp(24px, 3vw, 48px)"
            fade="4%"
            className={styles.namesRow}
          >
            {names.map((p, i) => (
              <Link
                key={p.id}
                href={`/speakers/${p.slug}`}
                className={styles.bigName}
                tabIndex={-1}
              >
                {p.fullName}
                <ShapeIcon shape={SHAPE_ORDER[(i + 1) % 4]!} size="0.5em" className={styles.sep} />
              </Link>
            ))}
          </Marquee>
        </div>
      </div>
    </section>
  );
}
