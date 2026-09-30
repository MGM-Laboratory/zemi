'use client';

import type { CSSProperties, ReactNode } from 'react';
import { INK } from '../engine/palette';

/**
 * Sticker icons in the brand language: chunky brand-color fills with a 3px ink outline on a 64
 * grid. Used by house rules, announcements and the "+ Add sticker" element.
 */
const B = '#3a6dc5';
const R = '#f94141';
const Y = '#f7bf33';
const G = '#0f8657';
const W = '#ffffff';
const S = { stroke: INK, strokeWidth: 3, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export const STICKERS: Record<string, { label: string; draw: ReactNode }> = {
  coffee: {
    label: 'Coffee',
    draw: (
      <>
        <path d="M14 26h30v14a12 12 0 0 1-12 12h-6a12 12 0 0 1-12-12Z" fill={Y} {...S} />
        <path d="M44 30h4a6 6 0 0 1 0 12h-5" fill="none" {...S} />
        <path d="M22 12q-3 4 0 8M30 10q-3 4 0 8M38 12q-3 4 0 8" fill="none" {...S} />
        <path d="M10 56h40" {...S} />
      </>
    ),
  },
  mic: {
    label: 'Microphone',
    draw: (
      <>
        <rect x="22" y="8" width="20" height="30" rx="10" fill={B} {...S} />
        <path d="M16 30a16 16 0 0 0 32 0M32 46v10M24 56h16" fill="none" {...S} />
        <path d="M22 20h20M22 27h20" {...S} />
      </>
    ),
  },
  paper: {
    label: 'Paper',
    draw: (
      <>
        <path d="M16 8h22l12 12v34a2 2 0 0 1-2 2H16a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Z" fill={W} {...S} />
        <path d="M38 8v12h12" fill={Y} {...S} />
        <path d="M22 30h20M22 38h20M22 46h12" {...S} />
      </>
    ),
  },
  plane: {
    label: 'Paper plane',
    draw: (
      <>
        <path d="M6 30 58 8 44 56 32 38Z" fill={W} {...S} />
        <path d="M58 8 32 38l-2 14 10-10" fill={B} {...S} />
      </>
    ),
  },
  clock: {
    label: 'Clock',
    draw: (
      <>
        <circle cx="32" cy="32" r="24" fill={W} {...S} />
        <path d="M32 18v14l10 6" fill="none" {...S} />
        <circle cx="32" cy="32" r="3" fill={R} />
      </>
    ),
  },
  spark: {
    label: 'Spark',
    draw: <path d="M32 4 38 26 60 32 38 38 32 60 26 38 4 32 26 26Z" fill={Y} {...S} />,
  },
  heart: {
    label: 'Heart',
    draw: <path d="M32 54S8 40 8 24a12 12 0 0 1 24-4 12 12 0 0 1 24 4c0 16-24 30-24 30Z" fill={R} {...S} />,
  },
  star: {
    label: 'Star',
    draw: <path d="m32 6 7.6 16.4L57 24l-13 12 3.4 18L32 45.4 16.6 54 20 36 7 24l17.4-1.6Z" fill={Y} {...S} />,
  },
  pin: {
    label: 'Location',
    draw: (
      <>
        <path d="M32 58S14 38 14 24a18 18 0 0 1 36 0c0 14-18 34-18 34Z" fill={R} {...S} />
        <circle cx="32" cy="24" r="7" fill={W} {...S} />
      </>
    ),
  },
  camera: {
    label: 'Camera',
    draw: (
      <>
        <path d="M8 20h12l4-6h16l4 6h12v30H8Z" fill={B} {...S} />
        <circle cx="32" cy="35" r="10" fill={W} {...S} />
        <circle cx="48" cy="26" r="2" fill={INK} />
      </>
    ),
  },
  bulb: {
    label: 'Idea',
    draw: (
      <>
        <path d="M22 40a16 16 0 1 1 20 0v6H22Z" fill={Y} {...S} />
        <path d="M24 52h16M27 58h10" {...S} />
      </>
    ),
  },
  wifi: {
    label: 'Wi-Fi',
    draw: (
      <>
        <path d="M6 24a38 38 0 0 1 52 0M14 33a26 26 0 0 1 36 0M22 42a14 14 0 0 1 20 0" fill="none" {...S} />
        <circle cx="32" cy="51" r="4.5" fill={G} {...S} />
      </>
    ),
  },
  silent: {
    label: 'Phones on silent',
    draw: (
      <>
        <rect x="18" y="6" width="28" height="52" rx="6" fill={W} {...S} />
        <path d="M28 50h8" {...S} />
        <path d="M10 14 54 54" stroke={R} strokeWidth={5} strokeLinecap="round" />
      </>
    ),
  },
  rec: {
    label: 'Recording',
    draw: (
      <>
        <circle cx="32" cy="32" r="24" fill={W} {...S} />
        <circle cx="32" cy="32" r="12" fill={R} />
      </>
    ),
  },
  question: {
    label: 'Question',
    draw: (
      <>
        <circle cx="32" cy="32" r="24" fill={B} {...S} />
        <path d="M25 25a7 7 0 1 1 9 7c-2 1-2 3-2 5" fill="none" stroke={W} strokeWidth={4} strokeLinecap="round" />
        <circle cx="32" cy="45" r="2.6" fill={W} />
      </>
    ),
  },
  chat: {
    label: 'Chat',
    draw: (
      <>
        <path d="M8 14h48v28H26l-12 10v-10H8Z" fill={G} {...S} />
        <path d="M18 24h28M18 32h18" stroke={W} strokeWidth={3} strokeLinecap="round" />
      </>
    ),
  },
  trophy: {
    label: 'Trophy',
    draw: (
      <>
        <path d="M18 8h28v14a14 14 0 0 1-28 0Z" fill={Y} {...S} />
        <path d="M18 14H9q0 12 11 14M46 14h9q0 12-11 14M32 36v10M22 56h20l-3-10H25Z" fill="none" {...S} />
      </>
    ),
  },
  calendar: {
    label: 'Calendar',
    draw: (
      <>
        <rect x="8" y="12" width="48" height="44" rx="6" fill={W} {...S} />
        <path d="M8 24h48" {...S} />
        <path d="M20 6v10M44 6v10" {...S} />
        <rect x="36" y="34" width="10" height="10" rx="2" fill={R} />
      </>
    ),
  },
  laptop: {
    label: 'Laptop',
    draw: (
      <>
        <rect x="12" y="12" width="40" height="28" rx="3" fill={B} {...S} />
        <path d="M4 50h56l-6-10H10Z" fill={W} {...S} />
      </>
    ),
  },
  flag: {
    label: 'Flag',
    draw: (
      <>
        <path d="M14 58V8" {...S} />
        <path d="M14 10h36l-8 10 8 10H14" fill={R} {...S} />
      </>
    ),
  },
  door: {
    label: 'Exit',
    draw: (
      <>
        <path d="M14 58V8h28v50" fill={G} {...S} />
        <circle cx="35" cy="34" r="2.6" fill={W} />
        <path d="M8 58h48" {...S} />
      </>
    ),
  },
  food: {
    label: 'Snacks',
    draw: (
      <>
        <path d="M8 30h48a24 24 0 0 1-48 0Z" fill={Y} {...S} />
        <path d="M20 22q0-8 6-8M32 22q0-10 8-10" fill="none" {...S} />
      </>
    ),
  },
};

export const STICKER_KEYS = Object.keys(STICKERS);

export function Sticker({ name, className, style, title }: { name: string; className?: string; style?: CSSProperties; title?: string }) {
  const s = STICKERS[name] ?? STICKERS.spark!;
  return (
    <svg viewBox="0 0 64 64" className={className} style={{ display: 'block', width: '100%', height: '100%', overflow: 'visible', ...style }} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} data-sticker={name}>
      {s.draw}
    </svg>
  );
}
