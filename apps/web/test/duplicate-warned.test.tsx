// @vitest-environment happy-dom
//
// The yes to «Ya existe un movimiento igual» is a yes to that movement
// (review of PR #97, security N5): the dialog does not freeze the form, so a
// movement changed with the warning open is written without the
// confirmation — and warns again, since it repeats too.

import { BlobLedgerStore } from "@atlas/adapters/blob";
import { beforeEach, describe, expect, it } from "vitest";
import { loadInto } from "../src/ledger/actions.js";
import { store } from "../src/ledger/state.js";
import CorporateForm from "../src/routes/registrar/corporate/form.jsx";
import RegistrarForm from "../src/routes/registrar/form.jsx";
import { goldenText } from "./helpers/golden.js";
import { MemoryBlob } from "./helpers/memory-blob.js";
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

withGoldenLedger();

// A ledger that is written to, like the one of the browser.
beforeEach(async () => {
  let counter = 0;
  await loadInto({
    deps: {
      store: new BlobLedgerStore(new MemoryBlob(goldenText())),
      clock: { now: () => new Date("2029-07-01T10:00:00.000Z") },
      random: (target) => {
        counter += 1;
        target.fill(counter % 251);
      },
    },
    source: { kind: "cloud", expiresAt: "2099-01-01T00:00:00.000Z" },
  });
});

const fill = async (host: HTMLElement): Promise<void> => {
  choose(host, "f-account_id", "acc_mi");
  type(host, "f-value_date", "2027-11-02");
  type(host, "f-amount", "100");
  await settle(30);
  await press(host, "Ver el efecto");
  await settle(30);
  (
    [...host.querySelectorAll("section.effect button")].find(
      (button) => button.textContent?.trim() === "Registrar",
    ) as HTMLButtonElement
  ).click();
  await settle(60);
};

const openDialog = (host: HTMLElement): HTMLElement | undefined =>
  [...host.querySelectorAll("dialog")].find((node) => node.hasAttribute("open")) as
    | HTMLElement
    | undefined;

describe("the duplicate question of the registration form", () => {
  it("confirms a repeated movement only as it was when the warning was shown", async () => {
    const recorded = () => store.snapshot()?.events.length ?? 0;
    const first = await show("/registrar/cash-in", RegistrarForm, "/registrar/:tipo");
    const start = recorded();
    await fill(first);
    const once = recorded();
    expect(once).toBe(start + 1);
    const host = await show("/registrar/cash-in", RegistrarForm, "/registrar/:tipo");
    await fill(host);
    await until(() => text(host).includes("Registrar de todas formas"), "la pregunta", 3000);
    expect(recorded()).toBe(once);
    // With the warning open, the notes change: not in the fingerprint.
    type(host, "f-notes", "cambiada con el aviso abierto");
    await press(openDialog(host) as HTMLElement, "Registrar de todas formas");
    await settle(60);
    expect(recorded()).toBe(once);
    await until(() => openDialog(host) !== undefined, "la pregunta otra vez", 3000);
    await press(openDialog(host) as HTMLElement, "Registrar de todas formas");
    await settle(60);
    expect(recorded()).toBe(once + 1);
  });

  // Round 2 of the review of PR #97, N1: the corporate form follows the same
  // rule, and a repeated corporate action transforms the lots twice.
  it("confirms a repeated corporate action only as it was when the warning was shown", async () => {
    const recorded = () => store.snapshot()?.events.length ?? 0;
    const split = async (host: HTMLElement): Promise<void> => {
      choose(host, "ca-asset_id", "ast_alpha");
      type(host, "ca-effective_date", "2028-11-02");
      type(host, "ca-source_document", "https://example.test/nota.pdf");
      type(host, "ca-ratio", "2");
      await settle(30);
      await press(host, "Ver el efecto");
      await settle(30);
      (
        [...host.querySelectorAll("section.effect button")].find(
          (button) => button.textContent?.trim() === "Registrar",
        ) as HTMLButtonElement
      ).click();
      await settle(60);
    };
    const path = "/registrar/evento-corporativo/split";
    const route = "/registrar/evento-corporativo/:kind";
    const start = recorded();
    await split(await show(path, CorporateForm, route));
    const once = recorded();
    expect(once).toBe(start + 1);
    const host = await show(path, CorporateForm, route);
    await split(host);
    await until(() => text(host).includes("Registrar de todas formas"), "la pregunta", 3000);
    expect(recorded()).toBe(once);
    // With the warning open, the notes change: not in the fingerprint.
    type(host, "ca-notes", "cambiada con el aviso abierto");
    await press(openDialog(host) as HTMLElement, "Registrar de todas formas");
    await settle(60);
    expect(recorded()).toBe(once);
    await until(() => openDialog(host) !== undefined, "la pregunta otra vez", 3000);
    await press(openDialog(host) as HTMLElement, "Registrar de todas formas");
    await settle(60);
    expect(recorded()).toBe(once + 1);
  });
});
