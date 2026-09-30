'use client';

import { useEffect, useState } from 'react';
import { BumperClockProvider } from '../engine/clock';
import { BumperStage } from '../engine/stage';
import { Program } from './program';
import { QuietCard, REVOKED_COPY } from './quiet-card';
import { SafeGuides, useFontsReady } from './shared';
import { useStings } from './sound';
import { useDirectorTarget, usePublicLive } from './use-live';

export interface BumperOutputProps {
  outputKey: string;
  /** `?bg=black`: paint black under clear slides and in clear mode (for a plain browser window). */
  bg: 'black' | null;
  /** `?safe=1`: title-safe guides for setting up the source. */
  safe: boolean;
}

/**
 * /bumpers/out/[key]: the OBS browser source. A 1920x1080 stage that fills the source, following
 * the server's playback state over SSE. Transparent wherever the slide is clear (and fully clear
 * in `clear` mode), so it can sit on top of the camera. Replays the current entrance when OBS
 * puts the scene on air.
 */
export function BumperOutput({ outputKey, bg, safe }: BumperOutputProps) {
  const live = usePublicLive(outputKey, 'output');
  const fonts = useFontsReady();
  const show = live.show;
  const target = useDirectorTarget(live.state, show?.slides, show?.version);
  const [obsCue, setObsCue] = useState(0);
  const sting = useStings(!!show?.theme.sound, 'obs');
  const base = bg === 'black' ? '#000' : 'transparent';

  // OBS fires this when the scene with this source goes on air (or off it).
  useEffect(() => {
    const onActive = (e: Event) => {
      const detail = (e as CustomEvent<{ active?: boolean }>).detail;
      if (detail?.active) setObsCue((n) => n + 1);
    };
    window.addEventListener('obsSourceActiveChanged', onActive);
    return () => window.removeEventListener('obsSourceActiveChanged', onActive);
  }, []);

  if (live.revoked) {
    const copy = REVOKED_COPY[live.revoked];
    return (
      <div data-bumper-output="" data-revoked={live.revoked} style={{ position: 'fixed', inset: 0, background: base }}>
        <QuietCard title={copy.title}>{copy.body}</QuietCard>
      </div>
    );
  }

  const ready = !!show && !!target && fonts;
  return (
    <div data-bumper-output="" data-ready={ready ? 'true' : 'false'} data-status={live.status} data-mode={live.state?.mode ?? undefined} style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: base }}>
      {show && target && fonts ? (
        <BumperClockProvider value={{ offsetMs: live.offsetMs }}>
          <BumperStage style={{ position: 'absolute', inset: 0 }} letterbox={base}>
            <Program slides={show.slides} theme={show.theme} data={show.data} showEventId={show.eventId} target={target} mode={live.state?.mode ?? 'show'} replay={(live.state?.cue ?? 0) + obsCue} onTransition={sting} />
            {safe ? <SafeGuides /> : null}
          </BumperStage>
        </BumperClockProvider>
      ) : null}
    </div>
  );
}
