// @vitest-environment happy-dom
//
// Drafts in the browser (feature 012, block 5; ADR-0029, point 9): an
// operation whose ECB rate is not published yet is kept in IndexedDB without a
// rate, it counts in no figure, the frame counts it, and it is recorded only
// when the user opens it and says yes — with the official rate proposed as for
// any other operation. The browser storage is the IndexedDB double of the
// adapters. Mutant 12 of prompt 012 §5.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BlobLedgerStore } from "@atlas/adapters/blob";
import { BrowserDraftStore } from "@atlas/adapters/drafts";
import { saveImportedHistory } from "@atlas/adapters/reference";
import type { UseCaseDeps } from "@atlas/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeIdbFactory } from "../../../packages/adapters/test/fake-idb.js";
import { reloadWebHistory } from "../src/ecb/history.js";
import { loadInto } from "../src/ledger/actions.js";
import * as draftStore from "../src/ledger/draft-store.js";
import { toAppError } from "../src/ledger/errors.js";
import { store } from "../src/ledger/state.js";
import Borradores from "../src/routes/registrar/borradores.jsx";
import RegistrarForm from "../src/routes/registrar/form.jsx";
import Resumen from "../src/routes/resumen/index.jsx";
import { mountDraftCounter } from "../src/shell/draft-counter.js";
import { goldenText } from "./helpers/golden.js";
import { MemoryBlob } from "./helpers/memory-blob.js";
import {
  choose,
  press,
  settle,
  show,
  showInShell,
  text,
  type,
  withGoldenLedger,
} from "./helpers/render.jsx";

withGoldenLedger();

const holder = globalThis as { indexedDB?: unknown };
const before = holder.indexedDB;
const synthetic = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../../tests/fixtures/ecb/eurofxref-hist.csv"),
  "utf8",
);
/** The same history one working day later: 2026-04-01 published, dollar at 1.1104. */
const later = (() => {
  const [header, newest, ...rest] = synthetic.split("\n");
  const next = (newest as string).replace("2026-03-31,1.1091,", "2026-04-01,1.1104,");
  return [header, next, newest, ...rest].join("\n");
})();

const importHistory = async (csv: string): Promise<void> => {
  await saveImportedHistory({
    text: csv,
    source: "zip",
    file_name: "eurofxref-hist.csv",
    imported_at: "2026-04-01T10:00:00.000Z",
  });
  await reloadWebHistory();
};

const drafts = new BrowserDraftStore();

beforeAll(() => {
  holder.indexedDB = new FakeIdbFactory();
});

beforeEach(async () => {
  for (const draft of (await drafts.list()).drafts) {
    await drafts.remove(draft.id);
  }
  await importHistory(synthetic);
});

afterAll(() => {
  holder.indexedDB = before;
});

const until = async (condition: () => boolean, ms = 3000): Promise<void> => {
  const deadline = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error("no llegó a pasar");
    }
    await settle(5);
  }
};

const value = (host: HTMLElement, id: string): string =>
  (host.querySelector(`#${id}`) as HTMLInputElement | null)?.value ?? "";

/** The golden ledger in a store that writes, for the one test that records. */
/** The bytes of the writable ledger, to change them underneath a form. */
let written: MemoryBlob | undefined;

const openWritable = async (): Promise<void> => {
  let counter = 0;
  written = new MemoryBlob(goldenText());
  const deps: UseCaseDeps = {
    store: new BlobLedgerStore(written),
    clock: { now: () => new Date("2029-07-01T10:00:00.000Z") },
    random: (target) => {
      counter += 1;
      target.fill(counter % 251);
    },
  };
  await loadInto({ deps, source: { kind: "browser", persisted: false } });
};

const events = (): number => store.snapshot()?.events.length ?? 0;

/** A purchase of gold on 2026-04-01, a day the synthetic history does not reach. */
const saveGoldDraft = async (): Promise<string> => {
  const host = await show("/registrar/buy", RegistrarForm, "/registrar/:tipo");
  choose(host, "f-account_id", "acc_ibkr");
  choose(host, "f-asset_id", "ast_gold");
  await settle();
  type(host, "f-trade_date", "2026-04-01");
  type(host, "f-value_date", "2026-04-01");
  type(host, "f-quantity", "1");
  type(host, "f-unit_price", "100");
  await until(() => text(host).includes("El BCE todavía no ha publicado este tipo"));
  await press(host, "Guardar como borrador");
  await until(() => window.location.pathname === "/registrar/borradores");
  const saved = new URLSearchParams(window.location.search).get("guardado");
  expect(saved).toMatch(/^[0-9A-Z]{26}$/);
  return saved as string;
};

describe("a draft from the form", () => {
  it("is kept without a rate, outside the ledger (mutant 12)", async () => {
    const recorded = events();
    const id = await saveGoldDraft();
    const [draft] = (await drafts.list()).drafts;
    expect(draft?.id).toBe(id);
    expect(draft?.event).toMatchObject({ type: "buy", asset_id: "ast_gold", currency: "USD" });
    expect(draft?.event).not.toHaveProperty("fx_rate");
    expect(draft?.event).not.toHaveProperty("fx_rate_date");
    expect(events()).toBe(recorded);
  });

  it("is counted in the frame, on every screen", async () => {
    await saveGoldDraft();
    const host = await showInShell("/", { "/": Resumen });
    await until(() => host.querySelector('a[href="/registrar/borradores"]') !== null);
    const link = host.querySelector('a[href="/registrar/borradores"]') as HTMLAnchorElement;
    expect(link.getAttribute("aria-label")).toBe("1 borrador pendiente");
    expect(text(link)).toBe("1");
  });

  it("counts a draft it cannot read too (review of PR #75)", async () => {
    const holderDb = (globalThis as unknown as { indexedDB: FakeIdbFactory }).indexedDB;
    await drafts.list(); // opens the database, with its store of drafts
    holderDb.databases.get("atlas")?.store("drafts").set("01K0000000000000000000000Z", "{");
    const slot = document.createElement("span");
    document.body.append(slot);
    mountDraftCounter(slot);
    await until(() => slot.textContent === "1");
    expect(slot.querySelector("a")?.getAttribute("aria-label")).toBe("1 borrador pendiente");
    holderDb.databases.get("atlas")?.store("drafts").delete("01K0000000000000000000000Z");
  });

  it("waits in the list, and is never recorded by itself when the rate arrives", async () => {
    const id = await saveGoldDraft();
    const recorded = events();
    // Served by the form route, as the application routes it.
    let host = await show("/registrar/borradores", RegistrarForm, "/registrar/:tipo");
    await until(() => text(host).includes("Esperando el tipo de USD del 01/04/2026"));
    expect(text(host)).toContain("Viven solo en este navegador");
    expect(text(host)).not.toContain("Revisar y registrar");

    await importHistory(later);
    host = await show("/registrar/borradores", Borradores, "/registrar/borradores");
    await until(() => text(host).includes("Puedes registrarlo"));
    expect(text(host)).toContain("1,1104 USD por euro del 01/04/2026");
    const open = host.querySelector(`a[href="/registrar/buy?borrador=${id}"]`);
    expect(open).not.toBeNull();
    expect(events()).toBe(recorded);
    expect((await drafts.list()).drafts).toHaveLength(1);
  });

  it("is recorded from its form with the official rate, and only then leaves the list", async () => {
    await openWritable();
    const id = await saveGoldDraft();
    await importHistory(later);
    const recorded = events();
    const host = await show(`/registrar/buy?borrador=${id}`, RegistrarForm, "/registrar/:tipo");
    await until(() => value(host, "f-fx_rate") === "1,1104");
    expect(value(host, "f-fx_rate_date")).toBe("2026-04-01");
    expect(value(host, "f-quantity")).toBe("1");
    expect(text(host)).not.toContain("Guardar como borrador");
    await press(host, "Ver el efecto");
    await until(() => host.querySelector("section.effect") !== null);
    const confirm = [...host.querySelectorAll("section.effect button")].find(
      (button) => button.textContent?.trim() === "Registrar",
    ) as HTMLButtonElement;
    confirm.click();
    await until(() => window.location.pathname.startsWith("/movimientos/"));
    expect(events()).toBe(recorded + 1);
    const last = store.snapshot()?.events.at(-1) as unknown as Record<string, unknown>;
    expect(last).toMatchObject({ type: "buy", fx_rate: "1.1104", fx_rate_date: "2026-04-01" });
    expect((await drafts.list()).drafts).toEqual([]);
  });

  it("says so when the draft cannot be removed, and a second confirmation only removes it (review of PR #75)", async () => {
    await openWritable();
    const id = await saveGoldDraft();
    await importHistory(later);
    const recorded = events();
    const confirm = async (): Promise<HTMLElement> => {
      const host = await show(`/registrar/buy?borrador=${id}`, RegistrarForm, "/registrar/:tipo");
      await until(() => value(host, "f-fx_rate") === "1,1104");
      await press(host, "Ver el efecto");
      await until(() => host.querySelector("section.effect") !== null);
      (
        [...host.querySelectorAll("section.effect button")].find(
          (button) => button.textContent?.trim() === "Registrar",
        ) as HTMLButtonElement
      ).click();
      return host;
    };
    // The store of drafts fails once, after the line was written.
    const failing = vi.spyOn(draftStore.drafts, "remove").mockRejectedValueOnce(new Error("x"));
    const first = await confirm();
    // The form route serves the list, where it is said and the draft is left.
    await until(() => text(first).includes("Registrado, pero el borrador sigue aquí"));
    await until(() => text(first).includes("Ya está en tus datos"));
    expect(events()).toBe(recorded + 1);
    expect((await drafts.list()).drafts.map((draft) => draft.id)).toEqual([id]);
    failing.mockRestore();
    // Confirming it again records nothing: it only removes the draft.
    const second = await confirm();
    await until(() => window.location.search.includes("ya="));
    expect(window.location.pathname).toBe("/registrar/borradores");
    expect(text(second)).not.toContain("Ya hay un movimiento igual");
    expect(events()).toBe(recorded + 1);
    expect((await drafts.list()).drafts).toEqual([]);
  });

  it("keeps the draft when the record is refused (review of PR #75, mutant W1)", async () => {
    await openWritable();
    const id = await saveGoldDraft();
    await importHistory(later);
    const host = await show(`/registrar/buy?borrador=${id}`, RegistrarForm, "/registrar/:tipo");
    await until(() => value(host, "f-fx_rate") === "1,1104");
    await press(host, "Ver el efecto");
    await until(() => host.querySelector("section.effect") !== null);
    // Another tab writes meanwhile: the record is refused as a conflict.
    const blob = written as MemoryBlob;
    const first = blob.text.split("\n")[0] as string;
    blob.text = `${blob.text}${first.replace(/"id":"[^"]+"/, '"id":"01ARYZ6S41TSV4RRFFQ69G5FZY"')}\n`;
    const recorded = blob.text.split("\n").filter((line) => line !== "").length;
    (
      [...host.querySelectorAll("section.effect button")].find(
        (button) => button.textContent?.trim() === "Registrar",
      ) as HTMLButtonElement
    ).click();
    await settle(200);
    expect(blob.text.split("\n").filter((line) => line !== "").length).toBe(recorded);
    expect((await drafts.list()).drafts.map((draft) => draft.id)).toEqual([id]);
  });

  it("says a draft that is gone is gone", async () => {
    const host = await show(
      "/registrar/buy?borrador=01K00000000000000000000009",
      RegistrarForm,
      "/registrar/:tipo",
    );
    await until(() => text(host).includes("Ese borrador ya no está en este navegador"));
  });

  it("can be discarded, after a yes", async () => {
    await saveGoldDraft();
    const host = await show("/registrar/borradores", Borradores, "/registrar/borradores");
    await until(() => text(host).includes("Esperando el tipo"));
    await press(host, "Descartar");
    // The form route left behind shows the list too, since it serves
    // `/registrar/borradores`: the dialog is the one that opened.
    const dialog = [...host.querySelectorAll("dialog")].find((node) =>
      node.hasAttribute("open"),
    ) as HTMLElement;
    await press(dialog, "Descartar");
    await until(() => text(host).includes("No hay borradores pendientes."));
    expect((await drafts.list()).drafts).toEqual([]);
  });
});

describe("the database of version 2 blocked by another tab", () => {
  it("says to close the other tab, not that the browser keeps no data", () => {
    const blocked = new Error("x", { cause: "blocked" });
    blocked.name = "StorageUnavailable";
    const said = toAppError(blocked);
    expect(said.code).toBe("storage_blocked");
    expect(said.message).toContain("otra pestaña");
  });
});
