import crossfade from './crossfade';
import type { TransitionDef } from '../types';

// Placeholder: replaced by the real "block-stack" transition.
const blockStack: TransitionDef = { key: 'block-stack', run: crossfade.run };
export default blockStack;
