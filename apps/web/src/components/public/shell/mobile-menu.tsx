'use client';

import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { Dialog } from 'radix-ui';
import type { RefObject } from 'react';
import { formatJakarta, formatTimeRange, SHAPE_ORDER, type EventCard } from '@zemi/shared';
import { Character } from '@/components/brand/character';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { ZemiLogo } from '@/components/brand/zemi-logo';
import { useScrollLock } from '@/components/motion/smooth-scroll';
import { ZemiImage } from '@/components/public/media/zemi-image';
import { StatusBadge } from '@/components/public/ui/chip';
import { useEventStatus } from '@/lib/hooks/use-now';
import { useReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { cn } from '@/lib/utils';
import { isActive, NAV_LINKS, SCHEDULE_LINE } from './nav-links';
import styles from './shell.module.css';

export interface MobileMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nextEvent: EventCard | null;
  pathname: string;
  /** Where focus goes when the menu closes (the burger). */
  returnFocusRef?: RefObject<HTMLElement | null>;
}

const EASE = [0.65, 0, 0.35, 1] as const;

/** Full-screen menu for small screens: big staggered links, peeking characters, the next Friday. */
export function MobileMenu({ open, onOpenChange, nextEvent, pathname, returnFocusRef }: MobileMenuProps) {
  const reduced = useReducedMotion();
  useScrollLock(open);
  const close = () => onOpenChange(false);

  const panel = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { clipPath: 'circle(0% at 92% 36px)' },
        animate: { clipPath: 'circle(150% at 92% 36px)' },
        exit: { clipPath: 'circle(0% at 92% 36px)' },
      };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open ? (
          <Dialog.Portal forceMount>
            <Dialog.Content
              forceMount
              asChild
              aria-describedby={undefined}
              onCloseAutoFocus={(e) => {
                // The burger lives outside the dialog (it is not a Dialog.Trigger), so send focus back by hand.
                if (returnFocusRef?.current) {
                  e.preventDefault();
                  returnFocusRef.current.focus();
                }
              }}
            >
              <motion.div
                id="zemi-mobile-menu"
                className="fixed inset-0 z-[110] flex flex-col overflow-y-auto overflow-x-hidden bg-white text-ink outline-none lg:hidden"
                data-lenis-prevent=""
                {...panel}
                transition={{ duration: reduced ? 0.15 : 0.62, ease: EASE }}
              >
                <Dialog.Title className="sr-only">Menu</Dialog.Title>
                <div className="container-page flex h-[var(--nav-h,72px)] flex-none items-center justify-between">
                  <Link href="/" onClick={close} aria-label="Zemi, home" className="text-[1.5rem]">
                    <ZemiLogo title="Zemi" />
                  </Link>
                  <Dialog.Close
                    className={cn(styles.burger, 'bg-surface-muted text-ink hover:bg-line')}
                    aria-expanded="true"
                    aria-label="Close menu"
                  >
                    <span />
                    <span />
                  </Dialog.Close>
                </div>

                <nav aria-label="Mobile" className="container-page flex-none pt-6">
                  <ul className="flex flex-col">
                    {NAV_LINKS.map((l, i) => {
                      const on = isActive(pathname, l.href);
                      return (
                        <motion.li
                          key={l.href}
                          initial={reduced ? { opacity: 0 } : { y: 48, opacity: 0, rotate: 2 }}
                          animate={{ y: 0, opacity: 1, rotate: 0 }}
                          exit={reduced ? { opacity: 0 } : { y: 24, opacity: 0, transition: { duration: 0.18, delay: 0 } }}
                          transition={{ duration: 0.7, delay: reduced ? 0 : 0.14 + i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                          className="border-b border-line"
                        >
                          <Link
                            href={l.href}
                            onClick={close}
                            aria-current={on ? 'page' : undefined}
                            className={cn(
                              styles.menuLink,
                              'group flex items-center justify-between gap-4 py-3 font-display text-[clamp(2.4rem,11vw,4.5rem)] font-black leading-[1.02] tracking-[-0.04em]',
                            )}
                          >
                            <span>{l.label}</span>
                            <ShapeIcon
                              shape={l.shape}
                              size="0.42em"
                              className="transition-transform duration-500 ease-[cubic-bezier(.34,1.56,.64,1)] group-hover:rotate-180 group-active:scale-90"
                            />
                          </Link>
                        </motion.li>
                      );
                    })}
                  </ul>
                </nav>

                <motion.div
                  className="container-page flex-none pb-40 pt-8"
                  initial={{ opacity: 0, y: reduced ? 0 : 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: { duration: 0.15 } }}
                  transition={{ duration: 0.6, delay: reduced ? 0 : 0.42, ease: [0.22, 1, 0.36, 1] }}
                >
                  {nextEvent ? <MenuEventCard event={nextEvent} onNavigate={close} /> : null}
                  <p className="label mt-6 flex items-center gap-2 text-ink-3">
                    <ShapeIcon shape="square" size="1em" />
                    {SCHEDULE_LINE}
                  </p>
                </motion.div>

                {/* Characters peeking up from the bottom edge. */}
                <div className="pointer-events-none fixed inset-x-0 bottom-0 flex items-end justify-center gap-[4vw] overflow-hidden" aria-hidden="true">
                  {SHAPE_ORDER.map((s, i) => (
                    <motion.div
                      key={s}
                      className="pointer-events-auto"
                      initial={{ y: '110%' }}
                      animate={{ y: '38%' }}
                      exit={{ y: '110%', transition: { duration: 0.2 } }}
                      transition={{ type: 'spring', stiffness: 260, damping: 18, delay: reduced ? 0 : 0.36 + i * 0.07 }}
                    >
                      <Character shape={s} size="clamp(64px, 19vw, 120px)" mood={i === 3 ? 'happy' : 'idle'} seed={i} />
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}

function MenuEventCard({ event, onNavigate }: { event: EventCard; onNavigate: () => void }) {
  const status = useEventStatus(event) ?? event.status;
  return (
    <Link
      href={`/events/${event.slug}`}
      onClick={onNavigate}
      className="flex items-stretch gap-4 rounded-[24px] border border-line bg-white p-3 pr-5 transition-colors hover:border-ink"
    >
      <ZemiImage image={event.cover} aspect="4/5" sizes="96px" className="w-20 flex-none rounded-[16px]" placeholderShape="circle" />
      <span className="flex min-w-0 flex-col justify-center gap-1.5">
        <StatusBadge status={status} />
        <span className="line-clamp-2 font-display text-lg font-extrabold leading-tight tracking-[-0.02em]">{event.title}</span>
        <span className="mono text-[0.8125rem] text-ink-3">
          {formatJakarta(event.startsAt, 'date')} · {formatTimeRange(event.startsAt, event.endsAt)}
        </span>
      </span>
    </Link>
  );
}
