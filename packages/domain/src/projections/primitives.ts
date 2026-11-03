// The five lot primitives of a corporate action (ADR-0011, data-schema.md §6.5).
// Each one validates everything before mutating and reuses the FIFO inventory
// (`consume`, `openLot`), the gains ledger (`recordGain`) and the position and
// cash projections: there is no second FIFO.

import { type CivilDate, yearOf } from "../dates/civil-date.js";
import { ProjectionError } from "../errors.js";
import type { Ulid } from "../ids/ulid.js";
import { Decimal } from "../money/decimal.js";
import { Money } from "../money/money.js";
import { Price } from "../money/price.js";
import { Quantity } from "../money/quantity.js";
import { Ratio, scaleQuantities } from "../money/ratio.js";
import type { AccountId, AssetId, CorporateActionKind } from "../schema/events.js";
import { adjustCash } from "./cash.js";
import { assertSameBook, requireAccount, requireAsset } from "./catalogue.js";
import { recordGain } from "./gains.js";
import { recordIncome } from "./income.js";
import type { ResolvedEffect } from "./kind-rules.js";
import { consume, openLot, openQuantity } from "./lots.js";
import {
  fxOf,
  negative,
  receiveProceeds,
  requireAvailable,
  warnCurrency,
  warnFxDate,
  warnHolders,
} from "./operations.js";
import { accountsHolding, adjustPosition, positionOf } from "./positions.js";
import type { Asset, FiscalLot, LedgerState } from "./state.js";
import { noteAcquisition, warnPriorBuys, warnRepurchase } from "./wash-sale.js";

export interface EffectContext {
  eventId: Ulid;
  kind: CorporateActionKind;
  /** Every effect of the action is a `scale`: it may find nothing to scale. */
  scaleOnly: boolean;
  /** File position of the corporate action: FIFO tie-break of the lots a `grant` creates. */
  position: number;
  effectiveDate: CivilDate;
}

export type Resolved<Op extends ResolvedEffect["op"]> = Extract<ResolvedEffect, { op: Op }>;

const requireOpenLots = (state: LedgerState, assetId: AssetId, eventId: Ulid): FiscalLot[] => {
  const open = state.lots.get(assetId)?.open ?? [];
  if (open.length === 0) {
    throw new ProjectionError(
      "no_open_lots",
      eventId,
      `asset ${assetId} has no open lots to transform`,
      { asset_id: assetId },
    );
  }
  return open;
};

/** Destination of `convert`/`carve_out`: exists, same book, different asset. */
const requireTarget = (
  state: LedgerState,
  effect: { asset_id: AssetId; to_asset_id: AssetId },
  eventId: Ulid,
): Asset => {
  const from = requireAsset(state, effect.asset_id, eventId);
  const to = requireAsset(state, effect.to_asset_id, eventId);
  if (from.asset_id === to.asset_id) {
    throw new ProjectionError(
      "same_asset",
      eventId,
      `cannot convert ${from.asset_id} into itself`,
      {
        asset_id: from.asset_id,
      },
    );
  }
  if (from.book !== to.book) {
    throw new ProjectionError(
      "book_mismatch",
      eventId,
      `assets ${from.asset_id} (${from.book}) and ${to.asset_id} (${to.book}) belong to different books`,
      { asset_id: from.asset_id, to_asset_id: to.asset_id },
    );
  }
  return to;
};

interface Holding {
  account_id: AccountId;
  quantity: Quantity;
}

/** Accounts with a positive position of the asset, in order of first appearance in the ledger. */
const holdingsOf = (state: LedgerState, assetId: AssetId): Holding[] =>
  accountsHolding(state, assetId).map((account_id) => ({
    account_id,
    quantity: positionOf(state, account_id, assetId),
  }));

/** Physical positions scaled account by account; the last account takes the exact remainder. */
const scaledHoldings = (holdings: readonly Holding[], ratio: Ratio): Quantity[] =>
  scaleQuantities(
    holdings.map((holding) => holding.quantity),
    ratio,
  );

export const applyScale = (
  state: LedgerState,
  effect: Resolved<"scale">,
  ctx: EffectContext,
): void => {
  // A split of an asset nobody holds transforms nothing, and it still happened:
  // the units of the asset are others from then on. An action that only
  // scales is recorded without open lots, and the journal keeps its ratio for
  // the tax engine: selling everything at a loss, a
  // reverse split while holding nothing and a repurchase inside the window
  // compared units of before and after without knowing it.
  if (ctx.scaleOnly && (state.lots.get(effect.asset_id)?.open ?? []).length === 0) {
    state.lotJournal.push({
      kind: "units",
      asset_id: effect.asset_id,
      event_id: ctx.eventId,
      ratio: effect.ratio,
    });
    return;
  }
  const lots = requireOpenLots(state, effect.asset_id, ctx.eventId);
  const ratio = Ratio.parse(effect.ratio);
  const holdings = holdingsOf(state, effect.asset_id);
  const scaledLots = scaleQuantities(
    lots.map((lot) => lot.quantity),
    ratio,
  );
  const scaledPositions = scaledHoldings(holdings, ratio);

  lots.forEach((lot, index) => {
    lot.quantity = scaledLots[index] as Quantity;
    state.lotJournal.push({
      kind: "scale",
      lot_id: lot.id,
      event_id: ctx.eventId,
      quantity_after: lot.quantity,
      ratio: effect.ratio,
    });
  });
  holdings.forEach((holding, index) => {
    adjustPosition(
      state,
      holding.account_id,
      effect.asset_id,
      (scaledPositions[index] as Quantity).sub(holding.quantity),
      ctx.eventId,
    );
  });
};

export const applyConvert = (
  state: LedgerState,
  effect: Resolved<"convert">,
  ctx: EffectContext,
): void => {
  requireOpenLots(state, effect.asset_id, ctx.eventId);
  const to = requireTarget(state, effect, ctx.eventId);
  const ratio = Ratio.parse(effect.ratio);
  const holdings = holdingsOf(state, effect.asset_id);
  const scaledPositions = scaledHoldings(holdings, ratio);

  const slices = consume(
    state,
    effect.asset_id,
    openQuantity(state, effect.asset_id),
    ctx.eventId,
    "convert",
  );
  const scaledLots = scaleQuantities(
    slices.map((slice) => slice.quantity),
    ratio,
  );
  slices.forEach((slice, index) => {
    openLot(state, {
      asset_id: to.asset_id,
      acquisition_date: slice.acquisition_date,
      quantity: scaledLots[index] as Quantity,
      cost_eur: slice.cost_eur,
      cost: slice.cost,
      funding_eur: slice.funding_eur,
      source_event_id: ctx.eventId,
      // FIFO tie-break keeps the origin event of the consumed lot (data-schema.md §8.1).
      position: slice.position,
      source_lot_id: slice.lot_id,
    });
  });
  holdings.forEach((holding, index) => {
    adjustPosition(
      state,
      holding.account_id,
      effect.asset_id,
      negative(holding.quantity),
      ctx.eventId,
    );
    adjustPosition(
      state,
      holding.account_id,
      to.asset_id,
      scaledPositions[index] as Quantity,
      ctx.eventId,
    );
  });
  warnHolders(state, to.asset_id, ctx.eventId);
};

export const applyCarveOut = (
  state: LedgerState,
  effect: Resolved<"carve_out">,
  ctx: EffectContext,
): void => {
  const lots = [...requireOpenLots(state, effect.asset_id, ctx.eventId)];
  const to = requireTarget(state, effect, ctx.eventId);
  const ratio = Ratio.parse(effect.ratio);
  const share = Decimal.parse(effect.cost_share);
  const holdings = holdingsOf(state, effect.asset_id);
  const scaledLots = scaleQuantities(
    lots.map((lot) => lot.quantity),
    ratio,
  );
  const scaledPositions = scaledHoldings(holdings, ratio);

  lots.forEach((lot, index) => {
    const carved = lot.cost_eur.mul(share);
    const carvedCost = lot.cost.mul(share);
    const carvedFunding = lot.funding_eur.mul(share);
    // Subtraction, so that origin + carved is exactly the cost before.
    lot.cost_eur = lot.cost_eur.sub(carved);
    lot.cost = lot.cost.sub(carvedCost);
    lot.funding_eur = lot.funding_eur.sub(carvedFunding);
    const into = openLot(state, {
      asset_id: to.asset_id,
      acquisition_date: lot.acquisition_date,
      quantity: scaledLots[index] as Quantity,
      cost_eur: carved,
      cost: carvedCost,
      funding_eur: carvedFunding,
      source_event_id: ctx.eventId,
      position: lot.position,
      source_lot_id: lot.id,
    });
    // After the `open`: the journal says the new lot exists, then that a share
    // of the origin's cost went into it.
    state.lotJournal.push({
      kind: "carve",
      lot_id: lot.id,
      into_lot_id: into.id,
      event_id: ctx.eventId,
      cost_share: share,
    });
  });
  holdings.forEach((holding, index) => {
    adjustPosition(
      state,
      holding.account_id,
      to.asset_id,
      scaledPositions[index] as Quantity,
      ctx.eventId,
    );
  });
  warnHolders(state, to.asset_id, ctx.eventId);
};

const requireUniqueAccounts = (
  entries: readonly { account_id: AccountId }[],
  eventId: Ulid,
): void => {
  const seen = new Set<AccountId>();
  for (const entry of entries) {
    if (seen.has(entry.account_id)) {
      throw new ProjectionError(
        "duplicate_account_in_effect",
        eventId,
        `account ${entry.account_id} appears twice in per_account`,
        { account_id: entry.account_id },
      );
    }
    seen.add(entry.account_id);
  }
};

export const applyForcedSale = (
  state: LedgerState,
  effect: Resolved<"forced_sale">,
  ctx: EffectContext,
): void => {
  const asset = requireAsset(state, effect.asset_id, ctx.eventId);
  requireUniqueAccounts(effect.per_account, ctx.eventId);
  const priced = { id: ctx.eventId, ...effect };
  const fx = fxOf(priced);
  const price = Price.parse(effect.unit_price, effect.currency);
  const entries = effect.per_account.map((entry) => {
    const account = requireAccount(state, entry.account_id, ctx.eventId);
    assertSameBook(account, asset, ctx.eventId);
    const quantity =
      entry.quantity === "all"
        ? positionOf(state, entry.account_id, asset.asset_id)
        : Quantity.parse(entry.quantity);
    if (!quantity.isPositive()) {
      throw new ProjectionError(
        "insufficient_position",
        ctx.eventId,
        `account ${entry.account_id} holds nothing of ${asset.asset_id} to sell`,
        { account_id: entry.account_id, asset_id: asset.asset_id, available: "0" },
      );
    }
    requireAvailable(state, entry.account_id, asset.asset_id, quantity, ctx.eventId);
    return {
      account_id: entry.account_id,
      quantity,
      fee: Money.parse(entry.fee ?? "0", effect.currency),
      withholding: Money.parse(entry.withholding ?? "0", effect.currency),
    };
  });

  for (const entry of entries) {
    const proceeds = price.times(entry.quantity).sub(entry.fee);
    // The withholding leaves the cash and nothing else, exactly as in a `sell`:
    // it is a payment on account, not a cost of the disposal, so the gain is
    // computed on the full proceeds (ADR-0021, fiscal question #12).
    adjustCash(state, entry.account_id, proceeds.sub(entry.withholding));
    adjustPosition(state, entry.account_id, asset.asset_id, negative(entry.quantity), ctx.eventId);
    const slices = consume(state, asset.asset_id, entry.quantity, ctx.eventId, "transmission");
    const { gain, carried_eur: carried } = recordGain(state, {
      event_id: ctx.eventId,
      asset_id: asset.asset_id,
      account_id: entry.account_id,
      fiscal_date: ctx.effectiveDate,
      quantity: entry.quantity,
      proceeds_eur: fx.toEur(proceeds),
      proceeds: { amount: proceeds, fx },
      slices,
    });
    receiveProceeds(
      state,
      {
        event_id: ctx.eventId,
        account_id: entry.account_id,
        amount: proceeds.sub(entry.withholding),
        date: ctx.effectiveDate,
      },
      carried.sub(fx.toEur(entry.withholding)),
      undefined,
    );
    // A forced sale is a transmission like any other: a fund liquidation, the
    // cash in lieu of a reverse split or the cash leg of a merger can realize a
    // loss, and the rule looks at the loss, not at who decided the sale
    // (data-schema.md §8.4). The other half of the window — an acquisition
    // **after** this loss — already worked, because it walks the recorded gains.
    if (gain.gain_eur.amount.isNegative()) {
      warnPriorBuys(
        state,
        ctx.eventId,
        asset.asset_id,
        asset.asset_type,
        ctx.effectiveDate,
        gain.gain_eur,
      );
    }
  }
  warnCurrency(state, priced, asset);
  warnFxDate(state, priced, ctx.effectiveDate);
};

/**
 * What the grant hands over as income, recorded and nothing else (ADR-0021).
 *
 * One entry per effect and **not per account**: `income_eur` is the market
 * value of what was received, one figure the user read off one source, and
 * splitting it between accounts would mean deciding a rounding nobody asked
 * for. The lots are per account because a position is; the income is not.
 *
 * It reaches `investmentIncome`, `realizedGains` and no taxable base: declaring
 * income on receipt is a criterion in dispute (`docs/fiscal-questions.md` #8)
 * and phase 5 decides it, not this.
 */
const noteInKindIncome = (
  state: LedgerState,
  effect: Resolved<"grant">,
  assetId: AssetId,
  eventId: Ulid,
): void => {
  if (effect.income_eur === undefined || effect.income_base === undefined) {
    return;
  }
  state.inKindIncome.push({
    event_id: eventId,
    asset_id: assetId,
    fiscal_date: effect.acquisition_date,
    year: yearOf(effect.acquisition_date),
    amount_eur: Money.parse(effect.income_eur, "EUR"),
    base: effect.income_base,
  });
};

export const applyGrant = (
  state: LedgerState,
  effect: Resolved<"grant">,
  ctx: EffectContext,
): void => {
  const asset = requireAsset(state, effect.asset_id, ctx.eventId);
  requireUniqueAccounts(effect.per_account, ctx.eventId);
  const priced = { id: ctx.eventId, ...effect };
  const fx = fxOf(priced);
  const unitCost = Price.parse(effect.unit_cost, effect.currency);
  const entries = effect.per_account.map((entry) => {
    const account = requireAccount(state, entry.account_id, ctx.eventId);
    assertSameBook(account, asset, ctx.eventId);
    return { account_id: entry.account_id, quantity: Quantity.parse(entry.quantity) };
  });

  for (const entry of entries) {
    const cost = unitCost.times(entry.quantity);
    // No currency is spent on a grant: what is tied up in it is its cost.
    openLot(state, {
      asset_id: asset.asset_id,
      acquisition_date: effect.acquisition_date,
      quantity: entry.quantity,
      cost_eur: fx.toEur(cost),
      cost,
      funding_eur: fx.toEur(cost),
      source_event_id: ctx.eventId,
      position: ctx.position,
    });
    adjustPosition(state, entry.account_id, asset.asset_id, entry.quantity, ctx.eventId);
    // Shares granted **with a cost** are an acquisition for the wash-sale rule;
    // free ones are not (data-schema.md §8.4).
    if (!unitCost.amount.isZero()) {
      noteAcquisition(state, {
        event_id: ctx.eventId,
        asset_id: asset.asset_id,
        fiscal_date: effect.acquisition_date,
        quantity: entry.quantity,
      });
      warnRepurchase(
        state,
        ctx.eventId,
        asset.asset_id,
        asset.asset_type,
        effect.acquisition_date,
        entry.quantity,
      );
    }
  }
  noteInKindIncome(state, effect, asset.asset_id, ctx.eventId);
  warnCurrency(state, priced, asset);
  warnFxDate(state, priced, effect.acquisition_date);
  warnHolders(state, asset.asset_id, ctx.eventId);
};

/**
 * The lots a `cost_adjustment` lowers: the ones this same event created —the
 * cash of a merger compensates what the merger handed over, not the shares of
 * the destination the user already held— or, when it created none, every open
 * lot of the asset.
 */
const adjustedLots = (state: LedgerState, assetId: AssetId, eventId: Ulid): FiscalLot[] => {
  const open = requireOpenLots(state, assetId, eventId);
  const created = open.filter((lot) => lot.source_event_id === eventId);
  return created.length > 0 ? created : open;
};

/**
 * Cash that lowers the acquisition value of the lots instead of selling them
 * (arts. 80.3 and 81.2 LIS; arts. 25.1.e and 33.3.a LIRPF). The euros received
 * are shared among the lots by units —every unit received the same— and each
 * lot keeps its quantity and its date. What exceeds a lot's cost leaves it at
 * zero and is movable capital income in a `capital_return`; in an exchange the
 * law only says the value «se disminuirá», so an excess is refused rather than
 * given a treatment no source names.
 */
export const applyCostAdjustment = (
  state: LedgerState,
  effect: Resolved<"cost_adjustment">,
  ctx: EffectContext,
): void => {
  const asset = requireAsset(state, effect.asset_id, ctx.eventId);
  requireUniqueAccounts(effect.per_account, ctx.eventId);
  const priced = { id: ctx.eventId, ...effect };
  const fx = fxOf(priced);
  const entries = effect.per_account.map((entry) => {
    const account = requireAccount(state, entry.account_id, ctx.eventId);
    assertSameBook(account, asset, ctx.eventId);
    if (!positionOf(state, entry.account_id, asset.asset_id).isPositive()) {
      throw new ProjectionError(
        "insufficient_position",
        ctx.eventId,
        `account ${entry.account_id} holds nothing of ${asset.asset_id} to receive cash for`,
        { account_id: entry.account_id, asset_id: asset.asset_id, available: "0" },
      );
    }
    return { account_id: entry.account_id, amount: Money.parse(entry.amount, effect.currency) };
  });
  const lots = adjustedLots(state, asset.asset_id, ctx.eventId);
  const total = entries.reduce((sum, entry) => sum.add(entry.amount), Money.zero(effect.currency));
  const totalEur = fx.toEur(total);
  const units = lots.reduce((sum, lot) => sum.add(lot.quantity), Quantity.ZERO);

  let left = totalEur;
  let excess = Money.zero(totalEur.currency);
  const plan = lots.map((lot, index) => {
    // The last lot takes the exact remainder: the lots lower by the euros received, to the digit.
    const share =
      index === lots.length - 1 ? left : totalEur.mul(lot.quantity.value).div(units.value);
    left = left.sub(share);
    const lowered = share.cmp(lot.cost_eur) > 0 ? lot.cost_eur : share;
    excess = excess.add(share.sub(lowered));
    return { lot, lowered };
  });
  if (excess.amount.isPositive() && ctx.kind !== "capital_return") {
    throw new ProjectionError(
      "cost_adjustment_exceeds_cost",
      ctx.eventId,
      `the cash of this ${ctx.kind} exceeds the cost of the lots it lowers`,
      { kind: ctx.kind, asset_id: asset.asset_id, excess_eur: excess.amount.toString() },
    );
  }

  for (const { lot, lowered } of plan) {
    const remaining = lot.cost_eur.sub(lowered);
    // `cost` and `funding_eur` split like `cost_eur` (as in a carve-out). A lot
    // left with some cost had some before, so the division is never by zero.
    if (remaining.isZero()) {
      lot.cost = Money.zero(lot.cost.currency);
      lot.funding_eur = Money.zero(lot.funding_eur.currency);
    } else {
      const factor = remaining.amount.div(lot.cost_eur.amount);
      lot.cost = lot.cost.mul(factor);
      lot.funding_eur = lot.funding_eur.mul(factor);
    }
    lot.cost_eur = remaining;
    state.lotJournal.push({
      kind: "adjust",
      lot_id: lot.id,
      event_id: ctx.eventId,
      cost_eur: lowered,
    });
  }

  for (const entry of entries) {
    adjustCash(state, entry.account_id, entry.amount);
    receiveProceeds(
      state,
      {
        event_id: ctx.eventId,
        account_id: entry.account_id,
        amount: entry.amount,
        date: ctx.effectiveDate,
      },
      fx.toEur(entry.amount),
      undefined,
    );
    if (excess.amount.isPositive()) {
      // Every account's cash carries the same proportion of excess.
      const gross = entry.amount.mul(excess.amount).div(totalEur.amount);
      recordIncome(state, {
        event_id: ctx.eventId,
        kind: "capital_return",
        account_id: entry.account_id,
        asset_id: asset.asset_id,
        value_date: ctx.effectiveDate,
        gross,
        withholding_origin: Money.zero(effect.currency),
        withholding_spain: Money.zero(effect.currency),
        fx,
      });
    }
  }
  warnCurrency(state, priced, asset);
  warnFxDate(state, priced, ctx.effectiveDate);
};
