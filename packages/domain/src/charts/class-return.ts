// What each class of the core has earned on the money put into it, since its first purchase:
// «he puesto X en renta variable, vale Y, he ganado Z %» and the money-weighted annual rate.
//
// **Only the core** (constitution III) and **only the positions of the class**: the cash of the
// accounts belongs to no class, so a class is measured on what moved between it and the cash.
//
//   buy      money into the class   (basis + fee) / rate
//   sell     money out of it        (basis − fee − withholding) / rate
//   dividend money out of it        (gross − withholdings) / rate
//   swap     out of one class and into the other, by the market values of the legs; the fee is paid
//            from cash and charged to neither
//
// A transfer between funds of the same class is no flow (no cash moves); one that changes class
// leaves the origin class at `quantity_out × nav_out` and enters the other at `quantity_in × nav_in`,
// each on its own value date, like a swap by the market values of its legs; a NAV is read in the
// currency of its fund and converted with the ECB rate of that very day the ledger carries; a missing NAV is
// replaced only by the price the ledger holds for **that exact day**, and without one the class
// has no figure and the reason says how to mend it. A corporate action is read by its effects: a
// scale (split, reverse split) moves no money; a forced sale and a cost adjustment bring cash out of
// the class (the proceeds recorded by the projection, less what was withheld; the cash received); a
// conversion or a carve-out inside one class moves nothing. What this does not read — a conversion
// or carve-out that changes class or book, a grant, an
// asset that changes class — leaves **that class** without figure, and `unsupported` says which
// event, when, on which assets: nothing is invented to cover it. Informative; it reads prices and
// nothing fiscal reads it.

import type { CivilDate } from "../dates/civil-date.js";
import { daysBetween } from "../dates/civil-date.js";
import { ratePointsOf } from "../ecb/ledger-rates.js";
import { Decimal, HUNDRED } from "../money/decimal.js";
import { FxRate } from "../money/fx-rate.js";
import { EUR, Money } from "../money/money.js";
import { Price } from "../money/price.js";
import { Quantity } from "../money/quantity.js";
import { basisOf, fxOf, money } from "../projections/operations.js";
import { priceAt } from "../projections/prices.js";
import { businessDateOf, liveOperations, projectLedger } from "../projections/project-ledger.js";
import { readSeries } from "../projections/series.js";
import { settingsAt } from "../projections/settings-at.js";
import { coreWeights } from "../projections/weights.js";
import {
  ASSET_CLASSES,
  type AssetClass,
  type CorporateActionKind,
  type LedgerEvent,
} from "../schema/events.js";
import { annualRateOf, type DatedFlow } from "./core-xirr.js";

export type ClassReturnGap =
  /** A held asset of the class has no price at the date. */
  | "partial"
  /** Nothing was ever bought in the class. */
  | "no_flows"
  /** Something touched the class that is not modelled: see `unsupported`. */
  | "unsupported_events"
  /** The flows admit no rate within the bounds. */
  | "no_rate";

export type UnsupportedReason =
  /** An asset changed its class or its book: the whole history would move with it. */
  | "asset_reclassified"
  /** A conversion or a carve-out that leaves the class or the book. */
  | "corporate_action_reclassifies"
  /** Shares or tokens received at no price the event gives (a fork, a stock dividend). */
  | "corporate_action_grant"
  /** A transfer that changes class, a leg with no NAV and no price of that exact day. */
  | "transfer_without_nav"
  /** A transfer that changes class, a leg in a foreign currency with no ECB rate of that day. */
  | "transfer_without_rate";

export interface UnsupportedEvent {
  reason: UnsupportedReason;
  event_id: string;
  /** The day of the event; of the leg missing its value for `transfer_without_nav`; the day it was recorded for `asset_reclassified`. */
  date: CivilDate;
  /** The assets of the event that the class holds. */
  asset_ids: string[];
  /** Of a corporate action. */
  kind?: CorporateActionKind;
}

export interface ClassReturn {
  asset_class: AssetClass;
  gap?: ClassReturnGap;
  /** What the class had that is not modelled, event by event. */
  unsupported: UnsupportedEvent[];
  /** Σ bought. */
  invested_eur?: Money;
  /** Σ sold and received as dividends. */
  returned_eur?: Money;
  /** The positions of the class at `to`. */
  value_eur?: Money;
  /** `value + returned − invested`. */
  gain_eur?: Money;
  /** `gain / invested`, percent. */
  gain_pct?: Decimal;
  /** Annual money-weighted rate, percent, to 4 decimals. */
  xirr_pct?: Decimal;
}

export interface ClassReturns {
  to: CivilDate;
  classes: ClassReturn[];
}

interface Flow {
  date: CivilDate;
  /** Positive into the class. */
  eur: Money;
}

export const classReturns = (events: readonly LedgerEvent[], to: CivilDate): ClassReturns => {
  const state = projectLedger(events, { collectErrors: true });
  const classOf = (assetId: string): AssetClass | undefined => {
    const asset = state.assets.get(assetId);
    return asset?.book === "core" ? (asset.asset_class as AssetClass | undefined) : undefined;
  };
  const flows = new Map<AssetClass, Flow[]>(ASSET_CLASSES.map((c) => [c, []]));
  const unsupported = new Map<AssetClass, UnsupportedEvent[]>(ASSET_CLASSES.map((c) => [c, []]));
  const put = (assetClass: AssetClass | undefined, date: CivilDate, eur: Money): void => {
    if (assetClass !== undefined && date <= to) {
      (flows.get(assetClass) as Flow[]).push({ date, eur });
    }
  };
  const flag = (assetClass: AssetClass | undefined, item: UnsupportedEvent): void => {
    if (assetClass !== undefined) {
      (unsupported.get(assetClass) as UnsupportedEvent[]).push(item);
    }
  };
  const gainsOf = new Map<string, (typeof state.gains)[number][]>();
  for (const gain of state.gains) {
    gainsOf.set(gain.event_id, [...(gainsOf.get(gain.event_id) ?? []), gain]);
  }
  // The ECB rates the ledger carries, by currency and the day they were published for: a leg whose
  // NAV is in the currency of its fund needs the rate of **its own day**, never the nearest one.
  const publishedRates = new Map<string, Decimal>();
  for (const event of events) {
    for (const point of ratePointsOf(state, event as unknown as Record<string, unknown>)) {
      if (point.rate !== undefined && point.rate_date !== undefined) {
        publishedRates.set(`${point.currency}|${point.rate_date}`, Decimal.parse(point.rate));
      }
    }
  }
  // The value of what a transfer leg moves, in euros: its NAV in the currency of the fund (with the
  // rate of that day), else the price the ledger holds for that very day (the one the valuation of
  // the core uses). Nothing is interpolated: what is missing is named.
  const legValue = (
    assetId: string,
    quantity: string,
    nav: string | undefined,
    date: CivilDate,
  ): Money | "no_nav" | "no_rate" => {
    const units = Quantity.parse(quantity);
    if (nav !== undefined) {
      const currency = state.assets.get(assetId)?.currency ?? EUR;
      const worth = Price.parse(nav, currency).times(units);
      if (currency === EUR) {
        return worth;
      }
      const rate = publishedRates.get(`${currency}|${date}`);
      return rate === undefined ? "no_rate" : FxRate.of(rate, currency, date).toEur(worth);
    }
    const found = priceAt(state, assetId, date, settingsAt(state, date).settings);
    if (found === undefined || found.date !== date) {
      return "no_nav";
    }
    const worth = Price.parse(found.unit_value.toString(), found.currency).times(units);
    if (found.currency === EUR) {
      return worth;
    }
    return found.fx_rate === undefined || found.fx_rate_date === undefined
      ? "no_rate"
      : FxRate.of(found.fx_rate, found.currency, found.fx_rate_date).toEur(worth);
  };

  // The class and the book of an asset are read at their latest, so a change of either, whenever it
  // was recorded, would send the whole history to the new one: both classes come out without figure.
  const seen = new Map<string, { book: string; assetClass: AssetClass | undefined }>();
  for (const event of events) {
    if (
      (event.type !== "asset_created" && event.type !== "asset_updated") ||
      state.reversed.has(event.id)
    ) {
      continue;
    }
    const now = { book: event.book, assetClass: event.asset_class as AssetClass | undefined };
    const before = seen.get(event.asset_id);
    seen.set(event.asset_id, now);
    // At any date: the class is read from the last version, so a later change moves the history too.
    if (
      before !== undefined &&
      (before.book !== now.book || before.assetClass !== now.assetClass)
    ) {
      for (const side of [before, now]) {
        flag(side.book === "core" ? side.assetClass : undefined, {
          reason: "asset_reclassified",
          event_id: event.id,
          date: event.recorded_at.slice(0, 10),
          asset_ids: [event.asset_id],
        });
      }
    }
  }

  for (const event of liveOperations(state, events)) {
    if (event.type === "buy" || event.type === "sell") {
      const fee = money(event.fee, event.currency);
      const rate = fxOf(event);
      const date = businessDateOf(state, event);
      if (event.type === "buy") {
        put(classOf(event.asset_id), date, rate.toEur(basisOf(event).add(fee)));
      } else {
        const withheld =
          event.withholding === undefined
            ? Money.zero(event.currency)
            : money(event.withholding, event.currency);
        put(classOf(event.asset_id), date, rate.toEur(basisOf(event).sub(fee).sub(withheld)).neg());
      }
    } else if (event.type === "swap") {
      const rate = fxOf(event);
      const date = businessDateOf(state, event);
      const out = rate.toEur(money(event.market_value_out, event.currency));
      const received = rate.toEur(money(event.market_value_in, event.currency));
      const from = classOf(event.from_asset_id);
      const into = classOf(event.to_asset_id);
      if (from === into) {
        // Inside one class only the difference moves between the class and the cash.
        put(into, date, received.sub(out));
      } else {
        put(from, date, out.neg());
        put(into, date, received);
      }
    } else if (event.type === "dividend") {
      const net = money(event.gross, event.currency)
        .sub(money(event.withholding_origin, event.currency))
        .sub(money(event.withholding_spain, event.currency));
      put(classOf(event.asset_id), event.value_date, fxOf(event).toEur(net).neg());
    } else if (event.type === "corporate_action") {
      if (event.effective_date <= to) {
        for (const effect of event.effects) {
          const assetId = effect.asset_id ?? event.asset_id;
          const here = classOf(assetId);
          const leave = (reason: UnsupportedReason, side: AssetClass | undefined, ids: string[]) =>
            flag(side, {
              reason,
              event_id: event.id,
              date: event.effective_date,
              asset_ids: ids,
              kind: event.kind,
            });
          if (effect.op === "forced_sale") {
            // An event the projection rejected is not a live operation, so an applied forced sale
            // always has its sale recorded.
            const accounts = new Set(effect.per_account.map((entry) => entry.account_id));
            const sold = (gainsOf.get(event.id) ?? []).filter(
              (gain) => gain.asset_id === assetId && accounts.has(gain.account_id),
            );
            const rate = fxOf({ id: event.id, ...effect });
            const withheld = effect.per_account.reduce(
              (sum, entry) => sum.add(money(entry.withholding ?? "0", effect.currency)),
              Money.zero(effect.currency),
            );
            const proceeds = sold.reduce(
              (sum, gain) => sum.add(gain.proceeds_eur),
              Money.zero(EUR),
            );
            put(here, event.effective_date, proceeds.sub(rate.toEur(withheld)).neg());
          } else if (effect.op === "cost_adjustment") {
            const received = effect.per_account.reduce(
              (sum, entry) => sum.add(money(entry.amount, effect.currency)),
              Money.zero(effect.currency),
            );
            put(
              here,
              event.effective_date,
              fxOf({ id: event.id, ...effect })
                .toEur(received)
                .neg(),
            );
          } else if (effect.op === "grant") {
            leave("corporate_action_grant", here, [assetId]);
          } else if (effect.op !== "scale") {
            // convert / carve_out: no money moves while the value stays in the class and the book.
            const there = classOf(effect.to_asset_id);
            if (here !== there) {
              leave("corporate_action_reclassifies", here, [assetId, effect.to_asset_id]);
              leave("corporate_action_reclassifies", there, [assetId, effect.to_asset_id]);
            }
          }
        }
      }
    } else if (event.type === "transfer") {
      const from = classOf(event.from_asset_id);
      const into = classOf(event.to_asset_id);
      if (from !== into) {
        const legs = [
          {
            side: from,
            asset: event.from_asset_id,
            quantity: event.quantity_out,
            nav: event.nav_out,
            date: event.value_date_out,
            sign: -1,
          },
          {
            side: into,
            asset: event.to_asset_id,
            quantity: event.quantity_in,
            nav: event.nav_in,
            date: event.value_date_in,
            sign: 1,
          },
        ];
        for (const leg of legs) {
          if (leg.side === undefined || leg.date > to) {
            continue;
          }
          const value = legValue(leg.asset, leg.quantity, leg.nav, leg.date);
          if (typeof value === "string") {
            flag(leg.side, {
              reason: value === "no_nav" ? "transfer_without_nav" : "transfer_without_rate",
              event_id: event.id,
              date: leg.date,
              asset_ids: [leg.asset],
            });
          } else {
            put(leg.side, leg.date, leg.sign < 0 ? value.neg() : value);
          }
        }
      }
    }
  }

  const { points } = readSeries(events, { to, dates: [to] }, (at, date, settings) => ({
    point: coreWeights(at, date, settings).by_class,
    incomplete: false,
  }));
  const byClass = points[0] as ReturnType<typeof coreWeights>["by_class"];

  return {
    to,
    classes: ASSET_CLASSES.map((assetClass): ClassReturn => {
      const events = (unsupported.get(assetClass) as UnsupportedEvent[]).sort((a, b) =>
        a.date === b.date ? a.event_id.localeCompare(b.event_id) : a.date.localeCompare(b.date),
      );
      const base = { asset_class: assetClass, unsupported: events };
      const own = flows.get(assetClass) as Flow[];
      const subtotal = byClass.find((row) => row.asset_class === assetClass);
      if (events.length > 0) {
        return { ...base, gap: "unsupported_events" };
      }
      if (own.length === 0) {
        return { ...base, gap: "no_flows" };
      }
      // A class with no row at the date holds nothing (and has no price missing).
      if (subtotal?.partial === true) {
        return { ...base, gap: "partial" };
      }
      const value = subtotal?.value_eur ?? Money.zero(EUR);
      const invested = own
        .filter((flow) => flow.eur.amount.isPositive())
        .reduce((sum, flow) => sum.add(flow.eur), Money.zero(EUR));
      const returned = own
        .filter((flow) => !flow.eur.amount.isPositive())
        .reduce((sum, flow) => sum.sub(flow.eur), Money.zero(EUR));
      const gain = value.add(returned).sub(invested);
      const dated: DatedFlow[] = own.map((flow) => ({
        days: daysBetween(flow.date, to),
        eur: flow.eur.amount,
      }));
      const rate = annualRateOf(dated, value.amount);
      const figures = {
        ...base,
        invested_eur: invested,
        returned_eur: returned,
        value_eur: value,
        gain_eur: gain,
        ...(invested.amount.isPositive()
          ? { gain_pct: gain.amount.div(invested.amount).mul(HUNDRED) }
          : {}),
      };
      return rate === undefined ? { ...figures, gap: "no_rate" } : { ...figures, xirr_pct: rate };
    }),
  };
};
