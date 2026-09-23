// What the ledger records of the returns that were actually filed (ADR-0020).
//
// A filing is an **administrative document**, like a thesis: it has no business
// date, it is applied in file order after the catalogue, and a view asked for a
// past date cuts it by **its own date**, `filed_at`, and not by the cut of
// `asOf` (ADR-0016, data-schema.md §7). A query about June does not see what
// was filed in December.
//
// What it declares is a **fact**, kept as it was filed even when the
// application computes something else today. Comparing the two is the point of
// the whole thing, and it lives in the tax engine; here there is only the
// bookkeeping: which filings exist, which one of each (model, year) is in
// force, and the refusals that keep that question answerable.

import type { CivilDate } from "../dates/civil-date.js";
import { ProjectionError } from "../errors.js";
import type { Ulid } from "../ids/ulid.js";
import type {
  FiledFigures,
  FiledInformativeFigures,
  FilingModel,
  LedgerFingerprint,
  TaxReturnFiledEvent,
} from "../schema/events.js";
import { requireAccount, requireAsset } from "./catalogue.js";
import type { LedgerState } from "./state.js";

/** One filing of the ledger, with its place in the chain of supplementary returns resolved. */
/**
 * What the ledger records about a fingerprint the user accepted as
 * unverifiable (ADR-0025). It says **which** filing, **why** —never the two
 * reasons under one word— what the fingerprint declared, which after
 * resealing the ledger holds nowhere else, and **when the user gave it for
 * good**, which is half of the sentence `check` has to keep saying for ever.
 */
export interface FingerprintWaiver {
  waiver_id: Ulid;
  filing_id: Ulid;
  reason: "digest" | "unreadable";
  declared_schema_version: number;
  declared_lines: number;
  accepted_on: CivilDate;
}

export interface Filing {
  event_id: Ulid;
  model: FilingModel;
  tax_year: number;
  filed_at: CivilDate;
  receipt_reference: string;
  /** The filing this one replaces, when it is a supplementary return. */
  supersedes?: Ulid;
  /** The one that replaced it, when there is one: then this is no longer in force. */
  superseded_by?: Ulid;
  declared: FiledFigures;
  computed: TaxReturnFiledEvent["computed"];
  fingerprint: LedgerFingerprint;
  notes?: string;
  /** File position: the fingerprint covers exactly the lines before it. */
  position: number;
}

const key = (model: FilingModel, year: number): string => `${model}|${String(year)}`;

const refuse = (
  code: string,
  eventId: Ulid,
  message: string,
  details: Record<string, unknown>,
): never => {
  throw new ProjectionError(code, eventId, message, details);
};

/**
 * Applies a filing in file order.
 *
 * The rules exist so that "which return of this year is in force?" always has
 * exactly one answer. A second filing of the same model and year **without**
 * `supersedes` is refused, because nothing would say which of the two the
 * carry-forward should anchor on; and a `supersedes` that points at another
 * model, another year, something that is not a filing, one already superseded
 * or one filed later is refused for the same reason.
 */
export const applyTaxReturnFiled = (
  state: LedgerState,
  event: TaxReturnFiledEvent,
  position: number,
): void => {
  const head = [...state.filings.values()].find(
    (filing) =>
      key(filing.model, filing.tax_year) === key(event.model, event.tax_year) &&
      filing.superseded_by === undefined,
  );
  if (event.supersedes === undefined) {
    if (head !== undefined) {
      refuse(
        "filing_already_exists",
        event.id,
        `a ${event.model} of ${event.tax_year} is already filed; a supplementary return says which one it replaces`,
        { model: event.model, tax_year: event.tax_year, filing_id: head.event_id },
      );
    }
  } else {
    const target = state.filings.get(event.supersedes);
    const reason =
      target === undefined
        ? "not_a_filing"
        : target.model !== event.model
          ? "other_model"
          : target.tax_year !== event.tax_year
            ? "other_year"
            : target.superseded_by !== undefined
              ? "already_superseded"
              : // The one being replaced was filed **after** this one: a
                // supplementary return cannot supersede a later return.
                target.filed_at > event.filed_at
                ? "filed_later"
                : undefined;
    if (reason !== undefined) {
      refuse(
        "filing_supersedes_invalid",
        event.id,
        `the filing this one replaces cannot be replaced: ${reason}`,
        { reason, supersedes: event.supersedes, model: event.model, tax_year: event.tax_year },
      );
    }
    (target as Filing).superseded_by = event.id;
  }
  // The assets of an informative return name the catalogue, which pass A has
  // already applied whole: a filing that names an account or an asset nobody
  // registered is a filing nobody can compare with anything.
  if (event.model !== "renta") {
    for (const item of (event.declared as FiledInformativeFigures).items) {
      requireAccount(state, item.account_id, event.id);
      if (item.asset_id !== undefined) {
        requireAsset(state, item.asset_id, event.id);
      }
    }
  }
  state.filings.set(event.id, {
    event_id: event.id,
    model: event.model,
    tax_year: event.tax_year,
    filed_at: event.filed_at,
    receipt_reference: event.receipt_reference,
    ...(event.supersedes === undefined ? {} : { supersedes: event.supersedes }),
    declared: event.declared,
    computed: event.computed,
    fingerprint: event.ledger_fingerprint,
    ...(event.notes === undefined ? {} : { notes: event.notes }),
    position,
  });
};

/**
 * The filing of a model and year in force **at a date**: the last of the chain
 * whose `filed_at` is on or before it.
 *
 * Filtering by `filed_at` and not by the chain's head is what makes a query
 * about the past honest: on 1 June 2027 the original return was in force, even
 * if a supplementary one replaced it in September. Walking the chain from the
 * original is what makes the answer unique.
 */
export const filingInForce = (
  state: LedgerState,
  model: FilingModel,
  year: number,
  at: CivilDate,
): Filing | undefined => {
  const candidates = [...state.filings.values()].filter(
    (filing) => filing.model === model && filing.tax_year === year && filing.filed_at <= at,
  );
  // The last one filed, and among those of the same day the last of the file:
  // a chain is written in order, so the later line is the later filing.
  return candidates.sort((a, b) => a.filed_at.localeCompare(b.filed_at) || a.position - b.position)[
    candidates.length - 1
  ];
};

/** Every (model, year) with a filing in force at a date: the years that are closed. */
export const closedYears = (
  state: LedgerState,
  at: CivilDate,
): { model: FilingModel; year: number; filing: Filing }[] => {
  const seen = new Map<string, { model: FilingModel; year: number; filing: Filing }>();
  for (const filing of state.filings.values()) {
    if (filing.filed_at > at) {
      continue;
    }
    // Never undefined: this filing is itself a candidate, so the chain has at
    // least one member on or before the date.
    const inForce = filingInForce(state, filing.model, filing.tax_year, at) as Filing;
    seen.set(key(filing.model, filing.tax_year), {
      model: filing.model,
      year: filing.tax_year,
      filing: inForce,
    });
  }
  return [...seen.values()].sort((a, b) => a.year - b.year || a.model.localeCompare(b.model));
};
