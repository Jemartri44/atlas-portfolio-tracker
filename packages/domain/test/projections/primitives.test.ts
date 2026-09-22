import { describe, expect, it } from "vitest";
import { ProjectionError } from "../../src/errors.js";
import { Decimal } from "../../src/money/decimal.js";
import { Money } from "../../src/money/money.js";
import { cashBalances } from "../../src/projections/cash.js";
import { integrity } from "../../src/projections/integrity.js";
import { fiscalLots, openQuantity } from "../../src/projections/lots.js";
import { positionOf } from "../../src/projections/positions.js";
import {
  applyCarveOut,
  applyConvert,
  applyForcedSale,
  applyGrant,
  applyScale,
  type EffectContext,
  type Resolved,
} from "../../src/projections/primitives.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import type { LedgerState } from "../../src/projections/state.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const EVENT = "01ARYZ6S41TSV4RRFFQ69G5FCA";
const ctx: EffectContext = {
  eventId: EVENT,
  position: 99,
  effectiveDate: "2027-03-01",
  scaleOnly: false,
};

/** Catalogue plus a second core stock and a fork coin; `setup` adds the operations. */
const stateWith = (setup: (b: LedgerBuilder) => void): LedgerState => {
  const b = new LedgerBuilder();
  catalogue(b);
  b.asset("ast_new", { asset_type: "stock", asset_class: "equity", transferable: false });
  b.asset("ast_fork", { asset_type: "crypto", asset_class: "crypto", transferable: false });
  setup(b);
  return projectLedger(b.build());
};

const tenShares = (b: LedgerBuilder) => {
  b.buy({ account_id: "acc_fund", asset_id: "ast_world", quantity: "10", unit_price: "100" });
};

const twoAccounts = (b: LedgerBuilder) => {
  b.buy({ account_id: "acc_fund", asset_id: "ast_world", quantity: "10", unit_price: "100" });
  b.buy({
    account_id: "acc_etf",
    asset_id: "ast_world",
    quantity: "7",
    unit_price: "110",
    value_date: "2027-02-10",
  });
};

const failure = (run: () => void): ProjectionError => {
  try {
    run();
  } catch (error) {
    if (error instanceof ProjectionError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected a ProjectionError");
};

const open = (state: LedgerState, asset: string) =>
  fiscalLots(state, asset).filter((lot) => !lot.closed);
const closed = (state: LedgerState, asset: string) =>
  fiscalLots(state, asset).filter((lot) => lot.closed);
const q = (state: LedgerState, account: string, asset: string): string =>
  positionOf(state, account, asset).toString();

const scale = (ratio: string, asset_id = "ast_world"): Resolved<"scale"> => ({
  op: "scale",
  ratio,
  asset_id,
});
const convert = (
  ratio: string,
  to_asset_id = "ast_new",
  asset_id = "ast_world",
): Resolved<"convert"> => ({
  op: "convert",
  ratio,
  to_asset_id,
  asset_id,
});
const carveOut = (
  ratio: string,
  cost_share: string,
  to_asset_id = "ast_new",
): Resolved<"carve_out"> => ({
  op: "carve_out",
  ratio,
  cost_share,
  to_asset_id,
  asset_id: "ast_world",
});
const sale = (
  per_account: Resolved<"forced_sale">["per_account"],
  overrides: Partial<Resolved<"forced_sale">> = {},
): Resolved<"forced_sale"> => ({
  op: "forced_sale",
  asset_id: "ast_world",
  per_account,
  unit_price: "120",
  currency: "EUR",
  fx_rate: "1",
  fx_rate_date: "2027-03-01",
  ...overrides,
});
const grant = (
  per_account: Resolved<"grant">["per_account"],
  overrides: Partial<Resolved<"grant">> = {},
): Resolved<"grant"> => ({
  op: "grant",
  asset_id: "ast_fork",
  per_account,
  unit_cost: "0",
  currency: "EUR",
  fx_rate: "1",
  fx_rate_date: "2027-03-01",
  acquisition_date: "2027-03-01",
  ...overrides,
});

describe("applyScale", () => {
  it("multiplies lot quantities and positions, keeping cost, date and id", () => {
    const state = stateWith(tenShares);
    const [before] = open(state, "ast_world");
    applyScale(state, scale("4"), ctx);
    const [lot] = open(state, "ast_world");
    expect(lot?.id).toBe(before?.id);
    expect(lot?.quantity.toString()).toBe("40");
    expect(lot?.original_quantity.toString()).toBe("10");
    expect(lot?.cost_eur.amount.toString()).toBe("1000");
    expect(lot?.acquisition_date).toBe("2027-01-11");
    expect(q(state, "acc_fund", "ast_world")).toBe("40");
    expect(state.gains).toEqual([]);
    expect(integrity(state)).toEqual([]);
  });

  it("gives the remainder of an inexact fraction to the last lot and the last account", () => {
    const state = stateWith(twoAccounts);
    applyScale(state, scale("1/3"), ctx);
    expect(open(state, "ast_world").map((lot) => lot.quantity.toString())).toEqual([
      "3.3333333333",
      "2.3333333334",
    ]);
    expect(q(state, "acc_fund", "ast_world")).toBe("3.3333333333");
    expect(q(state, "acc_etf", "ast_world")).toBe("2.3333333334");
    expect(openQuantity(state, "ast_world").toString()).toBe("5.6666666667");
    expect(integrity(state)).toEqual([]);
    applyScale(state, scale("3"), ctx);
    expect(openQuantity(state, "ast_world").toString()).toBe("17.0000000001");
  });

  it("scales 30 shares by 4/3 to exactly 40", () => {
    const state = stateWith((b) => {
      b.buy({ account_id: "acc_fund", asset_id: "ast_world", quantity: "30", unit_price: "10" });
    });
    applyScale(state, scale("4/3"), ctx);
    expect(q(state, "acc_fund", "ast_world")).toBe("40");
    expect(open(state, "ast_world")[0]?.quantity.toString()).toBe("40");
  });

  it("records only the ratio when an action that only scales finds nothing to scale", () => {
    const sold = stateWith((b) => {
      tenShares(b);
      b.sell({ account_id: "acc_fund", asset_id: "ast_world", quantity: "10" });
    });
    const journal = sold.lotJournal.length;
    applyScale(sold, scale("1/4"), { ...ctx, scaleOnly: true });
    expect(sold.lotJournal.slice(journal)).toEqual([
      { kind: "units", asset_id: "ast_world", event_id: EVENT, ratio: "1/4" },
    ]);
    expect(open(sold, "ast_world")).toEqual([]);
  });

  it("rejects an asset without open lots, whether never held or fully sold", () => {
    const never = stateWith(tenShares);
    expect(failure(() => applyScale(never, scale("2", "ast_bonds"), ctx)).code).toBe(
      "no_open_lots",
    );
    const sold = stateWith((b) => {
      tenShares(b);
      b.sell({ account_id: "acc_fund", asset_id: "ast_world", quantity: "10" });
    });
    expect(failure(() => applyScale(sold, scale("2"), ctx)).code).toBe("no_open_lots");
  });
});

describe("applyConvert", () => {
  it("closes the origin lots against the event and opens inheriting lots in the destination", () => {
    const state = stateWith(twoAccounts);
    const [first, second] = open(state, "ast_world");
    applyConvert(state, convert("1/2"), ctx);
    const gone = closed(state, "ast_world");
    expect(gone).toHaveLength(2);
    expect(gone[0]?.consumptions).toHaveLength(1);
    expect(gone[0]?.consumptions[0]?.event_id).toBe(EVENT);
    expect(gone[0]?.consumptions[0]?.quantity.toString()).toBe("10");
    expect(gone[0]?.consumptions[0]?.cost_eur.amount.toString()).toBe("1000");
    expect(gone[0]?.cost_eur.amount.toString()).toBe("0");
    expect(open(state, "ast_world")).toEqual([]);
    const lots = open(state, "ast_new");
    expect(lots.map((lot) => lot.id)).toEqual([`${EVENT}#0`, `${EVENT}#1`]);
    expect(lots.map((lot) => lot.quantity.toString())).toEqual(["5", "3.5"]);
    expect(lots.map((lot) => lot.cost_eur.amount.toString())).toEqual(["1000", "770"]);
    expect(lots.map((lot) => lot.acquisition_date)).toEqual(["2027-01-11", "2027-02-10"]);
    expect(lots.map((lot) => lot.source_lot_id)).toEqual([first?.id, second?.id]);
    expect(lots.map((lot) => lot.position)).toEqual([first?.position, second?.position]);
    expect(q(state, "acc_fund", "ast_world")).toBe("0");
    expect(q(state, "acc_etf", "ast_world")).toBe("0");
    expect(q(state, "acc_fund", "ast_new")).toBe("5");
    expect(q(state, "acc_etf", "ast_new")).toBe("3.5");
    expect(state.gains).toEqual([]);
    expect(state.warnings.map((w) => `${w.code}:${w.details.asset_id}`)).toEqual([
      "same_asset_two_accounts:ast_world",
      "same_asset_two_accounts:ast_new",
    ]);
    expect(integrity(state)).toEqual([]);
  });

  it("keeps the remainder rule for inexact fractions", () => {
    const state = stateWith(twoAccounts);
    applyConvert(state, convert("1/3"), ctx);
    expect(open(state, "ast_new").map((lot) => lot.quantity.toString())).toEqual([
      "3.3333333333",
      "2.3333333334",
    ]);
    expect(q(state, "acc_fund", "ast_new")).toBe("3.3333333333");
    expect(q(state, "acc_etf", "ast_new")).toBe("2.3333333334");
    expect(integrity(state)).toEqual([]);
  });

  it("rejects a missing, identical or cross-book destination, and an empty origin", () => {
    const state = stateWith(tenShares);
    expect(failure(() => applyConvert(state, convert("1", "ast_nope"), ctx)).code).toBe(
      "unknown_asset",
    );
    expect(failure(() => applyConvert(state, convert("1", "ast_world"), ctx)).code).toBe(
      "same_asset",
    );
    expect(failure(() => applyConvert(state, convert("1", "ast_spec"), ctx)).code).toBe(
      "book_mismatch",
    );
    expect(q(state, "acc_fund", "ast_world")).toBe("10");
    applyConvert(state, convert("2"), ctx);
    expect(failure(() => applyConvert(state, convert("2"), ctx)).code).toBe("no_open_lots");
  });
});

describe("applyCarveOut", () => {
  it("splits the cost exactly between origin and carved lots", () => {
    const state = stateWith(tenShares);
    const [origin] = open(state, "ast_world");
    applyCarveOut(state, carveOut("1/4", "0.2"), ctx);
    const [kept] = open(state, "ast_world");
    const [carved] = open(state, "ast_new");
    expect(kept?.quantity.toString()).toBe("10");
    expect(kept?.cost_eur.amount.toString()).toBe("800");
    expect(carved?.quantity.toString()).toBe("2.5");
    expect(carved?.cost_eur.amount.toString()).toBe("200");
    expect(carved?.acquisition_date).toBe("2027-01-11");
    expect(carved?.source_lot_id).toBe(origin?.id);
    expect(carved?.position).toBe(origin?.position);
    expect(q(state, "acc_fund", "ast_world")).toBe("10");
    expect(q(state, "acc_fund", "ast_new")).toBe("2.5");
    expect(integrity(state)).toEqual([]);
  });

  it("admits cost shares of 0 and 1 and inexact fractions with the remainder rule", () => {
    const zero = stateWith(tenShares);
    applyCarveOut(zero, carveOut("1", "0"), ctx);
    expect(open(zero, "ast_world")[0]?.cost_eur.amount.toString()).toBe("1000");
    expect(open(zero, "ast_new")[0]?.cost_eur.amount.toString()).toBe("0");
    const all = stateWith(twoAccounts);
    applyCarveOut(all, carveOut("1/3", "1"), ctx);
    expect(open(all, "ast_world").map((lot) => lot.cost_eur.amount.toString())).toEqual(["0", "0"]);
    expect(open(all, "ast_new").map((lot) => lot.quantity.toString())).toEqual([
      "3.3333333333",
      "2.3333333334",
    ]);
    expect(q(all, "acc_etf", "ast_new")).toBe("2.3333333334");
    // The second buy already warned about ast_world; the carve-out warns about ast_new.
    expect(all.warnings.map((w) => w.code)).toEqual([
      "same_asset_two_accounts",
      "same_asset_two_accounts",
    ]);
    expect(all.warnings[1]?.details.asset_id).toBe("ast_new");
    expect(integrity(all)).toEqual([]);
  });

  it("validates like convert", () => {
    const state = stateWith(tenShares);
    expect(failure(() => applyCarveOut(state, carveOut("1", "0.5", "ast_world"), ctx)).code).toBe(
      "same_asset",
    );
    expect(failure(() => applyCarveOut(state, carveOut("1", "0.5", "ast_spec"), ctx)).code).toBe(
      "book_mismatch",
    );
    expect(
      failure(() => applyCarveOut(state, { ...carveOut("1", "0.5"), asset_id: "ast_bonds" }, ctx))
        .code,
    ).toBe("no_open_lots");
  });
});

describe("applyForcedSale", () => {
  it("sells 'all' of an account like a sell: cash, position, FIFO lots and a gain", () => {
    const state = stateWith(tenShares);
    applyForcedSale(state, sale([{ account_id: "acc_fund", quantity: "all", fee: "5" }]), ctx);
    expect(q(state, "acc_fund", "ast_world")).toBe("0");
    expect(open(state, "ast_world")).toEqual([]);
    expect(
      cashBalances(state).map((c) => `${c.account_id}|${c.currency}=${c.balance.amount}`),
    ).toEqual(["acc_fund|EUR=195"]);
    expect(state.gains).toHaveLength(1);
    const [gain] = state.gains;
    expect(gain?.event_id).toBe(EVENT);
    expect(gain?.account_id).toBe("acc_fund");
    expect(gain?.fiscal_date).toBe("2027-03-01");
    expect(gain?.quantity.toString()).toBe("10");
    expect(gain?.proceeds_eur.amount.toString()).toBe("1195");
    expect(gain?.cost_eur.amount.toString()).toBe("1000");
    expect(gain?.gain_eur_rounded.amount.toString()).toBe("195");
    expect(integrity(state)).toEqual([]);
  });

  /**
   * ADR-0021: a fund liquidation, a rights sale or an ETC at a Spanish broker
   * all withhold on account. The withholding leaves the cash and **nothing
   * else**: the gain is still computed on the full proceeds, exactly as in a
   * `sell` (fiscal question #12). It is per account because each broker
   * withholds its own; one figure split between accounts would be invented.
   */
  it("takes the withholding out of the cash of its own account and out of nothing else", () => {
    const state = stateWith(tenShares);
    applyForcedSale(
      state,
      sale([{ account_id: "acc_fund", quantity: "all", fee: "5", withholding: "37.05" }]),
      ctx,
    );
    // 10 × 120 − 5 fee = 1195 of proceeds, minus 37.05 withheld = 1157.95 in,
    // on top of the −1000 the purchase left. Without the withholding it is 195,
    // which is what the test above asserts.
    expect(
      cashBalances(state).map((c) => `${c.account_id}|${c.currency}=${c.balance.amount}`),
    ).toEqual(["acc_fund|EUR=157.95"]);
    const [gain] = state.gains;
    // The gain does not move: a payment on account is not a cost of the disposal.
    expect(gain?.proceeds_eur.amount.toString()).toBe("1195");
    expect(gain?.gain_eur_rounded.amount.toString()).toBe("195");
    expect(integrity(state)).toEqual([]);
  });

  it("withholds account by account, and an account without one is untouched", () => {
    const state = stateWith(twoAccounts);
    const before = new Map(
      cashBalances(state).map((c) => [c.account_id, c.balance.amount.toString()]),
    );
    applyForcedSale(
      state,
      sale([
        { account_id: "acc_etf", quantity: "1", withholding: "10" },
        { account_id: "acc_fund", quantity: "1" },
      ]),
      ctx,
    );
    const moved = (account: string): string =>
      Decimal.parse(
        cashBalances(state)
          .find((c) => c.account_id === account)
          ?.balance.amount.toString() ?? "0",
      )
        .sub(Decimal.parse(before.get(account) ?? "0"))
        .toString();
    // Each one sells 1 at 120. The one that withheld 10 takes in 110; the other
    // one, which withheld nothing, takes in the whole 120.
    expect([moved("acc_etf"), moved("acc_fund")]).toEqual(["110", "120"]);
  });

  it("books one sale per account, with its own fee, consuming global FIFO lots", () => {
    const state = stateWith(twoAccounts);
    applyForcedSale(
      state,
      sale(
        [
          { account_id: "acc_etf", quantity: "0.75", fee: "1" },
          { account_id: "acc_fund", quantity: "0.5" },
        ],
        { unit_price: "400", currency: "USD", fx_rate: "1.25", fx_rate_date: "2027-03-01" },
      ),
      ctx,
    );
    expect(q(state, "acc_etf", "ast_world")).toBe("6.25");
    expect(q(state, "acc_fund", "ast_world")).toBe("9.5");
    expect(
      cashBalances(state).map((c) => `${c.account_id}|${c.currency}=${c.balance.amount}`),
    ).toEqual(expect.arrayContaining(["acc_etf|USD=299", "acc_fund|USD=200"]));
    // Both sales consume the oldest lot (acc_fund's), whatever the account.
    expect(open(state, "ast_world").map((lot) => lot.quantity.toString())).toEqual(["8.75", "7"]);
    expect(
      state.gains.map((g) => `${g.account_id}:${g.proceeds_eur.amount}:${g.cost_eur.amount}`),
    ).toEqual(["acc_etf:239.2:75", "acc_fund:160:50"]);
    expect(state.warnings.map((w) => w.code)).toEqual([
      "same_asset_two_accounts",
      "currency_mismatch",
    ]);
    expect(integrity(state)).toEqual([]);
  });

  it("is a taxable event even at zero: a liquidation at 0 books the whole cost as a loss", () => {
    const state = stateWith(tenShares);
    applyForcedSale(
      state,
      sale([{ account_id: "acc_fund", quantity: "all" }], { unit_price: "0" }),
      ctx,
    );
    expect(state.gains[0]?.gain_eur_rounded.amount.toString()).toBe("-1000");
    expect(cashBalances(state).map((c) => c.balance.amount.toString())).toEqual(["-1000"]);
  });

  it("validates every entry before touching anything", () => {
    const state = stateWith(twoAccounts);
    const untouched = () => {
      expect(q(state, "acc_fund", "ast_world")).toBe("10");
      expect(q(state, "acc_etf", "ast_world")).toBe("7");
      expect(state.gains).toEqual([]);
    };
    expect(
      failure(() =>
        applyForcedSale(
          state,
          sale([
            { account_id: "acc_fund", quantity: "1" },
            { account_id: "acc_etf", quantity: "8" },
          ]),
          ctx,
        ),
      ).code,
    ).toBe("insufficient_position");
    untouched();
    expect(
      failure(() =>
        applyForcedSale(
          state,
          sale([
            { account_id: "acc_fund", quantity: "1" },
            { account_id: "acc_fund", quantity: "1" },
          ]),
          ctx,
        ),
      ).code,
    ).toBe("duplicate_account_in_effect");
    expect(
      failure(() => applyForcedSale(state, sale([{ account_id: "acc_nope", quantity: "1" }]), ctx))
        .code,
    ).toBe("unknown_account");
    expect(
      failure(() =>
        applyForcedSale(state, sale([{ account_id: "acc_bucket", quantity: "1" }]), ctx),
      ).code,
    ).toBe("book_mismatch");
    expect(
      failure(() =>
        applyForcedSale(
          state,
          sale([{ account_id: "acc_bucket", quantity: "all" }], { asset_id: "ast_bonds" }),
          ctx,
        ),
      ).code,
    ).toBe("book_mismatch");
    expect(
      failure(() =>
        applyForcedSale(
          state,
          sale([{ account_id: "acc_fund", quantity: "all" }], { asset_id: "ast_bonds" }),
          ctx,
        ),
      ).code,
    ).toBe("insufficient_position");
    untouched();
  });

  it("warns when the fx rate date is later than the effective date", () => {
    const state = stateWith(tenShares);
    applyForcedSale(
      state,
      sale([{ account_id: "acc_fund", quantity: "1" }], { fx_rate_date: "2027-03-02" }),
      ctx,
    );
    expect(state.warnings.map((w) => w.code)).toEqual(["fx_rate_date_after_fiscal_date"]);
  });
});

describe("applyGrant", () => {
  /**
   * ADR-0021: a fork or an airdrop hands over something that DGT doctrine reads
   * as income **on receipt**, in the general base. The ledger records the
   * figure and the base; it declares nothing, because that criterion is in
   * dispute (`docs/fiscal-questions.md` #8).
   */
  it("records the income a grant declares, apart from every other income", () => {
    const state = stateWith(tenShares);
    applyGrant(
      state,
      grant([{ account_id: "acc_fund", quantity: "10" }], {
        income_eur: "420.50",
        income_base: "general",
      }),
      ctx,
    );
    expect(state.inKindIncome).toEqual([
      {
        event_id: EVENT,
        asset_id: "ast_fork",
        fiscal_date: "2027-03-01",
        year: 2027,
        amount_eur: Money.parse("420.50", "EUR"),
        base: "general",
      },
    ]);
    // It feeds nothing: not movable capital income, not a gain, not a lot cost.
    expect(state.income).toEqual([]);
    expect(state.gains).toEqual([]);
    expect(open(state, "ast_fork")[0]?.cost_eur.amount.toString()).toBe("0");
  });

  it("records nothing when the grant declares no income", () => {
    const state = stateWith(tenShares);
    applyGrant(state, grant([{ account_id: "acc_fund", quantity: "10" }]), ctx);
    expect(state.inKindIncome).toEqual([]);
  });

  it("books one entry per effect and not one per account: the figure is not split", () => {
    const state = stateWith(twoAccounts);
    applyGrant(
      state,
      grant(
        [
          { account_id: "acc_fund", quantity: "6" },
          { account_id: "acc_etf", quantity: "4" },
        ],
        { income_eur: "100", income_base: "savings" },
      ),
      ctx,
    );
    expect(state.inKindIncome).toHaveLength(1);
    expect(state.inKindIncome[0]?.amount_eur.amount.toString()).toBe("100");
  });

  it("opens a lot per account at the given cost and date without touching cash", () => {
    const state = stateWith(tenShares);
    applyGrant(
      state,
      grant([
        { account_id: "acc_fund", quantity: "10" },
        { account_id: "acc_etf", quantity: "2.5" },
      ]),
      ctx,
    );
    const lots = open(state, "ast_fork");
    expect(lots.map((lot) => lot.id)).toEqual([`${EVENT}#0`, `${EVENT}#1`]);
    expect(lots.map((lot) => lot.quantity.toString())).toEqual(["10", "2.5"]);
    expect(lots.map((lot) => lot.cost_eur.amount.toString())).toEqual(["0", "0"]);
    expect(lots.map((lot) => lot.acquisition_date)).toEqual(["2027-03-01", "2027-03-01"]);
    expect(lots.map((lot) => lot.position)).toEqual([99, 99]);
    expect(lots[0]?.source_lot_id).toBeUndefined();
    expect(q(state, "acc_fund", "ast_fork")).toBe("10");
    expect(q(state, "acc_etf", "ast_fork")).toBe("2.5");
    expect(cashBalances(state).map((c) => c.balance.amount.toString())).toEqual(["-1000"]);
    expect(state.gains).toEqual([]);
    expect(state.warnings.map((w) => w.code)).toEqual(["same_asset_two_accounts"]);
    expect(integrity(state)).toEqual([]);
  });

  it("converts a foreign unit cost at the given rate and warns on a late rate date", () => {
    const state = stateWith(tenShares);
    applyGrant(
      state,
      grant([{ account_id: "acc_fund", quantity: "4" }], {
        unit_cost: "10",
        currency: "USD",
        fx_rate: "1.25",
        fx_rate_date: "2027-03-02",
        acquisition_date: "2027-01-11",
      }),
      ctx,
    );
    const [lot] = open(state, "ast_fork");
    expect(lot?.cost_eur.amount.toString()).toBe("32");
    expect(lot?.acquisition_date).toBe("2027-01-11");
    expect(state.warnings.map((w) => w.code)).toEqual([
      "currency_mismatch",
      "fx_rate_date_after_fiscal_date",
    ]);
  });

  it("rejects unknown, duplicated or cross-book accounts and unknown assets", () => {
    const state = stateWith(tenShares);
    expect(
      failure(() => applyGrant(state, grant([{ account_id: "acc_nope", quantity: "1" }]), ctx))
        .code,
    ).toBe("unknown_account");
    expect(
      failure(() =>
        applyGrant(
          state,
          grant([
            { account_id: "acc_fund", quantity: "1" },
            { account_id: "acc_fund", quantity: "1" },
          ]),
          ctx,
        ),
      ).code,
    ).toBe("duplicate_account_in_effect");
    expect(
      failure(() => applyGrant(state, grant([{ account_id: "acc_bucket", quantity: "1" }]), ctx))
        .code,
    ).toBe("book_mismatch");
    expect(
      failure(() =>
        applyGrant(
          state,
          grant([{ account_id: "acc_fund", quantity: "1" }], { asset_id: "ast_nope" }),
          ctx,
        ),
      ).code,
    ).toBe("unknown_asset");
    expect(open(state, "ast_fork")).toEqual([]);
  });
});
