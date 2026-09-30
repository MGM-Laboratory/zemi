import crossfade from './crossfade';
import type { TransitionDef } from '../types';

// Placeholder: replaced by the real "shape-morph" transition.
const shapeMorph: TransitionDef = { key: 'shape-morph', run: crossfade.run };
export default shapeMorph;
