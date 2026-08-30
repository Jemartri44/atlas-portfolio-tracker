import { describe, expect, it } from "vitest";
import { createUlidGenerator } from "../../src/ids/ulid.js";
import { SyntheticClock } from "../../src/synth/clock.js";
import { seededRandom } from "../../src/synth/random.js";

describe("SyntheticClock", () => {
  it("starts at a fixed instant and moves to 18:00 UTC of the date asked", () => {
    const clock = new SyntheticClock();
    expect(clock.now().toISOString()).toBe("2026-09-01T18:00:00.000Z");
    expect(clock.at("2026-09-05").toISOString()).toBe("2026-09-05T18:00:00.000Z");
    expect(clock.now().toISOString()).toBe("2026-09-05T18:00:00.000Z");
    expect(new SyntheticClock("2030-01-01T00:00:00.000Z").now().toISOString()).toBe(
      "2030-01-01T00:00:00.000Z",
    );
  });

  it("never goes back: an earlier or equal date advances one second", () => {
    const clock = new SyntheticClock();
    clock.at("2027-03-01");
    expect(clock.at("2027-03-01").toISOString()).toBe("2027-03-01T18:00:01.000Z");
    expect(clock.at("2027-02-01").toISOString()).toBe("2027-03-01T18:00:02.000Z");
    expect(clock.at("2027-03-02").toISOString()).toBe("2027-03-02T18:00:00.000Z");
  });

  it("yields monotonic, reproducible ULIDs together with the seeded random source", () => {
    const make = () => {
      const clock = new SyntheticClock();
      const ids = createUlidGenerator({ clock, random: seededRandom(1) });
      return ["2026-09-01", "2026-09-01", "2026-10-01"].map((date) => {
        clock.at(date);
        return ids.next();
      });
    };
    const first = make();
    expect(make()).toEqual(first);
    expect([...first].sort()).toEqual(first);
  });
});
