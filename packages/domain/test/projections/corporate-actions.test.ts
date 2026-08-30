// Every row of data-schema.md §8.5 with its numeric example (10 shares, 1,000 €,
// 2027-01-10) and the mandatory edge cases of the prompt §3.7.

import { describe, expect, it } from "vitest";
import { ProjectionError } from "../../src/errors.js";
import { cashBalances } from "../../src/projections/cash.js";
import { integrity } from "../../src/projections/integrity.js";
import { fiscalLots } from "../../src/projections/lots.js";
import { physicalPositions, positionOf } from "../../src/projections/positions.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import type { LedgerState } from "../../src/projections/state.js";
import type { CorporateActionEvent, Effect, LedgerEvent } from "../../src/schema/events.js";
import { LedgerBuilder } from "../ledger-builder.js";

const stock = { asset_type: "stock", asset_class: "equity", transferable: false } as const;
const crypto = { asset_type: "crypto", asset_class: "crypto", transferable: false } as const;

const catalogueOf = (b: LedgerBuilder): void => {
  b.account("acc_a");
  b.account("acc_b", { platform: "ibkr", country: "IE" });
  b.account("acc_bucket", { book: "bucket" });
  b.asset("ast_old", stock);
  b.asset("ast_new", stock);
  b.asset("ast_spin", stock);
  b.asset("ast_rights", stock);
  b.asset("ast_fund_a");
  b.asset("ast_fund_b");
  b.asset("ast_fund_c");
  b.asset("ast_coin", crypto);
  b.asset("ast_fork", crypto);
  b.asset("ast_newtoken", crypto);
  b.asset("ast_spec", { book: "bucket", asset_type: "stock", transferable: false });
};

/** The §8.5 lot: 10 units, 1,000 €, acquired 2027-01-10, in acc_a unless told otherwise. */
const ten = (b: LedgerBuilder, asset_id: string, account_id = "acc_a") =>
  b.buy({ account_id, asset_id, quantity: "10", unit_price: "100" });

const sale = (
  per_account: { account_id: string; quantity: string; fee?: string }[],
  unit_price: string,
  asset_id?: string,
): Effect => ({
  op: "forced_sale",
  ...(asset_id === undefined ? {} : { asset_id }),
  per_account,
  unit_price,
  currency: "EUR",
  fx_rate: "1",
  fx_rate_date: "2027-03-01",
});

const ledger = (
  kind: CorporateActionEvent["kind"],
  asset_id: string,
  effects: Effect[],
  before: (b: LedgerBuilder) => void = (b) => ten(b, asset_id),
  after: (b: LedgerBuilder) => void = () => undefined,
): { state: LedgerState; action: CorporateActionEvent; events: LedgerEvent[] } => {
  const b = new LedgerBuilder();
  catalogueOf(b);
  before(b);
  const action = b.corporateAction({ kind, asset_id, effects });
  after(b);
  const events = b.build();
  return { state: projectLedger(events), action, events };
};

const openLots = (state: LedgerState, asset: string) =>
  fiscalLots(state, asset)
    .filter((lot) => !lot.closed)
    .map((lot) => ({
      id: lot.id,
      quantity: lot.quantity.toString(),
      cost: lot.cost_eur.amount.toString(),
      date: lot.acquisition_date,
      source: lot.source_lot_id,
    }));

const positions = (state: LedgerState): string[] =>
  physicalPositions(state).map((p) => `${p.account_id}|${p.asset_id}=${p.quantity}`);

const gains = (state: LedgerState): string[] =>
  state.gains.map(
    (g) =>
      `${g.account_id}:${g.quantity}@${g.proceeds_eur.amount}-${g.cost_eur.amount}=${g.gain_eur_rounded.amount}`,
  );

const failure = (events: readonly LedgerEvent[]): ProjectionError => {
  try {
    projectLedger(events);
  } catch (error) {
    if (error instanceof ProjectionError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected a ProjectionError");
};

describe("data-schema.md §8.5, row by row", () => {
  it("split 4:1 → scale(4): 40 shares, 1,000 €, original date, no taxable event", () => {
    const { state, action } = ledger("split", "ast_old", [{ op: "scale", ratio: "4" }]);
    expect(openLots(state, "ast_old")).toEqual([
      {
        id: expect.not.stringContaining(action.id),
        quantity: "40",
        cost: "1000",
        date: "2027-01-10",
        source: undefined,
      },
    ]);
    expect(positions(state)).toEqual(["acc_a|ast_old=40"]);
    expect(state.gains).toEqual([]);
    expect(integrity(state)).toEqual([]);
  });

  it("reverse split 1:4 → scale(1/4) + forced_sale(0.5 @ 400): 2 shares, 800 €, zero gain booked", () => {
    const { state } = ledger("reverse_split", "ast_old", [
      { op: "scale", ratio: "1/4" },
      sale([{ account_id: "acc_a", quantity: "0.5" }], "400"),
    ]);
    expect(openLots(state, "ast_old")[0]).toMatchObject({
      quantity: "2",
      cost: "800",
      date: "2027-01-10",
    });
    expect(positions(state)).toEqual(["acc_a|ast_old=2"]);
    expect(gains(state)).toEqual(["acc_a:0.5@200-200=0"]);
    expect(state.gains[0]?.fiscal_date).toBe("2027-03-01");
    expect(cashBalances(state).map((c) => c.balance.amount.toString())).toEqual(["-800"]);
    expect(integrity(state)).toEqual([]);
  });

  it("stock dividend 1 per 10 → scale(1.1): 11 shares, 1,000 € (90.91 €/share), original date", () => {
    const { state } = ledger("stock_dividend", "ast_old", [{ op: "scale", ratio: "1.1" }]);
    const [lot] = openLots(state, "ast_old");
    expect(lot).toMatchObject({ quantity: "11", cost: "1000", date: "2027-01-10" });
    expect(
      state.lots
        .get("ast_old")
        ?.open[0]?.cost_eur.div(state.lots.get("ast_old")?.open[0]?.quantity.value as never)
        .roundToCents()
        .amount.toString(),
    ).toBe("90.91");
    expect(state.gains).toEqual([]);
  });

  it("stock dividend as rights sold → grant(rights, cost 0) + forced_sale: the proceeds are the gain", () => {
    const { state } = ledger("stock_dividend", "ast_old", [
      {
        op: "grant",
        asset_id: "ast_rights",
        per_account: [{ account_id: "acc_a", quantity: "10" }],
        unit_cost: "0",
        currency: "EUR",
        fx_rate: "1",
        fx_rate_date: "2027-03-01",
        acquisition_date: "2027-03-01",
      },
      sale([{ account_id: "acc_a", quantity: "all" }], "2", "ast_rights"),
    ]);
    expect(openLots(state, "ast_old")[0]).toMatchObject({ quantity: "10", cost: "1000" });
    expect(openLots(state, "ast_rights")).toEqual([]);
    expect(gains(state)).toEqual(["acc_a:10@20-0=20"]);
    expect(positions(state)).toEqual(["acc_a|ast_old=10"]);
    expect(integrity(state)).toEqual([]);
  });

  it("merger 1 new per 2 old → convert(NEW, 1/2): 5 NEW, 1,000 €, original date", () => {
    const { state, action } = ledger("merger", "ast_old", [
      { op: "convert", to_asset_id: "ast_new", ratio: "1/2" },
    ]);
    const closed = fiscalLots(state, "ast_old");
    expect(closed).toHaveLength(1);
    expect(closed[0]?.closed).toBe(true);
    expect(closed[0]?.consumptions[0]?.event_id).toBe(action.id);
    expect(openLots(state, "ast_new")).toEqual([
      {
        id: `${action.id}#0`,
        quantity: "5",
        cost: "1000",
        date: "2027-01-10",
        source: closed[0]?.id,
      },
    ]);
    expect(positions(state)).toEqual(["acc_a|ast_new=5"]);
    expect(state.gains).toEqual([]);
    expect(integrity(state)).toEqual([]);
  });

  it("spin-off 1 per 4 with 20 % of the cost → carve_out(SPIN, 1/4, 0.2): 10 OLD @ 800 € + 2.5 SPIN @ 200 €", () => {
    const { state } = ledger("spin_off", "ast_old", [
      { op: "carve_out", to_asset_id: "ast_spin", ratio: "1/4", cost_share: "0.2" },
    ]);
    expect(openLots(state, "ast_old")[0]).toMatchObject({
      quantity: "10",
      cost: "800",
      date: "2027-01-10",
    });
    expect(openLots(state, "ast_spin")[0]).toMatchObject({
      quantity: "2.5",
      cost: "200",
      date: "2027-01-10",
    });
    expect(positions(state)).toEqual(["acc_a|ast_old=10", "acc_a|ast_spin=2.5"]);
    expect(state.gains).toEqual([]);
    expect(integrity(state)).toEqual([]);
  });

  it("fund merger NAV ratio 1.7 → convert(B, 1.7): 17 units of B, 1,000 €, original date", () => {
    const { state } = ledger(
      "fund_merger",
      "ast_fund_a",
      [{ op: "convert", to_asset_id: "ast_fund_b", ratio: "1.7" }],
      (b) => ten(b, "ast_fund_a"),
    );
    expect(openLots(state, "ast_fund_b")[0]).toMatchObject({
      quantity: "17",
      cost: "1000",
      date: "2027-01-10",
    });
    expect(positions(state)).toEqual(["acc_a|ast_fund_b=17"]);
    expect(state.gains).toEqual([]);
  });

  it("share class change → convert: new asset, inherited lots", () => {
    const { state } = ledger(
      "share_class_change",
      "ast_fund_a",
      [{ op: "convert", to_asset_id: "ast_fund_b", ratio: "1" }],
      (b) => ten(b, "ast_fund_a"),
    );
    expect(openLots(state, "ast_fund_b")[0]).toMatchObject({
      quantity: "10",
      cost: "1000",
      date: "2027-01-10",
    });
    expect(openLots(state, "ast_fund_a")).toEqual([]);
  });

  it("fund liquidation at NAV 120 → forced_sale(all @ 120): 1,200 − 1,000 = 200 € gain", () => {
    const { state } = ledger(
      "fund_liquidation",
      "ast_fund_a",
      [sale([{ account_id: "acc_a", quantity: "all" }], "120")],
      (b) => ten(b, "ast_fund_a"),
    );
    expect(gains(state)).toEqual(["acc_a:10@1200-1000=200"]);
    expect(positions(state)).toEqual([]);
    expect(cashBalances(state).map((c) => c.balance.amount.toString())).toEqual(["200"]);
    expect(integrity(state)).toEqual([]);
  });

  it("issuer liquidation at 0 → forced_sale(all @ 0): 1,000 € loss", () => {
    const { state } = ledger("issuer_liquidation", "ast_old", [
      sale([{ account_id: "acc_a", quantity: "all" }], "0"),
    ]);
    expect(gains(state)).toEqual(["acc_a:10@0-1000=-1000"]);
    expect(positions(state)).toEqual([]);
  });

  it("delisting → no effects: lots and positions untouched, the event is a record", () => {
    const { state, action } = ledger("delisting", "ast_old", []);
    expect(openLots(state, "ast_old")[0]).toMatchObject({ quantity: "10", cost: "1000" });
    expect(positions(state)).toEqual(["acc_a|ast_old=10"]);
    expect(state.gains).toEqual([]);
    expect(state.usage.assets.has("ast_old")).toBe(true);
    expect(action.effects).toEqual([]);
  });

  it("crypto fork → grant(FORK, 10, cost 0, fork date): a later sale is taxed in full", () => {
    const { state, action } = ledger(
      "crypto_fork",
      "ast_coin",
      [
        {
          op: "grant",
          asset_id: "ast_fork",
          per_account: [{ account_id: "acc_a", quantity: "10" }],
          unit_cost: "0",
          currency: "EUR",
          fx_rate: "1",
          fx_rate_date: "2027-03-01",
          acquisition_date: "2027-03-01",
        },
      ],
      (b) => ten(b, "ast_coin"),
      (b) => {
        b.sell({ account_id: "acc_a", asset_id: "ast_fork", quantity: "10", unit_price: "50" });
      },
    );
    expect(fiscalLots(state, "ast_fork")[0]).toMatchObject({
      id: `${action.id}#0`,
      acquisition_date: "2027-03-01",
      closed: true,
    });
    expect(fiscalLots(state, "ast_fork")[0]?.original_cost_eur.amount.toString()).toBe("0");
    expect(gains(state)).toEqual(["acc_a:10@500-0=500"]);
    expect(positions(state)).toEqual(["acc_a|ast_coin=10"]);
    expect(integrity(state)).toEqual([]);
  });

  it("token migration 1:100 → convert(NEWTOKEN, 100): 1,000 units, 1,000 €, original date", () => {
    const { state } = ledger(
      "token_migration",
      "ast_coin",
      [{ op: "convert", to_asset_id: "ast_newtoken", ratio: "100" }],
      (b) => ten(b, "ast_coin"),
    );
    expect(openLots(state, "ast_newtoken")[0]).toMatchObject({
      quantity: "1000",
      cost: "1000",
      date: "2027-01-10",
    });
    expect(positions(state)).toEqual(["acc_a|ast_newtoken=1000"]);
  });

  it("issuer restructuring → any sequence of convert and forced_sale, composed like a merger with cash", () => {
    const { state } = ledger("issuer_restructuring", "ast_old", [
      sale([{ account_id: "acc_a", quantity: "4" }], "100"),
      { op: "convert", to_asset_id: "ast_new", ratio: "1" },
    ]);
    expect(gains(state)).toEqual(["acc_a:4@400-400=0"]);
    expect(openLots(state, "ast_new")[0]).toMatchObject({
      quantity: "6",
      cost: "600",
      date: "2027-01-10",
    });
    expect(positions(state)).toEqual(["acc_a|ast_new=6"]);
    expect(integrity(state)).toEqual([]);
  });
});

describe("mandatory edge cases (prompt §3.7)", () => {
  it("reverse split 1:4 with cash-in-lieu in two accounts: A 10→2 sells 0.5, B 7→1 sells 0.75, each cash in its account", () => {
    const { state } = ledger(
      "reverse_split",
      "ast_old",
      [
        { op: "scale", ratio: "1/4" },
        sale(
          [
            { account_id: "acc_a", quantity: "0.5", fee: "1" },
            { account_id: "acc_b", quantity: "0.75", fee: "2" },
          ],
          "400",
        ),
      ],
      (b) => {
        ten(b, "ast_old", "acc_a");
        b.buy({
          account_id: "acc_b",
          asset_id: "ast_old",
          quantity: "7",
          unit_price: "110",
          value_date: "2027-02-10",
        });
      },
    );
    expect(positions(state)).toEqual(["acc_a|ast_old=2", "acc_b|ast_old=1"]);
    expect(cashBalances(state).map((c) => `${c.account_id}=${c.balance.amount}`)).toEqual([
      "acc_a=-801",
      "acc_b=-472",
    ]);
    // Both fractions come out of the oldest lot (acc_a's, 1,000 € for 2.5 shares = 400 €/share).
    expect(gains(state)).toEqual(["acc_a:0.5@199-200=-1", "acc_b:0.75@298-300=-2"]);
    expect(openLots(state, "ast_old").map((lot) => `${lot.quantity}@${lot.cost}`)).toEqual([
      "1.25@500",
      "1.75@770",
    ]);
    expect(integrity(state)).toEqual([]);
  });

  it("merger with a cash component: partial forced_sale of the old shares before the convert (raw sequence)", () => {
    const { state } = ledger("merger", "ast_old", [
      sale([{ account_id: "acc_a", quantity: "2" }], "50"),
      { op: "convert", to_asset_id: "ast_new", ratio: "1/2" },
    ]);
    expect(gains(state)).toEqual(["acc_a:2@100-200=-100"]);
    expect(openLots(state, "ast_new")[0]).toMatchObject({
      quantity: "4",
      cost: "800",
      date: "2027-01-10",
    });
    expect(positions(state)).toEqual(["acc_a|ast_new=4"]);
  });

  it("spin-off with fractional shares of the spun-off asset sold", () => {
    const { state } = ledger("spin_off", "ast_old", [
      { op: "carve_out", to_asset_id: "ast_spin", ratio: "1/4", cost_share: "0.2" },
      sale([{ account_id: "acc_a", quantity: "0.5" }], "10", "ast_spin"),
    ]);
    expect(positions(state)).toEqual(["acc_a|ast_old=10", "acc_a|ast_spin=2"]);
    expect(gains(state)).toEqual(["acc_a:0.5@5-40=-35"]);
    expect(openLots(state, "ast_spin")[0]).toMatchObject({ quantity: "2", cost: "160" });
    expect(integrity(state)).toEqual([]);
  });

  it("fund liquidation with lots in two accounts: one sale per account, both positions to zero", () => {
    const { state } = ledger(
      "fund_liquidation",
      "ast_fund_a",
      [
        sale(
          [
            { account_id: "acc_a", quantity: "all" },
            { account_id: "acc_b", quantity: "all" },
          ],
          "120",
        ),
      ],
      (b) => {
        ten(b, "ast_fund_a", "acc_a");
        b.buy({
          account_id: "acc_b",
          asset_id: "ast_fund_a",
          quantity: "5",
          unit_price: "110",
          value_date: "2027-02-10",
        });
      },
    );
    expect(gains(state)).toEqual(["acc_a:10@1200-1000=200", "acc_b:5@600-550=50"]);
    expect(positions(state)).toEqual([]);
    expect(fiscalLots(state, "ast_fund_a").every((lot) => lot.closed)).toBe(true);
    expect(integrity(state)).toEqual([]);
  });

  it("convert over lots inherited from a transfer keeps the original date twice over", () => {
    const b = new LedgerBuilder();
    catalogueOf(b);
    const buy = b.buy({
      account_id: "acc_a",
      asset_id: "ast_fund_a",
      value_date: "2026-09-02",
      quantity: "10",
      unit_price: "100",
    });
    const transfer = b.transfer({
      from_account_id: "acc_a",
      from_asset_id: "ast_fund_a",
      quantity_out: "10",
      nav_out: "105",
      value_date_out: "2027-01-05",
      to_account_id: "acc_a",
      to_asset_id: "ast_fund_b",
      quantity_in: "8",
      nav_in: "131.25",
      value_date_in: "2027-01-07",
    });
    const merger = b.corporateAction({
      kind: "fund_merger",
      asset_id: "ast_fund_b",
      effects: [{ op: "convert", to_asset_id: "ast_fund_c", ratio: "2" }],
    });
    const state = projectLedger(b.build());
    const [lot] = openLots(state, "ast_fund_c");
    expect(lot).toMatchObject({
      id: `${merger.id}#0`,
      quantity: "16",
      cost: "1000",
      date: "2026-09-02",
      source: `${transfer.id}#0`,
    });
    expect(fiscalLots(state, "ast_fund_b")[0]?.source_lot_id).toBe(`${buy.id}#0`);
    expect(state.lots.get("ast_fund_c")?.open[0]?.position).toBe(state.positionOf.get(buy.id));
    expect(integrity(state)).toEqual([]);
  });

  it("a corporate action recorded late is placed by effective_date: later sales consume the transformed lots", () => {
    const b = new LedgerBuilder();
    catalogueOf(b);
    ten(b, "ast_old");
    const sell = b.sell({
      account_id: "acc_a",
      asset_id: "ast_old",
      quantity: "20",
      unit_price: "30",
      value_date: "2027-05-01",
    });
    expect(failure(b.build()).code).toBe("insufficient_position");
    b.corporateAction({
      kind: "split",
      asset_id: "ast_old",
      effects: [{ op: "scale", ratio: "4" }],
      effective_date: "2027-03-01",
    });
    const state = projectLedger(b.build());
    expect(positions(state)).toEqual(["acc_a|ast_old=20"]);
    expect(state.gains[0]?.event_id).toBe(sell.id);
    expect(gains(state)).toEqual(["acc_a:20@600-500=100"]);
    expect(integrity(state)).toEqual([]);
  });

  it("an effect that does not fit the kind, or an empty list where effects are required, is rejected", () => {
    const b = new LedgerBuilder();
    catalogueOf(b);
    ten(b, "ast_old");
    b.corporateAction({
      kind: "split",
      asset_id: "ast_old",
      effects: [{ op: "convert", to_asset_id: "ast_new", ratio: "1" }],
    });
    expect(failure(b.build()).code).toBe("effects_not_allowed_for_kind");
    const empty = new LedgerBuilder();
    catalogueOf(empty);
    ten(empty, "ast_old");
    empty.corporateAction({ kind: "split", asset_id: "ast_old", effects: [] });
    expect(failure(empty.build()).code).toBe("effects_not_allowed_for_kind");
    const listed = new LedgerBuilder();
    catalogueOf(listed);
    ten(listed, "ast_old");
    listed.corporateAction({
      kind: "delisting",
      asset_id: "ast_old",
      effects: [{ op: "scale", ratio: "1" }],
    });
    expect(failure(listed.build()).code).toBe("effects_not_allowed_for_kind");
  });

  it("a liquidation must sell 'all' in exactly the accounts holding the asset", () => {
    const two = (b: LedgerBuilder) => {
      ten(b, "ast_fund_a", "acc_a");
      b.buy({
        account_id: "acc_b",
        asset_id: "ast_fund_a",
        quantity: "5",
        unit_price: "110",
        value_date: "2027-02-10",
      });
    };
    const cases: [Effect, Record<string, unknown>][] = [
      [sale([{ account_id: "acc_a", quantity: "all" }], "120"), { missing: ["acc_b"] }],
      [
        sale(
          [
            { account_id: "acc_a", quantity: "all" },
            { account_id: "acc_b", quantity: "5" },
          ],
          "120",
        ),
        { partial: ["acc_b"] },
      ],
      [
        sale(
          [
            { account_id: "acc_a", quantity: "all" },
            { account_id: "acc_b", quantity: "all" },
            { account_id: "acc_bucket", quantity: "all" },
          ],
          "120",
        ),
        { extra: ["acc_bucket"] },
      ],
    ];
    for (const [effect, details] of cases) {
      const b = new LedgerBuilder();
      catalogueOf(b);
      two(b);
      b.corporateAction({ kind: "fund_liquidation", asset_id: "ast_fund_a", effects: [effect] });
      const error = failure(b.build());
      expect(error.code).toBe("liquidation_must_cover_all_accounts");
      expect(error.details).toMatchObject(details);
    }
  });

  it("rejects unknown assets in the event or in an effect, and unknown destinations", () => {
    const unknownEvent = new LedgerBuilder();
    catalogueOf(unknownEvent);
    unknownEvent.corporateAction({
      kind: "split",
      asset_id: "ast_nope",
      effects: [{ op: "scale", ratio: "2" }],
    });
    expect(failure(unknownEvent.build()).code).toBe("unknown_asset");
    const unknownEffect = new LedgerBuilder();
    catalogueOf(unknownEffect);
    ten(unknownEffect, "ast_old");
    unknownEffect.corporateAction({
      kind: "issuer_restructuring",
      asset_id: "ast_old",
      effects: [{ op: "convert", asset_id: "ast_nope", to_asset_id: "ast_new", ratio: "1" }],
    });
    expect(failure(unknownEffect.build()).code).toBe("unknown_asset");
    const unknownTarget = new LedgerBuilder();
    catalogueOf(unknownTarget);
    ten(unknownTarget, "ast_old");
    unknownTarget.corporateAction({
      kind: "merger",
      asset_id: "ast_old",
      effects: [{ op: "convert", to_asset_id: "ast_nope", ratio: "1" }],
    });
    expect(failure(unknownTarget.build()).code).toBe("unknown_asset");
  });

  it("rolls back every effect when a later one fails, so a rejected action leaves no trace", () => {
    const b = new LedgerBuilder();
    catalogueOf(b);
    ten(b, "ast_old");
    const action = b.corporateAction({
      kind: "reverse_split",
      asset_id: "ast_old",
      effects: [
        { op: "scale", ratio: "1/4" },
        sale([{ account_id: "acc_a", quantity: "3" }], "400"),
      ],
    });
    const later = b.sell({
      account_id: "acc_a",
      asset_id: "ast_old",
      quantity: "10",
      unit_price: "120",
      value_date: "2027-06-01",
    });
    expect(failure(b.build())).toMatchObject({ code: "insufficient_position", eventId: action.id });
    const collected = projectLedger(b.build(), { collectErrors: true });
    expect(collected.invalid.map((entry) => entry.event.id)).toEqual([action.id]);
    expect(collected.gains.map((g) => g.event_id)).toEqual([later.id]);
    expect(gains(collected)).toEqual(["acc_a:10@1200-1000=200"]);
    expect(positionOf(collected, "acc_a", "ast_old").toString()).toBe("0");
    expect(collected.lotCounts.has(action.id)).toBe(false);
    expect(integrity(collected).map((f) => f.code)).toEqual(["insufficient_position"]);
  });

  it("rolls back lots created in a destination that had none and cash of a partial sale", () => {
    const b = new LedgerBuilder();
    catalogueOf(b);
    ten(b, "ast_old");
    const action = b.corporateAction({
      kind: "issuer_restructuring",
      asset_id: "ast_old",
      effects: [
        sale([{ account_id: "acc_a", quantity: "4" }], "100"),
        { op: "convert", to_asset_id: "ast_new", ratio: "1" },
        { op: "convert", asset_id: "ast_new", to_asset_id: "ast_spec", ratio: "1" },
      ],
    });
    const collected = projectLedger(b.build(), { collectErrors: true });
    expect(collected.invalid[0]?.error.code).toBe("book_mismatch");
    expect(collected.invalid[0]?.event.id).toBe(action.id);
    expect(collected.lots.has("ast_new")).toBe(false);
    expect(openLots(collected, "ast_old")[0]).toMatchObject({ quantity: "10", cost: "1000" });
    expect(cashBalances(collected).map((c) => c.balance.amount.toString())).toEqual(["-1000"]);
    expect(collected.gains).toEqual([]);
    expect(collected.warnings).toEqual([]);
  });

  it("registers the accounts and assets it references for rectification checks", () => {
    const { state } = ledger("stock_dividend", "ast_old", [
      {
        op: "grant",
        asset_id: "ast_rights",
        per_account: [{ account_id: "acc_b", quantity: "10" }],
        unit_cost: "0",
        currency: "EUR",
        fx_rate: "1",
        fx_rate_date: "2027-03-01",
        acquisition_date: "2027-03-01",
      },
    ]);
    expect(state.usage.accounts.has("acc_b")).toBe(true);
    expect(state.usage.assets.has("ast_rights")).toBe(true);
    expect(state.usage.assets.has("ast_old")).toBe(true);
  });
});
