'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ShapeName } from '@zemi/shared';
import { Character } from '@/components/brand/character';
import { ZemiMark } from '@/components/brand/zemi-mark';
import { TickingDigits } from '@/components/motion/ticking-digits';
import { cn } from '@/lib/utils';
import { formatClock } from './format';
import { CloseIcon, PlayPauseGlyph, RetryIcon } from './icons';
import styles from './player.module.css';
import type { PlayerError } from './types';

const SPRING = { type: 'spring', stiffness: 320, damping: 22 } as const;

/* ------------------------------------------------------------------ poster */

export function Poster({ src, lqip, color, hidden }: { src?: string | null; lqip?: string | null; color?: string | null; hidden: boolean }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!src && !lqip) return null;
  return (
    <div className={styles.poster} data-hidden={hidden ? 'true' : undefined} style={color ? { backgroundColor: color } : undefined} aria-hidden="true">
      {lqip ? <img src={lqip} alt="" className={styles.posterLqip} decoding="async" /> : null}
      {src && !failed ? (
        <img
          ref={(img) => {
            if (img?.complete && img.naturalWidth > 0) setLoaded(true);
          }}
          src={src}
          alt=""
          className={styles.posterImg}
          data-loaded={loaded ? 'true' : undefined}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ big play */

export function BigPlay({ show, playing, onPress, label }: { show: boolean; playing: boolean; onPress(): void; label: string }) {
  const reduced = useReducedMotion();
  return (
    <AnimatePresence>
      {show ? (
        <motion.button
          key="big"
          type="button"
          className={styles.bigPlay}
          aria-label={label}
          onClick={onPress}
          initial={{ opacity: 0, scale: reduced ? 1 : 0.6, rotate: reduced ? 0 : -12 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          exit={{ opacity: 0, scale: reduced ? 1 : 1.35, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } }}
          transition={reduced ? { duration: 0.15 } : SPRING}
          whileHover={reduced ? undefined : { scale: 1.08, rotate: 4 }}
          whileTap={reduced ? undefined : { scale: 0.9, rotate: -4 }}
        >
          <span className={styles.bigPlayHalo} aria-hidden="true" />
          <PlayPauseGlyph playing={playing} className={styles.bigPlayGlyph} color="var(--player-accent)" />
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ loading */

export function Loading({ show, label }: { show: boolean; label?: string }) {
  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          key="loading"
          className={styles.loading}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          role="status"
        >
          <ZemiMark variant="loading" size="clamp(40px, 9cqi, 88px)" title={label ?? 'Loading'} />
          {label ? <span className={styles.loadingLabel}>{label}</span> : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ error */

const ERROR_COPY: Record<PlayerError['code'], { title: string; body: string }> = {
  network: { title: 'The video tripped over a cable.', body: 'The connection dropped. Check your internet, then give it another go.' },
  media: { title: 'This file came out scrambled.', body: 'Something in the video didn’t decode. Trying again usually does it.' },
  unsupported: { title: 'Your browser can’t play this one.', body: 'Try a recent Chrome, Safari, Firefox or Edge. Sorry about that.' },
  unknown: { title: 'Well, that didn’t work.', body: 'Something went sideways while loading. Mind trying again?' },
};

export function ErrorState({ error, onRetry, download }: { error: PlayerError; onRetry(): void; download?: string | null }) {
  const copy = ERROR_COPY[error.code];
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <motion.div
      className={styles.stateCard}
      role="alert"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
    >
      <div className={styles.stateArt} aria-hidden="true">
        <Character shape="triangle" mood="surprised" size="clamp(44px, 10cqi, 110px)" />
      </div>
      <p className={styles.stateTitle}>{copy.title}</p>
      <p className={styles.stateBody}>{copy.body}</p>
      <div className={styles.stateActions}>
        <motion.button
          ref={btn}
          type="button"
          className={styles.pillButton}
          onClick={onRetry}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.95 }}
        >
          <RetryIcon className={styles.pillIcon} />
          Try again
        </motion.button>
        {download && error.code === 'unsupported' ? (
          <a className={cn(styles.pillButton, styles.pillGhost)} href={download} download>
            Download the video
          </a>
        ) : null}
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ signal lost slate */

const SLATE_CAST: Array<{ shape: ShapeName; mood: 'idle' | 'sleepy' | 'surprised' | 'thinking'; seed: number }> = [
  { shape: 'circle', mood: 'thinking', seed: 1 },
  { shape: 'triangle', mood: 'surprised', seed: 2 },
  { shape: 'square', mood: 'sleepy', seed: 3 },
  { shape: 'arch', mood: 'idle', seed: 4 },
];

export type SlateVariant = 'lost' | 'waiting' | 'ended';

const SLATE_COPY: Record<SlateVariant, { title: string; body: string }> = {
  lost: { title: 'Signal lost, hang tight.', body: 'The stream hiccuped. It picks back up right here, no refresh needed.' },
  waiting: { title: 'Almost on air.', body: 'Mics are getting tested. Grab a coffee, it starts right here.' },
  ended: { title: 'That’s a wrap.', body: 'The stream is done for today. The recording lands on this page soon.' },
};

/**
 * Shown while a live stream has no signal (lost), before it starts (waiting) and after the
 * admin ends it (ended). The cast waits on a little bench, stepping at a stop-motion 15fps,
 * while a timer counts how long we've been waiting. When it ends, they cheer once.
 */
export function SignalSlate({ variant, since }: { variant: SlateVariant; since: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  const [cheer, setCheer] = useState(0);
  const lost = variant === 'lost';
  const ended = variant === 'ended';
  useEffect(() => {
    if (!lost || !since) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [lost, since]);
  useEffect(() => {
    if (!ended) return;
    const t = setTimeout(() => setCheer((c) => c + 1), 350);
    return () => clearTimeout(t);
  }, [ended]);
  const waited = since ? Math.max(0, Math.floor((now - since) / 1000)) : 0;
  const copy = SLATE_COPY[variant];
  return (
    <motion.div
      className={styles.slate}
      data-variant={variant}
      role="status"
      aria-live="polite"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.4 } }}
      transition={{ duration: 0.35 }}
    >
      <div className={styles.slateGrid} aria-hidden="true" />
      <div className={styles.slateCast} aria-hidden="true">
        {SLATE_CAST.map((c, i) => (
          <span key={c.shape} className={styles.slateActor} style={{ animationDelay: `${-i * 0.37}s` }}>
            <Character
              shape={c.shape}
              mood={ended ? 'happy' : lost ? c.mood : 'idle'}
              size="clamp(30px, 8.5cqi, 96px)"
              seed={c.seed}
              cheer={ended && cheer ? cheer + i : undefined}
            />
          </span>
        ))}
        <span className={styles.slateBench} />
      </div>
      <p className={styles.slateTitle}>{copy.title}</p>
      <p className={styles.slateBody}>{copy.body}</p>
      {lost && since ? (
        <p className={styles.slateTimer}>
          <span className={styles.slateDot} aria-hidden="true" />
          Waiting <TickingDigits value={formatClock(waited, Math.max(waited, 60))} label={`for ${waited} seconds`} />
        </p>
      ) : null}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ end card */

export function EndCard({ onReplay }: { onReplay(): void }) {
  const [cheer, setCheer] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setCheer(1), 250);
    return () => clearTimeout(t);
  }, []);
  return (
    <motion.div className={styles.stateCard} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
      <div className={styles.stateArt} aria-hidden="true">
        {(['circle', 'triangle', 'square', 'arch'] as const).map((s, i) => (
          <motion.span
            key={s}
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ ...SPRING, delay: 0.06 * i }}
          >
            <Character shape={s} mood="happy" size="clamp(26px, 6.5cqi, 72px)" cheer={cheer ? cheer + i : undefined} seed={i} />
          </motion.span>
        ))}
      </div>
      <p className={styles.stateTitle}>That’s a wrap.</p>
      <p className={styles.stateBody}>Thanks for watching. See you next Friday.</p>
      <div className={styles.stateActions}>
        <motion.button type="button" className={styles.pillButton} onClick={onReplay} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.95 }}>
          <RetryIcon className={styles.pillIcon} />
          Watch again
        </motion.button>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ OSD flash */

export interface Flash {
  id: number;
  text: string;
  icon?: ReactNode;
}

export function Osd({ flash }: { flash: Flash | null }) {
  return (
    <div className={styles.osdWrap} aria-hidden="true">
      <AnimatePresence>
        {flash ? (
          <motion.div
            key={flash.id}
            className={styles.osd}
            initial={{ opacity: 0, scale: 0.8, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.08, transition: { duration: 0.2 } }}
            transition={{ type: 'spring', stiffness: 520, damping: 26 }}
          >
            {flash.icon ? <span className={styles.osdIcon}>{flash.icon}</span> : null}
            <span className={styles.osdText}>{flash.text}</span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ double tap ripple */

export interface Ripple {
  id: number;
  side: 'left' | 'right';
  seconds: number;
}

export function TapRipple({ ripple }: { ripple: Ripple | null }) {
  return (
    <AnimatePresence>
      {ripple ? (
        <motion.div
          key={`${ripple.side}-${ripple.id}`}
          className={styles.ripple}
          data-side={ripple.side}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.35 } }}
          aria-hidden="true"
        >
          <motion.span
            key={ripple.seconds}
            className={styles.rippleLabel}
            initial={{ scale: 0.7 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 600, damping: 18 }}
          >
            <span className={styles.rippleArrows} data-side={ripple.side}>
              <i />
              <i />
              <i />
            </span>
            <span className="mono">{ripple.side === 'left' ? '-' : '+'}{ripple.seconds}s</span>
          </motion.span>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ shortcuts */

const SHORTCUTS_VOD: Array<[string[], string]> = [
  [['Space', 'K'], 'Play or pause'],
  [['J', 'L'], 'Back or forward 10s'],
  [['←', '→'], 'Back or forward 5s'],
  [['↑', '↓'], 'Volume up or down'],
  [['M'], 'Mute'],
  [['F'], 'Fullscreen'],
  [['T'], 'Theater mode'],
  [['C'], 'Captions'],
  [['I'], 'Picture in picture'],
  [['0', '9'], 'Jump to 0% to 90%'],
  [['<', '>'], 'Slower or faster'],
  [['?'], 'This list'],
];

const SHORTCUTS_LIVE: Array<[string[], string]> = [
  [['Space', 'K'], 'Play or pause'],
  [['L', 'End'], 'Back to live'],
  [['↑', '↓'], 'Volume up or down'],
  [['M'], 'Mute'],
  [['F'], 'Fullscreen'],
  [['T'], 'Theater mode'],
  [['C'], 'Captions'],
  [['I'], 'Picture in picture'],
  [['?'], 'This list'],
];

export function ShortcutsPanel({ open, live, onClose }: { open: boolean; live: boolean; onClose(): void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) requestAnimationFrame(() => closeRef.current?.focus({ preventScroll: true }));
  }, [open]);
  const list = live ? SHORTCUTS_LIVE : SHORTCUTS_VOD;
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="keys"
          className={styles.shortcuts}
          role="dialog"
          aria-modal="false"
          aria-label="Keyboard shortcuts"
          data-lenis-prevent
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 6, transition: { duration: 0.15 } }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || e.key === '?') {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }
          }}
        >
          <div className={styles.shortcutsHead}>
            <p className={styles.shortcutsTitle}>Keyboard shortcuts</p>
            <button ref={closeRef} type="button" className={styles.iconGhost} aria-label="Close shortcuts" onClick={onClose}>
              <CloseIcon />
            </button>
          </div>
          <dl className={styles.shortcutsList}>
            {list.map(([keys, what], i) => (
              <motion.div
                key={what}
                className={styles.shortcutRow}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.02 * i, duration: 0.25 }}
              >
                <dt>
                  {keys.map((k, j) => (
                    <span key={k}>
                      {j > 0 ? <span className={styles.kbdSep}>{keys.length === 2 && what.includes('%') ? 'to' : 'or'}</span> : null}
                      <kbd className={styles.kbd}>{k}</kbd>
                    </span>
                  ))}
                </dt>
                <dd>{what}</dd>
              </motion.div>
            ))}
          </dl>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ small chips */

export function FloatingChip({
  show,
  children,
  action,
  onAction,
  onDismiss,
  position = 'bottom-left',
}: {
  show: boolean;
  children: ReactNode;
  action?: string;
  onAction?(): void;
  onDismiss?(): void;
  position?: 'bottom-left' | 'top-right';
}) {
  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          key="chip"
          className={styles.floatChip}
          data-position={position}
          initial={{ opacity: 0, y: position === 'top-right' ? -10 : 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: position === 'top-right' ? -6 : 6, transition: { duration: 0.16 } }}
          transition={SPRING}
        >
          <span>{children}</span>
          {action ? (
            <button type="button" className={styles.floatChipAction} onClick={onAction}>
              {action}
            </button>
          ) : null}
          {onDismiss ? (
            <button type="button" className={styles.floatChipClose} aria-label="Dismiss" onClick={onDismiss}>
              <CloseIcon />
            </button>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
