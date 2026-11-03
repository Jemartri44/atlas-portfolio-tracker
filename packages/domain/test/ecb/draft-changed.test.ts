import { describe, expect, it } from "vitest";
import { DraftChangedError } from "../../src/ecb/drafts.js";

describe("DraftChangedError (ecb/drafts.ts)", () => {
  it("names the draft and what it is now, gone or stamped elsewhere", () => {
    const gone = new DraftChangedError("d1", "gone");
    expect(gone.code).toBe("draft_changed");
    expect(gone.details).toEqual({ id: "d1", now: "gone" });
    const stamped = new DraftChangedError("d2", "stamped");
    expect(stamped.details).toEqual({ id: "d2", now: "stamped" });
  });
});
