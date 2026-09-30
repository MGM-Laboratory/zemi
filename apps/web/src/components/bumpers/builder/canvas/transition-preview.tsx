'use client';

import type { BumperData, BumperSlide, BumperTheme, BumperTransitionKey } from '@zemi/shared';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { BumperStage } from '../../engine/stage';
import { BumperDirector, type DirectorTarget } from '../../transitions/director';

export interface TransitionPreviewProps {
  from: BumperSlide;
  to: BumperSlide;
  theme: BumperTheme;
  data: BumperData;
  showEventId: string | null;
  transition: BumperTransitionKey;
  /** How long the first bumper sits still before the transition (ms). */
  holdMs?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Plays one transition: shows `from` still, then moves to `to` with the given transition and its
 * entrance. Remount it (key) to replay.
 */
export function TransitionPreview({ from, to, theme, data, showEventId, transition, holdMs = 650, className, style }: TransitionPreviewProps) {
  const slides = useMemo(() => [from, to], [from, to]);
  const [target, setTarget] = useState<DirectorTarget>({ slideId: from.id, seq: 0 });
  useEffect(() => {
    const t = setTimeout(() => setTarget({ slideId: to.id, seq: 1, transition, dir: 1 }), holdMs);
    return () => clearTimeout(t);
  }, [to.id, transition, holdMs]);
  return (
    <BumperStage className={className} style={style} letterbox="#0e1116">
      <BumperDirector slides={slides} theme={theme} data={data} showEventId={showEventId} target={target} initial="static" />
    </BumperStage>
  );
}
