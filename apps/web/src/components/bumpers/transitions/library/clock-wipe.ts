import crossfade from './crossfade';
import type { TransitionDef } from '../types';

// Placeholder: replaced by the real "clock-wipe" transition.
const clockWipe: TransitionDef = { key: 'clock-wipe', run: crossfade.run };
export default clockWipe;
