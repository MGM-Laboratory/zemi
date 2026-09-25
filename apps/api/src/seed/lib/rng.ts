/**
 * Deterministic randomness for the seeder (mulberry32). The same SEED_RANDOM gives the same people,
 * talks and numbers on every run. Secrets (ticket codes, QR tokens, stream keys) never come from
 * here: they use node:crypto, so a known seed can't be used to guess real tickets.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  /** Float in [0, 1). */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max] (inclusive). */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (!items.length) throw new Error('pick() on an empty list');
    return items[Math.floor(this.next() * items.length)]!;
  }

  /** Weighted pick: weights line up with items. */
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i] ?? 0;
      if (r < 0) return items[i]!;
    }
    return items[items.length - 1]!;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  }

  /** `n` distinct items (or all of them when there are fewer). */
  sample<T>(items: readonly T[], n: number): T[] {
    return this.shuffle(items).slice(0, Math.max(0, n));
  }

  /** Roughly normal, via the sum of three uniforms. */
  normal(mean: number, sd: number): number {
    const u = (this.next() + this.next() + this.next() - 1.5) / 0.5;
    return mean + u * sd;
  }

  /** A child generator, so one section's changes don't reshuffle every other section. */
  fork(label: string): Rng {
    let h = this.state ^ 0x811c9dc5;
    for (let i = 0; i < label.length; i++) h = Math.imul(h ^ label.charCodeAt(i), 16777619);
    return new Rng(h >>> 0);
  }
}
