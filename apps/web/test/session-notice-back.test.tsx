// @vitest-environment happy-dom
//
// «Ya he entrado» must never stay disabled nor say nothing: when the check cannot be made the
// sentence says so and how to go on.

import { describe, expect, it, vi } from "vitest";
import { SessionNotice } from "../src/shell/SessionNotice.jsx";
import { press, show, text, until, withGoldenLedger } from "./helpers/render.jsx";

vi.mock("../src/ledger/cloud.js", async (original) => ({
  ...(await original<typeof import("../src/ledger/cloud.js")>()),
  refreshSession: async () => {
    throw new Error("the check failed");
  },
}));

withGoldenLedger();

describe("the session notice when the check of the session fails", () => {
  it("says it could not be checked and leaves the button usable", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    const host = await show("/", () => <SessionNotice expired />);
    await press(host, "Entrar de nuevo");
    await press(host, "Ya he entrado");
    await until(
      () => text(host).includes("No se ha podido comprobar la sesión"),
      "the sentence",
      3000,
    );
    const again = [...host.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Ya he entrado",
    ) as HTMLButtonElement;
    expect(again.disabled).toBe(false);
  });
});
