// The corporate actions and moves between custodians of the scenario: a reverse split, a spin-off,
// a merger, a delisting, the merger of a fund, a change of share class, a change of identifier and
// the transfer of custody.

import type { CivilDate } from "../../dates/civil-date.js";
import type { ScenarioContext } from "./context.js";
import { ASSETS, type AssetSpec, cents, d, LATER_ASSETS } from "./data.js";
import {
  closeThesis,
  corporateAction,
  createAsset,
  openThesis,
  picosSale,
  updateAsset,
} from "./ops.js";

export const custodyTransfer = (c: ScenarioContext, date: CivilDate): void => {
  c.b.record(date, {
    type: "transfer",
    from_account_id: "acc_ibkr",
    from_asset_id: "ast_gold",
    quantity_out: String(c.p.goldTransferred),
    value_date_out: date,
    to_account_id: "acc_ibkr2",
    to_asset_id: "ast_gold",
    quantity_in: String(c.p.goldTransferred),
    value_date_in: date,
    notes: "Custody transfer between the two IBKR accounts",
  });
  c.b.expectWarning("same_asset_two_accounts");
};

export const reverseSplit = (c: ScenarioContext, date: CivilDate): void => {
  const price = cents(d(c.p.goldPrice).mul(d("4")));
  corporateAction(
    c,
    "reverse_split",
    "ast_gold",
    date,
    [{ op: "scale", ratio: "1/4" }, picosSale(c, "ast_gold", "ast_gold", "1/4", price, date)],
    "1:4 reverse split; fractional shares cashed out account by account",
  );
};

export const spinOff = (c: ScenarioContext, date: CivilDate): void => {
  createAsset(c, LATER_ASSETS.ast_alpha_spin as AssetSpec, date);
  corporateAction(
    c,
    "spin_off",
    "ast_alpha",
    date,
    [
      { op: "carve_out", to_asset_id: "ast_alpha_spin", ratio: "1/4", cost_share: "0.2" },
      picosSale(c, "ast_alpha", "ast_alpha_spin", "1/4", c.b.rng.decimal(10, 30, 2), date),
    ],
    "Spin-off: one new share per four, 20% of the cost; fractions cashed out",
  );
};

export const merger = (c: ScenarioContext, date: CivilDate): void => {
  createAsset(c, LATER_ASSETS.ast_beta_new as AssetSpec, date);
  const price = cents(d(c.p.betaPrice).mul(d("3")));
  corporateAction(
    c,
    "merger",
    "ast_beta",
    date,
    [
      { op: "convert", to_asset_id: "ast_beta_new", ratio: "1/3" },
      picosSale(c, "ast_beta", "ast_beta_new", "1/3", price, date),
    ],
    "Absorption: one new share per three old; fractions cashed out",
  );
  closeThesis(c, "th_beta", date);
  const invested = d(c.p.betaQuantity).mul(d(c.p.betaPrice)).div(d(c.p.fx));
  openThesis(c, "th_beta_new", "ast_beta_new", invested, date);
};

export const delisting = (c: ScenarioContext, date: CivilDate): void => {
  corporateAction(
    c,
    "delisting",
    "ast_alpha_spin",
    date,
    [],
    "Delisted; position kept without price",
  );
  updateAsset(c, LATER_ASSETS.ast_alpha_spin as AssetSpec, date, false);
};

export const fundMerger = (c: ScenarioContext, date: CivilDate): void => {
  createAsset(c, LATER_ASSETS.ast_smallcap_b as AssetSpec, date);
  corporateAction(
    c,
    "fund_merger",
    "ast_smallcap",
    date,
    [{ op: "convert", to_asset_id: "ast_smallcap_b", ratio: "1.7" }],
    "Fund merger; original acquisition dates and costs kept",
  );
};

export const shareClassChange = (c: ScenarioContext, date: CivilDate): void => {
  createAsset(c, LATER_ASSETS.ast_bonds_i as AssetSpec, date);
  corporateAction(
    c,
    "share_class_change",
    "ast_bonds",
    date,
    [{ op: "convert", to_asset_id: "ast_bonds_i", ratio: "1" }],
    "Cheaper share class; same fund",
  );
};

export const identifierChange = (c: ScenarioContext, date: CivilDate): void => {
  updateAsset(c, { ...(ASSETS[0] as AssetSpec), isin: "XX0000000011" }, date, true);
};
