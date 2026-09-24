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
import { recordDraft } from "../src/ledger/write.js";
import Fiscal from "../src/routes/fiscal/index.jsx";
import { asEventDraft } from "../src/view-models/forms/values.js";
import { MemoryBlob } from "./helpers/memory-blob.js";
import { settle, show, text, withGoldenLedger } from "./helpers/render.jsx";

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
const openSmallLedger = async (): Promise<void> => {
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
      fx_rate_date: "2026-01-02",
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
    await until(() => text(host).includes("Líneas con un tipo del BCE en duda (criterio 25)"));
    expect(text(host)).toContain("depende de un tipo del BCE que no es el oficial de su fecha");
  });
});
