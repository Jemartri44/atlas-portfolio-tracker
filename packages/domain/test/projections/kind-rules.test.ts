import { describe, expect, it } from "vitest";
import { ProjectionError } from "../../src/errors.js";
import {
  checkEffectsAgainstKind,
  isLiquidation,
  KIND_RULES,
  type ResolvedEffect,
  targetOf,
} from "../../src/projections/kind-rules.js";
import { CORPORATE_ACTION_KINDS, type CorporateActionKind } from "../../src/schema/events.js";

const OLD = "ast_old";
const NEW = "ast_new";
const SPIN = "ast_spin";
const RIGHTS = "ast_rights";

const scale = (asset_id = OLD): ResolvedEffect => ({ op: "scale", ratio: "2", asset_id });
const convert = (to_asset_id = NEW, asset_id = OLD): ResolvedEffect => ({
  op: "convert",
  to_asset_id,
  ratio: "1/2",
  asset_id,
});
const carveOut = (asset_id = OLD): ResolvedEffect => ({
  op: "carve_out",
  to_asset_id: SPIN,
  ratio: "1/4",
  cost_share: "0.2",
  asset_id,
});
const sale = (asset_id = OLD): ResolvedEffect => ({
  op: "forced_sale",
  asset_id,
  per_account: [{ account_id: "acc_a", quantity: "all" }],
  unit_price: "1",
  currency: "EUR",
  fx_rate: "1",
  fx_rate_date: "2027-03-01",
});
const grant = (asset_id = RIGHTS): ResolvedEffect => ({
  op: "grant",
  asset_id,
  per_account: [{ account_id: "acc_a", quantity: "10" }],
  unit_cost: "0",
  currency: "EUR",
  fx_rate: "1",
  fx_rate_date: "2027-03-01",
  acquisition_date: "2027-03-01",
});

const accepts = (kind: CorporateActionKind, effects: ResolvedEffect[]): void => {
  expect(() => checkEffectsAgainstKind(kind, effects, OLD, "01F")).not.toThrow();
};

const rejects = (kind: CorporateActionKind, effects: ResolvedEffect[]): ProjectionError => {
  try {
    checkEffectsAgainstKind(kind, effects, OLD, "01F");
  } catch (error) {
    expect(error).toBeInstanceOf(ProjectionError);
    expect((error as ProjectionError).code).toBe("effects_not_allowed_for_kind");
    return error as ProjectionError;
  }
  throw new Error(`expected ${kind} to reject`);
};

describe("KIND_RULES", () => {
  it("has exactly one row per kind of data-schema.md §8.5", () => {
    expect(Object.keys(KIND_RULES).sort()).toEqual([...CORPORATE_ACTION_KINDS].sort());
    expect(isLiquidation("fund_liquidation")).toBe(true);
    expect(isLiquidation("issuer_liquidation")).toBe(true);
    expect(isLiquidation("split")).toBe(false);
    expect(isLiquidation("issuer_restructuring")).toBe(false);
  });

  it("accepts every admitted sequence", () => {
    accepts("split", [scale()]);
    accepts("reverse_split", [scale()]);
    accepts("reverse_split", [scale(), sale()]);
    accepts("stock_dividend", [scale()]);
    accepts("stock_dividend", [grant()]);
    accepts("stock_dividend", [grant(OLD)]);
    accepts("stock_dividend", [grant(), sale(RIGHTS)]);
    accepts("merger", [convert()]);
    accepts("merger", [sale(), convert()]);
    accepts("merger", [convert(), sale(NEW)]);
    accepts("spin_off", [carveOut()]);
    accepts("spin_off", [carveOut(), sale(SPIN)]);
    accepts("fund_merger", [convert()]);
    accepts("share_class_change", [convert()]);
    accepts("token_migration", [convert()]);
    accepts("fund_liquidation", [sale()]);
    accepts("issuer_liquidation", [sale()]);
    accepts("delisting", []);
    accepts("crypto_fork", [grant("ast_fork")]);
    accepts("issuer_restructuring", [convert()]);
    accepts("issuer_restructuring", [sale("ast_other")]);
    accepts("issuer_restructuring", [convert(), sale(NEW), convert(SPIN, NEW)]);
  });

  it("rejects sequences outside the row, with the admitted ones in the details", () => {
    const error = rejects("split", [convert()]);
    expect(error.details).toMatchObject({
      kind: "split",
      effects: ["convert@ast_old"],
      allowed: ["scale@event"],
    });
    rejects("split", []);
    rejects("split", [scale(), scale()]);
    rejects("delisting", [scale()]);
    expect(rejects("delisting", [sale()]).details.allowed).toEqual(["(no effects)"]);
    rejects("issuer_restructuring", []);
    rejects("issuer_restructuring", [scale()]);
    rejects("issuer_restructuring", [convert(), grant()]);
    expect(rejects("issuer_restructuring", [scale()]).details.allowed).toEqual([
      "one or more of convert|forced_sale",
    ]);
    rejects("fund_liquidation", [sale(), sale()]);
    rejects("crypto_fork", [scale()]);
  });

  it("checks on which asset each step acts", () => {
    rejects("split", [scale(NEW)]);
    rejects("reverse_split", [scale(), sale(NEW)]);
    rejects("merger", [sale(NEW), convert()]);
    rejects("merger", [convert(), sale(OLD)]);
    rejects("merger", [convert(), sale(SPIN)]);
    rejects("merger", [convert(NEW, SPIN)]);
    rejects("spin_off", [carveOut(), sale(OLD)]);
    rejects("stock_dividend", [grant(), sale(OLD)]);
    rejects("fund_merger", [convert(NEW, SPIN)]);
  });

  it("derives the asset a step leaves for the next one", () => {
    expect(targetOf(convert())).toBe(NEW);
    expect(targetOf(carveOut())).toBe(SPIN);
    expect(targetOf(grant())).toBe(RIGHTS);
    expect(targetOf(scale())).toBe(OLD);
    expect(targetOf(sale(NEW))).toBe(NEW);
  });
});
