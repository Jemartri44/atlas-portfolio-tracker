// The Modelo 720 and the Modelo 721 (feature 010, block 3).
//
// One machinery for the two (decision (j)): the 721 is the 720 with a single
// category, and with the portfolio of this user it will be zero almost always.
// What differs is what each one counts:
//
//   - **720**: cash in accounts abroad —by account and currency, negative
//     balances netting against positive ones— and securities, which is funds,
//     ETFs, ETCs, ETPs and shares in **one block with one threshold**
//     (art. 42 ter.4.c: valores, IIC y seguros, "conjuntamente"). An ETP is a
//     security of the 720 and never of the 721.
//   - **721**: crypto held **directly** and kept abroad. The ledger cannot tell
//     self-custody from a foreign custodian, so everything in an account whose
//     country is not Spain counts and the output says so: over-declaring an
//     informative return is the prudent direction (prompt 010, P6).
//
// The verdict only exists for a 31 December that has already happened. The
// current year is shown with what there is on the day of the query, labelled as
// such: the model is about one date, and that date has not arrived.

import type { CivilDate } from "../dates/civil-date.js";
import { DomainError } from "../errors.js";
import type { Ulid } from "../ids/ulid.js";
import { Money } from "../money/money.js";
import type { Filing } from "../projections/filings.js";
import { filingInForce } from "../projections/filings.js";
import type { LedgerState, Warning } from "../projections/state.js";
import {
  type AccountId,
  type AssetId,
  FIRST_FILING_YEAR,
  type FiledInformativeFigures,
  type FiledItem,
  type FilingCategory,
  type LedgerEvent,
} from "../schema/events.js";
import {
  type InformativeModel,
  modelAlertThresholdOf,
  modelIncreaseOf,
  modelThresholdOf,
} from "../settings/settings.js";
import { sortCriteria } from "../tax/criteria.js";
import { type AverageBalance, quarterAverages } from "./balances.js";
import { lastFiledBefore } from "./filed.js";
import { type ForeignHoldings, foreignHoldingsAt } from "./holdings.js";
import type {
  FiledComparison,
  InformativeCategory,
  InformativeItem,
  InformativeReturn,
  ValueFlag,
} from "./report.js";
import { cashValueAt, toEurAt, valueAt, yearEnd } from "./valuation.js";
import { type Declared, type FlaggedItem, type Limits, verdictOf } from "./verdict.js";

const EUR = "EUR";

const zero = (): Money => Money.zero(EUR);

const keyOf = (accountId: AccountId, assetId?: AssetId): string =>
  assetId === undefined ? accountId : `${accountId}|${assetId}`;

/** A value that is not there at all, as against one that is there and marked. */
const MISSING: ReadonlySet<ValueFlag> = new Set(["price_missing"]);

const note = (code: string, message: string, details: Record<string, unknown>): Warning => ({
  code,
  event_id: "",
  message,
  details,
});

/** One item per foreign account: the asset of the cash category **is** the account. */
const accountItems = (
  holdings: ForeignHoldings,
  averages: Map<string, AverageBalance>,
  year: number,
): InformativeItem[] => {
  const byAccount = new Map<AccountId, InformativeItem["balances"]>();
  const add = (id: AccountId, currency: string, amount: Money, average: AverageBalance): void => {
    byAccount.set(id, [
      ...(byAccount.get(id) ?? []),
      { currency, amount, q4_average: average.average, days: average.days },
    ]);
  };
  for (const average of averages.values()) {
    const balance =
      holdings.cash.find(
        (entry) => entry.account_id === average.account_id && entry.currency === average.currency,
      )?.balance ?? Money.zero(average.currency);
    add(average.account_id, average.currency, balance, average);
  }
  const items: InformativeItem[] = [];
  for (const [account_id, balances] of byAccount) {
    // Never empty: the map is only written to with a part in hand.
    const parts = balances as NonNullable<InformativeItem["balances"]>;
    // Nothing at 31 December and nothing on average: the account is not an
    // asset of this return. An account that emptied during the quarter still
    // is, because its average is not zero.
    if (parts.every((part) => part.amount.isZero() && part.q4_average.isZero())) {
      continue;
    }
    const flags = new Set<ValueFlag>();
    let value = zero();
    let average = zero();
    let rate: string | undefined;
    let rateDate: CivilDate | undefined;
    for (const part of parts) {
      const valued = cashValueAt(holdings.state, part.currency, part.amount, year);
      for (const flag of valued.flags) {
        flags.add(flag);
      }
      if (part.currency !== EUR) {
        rate = valued.fx_rate;
        rateDate = valued.fx_rate_date;
      }
      // The asset is the account, so its currencies are converted and added
      // **before** the single rounding (#6).
      value = value.add(toEurAt(holdings.state, part.currency, part.amount));
      average = average.add(toEurAt(holdings.state, part.currency, part.q4_average));
    }
    items.push({
      category: "accounts",
      account_id,
      balances: parts,
      value_eur: value.roundToCents(),
      q4_average_eur: average.roundToCents(),
      ...(rate === undefined ? {} : { fx_rate: rate }),
      ...(rateDate === undefined ? {} : { fx_rate_date: rateDate }),
      flags: [...flags],
    });
  }
  return items.sort((a, b) => a.account_id.localeCompare(b.account_id));
};

/** One item per (account, asset) held abroad, valued at 31 December. */
const assetItems = (
  holdings: ForeignHoldings,
  category: FilingCategory,
  year: number,
): InformativeItem[] => {
  const source = category === "crypto" ? holdings.crypto : holdings.securities;
  return source
    .map((position) => {
      const valued = valueAt(
        holdings.state,
        position.asset_id,
        position.quantity,
        year,
        holdings.state.fiscalSettings,
      );
      return {
        category,
        account_id: position.account_id,
        asset_id: position.asset_id,
        quantity: position.quantity,
        ...(valued.value_eur === undefined ? {} : { value_eur: valued.value_eur }),
        ...(valued.valuation_date === undefined ? {} : { valuation_date: valued.valuation_date }),
        ...(valued.unit_value === undefined ? {} : { unit_value: valued.unit_value }),
        ...(valued.fx_rate === undefined ? {} : { fx_rate: valued.fx_rate }),
        ...(valued.fx_rate_date === undefined ? {} : { fx_rate_date: valued.fx_rate_date }),
        flags: valued.flags,
      } satisfies InformativeItem;
    })
    .sort(
      (a, b) =>
        a.account_id.localeCompare(b.account_id) ||
        (a.asset_id as string).localeCompare(b.asset_id as string),
    );
};

/** What the last return declared of a category, and which of its assets are gone. */
const declaredOf = (
  filing: Filing | undefined,
  category: FilingCategory,
  heldBefore: Set<string>,
  heldNow: Set<string>,
): Declared | undefined => {
  if (filing === undefined) {
    return undefined;
  }
  const figures = filing.declared as FiledInformativeFigures;
  const block = figures[category];
  const extinct = (figures.items as FiledItem[])
    .filter((item) => item.category === category)
    .filter((item) => {
      const key = keyOf(item.account_id, item.asset_id);
      return heldBefore.has(key) && !heldNow.has(key);
    })
    .map((item) => ({
      account_id: item.account_id,
      ...(item.asset_id === undefined ? {} : { asset_id: item.asset_id }),
    }));
  return {
    year: filing.tax_year,
    ...(block === undefined
      ? {}
      : {
          value_eur: Money.parse("value_eur" in block ? block.value_eur : block.balance_eur, EUR),
          ...("q4_average_eur" in block
            ? { q4_average_eur: Money.parse(block.q4_average_eur, EUR) }
            : {}),
        }),
    extinct,
  };
};

/** The assets of a year that a later return can find missing: cash counts while the account is open. */
const heldKeys = (holdings: ForeignHoldings): Set<string> => {
  const held = new Set<string>();
  for (const [id, account] of holdings.accounts) {
    // A cash account is extinguished when it is closed, not when it empties
    // (S7, Q7): a balance of zero on a live account is still an account.
    if (account.active) {
      held.add(keyOf(id));
    }
  }
  for (const position of [...holdings.securities, ...holdings.crypto]) {
    held.add(keyOf(position.account_id, position.asset_id));
  }
  return held;
};

const categoryOf = (
  category: FilingCategory,
  items: InformativeItem[],
  limits: Limits,
  declared: Declared | undefined,
): InformativeCategory => {
  const flagOf = (item: InformativeItem): FlaggedItem[] =>
    item.flags.map((flag) => ({
      account_id: item.account_id,
      ...(item.asset_id === undefined ? {} : { asset_id: item.asset_id }),
      flag,
    }));
  const missing = items.filter((item) => item.flags.some((flag) => MISSING.has(flag)));
  const flagged = items.filter((item) => item.value_eur !== undefined && item.flags.length > 0);
  const sum = (list: readonly InformativeItem[], key: "value_eur" | "q4_average_eur"): Money =>
    list.reduce((total, item) => total.add(item[key] ?? zero()), zero());
  const result = verdictOf(category, {
    items,
    value_eur: sum(items, "value_eur"),
    ...(category === "accounts" ? { q4_average_eur: sum(items, "q4_average_eur") } : {}),
    missing: missing.flatMap(flagOf),
    flagged: flagged.flatMap(flagOf),
    flagged_eur: sum(flagged, "value_eur"),
    limits,
    ...(declared === undefined ? {} : { declared }),
  });
  return category === "accounts"
    ? { ...result, q4_average_eur: sum(items, "q4_average_eur") }
    : result;
};

const comparisonOf = (
  filing: Filing,
  categories: readonly InformativeCategory[],
): FiledComparison => {
  const figures = filing.declared as FiledInformativeFigures;
  return {
    filing_id: filing.event_id as Ulid,
    filed_at: filing.filed_at,
    tax_year: filing.tax_year,
    categories: categories.map((entry) => {
      const block = figures[entry.category];
      return {
        category: entry.category,
        ...(block === undefined
          ? {}
          : {
              declared_eur: Money.parse(
                "value_eur" in block ? block.value_eur : block.balance_eur,
                EUR,
              ),
              ...("q4_average_eur" in block
                ? { declared_q4_average_eur: Money.parse(block.q4_average_eur, EUR) }
                : {}),
            }),
        computed_eur: entry.value_eur,
        ...(entry.q4_average_eur === undefined
          ? {}
          : { computed_q4_average_eur: entry.q4_average_eur }),
      };
    }),
  };
};

const CATEGORIES: Record<InformativeModel, FilingCategory[]> = {
  "720": ["accounts", "securities"],
  "721": ["crypto"],
};

/** The Modelo 720 or the Modelo 721 of a tax year. */
export const informativeReturn = (
  events: readonly LedgerEvent[],
  model: InformativeModel,
  year: number,
  options: { today: CivilDate },
): InformativeReturn => {
  const end = yearEnd(year);
  // A year the model did not exist in has nothing to decide, and a 31 December
  // that has not arrived has nothing to decide **yet**: neither is a "no".
  const exists = year >= FIRST_FILING_YEAR[model];
  const closed = exists && end < options.today;
  const holdings = foreignHoldingsAt(events, closed ? end : options.today);
  const state: LedgerState = holdings.state;
  // The same refusal as the income tax (feature 009, Q11): a projection that
  // skipped an event values the wrong quantities, and the answer to that is the
  // list of what to repair, not a verdict about whether a return is due.
  if (state.invalid.length > 0) {
    throw new DomainError(
      "tax_ledger_invalid",
      `the ledger has ${state.invalid.length} invalid events; repair them before computing an informative return`,
      {
        count: state.invalid.length,
        invalid: state.invalid.map((entry) => ({
          id: entry.event.id,
          type: entry.event.type,
          code: entry.error.code,
        })),
      },
    );
  }
  const settings = state.fiscalSettings;
  const limits: Limits = {
    threshold: modelThresholdOf(settings, model),
    increase: modelIncreaseOf(settings, model),
    alert: modelAlertThresholdOf(settings, model),
  };
  const previous = closed ? lastFiledBefore(state, model, year, options.today) : undefined;
  // The assets of the year before are only needed to spot an extinction, which
  // only a previous return can trigger: without one, nothing is projected.
  const before = previous === undefined ? undefined : foreignHoldingsAt(events, yearEnd(year - 1));
  const heldNow = heldKeys(holdings);
  const heldBefore = before === undefined ? new Set<string>() : heldKeys(before);
  const averages = quarterAverages(events, year, holdings.accounts);
  const categories = CATEGORIES[model].map((category) => {
    const items =
      category === "accounts"
        ? accountItems(holdings, averages, year)
        : assetItems(holdings, category, year);
    const decided = categoryOf(
      category,
      items,
      limits,
      declaredOf(previous, category, heldBefore, heldNow),
    );
    return closed ? decided : { ...decided, verdict: "not_applicable" as const, reasons: [] };
  });
  const filed = closed ? filingInForce(state, model, year, options.today) : undefined;
  const notes: Warning[] = [];
  if (!exists) {
    notes.push(
      note(
        "informative_model_did_not_exist",
        `the model ${model} did not exist in ${year}: there is nothing to file for that year`,
        { model, year, first_year: FIRST_FILING_YEAR[model] },
      ),
    );
  } else if (!closed) {
    notes.push(
      note(
        "informative_current_year",
        "the model is about 31 December and that day has not arrived: this is the state on the day of the query, with no verdict",
        { year, as_of: options.today },
      ),
    );
  }
  if (holdings.excluded.length > 0) {
    notes.push(
      note(
        "informative_domestic_accounts_left_out",
        "accounts registered in Spain are left out even when what they hold is foreign: before the registry the holder is the distributor",
        { accounts: holdings.excluded.map((entry) => entry.account_id).sort() },
      ),
    );
  }
  if (holdings.changed_country.length > 0) {
    notes.push(
      note(
        "informative_account_changed_country",
        "an account changed country: what counts is the country it had on 31 December, taken from the day each change was recorded",
        { accounts: [...holdings.changed_country].sort() },
      ),
    );
  }
  if (model === "721" && categories[0]?.items.length !== 0) {
    notes.push(
      note(
        "informative_crypto_custody_unknown",
        "everything held in foreign accounts is counted; anything in self-custody would not be, and the ledger cannot tell the two apart",
        {},
      ),
    );
  }
  notes.push(
    note(
      "informative_criteria_not_numbered",
      "the method of the quarterly average and the classification of ETFs, ETCs and ETPs rest on criteria the direction has not numbered yet (fichas F3 and F4)",
      {},
    ),
  );
  return {
    model,
    year,
    scope: "fiscal_total",
    today: options.today,
    period: exists ? (closed ? "closed_year" : "current_year") : "before_model",
    threshold_eur: Money.of(limits.threshold, EUR),
    increase_eur: Money.of(limits.increase, EUR),
    alert_eur: Money.of(limits.alert, EUR),
    categories,
    excluded: holdings.excluded,
    ...(filed === undefined ? {} : { filed: comparisonOf(filed, categories) }),
    ...(previous === undefined ? {} : { previous: comparisonOf(previous, categories) }),
    criteria: sortCriteria(["6", "11"]),
    notes,
  };
};

export const model720 = (
  events: readonly LedgerEvent[],
  year: number,
  options: { today: CivilDate },
): InformativeReturn => informativeReturn(events, "720", year, options);

export const model721 = (
  events: readonly LedgerEvent[],
  year: number,
  options: { today: CivilDate },
): InformativeReturn => informativeReturn(events, "721", year, options);
