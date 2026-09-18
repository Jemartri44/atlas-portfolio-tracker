// The swap (ADR-0021): one disposal and one acquisition in the same fact,
// valued by article 37.1.h LIRPF — **the greater** of the market value of what
// is handed over and of what is received.
//
// The two things these tests exist to stop:
//   1. somebody "simplifying" the valuation into "use what was received";
//   2. somebody turning a swap into a transfer, which would keep the antiquity
//      and the cost and declare nothing — trap 1 of `CLAUDE.md`, with the whole
//      gain of the exchange omitted in silence.

import { describe, expect, it } from "vitest";
import { ProjectionError } from "../../src/errors.js";
import { cashBalances } from "../../src/projections/cash.js";
import { integrity } from "../../src/projections/integrity.js";
import { fiscalLots } from "../../src/projections/lots.js";
import { swapValuation } from "../../src/projections/operations.js";
import { positionOf } from "../../src/projections/positions.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import type { LedgerState } from "../../src/projections/state.js";
import type { SwapEvent } from "../../src/schema/events.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

/** Catalogue plus two crypto assets in the core: the case the event was written for. */
const withCrypto = (setup: (b: LedgerBuilder) => void): LedgerState => {
  const b = new LedgerBuilder();
  catalogue(b);
  b.asset("ast_btc", { asset_type: "crypto", asset_class: "crypto", transferable: false });
  b.asset("ast_eth", { asset_type: "crypto", asset_class: "crypto", transferable: false });
  setup(b);
  return projectLedger(b.build());
};

/** Ten units of BTC at 100 each: cost 1000, acquired 2027-01-11. */
const tenBtc = (b: LedgerBuilder): void => {
  b.deposit({ account_id: "acc_fund", amount: "5000" });
  b.buy({ account_id: "acc_fund", asset_id: "ast_btc" });
};

const open = (state: LedgerState, assetId: string) =>
  fiscalLots(state, assetId).filter((lot) => !lot.closed);
const q = (state: LedgerState, account: string, asset: string): string =>
  positionOf(state, account, asset).toString();
const codes = (state: LedgerState): string[] => state.warnings.map((warning) => warning.code);

const sampleSwap = (overrides: Partial<SwapEvent> = {}): SwapEvent =>
  ({
    type: "swap",
    market_value_out: "100",
    market_value_in: "100",
    currency: "EUR",
    ...overrides,
  }) as SwapEvent;

describe("swapValuation: article 37.1.h LIRPF", () => {
  it("takes what was handed over when it is worth more", () => {
    const value = swapValuation(sampleSwap({ market_value_out: "220", market_value_in: "200" }));
    expect(value.amount.toString()).toBe("220");
  });

  it("takes what was received when it is worth more", () => {
    const value = swapValuation(sampleSwap({ market_value_out: "200", market_value_in: "225" }));
    expect(value.amount.toString()).toBe("225");
  });

  it("gives the same answer when the two are equal", () => {
    const value = swapValuation(sampleSwap({ market_value_out: "210", market_value_in: "210" }));
    expect(value.amount.toString()).toBe("210");
  });

  it("is symmetric: swapping the two arguments cannot change the answer", () => {
    for (const [out, received] of [
      ["220", "200"],
      ["200", "225"],
      ["210", "210"],
      ["0", "5"],
    ] as const) {
      const one = swapValuation(sampleSwap({ market_value_out: out, market_value_in: received }));
      const other = swapValuation(sampleSwap({ market_value_out: received, market_value_in: out }));
      expect(one.amount.toString()).toBe(other.amount.toString());
    }
  });
});

describe("applySwap: the disposal and the acquisition", () => {
  it("consumes FIFO lots of what is handed over and books the gain on the greater value", () => {
    const state = withCrypto((b) => {
      tenBtc(b);
      b.swap({
        account_id: "acc_fund",
        from_asset_id: "ast_btc",
        to_asset_id: "ast_eth",
        quantity_out: "4",
        market_value_out: "500",
        quantity_in: "20",
        market_value_in: "520",
      });
    });
    // 4 units of a lot that cost 100 each: cost 400. Value 520, the greater of
    // the two, so the gain is 120 — not the 100 the handed-over side would give.
    const [gain] = state.gains;
    expect(gain?.asset_id).toBe("ast_btc");
    expect(gain?.quantity.toString()).toBe("4");
    expect(gain?.proceeds_eur.amount.toString()).toBe("520");
    expect(gain?.cost_eur.amount.toString()).toBe("400");
    expect(gain?.gain_eur_rounded.amount.toString()).toBe("120");
    expect(q(state, "acc_fund", "ast_btc")).toBe("6");
    expect(q(state, "acc_fund", "ast_eth")).toBe("20");
    expect(integrity(state)).toEqual([]);
  });

  /** The one that must never be "fixed" into a transfer. */
  it("opens the new lot on the day of the swap, inheriting no date and no cost", () => {
    const state = withCrypto((b) => {
      tenBtc(b);
      b.swap({
        account_id: "acc_fund",
        from_asset_id: "ast_btc",
        to_asset_id: "ast_eth",
        value_date: "2028-05-04",
        quantity_out: "4",
        market_value_out: "500",
        quantity_in: "20",
        market_value_in: "520",
      });
    });
    const [lot] = open(state, "ast_eth");
    // Not 2027-01-11, which is when the BTC was bought, and not 400, which is
    // what it cost: a swap is neither a transfer nor a covered exchange.
    expect(lot?.acquisition_date).toBe("2028-05-04");
    expect(lot?.cost_eur.amount.toString()).toBe("520");
    expect(lot?.quantity.toString()).toBe("20");
    expect(lot?.source_lot_id).toBeUndefined();
  });

  it("subtracts the fee from the disposal, leaves the cost whole and moves only that cash", () => {
    const state = withCrypto((b) => {
      tenBtc(b);
      b.swap({
        account_id: "acc_fund",
        from_asset_id: "ast_btc",
        to_asset_id: "ast_eth",
        quantity_out: "4",
        market_value_out: "500",
        quantity_in: "20",
        market_value_in: "520",
        fee: "12",
      });
    });
    const [gain] = state.gains;
    // Proceeds 520 − 12 = 508; cost of what is received still 520, because the
    // same fee counted on both legs would be counted twice.
    expect(gain?.proceeds_eur.amount.toString()).toBe("508");
    expect(open(state, "ast_eth")[0]?.cost_eur.amount.toString()).toBe("520");
    // 5000 deposited − 1000 bought − 12 of fee. A swap moves no other cash.
    expect(
      cashBalances(state).map((c) => `${c.account_id}|${c.currency}=${c.balance.amount}`),
    ).toEqual(["acc_fund|EUR=3988"]);
  });

  it("converts both legs with the ECB rate as published", () => {
    const state = withCrypto((b) => {
      tenBtc(b);
      b.swap({
        account_id: "acc_fund",
        from_asset_id: "ast_btc",
        to_asset_id: "ast_eth",
        quantity_out: "4",
        market_value_out: "500",
        quantity_in: "20",
        market_value_in: "550",
        currency: "USD",
        fx_rate: "1.1",
      });
    });
    // 550 USD / 1.1 = 500 EUR, both for the disposal and for the new lot.
    expect(state.gains[0]?.proceeds_eur.amount.toString()).toBe("500");
    expect(open(state, "ast_eth")[0]?.cost_eur.amount.toString()).toBe("500");
  });
});

describe("applySwap: what it refuses", () => {
  const swapping = (setup: (b: LedgerBuilder) => void): (() => LedgerState) => {
    return () => withCrypto(setup);
  };

  it("refuses a quantity the account does not hold", () => {
    expect(
      swapping((b) => {
        tenBtc(b);
        b.swap({
          account_id: "acc_fund",
          from_asset_id: "ast_btc",
          to_asset_id: "ast_eth",
          quantity_out: "40",
        });
      }),
    ).toThrow(expect.objectContaining({ code: "insufficient_position" }));
  });

  it("refuses to cross books", () => {
    expect(
      swapping((b) => {
        tenBtc(b);
        b.thesisOpened({ thesis_id: "th_1", asset_id: "ast_eth", account_id: "acc_bucket" });
        b.swap({
          account_id: "acc_fund",
          from_asset_id: "ast_btc",
          to_asset_id: "ast_spec",
          thesis_id: "th_1",
        });
      }),
    ).toThrow(ProjectionError);
  });

  it("refuses a swap in the bucket without an open thesis for what is received (rule 15)", () => {
    expect(
      swapping((b) => {
        b.deposit({ account_id: "acc_bucket", amount: "5000" });
        b.thesisOpened({ thesis_id: "th_1" });
        b.buy({ account_id: "acc_bucket", asset_id: "ast_spec", thesis_id: "th_1" });
        b.asset("ast_spec2", {
          asset_type: "stock",
          book: "bucket",
          currency: "USD",
          transferable: false,
        });
        b.swap({
          account_id: "acc_bucket",
          from_asset_id: "ast_spec",
          to_asset_id: "ast_spec2",
        });
      }),
    ).toThrow(expect.objectContaining({ code: "thesis_required" }));
  });

  it("refuses a thesis on a core account", () => {
    expect(
      swapping((b) => {
        tenBtc(b);
        b.swap({
          account_id: "acc_fund",
          from_asset_id: "ast_btc",
          to_asset_id: "ast_eth",
          thesis_id: "th_1",
        });
      }),
    ).toThrow(expect.objectContaining({ code: "thesis_not_allowed" }));
  });

  it("links the received position to its thesis in the bucket", () => {
    const state = withCrypto((b) => {
      b.deposit({ account_id: "acc_bucket", amount: "5000" });
      b.thesisOpened({ thesis_id: "th_1" });
      b.buy({ account_id: "acc_bucket", asset_id: "ast_spec", thesis_id: "th_1" });
      b.asset("ast_spec2", {
        asset_type: "stock",
        book: "bucket",
        currency: "USD",
        transferable: false,
      });
      b.thesisOpened({ thesis_id: "th_2", asset_id: "ast_spec2" });
      b.swap({
        account_id: "acc_bucket",
        from_asset_id: "ast_spec",
        to_asset_id: "ast_spec2",
        thesis_id: "th_2",
      });
    });
    expect(state.theses.get("th_2")?.buys.map((leg) => leg.event_id)).toHaveLength(1);
  });
});

describe("applySwap: the fiscal dates of the two legs", () => {
  it("warns when the two legs are dated by different rules", () => {
    const state = withCrypto((b) => {
      b.deposit({ account_id: "acc_fund", amount: "5000" });
      // A fund is dated by value date and crypto by trade date (ADR-0013), so a
      // swap whose two dates differ lands the legs on different days.
      b.buy({ account_id: "acc_fund", asset_id: "ast_world" });
      b.swap({
        account_id: "acc_fund",
        from_asset_id: "ast_world",
        to_asset_id: "ast_btc",
        trade_date: "2027-06-08",
        value_date: "2027-06-10",
      });
    });
    expect(codes(state)).toContain("swap_fiscal_dates_differ");
    // The lot received is born on the trade date, which is what crypto uses;
    // the disposal is dated by the value date, which is what a fund uses.
    expect(open(state, "ast_btc")[0]?.acquisition_date).toBe("2027-06-08");
    expect(state.gains[0]?.fiscal_date).toBe("2027-06-10");
  });

  it("says nothing when both legs are dated the same way", () => {
    const state = withCrypto((b) => {
      tenBtc(b);
      b.swap({
        account_id: "acc_fund",
        from_asset_id: "ast_btc",
        to_asset_id: "ast_eth",
        trade_date: "2027-06-08",
        value_date: "2027-06-10",
      });
    });
    expect(codes(state)).not.toContain("swap_fiscal_dates_differ");
  });
});

describe("applySwap: a swap whose asset the catalogue does not know", () => {
  it("is collected as invalid and orders itself by its value date meanwhile", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.asset("ast_eth", { asset_type: "crypto", asset_class: "crypto", transferable: false });
    b.swap({
      account_id: "acc_fund",
      from_asset_id: "ast_ghost",
      to_asset_id: "ast_eth",
      value_date: "2027-06-10",
    });
    const state = projectLedger(b.build(), { collectErrors: true });
    expect(state.invalid.map((entry) => entry.error.code)).toEqual(["unknown_asset"]);
  });
});
