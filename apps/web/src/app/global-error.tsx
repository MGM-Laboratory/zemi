'use client';

import { MARK_PATHS, SHAPE_COLORS, SHAPE_ORDER, SHAPE_PATHS_46, type ShapeName } from '@zemi/shared';
// The root layout's own font definitions: a second loader call here shipped (and preloaded) a
// second Recursive on every page, since this boundary is part of every route's tree.
import { atkinson, recursive } from '@/styles/fonts';
import './globals.css';

/** A sleepy shape with closed eyes. Plain SVG: nothing here may depend on code that could be the thing that broke. */
function Sleepy({ shape, size, tilt = 0 }: { shape: ShapeName; size: number; tilt?: number }) {
  const eyeY = shape === 'triangle' ? 31 : shape === 'arch' ? 24 : 21;
  const gap = shape === 'triangle' ? 4.6 : 7.4;
  return (
    <svg viewBox="0 0 46 46" width={size} height={size} style={{ rotate: `${tilt}deg`, overflow: 'visible' }} aria-hidden="true">
      <path d={SHAPE_PATHS_46[shape]} fill={SHAPE_COLORS[shape]} />
      {[-1, 1].map((s) => (
        <path
          key={s}
          d={`M${23 + s * gap - 3.2} ${eyeY} Q${23 + s * gap} ${eyeY + 3} ${23 + s * gap + 3.2} ${eyeY}`}
          fill="none"
          stroke="#0e1116"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

/**
 * Last-resort error page: replaces the root layout when the root layout itself fails. It must
 * render its own <html>, <body>, styles and fonts, so it stays small and self-contained.
 */
export default function GlobalError({
  error,
  retry,
  reset,
}: {
  error: Error & { digest?: string };
  retry?: () => void;
  reset?: () => void;
}) {
  const again = retry ?? reset;
  return (
    <html lang="en" className={`${recursive.variable} ${atkinson.variable}`}>
      <body>
        <title>Something broke · Zemi</title>
        <div className="flex min-h-[100svh] flex-col bg-white text-ink">
          <header className="container-page flex h-[72px] items-center">
            {/* A full page load on purpose: the app shell itself failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" aria-label="Zemi home" className="inline-flex items-center gap-2 rounded-xl p-1">
              <svg viewBox="0 0 100 100" width={34} height={34} aria-hidden="true">
                {SHAPE_ORDER.map((s) => (
                  <path key={s} d={MARK_PATHS[s]} fill={SHAPE_COLORS[s]} />
                ))}
              </svg>
              <span className="display text-[1.5rem]" style={{ fontVariationSettings: "'CASL' 0.35, 'MONO' 0" }}>
                zemı
              </span>
            </a>
          </header>
          <main className="container-page flex flex-1 flex-col items-center justify-center gap-8 pb-24 text-center">
            <div className="flex items-end gap-3">
              <Sleepy shape="square" size={92} tilt={-8} />
              <Sleepy shape="circle" size={78} />
              <Sleepy shape="triangle" size={70} tilt={6} />
              <Sleepy shape="arch" size={74} />
            </div>
            <div className="flex max-w-[40rem] flex-col items-center gap-4">
              <p className="label text-ink-3">The whole site fell asleep</p>
              <h1 className="display text-display-m" style={{ fontVariationSettings: "'CASL' 0.7, 'MONO' 0" }}>
                Zemi took an unplanned nap.
              </h1>
              <p className="text-body-l text-ink-2">
                Something broke before the page could even load. It&apos;s on us, not you. Give it a moment and try again.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => (again ? again() : window.location.reload())}
                className="inline-flex h-14 items-center gap-3 rounded-full bg-ink px-7 text-[1.0625rem] font-bold text-white transition-transform hover:bg-[#1c2230] active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-focus"
              >
                Try again
                <svg viewBox="0 0 46 46" width={12} height={12} aria-hidden="true" style={{ rotate: '90deg' }}>
                  <path d={SHAPE_PATHS_46.triangle} fill="currentColor" />
                </svg>
              </button>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/"
                className="inline-flex h-14 items-center rounded-full border border-line-strong bg-white px-7 text-[1.0625rem] font-bold text-ink transition-colors hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-focus"
              >
                Take me home
              </a>
            </div>
            {error.digest ? (
              <p className="mono text-[0.8125rem] text-ink-3">
                Error code <span className="select-all text-ink-2">{error.digest}</span>
              </p>
            ) : null}
          </main>
        </div>
      </body>
    </html>
  );
}
