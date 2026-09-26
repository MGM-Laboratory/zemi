'use client';

import { motion, useReducedMotion } from 'motion/react';
import type { CSSProperties, ReactNode, SVGProps } from 'react';
import type { ReactionKind } from '@zemi/shared';

/*
 * Player icons. Control icons are 24x24, stroke = currentColor, round caps, so they inherit the
 * control color. Reaction icons are 48x48 "stickers" built from the four brand shapes with a
 * white outline, so they read on any frame of video.
 */

type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'>;

const base = (p: IconProps): SVGProps<SVGSVGElement> => ({
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
  ...p,
});

/* ------------------------------------------------------------------ play / pause morph */

// Play = the Hunch triangle turned right, split in two so each half can become a pause bar.
const PLAY_D = 'M30 18 L57 34 L57 66 L30 82 Z M57 34 L84 50 L84 50 L57 66 Z';
const PAUSE_D = 'M27 20 L40 20 L40 80 L27 80 Z M60 20 L73 20 L73 80 L60 80 Z';

/**
 * Play glyph that morphs into pause. Corners are rounded with a same-color round-join stroke,
 * so both states keep the soft brand corners.
 */
export function PlayPauseGlyph({ playing, className, color = 'currentColor' }: { playing: boolean; className?: string; color?: string }) {
  const reduced = useReducedMotion();
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true" focusable="false" style={{ overflow: 'visible' }}>
      <motion.path
        initial={false}
        animate={{ d: playing ? PAUSE_D : PLAY_D }}
        transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 28 }}
        fill={color}
        stroke={color}
        strokeWidth={11}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ controls */

export function VolumeIcon({ level, ...p }: IconProps & { level: 0 | 1 | 2 }) {
  return (
    <svg {...base(p)}>
      <path d="M4 9.5h3l4.5-4v13L7 14.5H4z" fill="currentColor" />
      {level === 0 ? (
        <path d="M16 9.5l5 5m0-5l-5 5" />
      ) : (
        <>
          <path d="M15.5 9a4.2 4.2 0 0 1 0 6" data-wave="1" />
          {level === 2 ? <path d="M18.2 6.2a8.2 8.2 0 0 1 0 11.6" data-wave="2" /> : null}
        </>
      )}
    </svg>
  );
}

export function SkipIcon({ dir, ...p }: IconProps & { dir: 'back' | 'forward' }) {
  const flip = dir === 'forward';
  return (
    <svg {...base(p)}>
      <g transform={flip ? 'matrix(-1 0 0 1 24 0)' : undefined}>
        <path d="M5.2 8.5A8 8 0 1 1 4 12.5" />
        <path d="M4.6 4.2v4.6h4.6" />
      </g>
      <text
        x="12.4"
        y="15.3"
        textAnchor="middle"
        fontSize="7.4"
        fontWeight="800"
        fill="currentColor"
        stroke="none"
        style={{ fontFamily: 'var(--font-mono)', fontVariationSettings: "'MONO' 1" }}
      >
        10
      </text>
    </svg>
  );
}

export function FullscreenIcon({ active, ...p }: IconProps & { active: boolean }) {
  return (
    <svg {...base(p)}>
      {active ? (
        <path d="M9 4v3.5A1.5 1.5 0 0 1 7.5 9H4M15 4v3.5A1.5 1.5 0 0 0 16.5 9H20M9 20v-3.5A1.5 1.5 0 0 0 7.5 15H4M15 20v-3.5a1.5 1.5 0 0 1 1.5-1.5H20" />
      ) : (
        <path d="M4 9V6a2 2 0 0 1 2-2h3M20 9V6a2 2 0 0 0-2-2h-3M4 15v3a2 2 0 0 0 2 2h3M20 15v3a2 2 0 0 1-2 2h-3" />
      )}
    </svg>
  );
}

export function PipIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <rect x="12" y="11.5" width="6" height="4.5" rx="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function TheaterIcon({ active, ...p }: IconProps & { active: boolean }) {
  return (
    <svg {...base(p)}>
      {active ? <rect x="5.5" y="7.5" width="13" height="9" rx="2.2" /> : <rect x="2.5" y="6" width="19" height="12" rx="3" />}
    </svg>
  );
}

/** Settings as three sliders whose knobs are tiny brand shapes (they slide on hover). */
export function SettingsIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M3 6h18M3 12h18M3 18h18" strokeOpacity="0.55" />
      <circle data-knob="1" cx="8" cy="6" r="2.4" fill="currentColor" stroke="none" />
      <rect data-knob="2" x="13.6" y="9.6" width="4.8" height="4.8" rx="1.2" fill="currentColor" stroke="none" />
      <path data-knob="3" d="M9 15.4l2.7 4.8H6.3z" fill="currentColor" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function ChaptersIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M9 6.5h11M9 12h11M9 17.5h7" />
      <circle cx="4.5" cy="6.5" r="1.6" fill="currentColor" stroke="none" />
      <rect x="3" y="10.5" width="3" height="3" rx="0.8" fill="currentColor" stroke="none" />
      <path d="M4.5 16l1.6 2.8H2.9z" fill="currentColor" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

export function CaptionsIcon({ active, ...p }: IconProps & { active: boolean }) {
  return (
    <svg {...base(p)}>
      <rect x="3" y="5" width="18" height="14" rx="3.5" fill={active ? 'currentColor' : 'none'} />
      <path
        d="M10.4 10.2a2.2 2.2 0 1 0 0 3.6M16.9 10.2a2.2 2.2 0 1 0 0 3.6"
        stroke={active ? 'var(--player-ink, #0e1116)' : 'currentColor'}
        strokeWidth="1.8"
      />
    </svg>
  );
}

export function KeyboardIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="2.5" y="6" width="19" height="12" rx="3" />
      <path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M8 14h8" />
    </svg>
  );
}

export function CheckIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M5 12.5l4.2 4.2L19 7" />
    </svg>
  );
}

const CHEVRON: Record<'left' | 'right' | 'down', string> = {
  right: 'M9.5 5.5L16 12l-6.5 6.5',
  left: 'M14.5 5.5L8 12l6.5 6.5',
  down: 'M5.5 9.5L12 16l6.5-6.5',
};

export function ChevronIcon({ dir = 'right', ...p }: IconProps & { dir?: 'left' | 'right' | 'down' }) {
  return (
    <svg {...base(p)}>
      <path d={CHEVRON[dir]} />
    </svg>
  );
}

export function RetryIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M19.5 12.5A7.5 7.5 0 1 1 17.3 7" />
      <path d="M19.4 3.8v4.4H15" />
    </svg>
  );
}

export function CloseIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function LiveEdgeIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M5 6l6 6-6 6M12 6l6 6-6 6" />
    </svg>
  );
}

/* ------------------------------------------------------------------ reactions */

const BLUE = '#3a6dc5';
const RED = '#f94141';
const YELLOW = '#f7bf33';
const GREEN = '#0f8657';
const INK = '#0e1116';
const PAPER = '#ffffff';

/** Draw a group twice: a thick white outline pass, then the fills. Sticker look. */
function Sticker({ children, outline = 5 }: { children: ReactNode; outline?: number }) {
  return (
    <>
      <g fill={PAPER} stroke={PAPER} strokeWidth={outline} strokeLinejoin="round" strokeLinecap="round">
        {children}
      </g>
      {children}
    </>
  );
}

const REACTION_ART: Record<ReactionKind, ReactNode> = {
  // Two Block squares clapping, with sparks.
  clap: (
    <>
      <Sticker>
        <rect x="9" y="13" width="19" height="25" rx="6" transform="rotate(-16 18.5 25.5)" fill={YELLOW} />
        <rect x="19" y="12" width="19" height="25" rx="6" transform="rotate(12 28.5 24.5)" fill="#d99e12" />
      </Sticker>
      <g stroke={PAPER} strokeWidth="3" strokeLinecap="round">
        <path d="M24 3.5v4.5M14.5 6.5l2.2 3.4M33.5 6.5l-2.2 3.4" />
      </g>
      <g stroke={INK} strokeWidth="1.6" strokeLinecap="round" fill="none">
        <path d="M24 4v3.6M15 7l1.8 2.8M33 7l-1.8 2.8" />
      </g>
    </>
  ),
  // Two Q circles and a Hunch triangle make a heart.
  heart: (
    <Sticker>
      <g fill={RED}>
        <circle cx="16.5" cy="18.5" r="9.5" />
        <circle cx="31.5" cy="18.5" r="9.5" />
        <path d="M8 22.5 L40 22.5 Q41 25 39 27.5 L26.4 40.6 Q24 43 21.6 40.6 L9 27.5 Q7 25 8 22.5 Z" />
      </g>
      <circle cx="13.5" cy="15.5" r="2.6" fill={PAPER} opacity="0.85" />
    </Sticker>
  ),
  // A tall Hunch with a yellow Hunch inside: fire.
  fire: (
    <>
      <Sticker>
        <path d="M24 4 Q26 4 27.5 7.5 L38.5 32 Q41 43 30 43 L18 43 Q7 43 9.5 32 L20.5 7.5 Q22 4 24 4 Z" fill={RED} />
      </Sticker>
      <path d="M24 21 Q25.2 21 26 23 L31 34.5 Q32 39.5 27.5 39.5 L20.5 39.5 Q16 39.5 17 34.5 L22 23 Q22.8 21 24 21 Z" fill={YELLOW} />
    </>
  ),
  // A yellow bulb (Q) on a blue Block base, with rays.
  idea: (
    <>
      <g stroke={PAPER} strokeWidth="6" strokeLinecap="round">
        <path d="M24 2.5v3M8.5 9l2.2 2.2M39.5 9l-2.2 2.2M4.5 22h3M40.5 22h3" />
      </g>
      <g stroke={YELLOW} strokeWidth="3" strokeLinecap="round">
        <path d="M24 2.5v3M8.5 9l2.2 2.2M39.5 9l-2.2 2.2M4.5 22h3M40.5 22h3" />
      </g>
      <Sticker>
        <circle cx="24" cy="21" r="12" fill={YELLOW} />
        <rect x="17.5" y="32" width="13" height="10" rx="3.5" fill={BLUE} />
      </Sticker>
      <path d="M19.5 37h9" stroke={PAPER} strokeWidth="1.8" strokeLinecap="round" opacity="0.8" />
      <circle cx="19.5" cy="16.5" r="2.6" fill={PAPER} opacity="0.9" />
    </>
  ),
  // Bridge laughing so hard its eyes close. No mouths, ever.
  laugh: (
    <>
      <Sticker>
        <path d="M7 42 V24 A17 17 0 0 1 41 24 V42 Z" fill={GREEN} />
      </Sticker>
      <g fill="none" stroke={INK} strokeWidth="2.8" strokeLinecap="round">
        <path d="M14.5 25.5 Q17.5 21 20.5 25.5" />
        <path d="M27.5 25.5 Q30.5 21 33.5 25.5" />
      </g>
      <g fill="#8fd3f4" stroke={PAPER} strokeWidth="1.4">
        <path d="M10.5 28 Q12.6 31 11.4 32.6 Q10.4 33.8 9.4 32.6 Q8.4 31 10.5 28 Z" />
        <path d="M37.5 28 Q39.6 31 38.6 32.6 Q37.6 33.8 36.6 32.6 Q35.4 31 37.5 28 Z" />
      </g>
    </>
  ),
};

export const REACTION_LABEL: Record<ReactionKind, string> = {
  clap: 'Clap',
  heart: 'Love it',
  fire: 'Fire',
  idea: 'Big idea',
  laugh: 'Haha',
};

export function ReactionIcon({ kind, className, style }: { kind: ReactionKind; className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 48 48" className={className} style={{ overflow: 'visible', ...style }} aria-hidden="true" focusable="false">
      {REACTION_ART[kind]}
    </svg>
  );
}
