/** Stagger helper (server-safe): `<Reveal delay={stagger(i)}>` gives 60ms steps, capped. */
export const stagger = (i: number, step = 0.06, max = 0.48) => Math.min(i * step, max);
