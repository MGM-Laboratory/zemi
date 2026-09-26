import type { Metadata } from 'next';
import { Button } from '@/components/public/ui/button';
import { EmptyState } from '@/components/public/ui/empty-state';

export const metadata: Metadata = {
  title: 'Paper not found',
  robots: { index: false, follow: true },
};

/** A publication slug that doesn't exist (or is still a draft). */
export default function PublicationNotFound() {
  return (
    <section className="container-page pb-[var(--section-y)] pt-[calc(var(--nav-h)+64px)]">
      <EmptyState
        size="lg"
        shape="square"
        friend="triangle"
        mood="surprised"
        title="That paper slipped off the table."
        body="The link might be old, or the paper isn't public yet. The rest of the pile is right here."
        action={
          <Button href="/publications" shape="square">
            See all papers
          </Button>
        }
      />
    </section>
  );
}
