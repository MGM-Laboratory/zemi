'use client';

import type { BumperShowDetail } from '@zemi/shared';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { errorMessage } from '@/lib/admin/api';
import { cn } from '@/lib/admin/cn';
import { adminRoutes } from '@/lib/admin/nav';
import { DarkButton, focusRing, StageMessage } from './chrome';
import type { AdminLive } from './use-live';

const linkClass = cn('inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold', focusRing);

/** Loading, no access, load errors and a deleted show, for the player and the controller. */
export function LiveGate({ live, what, children }: { live: AdminLive; what: 'play' | 'control'; children: (show: BumperShowDetail) => ReactNode }) {
  if (live.status === 'forbidden' || live.showError) {
    const forbidden = live.status === 'forbidden' || (live.showError as { status?: number } | null)?.status === 403;
    const missing = (live.showError as { status?: number } | null)?.status === 404;
    return (
      <StageMessage
        title={forbidden ? `This show isn't yours to ${what === 'play' ? 'play' : 'run'}.` : missing ? "We can't find this show." : "We couldn't load this show."}
        action={
          <>
            {!forbidden && !missing ? (
              <DarkButton tone="primary" onClick={live.refetchShow}>
                Try again
              </DarkButton>
            ) : null}
            <Link href={adminRoutes.bumpers} className={cn(linkClass, 'text-white/80 hover:bg-white/10')}>
              All shows
            </Link>
          </>
        }
      >
        {forbidden ? 'Ask someone who runs it for access, or pick another show.' : missing ? 'It may have been deleted. The other shows are in the library.' : errorMessage(live.showError)}
      </StageMessage>
    );
  }
  if (live.revoked === 'deleted') {
    return (
      <StageMessage
        title="This show was deleted."
        action={
          <Link href={adminRoutes.bumpers} className={cn(linkClass, 'bg-white text-[#0e1116]')}>
            All shows
          </Link>
        }
      >
        Someone deleted it while it was open here. The other shows are still in the library.
      </StageMessage>
    );
  }
  if (!live.show) return <StageMessage title={what === 'play' ? 'Warming up the screen' : 'Setting up the control room'} loading />;
  return <>{children(live.show)}</>;
}
