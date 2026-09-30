'use client';

import { useEffect } from 'react';
import { QuietCard } from '@/components/bumpers/live/quiet-card';

type Props = { error: Error & { digest?: string }; retry?: () => void; reset?: () => void };

/**
 * Something crashed while drawing a bumper page. An OBS source has nobody to press a button,
 * so it tries again by itself after a few seconds. Quiet on purpose: no console noise in OBS.
 */
export default function BumpersError({ retry, reset }: Props) {
  const again = retry ?? reset;
  useEffect(() => {
    if (!again) return;
    const t = setTimeout(again, 8000);
    return () => clearTimeout(t);
  }, [again]);
  return (
    <QuietCard
      title="This screen hiccuped."
      action={
        again ? (
          <button
            type="button"
            onClick={() => again()}
            className="inline-flex h-[2.6em] items-center rounded-full bg-white px-[1.3em] text-[0.9em] font-semibold text-[#0e1116] transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#3a6dc5]"
          >
            Try again
          </button>
        ) : null
      }
    >
      It tries again by itself in a few seconds. If it keeps doing this, reload the source.
    </QuietCard>
  );
}
