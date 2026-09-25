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
}

/** DESIGN.md easing tokens as GSAP-friendly strings. */
export const EASE = {
  out: 'expo.out',
  inOut: 'power3.inOut',
} as const;

export { gsap, ScrollTrigger, SplitText, useGSAP };
