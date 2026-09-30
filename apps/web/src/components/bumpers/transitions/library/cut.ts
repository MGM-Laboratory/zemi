import { gsap } from '../../engine/gsap';
import type { TransitionDef } from '../types';

/** Instant switch (emergency button, or when the operator picks "Cut"). */
const cut: TransitionDef = {
  key: 'cut',
  run(ctx) {
    const tl = gsap.timeline();
    tl.call(ctx.show, [], 0);
    tl.call(ctx.hide, [], 0);
    tl.addLabel('reveal', 0);
    tl.to({}, { duration: 0.01 });
    return tl;
  },
};
export default cut;
