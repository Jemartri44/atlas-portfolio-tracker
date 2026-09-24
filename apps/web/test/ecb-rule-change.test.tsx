// @vitest-environment happy-dom
//
// The ECB rates after a change of `fiscal_date_rule`, in the browser (feature
// 012, block 6; ADR-0029, point 10; criterion 25): said in Configuración
// **before** the change is written, and the correction proposed whole in
// «Verificación» and written in one write after a yes. Mutants 15 and 20 of
// prompt 012 §5.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BlobLedgerStore } from "@atlas/adapters/blob";
import { saveImportedHistory } from "@atlas/adapters/reference";
import { DEFAULT_SETTINGS, mergeSettings, type Settings, type UseCaseDeps } from "@atlas/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FakeIdbFactory } from "../../../packages/adapters/test/fake-idb.js";
import { reloadWebHistory } from "../src/ecb/history.js";
import { loadInto } from "../src/ledger/actions.js";
import { store } from "../src/ledger/state.js";
import { changeSettings, recordDraft } from "../src/ledger/write.js";
import Configuracion from "../src/routes/ajustes/configuracion.jsx";
import Verificacion from "../src/routes/ajustes/verificacion.jsx";
import { asEventDraft } from "../src/view-models/forms/values.js";
import { MemoryBlob } from "./helpers/memory-blob.js";
import { choose, press, settle, show, text, withGoldenLedger } from "./helpers/render.jsx";

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

const openDialog = (host: HTMLElement): HTMLElement | undefined =>
  [...host.querySelectorAll("dialog")].find((node) => node.hasAttribute("open"));

const events = (): number => store.snapshot()?.events.length ?? 0;

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
      fx_rate: "1.1169",
      fx_rate_date: "2026-01-02",
      fee: "0",
      source: "manual",
    }),
  );
  expect(recorded.ok).toBe(true);
};

const valueDateForEtc = (): Settings =>
  mergeSettings(DEFAULT_SETTINGS, {
    fiscal_date_rule: { ...DEFAULT_SETTINGS.fiscal_date_rule, etc: "value_date" },
  } as Partial<Settings>);

describe("a change of fiscal_date_rule in Configuración (mutant 15)", () => {
  it("names the lines whose rate stops being their fiscal date's, before writing", async () => {
    await openSmallLedger();
    const recorded = events();
    const host = await show("/ajustes/configuracion", Configuracion);
    choose(host, "fdr-etc", "value_date");
    await press(host, "Guardar configuración");
    await until(() => openDialog(host) !== undefined);
    const shown = text(openDialog(host));
    expect(shown).toContain("Este cambio deja tipos del BCE de otra fecha");
    expect(shown).toContain(
      "1,1169 USD del 02/01/2026; su fecha fiscal pasa al 06/01/2026. Deja de ser el tipo de su fecha fiscal. El oficial es 1,1195 del 06/01/2026.",
    );
    expect(events()).toBe(recorded);
    await press(openDialog(host) as HTMLElement, "Cancelar");
    expect(events()).toBe(recorded);
    // A yes writes the change, and only the change.
    await press(host, "Guardar configuración");
    await until(() => openDialog(host) !== undefined);
    await press(openDialog(host) as HTMLElement, "Guardar de todas formas");
    await until(() => events() === recorded + 1);
    expect(store.snapshot()?.events.at(-1)?.type).toBe("settings_changed");
  });
});

describe("the correction in «Verificación» (mutant 20)", () => {
  const proposal = (host: HTMLElement): string =>
    text(
      [...host.querySelectorAll(".notice, [role='status'], aside, div")].find((node) =>
        text(node).startsWith("Corrección propuesta"),
      ),
    );

  it("is proposed whole and written in one write after a yes", async () => {
    await openSmallLedger();
    expect((await changeSettings(valueDateForEtc())).ok).toBe(true);
    const recorded = events();
    const host = await show("/ajustes/verificacion", Verificacion);
    await until(() => text(host).includes("Corrección propuesta"));
    expect(text(host)).toContain("1,1169 USD del 02/01/2026 → 1,1195 del 06/01/2026");
    expect(proposal(host)).toContain("criterio 25");
    await press(host, "Escribir la corrección");
    await until(() => openDialog(host) !== undefined);
    expect(text(openDialog(host))).toContain("o se escriben todas o ninguna");
    await press(openDialog(host) as HTMLElement, "Escribir la corrección");
    await until(() => events() === recorded + 2);
    const [reversal, corrected] = (store.snapshot()?.events ?? []).slice(-2) as unknown as Record<
      string,
      unknown
    >[];
    expect(reversal?.type).toBe("reversal");
    expect(corrected).toMatchObject({ type: "buy", fx_rate: "1.1195", fx_rate_date: "2026-01-06" });
  });
});
