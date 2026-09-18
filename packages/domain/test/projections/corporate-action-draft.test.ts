// Composing a corporate action from parameters (Q4 of prompt 007). It used to
// live in `apps/cli`; the piece that mattered was the fractional-share
// calculation of a reverse split, which decides how much gain is realised and
// in which account.

import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/errors.js";
import {
  type CorporateActionParams,
  corporateActionDraft,
} from "../../src/projections/corporate-action-draft.js";
import { checkEffectsAgainstKind } from "../../src/projections/kind-rules.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import type { CorporateActionEvent, Effect, LedgerEvent } from "../../src/schema/events.js";
import { LedgerBuilder } from "../ledger-builder.js";

const stock = { asset_type: "stock", asset_class: "equity", transferable: false } as const;

/** Two accounts holding the same stock, so the fractions can differ between them. */
const ledger = (holdings: readonly { account: string; quantity: string }[] = []) => {
  const b = new LedgerBuilder();
  b.account("acc_a");
  b.account("acc_b", { platform: "ibkr", country: "IE" });
  b.asset("ast_old", stock);
  b.asset("ast_new", stock);
  b.asset("ast_spin", stock);
  b.asset("ast_fund_a");
  b.asset("ast_fund_b");
  for (const holding of holdings) {
    b.buy({
      account_id: holding.account,
      asset_id: "ast_old",
      quantity: holding.quantity,
      unit_price: "100",
      fee: "0",
    });
  }
  const events = b.build();
  return { events, state: projectLedger(events) };
};

const base = {
  asset_id: "ast_old",
  effective_date: "2027-03-01",
  source_document: "https://issuer.example/notice.pdf",
} as const;

const CASH = {
  unit_price: "50",
  currency: "EUR",
  fx_rate: "1",
  fx_rate_date: "2027-03-01",
} as const;

const compose = (
  params: CorporateActionParams,
  holdings?: readonly { account: string; quantity: string }[],
) => {
  const { state, events } = ledger(holdings);
  return corporateActionDraft(state, events, params);
};

/** The draft's own effects, typed. */
const effectsOf = (draft: { draft: { effects?: readonly Effect[] } }): readonly Effect[] =>
  draft.draft.effects ?? [];

describe("corporateActionDraft: the sequence each kind admits", () => {
  it("composes a split", () => {
    const { draft } = compose({ ...base, kind: "split", ratio: "2" });

    expect(draft).toMatchObject({
      type: "corporate_action",
      kind: "split",
      asset_id: "ast_old",
      effective_date: "2027-03-01",
      source_document: "https://issuer.example/notice.pdf",
      effects: [{ op: "scale", ratio: "2" }],
    });
  });

  it("composes a reverse split with no cash settlement: just the scale", () => {
    const result = compose({ ...base, kind: "reverse_split", ratio: "1/3" }, [
      { account: "acc_a", quantity: "10" },
    ]);

    expect(effectsOf(result)).toEqual([{ op: "scale", ratio: "1/3" }]);
    expect(result.fractional).toEqual([]);
    expect(result.no_fractions).toBe(false);
  });

  it("composes a fund merger and a share class change as a conversion", () => {
    for (const kind of ["fund_merger", "share_class_change"] as const) {
      const { draft } = compose({
        ...base,
        asset_id: "ast_fund_a",
        kind,
        to_asset_id: "ast_fund_b",
        ratio: "1",
      });
      expect(draft.effects).toEqual([{ op: "convert", to_asset_id: "ast_fund_b", ratio: "1" }]);
    }
  });

  it("composes a spin-off as a carve-out with its cost share", () => {
    const result = compose({
      ...base,
      kind: "spin_off",
      to_asset_id: "ast_spin",
      ratio: "1/2",
      cost_share: "0.2",
    });

    expect(effectsOf(result)).toEqual([
      { op: "carve_out", to_asset_id: "ast_spin", ratio: "1/2", cost_share: "0.2" },
    ]);
  });

  it("composes a liquidation as a forced sale of everything, in every account holding it", () => {
    const result = compose({ ...base, kind: "fund_liquidation", cash: CASH }, [
      { account: "acc_a", quantity: "10" },
      { account: "acc_b", quantity: "5" },
    ]);

    expect(effectsOf(result)).toEqual([
      {
        op: "forced_sale",
        per_account: [
          { account_id: "acc_a", quantity: "all" },
          { account_id: "acc_b", quantity: "all" },
        ],
        ...CASH,
      },
    ]);
  });

  it("composes a delisting with no effects at all", () => {
    expect(effectsOf(compose({ ...base, kind: "delisting" }))).toEqual([]);
  });

  it("passes verbatim effects through untouched", () => {
    const effects: Effect[] = [{ op: "scale", ratio: "3" }];
    const result = compose({ ...base, kind: "issuer_restructuring", effects });

    expect(effectsOf(result)).toEqual(effects);
    expect(result.fractional).toEqual([]);
  });

  it("refuses a kind that has no parameter form", () => {
    expect(() => compose({ ...base, kind: "crypto_fork" })).toThrow(
      expect.objectContaining({ code: "no_wizard_for_kind" }),
    );
  });

  /** The sequences it builds are the ones the kind table admits (ADR-0011). */
  it("produces sequences that pass checkEffectsAgainstKind", () => {
    const cases: CorporateActionParams[] = [
      { ...base, kind: "split", ratio: "2" },
      { ...base, kind: "reverse_split", ratio: "1/3" },
      {
        ...base,
        asset_id: "ast_fund_a",
        kind: "fund_merger",
        to_asset_id: "ast_fund_b",
        ratio: "1",
      },
      {
        ...base,
        asset_id: "ast_fund_a",
        kind: "share_class_change",
        to_asset_id: "ast_fund_b",
        ratio: "1",
      },
      { ...base, kind: "merger", to_asset_id: "ast_new", ratio: "1" },
      { ...base, kind: "spin_off", to_asset_id: "ast_spin", ratio: "1/2", cost_share: "0.2" },
      { ...base, kind: "fund_liquidation", cash: CASH },
      { ...base, kind: "delisting" },
    ];
    for (const params of cases) {
      const result = compose(params, [{ account: "acc_a", quantity: "10" }]);
      const resolved = effectsOf(result).map((effect) => ({
        ...effect,
        asset_id: effect.asset_id ?? params.asset_id,
      }));
      expect(() =>
        checkEffectsAgainstKind(params.kind, resolved, params.asset_id, "probe"),
      ).not.toThrow();
    }
  });
});

describe("corporateActionDraft: the fractional shares", () => {
  /** The mandatory edge case: a reverse split with cash-in-lieu **in two accounts**. */
  it("sells the leftover of each account, and only the leftover", () => {
    const result = compose({ ...base, kind: "reverse_split", ratio: "1/3", cash: CASH }, [
      { account: "acc_a", quantity: "10" },
      { account: "acc_b", quantity: "7" },
    ]);

    /*
     * 10/3 = 3.3333333333 and 7/3 = 2.3333333334 at the ten decimals a
     * `Quantity` keeps, so the leftovers differ in the last digit. They are not
     * rounded to a common value: what is sold is what each account is actually
     * left holding.
     */
    expect(result.fractional).toEqual([
      { account_id: "acc_a", quantity: "0.3333333333" },
      { account_id: "acc_b", quantity: "0.3333333334" },
    ]);
    expect(effectsOf(result)).toEqual([
      { op: "scale", ratio: "1/3" },
      {
        op: "forced_sale",
        per_account: [
          { account_id: "acc_a", quantity: "0.3333333333" },
          { account_id: "acc_b", quantity: "0.3333333334" },
        ],
        ...CASH,
      },
    ]);
    expect(result.no_fractions).toBe(false);
  });

  /**
   * A leftover of **half a share or more**. `position − ⌊position⌋` is the
   * rule; rounding the position instead would give 10/4 = 2,5 → 3 whole shares
   * and a leftover of −0,5, which is not a quantity. With a leftover under a
   * half the two agree, which is why every earlier case passed either way.
   */
  it("sells a leftover of half a share as readily as one of a third", () => {
    const result = compose({ ...base, kind: "reverse_split", ratio: "1/4", cash: CASH }, [
      { account: "acc_a", quantity: "10" },
    ]);

    expect(result.fractional).toEqual([{ account_id: "acc_a", quantity: "0.5" }]);
    expect(effectsOf(result)).toEqual([
      { op: "scale", ratio: "1/4" },
      {
        op: "forced_sale",
        per_account: [{ account_id: "acc_a", quantity: "0.5" }],
        ...CASH,
      },
    ]);
  });

  it("says so, and generates no sale, when the split leaves nobody with a fraction", () => {
    const result = compose({ ...base, kind: "reverse_split", ratio: "1/2", cash: CASH }, [
      { account: "acc_a", quantity: "10" },
    ]);

    expect(result.no_fractions).toBe(true);
    expect(result.fractional).toEqual([]);
    expect(effectsOf(result)).toEqual([{ op: "scale", ratio: "1/2" }]);
  });

  it("measures the fraction of the destination asset in a merger, not of the origin", () => {
    const result = compose(
      { ...base, kind: "merger", to_asset_id: "ast_new", ratio: "1/3", cash: CASH },
      [{ account: "acc_a", quantity: "10" }],
    );

    expect(effectsOf(result)).toEqual([
      { op: "convert", to_asset_id: "ast_new", ratio: "1/3" },
      {
        op: "forced_sale",
        asset_id: "ast_new",
        per_account: [{ account_id: "acc_a", quantity: "0.3333333333" }],
        ...CASH,
      },
    ]);
  });

  it("attaches the fee of each account that sells", () => {
    const result = compose(
      {
        ...base,
        kind: "reverse_split",
        ratio: "1/3",
        cash: CASH,
        fees: { acc_b: "1.20" },
      },
      [
        { account: "acc_a", quantity: "10" },
        { account: "acc_b", quantity: "7" },
      ],
    );

    const sale = effectsOf(result)[1] as Extract<Effect, { op: "forced_sale" }>;
    expect(sale.per_account).toEqual([
      { account_id: "acc_a", quantity: "0.3333333333" },
      { account_id: "acc_b", quantity: "0.3333333334", fee: "1.20" },
    ]);
  });

  it("refuses a fee for an account that takes no part in the sale", () => {
    expect(() =>
      compose({ ...base, kind: "reverse_split", ratio: "1/3", cash: CASH, fees: { acc_b: "1" } }, [
        { account: "acc_a", quantity: "10" },
      ]),
    ).toThrow(expect.objectContaining({ code: "fee_account_not_selling" }));
  });

  /**
   * The three ways of composing an action with **no sale at all** used to drop
   * the fee without a word. A fee is a cost of a disposal: losing it overstates
   * the gain, and the ledger is append-only, so it is expensive to undo later.
   */
  it("refuses a fee when the action generates no sale at all", () => {
    // Nobody is left with a fraction: 10/2 is five whole shares.
    expect(() =>
      compose({ ...base, kind: "reverse_split", ratio: "1/2", cash: CASH, fees: { acc_a: "1" } }, [
        { account: "acc_a", quantity: "10" },
      ]),
    ).toThrow(expect.objectContaining({ code: "fee_account_not_selling" }));

    // A reverse split with no cash settlement sells nothing either.
    expect(() =>
      compose({ ...base, kind: "reverse_split", ratio: "1/3", fees: { acc_a: "1" } }, [
        { account: "acc_a", quantity: "10" },
      ]),
    ).toThrow(expect.objectContaining({ code: "fee_account_not_selling" }));

    // And a plain split has no sale in its sequence by definition.
    expect(() =>
      compose({ ...base, kind: "split", ratio: "2", fees: { acc_a: "1" } }, [
        { account: "acc_a", quantity: "10" },
      ]),
    ).toThrow(expect.objectContaining({ code: "fee_account_not_selling" }));
  });

  it("accepts an empty fee map anywhere: nothing was asked for", () => {
    expect(() =>
      compose({ ...base, kind: "split", ratio: "2", fees: {} }, [
        { account: "acc_a", quantity: "10" },
      ]),
    ).not.toThrow();
  });

  it("attaches the fee of a liquidation too", () => {
    const result = compose(
      { ...base, kind: "fund_liquidation", cash: CASH, fees: { acc_a: "2" } },
      [{ account: "acc_a", quantity: "10" }],
    );

    const sale = effectsOf(result)[0] as Extract<Effect, { op: "forced_sale" }>;
    expect(sale.per_account).toEqual([{ account_id: "acc_a", quantity: "all", fee: "2" }]);
  });
});

describe("corporateActionDraft: what it refuses", () => {
  it("refuses an empty source document: the issuer's paper is not optional", () => {
    expect(() => compose({ ...base, kind: "split", ratio: "2", source_document: "   " })).toThrow(
      expect.objectContaining({ code: "missing_source_document" }),
    );
  });

  it("refuses an asset the catalogue does not know, as origin or as destination", () => {
    expect(() => compose({ ...base, kind: "split", asset_id: "ast_ghost", ratio: "2" })).toThrow(
      expect.objectContaining({
        code: "unknown_asset",
        details: { asset_id: "ast_ghost", role: "affected" },
      }),
    );
    expect(() =>
      compose({ ...base, kind: "merger", to_asset_id: "ast_ghost", ratio: "1" }),
    ).toThrow(expect.objectContaining({ details: { asset_id: "ast_ghost", role: "destination" } }));
  });

  it("refuses a kind that needs a parameter it was not given", () => {
    for (const params of [
      { ...base, kind: "split" } as CorporateActionParams,
      { ...base, kind: "merger", ratio: "1" } as CorporateActionParams,
      { ...base, kind: "spin_off", to_asset_id: "ast_spin", ratio: "1" } as CorporateActionParams,
      { ...base, kind: "fund_liquidation" } as CorporateActionParams,
    ]) {
      expect(() => compose(params)).toThrow(ValidationError);
      expect(() => compose(params)).toThrow(
        expect.objectContaining({ code: "missing_effect_parameter" }),
      );
    }
  });

  it("treats an empty string as a missing parameter", () => {
    expect(() => compose({ ...base, kind: "split", ratio: "" })).toThrow(
      expect.objectContaining({
        code: "missing_effect_parameter",
        details: { parameter: "ratio", kind: "split" },
      }),
    );
  });

  it("carries the notes when there are some, and leaves the field out when there are none", () => {
    expect(
      compose({ ...base, kind: "split", ratio: "2", notes: "junta del 1/3" }).draft,
    ).toMatchObject({ notes: "junta del 1/3" });
    expect(compose({ ...base, kind: "split", ratio: "2" }).draft).not.toHaveProperty("notes");
  });
});

describe("corporateActionDraft: what it writes is what gets recorded", () => {
  /** The composed draft has to be an event the projection accepts, envelope apart. */
  it("produces a draft the projection applies without complaint", () => {
    const { events, state } = ledger([{ account: "acc_a", quantity: "10" }]);
    const composed = corporateActionDraft(state, events, {
      ...base,
      kind: "reverse_split",
      ratio: "1/3",
      cash: CASH,
    });
    const candidate = {
      schema_version: 1,
      id: "01ARYZ6S41TSV4RRFFQ69G5FZZ",
      recorded_at: "2027-03-01T10:00:00.000Z",
      ...composed.draft,
      fingerprint: "probe",
    } as unknown as CorporateActionEvent;

    const projected = projectLedger([...events, candidate] as LedgerEvent[], {
      collectErrors: true,
    });

    expect(projected.invalid).toEqual([]);
  });
});
