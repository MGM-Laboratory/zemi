'use client';

import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useState } from 'react';
import { formatJakarta, type SpeakerCard as SpeakerCardData } from '@zemi/shared';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { useReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { cn } from '@/lib/utils';
import { talkWord } from './lib';
import { SpeakerPortrait } from './speaker-portrait';
import styles from './speakers.module.css';

const SOON_MS = 21 * 24 * 3600 * 1000;

export interface SpeakerCardProps {
  speaker: SpeakerCardData;
  /** Shuffle counter (re-rolls the backdrop). */
  deal?: number;
  /** Server render time, so "Up next" is the same on server and client. */
  renderedAt: number;
  sizes?: string;
  priority?: boolean;
  /** Heading level for the name. Default h2 (directory); h3 inside a section. */
  nameAs?: 'h2' | 'h3';
  compact?: boolean;
}

/**
 * Directory card: portrait on a brand shape. Hover or focus squishes the photo, pops the
 * nickname in a speech bubble and shows the talk count.
 */
export function SpeakerCard({
  speaker,
  deal = 0,
  renderedAt,
  sizes,
  priority,
  nameAs = 'h2',
  compact,
}: SpeakerCardProps) {
  const [active, setActive] = useState(false);
  const reduced = useReducedMotion();
  // Only the soon ones: a grid full of "Up next" badges says nothing.
  const next = speaker.latestTalkAt ? new Date(speaker.latestTalkAt).getTime() - renderedAt : -1;
  const upcoming = next > 0 && next < SOON_MS ? speaker.latestTalkAt : null;
  const nickname = speaker.nickname?.trim() || speaker.fullName.split(/\s+/)[0];
  const Name = nameAs;
  const pop = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, scale: 0.4, y: 10, rotate: -8 },
        animate: { opacity: 1, scale: 1, y: 0, rotate: 0 },
        exit: { opacity: 0, scale: 0.6, y: 6, rotate: 4 },
      };

  return (
    <Link
      href={`/speakers/${speaker.slug}`}
      className={styles.card}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setActive(true)}
      onPointerLeave={() => setActive(false)}
      onPointerDown={() => setActive(true)}
      onFocus={(e) => e.currentTarget.matches(':focus-visible') && setActive(true)}
      onBlur={() => setActive(false)}
      data-cursor="open"
    >
      <span className="relative block">
        <SpeakerPortrait
          slug={speaker.slug}
          name={speaker.fullName}
          image={speaker.avatar}
          active={active}
          deal={deal}
          priority={priority}
          sizes={
            sizes ??
            '(min-width: 1920px) 240px, (min-width: 1280px) 17vw, (min-width: 1024px) 21vw, (min-width: 640px) 28vw, 42vw'
          }
        />
        <AnimatePresence>
          {active ? (
            <motion.span
              key="bubble"
              className={styles.bubble}
              {...pop}
              transition={{ type: 'spring', stiffness: 420, damping: 20 }}
            >
              {nickname}
            </motion.span>
          ) : null}
        </AnimatePresence>
        <AnimatePresence>
          {active && speaker.talkCount > 0 ? (
            <motion.span
              key="count"
              className={cn(
                styles.count,
                'label inline-flex h-7 items-center gap-1.5 rounded-full bg-white px-2.5 font-bold text-ink shadow-2',
              )}
              {...pop}
              transition={{
                type: 'spring',
                stiffness: 380,
                damping: 22,
                delay: reduced ? 0 : 0.06,
              }}
            >
              <ShapeIcon shape="square" size="0.9em" />
              {talkWord(speaker.talkCount)}
            </motion.span>
          ) : null}
        </AnimatePresence>
        {upcoming ? (
          <span className="label absolute left-0 top-0 z-[1] inline-flex h-6 items-center gap-1.5 rounded-full bg-blue-600 px-2.5 font-bold text-white">
            <ShapeIcon shape="circle" size="0.7em" color="current" />
            Next {formatJakarta(upcoming, 'date-short')}
          </span>
        ) : null}
      </span>
      <span className={cn('flex flex-col gap-1', compact ? 'mt-3' : 'mt-4')}>
        <Name
          className={cn(
            'display text-ink transition-colors',
            compact ? 'text-[1.125rem]' : 'text-[clamp(1.125rem,1.6vw,1.5rem)]',
          )}
          style={{
            fontVariationSettings: `'CASL' ${active ? 0.9 : 0.25}, 'MONO' 0`,
            transition: 'font-variation-settings 400ms var(--ease-out)',
            lineHeight: 1.04,
          }}
        >
          {speaker.fullName}
        </Name>
        {speaker.headline && !compact ? (
          <span className="line-clamp-2 text-[0.9375rem] leading-snug text-ink-2">
            {speaker.headline}
          </span>
        ) : null}
        <span className="label mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-3">
          {speaker.defaultOrganization ? (
            <span className="truncate">{speaker.defaultOrganization}</span>
          ) : null}
          {speaker.talkCount > 0 ? (
            <>
              {speaker.defaultOrganization ? <span aria-hidden="true">·</span> : null}
              <span className="whitespace-nowrap">{talkWord(speaker.talkCount)}</span>
            </>
          ) : null}
        </span>
      </span>
    </Link>
  );
}
