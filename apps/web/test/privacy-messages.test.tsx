// @vitest-environment happy-dom
//
// Messages written by the domain carry quantities: they follow the privacy
// mode when it is switched, not only when they are created.

import { DomainError } from "@atlas/domain";
import { createRoot } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it } from "vitest";
import { toAppError } from "../src/ledger/errors.js";
import { store } from "../src/ledger/state.js";
import { MovementState } from "../src/routes/movimientos/MovementLine.jsx";
import { useFormProblems } from "../src/routes/registrar/form-problems.js";
import type { MovementRow } from "../src/view-models/index.js";

afterEach(() => store.setPrivacy(true));

describe("an invalid event", () => {
  it("shows its reason without quantities while privacy is on", () => {
    store.setPrivacy(true);
    const host = document.createElement("div");
    const row = {
      status: "current",
      statusLabel: "",
      invalidReason: "account acc_x holds 10 of ast_y, less than 12",
    } as MovementRow;
    const dispose = render(() => <MovementState row={row} />, host);
    const reason = host.querySelector("[title]")?.getAttribute("title") ?? "";
    expect(reason).not.toMatch(/\b10\b|\b12\b/);
    store.setPrivacy(false);
    expect(host.querySelector("[title]")?.getAttribute("title")).toContain("holds 10");
    dispose();
  });
});

describe("an error already built", () => {
  it("follows the privacy mode switched afterwards", () => {
    store.setPrivacy(false);
    const error = toAppError(
      new DomainError("unknown_code_for_test", "account acc_x holds 10 of ast_y, less than 12", {}),
    );
    expect(error.message).toContain("10");
    store.setPrivacy(true);
    expect(error.message).not.toMatch(/\b10\b|\b12\b/);
  });
});

describe("the problem next to the button of a form", () => {
  it("follows the privacy mode switched afterwards", () => {
    const problems = createRoot(() => useFormProblems([]));
    store.setPrivacy(false);
    problems.place(
      new DomainError("unknown_code_for_test", "account acc_x holds 10 of ast_y", {}),
      {},
    );
    expect(problems.problem()).toContain("10");
    store.setPrivacy(true);
    expect(problems.problem()).not.toMatch(/\b10\b/);
  });
});
