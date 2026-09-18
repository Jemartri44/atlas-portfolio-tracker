// Properties of the bucket metrics (constitution VII). Whatever the amounts and
// the prices: beating the index by the same return is a tie, and the latent
// gain plus the realized result is what the position and the sales say it is.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Decimal } from "../../src/money/decimal.js";
import type { Money } from "../../src/money/money.js";
import { type BucketThesisView, bucketTheses } from "../../src/projections/bucket.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { DEFAULT_SETTINGS, mergeSettings } from "../../src/settings/settings.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const DATE = "2027-12-31";
const settings = mergeSettings(DEFAULT_SETTINGS, { bucket_benchmark_asset_id: "ast_world" });

const dec = (value: string): Decimal => Decimal.parse(value);

/** A fractional quantity after a split, as an exact decimal string. */
const times = (quantity: string, ratio: number): string =>
  dec(quantity)
    .mul(dec(String(ratio)))
    .toString();

/** A ratio with a terminating decimal expansion, so the division is exact (ADR-0005). */
const exactRatio = fc.record({
  den: fc.constantFrom(1, 2, 4, 5, 10),
  num: fc.integer({ min: 1, max: 20 }),
  unit: fc.integer({ min: 1, max: 20 }),
  quantity: fc.integer({ min: 1, max: 50 }),
});

describe("bucketTheses: properties", () => {
  it("is a tie, exactly zero, when the asset and the index return the same", () => {
    fc.assert(
      fc.property(exactRatio, ({ den, num, unit, quantity }) => {
        const buyPrice = String(den * unit);
        const sellPrice = String(num * unit);
        const b = new LedgerBuilder();
        catalogue(b);
        // The index is priced with the very same numbers: same return, by construction.
        b.valuation({
          account_id: "acc_fund",
          asset_id: "ast_world",
          date: "2027-01-01",
          unit_value: buyPrice,
        });
        b.valuation({
          account_id: "acc_fund",
          asset_id: "ast_world",
          date: "2027-07-01",
          unit_value: sellPrice,
        });
        b.thesisOpened({ thesis_id: "th1", planned_size_eur: "100000" });
        b.buy({
          account_id: "acc_bucket",
          asset_id: "ast_spec",
          quantity: String(quantity),
          unit_price: buyPrice,
          fee: "0",
          currency: "EUR",
          fx_rate: "1",
          trade_date: "2027-01-11",
          value_date: "2027-01-13",
          thesis_id: "th1",
        });
        b.sell({
          account_id: "acc_bucket",
          asset_id: "ast_spec",
          quantity: String(quantity),
          unit_price: sellPrice,
          currency: "EUR",
          fx_rate: "1",
          trade_date: "2027-07-12",
          thesis_id: "th1",
        });
        b.thesisClosed("th1");
        const thesis = bucketTheses(projectLedger(b.build()), DATE, settings).rows[0];
        expect(thesis?.result_vs_index_eur?.isZero()).toBe(true);
      }),
      { numRuns: 60 },
    );
  });

  it("latent + realized = (current value + proceeds) − cost, to the last decimal", () => {
    fc.assert(
      fc.property(
        fc.record({
          // Quarters of a share: a real bucket holds fractions, and a property
          // that only ever sees whole numbers proves nothing about them.
          quarters: fc.integer({ min: 2, max: 60 }),
          soldQuarters: fc.integer({ min: 1, max: 30 }),
          // Eighths of a euro: prices that do not land on a cent, so a rounding
          // slipped in before the end would show.
          buyEighths: fc.integer({ min: 1, max: 200 }),
          sellEighths: fc.integer({ min: 1, max: 200 }),
          nowEighths: fc.integer({ min: 1, max: 200 }),
          ratio: fc.constantFrom(1, 2, 4),
        }),
        ({ quarters, soldQuarters, buyEighths, sellEighths, nowEighths, ratio }) => {
          fc.pre(soldQuarters < quarters);
          const quantity = (quarters / 4).toFixed(2);
          const sold = (soldQuarters / 4).toFixed(2);
          const live = ((quarters - soldQuarters) / 4).toFixed(2);
          const buyPrice = (buyEighths / 8).toFixed(3);
          const sellPrice = (sellEighths / 8).toFixed(3);
          const nowPrice = (nowEighths / 8).toFixed(3);
          const b = new LedgerBuilder();
          catalogue(b);
          b.thesisOpened({ thesis_id: "th1", planned_size_eur: "100000" });
          b.buy({
            account_id: "acc_bucket",
            asset_id: "ast_spec",
            quantity,
            unit_price: buyPrice,
            fee: "0",
            currency: "EUR",
            fx_rate: "1",
            trade_date: "2027-01-11",
            value_date: "2027-01-13",
            thesis_id: "th1",
          });
          // A split multiplies the shares of the thesis without a purchase: the
          // quantity the thesis holds can only be read from the lot lineage.
          b.corporateAction({
            kind: "split",
            asset_id: "ast_spec",
            effective_date: "2027-03-01",
            effects: [{ op: "scale", ratio: String(ratio) }],
          });
          b.sell({
            account_id: "acc_bucket",
            asset_id: "ast_spec",
            quantity: times(sold, ratio),
            unit_price: sellPrice,
            currency: "EUR",
            fx_rate: "1",
            trade_date: "2027-07-12",
            thesis_id: "th1",
          });
          b.valuation({
            account_id: "acc_bucket",
            asset_id: "ast_spec",
            date: "2027-12-01",
            quantity: times(live, ratio),
            unit_value: nowPrice,
          });
          const thesis = bucketTheses(projectLedger(b.build()), DATE, settings).rows[0] as
            | BucketThesisView
            | undefined;
          const latent = (thesis as BucketThesisView).unrealized_eur as Money;
          const realized = (thesis as BucketThesisView).result_eur;
          // In decimal, never in floating point (ADR-0005): the value of what is
          // still held, plus what the sale brought in, minus what it all cost.
          const value = dec(times(live, ratio)).mul(dec(nowPrice));
          const proceeds = dec(times(sold, ratio)).mul(dec(sellPrice));
          const cost = dec(quantity).mul(dec(buyPrice));
          expect(latent.add(realized).amount.eq(value.add(proceeds).sub(cost))).toBe(true);
        },
      ),
      { numRuns: 60 },
    );
  });
});
