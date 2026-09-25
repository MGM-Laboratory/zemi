import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge that knows our custom type-scale utilities (text-display-xl, text-title, ...)
 * are font sizes, so `cn('text-display-l', 'text-ink')` keeps both.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['display-xl', 'display-l', 'display-m', 'title', 'body-l'] }],
    },
  },
});

/** Join class names, resolving Tailwind conflicts (last one wins). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Map v from [inMin, inMax] to [outMin, outMax], clamped. */
export const mapRange = (v: number, inMin: number, inMax: number, outMin: number, outMax: number) =>
  lerp(outMin, outMax, clamp((v - inMin) / (inMax - inMin || 1)));

/** Frame-rate independent damping factor for lerp-based smoothing. */
export const damp = (a: number, b: number, lambda: number, dtSeconds: number) =>
  lerp(a, b, 1 - Math.exp(-lambda * dtSeconds));

export const isBrowser = typeof window !== 'undefined';
