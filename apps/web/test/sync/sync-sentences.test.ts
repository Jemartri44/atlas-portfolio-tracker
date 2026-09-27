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
});
