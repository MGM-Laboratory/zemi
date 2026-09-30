'use client';

import { BUMPER_TRANSITION_META, type BumperData, type BumperSlide, type BumperTheme, type BumperTransitionKey } from '@zemi/shared';
import { RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/admin/ui/button';
import { Dialog } from '@/components/admin/ui/dialog';
import { SlideThumb } from '../../library/slide-thumb';
import { TransitionPreview } from './transition-preview';

interface Common {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  theme: BumperTheme;
  data: BumperData;
  showEventId: string | null;
}

/** "Play this bumper": a live preview of the entrance, with replay. */
export function PlayThisDialog({ open, onOpenChange, slide, name, theme, data, showEventId }: Common & { slide: BumperSlide; name: string }) {
  const [run, setRun] = useState(0);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title="Play this bumper"
      description={name}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button variant="primary" icon={<RotateCcw />} onClick={() => setRun((n) => n + 1)}>
            Replay
          </Button>
        </>
      }
    >
      {open ? <SlideThumb slide={slide} theme={theme} data={data} showEventId={showEventId} live replayKey={run} className="aspect-video w-full rounded-2xl" /> : null}
      <p className="mt-3 text-sm text-ink-3">This is how it lands on the room screen and in OBS, entrance included. Idle loops keep going after it settles.</p>
    </Dialog>
  );
}

/** "Play from previous": the transition from the bumper before this one, the way playback will show it. */
export function PlayFromPreviousDialog({ open, onOpenChange, from, to, fromName, toName, transition, overridden, theme, data, showEventId }: Common & { from: BumperSlide; to: BumperSlide; fromName: string; toName: string; transition: BumperTransitionKey; overridden: boolean }) {
  const [run, setRun] = useState(0);
  const meta = BUMPER_TRANSITION_META[transition];
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title="Play from previous"
      description={`${fromName} to ${toName}`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button variant="primary" icon={<RotateCcw />} onClick={() => setRun((n) => n + 1)}>
            Replay
          </Button>
        </>
      }
    >
      {open ? (
        <TransitionPreview key={`${run}-${transition}`} from={from} to={to} theme={theme} data={data} showEventId={showEventId} transition={transition} className="aspect-video w-full rounded-2xl" />
      ) : null}
      <p className="mt-3 text-sm text-ink-3">
        <span className="font-semibold text-ink">{meta.label}.</span> {meta.description} {overridden ? 'Picked for this bumper in Timing.' : 'Planned for this pair, change it in Timing.'}
      </p>
    </Dialog>
  );
}
