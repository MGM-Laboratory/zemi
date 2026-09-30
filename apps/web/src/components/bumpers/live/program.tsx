'use client';

import type { BumperData, BumperOutputMode, BumperSlide, BumperTheme } from '@zemi/shared';
import { useEffect, useState } from 'react';
import { BumperDirector, type DirectorTarget, type TransitionEvent } from '../transitions/director';

export interface ProgramProps {
  slides: BumperSlide[];
  theme: BumperTheme;
  data: BumperData;
  showEventId: string | null;
  target: DirectorTarget;
  mode: BumperOutputMode;
  /** Goes up by one for every replay of the current entrance. */
  replay: number;
  onTransition?: (e: TransitionEvent) => void;
}

/**
 * The director as every live screen uses it (OBS output, player, controller monitor), plus a
 * cover for its first moments: the director fades into black or clear from "show" when it
 * mounts, which would flash the slide over the camera after a reload in clear mode. The cover
 * hides that fade. Put it inside <BumperStage>.
 */
export function Program({ slides, theme, data, showEventId, target, mode, replay, onTransition }: ProgramProps) {
  const [firstMode] = useState(mode);
  const [covered, setCovered] = useState(firstMode !== 'show');
  useEffect(() => {
    if (!covered) return;
    const t = setTimeout(() => setCovered(false), 650);
    return () => clearTimeout(t);
  }, [covered]);
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, opacity: covered && firstMode === 'clear' ? 0 : 1 }}>
        <BumperDirector slides={slides} theme={theme} data={data} showEventId={showEventId} target={target} mode={mode} replay={replay} initial="enter" onTransition={onTransition} />
      </div>
      {covered && firstMode === 'black' ? <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 70, background: '#000' }} /> : null}
    </>
  );
}
