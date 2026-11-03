// The exposure the owner declares per asset, as `settings/exposure.json` keeps it outside the
// ledger (`docs/data-schema.md` §1, `docs/api.md` §6.2):
//
//   { "exposure_format": 1, "assets": { "<asset_id>": { "currency"?: {…}, "region"?: {…} } } }
//
// **One validator** for every reader and writer: the API when it writes, `exposure()` when it
// reads. An unreadable or invalid object is **no data**, never an estimate (`exposureOrNone`).

import { ValidationError } from "../errors.js";
import { isRecord } from "../guards.js";
import { utf8Encode } from "../ids/sha256.js";
import { Decimal, HUNDRED } from "../money/decimal.js";
import { repeatedKey } from "../schema/json-keys.js";
import type { Exposures, Split } from "./exposure.js";

export const EXPOSURE_FORMAT = 1;
/** The only key of the data bucket that holds it. */
export const EXPOSURE_KEY = "settings/exposure.json";
export const MAX_EXPOSURE_BYTES = 65_536;
export const MAX_EXPOSURE_ASSETS = 200;

const TOP_LEVEL = ["exposure_format", "assets"];
const DIMENSIONS = ["currency", "region"] as const;
// The shape of the ids the rest of the bucket already names objects with; `__proto__` cannot match.
const ASSET_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const CURRENCY_KEY = /^[A-Z]{3}$/;
const REGION_KEY = /^[a-z][a-z0-9_]{0,39}$/;
const PERCENT = /^-?\d{1,12}(\.\d{1,12})?$/;

export type ExposureReason =
  | "json"
  | "repeated_key"
  | "too_large"
  | "format"
  | "top_level_key"
  | "too_many_assets"
  | "asset_id"
  | "asset"
  | "dimension"
  | "empty"
  | "key"
  | "percent"
  | "negative"
  | "total";

const refuse = (reason: ExposureReason, details: Record<string, unknown> = {}): never => {
  throw new ValidationError("invalid_exposure", `the exposure is not valid: ${reason}`, {
    reason,
    ...details,
  });
};

const validSplit = (assetId: string, dimension: (typeof DIMENSIONS)[number], split: unknown) => {
  const at = { asset_id: assetId, dimension };
  if (!isRecord(split) || Object.keys(split).length === 0) {
    refuse("empty", at);
  }
  const entries = Object.entries(split as Record<string, unknown>);
  const keyShape = dimension === "currency" ? CURRENCY_KEY : REGION_KEY;
  let total = Decimal.ZERO;
  for (const [key, pct] of entries) {
    if (!keyShape.test(key)) {
      refuse("key", at);
    }
    if (typeof pct !== "string" || !PERCENT.test(pct)) {
      refuse("percent", at);
    }
    const value = Decimal.parse(pct);
    if (value.isNegative()) {
      refuse("negative", at);
    }
    total = total.add(value);
  }
  if (!total.eq(HUNDRED)) {
    refuse("total", { ...at, total: total.toString() });
  }
};

/**
 * The declared exposure of a document already parsed, or a `ValidationError` `invalid_exposure`
 * whose `reason` says what is wrong and, for a split that does not add up, `asset_id`,
 * `dimension` and `total`. Nothing is repaired or rounded.
 */
export const validateExposure = (document: unknown): Exposures => {
  if (!isRecord(document) || document.exposure_format !== EXPOSURE_FORMAT) {
    return refuse("format");
  }
  if (Object.keys(document).some((key) => !TOP_LEVEL.includes(key))) {
    return refuse("top_level_key");
  }
  if (!isRecord(document.assets)) {
    return refuse("format");
  }
  const assets = Object.entries(document.assets);
  if (assets.length > MAX_EXPOSURE_ASSETS) {
    refuse("too_many_assets", { max: MAX_EXPOSURE_ASSETS });
  }
  const exposures: Record<string, { currency?: Split; region?: Split }> = {};
  for (const [assetId, declared] of assets) {
    if (!ASSET_ID.test(assetId)) {
      refuse("asset_id");
    }
    if (!isRecord(declared)) {
      refuse("asset", { asset_id: assetId });
    }
    const own = declared as Record<string, unknown>;
    if (Object.keys(own).some((key) => key !== "currency" && key !== "region")) {
      refuse("dimension", { asset_id: assetId });
    }
    const checked: { currency?: Split; region?: Split } = {};
    for (const dimension of DIMENSIONS) {
      if (dimension in own) {
        validSplit(assetId, dimension, own[dimension]);
        checked[dimension] = own[dimension] as Split;
      }
    }
    exposures[assetId] = checked;
  }
  return exposures;
};

/** The text of the object: size, JSON, no repeated key, then `validateExposure`. */
export const parseExposureText = (text: string): Exposures => {
  if (utf8Encode(text).length > MAX_EXPOSURE_BYTES) {
    refuse("too_large", { max: MAX_EXPOSURE_BYTES });
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
  return validateExposure(document);
};

/** What is read: the exposure, or **nothing** when the object is unreadable or invalid. */
export const exposureOrNone = (text: string | undefined): Exposures | undefined => {
  if (text === undefined) {
    return undefined;
  }
  try {
    return parseExposureText(text);
  } catch {
    // parseExposureText throws only ValidationError: whatever is wrong with the object is no data.
    return undefined;
  }
};

/** The canonical text of the object, the one stored: validated first, so nothing invalid is written. */
export const exposureText = (exposures: Exposures): string => {
  const assets = validateExposure({ exposure_format: EXPOSURE_FORMAT, assets: exposures });
  return `${JSON.stringify({ exposure_format: EXPOSURE_FORMAT, assets })}\n`;
};
