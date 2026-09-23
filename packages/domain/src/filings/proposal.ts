// What a return **proposes** to declare, and the event that records what was
// actually filed (ADR-0020, prompt 010 block 1, decision (l)).
//
// The application starts from what it computes, because nobody wants to type a
// dozen figures by hand, and then lets the user replace any of them with what
// they really declared: the two are not the same thing, and the whole point of
// the event is that the ledger keeps the second one even when the application
// computes something else today.
//
// It lives in the domain and not in each interface because **which figures a
// return declares** is a fiscal question, not a matter of presentation: the
// console and the web have to propose the same ones, name them the same way
// and build the same event, or a filing recorded from the phone would not be
// the filing recorded from the terminal.

import type { CivilDate } from "../dates/civil-date.js";
import type { Ulid } from "../ids/ulid.js";
import { informativeReturn } from "../informative/m720.js";
import type { InformativeReturn } from "../informative/report.js";
import type { Money } from "../money/money.js";
import { filingInForce } from "../projections/filings.js";
import { projectLedger } from "../projections/project-ledger.js";
import { settingsAt } from "../projections/settings-at.js";
import type {
  AccountId,
  AssetId,
  FilingCategory,
  FilingModel,
  LedgerEvent,
} from "../schema/events.js";
import type { IncomeCategory } from "../settings/settings.js";
import { normalizeSettings } from "../settings/settings.js";
import type { TaxYearReport } from "../tax/report.js";
import { taxYear } from "../tax/year.js";
import { fingerprintOfEvents } from "./fingerprint.js";

/** What a figure of a return is, so an interface can label it without parsing its key. */
export type FigureKind =
  | "savings_base"
  | "pending_loss"
  | "deferred"
  | "category_value"
  | "category_q4_average"
  | "item_value"
  | "item_balance"
  | "item_q4_average";

/**
 * One figure the return declares. The `key` is what `--set` names in the
 * console and what the web uses as the id of its field: it is part of the
 * interface of the command, so it is fixed here and not rebuilt twice.
 */
export interface FilingFigureProposal {
  key: string;
  kind: FigureKind;
  amount_eur: Money;
  origin_year?: number;
  category?: IncomeCategory | FilingCategory;
  account_id?: AccountId;
  asset_id?: AssetId;
}

export interface FilingMeta {
  filed_at: CivilDate;
  receipt_reference: string;
  notes?: string;
  /**
   * The filing this one replaces, when it is not the one in force. It defaults
   * to the return of the same model and year that is in force, which is what a
   * supplementary return replaces; naming another one is for the case the
   * chain has to be corrected by hand.
   */
  supersedes?: Ulid;
}

export interface FilingProposal {
  model: FilingModel;
  year: number;
  figures: FilingFigureProposal[];
  /**
   * A return of this model and year already in force. Recording another one is
   * a **supplementary** return, which replaces it and never annuls it: the
   * first filing happened (decision (b) of the prompt).
   */
  supersedes?: Ulid;
  /**
   * The event that records what was filed. `declared` maps the key of each
   * figure to what the user says they declared; anything it does not carry
   * keeps the computed figure.
   */
  draft(declared: ReadonlyMap<string, string>, meta: FilingMeta): Record<string, unknown>;
}

const rentaFigures = (report: TaxYearReport): FilingFigureProposal[] => [
  { key: "base", kind: "savings_base", amount_eur: report.base_eur },
  ...report.compensation.pending.map(
    (entry): FilingFigureProposal => ({
      key: `pending.${entry.origin_year}.${entry.category}`,
      kind: "pending_loss",
      amount_eur: entry.amount_eur,
      origin_year: entry.origin_year,
      category: entry.category,
    }),
  ),
  {
    key: "deferred",
    kind: "deferred",
    amount_eur: report.wash_sale.pending.reduce(
      (total, entry) => total.add(entry.amount_eur),
      report.base_eur.sub(report.base_eur),
    ),
  },
];

const informativeFigures = (report: InformativeReturn): FilingFigureProposal[] => {
  const figures: FilingFigureProposal[] = [];
  for (const category of report.categories) {
    if (category.items.length === 0) {
      continue;
    }
    figures.push({
      key: `${category.category}.value`,
      kind: "category_value",
      amount_eur: category.value_eur,
      category: category.category,
    });
    if (category.q4_average_eur !== undefined) {
      figures.push({
        key: `${category.category}.q4_average`,
        kind: "category_q4_average",
        amount_eur: category.q4_average_eur,
        category: category.category,
      });
    }
    for (const item of category.items) {
      const base = `item.${item.account_id}${item.asset_id === undefined ? "" : `.${item.asset_id}`}`;
      const where = {
        category: category.category,
        account_id: item.account_id,
        ...(item.asset_id === undefined ? {} : { asset_id: item.asset_id }),
      };
      if (item.value_eur !== undefined) {
        figures.push({
          key: item.asset_id === undefined ? `${base}.balance` : base,
          kind: item.asset_id === undefined ? "item_balance" : "item_value",
          amount_eur: item.value_eur,
          ...where,
        });
      }
      if (item.q4_average_eur !== undefined) {
        figures.push({
          key: `${base}.q4_average`,
          kind: "item_q4_average",
          amount_eur: item.q4_average_eur,
          ...where,
        });
      }
    }
  }
  return figures;
};

/**
 * The figures of a `renta`, in the shape the event declares them.
 *
 * It reads the origin year and the category **off the figure**, which carries
 * both typed, instead of taking them back out of the text of its own key
 * (`"pending.2027.capital_gain"` split on the dots). The key is a handle for
 * the interfaces —a map key, the id of a field— and nothing here has to
 * understand it; a string that the domain writes and then parses back is a
 * type it gave up, and the compiler stops helping the day a category is added.
 *
 * What is **not** touched is the value: whatever the user typed goes in as it
 * was typed. The ledger is append-only, a line's fingerprint is its bytes, and
 * `proposal.test.ts` pins the text of this object whole.
 */
const rentaDeclared = (
  figures: readonly FilingFigureProposal[],
  values: ReadonlyMap<string, string>,
): Record<string, unknown> => {
  const pending: { origin_year: number; category: IncomeCategory; amount_eur: string }[] = [];
  let base = "";
  let deferred = "";
  for (const figure of figures) {
    const value = values.get(figure.key) as string;
    if (figure.kind === "savings_base") {
      base = value;
    } else if (figure.kind === "deferred") {
      deferred = value;
    } else {
      pending.push({
        origin_year: figure.origin_year as number,
        category: figure.category as IncomeCategory,
        amount_eur: value,
      });
    }
  }
  return {
    savings_base_eur: base,
    pending_losses: pending,
    deferred_losses_eur: deferred,
  };
};

/** The same for a `720` or a `721`: the totals by category and the list of assets. */
const informativeDeclared = (
  figures: readonly FilingFigureProposal[],
  values: ReadonlyMap<string, string>,
): Record<string, unknown> => {
  const declared: Record<string, unknown> = {};
  const totals = new Map<string, Record<string, string>>();
  const items = new Map<string, Record<string, unknown>>();
  for (const figure of figures) {
    const value = values.get(figure.key) as string;
    if (figure.kind === "category_value" || figure.kind === "category_q4_average") {
      const total = totals.get(figure.category as string) ?? {};
      total[figure.kind === "category_value" ? "value" : "q4_average"] = value;
      totals.set(figure.category as string, total);
      continue;
    }
    const key = `${figure.account_id as string}|${figure.asset_id ?? ""}`;
    const item = items.get(key) ?? {
      category: figure.category,
      account_id: figure.account_id,
      ...(figure.asset_id === undefined ? {} : { asset_id: figure.asset_id }),
    };
    if (figure.kind === "item_value") {
      item.value_eur = value;
    } else if (figure.kind === "item_balance") {
      item.balance_eur = value;
    } else {
      item.q4_average_eur = value;
    }
    items.set(key, item);
  }
  for (const [category, total] of totals) {
    declared[category] =
      total.q4_average === undefined
        ? { value_eur: total.value }
        : { balance_eur: total.value, q4_average_eur: total.q4_average };
  }
  return { ...declared, items: [...items.values()] };
};

/**
 * What to propose for a return of `model` and `year`, and how to turn what the
 * user confirms into the event.
 */
export const filingProposal = (
  events: readonly LedgerEvent[],
  model: FilingModel,
  year: number,
  options: { today: CivilDate },
): FilingProposal => {
  const report =
    model === "renta"
      ? taxYear(events, year, options)
      : informativeReturn(events, model, year, options);
  const figures =
    model === "renta"
      ? rentaFigures(report as TaxYearReport)
      : informativeFigures(report as InformativeReturn);
  const state = projectLedger(events, { collectErrors: true });
  const inForce = filingInForce(state, model, year, options.today);
  // What it takes to reproduce the calculation of this day: the whole resolved
  // configuration and not only the `settings_changed` in force, because with
  // anything taken from the code that line alone does not reproduce it.
  const resolved = settingsAt(state, options.today);
  const computed = new Map(figures.map((figure) => [figure.key, figure.amount_eur.centsText()]));
  return {
    model,
    year,
    figures,
    ...(inForce === undefined ? {} : { supersedes: inForce.event_id }),
    draft(declared, meta) {
      const values = new Map(computed);
      for (const [key, amount] of declared) {
        if (computed.has(key)) {
          values.set(key, amount);
        }
      }
      const shape = (source: ReadonlyMap<string, string>): Record<string, unknown> =>
        model === "renta" ? rentaDeclared(figures, source) : informativeDeclared(figures, source);
      const supersedes = meta.supersedes ?? inForce?.event_id;
      return {
        type: "tax_return_filed",
        model,
        tax_year: year,
        filed_at: meta.filed_at,
        receipt_reference: meta.receipt_reference,
        ...(supersedes === undefined ? {} : { supersedes }),
        declared: shape(values),
        computed: {
          ...shape(computed),
          as_of: options.today,
          settings_origin: resolved.origin,
          settings: normalizeSettings(resolved.settings),
        },
        // The fingerprint covers exactly the lines before this one, which is
        // where it will land: nothing else writes between the load and the
        // record.
        ledger_fingerprint: fingerprintOfEvents(events),
        ...(meta.notes === undefined ? {} : { notes: meta.notes }),
      };
    },
  };
};
