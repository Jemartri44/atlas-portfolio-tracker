// @vitest-environment happy-dom
//
// The whole journey of correcting a movement of a past tax year. The write was
// right, but the reload of the ledger that follows it mounted the form again
// with the original values and without the notice: the user saw «8.700» once
// more, tried again, and was told «Ese evento ya está anulado» (third pass of
// the review of 2026-09-19). Now the write leads to the movement it wrote, with
// the confirmation and the warning, and the corrected original offers no form.

import { BlobLedgerStore, type LedgerBlob } from "@atlas/adapters/blob";
import type { UseCaseDeps } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { loadInto } from "../src/ledger/actions.js";
import Detail from "../src/routes/movimientos/detail.jsx";
import Edit from "../src/routes/movimientos/edit.jsx";
import { goldenText } from "./helpers/golden.js";
import { press, settle, showInShell, text, type, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

/** A deposit of 8.700 € on 05/09/2028: a past tax year for the clock of these tests, 2029. */
const DEPOSIT = "01NWVBBZ78ZF4XD31K965DE3ET";

class WritableBlob implements LedgerBlob {
  readonly label = "memoria";
  constructor(public text: string) {}
  async read(): Promise<Uint8Array> {
    return new TextEncoder().encode(this.text);
  }
  async write(bytes: Uint8Array): Promise<void> {
    this.text = new TextDecoder().decode(bytes);
  }
  async writeArchive(): Promise<void> {}
}

const openWritable = async (): Promise<void> => {
  let counter = 0;
  const deps: UseCaseDeps = {
    store: new BlobLedgerStore(new WritableBlob(goldenText())),
    clock: { now: () => new Date("2029-07-01T10:00:00.000Z") },
    random: (target) => {
      counter += 1;
      target.fill(counter % 251);
    },
  };
  await loadInto({ deps, source: { kind: "browser", persisted: false } });
};

const ROUTES = { "/movimientos/:id/editar": Edit, "/movimientos/:id": Detail };

describe("correcting a movement of a past tax year", () => {
  it("leads to the corrected movement, confirmed, with the warning of the year", async () => {
    await openWritable();
    const host = await showInShell(`/movimientos/${DEPOSIT}/editar`, ROUTES);
    type(host, "f-amount", "8000");
    type(host, "correct-reason", "importe mal tecleado");
    await press(host, "Ver el efecto");
    await press(host, "Rectificar");
    await settle(50);

    const [, , written] = window.location.pathname.split("/");
    expect(written).toBeDefined();
    expect(written).not.toBe(DEPOSIT);
    expect(window.location.search).toBe("?hecho=corregido&ejercicio=anterior");
    const shown = text(host);
    expect(shown).toContain("Corrección registrada");
    expect(shown).toContain("Ejercicio anterior");
    expect(shown).toContain("El movimiento corregido pertenece a un ejercicio anterior");
    expect(shown).toContain("8.000,00 €");
    // Not the form again, with the original's values.
    expect(host.querySelector("#f-amount")).toBeNull();
  });

  it("offers no form for the original any more, and leads to its correction", async () => {
    await openWritable();
    const first = await showInShell(`/movimientos/${DEPOSIT}/editar`, ROUTES);
    type(first, "f-amount", "8000");
    type(first, "correct-reason", "importe mal tecleado");
    await press(first, "Ver el efecto");
    await press(first, "Rectificar");
    await settle(50);
    const written = window.location.pathname.split("/")[2];
    document.body.innerHTML = "";

    const again = await showInShell(`/movimientos/${DEPOSIT}/editar`, ROUTES);
    expect(text(again)).toContain("Este movimiento ya está anulado.");
    expect(again.querySelector("#f-amount")).toBeNull();
    const lead = again.querySelector(`a[href="/movimientos/${written}"]`);
    expect(text(lead)).toBe("Ver su corrección");
  });

  it("leads a reversal to the reversal it wrote, confirmed, with the warning of the year", async () => {
    await openWritable();
    const host = await showInShell(`/movimientos/${DEPOSIT}`, ROUTES);
    await press(host, "Anular");
    type(host, "reverse-reason", "no existió");
    (host.querySelector("button.danger.solid") as HTMLButtonElement).click();
    await settle(50);

    const written = window.location.pathname.split("/")[2];
    expect(written).not.toBe(DEPOSIT);
    expect(window.location.search).toBe("?hecho=anulado&ejercicio=anterior");
    expect(text(host)).toContain("Anulación registrada");
    expect(text(host)).toContain("Ejercicio anterior");
    // Said as it was done: annulled, not «rectified».
    expect(text(host)).toContain("El movimiento anulado pertenece a un ejercicio anterior");
  });
});
