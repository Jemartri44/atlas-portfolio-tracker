// @vitest-environment happy-dom
//
// The note of the tax report on a line whose ECB rate is in doubt, on the
// fiscal screen (feature 012, blocks 4 and 6; ADR-0029, point 8; criterion
// 25). The report carried it; the screen did not say it (mutant 13, web).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BlobLedgerStore } from "@atlas/adapters/blob";
import { saveImportedHistory } from "@atlas/adapters/reference";
import type { UseCaseDeps } from "@atlas/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FakeIdbFactory } from "../../../packages/adapters/test/fake-idb.js";
import { reloadWebHistory } from "../src/ecb/history.js";
import { loadInto } from "../src/ledger/actions.js";
import { store } from "../src/ledger/state.js";
import { recordDraft } from "../src/ledger/write.js";
import Fiscal from "../src/routes/fiscal/index.jsx";
import Edit from "../src/routes/movimientos/edit.jsx";
import RegistrarForm from "../src/routes/registrar/form.jsx";
import { asEventDraft } from "../src/view-models/forms/values.js";
import { MemoryBlob } from "./helpers/memory-blob.js";
import { choose, press, settle, show, text, type, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

const holder = globalThis as { indexedDB?: unknown };
const before = holder.indexedDB;
beforeAll(async () => {
  holder.indexedDB = new FakeIdbFactory();
  await saveImportedHistory({
    text: readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../../../tests/fixtures/ecb/eurofxref-hist.csv",
      ),
      "utf8",
    ),
    source: "zip",
    file_name: "eurofxref-hist.csv",
    imported_at: "2026-04-01T10:00:00.000Z",
  });
  await reloadWebHistory();
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

const line = (fields: Record<string, unknown>, id: string): string =>
  JSON.stringify({ schema_version: 1, id, recorded_at: "2026-01-01T10:00:00.000Z", ...fields });

/**
 * A small ledger in a store that writes: an account, a gold ETC in dollars,
 * and a purchase of Friday 2026-01-02 settled on Tuesday the 6th at the rate
 * of the 2nd — the official one of its fiscal date by the default rule.
 */
const openSmallLedger = async (buyRateDate = "2026-01-02"): Promise<void> => {
  const text = `${[
    line(
      {
        type: "account_created",
        account_id: "acc",
        name: "IBKR",
        platform: "ibkr",
        book: "core",
        base_currency: "EUR",
        country: "IE",
        active: true,
      },
      "01ARYZ6S41TSV4RRFFQ69G5FA0",
    ),
    line(
      {
        type: "asset_created",
        asset_id: "gold",
        asset_type: "etc",
        book: "core",
        asset_class: "gold",
        name: "Oro",
        currency: "USD",
        transferable: false,
        active: true,
      },
      "01ARYZ6S41TSV4RRFFQ69G5FA1",
    ),
  ].join("\n")}\n`;
  let counter = 0;
  const deps: UseCaseDeps = {
    store: new BlobLedgerStore(new MemoryBlob(text)),
    clock: { now: () => new Date("2026-04-01T10:00:00.000Z") },
    random: (target) => {
      counter += 1;
      target.fill(counter % 251);
    },
  };
  await loadInto({ deps, source: { kind: "browser", persisted: false } });
  const recorded = await recordDraft(
    asEventDraft({
      type: "buy",
      account_id: "acc",
      asset_id: "gold",
      trade_date: "2026-01-02",
      value_date: "2026-01-06",
      quantity: "1",
      unit_price: "100",
      currency: "USD",
      fx_rate: "1.12",
      fx_rate_date: buyRateDate,
      fee: "0",
      source: "manual",
    }),
  );
  expect(recorded.ok).toBe(true);
  const sold = await recordDraft(
    asEventDraft({
      type: "sell",
      account_id: "acc",
      asset_id: "gold",
      trade_date: "2026-02-02",
      value_date: "2026-02-04",
      quantity: "1",
      unit_price: "110",
      currency: "USD",
      fx_rate: "1.1",
      fx_rate_date: "2026-02-02",
      fee: "0",
      source: "manual",
    }),
  );
  expect(sold.ok).toBe(true);
};

describe("the fiscal screen", () => {
  it("says which lines depend on an ECB rate in doubt, citing criterion 25", async () => {
    await openSmallLedger();
    const host = await show("/fiscal?ejercicio=2026", Fiscal);
    await until(() => text(host).includes("Tipos del BCE de estas líneas (criterio 25)"));
    expect(text(host)).toContain("depende de un tipo del BCE que no es el oficial de su fecha");
  });

  it("proposes nothing over the rate of a movement being corrected (review of PR #75)", async () => {
    await openSmallLedger();
    const buy = store.snapshot()?.events.find((event) => event.type === "buy");
    const host = await show(`/movimientos/${buy?.id}/editar`, Edit, "/movimientos/:id/editar");
    await until(() => host.querySelector("#f-fx_rate") !== null);
    await settle(300);
    // The recorded 1.12 of the 2nd stays: the official 1.1169 is not put over it.
    expect((host.querySelector("#f-fx_rate") as HTMLInputElement).value).toBe("1,12");
    expect(text(host)).not.toContain("Tipo propuesto por el histórico del BCE");
  });

  it("writes nothing once the yes to a typed rate is taken back, even from the duplicate question (review of PR #75)", async () => {
    await openSmallLedger();
    const recorded = store.snapshot()?.events.length ?? 0;
    const host = await show("/registrar/buy", RegistrarForm, "/registrar/:tipo");
    choose(host, "f-account_id", "acc");
    choose(host, "f-asset_id", "gold");
    await settle();
    type(host, "f-trade_date", "2026-01-02");
    type(host, "f-value_date", "2026-01-06");
    type(host, "f-quantity", "1");
    type(host, "f-unit_price", "100");
    await settle(50);
    type(host, "f-fx_rate", "1,12");
    type(host, "f-fx_rate_date", "2026-01-02");
    await settle(50);
    await press(host, "Ver el efecto");
    await until(() => text(host).includes("El tipo no es el oficial"));
    const acknowledge = host.querySelector("#confirm-fx-rate") as HTMLInputElement;
    acknowledge.click();
    await settle(20);
    (
      [...host.querySelectorAll("section.effect button")].find(
        (button) => button.textContent?.trim() === "Registrar",
      ) as HTMLButtonElement
    ).click();
    // The same purchase is in the ledger already: the duplicate question.
    await until(() => text(host).includes("Registrar de todas formas"));
    acknowledge.click();
    await settle(20);
    const dialog = [...host.querySelectorAll("dialog")].find((node) =>
      node.hasAttribute("open"),
    ) as HTMLElement;
    await press(dialog, "Registrar de todas formas");
    await settle(100);
    expect(store.snapshot()?.events.length).toBe(recorded);
  });

  it("says a rate dated after its fiscal date, too (review of PR #75)", async () => {
    // The purchase of the 2nd (a trade date) carries the rate of the 5th.
    await openSmallLedger("2026-01-05");
    const host = await show("/fiscal?ejercicio=2026", Fiscal);
    await until(() => text(host).includes("fechado después de su fecha fiscal"));
  });
});
