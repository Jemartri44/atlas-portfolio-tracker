// The exchange differences of a year (spec 029), as the screen reads them: named by their
// currency, never looked up as an asset, and kept apart from the sale whose proceeds make them.

import { Money } from "@atlas/domain";
import type { CurrencyLine, TaxBoxes, TaxYearReport } from "@atlas/domain/fiscal";
import { describe, expect, it } from "vitest";
import { NO_NAMES } from "../src/format/names.js";
import { boxesView } from "../src/view-models/fiscal/boxes.js";
import { yearView } from "../src/view-models/fiscal/index.js";

const eur = (value: string): Money => Money.parse(value, "EUR");
const zero = eur("0");

const line = (event_id: string, kind: CurrencyLine["kind"], gain: string): CurrencyLine => ({
  event_id,
  kind,
  account_id: "acc_us",
  currency: "USD",
  fiscal_date: "2028-12-01",
  amount: Money.parse("89", "USD"),
  proceeds_eur: eur("80.91"),
  cost_eur: eur("79.36"),
  gain_eur: eur(gain),
  gain_eur_rounded: eur(gain),
  lots: [],
  criteria: ["4", "4:currency_fifo", "6"],
});

const report = {
  year: 2028,
  today: "2029-06-01",
  base_eur: zero,
  anchors: [],
  capital_gains: {
    lines: [
      {
        event_id: "e21",
        event_type: "sell",
        asset_id: "stk_us",
        fiscal_date: "2028-12-01",
        computable_eur_rounded: eur("248.33"),
        criteria: ["4"],
      },
    ],
    currency_lines: [line("e21", "cover", "1.55"), line("e30", "conversion", "-4")],
    balance_eur: eur("245.88"),
    foreign_releases_eur: zero,
  },
  movable_capital: {
    transmissions: [],
    dividends: [],
    interest: [],
    expenses: [],
    balance_eur: zero,
    foreign_releases_eur: zero,
  },
  compensation: { steps: [], pending: [], expired: [], limit_pct: "25" },
  doubtful: [],
  settled: [],
} as unknown as TaxYearReport;

describe("the exchange differences of the year", () => {
  it("are rows of the capital gains, by currency, with a key of their own", () => {
    const rows = yearView(report, NO_NAMES).groups[0]?.rows ?? [];
    expect(
      rows.map((row) => [row.key, row.subject, row.kind, row.amount_eur.amount.toString()]),
    ).toEqual([
      ["e21", "stk_us", "Venta", "248.33"],
      ["e21:cover", "Divisa USD", "Entrada que cubre divisa gastada sin tenerla", "1.55"],
      ["e30:conversion", "Divisa USD", "Cambio a euros", "-4"],
    ]);
  });

  it("are named by their currency in the layout by box", () => {
    const boxes: TaxBoxes = {
      year: 2028,
      scope: "fiscal_total",
      today: "2029-06-01",
      mapping: "none",
      entries: [
        {
          concept: "gp.other.loss",
          section: "other",
          row: {
            event_id: "e30",
            account_id: "acc_us",
            asset_id: "USD",
            fiscal_date: "2028-12-01",
            currency: "USD",
          },
          exact_eur: eur("-4"),
          amount_eur: eur("-4"),
          criteria: [],
        },
      ],
      notes: [],
    };
    const rows = boxesView(boxes, NO_NAMES).blocks.flatMap((block) => block.rows);
    expect(rows.map((row) => row.operation)).toEqual(["Divisa USD · 01/12/2028"]);
  });
});
