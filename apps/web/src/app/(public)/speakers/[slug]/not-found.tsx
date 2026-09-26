import type { Metadata } from 'next';
import { Button } from '@/components/public/ui/button';
import { EmptyState } from '@/components/public/ui/empty-state';

export const metadata: Metadata = {
  title: 'Speaker not found',
  robots: { index: false, follow: true },
};

/** A speaker slug that doesn't exist (or a profile that isn't public yet). */
export default function SpeakerNotFound() {
  return (
    <section className="container-page pb-[var(--section-y)] pt-[calc(var(--nav-h)+64px)]">
      <EmptyState
        size="lg"
        shape="circle"
        friend="arch"
        mood="surprised"
        title="We can't find that person."
        body="Maybe the link is old, or they haven't said yes to a public profile yet. Everyone else is on the speakers page."
        action={
          <>
            <Button href="/speakers" shape="circle">
              See all speakers
            </Button>
            <Button href="/events" variant="secondary" shape="square">
              Browse the Fridays
            </Button>
          </>
        }
      />
    </section>
  );
}
