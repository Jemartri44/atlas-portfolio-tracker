// Deterministic pseudo-random source for the synthetic generator (feature 003):
// mulberry32, a 32-bit generator in a dozen lines. One instance feeds both the
// ULID random bytes (as a RandomSource) and every value of the scenario, so the
// whole output is a function of the seed.

import { Decimal } from "../money/decimal.js";
import type { RandomSource } from "../ports/random.js";

export class Prng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Next value in [0, 2^32). */
  uint32(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** Integer in [min, max], both inclusive. */
  int(min: number, max: number): number {
    return min + (this.uint32() % (max - min + 1));
  }

  /** Decimal string in [min, max] with exactly `scale` decimals (trailing zeros trimmed by Decimal). */
  decimal(min: number, max: number, scale: number): string {
    const factor = 10 ** scale;
    const units = this.int(Math.round(min * factor), Math.round(max * factor));
    return Decimal.parse(String(units))
      .div(Decimal.parse(String(factor)))
      .toString();
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length - 1)] as T;
  }

  /** RandomSource: fills `target` with bytes from the stream. */
  fill(target: Uint8Array): void {
    for (let i = 0; i < target.length; i += 1) {
      target[i] = this.uint32() & 0xff;
    }
  }
}

export const seededRandom = (seed: number): RandomSource => {
  const prng = new Prng(seed);
  return (target) => prng.fill(target);
};
