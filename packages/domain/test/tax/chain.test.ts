import { describe, expect, it } from "vitest";
import { type ChainCore, chainFigures, taxChain } from "../../src/tax/chain.js";
import type { AnchorDifference, TaxYearReport } from "../../src/tax/report.js";
import { taxYear } from "../../src/tax/year.js";
import type { LedgerBuilder } from "../ledger-builder.js";
import { buy, HAND_SETTINGS, sell, taxBuilder, text } from "./helpers.js";

/** The last substitution the chain applied, which is what these cases look at. */
const lastAnchor = (report: TaxYearReport): AnchorDifference | undefined =>
  report.anchors[report.anchors.length - 1];

const TODAY = "2035-01-01";

/** The return of 2025, declaring −100 of 2022 and −400 of 2023 still pending. */
const fileReturnOf2025 = (b: LedgerBuilder) =>
  b.filed({
    tax_year: 2025,
    filed_at: "2026-06-18",
    declared: {
      savings_base_eur: "0",
      pending_losses: [
        { origin_year: 2022, category: "capital_gain", amount_eur: "-100" },
        { origin_year: 2023, category: "capital_gain", amount_eur: "-400" },
      ],
      deferred_losses_eur: "0",
    },
  });

/** A gain of 300,00 in 2026 and nothing else: the ledger starts that year. */
const ledgerFrom2026 = (filed = true) => {
  const b = taxBuilder();
  buy(b, "stock_s", "2026-01-11", "10", "100");
  sell(b, "stock_s", "2026-06-01", "10", "130");
  if (filed) {
    fileReturnOf2025(b);
  }
  return b.build();
};

describe("where the chain of years starts (P5)", () => {
  it("a return filed for 2025 anchors a ledger that starts in 2026: its losses offset and then expire", () => {
    const events = ledgerFrom2026();
    const y2026 = taxYear(events, 2026, { today: TODAY });
    // 300 of gains against the declared pending, oldest first (#22): all 100
    // of 2022 and 200 of the 400 of 2023.
    expect(text(y2026.base_eur)).toBe("0");
    expect(
      y2026.compensation.steps.map((s) => [s.phase, s.origin_year, text(s.amount_eur)]),
    ).toEqual([
      [2, 2022, "100"],
      [2, 2023, "200"],
    ]);
    expect(
      y2026.compensation.pending.map((p) => [p.origin_year, text(p.amount_eur), p.expires_after]),
    ).toEqual([[2023, "-200", 2027]]);

    // 2027 has no figures: what is left of 2023 reaches its fourth year and
    // expires, said out loud.
    const y2027 = taxYear(events, 2027, { today: TODAY });
    expect(y2027.compensation.expired.map((p) => [p.origin_year, text(p.amount_eur)])).toEqual([
      [2023, "-200"],
    ]);
    expect(y2027.notes.find((n) => n.code === "tax_loss_expires")?.details).toEqual({
      origin_year: 2023,
      category: "capital_gain",
      amount_eur: "-200",
    });
    expect(y2027.compensation.pending).toEqual([]);
  });

  it("the anchor of a year the ledger does not reach is what was brought in, not a difference", () => {
    const y2025 = taxYear(ledgerFrom2026(), 2025, { today: TODAY });
    expect(lastAnchor(y2025)?.before_ledger).toBe(true);
    expect(lastAnchor(y2025)?.computed).toEqual([]);
    expect(lastAnchor(y2025)?.declared.map((p) => [p.origin_year, text(p.amount_eur)])).toEqual([
      [2022, "-100"],
      [2023, "-400"],
    ]);
    // An empty ledger and a filed return: the anchor still precedes it.
    const onlyTheReturn = taxBuilder();
    fileReturnOf2025(onlyTheReturn);
    expect(lastAnchor(taxYear(onlyTheReturn.build(), 2025, { today: TODAY }))?.before_ledger).toBe(
      true,
    );
  });

  it("without the filed return the same ledger forgets those losses: the proof is not empty", () => {
    expect(text(taxYear(ledgerFrom2026(false), 2026, { today: TODAY }).base_eur)).toBe("300");
    expect(taxYear(ledgerFrom2026(false), 2027, { today: TODAY }).compensation.expired).toEqual([]);
  });

  it("anchors on each filed year of the chain, oldest first", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2026-01-11", "10", "100");
    sell(b, "stock_s", "2026-06-01", "10", "130");
    fileReturnOf2025(b);
    // A second return, of 2026, declaring what the ledger itself computes:
    // −200 of 2023 still pending after offsetting the 300 of gains.
    b.filed({
      tax_year: 2026,
      filed_at: "2027-06-18",
      declared: {
        savings_base_eur: "0",
        pending_losses: [{ origin_year: 2023, category: "capital_gain", amount_eur: "-200" }],
        deferred_losses_eur: "0",
      },
    });
    const report = taxYear(b.build(), 2027, { today: TODAY });
    // The anchor reported is the last one walked, and what expires in 2027 is
    // what the return of 2026 declared.
    expect(lastAnchor(report)?.year).toBe(2026);
    expect(report.compensation.expired.map((p) => [p.origin_year, text(p.amount_eur)])).toEqual([
      [2023, "-200"],
    ]);
  });

  it("does not anchor on a return filed after the day asked", () => {
    const events = ledgerFrom2026();
    // The day before it was filed, the return does not exist yet (ADR-0016).
    expect(text(taxYear(events, 2026, { today: "2026-06-17" }).base_eur)).toBe("300");
    expect(text(taxYear(events, 2026, { today: "2026-06-18" }).base_eur)).toBe("0");
  });
});

describe("the figures of a year, on a chain built for another one", () => {
  /**
   * A loss of 2027 deferred by a repurchase inside its window, released by the
   * sale of 2028. At 31/12/2027 the rule holds −200,00 deferred; at 31/12/2028
   * it holds nothing.
   *
   * `chainFigures(chain, year)` used to take the deferred figure from the
   * cutoff of the year the **chain** was built for, so asking a chain of 2028
   * for the figures of 2027 answered 0,00 where the return of 2027 declares
   * −200,00. Two of the three figures came out by year and the third did not,
   * on the three figures an income tax return declares.
   */
  const deferredAndReleased = () => {
    const b = taxBuilder(HAND_SETTINGS);
    buy(b, "stock_s", "2027-01-10", "10", "100");
    // −200,00, and the buy of July falls inside the two-month window.
    sell(b, "stock_s", "2027-06-01", "10", "80");
    buy(b, "stock_s", "2027-07-01", "10", "80");
    sell(b, "stock_s", "2028-06-01", "10", "90");
    return b.build();
  };

  const deferredOf = (year: number, chainFor: number): string =>
    text(
      chainFigures(
        taxChain(deferredAndReleased(), chainFor, { today: TODAY }) as ChainCore,
        year,
      ).get("deferred"),
    );

  it("answers with the deferred loss of the year asked, not of the year the chain was built for", () => {
    expect(deferredOf(2027, 2027)).toBe("-200");
    expect(deferredOf(2028, 2028)).toBe("0");
    // The one that used to answer 0,00.
    expect(deferredOf(2027, 2028)).toBe("-200");
  });

  it("keeps what the whole ledger leaves for every year after the last one it walks", () => {
    expect(deferredOf(2029, 2029)).toBe("0");
    const b = taxBuilder(HAND_SETTINGS);
    buy(b, "stock_s", "2027-01-10", "10", "100");
    sell(b, "stock_s", "2027-06-01", "10", "80");
    buy(b, "stock_s", "2027-07-01", "10", "80");
    const stillDeferred = b.build();
    const figures = (year: number) =>
      text(
        chainFigures(taxChain(stillDeferred, year, { today: TODAY }) as ChainCore, year).get(
          "deferred",
        ),
      );
    expect(figures(2027)).toBe("-200");
    expect(figures(2030)).toBe("-200");
  });

  it("has nothing deferred in a year the ledger does not reach yet", () => {
    const b = taxBuilder(HAND_SETTINGS);
    fileReturnOf2025(b);
    buy(b, "stock_s", "2027-01-10", "10", "100");
    sell(b, "stock_s", "2027-06-01", "10", "80");
    buy(b, "stock_s", "2027-07-01", "10", "80");
    const chain = taxChain(b.build(), 2027, { today: TODAY }) as ChainCore;
    expect(text(chainFigures(chain, 2025).get("deferred"))).toBe("0");
    expect(text(chainFigures(chain, 2027).get("deferred"))).toBe("-200");
  });
});
