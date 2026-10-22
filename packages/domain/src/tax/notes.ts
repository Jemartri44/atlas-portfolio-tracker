// The notes of the tax report: codes the interfaces translate, never a figure
// in disguise.

import { yearOf } from "../dates/civil-date.js";
import type { Ulid } from "../ids/ulid.js";
import { Decimal } from "../money/decimal.js";
import { sum } from "../money/eur.js";
import { FxRate } from "../money/fx-rate.js";
import { EUR } from "../money/money.js";
import { sharedIsins } from "../projections/isin.js";
import type { LedgerState, RealizedGain, Warning } from "../projections/state.js";
import { ASSET_TYPES, type FxExchangeEvent } from "../schema/events.js";
import { treatyWithholdingPctOf } from "../settings/settings.js";
import { type Core, exchangesOfYear } from "./core.js";
import { sortCriteria } from "./criteria.js";
import type { DoubleTaxationLine, InKindLine } from "./report.js";

// --- Notes ------------------------------------------------------------------

/** A note of the report: a code the interfaces translate, never a figure in disguise. */
export const note = (
  code: string,
  eventId: Ulid,
  message: string,
  details: Record<string, unknown>,
) => ({ code, event_id: eventId, message, details }) satisfies Warning;

export const settingsFromCode = (state: LedgerState): { origin: string; from_code: string[] } => {
  const last = state.settingsHistory[state.settingsHistory.length - 1];
  const settings = last === undefined ? undefined : last.settings;
  const missing: string[] = [];
  for (const type of ASSET_TYPES) {
    if (settings?.fiscal_date_rule[type] === undefined) {
      missing.push(`fiscal_date_rule.${type}`);
    }
    if (
      settings?.wash_sale_window[type] === undefined &&
      settings?.wash_sale_window_days?.[type] === undefined
    ) {
      missing.push(`wash_sale_window.${type}`);
    }
    if (settings?.income_category?.[type] === undefined) {
      missing.push(`income_category.${type}`);
    }
  }
  for (const field of [
    "wash_sale_transfer_counts",
    "savings_offset_limit_pct",
    "loss_carryforward_years",
  ] as const) {
    if (settings?.[field] === undefined) {
      missing.push(field);
    }
  }
  return { origin: last === undefined ? "default" : last.event_id, from_code: missing };
};

// --- Double taxation (#16) ----------------------------------------------------

export const doubleTaxation = (core: Core): { lines: DoubleTaxationLine[]; notes: Warning[] } => {
  const lines: DoubleTaxationLine[] = [];
  const notes: Warning[] = [];
  for (const income of core.income) {
    if (income.kind !== "dividend" || income.withholding_origin.isZero()) {
      continue;
    }
    const foreignTax = FxRate.of(
      Decimal.parse(income.gross.fx_rate),
      income.withholding_origin.currency,
      income.gross.fx_rate_date,
    )
      .toEur(income.withholding_origin)
      .roundToCents();
    const rate = treatyWithholdingPctOf(core.state.fiscalSettings, income.source_country);
    const base = {
      event_id: income.event_id,
      ...(income.source_country === undefined ? {} : { source_country: income.source_country }),
      gross_eur: income.gross_eur_rounded,
      foreign_tax_eur: foreignTax,
      criteria: sortCriteria(["16"]),
    };
    if (rate === undefined) {
      lines.push(base);
      notes.push(
        income.source_country === undefined
          ? note(
              "tax_dividend_without_country",
              income.event_id,
              "the dividend does not say which country paid it: no deduction is calculated",
              { foreign_tax_eur: foreignTax.amount.toString() },
            )
          : note(
              "tax_treaty_rate_missing",
              income.event_id,
              `no treaty rate is configured for ${income.source_country}: no deduction is calculated`,
              { country: income.source_country, foreign_tax_eur: foreignTax.amount.toString() },
            ),
      );
      continue;
    }
    const limit = income.gross_eur_rounded.mul(rate).div(Decimal.parse("100")).roundToCents();
    const deductible = foreignTax.cmp(limit) < 0 ? foreignTax : limit;
    lines.push({
      ...base,
      treaty_pct: rate.toString(),
      deductible_eur: deductible,
      not_deductible_eur: foreignTax.sub(deductible),
    });
  }
  return { lines, notes };
};

/**
 * **A line of the report that depends on a rate in doubt says so** (ADR-0029,
 * point 8; ADR-0024). "Depends" includes the acquisitions (decision (q) of
 * prompt 012): a sale depends on itself **and on the purchases whose lots it
 * consumes**, whose rate fixed the cost — the lineage of each lot says which.
 * The note **moves no figure**: the engine keeps computing with the `fx_rate`
 * of the ledger, which is the only source of the tax (trap 7 of CLAUDE.md).
 *
 * Both cite criterion 25 (ADR-0029, point 10): the rate that applies is the
 * one of the fiscal date in force, and a line with another one is corrected by
 * rectification, never recalculated.
 *
 * Three notes, each with its own literal: a rate the ECB history contradicts;
 * a rate it could not contrast; and `fx_rate_date_after_fiscal_date`, which
 * the projection sees **without** a history and which carries the note
 * anyway.
 */
/**
 * The findings of the ECB check that say a rate **is wrong**: the history
 * contradicts it. Any other one — a currency the ECB does not publish, or
 * stopped publishing, a line more recent than the history — says it could not
 * be contrasted, and gets a note of its own.
 */
const WRONG_RATE_CODES: ReadonlySet<string> = new Set([
  "fx_rate_mismatch",
  "fx_rate_date_unpublished",
  "fx_rate_date_not_latest",
]);

export const rateNotes = (
  core: Core,
  findings: readonly { event_id: string; code: string }[],
): Warning[] => {
  const byEvent = new Map<string, Set<string>>();
  for (const finding of findings) {
    byEvent.set(finding.event_id, (byEvent.get(finding.event_id) ?? new Set()).add(finding.code));
  }
  const afterFiscal = new Set(
    core.state.warnings
      .filter((warning) => warning.code === "fx_rate_date_after_fiscal_date")
      .map((warning) => warning.event_id),
  );
  const lines: { event_id: string; depends: string[] }[] = [
    ...core.transmissions.map((line) => ({
      event_id: line.event_id,
      depends: [
        line.event_id,
        // The lineage runs from the lot consumed back to the root acquisition,
        // which is its last step (`lineageOf`): the root needs no entry of its
        // own — the review of PR #75 found that entry to be an equivalent mutant.
        ...line.lots.flatMap((lot) => lot.lineage.map((step) => step.event_id)),
      ],
    })),
    ...core.income.map((line) => ({ event_id: line.event_id, depends: [line.event_id] })),
    ...core.expenses.map((line) => ({ event_id: line.event_id, depends: [line.event_id] })),
  ];
  const notes: Warning[] = [];
  /** The events a line depends on whose findings include one of `codes`, with those codes. */
  const matching = (depends: readonly string[], wanted: (code: string) => boolean) => {
    const events = depends.filter((id) =>
      [...(byEvent.get(id) ?? [])].some((code) => wanted(code)),
    );
    const codes = [
      ...new Set(events.flatMap((id) => [...(byEvent.get(id) as Set<string>)].filter(wanted))),
    ].sort();
    return { events, codes };
  };
  for (const line of lines) {
    const depends = [...new Set(line.depends)];
    // Each finding says **what it is** (review of PR #75): a rate the history
    // contradicts is not the same as one it could not contrast, and saying «not
    // the official one» of the second would state what nobody checked.
    const wrong = matching(depends, (code) => WRONG_RATE_CODES.has(code));
    if (wrong.events.length > 0) {
      notes.push(
        note(
          "tax_fx_rate_finding",
          line.event_id,
          "this line depends on an ECB rate that is not the official one of its date; the figure is computed with the rate of the ledger",
          { criterion: "25", events: wrong.events, codes: wrong.codes },
        ),
      );
    }
    const unverified = matching(depends, (code) => !WRONG_RATE_CODES.has(code));
    if (unverified.events.length > 0) {
      notes.push(
        note(
          "tax_fx_rate_unverified",
          line.event_id,
          "this line depends on an ECB rate the history could not contrast; nothing is said of whether it is right, and the figure is computed with the rate of the ledger",
          { criterion: "25", events: unverified.events, codes: unverified.codes },
        ),
      );
    }
    const late = depends.filter((id) => afterFiscal.has(id));
    if (late.length > 0) {
      notes.push(
        note(
          "tax_fx_rate_date_after_fiscal_date",
          line.event_id,
          "this line depends on an ECB rate dated after its fiscal date; the figure is computed with the rate of the ledger",
          { criterion: "25", events: late },
        ),
      );
    }
  }
  return notes;
};

export const notesOf = (
  core: Core,
  year: number,
  fromCode: readonly string[],
  inKind: readonly InKindLine[],
  ddiNotes: readonly Warning[],
): Warning[] => {
  const notes: Warning[] = [
    note(
      "tax_quota_not_computed",
      "",
      "this is the savings base, not the tax: the rest of the return is not in the ledger",
      {},
    ),
  ];
  if (core.income.some((line) => line.kind === "dividend" && !line.withholding_origin.isZero())) {
    notes.push(
      note(
        "tax_double_taxation_partial",
        "",
        "only the treaty limit of the double taxation deduction is computed; the effective average rate needs the whole return, and what is not deductible is lost",
        {},
      ),
    );
  }
  notes.push(...ddiNotes);
  const foreign = [...core.ctx.events.values()].filter(
    (event) =>
      event.type === "fx_exchange" && yearOf((event as FxExchangeEvent).value_date) === year,
  );
  const currencies = new Set<string>([
    ...core.transmissions.map((line) => line.proceeds.amount.currency),
    ...core.income.map((line) => line.gross.amount.currency),
    ...foreign.flatMap((event) => [
      (event as FxExchangeEvent).sold_currency,
      (event as FxExchangeEvent).bought_currency,
    ]),
  ]);
  currencies.delete(EUR);
  if (currencies.size > 0) {
    notes.push(
      note(
        "tax_fx_differences_not_computed",
        "",
        "gains and losses of foreign cash (criterion #4) are not computed",
        { currencies: [...currencies].sort(), fx_exchanges: foreign.map((event) => event.id) },
      ),
    );
  }
  for (const entry of inKind) {
    notes.push(
      note(
        "tax_in_kind_income_not_integrated",
        entry.event_id,
        "income in kind is recorded and not integrated (criterion #8 in force)",
        { income_eur: entry.amount_eur.amount.toString(), base: entry.base },
      ),
    );
  }
  for (const line of core.transmissions) {
    if (line.provisional_until !== undefined) {
      notes.push(
        note(
          "tax_window_open",
          line.event_id,
          `the wash-sale window of this loss is open until ${line.provisional_until}`,
          {
            asset_id: line.asset_id,
            loss_eur: line.own_eur.add(line.released_eur).roundToCents().amount.toString(),
            window_end: line.provisional_until,
          },
        ),
      );
    }
  }
  for (const outcome of core.ctx.walk.outcomes) {
    const gain = core.state.gains[outcome.gain_index] as RealizedGain;
    if (gain.year !== year) {
      continue;
    }
    if (outcome.foreign_released.length > 0) {
      notes.push(
        note(
          "tax_release_category_differs",
          gain.event_id,
          "a deferred loss of the other income category was released here and integrated where it came from",
          {
            amount_eur: sum(outcome.foreign_released.map((r) => r.amount_eur))
              .roundToCents()
              .amount.toString(),
          },
        ),
      );
    }
  }
  for (const action of exchangesOfYear(core, year)) {
    if (action.neutrality_regime === false) {
      notes.push(
        note(
          "tax_neutrality_contradiction",
          action.id,
          "the event says the neutrality regime does not apply, yet it keeps date and cost",
          { kind: action.kind },
        ),
      );
    }
  }
  // Two assets with one ISIN are one security to the tax agency and two to the
  // engine: its wash-sale rule and its FIFO cannot see across them (ADR-0009).
  // Recording refuses it; a ledger written before is told here, where it costs.
  for (const [isin, assets] of sharedIsins(core.state.assets.values())) {
    notes.push(
      note(
        "tax_duplicate_isin",
        "",
        `ISIN ${isin} is shared by ${assets.join(", ")}: the wash-sale rule and FIFO treat them as different securities`,
        { isin, assets },
      ),
    );
  }
  for (const entry of core.compensation.expired) {
    notes.push(
      note(
        "tax_loss_expires",
        "",
        `a pending ${entry.category} balance of ${entry.origin_year} expires`,
        {
          origin_year: entry.origin_year,
          category: entry.category,
          amount_eur: entry.amount_eur.amount.toString(),
        },
      ),
    );
  }
  if (fromCode.length > 0) {
    notes.push(
      note(
        "tax_settings_default_used",
        "",
        "some fiscal settings are not in the ledger and were taken from the code (ADR-0022)",
        { fields: [...fromCode] },
      ),
    );
  }
  return notes;
};
