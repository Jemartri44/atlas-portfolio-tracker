// The quota of the savings base, **estimated** (criterion #27).
//
// The engine computes the savings base from the ledger; the quota also depends
// on the rest of the return, which Atlas does not know: the general base, the
// personal and family minimum, other deductions. So this is an estimate under
// three stated assumptions, and every interface labels it as such:
//
//   - the personal and family minimum is absorbed by the general base (art.
//     56.2 LIRPF: it only reaches the savings base when the general one is
//     smaller than it), so the whole savings base is taxed;
//   - the common regime: the scale is that of arts. 66.1 and 76 (`savings-scale.ts`);
//   - the withholdings are the ones of the savings income Atlas recorded; in
//     the return they offset the whole quota, not only this part.
//
// The quota is the scale applied bracket by bracket to the base, each half
// (state, region) rounded half-up to cents. The double taxation deduction
// (art. 80) is the lesser of the first limit the report already computes (#16)
// and the second: the average effective rate of the savings, with two decimals
// (art. 80.2), applied to the foreign income **as it enters the base**: net of
// the share of deductible expenses that falls on it, and no larger than the
// base itself when losses offset part of it.

import { Decimal, HUNDRED } from "../money/decimal.js";
import { Money } from "../money/money.js";
import type { TaxBracket } from "../settings/defaults.js";
import type { CriterionId } from "./criteria.js";
import type { TaxYearReport } from "./report.js";
import { type SavingsScale, SCALES_CHECKED_AT, savingsScaleOf } from "./savings-scale.js";

export interface QuotaBracket {
  from_eur: Money;
  /** Absent for the last bracket. */
  up_to_eur?: Money;
  rate_pct: string;
  /** Absent when the rates come from the settings, which do not split them. */
  state_pct?: string;
  regional_pct?: string;
  /** Part of the base that falls in this bracket, and its quota, exact. */
  base_eur: Money;
  quota_eur: Money;
}

export type QuotaNote =
  /** The settings carry their own brackets and they differ from the law of the year. */
  | "settings_differ_from_law"
  /** The year is later than the day the scale was checked: a law may still change it. */
  | "scale_after_check"
  /** Some foreign dividends have no first limit (no country or no treaty rate): no deduction for them. */
  | "deduction_incomplete";

export interface SavingsQuota {
  year: number;
  /** Always true: it does not know the rest of the return. */
  estimate: true;
  /** Where the rates come from; `none` means no scale was checked for the year and nothing is computed. */
  scale_origin: "law" | "settings" | "none";
  scale?: Pick<SavingsScale, "from_year" | "law" | "url"> & { checked_at: string };
  /** The savings base of the report, after compensation. */
  base_eur: Money;
  brackets: QuotaBracket[];
  /** The halves, rounded to cents; absent when the rates do not split. */
  state_eur?: Money;
  regional_eur?: Money;
  /** Cuota íntegra del ahorro, rounded to cents. */
  quota_eur?: Money;
  /** Average effective rate, in percent with two decimals (art. 80.2). */
  average_rate_pct?: string;
  /** Rate of the next euro of base, and how much base is left before the next bracket. */
  marginal_rate_pct?: string;
  room_to_next_eur?: Money;
  double_taxation?: {
    /** The first limit, summed: what the treaty lets Spain deduct (#16). */
    first_limit_eur: Money;
    /** Foreign income of those dividends as it enters the base. */
    foreign_income_eur: Money;
    /** The second limit: average rate times that income. */
    second_limit_eur: Money;
    deduction_eur: Money;
  };
  /** `quota − deduction`, never below zero. */
  net_quota_eur?: Money;
  /** The withholdings of the report: the savings part, an estimate. */
  withholdings_eur: Money;
  /** `net quota − withholdings`: positive to pay, negative to be refunded, of this part. */
  result_eur?: Money;
  notes: QuotaNote[];
  criteria: CriterionId[];
}

const zero = Money.zero("EUR");
const eur = (text: string): Money => Money.parse(text, "EUR");
const minOf = (a: Money, b: Money): Money => (a.cmp(b) <= 0 ? a : b);
const pct = (base: Money, rate: Decimal): Money => base.mul(rate).div(HUNDRED);

interface Rate {
  up_to?: string;
  rate: Decimal;
  state?: Decimal;
  regional?: Decimal;
}

const lawRates = (scale: SavingsScale): Rate[] =>
  scale.brackets.map((bracket) => {
    const state = Decimal.parse(bracket.state_pct);
    const regional = Decimal.parse(bracket.regional_pct);
    return {
      ...(bracket.up_to === undefined ? {} : { up_to: bracket.up_to }),
      rate: state.add(regional),
      state,
      regional,
    };
  });

const settingsRates = (brackets: readonly TaxBracket[]): Rate[] =>
  brackets.map((bracket) => ({
    ...(bracket.up_to === undefined ? {} : { up_to: bracket.up_to }),
    rate: Decimal.parse(bracket.rate_pct),
  }));

const sameRates = (a: readonly Rate[], b: readonly Rate[]): boolean =>
  a.length === b.length &&
  a.every((rate, i) => {
    const other = b[i] as Rate;
    return (
      rate.rate.eq(other.rate) &&
      (rate.up_to === undefined
        ? other.up_to === undefined
        : other.up_to !== undefined && Decimal.parse(rate.up_to).eq(Decimal.parse(other.up_to)))
    );
  });

/** The scale bracket by bracket over `base`, up to the bracket the base reaches. */
const applyRates = (base: Money, rates: readonly Rate[]) => {
  const brackets: QuotaBracket[] = [];
  let from = zero;
  let state = zero;
  let regional = zero;
  let marginal: Decimal | undefined;
  let room: Money | undefined;
  for (const rate of rates) {
    const limit = rate.up_to === undefined ? undefined : eur(rate.up_to);
    const inside = limit === undefined || limit.cmp(base) > 0;
    const top = inside ? base : limit;
    // `from` never exceeds the base: the loop stops at the bracket the base reaches.
    const part = top.sub(from);
    brackets.push({
      from_eur: from,
      ...(limit === undefined ? {} : { up_to_eur: limit }),
      rate_pct: rate.rate.toString(),
      ...(rate.state === undefined ? {} : { state_pct: rate.state.toString() }),
      ...(rate.regional === undefined ? {} : { regional_pct: rate.regional.toString() }),
      base_eur: part,
      quota_eur: pct(part, rate.rate),
    });
    if (rate.state !== undefined && rate.regional !== undefined) {
      state = state.add(pct(part, rate.state));
      regional = regional.add(pct(part, rate.regional));
    }
    if (inside) {
      marginal = rate.rate;
      room = limit === undefined ? undefined : limit.sub(base);
      break;
    }
    from = limit;
  }
  return { brackets, state, regional, marginal: marginal as Decimal, room };
};

/**
 * The estimated quota of the savings base of `report`. `brackets` are the
 * `savings_tax_brackets` of the settings in force, when the user set them: they
 * replace the scale of the law and the result says so.
 */
export const savingsQuota = (
  report: TaxYearReport,
  brackets?: readonly TaxBracket[],
): SavingsQuota => {
  const year = report.year;
  const scale = savingsScaleOf(year);
  const notes: QuotaNote[] = [];
  // Never negative: what the compensation does not absorb becomes a pending loss (art. 49).
  const base = report.base_eur;
  const withholdings = report.withholdings.total_eur;
  const fromLaw = scale === undefined ? undefined : lawRates(scale);
  const fromSettings = brackets === undefined ? undefined : settingsRates(brackets);
  const rates = fromSettings ?? fromLaw;
  const common = {
    year,
    estimate: true as const,
    ...(scale === undefined
      ? {}
      : {
          scale: {
            from_year: scale.from_year,
            law: scale.law,
            url: scale.url,
            checked_at: SCALES_CHECKED_AT,
          },
        }),
    base_eur: base,
    withholdings_eur: withholdings,
    criteria: ["27"] as CriterionId[],
  };
  if (rates === undefined) {
    return { ...common, scale_origin: "none", brackets: [], notes };
  }
  if (fromSettings !== undefined && (fromLaw === undefined || !sameRates(fromSettings, fromLaw))) {
    notes.push("settings_differ_from_law");
  }
  if (fromSettings === undefined && year > Number(SCALES_CHECKED_AT.slice(0, 4))) {
    notes.push("scale_after_check");
  }

  const applied = applyRates(base, rates);
  const split = fromSettings === undefined;
  const state = applied.state.roundToCents();
  const regional = applied.regional.roundToCents();
  const quota = split
    ? state.add(regional)
    : applied.brackets.reduce((sum, b) => sum.add(b.quota_eur), zero).roundToCents();
  const average = base.isZero()
    ? Decimal.ZERO
    : quota.amount.mul(HUNDRED).div(base.amount).round(2);

  // Second limit of art. 80: the foreign income, net of its share of the
  // deductible expenses and no larger than the base.
  const ddi = report.double_taxation.lines;
  const counted = ddi.filter((line) => line.deductible_eur !== undefined);
  if (counted.length < ddi.length) {
    notes.push("deduction_incomplete");
  }
  let doubleTaxation: SavingsQuota["double_taxation"];
  if (counted.length > 0) {
    const first = counted.reduce((sum, line) => sum.add(line.deductible_eur as Money), zero);
    const gross = counted.reduce((sum, line) => sum.add(line.gross_eur), zero);
    const income = [...report.movable_capital.dividends, ...report.movable_capital.interest].reduce(
      (sum, line) => sum.add(line.gross_eur_rounded),
      zero,
    );
    const expenses = report.movable_capital.expenses.reduce(
      (sum, line) => sum.add(line.amount_eur_rounded.neg()),
      zero,
    );
    // A foreign dividend is part of `income`, so `income` is never zero here.
    const net = gross.sub(expenses.mul(gross.amount).div(income.amount));
    const foreign = minOf(net.isNegative() ? zero : net, base).roundToCents();
    const second = pct(foreign, average).roundToCents();
    doubleTaxation = {
      first_limit_eur: first,
      foreign_income_eur: foreign,
      second_limit_eur: second,
      deduction_eur: minOf(minOf(first, second), quota),
    };
  }
  const net = quota.sub(doubleTaxation?.deduction_eur ?? zero);
  return {
    ...common,
    scale_origin: fromSettings === undefined ? "law" : "settings",
    brackets: applied.brackets,
    ...(split ? { state_eur: state, regional_eur: regional } : {}),
    quota_eur: quota,
    average_rate_pct: average.toString(),
    marginal_rate_pct: applied.marginal.toString(),
    ...(applied.room === undefined ? {} : { room_to_next_eur: applied.room }),
    ...(doubleTaxation === undefined ? {} : { double_taxation: doubleTaxation }),
    net_quota_eur: net,
    result_eur: net.sub(withholdings),
    notes,
  };
};
