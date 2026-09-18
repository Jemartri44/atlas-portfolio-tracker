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
import type { AccountId, AssetId } from "../schema/events.js";
import { adjustCash } from "./cash.js";
import { assertSameBook, requireAccount, requireAsset } from "./catalogue.js";
import { recordGain } from "./gains.js";
import type { ResolvedEffect } from "./kind-rules.js";
import { consume, openLot, openQuantity } from "./lots.js";
import {
  fxOf,
  negative,
  requireAvailable,
  warnCurrency,
  warnFxDate,
  warnHolders,
} from "./operations.js";
import { accountsHolding, adjustPosition, positionOf } from "./positions.js";
import type { Asset, FiscalLot, LedgerState } from "./state.js";
import { noteAcquisition, warnPriorBuys } from "./wash-sale.js";

export interface EffectContext {
  eventId: Ulid;
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

  const slices = consume(state, effect.asset_id, openQuantity(state, effect.asset_id), ctx.eventId);
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
    // Subtraction, so that origin + carved is exactly the cost before.
    lot.cost_eur = lot.cost_eur.sub(carved);
    openLot(state, {
      asset_id: to.asset_id,
      acquisition_date: lot.acquisition_date,
      quantity: scaledLots[index] as Quantity,
      cost_eur: carved,
      source_event_id: ctx.eventId,
      position: lot.position,
      source_lot_id: lot.id,
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
    const slices = consume(state, asset.asset_id, entry.quantity, ctx.eventId);
    const gain = recordGain(state, {
      event_id: ctx.eventId,
      asset_id: asset.asset_id,
      account_id: entry.account_id,
      fiscal_date: ctx.effectiveDate,
      quantity: entry.quantity,
      proceeds_eur: fx.toEur(proceeds),
      slices,
    });
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
    openLot(state, {
      asset_id: asset.asset_id,
      acquisition_date: effect.acquisition_date,
      quantity: entry.quantity,
      cost_eur: fx.toEur(unitCost.times(entry.quantity)),
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
    }
  }
  noteInKindIncome(state, effect, asset.asset_id, ctx.eventId);
  warnCurrency(state, priced, asset);
  warnFxDate(state, priced, effect.acquisition_date);
  warnHolders(state, asset.asset_id, ctx.eventId);
};
