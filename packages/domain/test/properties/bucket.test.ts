// Properties of the bucket metrics (constitution VII). Whatever the amounts and
// the prices: beating the index by the same return is a tie, and the latent
// gain plus the realized result is what the position and the sales say it is.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type BucketThesisView, bucketTheses } from "../../src/projections/bucket.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { DEFAULT_SETTINGS, mergeSettings } from "../../src/settings/settings.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const DATE = "2027-12-31";
const settings = mergeSettings(DEFAULT_SETTINGS, { bucket_benchmark_asset_id: "ast_world" });

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

  it("latent + realized = (current value + proceeds) − cost, across a split", () => {
    fc.assert(
      fc.property(
        fc.record({
          quantity: fc.integer({ min: 2, max: 60 }),
          sold: fc.integer({ min: 1, max: 30 }),
          buyPrice: fc.integer({ min: 1, max: 200 }),
          sellPrice: fc.integer({ min: 1, max: 200 }),
          nowPrice: fc.integer({ min: 1, max: 200 }),
          ratio: fc.constantFrom(1, 2, 4),
        }),
        ({ quantity, sold, buyPrice, sellPrice, nowPrice, ratio }) => {
          fc.pre(sold < quantity);
          const b = new LedgerBuilder();
          catalogue(b);
          b.thesisOpened({ thesis_id: "th1", planned_size_eur: "100000" });
          b.buy({
            account_id: "acc_bucket",
            asset_id: "ast_spec",
            quantity: String(quantity),
            unit_price: String(buyPrice),
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
            quantity: String(sold * ratio),
            unit_price: String(sellPrice),
            currency: "EUR",
            fx_rate: "1",
            trade_date: "2027-07-12",
            thesis_id: "th1",
          });
          b.valuation({
            account_id: "acc_bucket",
            asset_id: "ast_spec",
            date: "2027-12-01",
            quantity: String((quantity - sold) * ratio),
            unit_value: String(nowPrice),
          });
          const thesis = bucketTheses(projectLedger(b.build()), DATE, settings).rows[0] as
            | BucketThesisView
            | undefined;
          const latent = Number((thesis as BucketThesisView).unrealized_eur?.amount.toString());
          const realized = Number((thesis as BucketThesisView).result_eur.amount.toString());
          const value = (quantity - sold) * ratio * nowPrice;
          const proceeds = sold * ratio * sellPrice;
          const cost = quantity * buyPrice;
          expect(latent + realized).toBeCloseTo(value + proceeds - cost, 8);
        },
      ),
      { numRuns: 60 },
    );
  });
});
