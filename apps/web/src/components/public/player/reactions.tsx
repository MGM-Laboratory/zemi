'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { REACTION_KINDS, type ReactionKind } from '@zemi/shared';
import { prefersReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { cn } from '@/lib/utils';
import { REACTION_LABEL, ReactionIcon } from './icons';
import styles from './player.module.css';

export interface ReactionLayerHandle {
  /** Float `count` shapes of `kind`. `origin` is an x in px within the layer (defaults to a random lane). */
  burst(kind: ReactionKind, count?: number, origin?: { x: number; y?: number }): void;
}

const MAX_ALIVE = 36;
const MAX_PER_BURST = 6;
const QUEUE_LIMIT = 40;
const DRAIN_MS = 90;

const isKind = (k: string): k is ReactionKind => (REACTION_KINDS as readonly string[]).includes(k);

interface Spawn {
  kind: ReactionKind;
  x: number | null;
  y: number | null;
}

/**
 * Floating reaction shapes. Imperative and pooled: particles are cloned DOM nodes animated with
 * WAAPI (transform + opacity only), capped at MAX_ALIVE, with a throttled queue so a flood of
 * incoming bursts never drops frames. Decorative (aria-hidden).
 */
export function ReactionLayer({ ref }: { ref?: Ref<ReactionLayerHandle> }) {
  const layerRef = useRef<HTMLDivElement>(null);
  const templates = useRef<HTMLDivElement>(null);
  const alive = useRef(0);
  const queue = useRef<Spawn[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const spawn = useCallback((s: Spawn) => {
    const layer = layerRef.current;
    const tpl = templates.current?.querySelector<HTMLElement>(`[data-kind="${s.kind}"]`);
    if (!layer || !tpl || alive.current >= MAX_ALIVE) return;
    if (document.visibilityState === 'hidden') return;
    const w = layer.clientWidth;
    const h = layer.clientHeight;
    if (!w || !h) return;

    const node = tpl.cloneNode(true) as HTMLElement;
    node.removeAttribute('data-kind');
    const size = Math.round(Math.min(56, Math.max(26, w * 0.045)) * (0.8 + Math.random() * 0.45));
    const x0 = s.x ?? w * (0.7 + Math.random() * 0.24);
    const y0 = s.y ?? h - Math.min(120, h * 0.2);
    node.className = styles.reactionParticle ?? '';
    node.style.width = `${size}px`;
    node.style.height = `${size}px`;
    node.style.left = `${Math.round(x0 - size / 2)}px`;
    node.style.top = `${Math.round(y0 - size / 2)}px`;
    layer.appendChild(node);
    alive.current += 1;

    const done = () => {
      node.remove();
      alive.current = Math.max(0, alive.current - 1);
    };

    if (typeof node.animate !== 'function') {
      setTimeout(done, 600);
      return;
    }

    if (prefersReducedMotion()) {
      node.animate(
        [
          { opacity: 0, transform: 'scale(0.8)' },
          { opacity: 1, transform: 'scale(1)', offset: 0.25 },
          { opacity: 0, transform: 'scale(1)' },
        ],
        { duration: 900, easing: 'ease-out' },
      ).onfinish = done;
      return;
    }

    const rise = Math.min(y0 - size, h * (0.55 + Math.random() * 0.3));
    const sway = (Math.random() * 2 - 1) * Math.min(48, w * 0.05);
    const spin = (Math.random() * 2 - 1) * 28;
    const dur = 2300 + Math.random() * 1300;
    node.animate(
      [
        { transform: 'translate3d(0, 0, 0) scale(0.3) rotate(0deg)', opacity: 0 },
        { transform: `translate3d(${sway * 0.2}px, ${-rise * 0.1}px, 0) scale(1.18) rotate(${spin * 0.3}deg)`, opacity: 1, offset: 0.1 },
        { transform: `translate3d(${-sway * 0.6}px, ${-rise * 0.45}px, 0) scale(1) rotate(${-spin * 0.4}deg)`, opacity: 1, offset: 0.45 },
        { transform: `translate3d(${sway}px, ${-rise * 0.8}px, 0) scale(0.95) rotate(${spin}deg)`, opacity: 0.85, offset: 0.78 },
        { transform: `translate3d(${sway * 0.6}px, ${-rise}px, 0) scale(0.7) rotate(${spin * 1.2}deg)`, opacity: 0 },
      ],
      { duration: dur, easing: 'cubic-bezier(0.25, 0.6, 0.35, 1)', fill: 'forwards' },
    ).onfinish = done;
  }, []);

  const drain = useCallback(() => {
    const next = queue.current.shift();
    if (next) spawn(next);
    if (!queue.current.length && timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, [spawn]);

  useImperativeHandle(
    ref,
    () => ({
      burst(kind, count = 1, origin) {
        if (!isKind(kind)) return;
        const n = Math.max(1, Math.min(MAX_PER_BURST, Math.round(count)));
        for (let i = 0; i < n; i++) {
          if (queue.current.length >= QUEUE_LIMIT) break;
          const jitter = origin ? (Math.random() * 2 - 1) * 14 : 0;
          queue.current.push({ kind, x: origin ? origin.x + jitter : null, y: origin?.y ?? null });
        }
        if (!timer.current) {
          drain();
          timer.current = setInterval(drain, DRAIN_MS);
        }
      },
    }),
    [drain],
  );

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
    },
    [],
  );

  return (
    <div ref={layerRef} className={styles.reactionLayer} aria-hidden="true">
      <div ref={templates} hidden>
        {REACTION_KINDS.map((k) => (
          <span key={k} data-kind={k}>
            <ReactionIcon kind={k} />
          </span>
        ))}
      </div>
    </div>
  );
}

export interface ReactionBarProps {
  onReact(kind: ReactionKind, from: DOMRect): void;
  /** Temporarily disabled (rate limited). */
  cooling?: boolean;
  /** Small players: one button that fans out into the five. */
  compact?: boolean;
  className?: string;
}

/**
 * Five reaction buttons in a glass pill. Each press pops its icon and fires a local burst.
 * In `compact` mode a single heart button fans the others out (and folds them back).
 */
export function ReactionBar({ onReact, cooling, compact = false, className }: ReactionBarProps) {
  const [popped, setPopped] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);
  const expanded = !compact || open;
  return (
    <div
      role="group"
      aria-label="Send a reaction"
      className={cn(styles.reactionBar, className)}
      data-cooling={cooling ? 'true' : undefined}
      data-compact={compact ? 'true' : undefined}
    >
      <AnimatePresence initial={false}>
        {expanded
          ? REACTION_KINDS.map((k, i) => (
              <motion.button
                key={k}
                type="button"
                className={styles.reactionButton}
                aria-label={`Send ${REACTION_LABEL[k].toLowerCase()}`}
                disabled={cooling}
                initial={{ opacity: 0, x: compact ? 24 : 0, y: compact ? 0 : 10, scale: 0.6 }}
                animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 20, scale: 0.6, transition: { duration: 0.14, delay: 0.02 * (REACTION_KINDS.length - i) } }}
                transition={{ type: 'spring', stiffness: 460, damping: 24, delay: 0.035 * (compact ? REACTION_KINDS.length - i : i) }}
                whileHover={{ y: -3, scale: 1.12 }}
                whileTap={{ scale: 0.86 }}
                onClick={(e) => {
                  setPopped((p) => ({ ...p, [k]: (p[k] ?? 0) + 1 }));
                  onReact(k, e.currentTarget.getBoundingClientRect());
                }}
              >
                <motion.span
                  key={popped[k] ?? 0}
                  className={styles.reactionButtonIcon}
                  initial={popped[k] ? { scale: 0.6, rotate: -14 } : false}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 520, damping: 14 }}
                >
                  <ReactionIcon kind={k} />
                </motion.span>
              </motion.button>
            ))
          : null}
      </AnimatePresence>
      {compact ? (
        <motion.button
          type="button"
          className={cn(styles.reactionButton, styles.reactionToggle)}
          aria-expanded={open}
          aria-label={open ? 'Hide reactions' : 'Show reactions'}
          onClick={() => setOpen((o) => !o)}
          whileTap={{ scale: 0.86 }}
        >
          <motion.span className={styles.reactionButtonIcon} animate={{ rotate: open ? 45 : 0, scale: open ? 0.8 : 1 }} transition={{ type: 'spring', stiffness: 420, damping: 18 }}>
            {open ? (
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ width: '100%', height: '100%' }}>
                <path d="M12 5v14M5 12h14" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
              </svg>
            ) : (
              <ReactionIcon kind="heart" />
            )}
          </motion.span>
        </motion.button>
      ) : null}
    </div>
  );
}
