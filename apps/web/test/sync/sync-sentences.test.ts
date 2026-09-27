// The sentences of the sync that send the user to join again name the
// buttons that do it (N11 of the review of PR #96; feature 015, E4).

import { DomainError } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { describeError } from "../../src/format/messages/errors.js";

describe("the sentences of the sync", () => {
  it.each([
    ["sync_deactivated", {}],
    ["join_required", { own_lines: ["a", "b"] }],
  ])("say %s naming the buttons that join again", (code, details) => {
    const text = describeError(new DomainError(code, code, details), { privacy: false });
    expect(text).toContain("«Unirme desde la nube»");
    expect(text).toContain("«Unirme con mis operaciones»");
  });

  // Review of PR #97, correctness N4: a reason names its way out with the
  // word of the button that takes it.
  it.each(["absent_at_join", "absent_after_rewrite", "differs_at_join", "differs_after_rewrite"])(
    "says %s with the words of «Rehacer» and «Descartar»",
    (code) => {
      const text = describeError(new DomainError(code, code, {}), { privacy: false });
      expect(text).toMatch(/[Rr]ehaz/);
      expect(text).toMatch(/[Dd]esc[aá]rta/);
      expect(text).not.toMatch(/[Rr]egístrala/);
    },
  );
});
