// The cases of the third audit whose point is not only the base: the line by
// line working of the wash-sale rule, the double taxation deduction, the
// operations the ledger must refuse and the Modelo 720. Worked out by hand
// before the engine's output was read; see `hand-computed.test.ts` for the
// conventions.

import { describe, expect, it } from "vitest";
import { ProjectionError } from "../../../src/errors.js";
import { model720 } from "../../../src/informative/m720.js";
import { recordEvent } from "../../../src/usecases/record-event.js";
import { TestStore } from "../../memory-store.js";
import { testDeps } from "../../usecases/helpers.js";
import * as cases from "./cases.js";
import { ledgerOf, TODAY } from "./short-form.js";
import { boxesOf, cents, deferredAtYearEnd, reportOf } from "./support.js";

const linesOf = (report: ReturnType<typeof reportOf>) =>
  report.capital_gains.lines.map((line) => ({
    date: line.fiscal_date,
    own: cents(line.own_eur),
    released: cents(line.released_eur),
    deferred: cents(line.deferred_eur),
    computable: cents(line.computable_eur),
  }));

describe("the wash-sale rule, line by line", () => {
  // C08. Sale 14/03/2025: -400; the purchase of 14/05 (10, the last day of the
  // two months) defers 10/20 x 400 = 200, so -200 computes. The sale of
  // 01/10 is +80 and releases the -200 its lot carried: -120. Total -320.
  it("C08: defers on the last day of the window, releases on the sale of that lot", () => {
    expect(linesOf(reportOf(cases.c08, 2025))).toEqual([
      {
        date: "2025-03-14",
        own: "-400.00",
        released: "0.00",
        deferred: "-200.00",
        computable: "-200.00",
      },
      {
        date: "2025-10-01",
        own: "80.00",
        released: "-200.00",
        deferred: "0.00",
        computable: "-120.00",
      },
    ]);
  });

  // C20. Monthly contributions to a fund with a sale at a loss in the middle.
  // Lots: 10/01 10 x 100; 10/02 10 x 90; 10/03 10 x 80; (sale 20/03); 10/04
  // 10 x 85. Sale 20/03/2025 of 15 x 82 = 1.230; FIFO 10 (1.000) + 5 of
  // February (450) = 1.450: -220. Window 20/01 to 20/05: after the sale and
  // inside the window remain 5 of February, 10 of March and 10 of April
  // (25 >= 15): the whole loss is deferred (art. 33.5.f LIRPF).
  // Sale 20/11/2025 of 10 x 95 = 950; FIFO 5 of February (450) + 5 of March
  // (400) = 850: +100. Final sale (no purchases in its window): it releases
  // what those units carry.
  //
  // WHICH UNITS CARRY THE DEFERRED LOSS? The law does not say, and there are
  // two readings:
  //  - the auditor's, the OLDEST: 5 of February (-73,33) and 10 of March
  //    (-146,67). The sale releases -73,33 - 73,33 = -146,67 and gives -46,67:
  //    GP 2025 -46,67, base 0, 73,33 still deferred at 31/12.
  //  - Atlas's, the CLOSEST to the sale (data-schema.md 8.4): 10 of March
  //    (-146,67) and 5 of April (-73,33). The 5 of February carry nothing, so
  //    the sale releases only the -73,33 of the March units: +26,67.
  //    GP 2025 +26,67, base 26,67, 146,67 still deferred at 31/12.
  // This test PINS WHAT ATLAS GIVES. The other reading (-46,67) is a criterion
  // of its own (#19b) that is measured elsewhere and is not implemented here.
  // Only the year changes, not the total.
  it("C20: pins Atlas's reading, the loss carried by the units closest to the sale", () => {
    const report = reportOf(cases.c20, 2025);
    expect(linesOf(report)).toEqual([
      {
        date: "2025-03-20",
        own: "-220.00",
        released: "0.00",
        deferred: "-220.00",
        computable: "0.00",
      },
      {
        date: "2025-11-20",
        own: "100.00",
        released: "-73.33",
        deferred: "0.00",
        computable: "26.67",
      },
    ]);
    expect(cents(report.capital_gains.balance_eur)).toBe("26.67");
    expect(cents(report.base_eur)).toBe("26.67");
    expect(report.compensation.pending).toEqual([]);
    expect(deferredAtYearEnd(report)).toBe("-146.67");
  });

  // Row 1 (the loss): 220 with 73,33 imputable (220 - 146,67 still deferred);
  // row 2 (the gain): 100. Box 0603: 19 withheld on the redemption.
  it("C20: the boxes that follow from Atlas's reading", () => {
    const { at } = boxesOf(cases.c20, 2025);
    const found = Object.fromEntries(
      [
        "0321@2025-03-20",
        "0322@2025-03-20",
        "0316@2025-11-20",
        "0325",
        "0423",
        "0424",
        "0460",
        "0603",
      ].map((key) => [key, at(key)]),
    );
    expect(found).toEqual({
      "0321@2025-03-20": "220.00",
      "0322@2025-03-20": "73.33",
      "0316@2025-11-20": "100.00",
      "0325": "73.33",
      "0423": "73.33",
      "0424": "26.67",
      "0460": "26.67",
      "0603": "19.00",
    });
  });
});

describe("C06 share in USD: dividend with the 15 % withheld, conversion at a loss", () => {
  // 10/01: 2.000 EUR -> 2.100 USD (1,05), a lot of 2.100 USD at 2.000 EUR.
  // 13/01: buy 20 x 100 USD + 1 USD fee, paid with those dollars. Per criterion
  // #4 (V1740-17) investing the currency in a security in the same currency
  // does not transmit it: the share is computed first in the currency and the
  // dollars invested stay in the lot. (Adding +18,33 at the purchase, by
  // reading "when paying with it" as "when investing it", is the mistake the
  // auditor made first.)
  // 12/06: dividend 30 USD, 4,50 withheld (15 %), rate 1,15: gross 26,09, tax
  // withheld 3,91. 25,50 USD enter at 22,17 EUR.
  // 14/11: 124,50 USD converted at 1,16 = 107,33. FIFO cost: 99 USD of 2.100
  // (94,29) + 25,50 USD (22,17) = 116,46. Loss -9,13 (arts. 14.2.e and 33 LIRPF).
  // Art. 49: GP -9,13 against RCM 26,09, limited to 25 % = 6,52. Base
  // 26,09 - 6,52 = 19,57; 2,61 remain from 2025.
  it("integrates the loss against the dividend within the 25 % limit", () => {
    const report = reportOf(cases.c06, 2025);
    expect(cents(report.base_eur)).toBe("19.57");
    expect(cents(report.movable_capital.balance_eur)).toBe("26.09");
    expect(
      report.capital_gains.currency_lines.map((l) => [l.kind, cents(l.computable_eur)]),
    ).toEqual([["conversion", "-9.13"]]);
    expect(report.compensation.pending.map((p) => cents(p.amount_eur))).toEqual(["-2.61"]);
    const { at } = boxesOf(cases.c06, 2025);
    expect({
      dividend: at("0029"),
      offset: at("0446"),
      base: at("0460"),
      pending: at("1270#2025"),
      sold: at("1633@USD"),
      cost: at("1637@USD"),
      loss: at("1638@USD"),
    }).toEqual({
      dividend: "26.09",
      offset: "6.52",
      base: "19.57",
      pending: "2.61",
      sold: "107.33",
      cost: "116.46",
      loss: "9.13",
    });
  });

  // Double taxation (art. 80 LIRPF and the treaty, 15 %): first limit 15 % x
  // 26,09 = 3,91; withheld 3,91. The second limit (average rate x income) is
  // not computable from this case alone, so box 0588 is left without a figure.
  it("computes the treaty limit and leaves the second limit open", () => {
    const report = reportOf(cases.c06, 2025);
    const [line] = report.double_taxation.lines;
    expect([
      cents(report.double_taxation.deductible_eur),
      cents(line?.foreign_tax_eur as never),
    ]).toEqual(["3.91", "3.91"]);
    expect(cents(line?.deductible_eur as never)).toBe("3.91");
    expect(boxesOf(cases.c06, 2025).at("0588")).toBeUndefined();
  });

  // The loss of currency is provisional until 14/11/2026 (art. 33.5.e: buying
  // dollars again within the year after, it does not compute).
  it("marks the loss of currency as provisional until a year after", () => {
    const [line] = reportOf(cases.c06, 2025).capital_gains.currency_lines;
    expect(line?.provisional_until).toBe("2026-11-14");
  });
});

describe("what the ledger must refuse", () => {
  const refused = async (c: typeof cases.c04b, draft: Record<string, unknown>) => {
    const store = new TestStore(ledgerOf(c));
    const before = (await store.load()).events.length;
    const error = await recordEvent(testDeps(store), draft as never).catch((e: unknown) => e);
    expect((await store.load()).events.length).toBe(before);
    return error;
  };

  // C04b. The same change of fund as a transfer: only Spanish funds and EU
  // UCITS registered with the CNMV and sold in Spain transfer (art. 94.1.a.2
  // and 94.2.a LIRPF).
  it("C04b: a transfer from a fund that does not transfer", async () => {
    const error = await refused(cases.c04b, cases.c04bTransfer);
    expect(error).toBeInstanceOf(ProjectionError);
    expect((error as ProjectionError).code).toBe("not_transferable");
  });

  // C14b. Art. 25.1.e LIRPF lowers the cost only for shares on EU regulated
  // markets; a NYSE share does not qualify.
  it("C14b: a return of capital of a NYSE share", async () => {
    const error = await refused(cases.c14b, cases.c14bReturn);
    expect(error).toBeInstanceOf(ProjectionError);
    expect((error as ProjectionError).code).toBe("capital_return_needs_eu_listed");
  });
});

describe("Modelo 720", () => {
  const categoryOf = (c: typeof cases.c15, name: string) =>
    model720(ledgerOf(c), 2025, { today: TODAY }).categories.find(
      (entry) => entry.category === name,
    );

  // C15. IBKR (Ireland): ETF worth 600 x 90 = 54.000 EUR at 31/12/2025, above
  // 50.000: obliged (art. 42 ter RGAT). IBKR accounts: 1.500 EUR at 31/12 and on
  // average in the fourth quarter: not obliged (art. 42 bis). MyInvestor (Spain,
  // omnibus account): left out.
  it("C15: securities above the threshold oblige, accounts below it do not", () => {
    const report = model720(ledgerOf(cases.c15), 2025, { today: TODAY });
    const securities = report.categories.find((entry) => entry.category === "securities");
    const accounts = report.categories.find((entry) => entry.category === "accounts");
    expect([securities?.verdict, cents(securities?.value_eur as never)]).toEqual([
      "obliged",
      "54000.00",
    ]);
    expect([
      accounts?.verdict,
      cents(accounts?.value_eur as never),
      cents(accounts?.q4_average_eur as never),
    ]).toEqual(["not_obliged", "1500.00", "1500.00"]);
    expect(report.excluded).toEqual([{ account_id: "acc_mi", reason: "domestic_account" }]);
  });

  // C15b. Without a valuation at 31/12 and with dollars at IBKR the engine must
  // say it cannot tell, never "not obliged".
  it("C15b: without a valuation it cannot decide", () => {
    const report = model720(ledgerOf(cases.c15b), 2025, { today: TODAY });
    expect(report.categories.map((entry) => [entry.category, entry.verdict])).toEqual([
      ["accounts", "undetermined"],
      ["securities", "undetermined"],
    ]);
    expect(categoryOf(cases.c15b, "securities")?.missing).toEqual([
      { account_id: "acc_ibkr", asset_id: "ast_w", flag: "price_missing" },
    ]);
  });
});
