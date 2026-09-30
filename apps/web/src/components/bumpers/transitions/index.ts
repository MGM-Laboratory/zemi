import type { BumperTransitionKey } from '@zemi/shared';
import curtainCall from './library/curtain-call';
import qIris from './library/q-iris';
import eyelids from './library/eyelids';
import shapeMorph from './library/shape-morph';
import gridMosaic from './library/grid-mosaic';
import magicMove from './library/magic-move';
import paperPlane from './library/paper-plane';
import coffeePour from './library/coffee-pour';
import bridgeArc from './library/bridge-arc';
import blockStack from './library/block-stack';
import hunchShutter from './library/hunch-shutter';
import confettiPop from './library/confetti-pop';
import splitDoors from './library/split-doors';
import portalZoom from './library/portal-zoom';
import stamp from './library/stamp';
import blinds from './library/blinds';
import pageTurn from './library/page-turn';
import ribbonSweep from './library/ribbon-sweep';
import scrambleCut from './library/scramble-cut';
import clockWipe from './library/clock-wipe';
import inkFlood from './library/ink-flood';
import gravityDrop from './library/gravity-drop';
import halftone from './library/halftone';
import wordWipe from './library/word-wipe';
import crossfade from './library/crossfade';
import cut from './library/cut';
import type { TransitionDef } from './types';

/** Every transition, by key. Each lives in its own file under transitions/library/. */
export const TRANSITIONS: Record<BumperTransitionKey, TransitionDef> = {
  'curtain-call': curtainCall,
  'q-iris': qIris,
  'eyelids': eyelids,
  'shape-morph': shapeMorph,
  'grid-mosaic': gridMosaic,
  'magic-move': magicMove,
  'paper-plane': paperPlane,
  'coffee-pour': coffeePour,
  'bridge-arc': bridgeArc,
  'block-stack': blockStack,
  'hunch-shutter': hunchShutter,
  'confetti-pop': confettiPop,
  'split-doors': splitDoors,
  'portal-zoom': portalZoom,
  'stamp': stamp,
  'blinds': blinds,
  'page-turn': pageTurn,
  'ribbon-sweep': ribbonSweep,
  'scramble-cut': scrambleCut,
  'clock-wipe': clockWipe,
  'ink-flood': inkFlood,
  'gravity-drop': gravityDrop,
  'halftone': halftone,
  'word-wipe': wordWipe,
  'crossfade': crossfade,
  'cut': cut,
};

export function getTransition(key: BumperTransitionKey | null | undefined): TransitionDef {
  return (key && TRANSITIONS[key]) || TRANSITIONS.crossfade;
}
