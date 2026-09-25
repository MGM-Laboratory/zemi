'use client';

import dynamic from 'next/dynamic';
import { createContext, useContext } from 'react';
import { ZemiMark } from '@/components/brand/zemi-mark';
import { cn } from '@/lib/utils';
import styles from './lazy.module.css';
import type { ZemiPlayerProps } from './types';

const SkeletonProps = createContext<Pick<ZemiPlayerProps, 'poster' | 'posterLqip' | 'posterColor' | 'className' | 'title'>>({ title: '' });

/** 16:9 placeholder with the poster and the loading mark, shown while the player chunk loads. */
export function PlayerSkeleton(props: Pick<ZemiPlayerProps, 'poster' | 'posterLqip' | 'posterColor' | 'className' | 'title'>) {
  const { poster, posterLqip, posterColor, className, title } = props;
  return (
    <div className={cn(styles.skeleton, className)} style={posterColor ? { backgroundColor: posterColor } : undefined} role="status" aria-label={`Loading the player for ${title}`}>
      {posterLqip ? <img src={posterLqip} alt="" className={styles.lqip} /> : null}
      {poster ? <img src={poster} alt="" className={styles.poster} decoding="async" /> : null}
      <span className={styles.mark}>
        <ZemiMark variant="loading" size="100%" decorative />
      </span>
    </div>
  );
}

function ContextSkeleton() {
  return <PlayerSkeleton {...useContext(SkeletonProps)} />;
}

const Player = dynamic(() => import('./zemi-player').then((m) => m.ZemiPlayer), { ssr: false, loading: ContextSkeleton });

/**
 * `ZemiPlayer` loaded on the client only (no SSR), with a poster skeleton so nothing shifts.
 * Safe to render from a Server Component page.
 *
 * @example <ZemiPlayerLazy mode="vod" title={t} sources={{ mp4 }} poster={poster} />
 */
export function ZemiPlayerLazy(props: ZemiPlayerProps) {
  return (
    <SkeletonProps.Provider
      value={{ poster: props.poster, posterLqip: props.posterLqip, posterColor: props.posterColor, className: props.className, title: props.title }}
    >
      <Player {...props} />
    </SkeletonProps.Provider>
  );
}
