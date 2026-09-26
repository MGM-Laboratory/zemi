import type { CSSProperties } from 'react';
import type { EventDetail } from '@zemi/shared';
import styles from '../events.module.css';

/**
 * The cover, blurred into a glow behind the screen (the accent alone when there is no cover).
 * Live breathes faster, waiting breathes slowly, recordings sit still.
 */
export function Ambient({
  event,
  mode = 'waiting',
}: {
  event: Pick<EventDetail, 'cover'>;
  mode?: 'live' | 'waiting' | 'still';
}) {
  const img = event.cover?.lqip ?? null;
  return (
    <span
      className={styles.ambient}
      data-live={mode === 'live' ? '' : undefined}
      data-still={mode === 'still' ? '' : undefined}
      style={img ? ({ '--ambient-img': `url("${img}")` } as CSSProperties) : undefined}
      aria-hidden="true"
    />
  );
}
