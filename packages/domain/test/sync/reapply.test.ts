import { describe, expect, it } from "vitest";
import { reapplyUnits } from "../../src/sync/reapply.js";

describe("reapplyUnits: the one use case of both sides", () => {
  const unit = (line: string) => ({ lines: [line], events: [] });

  it("accepts in order, growing the base, and stops at the first failure without looking further", () => {
    const seen: string[] = [];
    const outcome = reapplyUnits(
      { lines: ["r"], events: [] },
      [unit("a"), unit("b"), unit("c")],
      (u, base) => {
        seen.push(`${u.lines[0]}@${base.lines.join("")}`);
        return u.lines[0] === "b" ? "broken" : undefined;
      },
    );
    expect(seen).toEqual(["a@r", "b@ra"]);
    expect(outcome.accepted.map((u) => u.lines[0])).toEqual(["a"]);
    expect(outcome.failed).toEqual({ unit: unit("b"), index: 1, reason: "broken" });
    expect(outcome.base.lines).toEqual(["r", "a"]);
  });

  it("accepts everything when nothing fails", () => {
    const outcome = reapplyUnits({ lines: [], events: [] }, [unit("a")], () => undefined);
    expect(outcome.failed).toBeUndefined();
    expect(outcome.base.lines).toEqual(["a"]);
  });
});
