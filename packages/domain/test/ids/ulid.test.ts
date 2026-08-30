import { describe, expect, it } from "vitest";
import { DomainError } from "../../src/errors.js";
import { createUlidGenerator, isUlid } from "../../src/ids/ulid.js";
import type { Clock } from "../../src/ports/clock.js";
import type { RandomSource } from "../../src/ports/random.js";

const fixedClock = (millis: number): Clock => ({ now: () => new Date(millis) });
const constantRandom =
  (fill: number): RandomSource =>
  (target) => {
    target.fill(fill);
  };

describe("createUlidGenerator", () => {
  it("produces 26 Crockford base32 characters with the spec timestamp encoding", () => {
    const ulid = createUlidGenerator({
      clock: fixedClock(1469918176385),
      random: constantRandom(0),
    }).next();
    expect(ulid).toHaveLength(26);
    expect(ulid.startsWith("01ARYZ6S41")).toBe(true);
    expect(ulid.slice(10)).toBe("0000000000000000");
    expect(isUlid(ulid)).toBe(true);
  });

  it("encodes the random part as 16 characters (all bits set)", () => {
    const ulid = createUlidGenerator({ clock: fixedClock(0), random: constantRandom(0xff) }).next();
    expect(ulid).toBe("0000000000ZZZZZZZZZZZZZZZZ");
  });

  it("is strictly monotonic while the clock does not advance", () => {
    const generator = createUlidGenerator({
      clock: fixedClock(1_700_000_000_000),
      random: constantRandom(0),
    });
    const ids = Array.from({ length: 1000 }, () => generator.next());
    for (let i = 1; i < ids.length; i += 1) {
      expect((ids[i] as string) > (ids[i - 1] as string)).toBe(true);
    }
    expect(ids[1]?.slice(10)).toBe("0000000000000001");
  });

  it("carries over byte boundaries and stays monotonic when the clock goes backwards", () => {
    let millis = 10;
    const clock: Clock = { now: () => new Date(millis) };
    const generator = createUlidGenerator({
      clock,
      random: (target) => {
        target.fill(0);
        target[9] = 0xff;
      },
    });
    const first = generator.next();
    millis = 5;
    const second = generator.next();
    expect(second > first).toBe(true);
    expect(second.slice(10)).toBe("0000000000000080");
  });

  it("takes fresh randomness when the clock advances", () => {
    let millis = 1;
    let calls = 0;
    const generator = createUlidGenerator({
      clock: { now: () => new Date(millis) },
      random: (target) => {
        calls += 1;
        target.fill(calls);
      },
    });
    generator.next();
    millis = 2;
    generator.next();
    expect(calls).toBe(2);
  });

  it("throws instead of wrapping around when the random part overflows", () => {
    const generator = createUlidGenerator({ clock: fixedClock(1), random: constantRandom(0xff) });
    generator.next();
    expect(() => generator.next()).toThrow(DomainError);
  });
});

describe("isUlid", () => {
  it("accepts valid ids and rejects everything else", () => {
    expect(isUlid("01ARYZ6S41TSV4RRFFQ69G5FAV")).toBe(true);
    expect(isUlid("81ARYZ6S41TSV4RRFFQ69G5FAV")).toBe(false);
    expect(isUlid("01ARYZ6S41TSV4RRFFQ69G5FA")).toBe(false);
    expect(isUlid("01ARYZ6S41TSV4RRFFQ69G5FAI")).toBe(false);
    expect(isUlid(42)).toBe(false);
  });
});
