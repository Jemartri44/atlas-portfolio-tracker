// What the return card says of the core and of each class, and above all of what it cannot say:
// every gap and every case of the real rate names what is missing.

import { Decimal, EUR, Money } from "@atlas/domain";
import type { ClassReturn, CoreXirr, UnsupportedEvent } from "@atlas/domain/charts";
import { describe, expect, it } from "vitest";
import { returnsView } from "../src/view-models/core/returns.js";

const eur = (text: string): Money => Money.parse(text, EUR);
const none = { to: "2027-12-31", classes: [] };
const NAMES = {
  ast_world: "World Index Fund",
  ast_mm: "Money Market Fund",
  ast_gold: "Oro físico",
};
const core = (patch: Partial<CoreXirr>): CoreXirr => ({ to: "2027-12-31", ...patch });
const row = (patch: Partial<ClassReturn>): ClassReturn => ({
  asset_class: "equity",
  unsupported: [],
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
      NAMES,
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
    expect(returnsView(core({ gap }), none, NAMES).gap).toBe(sentence);
  });
});

describe("the real rate", () => {
  it("is absent when no inflation was given", () => {
    expect(returnsView(core({}), none, NAMES).real).toBeUndefined();
  });

  it("says which years miss the inflation when it cannot start", () => {
    const view = returnsView(core({ real: { missing_years: ["2026", "2027"] } }), none, NAMES);
    expect(view.real).toEqual({
      note: "falta el IPC de 2026, 2027: sin él no hay cifra real",
    });
  });

  it("says a price is missing at the date of the inflation", () => {
    const view = returnsView(
      core({ real: { until: "2026-12-31", missing_years: ["2027"], gap: "partial" } }),
      none,
      NAMES,
    );
    expect(view.real?.note).toBe("falta un precio a la fecha del IPC");
  });

  it("says it stops before the date, and why", () => {
    const view = returnsView(
      core({
        real: { until: "2026-12-31", missing_years: ["2027"], xirr_pct: Decimal.parse("2") },
      }),
      none,
      NAMES,
    );
    expect(view.real?.xirrPct).toBe("2");
    expect(view.real?.note).toBe(
      "medida hasta el 31/12/2026: falta el IPC de 2027, que se conoce al terminar el año",
    );
  });

  it("says there is no rate when the movements give none at the date", () => {
    const view = returnsView(
      core({ real: { until: "2027-12-31", missing_years: [] } }),
      none,
      NAMES,
    );
    expect(view.real).toEqual({ note: "los movimientos no dan una rentabilidad anual real" });
  });
});

describe("the classes", () => {
  it("keeps what was bought, what came back and what is worth, with the rate as text", () => {
    const [equity] = returnsView(
      core({}),
      {
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
      },
      NAMES,
    ).classes;
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
  ])("says why a class has no figure", (input, sentence) => {
    const [only] = returnsView(core({}), { to: "2027-12-31", classes: [input] }, NAMES).classes;
    expect(only?.gap).toBe(sentence);
    expect(only?.reasons).toBeUndefined();
  });

  it("says each event a class does not read: which, when, on what and what to do", () => {
    const events: UnsupportedEvent[] = [
      {
        reason: "transfer_without_nav",
        event_id: "e1",
        date: "2027-02-05",
        asset_ids: ["ast_world"],
      },
      {
        reason: "transfer_without_rate",
        event_id: "e5",
        date: "2027-02-06",
        asset_ids: ["ast_mm"],
      },
      {
        reason: "corporate_action_reclassifies",
        event_id: "e2",
        date: "2027-06-06",
        asset_ids: ["ast_world", "ast_mm"],
        kind: "merger",
      },
      {
        reason: "corporate_action_grant",
        event_id: "e3",
        date: "2027-07-01",
        asset_ids: ["ast_gold"],
      },
      {
        reason: "asset_reclassified",
        event_id: "e4",
        date: "2028-01-01",
        asset_ids: ["ast_world"],
      },
    ];
    const [only] = returnsView(
      core({}),
      { to: "2027-12-31", classes: [row({ gap: "unsupported_events", unsupported: events })] },
      NAMES,
    ).classes;
    expect(only?.reasons).toEqual([
      "falta el valor del traspaso de World Index Fund del 05/02/2027: añade el valor liquidativo al traspaso o una valoración de ese día",
      "falta el tipo de cambio del BCE del 06/02/2027 para el traspaso de Money Market Fund, cuyo valor liquidativo va en divisa: añade una operación o una valoración de ese día en esa divisa",
      "la operación corporativa de World Index Fund, Money Market Fund del 06/06/2027 cambia de clase de activo o de libro y todavía no se calcula",
      "la entrega de unidades de Oro físico del 01/07/2027 no trae un precio y todavía no se calcula",
      "World Index Fund cambió de clase o de libro (registrado el 01/01/2028) y todavía no se calcula",
    ]);
  });
});
