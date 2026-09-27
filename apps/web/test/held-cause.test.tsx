// @vitest-environment happy-dom
//
// Why the ledger is invalid, when the sync is the cause (review of PR #97,
// correctness B1; D-Q1 of the 014): with something held back unresolved, the
// notice of an invalid ledger says so and sends to Ajustes › Sincronización ›
// Retenidas; without anything held, it says nothing of the sync.

import { openAtlasDb } from "@atlas/adapters/browser";
import { holdRecords, recordsText } from "@atlas/domain/sync";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FakeIdbFactory } from "../../../packages/adapters/test/fake-idb.js";
import RegistrarForm from "../src/routes/registrar/form.jsx";
import { goldenText } from "./helpers/golden.js";
import { openLedger, show, text, until, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

const holder = globalThis as { indexedDB?: unknown };
const before = holder.indexedDB;
const factory = new FakeIdbFactory();
beforeAll(async () => {
  holder.indexedDB = factory;
  await openAtlasDb();
});
afterAll(() => {
  holder.indexedDB = before;
});

/** The store the ledger and the keys of the sync live in (`idb.ts`). */
const ledger = () => factory.databases.get("atlas")?.store("ledger") as Map<string, unknown>;

/** The golden ledger with a sale of far more than is held: invalid. */
const invalidText = (): string =>
  `${goldenText()}${JSON.stringify({
    schema_version: 1,
    id: "01P0000000000000000000BAD0",
    recorded_at: "2028-12-31T19:00:00.000Z",
    type: "sell",
    account_id: "acc_mi",
    asset_id: "ast_world",
    trade_date: "2028-12-29",
    value_date: "2028-12-29",
    quantity: "999999",
    unit_price: "1",
    currency: "EUR",
    fx_rate: "1",
    fx_rate_date: "2028-12-29",
    fee: "0",
    source: "manual",
    fingerprint: "sha256:bad",
  })}\n`;

const register = () => show("/registrar/cash-in", RegistrarForm, "/registrar/:tipo");

describe("the notice of an invalid ledger", () => {
  it("names what the sync holds back as the cause, and where it is resolved", async () => {
    ledger().set(
      "sync:held",
      recordsText(holdRecords(["x"], "client", { code: "pair_rejected", details: {} }, "t")),
    );
    await openLedger(invalidText());
    const host = await register();
    await until(
      () => text(host).includes("La causa es lo que la sincronización retiene"),
      "la causa",
    );
    expect(text(host)).toContain("Tus datos tienen movimientos inválidos");
    const link = [...host.querySelectorAll("a")].find((a) =>
      (a.textContent ?? "").includes("Ajustes › Sincronización › Retenidas"),
    );
    expect(link?.getAttribute("href")).toBe("/ajustes#sincronizacion");
    ledger().delete("sync:held");
  });

  it("says nothing of the sync when nothing is held back", async () => {
    ledger().delete("sync:held");
    await openLedger(invalidText());
    const host = await register();
    await until(() => text(host).includes("Tus datos tienen movimientos inválidos"), "el aviso");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(text(host)).not.toContain("sincronización retiene");
  });
});
