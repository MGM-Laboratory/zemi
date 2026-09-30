import crossfade from './crossfade';
import type { TransitionDef } from '../types';

// Placeholder: replaced by the real "curtain-call" transition.
const curtainCall: TransitionDef = { key: 'curtain-call', run: crossfade.run };
export default curtainCall;
