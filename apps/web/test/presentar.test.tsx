// @vitest-environment happy-dom
//
// "Registrar lo presentado", the form of ADR-0020: it arrives with what the
// application computes, it is corrected to what was really declared, and
// nothing is written without the user saying so. Three things are checked
// here because they are the ones that would pass every other test and still be
// wrong: the figures **come preloaded**, a preloaded figure is **masked** until
// its field has the focus (§5.10), and what is written is what is on the form.

import { BlobLedgerStore, type LedgerBlob } from "@atlas/adapters/blob";
import { decodeLine, type UseCaseDeps } from "@atlas/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { loadInto } from "../src/ledger/actions.js";
import { store } from "../src/ledger/state.js";
import Presentar from "../src/routes/fiscal/presentar.jsx";
import { goldenText } from "./helpers/golden.js";
import { press, settle, show, text, type, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

class WritableBlob implements LedgerBlob {
  readonly label = "memoria";
  text: string;
  readonly archives = new Map<string, string>();
  constructor(text: string) {
    this.text = text;
  }
  async read(): Promise<Uint8Array> {
    return new TextEncoder().encode(this.text);
  }
  async write(bytes: Uint8Array): Promise<void> {
    this.text = new TextDecoder().decode(bytes);
  }
  async writeArchive(name: string, bytes: Uint8Array): Promise<void> {
    this.archives.set(name, new TextDecoder().decode(bytes));
  }
}

let blob: WritableBlob;

const open = async (): Promise<void> => {
  blob = new WritableBlob(goldenText());
  let counter = 0;
  const deps: UseCaseDeps = {
    store: new BlobLedgerStore(blob),
    clock: { now: () => new Date("2029-07-01T10:00:00.000Z") },
    random: (target) => {
      counter += 1;
      target.fill(counter % 251);
    },
  };
  await loadInto({ deps, source: { kind: "browser", persisted: false } });
};

const lastEvent = (): Record<string, unknown> => {
  const lines = blob.text.split("\n").filter((line) => line.length > 0);
  return decodeLine(lines[lines.length - 1] as string).event as unknown as Record<string, unknown>;
};

const openForm = async (year = 2027) =>
  show(`/fiscal/presentar/renta/${year}`, Presentar, "/fiscal/presentar/:modelo/:ano");

describe("recording what was filed", () => {
  beforeEach(open);

  it("arrives with what the application computes, one field per figure", async () => {
    const host = await openForm();
    const base = host.querySelector("#f-base") as HTMLInputElement;
    expect(base).not.toBeNull();
    // The savings base of 2027 of the golden ledger, in Spanish.
    expect(base.value).toBe("174,35");
    expect(text(host)).toContain("Base del ahorro");
    expect(text(host)).toContain("lo que se guarda es lo tuyo");
  });

  it("masks what it preloads until the field has the focus, and never what is typed", async () => {
    store.setPrivacy(true);
    const host = await openForm();
    const base = host.querySelector("#f-base") as HTMLInputElement;
    expect(base.value).not.toContain("174");
    base.dispatchEvent(new Event("focus", { bubbles: true }));
    await settle();
    expect(base.value).toBe("174,35");
    type(host, "f-base", "200,00");
    await settle();
    base.dispatchEvent(new Event("blur", { bubbles: true }));
    await settle();
    expect(base.value).toBe("200,00");
    store.setPrivacy(false);
  });

  it("refuses to write without the receipt, and says why", async () => {
    const host = await openForm();
    await press(host, "Registrar lo presentado");
    expect(text(host)).toContain("Falta el justificante");
    expect(blob.text).toBe(goldenText());
  });

  it("writes what the form says, not what the application computes", async () => {
    const host = await openForm();
    type(host, "f-base", "200,00");
    type(host, "f-receipt", "100-2027-ABCDEFGHIJKL");
    type(host, "f-filed-at", "2028-06-12");
    await press(host, "Registrar lo presentado");
    await settle(30);
    const event = lastEvent();
    expect(event.type).toBe("tax_return_filed");
    expect(event.tax_year).toBe(2027);
    expect(event.filed_at).toBe("2028-06-12");
    expect((event.declared as { savings_base_eur: string }).savings_base_eur).toBe("200.00");
    // And what it computed that day travels with it, untouched.
    expect((event.computed as { savings_base_eur: string }).savings_base_eur).toBe("174.35");
  });

  it("says it is a supplementary return when one is already recorded", async () => {
    // A year that is over and was filed in the past: a return of a year that
    // has not ended cannot be in force today, which is the same thing the
    // domain refuses when it is recorded.
    const host = await openForm(2020);
    type(host, "f-receipt", "100-2020-ABCDEFGHIJKL");
    type(host, "f-filed-at", "2021-06-10");
    await press(host, "Registrar lo presentado");
    await settle(30);
    expect(lastEvent().type).toBe("tax_return_filed");
    const again = await openForm(2020);
    expect(text(again)).toContain("Esto es una complementaria");
    expect(text(again)).toContain("la primera sigue constando");
  });
});
