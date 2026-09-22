// The figures of the return, in the order of the form and **before** any box
// number is attached to them (feature 010, block 2).
//
// Splitting it in two is what keeps the promise of decision (e): this file
// knows the concepts and the arithmetic the form itself does, and knows nothing
// at all about which year it is. Attaching the boxes is `boxes.ts`, which reads
// the table of the year and, when there is none, attaches nothing.
//
// Nothing here recomputes a figure of the return. Every amount comes from
// `TaxYearReport`; the only sums are the ones the form prints inside its own
// labels ("suma de las casillas [0320]"), and the rows by origin of the loss,
// which are a **reordering** of what the engine already computed (ficha F5).

import { Money } from "../../money/money.js";
import type { IncomeCategory } from "../../settings/settings.js";
import { type ChainCore, categoryOf } from "../chain.js";
import { type CriterionId, sortCriteria } from "../criteria.js";
import type { TaxYearReport, TransmissionLine } from "../report.js";
import type { WashSaleOutcome } from "../wash-sale.js";
import {
  type ConceptId,
  MISSING_FIELDS,
  type RowFieldId,
  rowConcept,
  SECTION_FIELDS,
  type SectionId,
  transmissionSection,
} from "./concepts.js";
import type { BoxRow, PartialReason } from "./report.js";
import { deferredByOrigin, gainIndexOf, gainOf } from "./rows.js";

const EUR = "EUR";

/** One figure, with everything the layout knows about it except its box. */
export interface Draft {
  concept: ConceptId;
  section?: SectionId | "movable_capital";
  row?: BoxRow;
  origin_year?: number;
  /** The engine's figure, exact and **with its sign**. */
  exact?: Money;
  /** What the form will compute from the two values above it, when it differs by a cent. */
  form?: Money;
  text?: string;
  missing?: boolean;
  partial?: PartialReason;
  criteria: CriterionId[];
}

const zero = (): Money => Money.zero(EUR);

const sum = (values: readonly Money[]): Money => values.reduce((t, v) => t.add(v), zero());

const positive = (money: Money): Money => (money.isNegative() ? zero() : money);

const union = (lists: readonly (readonly CriterionId[])[]): CriterionId[] =>
  sortCriteria(lists.flat());

const lineKey = (line: { event_id: string; account_id: string }): string =>
  `${line.event_id}|${line.account_id}`;

const rowOf = (gain: {
  event_id: string;
  account_id: string;
  asset_id: string;
  fiscal_date: string;
}): BoxRow => ({
  event_id: gain.event_id,
  account_id: gain.account_id,
  asset_id: gain.asset_id,
  fiscal_date: gain.fiscal_date,
});

/** The section of a disposal that the report already classified as a capital gain. */
const sectionOf = (line: TransmissionLine): SectionId =>
  transmissionSection(line.asset_type, "capital_gain") as SectionId;

interface RowTotals {
  gains: Money;
  losses: Money;
}

/**
 * The rows of the disposals of the year, by section, and what each section
 * adds up to.
 *
 * The value of a row is the **own** result of the operation, never what the
 * engine integrated: what a repurchase released belongs to the loss it came
 * from and is declared there (ficha F5). So a sale with a gain of its own that
 * releases an earlier loss is a gain here, exactly as Renta WEB expects.
 */
const disposalRows = (
  report: TaxYearReport,
  stillDeferred: Map<number, Money>,
  index: Map<string, number>,
): { drafts: Draft[]; totals: Map<SectionId, RowTotals> } => {
  const drafts: Draft[] = [];
  const totals = new Map<SectionId, RowTotals>();
  for (const line of report.capital_gains.lines) {
    const section = sectionOf(line);
    const own = line.own_eur;
    const deferred = stillDeferred.get(index.get(lineKey(line)) as number) ?? zero();
    const gain = !own.isNegative();
    const value: Partial<Record<RowFieldId, Money>> = {
      transmission: line.proceeds.eur,
      acquisition: line.cost_eur,
      ...(gain
        ? { gain: own, gain_net: own, gain_imputable: own }
        : { loss: own, loss_imputable: own.sub(deferred) }),
    };
    const rounding = line.proceeds.eur
      .roundToCents()
      .sub(line.cost_eur.roundToCents())
      .sub(own.roundToCents());
    for (const field of SECTION_FIELDS[section]) {
      const amount = value[field];
      if (amount === undefined && !MISSING_FIELDS.has(field) && field !== "name") {
        continue;
      }
      drafts.push({
        concept: rowConcept(section, field),
        section,
        row: rowOf(line),
        criteria: line.criteria,
        ...(MISSING_FIELDS.has(field)
          ? { missing: true }
          : field === "name"
            ? { text: line.asset_id }
            : { exact: amount as Money }),
        // The form subtracts the two rounded values itself, and the engine
        // rounds the result once (#6): they can differ by a cent, and the one
        // the user will see on screen is the form's (ficha F2).
        ...((field === "gain" || field === "loss") && !rounding.isZero()
          ? { form: own.roundToCents().add(rounding) }
          : {}),
      });
    }
    const current = totals.get(section) ?? { gains: zero(), losses: zero() };
    totals.set(
      section,
      gain
        ? { ...current, gains: current.gains.add(own.roundToCents()) }
        : {
            ...current,
            losses: current.losses.add(own.sub(deferred).roundToCents()),
          },
    );
  }
  return { drafts, totals };
};

/**
 * What a loss of an **earlier** year stops having deferred this year, one row
 * per original loss (boxes 0394–0396 of 2025).
 *
 * Only losses whose income category is a capital gain: a deferral of movable
 * capital income has no "earlier years" section, and what is released of it is
 * already inside the figure of the disposal that releases it (ficha F5, added
 * after Q2). Counting it here too would declare it twice.
 */
const priorYearRows = (
  chain: ChainCore,
  year: number,
  before: Map<number, Money>,
  now: Map<number, Money>,
): { drafts: Draft[]; losses: Money } => {
  const drafts: Draft[] = [];
  let losses = zero();
  // Only what was already deferred at the close of the year before: what is
  // held of a given loss never grows, so a loss that appears here appears in
  // `before` first, and the difference is never a gain.
  for (const origin of [...before.keys()].sort((a, b) => a - b)) {
    const gain = gainOf(chain, origin);
    if (gain.year >= year || categoryOf(chain.state, gain.asset_id) !== "capital_gain") {
      continue;
    }
    const delta = (before.get(origin) as Money).sub(now.get(origin) ?? zero());
    if (delta.isZero()) {
      continue;
    }
    drafts.push({
      concept: "gp.prior_years.loss",
      row: rowOf(gain),
      origin_year: gain.year,
      exact: delta,
      criteria: sortCriteria(["14"]),
    });
    losses = losses.add(delta.roundToCents());
  }
  return { drafts, losses };
};

/** Releases of a **movable capital** loss on a disposal of the other category. */
const foreignReleases = (
  chain: ChainCore,
  year: number,
): { row: BoxRow; amount: Money; criteria: CriterionId[] }[] => {
  const found: { row: BoxRow; amount: Money; criteria: CriterionId[] }[] = [];
  for (const outcome of chain.walk.outcomes as readonly WashSaleOutcome[]) {
    const gain = gainOf(chain, outcome.gain_index);
    if (gain.year !== year) {
      continue;
    }
    for (const release of outcome.foreign_released) {
      const origin = gainOf(chain, release.origin);
      if (categoryOf(chain.state, origin.asset_id) === "movable_capital") {
        found.push({
          row: rowOf(gain),
          amount: release.amount_eur.roundToCents(),
          criteria: sortCriteria(["14"]),
        });
      }
    }
  }
  return found;
};

/** Movable capital income: page 5 of the form, in its own order. */
const movableCapital = (report: TaxYearReport, releases: ReturnType<typeof foreignReleases>) => {
  const drafts: Draft[] = [];
  const movable = report.movable_capital;
  const criteriaOf = (lists: readonly { criteria: readonly CriterionId[] }[]): CriterionId[] =>
    union(lists.map((entry) => entry.criteria));
  const interest = sum(movable.interest.map((line) => line.gross_eur_rounded));
  const dividends = sum(movable.dividends.map((line) => line.gross_eur_rounded));
  drafts.push(
    { concept: "rcm.interest", exact: interest, criteria: criteriaOf(movable.interest) },
    { concept: "rcm.dividends", exact: dividends, criteria: criteriaOf(movable.dividends) },
  );
  // One row per security, with its sign, as the help of box 0031 asks: "El
  // cómputo de cada rendimiento debe efectuarse, individualmente, por cada
  // título o activo financiero".
  for (const line of movable.transmissions) {
    drafts.push({
      concept: "rcm.transmission",
      section: "movable_capital",
      row: rowOf(line),
      exact: line.computable_eur_rounded,
      criteria: line.criteria,
    });
  }
  for (const release of releases) {
    drafts.push({
      concept: "rcm.transmission",
      section: "movable_capital",
      row: release.row,
      exact: release.amount,
      criteria: release.criteria,
    });
  }
  const transmissions = sum(movable.transmissions.map((line) => line.computable_eur_rounded)).add(
    sum(releases.map((entry) => entry.amount)),
  );
  const expenses = sum(movable.expenses.map((line) => line.amount_eur_rounded));
  const gross = interest.add(dividends).add(transmissions);
  const net = gross.add(expenses);
  const criteria = union([
    criteriaOf(movable.interest),
    criteriaOf(movable.dividends),
    criteriaOf(movable.transmissions),
    criteriaOf(movable.expenses),
  ]);
  drafts.push(
    {
      concept: "rcm.transmission",
      section: "movable_capital",
      exact: transmissions,
      criteria: criteriaOf(movable.transmissions),
    },
    { concept: "rcm.gross_total", exact: gross, criteria },
    { concept: "rcm.expenses", exact: expenses, criteria: criteriaOf(movable.expenses) },
    { concept: "rcm.net", exact: net, criteria },
    { concept: "rcm.net_reduced", exact: net, criteria },
    { concept: "rcm.integrated", exact: net, criteria },
    { concept: "rcm.balance", exact: net, criteria },
  );
  return { drafts, balance: net };
};

/** Article 49: the year first, then what the four earlier years left. */
const offsetting = (report: TaxYearReport) => {
  const drafts: Draft[] = [];
  const againstGain: Money[] = [];
  const againstMovable: Money[] = [];
  for (const step of report.compensation.steps) {
    const crosses = step.from !== step.against;
    const concept: ConceptId =
      step.phase === 1
        ? step.against === "capital_gain"
          ? "offset.rcm_against_gp"
          : "offset.gp_against_rcm"
        : `pending.${step.from}.against_${crosses ? "other" : "same"}`;
    drafts.push({
      concept,
      ...(step.phase === 1 ? {} : { origin_year: step.origin_year }),
      exact: step.amount_eur,
      criteria: step.criteria,
    });
    (step.against === "capital_gain" ? againstGain : againstMovable).push(
      step.amount_eur.roundToCents(),
    );
  }
  return { drafts, againstGain: sum(againstGain), againstMovable: sum(againstMovable) };
};

/**
 * Annex C.3: what each origin year had open at 1 January, what this return
 * applies and what is left for the years to come.
 *
 * What a year had open is **not** what the chain computed for the year before:
 * when that year was filed, what carries forward is what the return declared,
 * and the chain deliberately keeps the computed figure so the comparison with
 * the filing has something to compare. So the opening balance is rebuilt from
 * this year's own compensation, which is where the anchor has already been
 * applied: what was offset, plus what is left, plus what expired.
 */
const annexC3 = (report: TaxYearReport, year: number): Draft[] => {
  const criteria = sortCriteria(["10", "22"]);
  const applied = new Map<string, Money>();
  for (const step of report.compensation.steps.filter((entry) => entry.phase === 2)) {
    const key = `${step.origin_year}|${step.from}`;
    applied.set(key, (applied.get(key) ?? zero()).add(step.amount_eur));
  }
  const left = new Map<string, Money>();
  for (const entry of [
    ...report.compensation.pending.filter((p) => p.origin_year < year),
    ...report.compensation.expired.filter((p) => p.origin_year < year),
  ]) {
    const key = `${entry.origin_year}|${entry.category}`;
    left.set(key, (left.get(key) ?? zero()).add(entry.amount_eur));
  }
  const drafts: Draft[] = [];
  for (const key of [...new Set([...applied.keys(), ...left.keys()])].sort()) {
    const [originText, category] = key.split("|") as [string, IncomeCategory];
    const originYear = Number(originText);
    const used = applied.get(key) ?? zero();
    const rest = left.get(key) ?? zero();
    const column = (part: "start" | "applied" | "left"): ConceptId => `annex.${category}.${part}`;
    drafts.push(
      // Everything here carries the sign the engine gives a pending balance,
      // which is negative; the layout prints the magnitude the form asks for.
      { concept: column("start"), origin_year: originYear, exact: rest.sub(used), criteria },
      { concept: column("applied"), origin_year: originYear, exact: used.neg(), criteria },
      { concept: column("left"), origin_year: originYear, exact: rest, criteria },
    );
  }
  for (const entry of report.compensation.pending.filter((p) => p.origin_year === year)) {
    drafts.push({
      concept: `annex.${entry.category}.new`,
      origin_year: year,
      exact: entry.amount_eur,
      criteria,
    });
  }
  return drafts;
};

/** The double taxation deduction (#16) and the payments on account. */
const deductions = (report: TaxYearReport, categories: Map<string, IncomeCategory>): Draft[] => {
  const drafts: Draft[] = [];
  for (const line of report.double_taxation.lines) {
    const row = { event_id: line.event_id } as BoxRow;
    drafts.push(
      { concept: "ddi.income", row, exact: line.gross_eur, criteria: line.criteria },
      { concept: "ddi.foreign_tax", row, exact: line.foreign_tax_eur, criteria: line.criteria },
    );
  }
  if (report.double_taxation.lines.length > 0) {
    const criteria = union(report.double_taxation.lines.map((line) => line.criteria));
    drafts.push(
      { concept: "ddi.first_limit", exact: report.double_taxation.deductible_eur, criteria },
      // The box holds the **lesser** of two limits, and the engine knows only
      // the first one: the second needs the whole return. So the box is named
      // and left without a figure (prompt: never as the amount of the box).
      { concept: "ddi.deduction", partial: "treaty_limit_only", criteria },
    );
  }
  const withheld = (predicate: (category: IncomeCategory) => boolean): Money =>
    sum(
      report.withholdings.lines
        .filter((line) =>
          line.source === "dividend" || line.source === "interest"
            ? predicate("movable_capital")
            : // Every withholding of a disposal comes from a line of the year,
              // so its category is always in the map.
              predicate(categories.get(lineKey(line)) as IncomeCategory),
        )
        .map((line) => line.amount_eur_rounded),
    );
  for (const [concept, category] of [
    ["withholding.rcm", "movable_capital"],
    ["withholding.capital_gain", "capital_gain"],
  ] as const) {
    const amount = withheld((entry) => entry === category);
    if (!amount.isZero()) {
      drafts.push({
        concept,
        exact: amount,
        partial: "ledger_withholdings_only",
        criteria: union(report.withholdings.lines.map((line) => line.criteria)),
      });
    }
  }
  return drafts;
};

/**
 * Every figure of the return, in the order of the form. The caller attaches the
 * boxes of the year, or says there are none.
 */
export const draftEntries = (report: TaxYearReport, chain: ChainCore): Draft[] => {
  const year = report.year;
  const index = gainIndexOf(chain);
  const now = deferredByOrigin(chain, year);
  const before = deferredByOrigin(chain, year - 1);
  const disposals = disposalRows(report, now, index);
  const prior = priorYearRows(chain, year, before, now);
  const drafts: Draft[] = [...disposals.drafts];
  let gains = zero();
  let losses = prior.losses;
  for (const [section, totals] of disposals.totals) {
    const criteria = union(
      report.capital_gains.lines
        .filter((line) => sectionOf(line) === section)
        .map((line) => line.criteria),
    );
    drafts.push(
      { concept: `gp.${section}.gains`, section, exact: totals.gains, criteria },
      { concept: `gp.${section}.losses`, section, exact: totals.losses, criteria },
    );
    gains = gains.add(totals.gains);
    losses = losses.add(totals.losses);
  }
  drafts.push(...prior.drafts);
  const allCriteria = union(report.capital_gains.lines.map((line) => line.criteria));
  if (prior.drafts.length > 0) {
    drafts.push({ concept: "gp.prior_years.losses", exact: prior.losses, criteria: allCriteria });
  }
  // `losses` carries its sign, so the balance is the plain sum of the two.
  const gpBalance = gains.add(losses);
  drafts.push(
    { concept: "gp.gains_total", exact: gains, criteria: allCriteria },
    { concept: "gp.losses_total", exact: losses, criteria: allCriteria },
    { concept: "gp.balance", exact: gpBalance, criteria: allCriteria },
  );
  const movable = movableCapital(report, foreignReleases(chain, year));
  drafts.push(...movable.drafts);
  const offsets = offsetting(report);
  drafts.push(...offsets.drafts);
  const base = positive(gpBalance)
    .sub(offsets.againstGain)
    .add(positive(movable.balance))
    .sub(offsets.againstMovable);
  drafts.push(
    { concept: "base.savings", exact: base, criteria: sortCriteria(["10", "22"]) },
    // 0460 less two remainders of reductions the ledger cannot see (N8).
    { concept: "base.savings_taxable", partial: "reductions_unknown", criteria: [] },
  );
  drafts.push(...annexC3(report, year));
  const categories = new Map<string, IncomeCategory>(
    [...report.capital_gains.lines, ...report.movable_capital.transmissions].map((line) => [
      lineKey(line),
      line.category,
    ]),
  );
  drafts.push(...deductions(report, categories));
  return drafts;
};
