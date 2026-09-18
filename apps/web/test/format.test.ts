// The formatting layer: numbers from their decimal string (no floating point),
// the privacy mask, Spanish dates and the label catalogue.

import { knownFieldsOf, Money, Quantity, SUPPORTED_EVENT_TYPES } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { formatAge, formatDate, formatInstantDate, formatLongDate } from "../src/format/date.js";
import { eventLabel, FIELD_LABELS, fieldLabel, valueLabel } from "../src/format/labels.js";
import {
  amountDisplay,
  formatMoney,
  formatQuantity,
  formatUnitValue,
  MASK,
  NO_DATA,
} from "../src/format/money.js";
import {
  formatDecimalString,
  formatPercent,
  formatPoints,
  roundDecimalString,
  signOf,
} from "../src/format/number.js";
import { privacyFromPreference } from "../src/ledger/state.js";

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
