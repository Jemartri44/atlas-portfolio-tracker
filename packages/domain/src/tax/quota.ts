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
// the share of deductible expenses that falls on it, and reduced in proportion
// when losses offset part of the movable capital balance. The part of the
// deduction above the limits is lost: art. 80 LIRPF, unlike the corporate
// tax, carries nothing forward.

import { Decimal, HUNDRED } from "../money/decimal.js";
import { Money } from "../money/money.js";
import type { TaxBracket } from "../settings/defaults.js";
import type { CriterionId } from "./criteria.js";
import type { SavingsReading } from "./report.js";
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
  | "deduction_incomplete"
  /** The brackets of the settings are not a scale (empty, unordered, or the last one bounded): the law is used. */
  | "settings_brackets_invalid";

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
  /**
   * The withholdings of the savings income Atlas recorded. Only the savings
   * part, an estimate: in the return they offset the whole quota.
   */
  savings_withholdings_eur: Money;
  /**
   * The gross of the savings income from outside the portfolio already inside
   * `base_eur`, when the report was read with it; its withholdings are inside
   * `savings_withholdings_eur`.
   */
  external_eur?: Money;
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

/** A scale: at least one bracket, increasing limits, and only the last one open. */
const isScale = (brackets: readonly TaxBracket[]): boolean =>
  brackets.length > 0 &&
  brackets.every((bracket, i) => {
    const last = i === brackets.length - 1;
    if (bracket.up_to === undefined) {
      return last;
    }
    const previous = i === 0 ? Decimal.ZERO : Decimal.parse(brackets[i - 1]?.up_to);
    return !last && Decimal.parse(bracket.up_to).gt(previous);
  });

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
    // A base exactly on a limit reaches the next bracket with nothing in it.
    if (!part.isZero()) {
      brackets.push({
        from_eur: from,
        ...(limit === undefined ? {} : { up_to_eur: limit }),
        rate_pct: rate.rate.toString(),
        ...(rate.state === undefined ? {} : { state_pct: rate.state.toString() }),
        ...(rate.regional === undefined ? {} : { regional_pct: rate.regional.toString() }),
        base_eur: part,
        quota_eur: pct(part, rate.rate),
      });
    }
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
 * The scale over a base that is only an assumption, with the rates `savingsQuota` would take: the
 * projection's, never a report's. Undefined when no scale was checked for the year.
 */
export const quotaOfBase = (
  base: Money,
  year: number,
  brackets?: readonly TaxBracket[],
): Money | undefined => {
  const scale = savingsScaleOf(year);
  const rates =
    brackets !== undefined && isScale(brackets)
      ? settingsRates(brackets)
      : scale === undefined
        ? undefined
        : lawRates(scale);
  return rates === undefined
    ? undefined
    : applyRates(base, rates).brackets.reduce((sum, part) => sum.add(part.quota_eur), zero);
};

/**
 * The estimated quota of the savings base of `report`. `brackets` are the
 * `savings_tax_brackets` of the settings in force, when the user set them: when
 * they differ from the scale of the law they replace it, and the result says so.
 */
export const savingsQuota = (
  report: SavingsReading,
  brackets?: readonly TaxBracket[],
): SavingsQuota => {
  const year = report.year;
  const scale = savingsScaleOf(year);
  const notes: QuotaNote[] = [];
  // Never negative: what the compensation does not absorb becomes a pending loss (art. 49).
  const base = report.base_eur;
  const external = report.external_income;
  const withholdings =
    external === undefined
      ? report.withholdings.total_eur
      : report.withholdings.total_eur.add(external.withholding_eur);
  const fromLaw = scale === undefined ? undefined : lawRates(scale);
  if (brackets !== undefined && !isScale(brackets)) {
    notes.push("settings_brackets_invalid");
  }
  // Brackets of the settings that say what the law says are the law: they
  // replace nothing, and the result keeps the halves and the date of the check.
  const typed = brackets === undefined || !isScale(brackets) ? undefined : settingsRates(brackets);
  const fromSettings =
    typed !== undefined && fromLaw !== undefined && sameRates(typed, fromLaw) ? undefined : typed;
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
    savings_withholdings_eur: withholdings,
    ...(external === undefined || external.lines.length === 0
      ? {}
      : { external_eur: external.gross_eur }),
    criteria: (report.external_income === undefined || report.external_income.lines.length === 0
      ? ["27"]
      : ["27", "28"]) as CriterionId[],
  };
  if (rates === undefined) {
    return { ...common, scale_origin: "none", brackets: [], notes };
  }
  if (fromSettings !== undefined) {
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

  // Second limit of art. 80: the foreign income as it enters the base.
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
    // Net of the expenses in proportion to the gross: `gross × (income − expenses) / income`.
    // A foreign dividend is part of `income`, so `income` is never zero here.
    const netIncome = income.sub(expenses);
    // Then its share of the positive movable capital balance —its net income
    // plus the gains of movable capital transmissions— applied to what is left
    // of that balance after the compensation (art. 49).
    const gains = report.movable_capital.transmissions
      .map((line) => line.computable_eur_rounded)
      .filter((amount) => !amount.isNegative())
      .reduce((sum, amount) => sum.add(amount), zero);
    const foreign = !netIncome.amount.isPositive()
      ? zero
      : report.compensation.movable_capital_final_eur
          .mul(gross.mul(netIncome.amount).div(income.amount).amount)
          .div(netIncome.add(gains).amount)
          .roundToCents();
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
