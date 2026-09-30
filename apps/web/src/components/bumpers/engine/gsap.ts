'use client';

/**
 * GSAP for bumpers: the shared instance from components/motion/gsap plus the plugins only the
 * bumper engine needs (kept out of the public bundle). Always import GSAP from here in bumper code.
 */
import { CustomEase } from 'gsap/CustomEase';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { Flip } from 'gsap/Flip';
import { MorphSVGPlugin } from 'gsap/MorphSVGPlugin';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import { Physics2DPlugin } from 'gsap/Physics2DPlugin';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import { gsap, SplitText, useGSAP } from '@/components/motion/gsap';

let registered = false;

export function ensureBumperGsap() {
  if (registered || typeof window === 'undefined') return;
  registered = true;
  gsap.registerPlugin(CustomEase, DrawSVGPlugin, Flip, MorphSVGPlugin, MotionPathPlugin, Physics2DPlugin, ScrambleTextPlugin, SplitText);
  // DESIGN.md easing tokens, exact.
  CustomEase.create('zemiOut', '0.22,1,0.36,1');
  CustomEase.create('zemiInOut', '0.65,0,0.35,1');
  CustomEase.create('zemiPop', '0.34,1.56,0.64,1');
}
ensureBumperGsap();

/** Named eases every bumper animation should use (never rely on the global gsap default). */
export const BE = {
  out: 'zemiOut',
  inOut: 'zemiInOut',
  pop: 'zemiPop',
  back: 'back.out(1.7)',
  bounce: 'bounce.out',
  elastic: 'elastic.out(1, 0.5)',
  snap: 'power4.inOut',
  linear: 'none',
} as const;

export { CustomEase, DrawSVGPlugin, Flip, gsap, MorphSVGPlugin, MotionPathPlugin, Physics2DPlugin, ScrambleTextPlugin, SplitText, useGSAP };
