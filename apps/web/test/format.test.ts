// The formatting layer: numbers from their decimal string (no floating point),
// the privacy mask, Spanish dates and the label catalogue.

import {
  knownFieldsOf,
  Money,
  type ProjectionError,
  projectLedger,
  Quantity,
  SUPPORTED_EVENT_TYPES,
  type SupportedEvent,
  type Warning,
} from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { formatAge, formatDate, formatInstantDate, formatLongDate } from "../src/format/date.js";
import { eventLabel, FIELD_LABELS, fieldLabel, valueLabel } from "../src/format/labels.js";
import { describeError } from "../src/format/messages/errors.js";
import { describeWarning } from "../src/format/messages/warnings.js";
import {
  amountDisplay,
  formatMoney,
  formatQuantity,
  formatUnitValue,
  MASK,
  NO_DATA,
} from "../src/format/money.js";
import {
  displayName,
  displayNames,
  NAMED_ID_FIELDS,
  NO_NAMES,
  nameIndex,
} from "../src/format/names.js";
import {
  formatDecimalString,
  formatPercent,
  formatPoints,
  roundDecimalString,
  signOf,
} from "../src/format/number.js";
import { maskFigures } from "../src/format/privacy.js";
import { privacyFromPreference } from "../src/ledger/state.js";
import { goldenEvents } from "./helpers/golden.js";

describe("roundDecimalString", () => {
  it("rounds half up, like the fiscal output (ADR-0005)", () => {
    expect(roundDecimalString("1.005", 2)).toBe("1.01");
    expect(roundDecimalString("1.004", 2)).toBe("1.00");
    expect(roundDecimalString("-1.005", 2)).toBe("-1.01");
    expect(roundDecimalString("2.5", 0)).toBe("3");
    expect(roundDecimalString("9.999", 2)).toBe("10.00");
    expect(roundDecimalString("0.999", 2)).toBe("1.00");
    expect(roundDecimalString("99.995", 2)).toBe("100.00");
  });

  it("pads when there are fewer decimals than asked for", () => {
    expect(roundDecimalString("7", 2)).toBe("7.00");
    expect(roundDecimalString("7.1", 3)).toBe("7.100");
    expect(roundDecimalString("7", 0)).toBe("7");
  });

  it("never goes through floating point", () => {
    // 0.1 + 0.2 territory: a `Number` round trip would show it.
    expect(roundDecimalString("12345678901234567.891", 2)).toBe("12345678901234567.89");
    expect(formatDecimalString("12345678901234567.891", { decimals: 2 })).toBe(
      "12.345.678.901.234.567,89",
    );
  });
});

describe("formatDecimalString", () => {
  it("uses the Spanish comma and groups thousands", () => {
    expect(formatDecimalString("1234567.891", { decimals: 2 })).toBe("1.234.567,89");
    expect(formatDecimalString("100", { decimals: 2 })).toBe("100,00");
    expect(formatDecimalString("1000", { decimals: 0 })).toBe("1.000");
    expect(formatDecimalString("999", { decimals: 0 })).toBe("999");
  });

  it("prints the sign when asked, and never a signed zero", () => {
    expect(formatDecimalString("12.3", { decimals: 2, signed: true })).toBe("+12,30");
    expect(formatDecimalString("-12.3", { decimals: 2, signed: true })).toBe("−12,30");
    expect(formatDecimalString("0", { decimals: 2, signed: true })).toBe("0,00");
    expect(formatDecimalString("-0.00", { decimals: 2, signed: true })).toBe("0,00");
  });

  it("can skip the grouping and keep every decimal", () => {
    expect(formatDecimalString("1234.5678", { grouped: false })).toBe("1234,5678");
    expect(formatDecimalString("1234.5678")).toBe("1.234,5678");
  });
});

describe("formatPercent and formatPoints", () => {
  it("say 'sin dato' instead of a zero", () => {
    expect(formatPercent(undefined)).toBe("sin dato");
    expect(formatPoints(undefined)).toBe("sin dato");
  });

  it("carry their unit and, for points, the sign", () => {
    expect(formatPercent("12.345")).toBe("12,35 %");
    expect(formatPoints("1.5")).toBe("+1,50 pp");
    expect(formatPoints("-1.5")).toBe("−1,50 pp");
  });
});

describe("signOf", () => {
  it("tells a zero from a positive and a negative", () => {
    expect(signOf("0")).toBe("zero");
    expect(signOf("0.00")).toBe("zero");
    expect(signOf("-0.0")).toBe("zero");
    expect(signOf("0.01")).toBe("positive");
    expect(signOf("-0.01")).toBe("negative");
  });
});

describe("the privacy gate", () => {
  it("formats an amount with its currency, to the cent", () => {
    expect(formatMoney(Money.parse("1234.567", "EUR"))).toBe("1.234,57 EUR");
    expect(formatMoney(Money.parse("1234.567", "USD"), { currency: false })).toBe("1.234,57");
    expect(formatMoney(Money.parse("-10", "EUR"), { signed: true })).toBe("−10,00 EUR");
  });

  it("formats a unit value with four decimals, which is what a NAV needs", () => {
    expect(formatUnitValue(Money.parse("210.12345", "EUR"))).toBe("210,1235 EUR");
  });

  it("formats a quantity trimming the trailing zeros, because fractions are real", () => {
    expect(formatQuantity(Quantity.parse("12"))).toBe("12");
    expect(formatQuantity(Quantity.parse("12.5"))).toBe("12,5");
    expect(formatQuantity(Quantity.parse("0.00012345"))).toBe("0,00012345");
    expect(formatQuantity(Quantity.parse("1234.500"))).toBe("1.234,5");
  });

  it("has a fixed-width mask and a 'sin dato' that is never a zero", () => {
    expect(MASK).toBe("••••");
    expect(NO_DATA).toBe("sin dato");
  });
});

/*
 * The behaviour of the gate, not just its constants. Three mutations used to
 * pass the whole suite: removing the mask, losing the privacy default and
 * painting a zero where the datum is missing (review of 2026-09-18).
 */
describe("amountDisplay", () => {
  const input = { formatted: "1.234,56 EUR", privacy: false, kind: "importe" } as const;

  it("masks a known figure whenever privacy is on", () => {
    const shown = amountDisplay(input);
    expect(shown).toMatchObject({ state: "value", text: "1.234,56 EUR", label: "" });
    const hidden = amountDisplay({ ...input, privacy: true });
    expect(hidden.state).toBe("masked");
    expect(hidden.text).toBe(MASK);
    // The figure never reaches the screen, in any form.
    expect(hidden.text).not.toContain("1.234");
    expect(hidden.class).toContain("mask");
    expect(hidden.label).toBe("importe oculto");
  });

  it("masks a quantity too, and says which kind it is (Q6)", () => {
    const hidden = amountDisplay({ formatted: "12,5", privacy: true, kind: "cantidad" });
    expect(hidden.text).toBe(MASK);
    expect(hidden.label).toBe("cantidad oculto");
  });

  it("says 'sin dato' where there is no datum, never a zero (constitution V)", () => {
    const missing = amountDisplay({ ...input, formatted: undefined });
    expect(missing).toMatchObject({ state: "nodata", text: NO_DATA });
    expect(missing.text).not.toBe("0,00");
    expect(missing.class).toContain("nodata");
    expect(missing.label).toBe("importe sin dato");
    // Missing beats privacy: there is nothing to hide, and hiding it would
    // read as a figure that exists.
    expect(amountDisplay({ ...input, formatted: undefined, privacy: true }).state).toBe("nodata");
    expect(
      amountDisplay({ ...input, formatted: undefined, missingReason: "falta el precio" }).label,
    ).toBe("importe sin dato: falta el precio");
  });

  it("carries the sign class and the caller's classes, without a stray space", () => {
    expect(amountDisplay({ ...input, sign: "negative", extra: "total-amount" }).class).toBe(
      "num negative total-amount",
    );
    expect(amountDisplay(input).class).toBe("num");
    expect(amountDisplay({ ...input, privacy: true, extra: "cell" }).class).toBe("num mask cell");
  });
});

describe("privacyFromPreference", () => {
  it("is on unless the device says exactly 'off' (FR-021)", () => {
    expect(privacyFromPreference(undefined)).toBe(true);
    expect(privacyFromPreference("on")).toBe(true);
    expect(privacyFromPreference("")).toBe(true);
    expect(privacyFromPreference("false")).toBe(true);
    expect(privacyFromPreference("off")).toBe(false);
  });
});

describe("dates", () => {
  it("reads as a Spanish reader expects", () => {
    expect(formatDate("2027-01-12")).toBe("12/01/2027");
    expect(formatLongDate("2027-01-12")).toBe("12 de enero de 2027");
    expect(formatInstantDate("2026-09-18T20:15:00.000Z")).toBe("18/09/2026");
    expect(formatInstantDate("no es una fecha")).toBe("no es una fecha");
  });

  it("says an age the way a person says it", () => {
    expect(formatAge(0)).toBe("hoy");
    expect(formatAge(1)).toBe("ayer");
    expect(formatAge(9)).toBe("hace 9 días");
    expect(formatAge(31)).toBe("hace un mes");
    expect(formatAge(200)).toBe("hace 7 meses");
    expect(formatAge(400)).toBe("hace más de un año");
    expect(formatAge(900)).toBe("hace más de 2 años");
  });
});

describe("the label catalogue", () => {
  it("has a Spanish name for every event type", () => {
    for (const type of SUPPORTED_EVENT_TYPES) {
      expect(eventLabel(type), type).not.toBe(type);
    }
  });

  /**
   * The detail screen shows a ledger line field by field: a field the schema
   * gains and this catalogue forgets would be painted as snake_case at the user
   * (FR-040).
   */
  it("has a Spanish name for every field of every event type", () => {
    const missing = new Set<string>();
    for (const type of SUPPORTED_EVENT_TYPES) {
      for (const field of knownFieldsOf(type)) {
        if (FIELD_LABELS[field] === undefined) {
          missing.add(`${type}.${field}`);
        }
      }
    }
    expect([...missing]).toEqual([]);
  });

  it("falls back to the raw name instead of hiding an unknown field", () => {
    expect(fieldLabel("campo_que_no_existe")).toBe("campo_que_no_existe");
  });

  it("translates the values of the enumerations", () => {
    expect(valueLabel("core")).toBe("Núcleo");
    expect(valueLabel("fixed_income")).toBe("Renta fija");
    expect(valueLabel(true)).toBe("Sí");
    expect(valueLabel("lo que sea")).toBe("lo que sea");
  });
});

describe("the catalogue of names", () => {
  /*
   * The ledger stores `acc_mi` and keeps "Fondos indexados" right next to it.
   * Showing the identifier where the name exists turns the application into a
   * debug dump, and it was doing it in the patrimony, in the two hundred rows
   * of the ledger and inside the translated messages (review of 2026-09-18).
   */
  const state = projectLedger(goldenEvents() as SupportedEvent[], { collectErrors: true });
  const names = nameIndex(state);

  it("resolves an account and an asset to the name they have today", () => {
    expect(displayName(names, "acc_mi")).toBe("Fondos indexados");
    expect(displayName(names, "acc_bucket")).toBe("Cubo especulativo");
    expect(displayName(names, "ast_world")).toBe("World Index Fund");
    expect(displayName(names, "ast_alpha")).toBe("Alpha Robotics");
  });

  it("falls back to the identifier, and never to a blank", () => {
    // An incomplete catalogue, an event pointing at something unknown, or a
    // ledger that has not loaded yet: all of them must still say something.
    expect(displayName(names, "ast_no_existe")).toBe("ast_no_existe");
    expect(displayName(NO_NAMES, "acc_mi")).toBe("acc_mi");
    expect(displayName(nameIndex(undefined), "acc_mi")).toBe("acc_mi");
    expect(displayName(names, "")).toBe("");
    expect(displayName(names, undefined)).toBe("");
    expect(displayName(names, 7)).toBe("7");
  });

  it("names a list, and leaves what it does not know", () => {
    expect(displayNames(names, ["ast_world", "ast_no_existe"])).toBe(
      "World Index Fund, ast_no_existe",
    );
    // Not a list: the same as one identifier, which is what a domain detail
    // carrying a single value looks like.
    expect(displayNames(names, "ast_world")).toBe("World Index Fund");
    expect(displayNames(names, [])).toBe("");
  });

  it("only claims a name for the fields that point at the catalogue", () => {
    for (const field of ["account_id", "asset_id", "to_asset_id", "from_account_id"]) {
      expect(NAMED_ID_FIELDS.has(field)).toBe(true);
    }
    // These point at an event or a thesis: there is no name to resolve.
    for (const field of ["id", "order_id", "request_id", "thesis_id", "reverses_id"]) {
      expect(NAMED_ID_FIELDS.has(field)).toBe(false);
    }
  });

  it("names the identifiers embedded in a warning", () => {
    const warning: Warning = {
      code: "stale_price",
      event_id: "01ARYZ6S41TSV4RRFFQ6900001",
      message: "english",
      details: { asset_id: "ast_world", age_days: 17, date: "2026-09-01" },
    };
    expect(describeWarning(warning, { names, privacy: false })).toContain("World Index Fund");
    expect(describeWarning(warning, { names, privacy: false })).not.toContain("ast_world");
    // No catalogue: the identifier, which is what it did before.
    expect(describeWarning(warning, { privacy: false })).toContain("ast_world");
  });

  it("names a list of identifiers embedded in a warning", () => {
    const warning: Warning = {
      code: "partial_core_total",
      event_id: "01ARYZ6S41TSV4RRFFQ6900001",
      message: "english",
      details: { assets: ["ast_bonds", "ast_mm"], date: "2026-09-18" },
    };
    const text = describeWarning(warning, { names, privacy: false });
    expect(text).toContain("Global Bond Index Fund");
    expect(text).toContain("Money Market Fund");
    expect(text).not.toContain("ast_bonds");
  });

  it("names the identifiers embedded in an error", () => {
    const error = {
      code: "insufficient_position",
      message: "english",
      details: { account_id: "acc_ibkr", asset_id: "ast_gold", available: "0" },
    } as unknown as ProjectionError;
    const text = describeError(error, { names, privacy: false });
    expect(text).toContain("ETC y ETP");
    expect(text).not.toContain("acc_ibkr");
    expect(describeError(error, { privacy: false })).toContain("acc_ibkr");
  });
});

/**
 * The branches of the catalogues that no screen of the test suite reaches: a
 * setting whose value is an amount only because of the field it names, and the
 * fallback for a code nobody translated. The rendered tests cover the call
 * sites; these cover the two decisions taken inside.
 */
describe("the privacy mode inside a message", () => {
  const settingsError = (field: string, value: string) =>
    ({
      code: "invalid_settings",
      message: "english",
      details: { field, value, min: "0" },
    }) as unknown as ProjectionError;

  it("masks the value of a setting that is money, and shows the ones that are not", () => {
    expect(
      describeError(settingsError("monthly_contribution_eur", "-600"), { privacy: true }),
    ).toContain(MASK);
    expect(
      describeError(settingsError("monthly_contribution_eur", "-600"), { privacy: false }),
    ).toContain("−600,00 EUR");
    // A percentage is not an amount and stays readable in public (§9.6).
    const percent = describeError(settingsError("bucket_stop_loss_pct", "-25"), { privacy: true });
    expect(percent).toContain("−25");
    expect(percent).not.toContain(MASK);
  });

  it("leaves a value that is not a figure alone, which is what the message points at", () => {
    const typo = describeError(settingsError("monthly_contribution_eur", "seiscientos"), {
      privacy: true,
    });
    expect(typo).toContain("seiscientos");
  });

  it("masks the figures of a message the catalogue does not translate", () => {
    const unknown: Warning = {
      code: "un_codigo_que_no_conozco",
      event_id: "01ARYZ6S41TSV4RRFFQ6900001",
      message: "holds 23.0274 of ast_world since 2026-09-01",
      details: {},
    };
    const hidden = describeWarning(unknown, { privacy: true });
    expect(hidden).not.toContain("23.0274");
    // The date and the identifier are not figures and survive.
    expect(hidden).toContain("2026-09-01");
    expect(hidden).toContain("ast_world");
    expect(describeWarning(unknown, { privacy: false })).toContain("23.0274");
  });

  it("masks a raw message of the domain wherever it is quoted", () => {
    expect(maskFigures("open lots 23.0274 differ from positions 20", true)).toBe(
      `open lots ${MASK} differ from positions ${MASK}`,
    );
    expect(maskFigures("open lots 23.0274 differ", false)).toBe("open lots 23.0274 differ");
  });
});
