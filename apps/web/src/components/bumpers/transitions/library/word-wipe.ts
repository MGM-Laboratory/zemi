import crossfade from './crossfade';
import type { TransitionDef } from '../types';

// Placeholder: replaced by the real "word-wipe" transition.
const wordWipe: TransitionDef = { key: 'word-wipe', run: crossfade.run };
export default wordWipe;
