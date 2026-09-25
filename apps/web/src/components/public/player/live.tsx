'use client';

import { motion, type Variants } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { StreamState } from '@zemi/shared';
import { TickingDigits } from '@/components/motion/ticking-digits';
import { getViewerId, heartbeat } from '@/lib/api/client';
import { useLiveEvent, type LiveConnection } from '@/lib/hooks/use-live-event';
import { cn } from '@/lib/utils';
import { formatClock } from './format';
import { LiveEdgeIcon } from './icons';
import styles from './player.module.css';
import type { PlayerLiveInfo } from './types';

const HEARTBEAT_MS = 15_000;

export interface LiveFeed {
  ingestOnline: boolean;
  viewers: number;
  startedAt: string | null;
  streamState: StreamState | null;
  connection: LiveConnection;
}

/**
 * Live state for the player: props and the SSE feed merged "latest wins" (a parent can drive
 * the player from its own data, and the SSE keeps it fresh), plus a heartbeat every 15s while
 * the page is visible so the viewer is counted.
 */
export function useLiveFeed(opts: {
  enabled: boolean;
  eventId?: string;
  live?: PlayerLiveInfo;
  onReaction?: (kind: string, count: number) => void;
}): LiveFeed {
  const { enabled, eventId, live, onReaction } = opts;
  const sse = useLiveEvent(enabled ? eventId : null, { onReaction });
  const [ingest, setIngest] = useState(live?.ingestOnline ?? true);
  const [viewers, setViewers] = useState(live?.viewers ?? 0);
  const [startedAt, setStartedAt] = useState<string | null>(live?.startedAt ?? null);

  useEffect(() => {
    if (live) setIngest(live.ingestOnline);
  }, [live?.ingestOnline]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (live) setViewers(live.viewers);
  }, [live?.viewers]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setStartedAt(live?.startedAt ?? null);
  }, [live?.startedAt]);

  useEffect(() => {
    if (!sse.stream) return;
    setIngest(sse.stream.ingestOnline);
    if (sse.stream.liveStartedAt) setStartedAt(sse.stream.liveStartedAt);
  }, [sse.stream]);
  useEffect(() => {
    if (typeof sse.viewers === 'number') setViewers(sse.viewers);
  }, [sse.viewers]);

  useEffect(() => {
    if (!enabled || !eventId) return;
    const viewerId = getViewerId();
    const beat = () => {
      if (document.visibilityState === 'visible') void heartbeat(eventId, viewerId);
    };
    beat();
    const id = setInterval(beat, HEARTBEAT_MS);
    const onVis = () => {
      if (document.visibilityState === 'visible') beat();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [enabled, eventId]);

  return { ingestOnline: ingest, viewers, startedAt, streamState: sse.stream?.state ?? null, connection: sse.connection };
}

/** Seconds since `startedAt`, ticking once a second. */
export function useElapsed(startedAt: string | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  if (!startedAt) return null;
  const t = new Date(startedAt).getTime();
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 1000)) : null;
}

/**
 * LIVE pill. At the live edge it is red with a pulsing dot. When you're behind (paused or
 * buffered back), it turns into a glass "Go live" button that jumps to the edge.
 */
export function LiveStatus({
  state,
  offlineLabel = 'Live',
  onJump,
  viewers,
  elapsed,
  variants,
}: {
  state: 'live' | 'behind' | 'offline';
  offlineLabel?: string;
  onJump(): void;
  viewers: number;
  elapsed: number | null;
  variants?: Variants;
}) {
  const behind = state === 'behind';
  const lastViewers = useRef(viewers);
  const [bump, setBump] = useState(0);
  useEffect(() => {
    if (viewers > lastViewers.current) setBump((b) => b + 1);
    lastViewers.current = viewers;
  }, [viewers]);

  return (
    <motion.div className={styles.liveStatus} variants={variants}>
      <motion.button
        type="button"
        className={styles.livePill}
        data-behind={behind ? 'true' : undefined}
        data-offline={state === 'offline' ? 'true' : undefined}
        onClick={onJump}
        aria-disabled={!behind || undefined}
        aria-label={behind ? 'Jump to live' : state === 'offline' ? `${offlineLabel}, no signal right now` : 'Watching live'}
        data-tip={behind ? 'Jump to live (L)' : undefined}
        layout
        whileTap={behind ? { scale: 0.94 } : undefined}
        transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      >
        {behind ? <LiveEdgeIcon className={styles.livePillIcon} /> : <span className={styles.liveDot} aria-hidden="true" />}
        <span>{behind ? 'Go live' : state === 'offline' ? offlineLabel : 'Live'}</span>
      </motion.button>
      <span className={styles.viewers} aria-label={`${viewers} watching`}>
        <motion.span
          key={bump}
          className={styles.viewersShape}
          aria-hidden="true"
          initial={bump ? { scale: 1.6, rotate: -30 } : false}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 14 }}
        />
        <TickingDigits value={String(Math.max(0, viewers))} className={styles.viewersNum} label={`${viewers}`} />
        <span className={styles.viewersWord} aria-hidden="true">
          watching
        </span>
      </span>
      {elapsed !== null ? (
        <span className={cn(styles.elapsed, styles.hideNarrow)}>
          <TickingDigits value={formatClock(elapsed, Math.max(elapsed, 3600))} label={`Live for ${Math.floor(elapsed / 60)} minutes`} />
        </span>
      ) : null}
    </motion.div>
  );
}
