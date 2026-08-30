import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Prng, seededRandom } from "../../src/synth/random.js";

describe("Prng (mulberry32)", () => {
  it("is a pure function of the seed", () => {
    const a = new Prng(1);
    const b = new Prng(1);
    const c = new Prng(2);
    const first = Array.from({ length: 5 }, () => a.uint32());
    expect(Array.from({ length: 5 }, () => b.uint32())).toEqual(first);
    expect(Array.from({ length: 5 }, () => c.uint32())).not.toEqual(first);
    expect(new Prng(2 ** 32 + 1).uint32()).toBe(new Prng(1).uint32());
  });

  it("draws integers and decimals inside the range, with the requested scale", () => {
    fc.assert(
      fc.property(
        fc.nat(),
        fc.integer({ min: -50, max: 50 }),
        fc.nat({ max: 30 }),
        (seed, min, span) => {
          const prng = new Prng(seed);
          const value = prng.int(min, min + span);
          expect(value).toBeGreaterThanOrEqual(min);
          expect(value).toBeLessThanOrEqual(min + span);
          const decimal = prng.decimal(1, 2, 4);
          expect(Number(decimal)).toBeGreaterThanOrEqual(1);
          expect(Number(decimal)).toBeLessThanOrEqual(2);
          expect((decimal.split(".")[1] ?? "").length).toBeLessThanOrEqual(4);
        },
      ),
    );
    expect(new Prng(7).int(3, 3)).toBe(3);
    expect(new Prng(7).decimal(5, 5, 2)).toBe("5");
  });

  it("picks from a list and fills byte arrays as a RandomSource", () => {
    const prng = new Prng(3);
    const items = ["a", "b", "c"] as const;
    for (let i = 0; i < 20; i += 1) {
      expect(items).toContain(prng.pick(items));
    }
    const bytes = new Uint8Array(10);
    seededRandom(3)(bytes);
    const again = new Uint8Array(10);
    seededRandom(3)(again);
    expect(again).toEqual(bytes);
    expect(bytes.some((byte) => byte !== 0)).toBe(true);
    expect(bytes.every((byte) => byte >= 0 && byte <= 255)).toBe(true);
  });
});
