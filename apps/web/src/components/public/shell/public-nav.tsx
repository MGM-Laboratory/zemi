'use client';

import { LayoutGroup, motion } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { EventCard } from '@zemi/shared';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { ZemiLogo } from '@/components/brand/zemi-logo';
import { useScrollDirection } from '@/lib/hooks/use-scroll-direction';
import { cn } from '@/lib/utils';
import { MobileMenu } from './mobile-menu';
import { isActive, NAV_LINKS } from './nav-links';
import { NextEventPill } from './next-event-pill';
import styles from './shell.module.css';
import { useNavTheme } from './use-nav-theme';

export interface PublicNavProps {
  nextEvent: EventCard | null;
  /** Force a theme (styleguide demos). Default: follows data-nav-theme sections. */
  theme?: 'light' | 'dark';
  /** Keep it visible regardless of scroll direction (styleguide demos). */
  pinned?: boolean;
}

/**
 * Public header: lockup, primary links with a morphing ink indicator, the "next Friday" pill,
 * and the full-screen menu on small screens. Hides on scroll down, returns on scroll up, and
 * flips to paper tone over sections marked `data-nav-theme="dark"`.
 */
export function PublicNav({ nextEvent, theme: forcedTheme, pinned }: PublicNavProps) {
  const pathname = usePathname() ?? '/';
  const { direction, atTop } = useScrollDirection();
  const detected = useNavTheme();
  const theme = forcedTheme ?? detected;
  const [open, setOpen] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const burgerRef = useRef<HTMLButtonElement>(null);

  const hidden = !pinned && direction === 'down' && !atTop && !open && !focusWithin;

  useEffect(() => {
    if (pinned) return;
    document.documentElement.toggleAttribute('data-nav-hidden', hidden);
  }, [hidden, pinned]);

  // Close the menu on navigation (state adjusted during render, no effect needed).
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
    setHover(null);
  }

  const active = NAV_LINKS.find((l) => isActive(pathname, l.href))?.href ?? null;
  const indicator = hover ?? active;
  const dark = theme === 'dark';

  return (
    <header className={cn(styles.header, pinned && 'relative! mb-0!')}>
      <motion.div
        className={styles.bar}
        data-theme={theme}
        data-scrolled={!atTop || pinned ? 'true' : 'false'}
        initial={false}
        animate={{ y: hidden ? '-100%' : '0%' }}
        transition={{ duration: 0.42, ease: [0.65, 0, 0.35, 1] }}
        onFocusCapture={() => setFocusWithin(true)}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusWithin(false);
        }}
      >
        <nav aria-label="Main" className="container-page flex h-full items-center justify-between gap-3">
          <Link
            href="/"
            aria-label="Zemi, home"
            className="-ml-1 flex h-11 items-center rounded-full px-1 text-[1.5rem] sm:text-[1.65rem]"
            aria-current={pathname === '/' ? 'page' : undefined}
          >
            <ZemiLogo trigger={pathname} title="Zemi" />
          </Link>

          <LayoutGroup id="public-nav">
            <ul
              className={cn(
                'hidden items-center gap-0.5 rounded-full border p-1 transition-colors duration-300 lg:flex',
                dark ? 'border-white/12 bg-white/[0.06]' : 'border-ink/[0.07] bg-white/70 backdrop-blur-md',
              )}
              onPointerLeave={() => setHover(null)}
            >
              {NAV_LINKS.map((l) => {
                const on = indicator === l.href;
                return (
                  <li key={l.href} className="relative">
                    <Link
                      href={l.href}
                      aria-current={active === l.href ? 'page' : undefined}
                      className={cn(
                        styles.link,
                        'relative flex h-10 items-center gap-2 rounded-full px-4 text-[0.9375rem] font-bold transition-colors duration-200',
                        on ? (dark ? 'text-ink' : 'text-white') : dark ? 'text-white/85 hover:text-white' : 'text-ink-2 hover:text-ink',
                      )}
                      onPointerEnter={() => setHover(l.href)}
                      onFocus={() => setHover(l.href)}
                      onBlur={() => setHover(null)}
                    >
                      {on ? (
                        <motion.span
                          layoutId="nav-indicator"
                          className={cn('absolute inset-0 rounded-full', dark ? 'bg-white' : 'bg-ink')}
                          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                          aria-hidden="true"
                        />
                      ) : null}
                      <ShapeIcon shape={l.shape} size={10} className={cn(styles.linkShape, 'relative')} />
                      <span className={cn(styles.linkLabel, 'relative')}>{l.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </LayoutGroup>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <NextEventPill event={nextEvent} theme={theme} compact className="sm:hidden" />
            <NextEventPill event={nextEvent} theme={theme} className="hidden sm:inline-flex" />
            <button
              ref={burgerRef}
              type="button"
              className={cn(
                styles.burger,
                'transition-colors lg:hidden',
                dark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-surface-muted text-ink hover:bg-line',
              )}
              aria-expanded={open}
              aria-controls="zemi-mobile-menu"
              aria-label={open ? 'Close menu' : 'Open menu'}
              onClick={() => setOpen((o) => !o)}
            >
              <span />
              <span />
            </button>
          </div>
        </nav>
      </motion.div>
      <MobileMenu open={open} onOpenChange={setOpen} nextEvent={nextEvent} pathname={pathname} returnFocusRef={burgerRef} />
    </header>
  );
}
