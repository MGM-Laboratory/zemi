'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Character, type CharacterHandle } from '@/components/brand/character';
import { ZemiLogo } from '@/components/brand/zemi-logo';
import { Button } from '@/components/public/ui/button';
import { cn } from '@/lib/utils';
import styles from './error-screen.module.css';

export interface ErrorScreenProps {
  error: Error & { digest?: string };
  /** Re-fetch and re-render the segment (Next 16.3 `retry`). */
  retry?: () => void;
}

/**
 * The designed error boundary UI (app/error.tsx). It replaces the page below the root layout, so
 * it brings its own small header. Admin paths get admin links.
 */
export function ErrorScreen({ error, retry }: ErrorScreenProps) {
  const pathname = usePathname() ?? '';
  const admin = /^\/admin(\/|$)/.test(pathname);
  const [trying, setTrying] = useState(false);
  const [plugged, setPlugged] = useState(false);
  const crew = useRef<Array<CharacterHandle | null>>([]);
  const heading = useRef<HTMLHeadingElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    return () => clearTimeout(timer.current);
  }, []);

  const tryAgain = () => {
    if (trying) return;
    setTrying(true);
    setPlugged(true);
    crew.current.forEach((c, i) => setTimeout(() => c?.cheer(), i * 90));
    // Let the plug click in before the segment re-renders.
    timer.current = setTimeout(() => {
      retry?.();
      timer.current = setTimeout(() => {
        setTrying(false);
        setPlugged(false);
      }, 1600);
    }, 520);
  };

  return (
    <div className={styles.page}>
      <header className="container-page flex h-[var(--nav-h)] items-center">
        <Link href={admin ? '/admin' : '/'} aria-label={admin ? 'Zemi studio' : 'Zemi home'} className="rounded-xl p-1">
          <ZemiLogo className="text-[1.5rem]" />
        </Link>
      </header>

      <main id="main" className={cn('container-page', styles.main)}>
        <div className={styles.scene} aria-hidden="true">
          <svg viewBox="0 0 400 120" className={cn(styles.cable, plugged && styles.cablePlugged)} focusable="false">
            <path
              d="M8 96 C 70 96, 70 40, 130 52 S 210 110, 260 78 S 330 40, 352 64"
              fill="none"
              stroke="#0e1116"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <g className={styles.plug}>
              <rect x="348" y="54" width="26" height="20" rx="6" fill="#0e1116" />
              <rect x="372" y="57" width="12" height="4" rx="2" fill="#9aa1ad" />
              <rect x="372" y="67" width="12" height="4" rx="2" fill="#9aa1ad" />
            </g>
            <g>
              <rect x="386" y="48" width="12" height="32" rx="4" fill="#f7f7f5" stroke="#d8d8d2" />
            </g>
          </svg>
          <div className={styles.crew}>
            <span className={styles.fallen}>
              <Character
                ref={(h) => void (crew.current[0] = h)}
                shape="square"
                mood="surprised"
                size="clamp(64px, 11vw, 120px)"
                seed={2}
              />
            </span>
            <Character
              ref={(h) => void (crew.current[1] = h)}
              shape="circle"
              mood="thinking"
              size="clamp(58px, 9.5vw, 104px)"
              seed={0}
            />
            <Character
              ref={(h) => void (crew.current[2] = h)}
              shape="triangle"
              mood="surprised"
              size="clamp(52px, 8.5vw, 92px)"
              seed={1}
            />
            <Character ref={(h) => void (crew.current[3] = h)} shape="arch" mood="idle" size="clamp(56px, 9vw, 98px)" seed={3} />
          </div>
        </div>

        <div className="flex max-w-[44rem] flex-col items-center gap-5 text-center">
          <p className="label text-ink-3">Something broke on our side</p>
          <h1
            ref={heading}
            tabIndex={-1}
            className="display text-display-m text-ink outline-none"
            style={{ fontVariationSettings: "'CASL' 0.7, 'MONO' 0" }}
          >
            Someone tripped over a cable.
          </h1>
          <p className="text-body-l text-ink-2">
            This page fell over while loading. It&apos;s not you, it&apos;s us. Give it another go, and if it keeps happening,
            tell us and we&apos;ll plug things back in.
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-3">
            <Button size="lg" onClick={tryAgain} loading={trying} shape="circle">
              {trying ? 'Plugging it back in' : 'Try again'}
            </Button>
            {admin ? (
              <Button href="/admin" size="lg" variant="secondary" shape="square">
                Back to the studio
              </Button>
            ) : (
              <>
                <Button href="/" size="lg" variant="secondary" shape="square">
                  Take me home
                </Button>
                <Button href="/contact" size="lg" variant="ghost" shape={false}>
                  Tell us
                </Button>
              </>
            )}
          </div>
          {error.digest ? (
            <p className="mono mt-2 text-[0.8125rem] text-ink-3">
              Error code <span className="select-all text-ink-2">{error.digest}</span>
            </p>
          ) : null}
        </div>
      </main>
    </div>
  );
}
