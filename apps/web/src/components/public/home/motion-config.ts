/**
 * Media conditions shared by every home scroll scene (gsap.matchMedia keys).
 * - long: laptops and up, full pinned scrubs
 * - short: phones and tablets in portrait, shorter pins
 * - flow: short landscape screens, no pinning, scenes scrub while they pass
 * - reduced: prefers-reduced-motion, no pin, no scrub, final state
 */
export const MQ = {
  long: '(min-width: 1024px) and (min-height: 600px) and (prefers-reduced-motion: no-preference)',
  short:
    '(max-width: 1023.98px) and (min-height: 600px) and (prefers-reduced-motion: no-preference)',
  flow: '(max-height: 599.98px) and (prefers-reduced-motion: no-preference)',
  reduced: '(prefers-reduced-motion: reduce)',
} as const;

export type MQConditions = { long?: boolean; short?: boolean; flow?: boolean; reduced?: boolean };

/**
 * Pin distance for a scene. `long` and `short` are multiples of the viewport height.
 * Returns null when the scene should not pin (flow / reduced).
 */
export function pinEnd(c: MQConditions, long: number, short: number): string | null {
  if (c.long) return `+=${Math.round(long * 100)}%`;
  if (c.short) return `+=${Math.round(short * 100)}%`;
  return null;
}

/** Story clock anchors: the element's top crossing this viewport line stamps its time. */
export const STAMP_LINE = 'top 55%';
