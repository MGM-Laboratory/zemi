'use client';

import type { ShapeName } from '@zemi/shared';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { Character, type CharacterMood } from '@/components/admin/characters/character';
import { cn } from '@/lib/admin/cn';

export type FeedbackKind = 'checked-in' | 'already' | 'wrong-event' | 'cancelled' | 'not-found' | 'slow' | 'offline' | 'error';

export interface ScanFeedback {
  id: number;
  kind: FeedbackKind;
  title: string;
  body?: string;
  meta?: string;
  /** Auto close after this many ms (null = wait for a tap). */
  closeAfter: number | null;
  /** Offer "Try again" (network failures). */
  retry?: () => void;
}

const LOOK: Record<FeedbackKind, { bg: string; text: string; shape: ShapeName; mood: CharacterMood; color?: string; eyebrow: string }> = {
  'checked-in': { bg: 'bg-green', text: 'text-white', shape: 'arch', mood: 'cheer', color: '#ffffff', eyebrow: 'Checked in' },
  already: { bg: 'bg-yellow', text: 'text-ink', shape: 'square', mood: 'happy', color: '#ffffff', eyebrow: 'Already in' },
  'wrong-event': { bg: 'bg-red-600', text: 'text-white', shape: 'triangle', mood: 'oops', color: '#ffffff', eyebrow: 'Not for today' },
  cancelled: { bg: 'bg-red-600', text: 'text-white', shape: 'triangle', mood: 'oops', color: '#ffffff', eyebrow: 'Cancelled ticket' },
  'not-found': { bg: 'bg-red-600', text: 'text-white', shape: 'triangle', mood: 'oops', color: '#ffffff', eyebrow: 'Unknown ticket' },
  slow: { bg: 'bg-surface-inverse', text: 'text-white', shape: 'circle', mood: 'sleep', color: '#3a6dc5', eyebrow: 'Easy there' },
  offline: { bg: 'bg-surface-inverse', text: 'text-white', shape: 'circle', mood: 'oops', color: '#3a6dc5', eyebrow: 'No connection' },
  error: { bg: 'bg-surface-inverse', text: 'text-white', shape: 'triangle', mood: 'oops', color: '#f94141', eyebrow: 'Hiccup' },
};

/**
 * Full-screen answer after a scan: green welcome, yellow "already in", red problems. Readable
 * from arm's length at a door. Tap anywhere (or press Enter, Space or Escape) to go on.
 */
export function FeedbackCard({ feedback, onDismiss }: { feedback: ScanFeedback; onDismiss: () => void }) {
  const reduce = useReducedMotion();
  const look = LOOK[feedback.kind];
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (feedback.closeAfter == null) return;
    const t = setTimeout(onDismiss, feedback.closeAfter);
    return () => clearTimeout(t);
  }, [feedback, onDismiss]);

  useEffect(() => {
    btn.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      // Enter and Space on a focused control (like "Try again") keep their own click.
      if (e.key !== 'Escape' && (e.target as Element | null)?.closest?.('button, a, input, textarea, select, [role="button"]')) return;
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        // The card is the top layer: this key is for it alone, not for the Recent scans panel
        // or a dialog underneath that also listen for Escape.
        e.stopPropagation();
        onDismiss();
      }
    };
    // Capture phase on window runs before every other keydown listener on the page.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onDismiss]);

  const dark = look.text === 'text-ink';

  return (
    <motion.div
      key={feedback.id}
      role="alertdialog"
      aria-modal="true"
      data-scan-feedback=""
      aria-labelledby={`fb-title-${feedback.id}`}
      aria-describedby={feedback.body ? `fb-body-${feedback.id}` : undefined}
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.04 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
      transition={{ duration: reduce ? 0.12 : 0.22, ease: [0.22, 1, 0.36, 1] }}
      className={cn('fixed inset-0 z-[80] flex flex-col', look.bg, look.text)}
      onClick={onDismiss}
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 pt-[max(1.5rem,env(safe-area-inset-top))] text-center landscape:flex-row landscape:gap-10 landscape:text-left">
        <motion.div
          initial={reduce ? false : { y: 24, scale: 0.6, rotate: -8 }}
          animate={{ y: 0, scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 18 }}
          className="shrink-0"
        >
          <Character shape={look.shape} mood={look.mood} size={132} color={look.color} replayKey={feedback.id} className="drop-shadow-[0_10px_30px_rgba(0,0,0,0.18)]" />
        </motion.div>
        <div className="max-w-xl min-w-0">
          <p className={cn('mono text-[0.8125rem] font-semibold tracking-[0.08em] uppercase', dark ? 'text-ink/70' : 'text-white/75')}>{look.eyebrow}</p>
          <h2
            id={`fb-title-${feedback.id}`}
            className="mt-2 font-display text-[clamp(2.25rem,9vw,4.5rem)] leading-[0.95] font-black tracking-[-0.035em] break-words [font-variation-settings:'CASL'_0.6]"
          >
            {feedback.title}
          </h2>
          {feedback.body ? (
            <p id={`fb-body-${feedback.id}`} className={cn('mt-4 text-[clamp(1.0625rem,3.6vw,1.375rem)] leading-snug', dark ? 'text-ink/85' : 'text-white/90')}>
              {feedback.body}
            </p>
          ) : null}
          {feedback.meta ? <p className={cn('mono mt-3 text-base', dark ? 'text-ink/70' : 'text-white/75')}>{feedback.meta}</p> : null}
        </div>
      </div>
      <div className="flex flex-col items-center gap-3 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {feedback.retry ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              feedback.retry?.();
            }}
            className="h-12 rounded-full bg-white px-6 font-semibold text-ink shadow-lg transition focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-[0.96]"
          >
            Try again
          </button>
        ) : null}
        <button
          ref={btn}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className={cn(
            'h-12 rounded-full px-6 text-base font-semibold transition active:scale-[0.96] focus-visible:outline-3 focus-visible:outline-offset-2',
            dark ? 'bg-ink/10 text-ink focus-visible:outline-ink' : 'bg-white/15 text-white focus-visible:outline-white',
          )}
        >
          {feedback.kind === 'checked-in' ? 'Next person' : 'Got it, keep scanning'}
        </button>
        {feedback.closeAfter != null ? (
          <div className={cn('h-1 w-40 overflow-hidden rounded-full', dark ? 'bg-ink/15' : 'bg-white/20')} aria-hidden="true">
            <div className={cn('zemi-scan-countdown h-full rounded-full', dark ? 'bg-ink/60' : 'bg-white/80')} style={{ animationDuration: `${feedback.closeAfter}ms` }} />
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}
