import crossfade from './crossfade';
import type { TransitionDef } from '../types';

// Placeholder: replaced by the real "page-turn" transition.
const pageTurn: TransitionDef = { key: 'page-turn', run: crossfade.run };
export default pageTurn;
