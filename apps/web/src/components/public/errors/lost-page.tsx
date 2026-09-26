'use client';

import { usePathname } from 'next/navigation';
import { CaslHeading } from '@/components/motion/casl-heading';
import { HighlightSwipe } from '@/components/motion/highlight-swipe';
import { Button } from '@/components/public/ui/button';
import { Eyebrow } from '@/components/public/ui/section-header';
import { TextLink } from '@/components/public/ui/text-link';
import { cn } from '@/lib/utils';
import { LostPlanet } from './lost-planet';
import styles from './lost.module.css';

const MORE = [
  { href: '/about', label: 'About' },
  { href: '/speakers', label: 'Speakers' },
  { href: '/publications', label: 'Publications' },
  { href: '/contact', label: 'Say hi' },
];

/**
 * The 404 page body: the characters, lost on a tiny planet you can throw them around on, a
 * playful line and the ways back. Used by the root not-found (unmatched URLs) and the public
 * group's not-found (a page called notFound()), both inside the public shell.
 */
export function LostPage() {
  const pathname = usePathname() ?? '';
  const admin = /^\/admin(\/|$)/.test(pathname);
  const shown = pathname.length > 1 ? pathname : null;

  return (
    <section className={styles.page} aria-labelledby="lost-title">
      <div className={cn('container-page', styles.grid)}>
        <div className={cn('flex max-w-[40rem] flex-col gap-5', styles.head)}>
          <Eyebrow shape="triangle">404, lost in the hallway</Eyebrow>
          <CaslHeading as="h1" id="lost-title" size="l" reveal className="text-ink">
            This page skipped the seminar.
          </CaslHeading>
        </div>
        <div className={cn('flex max-w-[40rem] flex-col gap-6', styles.rest)}>
          <div className="text-body-l flex flex-col gap-3 text-ink-2">
            {shown ? (
              <p>
                You asked for <span className={cn('mono text-ink', styles.path)}>{shown}</span>, and we looked under every chair.
                Nothing.
              </p>
            ) : null}
            <p>
              The link might be old, or the page wandered off to get coffee.{' '}
              <HighlightSwipe delay={700}>The crew is looking for it too.</HighlightSwipe> Toss them around while you pick a way
              back.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {admin ? (
              <>
                <Button href="/admin" size="lg">
                  Back to the studio
                </Button>
                <Button href="/" size="lg" variant="secondary" shape="circle">
                  Public site
                </Button>
              </>
            ) : (
              <>
                <Button href="/" size="lg">
                  Take me home
                </Button>
                <Button href="/events" size="lg" variant="secondary" shape="square">
                  See the Fridays
                </Button>
              </>
            )}
          </div>
          {admin ? null : (
            <nav aria-label="Other places to go" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.9375rem]">
              <span className="label text-ink-3">Or try</span>
              {MORE.map((l) => (
                <TextLink key={l.href} href={l.href} tone="ink" className="-mx-1.5 inline-flex min-h-11 items-center px-1.5">
                  {l.label}
                </TextLink>
              ))}
            </nav>
          )}
        </div>
        {/* After the ways back in the DOM (keyboard users reach the buttons first); CSS places it. */}
        <div className={styles.play}>
          <LostPlanet />
        </div>
      </div>
    </section>
  );
}
