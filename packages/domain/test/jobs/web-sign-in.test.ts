// Feature 016, E1 (R16, mutant 9): the date of the last web sign-in, only
// that date, and only moving forward.

import { describe, expect, it } from "vitest";
import {
  advancesWebSignIn,
  parseWebSignIn,
  serializeWebSignIn,
  WEB_SIGN_IN_KEY,
} from "../../src/access/web-sign-in.js";

describe("the last web sign-in (R16)", () => {
  it("is one object with the date and its format, and nothing else", () => {
    expect(WEB_SIGN_IN_KEY).toBe("access/last-web-sign-in.json");
    const text = serializeWebSignIn("2026-10-03");
    expect(text).toBe('{"web_sign_in_format":1,"last_web_sign_in":"2026-10-03"}\n');
    expect(parseWebSignIn(text)).toBe("2026-10-03");
    for (const bad of [
      "",
      "[]",
      "null",
      '"2026-10-03"',
      '{"web_sign_in_format":1,"last_web_sign_in":"2026-10-03","sub":"108"}',
      '{"web_sign_in_format":1,"last_web_sign_in":"2026-10-03","web_sign_in_format":1}',
      '{"web_sign_in_format":2,"last_web_sign_in":"2026-10-03"}',
      '{"web_sign_in_format":1,"last_web_sign_in":"2026-10-03T10:00:00Z"}',
      '{"web_sign_in_format":1}',
    ]) {
      expect(parseWebSignIn(bad), bad).toBe("unreadable");
    }
  });

  it("only moves forward: an equal or earlier date is not written", () => {
    expect(advancesWebSignIn(undefined, "2026-10-03")).toBe(true);
    expect(advancesWebSignIn("unreadable", "2026-10-03")).toBe(true);
    expect(advancesWebSignIn("2026-10-02", "2026-10-03")).toBe(true);
    expect(advancesWebSignIn("2026-10-03", "2026-10-03")).toBe(false);
    expect(advancesWebSignIn("2026-10-04", "2026-10-03")).toBe(false);
  });
});
