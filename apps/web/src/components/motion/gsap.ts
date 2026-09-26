'use client';

/**
 * GSAP with every plugin we use, registered once. Always import GSAP from here in client code
 * so plugins are registered before use.
 */
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP);
  gsap.defaults({ ease: 'expo.out', duration: 0.9 });
  /*
   * Refresh ScrollTriggers in page order, not creation order. A pin that gets re-created later (a
   * gsap.matchMedia breakpoint change on resize or rotation, Fast Refresh, a section that mounts
   * late) would otherwise be measured after the pins below it, and those would start too early and
   * slide over the sections above them. Any `refreshPriority` key turns on ScrollTrigger's sort
   * (by `refreshPriority`, then by where the trigger sits on the page); 0 keeps the page order.
   * Triggers with no element that read other triggers (the home story clock) use -1 to go last.
   */
  ScrollTrigger.defaults({ refreshPriority: 0 });
}

/** DESIGN.md easing tokens as GSAP-friendly strings. */
export const EASE = {
  out: 'expo.out',
  inOut: 'power3.inOut',
} as const;

export { gsap, ScrollTrigger, SplitText, useGSAP };
