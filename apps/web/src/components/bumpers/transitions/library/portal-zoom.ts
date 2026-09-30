import crossfade from './crossfade';
import type { TransitionDef } from '../types';

// Placeholder: replaced by the real "portal-zoom" transition.
const portalZoom: TransitionDef = { key: 'portal-zoom', run: crossfade.run };
export default portalZoom;
