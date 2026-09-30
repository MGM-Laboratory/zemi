import type { BumperData, BumperSlide, BumperTransitionKey, ShapeName } from '@zemi/shared';
import type { SlideHandle } from '../engine/slide-view';
import type { SlideColors } from '../engine/palette';
import type { gsap } from '../engine/gsap';

/**
 * A transition moves the screen from one bumper to the next. It receives both slides already
 * mounted on the 1920x1080 canvas (the incoming one hidden with `visibility: hidden`) and an
 * empty overlay layer above them, and returns a GSAP timeline that:
 *
 *  1. reveals the incoming slide at some point (ctx.show()),
 *  2. hides the outgoing one (ctx.hide()) by the end,
 *  3. contains a label 'reveal' where the incoming slide's entrance should start
 *     (the director adds `to.enter()` there; place it where the new content starts to be seen),
 *  4. leaves the overlay empty or fully transparent at the end (the director clears it anyway),
 *  5. never leaves inline transforms on the slide roots at the end (reset them with gsap.set
 *     clearProps in the last step) so the next transition starts clean.
 *
 * The timeline must be pure GSAP (no setTimeout), finish in about 0.8 to 2.4 seconds at speed 1,
 * and look right when played backwards too (dir = -1 means the operator went back: mirror
 * directions such as left/right sweeps). It may be finished early at any time with
 * `tl.progress(1)`, so every end state must be reachable by progress alone.
 */
export interface TransitionContext {
  /** The 1920x1080 canvas (position: absolute children). */
  stage: HTMLElement;
  /** Empty layer above both slides (z-index above content). Build your curtains here. */
  overlay: HTMLElement;
  from: SlideHandle | null;
  to: SlideHandle;
  fromSlide: BumperSlide | null;
  toSlide: BumperSlide;
  data: BumperData;
  fromColors: SlideColors | null;
  toColors: SlideColors;
  /** 1 forward, -1 backward. */
  dir: 1 | -1;
  /** 1 normal, below 1 calmer and slower. Multiply durations by 1/speed. */
  speed: number;
  /** 'full' | 'calm' (the director never asks for a signature transition in 'still'). */
  motion: 'full' | 'calm';
  /** Deterministic per pair of bumpers: use for layouts and randomness so A to B always looks the same. */
  seed: number;
  rand: () => number;
  width: number;
  height: number;
  /** Make the incoming slide visible (call inside the timeline, e.g. tl.call(ctx.show, [], t)). */
  show: () => void;
  /** Hide the outgoing slide. */
  hide: () => void;
  /** The incoming slide's short headline (for word train, stamp, scramble). */
  headline: string;
}

export interface TransitionDef {
  key: BumperTransitionKey;
  /** Build the timeline (paused is fine; the director plays it). */
  run: (ctx: TransitionContext) => gsap.core.Timeline;
}

export type { ShapeName };
