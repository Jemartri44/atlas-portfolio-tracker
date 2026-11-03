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
// A transfer between funds of the same class is no flow (no cash moves). Anything else that touches
// an asset of the class and that this does not model — a corporate action, a transfer that changes
// the class — makes **that class** come out without figure and with the kinds in `unsupported_events`:
// nothing is invented to cover it. Informative; it reads prices and nothing fiscal reads it.

import type { CivilDate } from "../dates/civil-date.js";
import { daysBetween } from "../dates/civil-date.js";
import { type Decimal, HUNDRED } from "../money/decimal.js";
import { EUR, Money } from "../money/money.js";
import { basisOf, fxOf, money } from "../projections/operations.js";
import { businessDateOf, liveOperations, projectLedger } from "../projections/project-ledger.js";
import { readSeries } from "../projections/series.js";
import { coreWeights } from "../projections/weights.js";
import { ASSET_CLASSES, type AssetClass, type LedgerEvent } from "../schema/events.js";
import { annualRateOf, type DatedFlow } from "./core-xirr.js";

export type ClassReturnGap =
  /** A held asset of the class has no price at the date. */
  | "partial"
  /** Nothing was ever bought in the class. */
  | "no_flows"
  /** Something touched the class that is not modelled: see `unsupported_events`. */
  | "unsupported_events"
  /** The flows admit no rate within the bounds. */
  | "no_rate";

export interface ClassReturn {
  asset_class: AssetClass;
  gap?: ClassReturnGap;
  /** Event types the class had that are not modelled. */
  unsupported_events: string[];
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
  const unsupported = new Map<AssetClass, Set<string>>(ASSET_CLASSES.map((c) => [c, new Set()]));
  const put = (assetClass: AssetClass | undefined, date: CivilDate, eur: Money): void => {
    if (assetClass !== undefined && date <= to) {
      (flows.get(assetClass) as Flow[]).push({ date, eur });
    }
  };
  const flag = (assetClass: AssetClass | undefined, kind: string): void => {
    if (assetClass !== undefined) {
      (unsupported.get(assetClass) as Set<string>).add(kind);
    }
  };

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
        const touched = new Set([event.asset_id]);
        for (const effect of event.effects) {
          touched.add(effect.asset_id ?? event.asset_id);
          if ("to_asset_id" in effect) {
            touched.add(effect.to_asset_id);
          }
        }
        for (const assetId of touched) {
          flag(classOf(assetId), "corporate_action");
        }
      }
    } else if (
      event.type === "transfer" &&
      businessDateOf(state, event) <= to &&
      classOf(event.from_asset_id) !== classOf(event.to_asset_id)
    ) {
      flag(classOf(event.from_asset_id), "transfer");
      flag(classOf(event.to_asset_id), "transfer");
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
      const kinds = [...(unsupported.get(assetClass) as Set<string>)].sort();
      const base = { asset_class: assetClass, unsupported_events: kinds };
      const own = flows.get(assetClass) as Flow[];
      const subtotal = byClass.find((row) => row.asset_class === assetClass);
      if (kinds.length > 0) {
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
