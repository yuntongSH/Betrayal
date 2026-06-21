/**
 * Deterministic, serializable pseudo-random number generator.
 *
 * The whole point of Dread Hollow's engine is that the server, every client and
 * the test-suite can replay the *exact* same game from a seed. A plain
 * `Math.random()` can't do that, so we use a tiny mulberry32 generator whose
 * entire state is a single uint32 we can snapshot into the game state.
 */
export type RngState = number;

export class Rng {
  private s: number;

  constructor(seed: number) {
    // Coerce to uint32 and avoid a zero state (which would stall mulberry32).
    this.s = seed >>> 0 || 0x9e3779b9;
  }

  /** Rebuild a generator from a previously captured state. */
  static fromState(state: RngState): Rng {
    const r = new Rng(1);
    r.s = state >>> 0;
    return r;
  }

  /** The current internal state — store this in the game state to resume later. */
  get state(): RngState {
    return this.s >>> 0;
  }

  /** Next float in [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  /** Integer in [min, max] inclusive. */
  range(min: number, max: number): number {
    return min + this.int(max - min + 1);
  }

  /** Pick a random element (throws on empty array). */
  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error("Rng.pick on empty array");
    return arr[this.int(arr.length)]!;
  }

  /** Fisher–Yates shuffle returning a new array; the input is untouched. */
  shuffle<T>(arr: readonly T[]): T[] {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = a[i]!;
      a[i] = a[j]!;
      a[j] = tmp;
    }
    return a;
  }
}
