'use client';

import type { BumperShowRow } from '@zemi/shared';
import { motion, useReducedMotion } from 'motion/react';
import { useCallback, useMemo, useState } from 'react';
import { cn } from '@/lib/admin/cn';
import { ObsGuideDialog } from '../live/obs-guide';
import { useSlidesData } from './cover-data';
import { ShowCard, ShowCardSkeleton } from './show-card';
import { useShowActions } from './use-show-actions';

const GRID = 'grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,19rem),1fr))]';

/**
 * Show cards for a page of rows, with one data bundle for every cover on the page and one OBS
 * setup dialog shared by all the cards.
 */
export function ShowGrid({ rows, fetching, hideEvent, 'aria-label': ariaLabel }: { rows: BumperShowRow[]; fetching?: boolean; hideEvent?: boolean; 'aria-label': string }) {
  const reduce = useReducedMotion();
  const { actions, pendingId } = useShowActions();
  const [obs, setObs] = useState<{ id: string; open: boolean }>({ id: '', open: false });
  const covers = useMemo(() => rows.flatMap((r) => (r.cover ? [r.cover] : [])), [rows]);
  const eventIds = useMemo(() => rows.map((r) => r.eventId), [rows]);
  const { data } = useSlidesData(covers, eventIds);
  const onObs = useCallback((row: BumperShowRow) => setObs({ id: row.id, open: true }), []);

  return (
    <>
      <ul className={cn(GRID, 'transition-opacity duration-200', fetching && 'opacity-70')} aria-label={ariaLabel}>
        {rows.map((row, i) => (
          <motion.li
            key={row.id}
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduce ? 0 : Math.min(i * 0.035, 0.3), duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="min-w-0"
          >
            <ShowCard row={row} data={data} actions={actions} busy={pendingId === row.id} onObs={onObs} hideEvent={hideEvent} />
          </motion.li>
        ))}
      </ul>
      {/* Mounted once a card asks for it; the id stays while it closes so the dialog can animate out. */}
      {obs.id ? <ObsGuideDialog showId={obs.id} open={obs.open} onOpenChange={(open) => setObs((o) => ({ ...o, open }))} /> : null}
    </>
  );
}

export function ShowGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className={GRID} aria-busy="true" aria-label="Loading shows">
      {Array.from({ length: count }, (_, i) => (
        <ShowCardSkeleton key={i} />
      ))}
    </div>
  );
}
