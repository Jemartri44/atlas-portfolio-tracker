// The root of a correction chain (review of PR #75, feature 012).

import { describe, expect, it } from "vitest";
import { correctionRoots } from "../../src/projections/correction-root.js";
import type { LedgerEvent } from "../../src/schema/events.js";

const event = (id: string, corrects?: string): LedgerEvent =>
  ({ id, type: "buy", ...(corrects === undefined ? {} : { corrects_id: corrects }) }) as never;

describe("correctionRoots", () => {
  it("follows corrects_id to the first event of the chain", () => {
    const roots = correctionRoots([event("O"), event("C1", "O"), event("C2", "C1"), event("X")]);
    expect([...roots]).toEqual([
      ["O", "O"],
      ["C1", "O"],
      ["C2", "O"],
      ["X", "X"],
    ]);
  });

  it("reuses what it already walked, whatever the order of the file", () => {
    const roots = correctionRoots([
      event("C2", "C1"),
      event("C1", "O"),
      event("O"),
      event("C3", "C1"),
    ]);
    expect(roots.get("C3")).toBe("O");
    expect(roots.get("C2")).toBe("O");
  });

  it("starts a chain at a correction of something not in the file", () => {
    expect(correctionRoots([event("C", "gone"), event("D", "C")]).get("D")).toBe("C");
  });

  it("makes each member of a loop its own root", () => {
    const roots = correctionRoots([event("A", "B"), event("B", "A"), event("C", "A")]);
    expect(roots.get("A")).toBe("A");
    expect(roots.get("B")).toBe("B");
    expect(roots.get("C")).toBe("A");
  });
});
