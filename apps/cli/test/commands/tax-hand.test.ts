// What `atlas tax` carries in its JSON for the hand-worked ledger `tests/fixtures/ledger/tax-hand-v1.jsonl`
// and for the cases that used to be pinned in the text. The working of each year is in
// `packages/domain/test/tax/hand-checked.test.ts`, which checks the gains, the totals, the offsets
// and the base; here, the figures of the lines that only the console used to read: what a sale
// brought in euros and at which rate, what it cost, and the deferred and filed sections.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CLI_SETTINGS, Events } from "../events.js";
import { BUY_GOLD, harness, SELL_GOLD, seed } from "../harness.js";
import { LEDGER_FIXTURES } from "../support/fixtures.js";

const lines = (file: string): string[] =>
  readFileSync(join(LEDGER_FIXTURES, file), "utf8")
    .split("\n")
    .filter((line) => line !== "");

interface Proceeds {
  amount: string;
  currency: string;
  eur: string;
  fx_rate: string;
  fx_rate_date: string;
}
interface Line {
  event_id: string;
  proceeds: Proceeds;
  cost_eur: string;
  computable_eur_rounded: string;
  corporate_action_kind?: string;
  provisional_until?: string;
}
interface Report {
  base_eur: string;
  anchors: { year: number; computed: unknown[]; declared: unknown[] }[];
  capital_gains: {
    lines: Line[];
    currency_lines: {
      event_id: string;
      kind: string;
      amount: string;
      proceeds_eur: string;
      cost_eur: string;
      gain_eur_rounded: string;
      lots: { acquisition_date: string; amount: string; cost_eur: string }[];
    }[];
  };
  movable_capital: {
    dividends: { event_id: string; gross: Proceeds }[];
    transmissions: { corporate_action_kind?: string; computable_eur_rounded: string }[];
    expenses: unknown[];
    balance_eur: string;
  };
  wash_sale: {
    deferred: {
      event_id: string;
      amount_eur_rounded: string;
      units: string;
      sold: string;
      window: string;
      window_start: string;
      window_end: string;
      acquisitions: { event_id: string; units: string }[];
    }[];
    released: unknown[];
    pending: { origin_event_id: string; lot_id: string; asset_id: string; amount_eur: string }[];
  };
  filing?: unknown;
}

const tax = async (
  year: number,
  options: { lines?: string[]; events?: ReturnType<Events["build"]>; instant: string },
): Promise<Report> => {
  const h = harness({
    ...(options.lines === undefined ? {} : { lines: options.lines }),
    ...(options.events === undefined ? {} : { events: options.events }),
    instant: options.instant,
  });
  expect(await h.exec(["tax", String(year)])).toBe(0);
  return JSON.parse(h.text()) as Report;
};

const hand = (year: number): Promise<Report> =>
  tax(year, { lines: lines("tax-hand-v1.jsonl"), instant: "2026-09-18T10:00:00.000Z" });

const byEvent = (report: Report, id: string): Line => {
  const found = report.capital_gains.lines.find((line) => line.event_id === id);
  expect(found).toBeDefined();
  return found as Line;
};

const ID = {
  U2: "01ARYZ6S41TSV4RRFFQ6900011",
  U3: "01ARYZ6S41TSV4RRFFQ6900012",
  F4: "01ARYZ6S41TSV4RRFFQ6900015",
  SX2: "01ARYZ6S41TSV4RRFFQ6900016",
  Y2: "01ARYZ6S41TSV4RRFFQ690001B",
  C2: "01ARYZ6S41TSV4RRFFQ690001K",
} as const;

describe("atlas tax over the hand-worked ledger", () => {
  it("2021: the dollar sale brings in 1,089.09 at 1.10 against a cost of 910.91, and the dollars cover what was spent", async () => {
    const report = await hand(2021);
    const sale = byEvent(report, ID.U3);
    expect(sale.proceeds).toMatchObject({
      amount: "1198",
      currency: "USD",
      eur: "1089.0909090909",
      fx_rate: "1.10",
    });
    expect(sale.cost_eur).toBe("910.9090909091");
    expect(sale.computable_eur_rounded).toBe("178.18");
    const cover = (id: string) =>
      report.capital_gains.currency_lines.find((line) => line.event_id === id);
    expect(cover(ID.U2)).toMatchObject({
      kind: "cover",
      amount: "21",
      proceeds_eur: "17.5",
      cost_eur: "17.5",
    });
    expect(cover(ID.U3)).toMatchObject({ kind: "cover", amount: "981", proceeds_eur: "817.5" });
    const dividend = report.movable_capital.dividends.find((d) => d.event_id === ID.U2);
    expect(dividend?.gross).toMatchObject({
      amount: "30",
      currency: "USD",
      eur: "25",
      fx_rate: "1.20",
    });
  });

  it("2022 and 2023: what the losses and the swap brought in and cost", async () => {
    const y2022 = await hand(2022);
    expect(byEvent(y2022, ID.F4)).toMatchObject({ cost_eur: "1005" });
    expect(byEvent(y2022, ID.F4).proceeds.eur).toBe("904.5");
    expect(byEvent(y2022, ID.SX2).proceeds.eur).toBe("120");
    expect(byEvent(y2022, ID.SX2).cost_eur).toBe("153");
    expect(byEvent(y2022, ID.Y2).proceeds.eur).toBe("80");
    expect(byEvent(y2022, ID.Y2).cost_eur).toBe("100");
    const y2023 = await hand(2023);
    expect(byEvent(y2023, ID.C2).proceeds.eur).toBe("1285");
    expect(byEvent(y2023, ID.C2).cost_eur).toBe("1000");
  });
});

describe("atlas tax over the golden ledger, 2027", () => {
  const golden = () =>
    tax(2027, { lines: lines("synthetic-v1.jsonl"), instant: "2029-03-01T10:00:00.000Z" });

  it("lists what the repurchase rule defers, with its window and the purchases that caused it", async () => {
    const { wash_sale } = await golden();
    const world = wash_sale.deferred.find((d) => d.event_id === "01MBP2GS80T8F1MS8PT0M7FK2R");
    expect(world).toMatchObject({
      amount_eur_rounded: "-90.82",
      units: "8.7975",
      sold: "8.7975",
      window: "1y",
      window_start: "2026-01-06",
      window_end: "2028-01-06",
    });
    expect(world?.acquisitions.map((a) => [a.event_id, a.units])).toEqual([
      ["01MBEBAM80K3CE5XK9JN91KKCC", "4.9233"],
      ["01ME3AEB80NNJANWN0AFEQT9NM", "3.8742"],
    ]);
    const delta = wash_sale.deferred.find((d) => d.event_id === "01N4F4Y58036KX1852YTTM0XD3");
    expect(delta).toMatchObject({ amount_eur_rounded: "-224.75", units: "25", window: "2m" });
  });

  it("lists the losses released in the year (none) and the deferred ones still pending, lot by lot", async () => {
    const { wash_sale } = await golden();
    expect(wash_sale.released).toEqual([]);
    const pending = wash_sale.pending.map((p) => [p.origin_event_id, p.lot_id, p.asset_id]);
    expect(pending).toContainEqual([
      "01MBP2GS80T8F1MS8PT0M7FK2R",
      "01MBEBAM80K3CE5XK9JN91KKCC#0",
      "ast_world",
    ]);
    expect(pending).toContainEqual([
      "01N4F4Y58036KX1852YTTM0XD3",
      "01N7P4TX80S2D9FXZN82KE9Z3A#0",
      "ast_delta",
    ]);
    expect(
      wash_sale.pending.find((p) => p.lot_id === "01N7P4TX80S2D9FXZN82KE9Z3A#0")?.amount_eur,
    ).toBe("-224.75");
  });

  it("separates the dividends, the transmissions of art. 25.2 and the expenses of art. 26.1.a", async () => {
    const { movable_capital: capital } = await golden();
    expect(capital.dividends.map((d) => d.event_id)).toContain("01N94FZW78EQA3J41K0795WXF9");
    expect(capital.transmissions.map((t) => t.corporate_action_kind)).toContain("reverse_split");
    expect(capital.expenses).toEqual([]);
    expect(capital.balance_eur).toBe("0.41");
  });

  it("carries no declared return when none was filed", async () => {
    expect((await golden()).filing).toBeUndefined();
  });

  it("marks what is provisional while a window is still open, and not once they are all closed", async () => {
    const open = await tax(2027, {
      lines: lines("synthetic-v1.jsonl"),
      instant: "2027-12-15T10:00:00.000Z",
    });
    const provisional = (report: Report) =>
      report.capital_gains.lines.filter((line) => line.provisional_until !== undefined);
    expect(provisional(open).length).toBeGreaterThan(0);
    expect(provisional(await golden())).toEqual([]);
  });
});

describe("atlas tax with a return filed", () => {
  /** A loss of 2.000,00 in 2027, which carries into 2028. */
  const filed = async () => {
    const b = new Events();
    b.settings(CLI_SETTINGS);
    b.account("acc_ib", "IE");
    b.asset("etf_a", "etf");
    b.deposit("acc_ib", "2027-01-04", "60000");
    b.buy("acc_ib", "etf_a", "2027-01-05", "500", "100");
    b.sell("acc_ib", "etf_a", "2027-09-01", "100", "80");
    const h = harness({ events: b.build(), instant: "2028-06-10T10:00:00.000Z", confirm: true });
    expect(
      await h.exec(["filed", "renta", "2027", "--receipt", "100-2027-ABCDEFGHIJKL", "--yes"]),
    ).toBe(0);
    h.reset();
    return h;
  };

  it("carries what was declared next to what the ledger says today", async () => {
    const h = await filed();
    expect(await h.exec(["tax", "2027"])).toBe(0);
    const json = JSON.stringify(JSON.parse(h.text()).filing);
    expect(json).toContain("100-2027-ABCDEFGHIJKL");
    expect(json).toContain("2028-06-10");
    expect(json).toContain("-2000");
  });

  it("anchors the carry-forward of the next year in what was declared", async () => {
    const h = await filed();
    expect(await h.exec(["tax", "2028"])).toBe(0);
    const { anchors } = JSON.parse(h.text()) as Report;
    expect(anchors).toHaveLength(1);
    expect(anchors[0]).toMatchObject({
      year: 2027,
      computed: [{ amount_eur: "-2000", category: "capital_gain" }],
      declared: [{ amount_eur: "-2000", category: "capital_gain" }],
    });
  });
});

describe("atlas tax with foreign currency", () => {
  it("carries the exchange differences of the currency disposed of, and the lots it consumed", async () => {
    const h = harness({ events: seed(), instant: "2028-02-01T10:00:00.000Z" });
    expect(await h.exec(BUY_GOLD)).toBe(0);
    expect(await h.exec(SELL_GOLD)).toBe(0);
    h.reset();
    expect(await h.exec(["tax", "2026"])).toBe(0);
    const [line] = (JSON.parse(h.text()) as Report).capital_gains.currency_lines;
    expect(line).toMatchObject({
      kind: "cover",
      amount: "419",
      proceeds_eur: "386.1751152074",
      cost_eur: "386.0973238068",
      gain_eur_rounded: "0.08",
    });
    expect(line?.lots).toEqual([
      expect.objectContaining({
        acquisition_date: "2026-12-30",
        amount: "419",
        cost_eur: "386.1751152074",
      }),
    ]);
  });
});
