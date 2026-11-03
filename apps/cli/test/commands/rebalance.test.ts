// The text and the JSON of `atlas rebalance`, section by section, over a ledger built through the
// console: the figures are the domain's; what is pinned here is how each one reaches the person.

import { DEFAULT_SETTINGS } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { harness, seed } from "../harness.js";

const DATE = "2027-06-30";
const BRACKETS = [{ up_to_eur: "6000", rate_pct: "19" }, { rate_pct: "21" }];

const settings = (extra: Record<string, unknown>) => ({
  schema_version: 1 as const,
  id: "01ARYZ6S41TSV4RRFFQ69G5SET",
  recorded_at: "2026-09-01T17:00:00.000Z",
  type: "settings_changed" as const,
  settings: {
    ...DEFAULT_SETTINGS,
    target_weights: { ast_world: "70", ast_gold: "30" },
    deviation_threshold_pp: "5",
    stale_price_days: 5,
    ...extra,
  },
});

const trade = (
  side: "buy" | "sell",
  asset: string,
  account: string,
  quantity: string,
  price: string,
  date: string,
) => [
  "add",
  side,
  "--account",
  account,
  "--asset",
  asset,
  "--trade-date",
  date,
  "--value-date",
  date,
  "--quantity",
  quantity,
  "--unit-price",
  price,
  "--currency",
  "EUR",
  "--fx-rate",
  "1",
  "--fx-rate-date",
  date,
  "--yes",
];

const valuation = (asset: string, account: string, quantity: string, unit: string) => [
  "add",
  "valuation",
  "--account",
  account,
  "--asset",
  asset,
  "--date",
  DATE,
  "--fx-rate-date",
  DATE,
  "--quantity",
  quantity,
  "--unit-value",
  unit,
  "--currency",
  "EUR",
  "--fx-rate",
  "1",
  "--yes",
];

/** Gold (an ETC: it cannot be transferred, so the surplus is sold) against a fund at 70 / 30. */
const ledger = async (
  extra: Record<string, unknown>,
  goldUnit: string,
  before: string[][] = [],
  after: string[][] = [],
) => {
  const h = harness({ events: [...seed(), settings(extra)], confirm: true });
  for (const argv of [
    ...before,
    trade("buy", "ast_gold", "acc_etf", "6", "100", "2027-01-11"),
    trade("buy", "ast_world", "acc_fund", "4", "100", "2027-01-11"),
    ...after,
    valuation("ast_gold", "acc_etf", "6", goldUnit),
    valuation("ast_world", "acc_fund", "4", "100"),
  ]) {
    expect(await h.exec(argv)).toBe(0);
  }
  h.reset();
  return h;
};

describe("atlas rebalance: the sale step", () => {
  it("lists the order, the lot and where the money goes, with a tax when there are brackets", async () => {
    const h = await ledger({ savings_tax_brackets: BRACKETS }, "150");
    expect(await h.exec(["rebalance", "--date", DATE])).toBe(0);
    const text = h.text();
    expect(text).toContain("Paso 1 · CON IMPUESTOS, DECIDES TÚ · vender ast_gold: 510.00 EUR");
    expect(text).toContain("   Vender en acc_etf: 3.4 uds, 510.00 EUR; comisión desconocida.");
    expect(text).toContain(
      "   Impuesto aproximado: 32.30 EUR sobre una ganancia de 170.00 EUR (estimación al precio de hoy; no es la liquidación).",
    );
    expect(text).toContain("   Lote FIFO de 2027-01-11: 3.4 uds, coste 340.00, ganancia 170.00.");
    expect(text).toContain("   Con ese dinero se compra:");
    expect(text).toContain("   Si te quedas aquí: desviación máxima 0 puntos.");
    expect(text).toContain("Efectivo entre plataformas");
    expect(text).not.toContain("Pérdida diferida");
  });

  it("keeps every figure as a string in --json", async () => {
    const h = await ledger({ savings_tax_brackets: BRACKETS }, "150");
    expect(await h.exec(["rebalance", "--date", DATE, "--json"])).toBe(0);
    const data = h.json() as { steps: Record<string, unknown>[]; cash: unknown[] };
    expect(data.steps).toHaveLength(1);
    expect(data.steps[0]).toMatchObject({
      kind: "sale",
      asset_id: "ast_gold",
      amount_eur: "510",
      orders: [{ account_id: "acc_etf", quantity: "3.4", amount_eur: "510" }],
      tax: {
        available: true,
        tax_eur: "32.3",
        gain_eur: "170",
        cost_eur: "340",
        deferred_eur: "0",
        lots: [
          { acquisition_date: "2027-01-11", quantity: "3.4", cost_eur: "340", gain_eur: "170" },
        ],
      },
      max_deviation_pp: "0",
    });
    expect(data.cash).toHaveLength(2);
  });

  it("says the tax cannot be computed without the brackets of the savings base", async () => {
    const h = await ledger({}, "150");
    expect(await h.exec(["rebalance", "--date", DATE])).toBe(0);
    expect(h.text()).toContain(
      "   Impuesto: no calculable, faltan los tramos de la base del ahorro (`savings_tax_brackets`).",
    );
    h.reset();
    expect(await h.exec(["rebalance", "--date", DATE, "--json"])).toBe(0);
    const [step] = (h.json() as { steps: { tax: Record<string, unknown> }[] }).steps;
    expect(step?.tax.available).toBe(true);
    expect(step?.tax.tax_eur).toBeUndefined();
  });
});

describe("atlas rebalance: a sale at a loss", () => {
  // Two gold units bought long ago and sold in March at 200: a gain of the year to offset.
  const earlierGain = [
    trade("buy", "ast_gold", "acc_etf", "2", "100", "2026-12-01"),
    trade("sell", "ast_gold", "acc_etf", "2", "200", "2027-03-01"),
  ];

  it("says the loss lowers the tax when it offsets a gain of the year", async () => {
    const h = await ledger({ savings_tax_brackets: BRACKETS }, "50", earlierGain);
    expect(await h.exec(["rebalance", "--date", DATE])).toBe(0);
    expect(h.text()).toContain(
      "   Reduce tu impuesto en ≈ 17.10 EUR: la pérdida de 90.00 EUR compensa ganancias de este año (estimación al precio de hoy; no es la liquidación).",
    );
    expect(h.text()).toContain("Lote FIFO de 2027-01-11: 1.8 uds, coste 180.00, ganancia -90.00.");
    h.reset();
    expect(await h.exec(["rebalance", "--date", DATE, "--json"])).toBe(0);
    const [step] = (h.json() as { steps: { tax: { tax_eur: string } }[] }).steps;
    expect(step?.tax.tax_eur).toBe("-17.1");
  });

  it("warns of the loss the repurchase rule defers", async () => {
    const h = await ledger(
      { savings_tax_brackets: BRACKETS },
      "50",
      [],
      [trade("buy", "ast_gold", "acc_etf", "1", "100", "2027-06-10")],
    );
    expect(await h.exec(["rebalance", "--date", DATE])).toBe(0);
    expect(h.text()).toContain(
      "   Impuesto aproximado: 0.00 EUR sobre una pérdida de -125.00 EUR (estimación al precio de hoy; no es la liquidación).",
    );
    expect(h.text()).toContain(
      "   Pérdida diferida por la regla de recompra: 50.00 EUR. No recompres este valor antes de 2027-08-30 o la pérdida seguirá sin ser deducible.",
    );
    h.reset();
    expect(await h.exec(["rebalance", "--date", DATE, "--json"])).toBe(0);
    const [step] = (
      h.json() as { steps: { tax: { deferred_eur: string; deferral_window_end: string } }[] }
    ).steps;
    expect(step?.tax).toMatchObject({ deferred_eur: "50", deferral_window_end: "2027-08-30" });
  });
});
