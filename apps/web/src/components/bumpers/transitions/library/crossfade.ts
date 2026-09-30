import { gsap } from '../../engine/gsap';
import { cleanRoots } from '../helpers';
import type { TransitionDef } from '../types';

/** A calm fade. The fallback for 'still' motion, overlays (lower thirds) and first frames. */
const crossfade: TransitionDef = {
  key: 'crossfade',
  run(ctx) {
    const d = 0.6 / ctx.speed;
    const tl = gsap.timeline();
    tl.call(ctx.show, [], 0);
    tl.fromTo(ctx.to.root, { opacity: 0 }, { opacity: 1, duration: d, ease: 'power1.inOut' }, 0);
    if (ctx.from?.root) tl.to(ctx.from.root, { opacity: 0, duration: d, ease: 'power1.inOut' }, 0);
    tl.addLabel('reveal', 0.05);
    tl.call(ctx.hide, [], d);
    tl.call(() => cleanRoots(ctx), [], d);
    return tl;
  },
};
export default crossfade;
