// @vitest-environment happy-dom
//
// What the corporate action form says when the write does not end in success. It used to say
// something only for a refusal of the domain: a session that had ended, a lost answer or dependent
// events left «Registrar» pressed with nothing on screen.

import { describe, expect, it, vi } from "vitest";
import type { WriteFailure } from "../src/ledger/write.js";
import CorporateForm from "../src/routes/registrar/corporate/form.jsx";
import {
  choose,
  press,
  settle,
  show,
  text,
  type,
  until,
  withGoldenLedger,
} from "./helpers/render.jsx";

const next: { failure: WriteFailure } = { failure: { kind: "unknown" } };

vi.mock("../src/ledger/write.js", async (original) => ({
  ...(await original<typeof import("../src/ledger/write.js")>()),
  recordDraft: async () => ({ ok: false, failure: next.failure }),
}));

withGoldenLedger();

const registerSplit = async (): Promise<HTMLElement> => {
  const host = await show(
    "/registrar/evento-corporativo/split",
    CorporateForm,
    "/registrar/evento-corporativo/:kind",
  );
  choose(host, "ca-asset_id", "ast_alpha");
  type(host, "ca-effective_date", "2028-11-02");
  type(host, "ca-source_document", "https://example.test/nota.pdf");
  type(host, "ca-ratio", "2");
  await until(
    () =>
      [...host.querySelectorAll("button")].some(
        (button) => button.textContent?.trim() === "Ver el efecto" && !button.disabled,
      ),
    "the preview button enabled",
  );
  await press(host, "Ver el efecto");
  await until(
    () =>
      [...host.querySelectorAll("section.effect button")].some(
        (button) => button.textContent?.trim() === "Registrar",
      ),
    "the effect with its «Registrar» button",
  );
  (
    [...host.querySelectorAll("section.effect button")].find(
      (button) => button.textContent?.trim() === "Registrar",
    ) as HTMLButtonElement
  ).click();
  // No common observable: each test waits for its own outcome right after.
  await settle(60);
  return host;
};

describe("the corporate action form when the write fails", () => {
  it("says the session ended, and offers to enter again", async () => {
    next.failure = { kind: "signed_out", reason: "expired" };
    const host = await registerSplit();
    await until(() => text(host).includes("Entrar de nuevo"), "the session notice");
    expect(text(host)).toContain("Tu sesión ha terminado");
    // Said once, by the notice: the sentence of the failure would repeat it.
    expect(text(host)).not.toContain("no se ha guardado nada");
  });

  it("says it does not know whether it was saved", async () => {
    next.failure = { kind: "unknown" };
    const host = await registerSplit();
    await until(() => text(host).includes("No sabemos si se ha guardado"), "the unknown sentence");
  });

  it("says other events depend on it", async () => {
    next.failure = { kind: "dependents", target: "x", affected: [], settings: false };
    const host = await registerSplit();
    await until(() => text(host).includes("dependen de esta"), "the dependants sentence");
    expect(text(host)).not.toContain("undefined");
  });
});
