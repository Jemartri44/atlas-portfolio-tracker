// What the owner changed of the projection's assumptions, as `settings/projection.json` keeps it
// outside the ledger (`docs/data-schema.md` §1, `docs/api.md` §6.2):
//
//   { "projection_format": 1, "years"?: 20, "monthly_eur"?: "540", "inflation_pct"?: "2.2",
//     "commission_pct"?: "0.1", "classes"?: { "<class>": { "return_pct"?: "7", "volatility_pct"?: "15" } } }
//
// **Only what was edited**: a value absent here is the starting one (`PROJECTION_START`), so the
// yearly update of those figures reaches whatever the owner left alone, and resetting is writing
// an object with nothing in it. An unreadable or invalid object is no edit, never an estimate.

import { ValidationError } from "../errors.js";
import { isRecord } from "../guards.js";
import { utf8Encode } from "../ids/sha256.js";
import { Decimal } from "../money/decimal.js";
import { ASSET_CLASSES, type AssetClass } from "../schema/events.js";
import { repeatedKey } from "../schema/json-keys.js";
import { MAX_HORIZON_YEARS } from "./growth.js";

export const PROJECTION_FORMAT = 1;
/** The only key of the data bucket that holds it. */
export const PROJECTION_KEY = "settings/projection.json";
export const MAX_PROJECTION_BYTES = 4_096;
export const DEFAULT_PROJECTION_YEARS = 20;

export interface ClassStart {
  returnPct: Decimal;
  volatilityPct: Decimal;
  /** The bad and good cases its source publishes, instead of the ones the volatility gives. */
  lowPct?: Decimal;
  highPct?: Decimal;
}

const start = (returnPct: string, volatilityPct: string): ClassStart => ({
  returnPct: Decimal.parse(returnPct),
  volatilityPct: Decimal.parse(volatilityPct),
});

/**
 * Where the assumptions start: J.P. Morgan Asset Management, Long-Term Capital Market Assumptions
 * 2027, data at 30/09/2026, compound returns over 10-15 years. In euros, but for bitcoin, which the
 * report gives only in dollars. Estimates of a manager, not official figures.
 */
export const PROJECTION_START: {
  readonly classes: Readonly<Record<AssetClass, ClassStart>>;
  readonly inflationPct: Decimal;
} = {
  classes: {
    equity: start("7", "15.52"),
    fixed_income: start("4.3", "4.64"),
    gold: start("5", "16.15"),
    crypto: {
      ...start("10", "55"),
      lowPct: Decimal.parse("-11.2"),
      highPct: Decimal.parse("16.6"),
    },
  },
  inflationPct: Decimal.parse("2.2"),
};

export interface ClassEdit {
  return_pct?: string;
  volatility_pct?: string;
}

export interface ProjectionEdits {
  years?: number;
  monthly_eur?: string;
  inflation_pct?: string;
  commission_pct?: string;
  classes?: Partial<Record<AssetClass, ClassEdit>>;
}

export type ProjectionFileReason =
  | "json"
  | "repeated_key"
  | "too_large"
  | "format"
  | "top_level_key"
  | "years"
  | "class"
  | "class_key"
  | "number"
  | "range";

const TOP_LEVEL = [
  "projection_format",
  "years",
  "monthly_eur",
  "inflation_pct",
  "commission_pct",
  "classes",
];
const NUMBER = /^-?\d{1,12}(\.\d{1,12})?$/;
/** A year of −100 % or worse leaves no pot to grow, and past this nothing means anything. */
const LOWEST_PCT = "-99";
const HIGHEST_PCT = "1000";

const refuse = (reason: ProjectionFileReason, details: Record<string, unknown> = {}): never => {
  throw new ValidationError("invalid_projection", `the projection is not valid: ${reason}`, {
    reason,
    ...details,
  });
};

const checkNumber = (field: string, value: unknown, lowest: string, highest?: string): void => {
  if (typeof value !== "string" || !NUMBER.test(value)) {
    refuse("number", { field });
  }
  const read = Decimal.parse(value);
  if (
    read.lt(Decimal.parse(lowest)) ||
    (highest !== undefined && read.gt(Decimal.parse(highest)))
  ) {
    refuse("range", { field });
  }
};

const validClasses = (classes: unknown): void => {
  if (!isRecord(classes)) {
    refuse("format");
  }
  for (const [key, edit] of Object.entries(classes as Record<string, unknown>)) {
    if (!(ASSET_CLASSES as readonly string[]).includes(key) || !isRecord(edit)) {
      refuse("class", { field: key });
    }
    const own = edit as Record<string, unknown>;
    if (Object.keys(own).some((name) => name !== "return_pct" && name !== "volatility_pct")) {
      refuse("class_key", { field: key });
    }
    if ("return_pct" in own) {
      checkNumber(`${key}.return_pct`, own.return_pct, LOWEST_PCT, HIGHEST_PCT);
    }
    if ("volatility_pct" in own) {
      checkNumber(`${key}.volatility_pct`, own.volatility_pct, "0", HIGHEST_PCT);
    }
  }
};

/**
 * The edits of a document already parsed, or a `ValidationError` `invalid_projection` whose
 * `reason` says what is wrong and `field` where. Nothing is repaired or rounded.
 */
export const validateProjection = (document: unknown): ProjectionEdits => {
  if (!isRecord(document) || document.projection_format !== PROJECTION_FORMAT) {
    return refuse("format");
  }
  if (Object.keys(document).some((key) => !TOP_LEVEL.includes(key))) {
    return refuse("top_level_key");
  }
  const { years, monthly_eur, inflation_pct, commission_pct, classes } = document;
  if (
    "years" in document &&
    (!Number.isInteger(years) || (years as number) < 1 || (years as number) > MAX_HORIZON_YEARS)
  ) {
    refuse("years", { max: MAX_HORIZON_YEARS });
  }
  if ("monthly_eur" in document) {
    checkNumber("monthly_eur", monthly_eur, "0");
  }
  if ("inflation_pct" in document) {
    checkNumber("inflation_pct", inflation_pct, LOWEST_PCT, HIGHEST_PCT);
  }
  if ("commission_pct" in document) {
    checkNumber("commission_pct", commission_pct, "0", "100");
  }
  if ("classes" in document) {
    validClasses(classes);
  }
  const { projection_format: _format, ...edits } = document;
  return edits as ProjectionEdits;
};

/** The text of the object: size, JSON, no repeated key, then `validateProjection`. */
export const parseProjectionText = (text: string): ProjectionEdits => {
  if (utf8Encode(text).length > MAX_PROJECTION_BYTES) {
    refuse("too_large", { max: MAX_PROJECTION_BYTES });
  }
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch {
    return refuse("json");
  }
  if (repeatedKey(text) !== undefined) {
    refuse("repeated_key");
  }
  return validateProjection(document);
};

/** What is read: the edits, or **none** when the object is missing, unreadable or invalid. */
export const projectionOrNone = (text: string | undefined): ProjectionEdits => {
  if (text === undefined) {
    return {};
  }
  try {
    return parseProjectionText(text);
  } catch {
    // parseProjectionText throws only ValidationError: whatever is wrong with the object is no edit.
    return {};
  }
};

/** The canonical text of the object, the one stored: validated first, so nothing invalid is written. */
export const projectionText = (edits: ProjectionEdits): string => {
  const document = { projection_format: PROJECTION_FORMAT, ...edits };
  validateProjection(document);
  return `${JSON.stringify(document)}\n`;
};

/** A class with the owner's edits. Editing its return or volatility drops the published cases. */
const classWith = (origin: ClassStart, edit: ClassEdit | undefined): ClassStart => {
  const returnPct =
    edit?.return_pct === undefined ? origin.returnPct : Decimal.parse(edit.return_pct);
  const volatilityPct =
    edit?.volatility_pct === undefined ? origin.volatilityPct : Decimal.parse(edit.volatility_pct);
  return returnPct.eq(origin.returnPct) && volatilityPct.eq(origin.volatilityPct)
    ? origin
    : { returnPct, volatilityPct };
};

export interface ResolvedAssumptions {
  years: number;
  /** Absent: the core's part of the contribution of the settings. */
  monthlyEur?: Decimal;
  classes: Record<AssetClass, ClassStart>;
  inflationPct: Decimal;
  /** Absent: no commission is assumed, only the TER, and the result says so. */
  commissionPct?: Decimal;
}

/** The assumptions in force: each value the owner edited, and the starting one for the rest. */
export const projectionAssumptions = (edits: ProjectionEdits): ResolvedAssumptions => ({
  years: edits.years ?? DEFAULT_PROJECTION_YEARS,
  ...(edits.monthly_eur === undefined ? {} : { monthlyEur: Decimal.parse(edits.monthly_eur) }),
  classes: Object.fromEntries(
    ASSET_CLASSES.map((name) => [
      name,
      classWith(PROJECTION_START.classes[name], edits.classes?.[name]),
    ]),
  ) as Record<AssetClass, ClassStart>,
  inflationPct:
    edits.inflation_pct === undefined
      ? PROJECTION_START.inflationPct
      : Decimal.parse(edits.inflation_pct),
  ...(edits.commission_pct === undefined
    ? {}
    : { commissionPct: Decimal.parse(edits.commission_pct) }),
});
