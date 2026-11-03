// What the return card says of the core and of each class, and above all of what it cannot say:
// every gap and every case of the real rate names what is missing.

import { Decimal, EUR, Money } from "@atlas/domain";
import type { ClassReturn, CoreXirr } from "@atlas/domain/charts";
import { describe, expect, it } from "vitest";
import { returnsView } from "../src/view-models/core/returns.js";

const eur = (text: string): Money => Money.parse(text, EUR);
const none = { to: "2027-12-31", classes: [] };
const core = (patch: Partial<CoreXirr>): CoreXirr => ({ to: "2027-12-31", ...patch });
const row = (patch: Partial<ClassReturn>): ClassReturn => ({
  asset_class: "equity",
  unsupported_events: [],
  ...patch,
});

describe("the headline", () => {
  it("carries what was contributed, what it is worth and the rates as text", () => {
    const view = returnsView(
      core({
        from: "2026-01-01",
        contributed_eur: eur("1000"),
        value_eur: eur("1100"),
        gain_eur: eur("100"),
        gain_pct: Decimal.parse("10"),
        xirr_pct: Decimal.parse("5.5"),
        real: {
          until: "2027-12-31",
          missing_years: [],
          xirr_pct: Decimal.parse("3"),
          gain_eur: eur("60"),
        },
      }),
      none,
    );
    expect(view.gainPct).toBe("10");
    expect(view.xirrPct).toBe("5.5");
    expect(view.real).toEqual({ xirrPct: "3", gain: eur("60") });
  });

  it.each([
    ["partial", "falta un precio de la cartera principal"],
    ["uncovered_buys", "hay compras de las que no consta el ingreso"],
    ["no_flows", "todavía no has aportado nada a la cartera principal"],
    ["no_rate", "los movimientos no dan una rentabilidad anual"],
  ] as const)("says what is missing when the gap is %s", (gap, sentence) => {
    expect(returnsView(core({ gap }), none).gap).toBe(sentence);
  });
});

describe("the real rate", () => {
  it("is absent when no inflation was given", () => {
    expect(returnsView(core({}), none).real).toBeUndefined();
  });

  it("says which years miss the inflation when it cannot start", () => {
    const view = returnsView(core({ real: { missing_years: ["2026", "2027"] } }), none);
    expect(view.real).toEqual({
      note: "falta el IPC de 2026, 2027: sin él no hay cifra real",
    });
  });

  it("says a price is missing at the date of the inflation", () => {
    const view = returnsView(
      core({ real: { until: "2026-12-31", missing_years: ["2027"], gap: "partial" } }),
      none,
    );
    expect(view.real?.note).toBe("falta un precio a la fecha del IPC");
  });

  it("says it stops before the date, and why", () => {
    const view = returnsView(
      core({
        real: { until: "2026-12-31", missing_years: ["2027"], xirr_pct: Decimal.parse("2") },
      }),
      none,
    );
    expect(view.real?.xirrPct).toBe("2");
    expect(view.real?.note).toBe(
      "medida hasta el 31/12/2026: falta el IPC de 2027, que se conoce al terminar el año",
    );
  });

  it("says there is no rate when the movements give none at the date", () => {
    const view = returnsView(core({ real: { until: "2027-12-31", missing_years: [] } }), none);
    expect(view.real).toEqual({ note: "los movimientos no dan una rentabilidad anual real" });
  });
});

describe("the classes", () => {
  it("keeps what was bought, what came back and what is worth, with the rate as text", () => {
    const [equity] = returnsView(core({}), {
      to: "2027-12-31",
      classes: [
        row({
          invested_eur: eur("500"),
          returned_eur: eur("50"),
          value_eur: eur("600"),
          gain_pct: Decimal.parse("30"),
          xirr_pct: Decimal.parse("8"),
        }),
      ],
    }).classes;
    expect(equity).toMatchObject({
      label: "Renta variable",
      invested: eur("500"),
      returned: eur("50"),
      value: eur("600"),
      gainPct: "30",
      xirrPct: "8",
    });
    expect(equity?.gap).toBeUndefined();
  });

  it.each([
    [row({ gap: "partial" }), "falta un precio"],
    [row({ gap: "no_flows" }), "sin compras"],
    [row({ gap: "no_rate" }), "sin rentabilidad anual"],
    [
      row({ gap: "unsupported_events", unsupported_events: ["transfer", "corporate_action"] }),
      "sin cifra por un traspaso a otra clase de activo y una operación corporativa",
    ],
  ])("says why a class has no figure", (input, sentence) => {
    const [only] = returnsView(core({}), { to: "2027-12-31", classes: [input] }).classes;
    expect(only?.gap).toBe(sentence);
  });
});
