// What the Cartera says of the return after tax: the open year is always said, and a figure that
// is missing says why (criterion #29).

import { Decimal, Money } from "@atlas/domain";
import type { CoreXirrAfterTax } from "@atlas/domain/fiscal";
import { describe, expect, it } from "vitest";
import { afterTaxView } from "../src/view-models/core/after-tax.js";

const before = {} as CoreXirrAfterTax["before"];

describe("afterTaxView", () => {
  it("says the year not yet closed is left out, and not on 31/12", () => {
    const result: CoreXirrAfterTax = {
      before,
      years: [],
      xirr_pct: Decimal.parse("2.4"),
      tax_eur: Money.parse("19", "EUR"),
    };
    expect(afterTaxView(result, "2028-06-30")).toMatchObject({ xirrPct: "2.4", openYear: 2028 });
    expect(afterTaxView(result, "2028-12-31")?.openYear).toBeUndefined();
  });

  it.each([
    [{ gap: "invalid" }, "hay movimientos con errores: corrígelos y saldrá"],
    [{ gap: "no_rate" }, "los movimientos no dan una rentabilidad anual"],
    [
      {
        gap: "year",
        years: [
          { year: 2017, dated: [], notes: [], gap: "unsupported" },
          { year: 2018, dated: [], notes: [] },
        ],
      },
      "no se calcula el impuesto de 2017: Atlas lo hace desde 2018",
    ],
  ])("says why there is no figure: %o", (fields, said) => {
    const view = afterTaxView({ before, years: [], ...fields } as CoreXirrAfterTax, "2028-06-30");
    expect(view?.gap).toBe(said);
    expect(view?.xirrPct).toBeUndefined();
  });

  it("adds nothing when the rate before has no figure: that line already says why", () => {
    expect(afterTaxView({ before, years: [], gap: "before" }, "2028-06-30")).toBeUndefined();
  });
});
