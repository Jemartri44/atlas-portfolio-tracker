// The web half of the closed-year warning (ADR-0020, amended; prompt 010,
// FR-018): before writing, which filed return the change reaches and how much
// of what was declared it moves.
//
// Without a DOM, like the rest of `ledger/` (decision (k) of the 006): what is
// checked here is that each of the four write flows —record, correct, annul
// and change the settings— can ask, and that a ledger with nothing filed says
// nothing at all. What the screens do with it belongs to the screen tests.

import { BlobLedgerStore } from "@atlas/adapters/blob";
import {
  type Draft,
  decodeLine,
  type LedgerEvent,
  type Settings,
  type SupportedEvent,
  settingsAt,
  type UseCaseDeps,
} from "@atlas/domain";
import type { ClosedYearImpact, MovedFigure } from "@atlas/domain/fiscal";
import { beforeEach, describe, expect, it } from "vitest";
import { loadInto } from "../src/ledger/actions.js";
import { store } from "../src/ledger/state.js";
import {
  closedYearsOfCorrection,
  closedYearsOfDraft,
  closedYearsOfReversal,
  closedYearsOfSettings,
} from "../src/ledger/write.js";
import { goldenEvents, goldenText } from "./helpers/golden.js";
import { MemoryBlob } from "./helpers/memory-blob.js";

/** What a comparison that **was** made says moved; it fails loudly if it was not made. */
const movesOf = (impact: ClosedYearImpact | undefined): readonly MovedFigure[] => {
  const comparison = impact?.comparison;
  if (comparison?.status !== "compared") {
    throw new Error(`expected a comparison, got ${JSON.stringify(comparison)}`);
  }
  return comparison.moves;
};

const FILING_ID = "01P0000000000000000000FEED";

/** The settings the golden ledger is read with: a filing has to carry them (S13). */
const goldenSettings = (): Settings =>
  (
    [...goldenEvents()].reverse().find((event) => event.type === "settings_changed") as unknown as {
      settings: Settings;
    }
  ).settings;

/** The Renta of 2027, filed: the golden ledger has a loss sale and its repurchases that year. */
const filing = (): string =>
  `${JSON.stringify({
    schema_version: 1,
    id: FILING_ID,
    recorded_at: "2028-06-10T18:00:00.000Z",
    type: "tax_return_filed",
    model: "renta",
    tax_year: 2027,
    filed_at: "2028-06-10",
    receipt_reference: "100-2027-ABCDEFGHIJKL",
    declared: { savings_base_eur: "0.00", pending_losses: [], deferred_losses_eur: "0.00" },
    computed: {
      as_of: "2028-06-10",
      settings_origin: "event",
      settings: goldenSettings(),
      savings_base_eur: "0.00",
      pending_losses: [],
      deferred_losses_eur: "0.00",
    },
    ledger_fingerprint: { schema_version: 1, lines: 200, sha256: "0".repeat(64) },
    fingerprint: "sha256:filing",
  })}\n`;

const open = async (text: string): Promise<void> => {
  const deps: UseCaseDeps = {
    store: new BlobLedgerStore(new MemoryBlob(text)),
    clock: { now: () => new Date("2029-07-01T10:00:00.000Z") },
    random: (target) => target.fill(7),
  };
  await loadInto({ deps, source: { kind: "browser", persisted: false } });
};

/** A sale of 2027, the year that was filed. */
const sale = (): Draft<SupportedEvent> =>
  ({
    type: "sell",
    account_id: "acc_mi",
    asset_id: "ast_world",
    trade_date: "2027-11-02",
    value_date: "2027-11-04",
    quantity: "1",
    unit_price: "120",
    currency: "EUR",
    fx_rate: "1",
    fx_rate_date: "2027-11-04",
    fee: "0",
    source: "manual",
  }) as unknown as Draft<SupportedEvent>;

/** The settings in force in the ledger just opened. */
const current = (): Settings =>
  settingsAt(
    store.snapshot()?.state as NonNullable<ReturnType<typeof store.snapshot>>["state"],
    "2029-07-01",
  ).settings;

const idOfFirstSale = (): string =>
  (goldenEvents().find((event) => event.type === "sell") as LedgerEvent).id;

describe("what a write does to a filed return", () => {
  beforeEach(() => {
    store.setLoad({ phase: "unconfigured" });
    store.setDeps(undefined);
    store.clearCache();
  });

  it("says nothing at all when no return has been recorded", async () => {
    await open(goldenText());
    expect(await closedYearsOfDraft(sale())).toEqual([]);
    expect(await closedYearsOfReversal(idOfFirstSale(), "duplicada")).toEqual([]);
    expect(
      await closedYearsOfSettings(
        settingsAt(store.snapshot()?.state as never, "2029-07-01").settings,
      ),
    ).toEqual([]);
  });

  it("names the return a new event reaches, and how much the base moves", async () => {
    await open(goldenText() + filing());
    const impacts = await closedYearsOfDraft(sale());
    expect(impacts).toHaveLength(1);
    expect(impacts[0]?.model).toBe("renta");
    expect(impacts[0]?.year).toBe(2027);
    expect(impacts[0]?.filed_at).toBe("2028-06-10");
    expect(impacts[0]?.by_date).toBe(true);
    expect(movesOf(impacts[0]).map((move) => move.figure)).toContain("savings_base");
  });

  it("names it when annulling and when correcting an event of that year", async () => {
    await open(goldenText() + filing());
    const id = idOfFirstSale();
    expect((await closedYearsOfReversal(id, "duplicada"))[0]?.year).toBe(2027);
    const draft = { ...(decodeLine(goldenText().split("\n")[50] as string).event as object) };
    for (const field of ["schema_version", "id", "recorded_at", "fingerprint"]) {
      delete (draft as Record<string, unknown>)[field];
    }
    const corrected = { ...draft, unit_price: "70.00" } as unknown as Draft<SupportedEvent>;
    const impacts = await closedYearsOfCorrection(id, corrected, "precio mal copiado");
    expect(impacts[0]?.year).toBe(2027);
    expect(movesOf(impacts[0]).length).toBeGreaterThan(0);
  });

  it("names it when the settings move a year nobody touched", async () => {
    await open(goldenText() + filing());
    // The golden ledger reads listed shares by trade date; reading them by
    // value date moves a sale of December 2027 into 2028, and with it the base
    // of the year that was filed.
    const settings = current();
    expect(settings.fiscal_date_rule.stock).toBe("trade_date");
    const impacts = await closedYearsOfSettings({
      ...settings,
      fiscal_date_rule: { ...settings.fiscal_date_rule, stock: "value_date" },
    });
    expect(impacts.map((impact) => impact.year)).toContain(2027);
    // Not a single event moves: what moves is how the ledger is read.
    expect(impacts.every((impact) => !impact.by_date)).toBe(true);
  });

  it("keeps quiet instead of blocking when the candidate cannot be built", async () => {
    await open(goldenText() + filing());
    const broken = { type: "sell", account_id: "nope" } as unknown as Draft<SupportedEvent>;
    expect(await closedYearsOfDraft(broken)).toEqual([]);
  });
});
