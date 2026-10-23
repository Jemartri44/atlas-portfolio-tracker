// @vitest-environment happy-dom
//
// Messages written by the domain carry quantities: they follow the privacy
// mode when it is switched, not only when they are created.

import { DomainError } from "@atlas/domain";
import { createRoot } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it } from "vitest";
import { toAppError } from "../src/ledger/errors.js";
import { errorOf } from "../src/ledger/failure-text.js";
import { store } from "../src/ledger/state.js";
import { saidText } from "../src/routes/ajustes/ecb-cloud-said.js";
import { MovementState } from "../src/routes/movimientos/MovementLine.jsx";
import { createProblem, useFormProblems } from "../src/routes/registrar/form-problems.js";
import PendingWrite from "../src/shell/PendingWrite.jsx";
import { setPrivacy } from "../src/shell/preferences.js";
import type { MovementRow } from "../src/view-models/index.js";

afterEach(() => setPrivacy(true));

describe("an invalid event", () => {
  it("shows its reason without quantities while privacy is on", () => {
    setPrivacy(true);
    const host = document.createElement("div");
    const row = {
      status: "current",
      statusLabel: "",
      invalidReason: "account acc_x holds 10 of ast_y, less than 12",
    } as MovementRow;
    const dispose = render(() => <MovementState row={row} />, host);
    const reason = host.querySelector("[title]")?.getAttribute("title") ?? "";
    expect(reason).not.toMatch(/\b10\b|\b12\b/);
    setPrivacy(false);
    expect(host.querySelector("[title]")?.getAttribute("title")).toContain("holds 10");
    dispose();
  });
});

describe("an error already built", () => {
  it("follows the privacy mode switched afterwards", () => {
    setPrivacy(false);
    const error = toAppError(
      new DomainError("unknown_code_for_test", "account acc_x holds 10 of ast_y, less than 12", {}),
    );
    expect(error.message).toContain("10");
    setPrivacy(true);
    expect(error.message).not.toMatch(/\b10\b|\b12\b/);
  });
});

describe("the problem next to the button of a form", () => {
  it("follows the privacy mode switched afterwards", () => {
    const problems = createRoot(() => useFormProblems([]));
    setPrivacy(false);
    problems.place(
      new DomainError("unknown_code_for_test", "account acc_x holds 10 of ast_y", {}),
      {},
    );
    expect(problems.problem()).toContain("10");
    setPrivacy(true);
    expect(problems.problem()).not.toMatch(/\b10\b/);
  });
});

const domainRefusal = () =>
  new DomainError("unknown_code_for_test", "account acc_x holds 10 of ast_y", {});

describe("an error that a screen keeps", () => {
  it("is the error of a failed write, not its text", () => {
    setPrivacy(false);
    const kept = errorOf({ kind: "error", error: toAppError(domainRefusal()) });
    expect(kept.message).toContain("10");
    setPrivacy(true);
    expect(kept.message).not.toMatch(/\b10\b/);
  });

  it("follows privacy in the problem next to the button of the corporate form", () => {
    const problem = createRoot(() => createProblem());
    setPrivacy(false);
    problem.refuse(toAppError(domainRefusal()));
    expect(problem.problem()).toContain("10");
    setPrivacy(true);
    expect(problem.problem()).not.toMatch(/\b10\b/);
  });

  it("follows privacy in what a card says after a failed action", () => {
    setPrivacy(false);
    const said = { tone: "danger", error: toAppError(domainRefusal()) } as const;
    expect(saidText(said)).toContain("10");
    setPrivacy(true);
    expect(saidText(said)).not.toMatch(/\b10\b/);
  });

  it("follows privacy in the refusal of a pending write", () => {
    setPrivacy(false);
    store.setPending({
      ids: [],
      state: "not_written",
      said: toAppError(domainRefusal()),
      retry: async () => ({ kind: "unknown" as const }),
    });
    const host = document.createElement("div");
    const dispose = render(() => <PendingWrite />, host);
    expect(host.textContent).toContain("holds 10");
    setPrivacy(true);
    expect(host.textContent).not.toMatch(/\b10\b/);
    dispose();
    store.setPending(undefined);
  });
});
