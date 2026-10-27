// What each fiscal criterion puts at stake in the year: the report read again
// with the other reading of every criterion the year applies.

import { Decimal } from "../money/decimal.js";
import { sum, zero } from "../money/eur.js";
import { FxRate } from "../money/fx-rate.js";
import type { Money } from "../money/money.js";
import {
  ASSET_TYPES,
  type AssetType,
  type CorporateActionEvent,
  type LedgerEvent,
} from "../schema/events.js";
import {
  DEFAULT_SETTINGS,
  fxGainMethodOf,
  incomeCategoryOf,
  type Settings,
} from "../settings/settings.js";
import { washSaleWindowOf } from "../settings/wash-sale.js";
import { isInvalid, isUnsupported, type TaxOptions } from "./chain.js";
import { type Core, exchangesOfYear, tryComputeCore } from "./core.js";
import { CRITERION_IDS, type CriterionId, categoryCriterion, FISCAL_CRITERIA } from "./criteria.js";
import type { CriterionStake, TransmissionLine } from "./report.js";
import { linesByKey } from "./shared.js";
import type { WashSaleOutcome } from "./wash-sale.js";

// --- What each criterion puts at stake -----------------------------------------

interface Figures {
  base: Money;
  pending: Money;
  deferred: Money;
}

const figuresOf = (core: Core): Figures => ({
  base: core.compensation.base_eur,
  pending: sum(core.compensation.pending.map((entry) => entry.amount_eur)),
  deferred: sum(core.pendingDeferrals.map((entry) => entry.amount_eur)).roundToCents(),
});

const directionOf = (
  baseDifference: Money,
  pendingDifference: Money,
): CriterionStake["direction"] => {
  if (baseDifference.isNegative()) {
    return "conservative";
  }
  if (!baseDifference.isZero()) {
    return "aggressive";
  }
  // The year does not move: the carry-forward may. More losses left to carry
  // under the other reading means the current one leaves less for later.
  if (pendingDifference.isNegative()) {
    return "conservative";
  }
  return pendingDifference.isZero() ? "none" : "aggressive";
};

const item = (
  criterion: CriterionId,
  fields: Omit<CriterionStake, "criterion" | "certainty" | "documented_risk">,
): CriterionStake => ({
  criterion,
  certainty: FISCAL_CRITERIA[criterion].certainty,
  documented_risk: FISCAL_CRITERIA[criterion].risk,
  ...fields,
  // An event that made several lines (a restructuring with two sales) is one event.
  event_ids: [...new Set(fields.event_ids)],
});

/** The settings of the other reading of each configurable criterion. */
const alternatives = (settings: Settings): { criterion: CriterionId; settings: Settings }[] => {
  const flipped = Object.fromEntries(
    ASSET_TYPES.map((type) => [
      type,
      (settings.fiscal_date_rule[type] ?? DEFAULT_SETTINGS.fiscal_date_rule[type]) === "trade_date"
        ? "value_date"
        : "trade_date",
    ]),
  );
  // The other side of #2 for the types that apply one side today: the
  // alternative is labelled by the window applied, like the figures. A reading
  // nobody applies is not computed.
  const windows = (
    criterion: CriterionId,
    types: readonly AssetType[],
    from: "1y" | "2m",
    to: "1y" | "2m",
  ): { criterion: CriterionId; settings: Settings }[] => {
    const applying = types.filter((type) => washSaleWindowOf(settings, type) === from);
    return applying.length === 0
      ? []
      : [
          {
            criterion,
            settings: {
              ...settings,
              wash_sale_window: {
                ...settings.wash_sale_window,
                ...Object.fromEntries(applying.map((type) => [type, to])),
              },
            },
          },
        ];
  };
  // Movable capital income has a fixed window (art. 25.2.b): no other reading to compute.
  const listed = (["stock", "etf", "etc", "etp"] as const).filter(
    (type) => incomeCategoryOf(settings, type) === "capital_gain",
  );
  // #24, one reading per type: which of the four variants each one applies
  // depends on its own `income_category`, so they are not flipped together.
  const category = (type: "etc" | "etp"): { criterion: CriterionId; settings: Settings } => {
    const applied = incomeCategoryOf(settings, type);
    return {
      criterion: categoryCriterion(type, applied),
      settings: {
        ...settings,
        income_category: {
          ...settings.income_category,
          [type]: applied === "capital_gain" ? "movable_capital" : "capital_gain",
        },
      },
    };
  };
  return [
    { criterion: "1", settings: { ...settings, fiscal_date_rule: flipped } },
    // #4, the method: first in currency or leg by leg. The other reading runs the
    // whole chain, so its figure carries the exchange differences it moves too.
    {
      criterion: "4",
      settings: {
        ...settings,
        fx_gain_method:
          fxGainMethodOf(settings) === "currency_first" ? "each_leg" : "currency_first",
      },
    },
    ...windows("2:listed", listed, "2m", "1y"),
    ...windows("2:listed_1y", listed, "1y", "2m"),
    ...windows("2:crypto", ["crypto"], "1y", "2m"),
    ...windows("2:crypto_2m", ["crypto"], "2m", "1y"),
    // Funds, since the correction of 2026-09-22: a criterion that is doubtful
    // and offers no figure is of no use to anybody, so the other reading is
    // computed like the one of listed securities.
    ...windows("2:fund_2m", ["fund", "money_market"], "2m", "1y"),
    ...windows("2:fund_1y", ["fund", "money_market"], "1y", "2m"),
    {
      criterion: "2b",
      settings: {
        ...settings,
        wash_sale_transfer_counts: settings.wash_sale_transfer_counts === false,
      },
    },
    category("etc"),
    category("etp"),
  ];
};

/**
 * What every criterion the year **applies** puts at stake, in the order of the
 * document.
 *
 * It does not split them: `taxYear` does, into `doubtful` and `settled`. The
 * split is a partition and not a filter on purpose. It used to end in
 * `.filter(isDoubtful)`, and the day #18 and #19 rose to high certainty that
 * line silently stopped showing an amount it had just finished computing.
 * A criterion is left out here only when **no figure of the year applies it**,
 * which is not a judgement about the amount: an entry whose other reading moves
 * nothing is kept, with its zeros.
 */
export const criterionStakes = (
  core: Core,
  events: readonly LedgerEvent[],
  year: number,
  options: TaxOptions,
): CriterionStake[] => {
  const items: CriterionStake[] = [];
  const all = [...core.transmissions];
  const keyed = linesByKey(all);
  const declaring = (id: CriterionId): TransmissionLine[] =>
    all.filter((line) => line.criteria.includes(id));
  const current = figuresOf(core);

  // A ledger with nothing in a foreign currency has no other reading of #4 to run.
  const foreign =
    core.state.currencyGains.length > 0 ||
    core.state.gains.some((gain) => gain.fx_method !== undefined);
  for (const alternative of alternatives(core.state.fiscalSettings)) {
    if (alternative.criterion === "4" && !foreign) {
      continue;
    }
    const lines = declaring(alternative.criterion);
    const other = tryComputeCore(events, year, options, alternative.settings);
    // The other reading reaches below the first supported year: it cannot be
    // measured, and the reason is not the same as "it leaves invalid events" —
    // that one is repaired by fixing the ledger and this one cannot be
    // repaired at all.
    if (isUnsupported(other)) {
      if (lines.length > 0) {
        items.push(
          item(alternative.criterion, {
            measure: "not_quantifiable",
            event_ids: lines.map((line) => line.event_id),
            direction: FISCAL_CRITERIA[alternative.criterion].risk,
            reason: "unsupported_under_alternative",
          }),
        );
      }
      continue;
    }
    if (isInvalid(other)) {
      if (lines.length > 0) {
        items.push(
          item(alternative.criterion, {
            measure: "not_quantifiable",
            event_ids: lines.map((line) => line.event_id),
            direction: FISCAL_CRITERIA[alternative.criterion].risk,
            reason: "invalid_under_alternative",
            invalid_count: other.invalid.length,
          }),
        );
      }
      continue;
    }
    const moved = figuresOf(other);
    const base = moved.base.sub(current.base);
    const pendingDifference = moved.pending.sub(current.pending);
    const deferred = moved.deferred.sub(current.deferred);
    // The figures that depend on it: those that apply it, and those whose
    // figure changes under the other reading (a loss of another year carried
    // or released into this one).
    const otherLines = linesByKey(other.transmissions);
    const affected = [...keyed]
      .filter(
        ([key, line]) =>
          lines.includes(line) ||
          otherLines.get(key)?.computable_eur_rounded.eq(line.computable_eur_rounded) !== true,
      )
      .map(([, line]) => line);
    if (affected.length === 0 && base.isZero() && pendingDifference.isZero() && deferred.isZero()) {
      continue;
    }
    const markets =
      alternative.criterion === "2:listed"
        ? [...new Set(affected.map((line) => line.market ?? "unknown"))].sort()
        : undefined;
    // The exchange differences of the year move with the method of #4.
    const currencyIds =
      alternative.criterion === "4" ? core.currency.map((line) => line.event_id) : [];
    items.push(
      item(alternative.criterion, {
        measure: "difference",
        event_ids: [...affected.map((line) => line.event_id), ...currencyIds],
        base_difference_eur: base,
        pending_difference_eur: pendingDifference,
        deferred_difference_eur: deferred,
        direction: directionOf(base, pendingDifference),
        ...(markets === undefined ? {} : { markets }),
      }),
    );
  }

  // Exposures: the amount of the figures the criterion touches.
  const exposure = (
    id: CriterionId,
    lines: readonly TransmissionLine[],
    amount: (line: TransmissionLine) => Money,
  ): void => {
    if (lines.length > 0) {
      items.push(
        item(id, {
          measure: "exposure",
          event_ids: lines.map((line) => line.event_id),
          exposure_eur: sum(lines.map(amount)),
          direction: FISCAL_CRITERIA[id].risk,
        }),
      );
    }
  };
  const abs = (money: Money): Money => (money.isNegative() ? money.neg() : money);
  // #5 reaches every figure converted at the rate of an earlier day: the
  // disposals, and also the income and the deductible fees.
  const lateIncome = core.income.filter((line) => line.criteria.includes("5"));
  const lateFees = core.expenses.filter((line) => line.criteria.includes("5"));
  const lateSales = declaring("5");
  if (lateSales.length + lateIncome.length + lateFees.length > 0) {
    items.push(
      item("5", {
        measure: "exposure",
        event_ids: [
          ...lateSales.map((line) => line.event_id),
          ...lateIncome.map((line) => line.event_id),
          ...lateFees.map((line) => line.event_id),
        ],
        exposure_eur: sum([
          ...lateSales.map((line) => abs(line.proceeds.eur.roundToCents())),
          ...lateIncome.map((line) => line.gross_eur_rounded),
          ...lateFees.map((line) => abs(line.amount_eur_rounded)),
        ]),
        direction: FISCAL_CRITERIA["5"].risk,
      }),
    );
  }
  // What an exchange difference applies, on its own figure.
  for (const id of ["4:currency_fifo", "4:currency_wash_sale", "4:auto_conversion"] as const) {
    const lines = core.currency.filter((line) => line.criteria.includes(id));
    if (lines.length > 0) {
      items.push(
        item(id, {
          measure: "exposure",
          event_ids: lines.map((line) => line.event_id),
          exposure_eur: sum(lines.map((line) => abs(line.gain_eur_rounded))),
          direction: FISCAL_CRITERIA[id].risk,
        }),
      );
    }
  }
  exposure("4:mixed_currency", declaring("4:mixed_currency"), (line) =>
    abs(line.computable_eur_rounded),
  );
  // A window no reading of the document supports: what it deferred is at stake.
  exposure("2:other", declaring("2:other"), (line) => abs(line.deferred_eur.roundToCents()));
  exposure("7", declaring("7"), (line) => line.cost_eur.roundToCents());
  exposure("13", declaring("13"), (line) => abs(line.computable_eur_rounded));
  exposure("15", declaring("15"), (line) =>
    abs(sum(line.released.filter((r) => r.travelled).map((r) => r.amount_eur)).roundToCents()),
  );
  exposure("17", declaring("17"), (line) =>
    FxRate.of(Decimal.parse(line.proceeds.fx_rate), line.fee.currency, line.proceeds.fx_rate_date)
      .toEur(line.fee)
      .roundToCents(),
  );
  // What the single-purchase exception kept from deferring: the loss at stake
  // if it were applied too widely.
  for (const id of ["18:single_purchase", "18:single_purchase_etc"] as const) {
    exposure(id, declaring(id), (line) =>
      abs(
        (core.outcomes[core.transmissions.indexOf(line)] as WashSaleOutcome).single_purchase_eur,
      ).roundToCents(),
    );
  }
  exposure("20", declaring("20"), (line) =>
    abs(
      sum(line.lots.filter((lot) => lot.gain_eur.isNegative()).map((lot) => lot.gain_eur)),
    ).roundToCents(),
  );
  // #18, #19, #21: the deferral with the other reading, on the figure of the operation.
  for (const id of ["18", "19", "21"] as const) {
    const lines = declaring(id);
    if (lines.length === 0) {
      continue;
    }
    const difference = sum(
      lines.map((line) =>
        (core.outcomes[core.transmissions.indexOf(line)] as WashSaleOutcome).alternatives[id]
          .neg()
          .roundToCents(),
      ),
    );
    // #18 read the other way can only defer onto units still held: with none,
    // it moves nothing, and the item says why.
    const withoutCarrier =
      id === "18" &&
      difference.isZero() &&
      lines.some(
        (line) =>
          (core.outcomes[core.transmissions.indexOf(line)] as WashSaleOutcome).no_carrier_for_18,
      );
    items.push(
      item(id, {
        measure: "difference",
        event_ids: lines.map((line) => line.event_id),
        base_difference_eur: difference,
        direction: directionOf(difference, zero()),
        ...(withoutCarrier ? { reason: "no_carrier_left" as const } : {}),
      }),
    );
  }
  // #15 also covers what travelled and is still pending at 31/12.
  const travelledPending = core.pendingDeferrals.filter((entry) => entry.travelled);
  if (travelledPending.length > 0) {
    const existing = items.find((entry) => entry.criterion === "15");
    const amount = abs(sum(travelledPending.map((entry) => entry.amount_eur))).roundToCents();
    if (existing === undefined) {
      items.push(
        item("15", {
          measure: "exposure",
          event_ids: [],
          exposure_eur: amount,
          direction: FISCAL_CRITERIA["15"].risk,
        }),
      );
    } else {
      existing.exposure_eur = (existing.exposure_eur as Money).add(amount);
    }
  }
  // #8 and #7/#13: what the ledger received in kind or exchanged without saying
  // whether the neutrality regime applies. Never quantified with a price.
  for (const entry of core.state.inKindIncome.filter((e) => e.year === year)) {
    const action = core.ctx.events.get(entry.event_id) as CorporateActionEvent;
    if (action.kind === "crypto_fork") {
      items.push(
        item("8", {
          measure: "exposure",
          event_ids: [entry.event_id],
          exposure_eur: entry.amount_eur,
          direction: FISCAL_CRITERIA["8"].risk,
        }),
      );
    }
  }
  for (const action of exchangesOfYear(core, year)) {
    if (action.neutrality_regime !== undefined) {
      continue;
    }
    const id: CriterionId = action.kind === "spin_off" ? "7" : "13";
    const created = [...core.ctx.lots.values()].filter((lot) => lot.source_event_id === action.id);
    items.push(
      item(id, {
        measure: "exposure",
        event_ids: [action.id],
        exposure_eur: sum(created.map((lot) => lot.original_cost_eur)).roundToCents(),
        direction: "aggressive",
        reason: "regime_not_recorded",
      }),
    );
  }
  // #22: the order among years only matters when two or more years of origin
  // compete for a balance that cannot absorb them all. Two steps of one year
  // (its own category, then the other) compete with nothing, and when
  // everything is absorbed the order changes nothing. A year that took nothing
  // competed too: it is the one the order left out, so the years are those of
  // the steps and those still pending or expiring after them.
  const phase2 = core.compensation.steps.filter((step) => step.phase === 2);
  const left = [
    ...core.compensation.expired,
    ...core.compensation.pending.filter((entry) => entry.origin_year < year),
  ];
  const origins = new Set([
    ...phase2.map((step) => step.origin_year),
    ...left.map((entry) => entry.origin_year),
  ]);
  const competing = origins.size > 1 && left.length > 0;
  if (phase2.length > 0) {
    items.push(
      item("22", {
        measure: "exposure",
        event_ids: [],
        exposure_eur: competing ? sum(phase2.map((step) => step.amount_eur)) : zero(),
        direction: FISCAL_CRITERIA["22"].risk,
      }),
    );
  }
  const order = (entry: CriterionStake): number => CRITERION_IDS.indexOf(entry.criterion);
  return [...items].sort((a, b) => order(a) - order(b));
};
