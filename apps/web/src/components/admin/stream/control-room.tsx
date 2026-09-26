'use client';

import { Ban, EyeOff, MonitorOff } from 'lucide-react';
import Link from 'next/link';
import { useRef } from 'react';
import { Button } from '@/components/admin/ui/button';
import { Callout, ErrorState, Skeleton } from '@/components/admin/ui/feedback';
import { adminRoutes } from '@/lib/admin/nav';
import { useWorkspaceEvent } from '../events/use-event';
import { HealthPanel } from './health-panel';
import { roomState } from './lib';
import { ObsSetupCard } from './obs-setup';
import { PreviewPlayer } from './preview-player';
import { RecordingsSection } from './recordings';
import { StateHeader } from './state-header';
import { keysRotatedToast, useStreamActions, useStreamConfig, useStreamEvents, useStreamHealth } from './use-stream';
import './stream.css';

/**
 * The Stream tab of the event workspace (`/admin/events/[id]/stream`): state header with the
 * big buttons, admin-only preview, ingest health, OBS setup and recordings. Needs `stream.view`
 * (the workspace layout gates the tab); every control also checks `stream.control`.
 */
export function StreamControlRoom() {
  const { id, event, can } = useWorkspaceEvent();
  const config = useStreamConfig(id);
  // Our own rotate already says "Fresh keys": only toast the SSE notice for someone else's.
  const ownRotateAt = useRef(0);
  const sse = useStreamEvents(id, {
    onKeysRotated: (changed) => {
      if (Date.now() - ownRotateAt.current > 15_000) keysRotatedToast(changed);
    },
  });
  const stream = config.data;
  const room = stream ? roomState(stream) : 'idle';
  const health = useStreamHealth(id, { enabled: Boolean(stream) });
  const { goLive, end, rotate } = useStreamActions(id);
  const cancelled = Boolean(event.cancelledAt);
  const canControl = can('stream.control');

  if (config.isPending) return <ControlRoomSkeleton />;
  if (config.isError || !stream) {
    return <ErrorState error={config.error} onRetry={() => void config.refetch()} retrying={config.isFetching} />;
  }

  return (
    <div className="space-y-6">
      {cancelled ? (
        <Callout tone="red" icon={<Ban />} title="This event is cancelled.">
          OBS can&apos;t connect and nobody can go live. Restore the event in Settings if plans changed.
        </Callout>
      ) : event.mode === 'offline' ? (
        <Callout
          tone="neutral"
          icon={<MonitorOff />}
          title="This one is set to room only."
          action={
            can('edit') ? (
              <Button asChild size="sm" variant="secondary">
                <Link href={adminRoutes.event(id, 'details')}>Change the mode</Link>
              </Button>
            ) : undefined
          }
        >
          The event page won&apos;t mention a livestream. Everything here still works if you stream anyway.
        </Callout>
      ) : null}

      {!cancelled && event.visibility === 'draft' ? (
        <Callout tone="yellow" icon={<EyeOff />} title="Still a draft.">
          Test OBS and the preview all you like. If you go live now, only admins can watch until the event is published.
        </Callout>
      ) : null}

      <StateHeader
        stream={stream}
        canControl={canControl && !cancelled}
        readOnlyText={cancelled && canControl ? "Cancelled events can't go live." : undefined}
        draft={event.visibility === 'draft'}
        sse={sse}
        onGoLive={() => goLive.mutateAsync()}
        onEnd={() => end.mutateAsync()}
        goingLive={goLive.isPending}
        ending={end.isPending}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] xl:items-start">
        <section aria-labelledby="preview-title" className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="preview-title" className="font-display text-xl font-extrabold tracking-[-0.02em] [font-variation-settings:'CASL'_0.2]">
              Preview
            </h2>
            <p className="text-sm text-ink-3">
              {room === 'preview' || (room === 'ended' && stream.ingestOnline)
                ? 'Only admins see this. Check the picture and the mic.'
                : room === 'live'
                  ? 'The same picture viewers get, a few seconds behind.'
                  : 'Plays on its own once OBS connects.'}
            </p>
          </div>
          <PreviewPlayer eventId={id} room={room} ingestOnline={stream.ingestOnline} />
        </section>
        <HealthPanel health={health.data} history={health.history} loading={health.isPending} className="xl:mt-9" />
      </div>

      <ObsSetupCard stream={stream} canControl={canControl} onRotate={() => {
          ownRotateAt.current = Date.now();
          return rotate.mutateAsync();
        }} rotating={rotate.isPending} />

      <RecordingsSection eventId={id} canControl={canControl} />
    </div>
  );
}

function ControlRoomSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading the control room">
      <Skeleton className="h-56 w-full sm:h-64" rounded="lg" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Skeleton className="aspect-video w-full" rounded="lg" />
        <Skeleton className="h-72 w-full" rounded="lg" />
      </div>
      <Skeleton className="h-96 w-full" rounded="lg" />
    </div>
  );
}
