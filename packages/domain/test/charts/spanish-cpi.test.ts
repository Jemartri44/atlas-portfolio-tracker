import { describe, expect, it } from "vitest";
import { coreXirr, SPANISH_CPI, spanishCpiPct } from "../../src/charts.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

describe("the Spanish CPI table", () => {
  it("covers every year from 2002 to 2025 with no gap, each with its source and check date", () => {
    const years = Object.keys(SPANISH_CPI).map(Number);
    expect(years[0]).toBe(2002);
    expect(years.at(-1)).toBe(2025);
    expect(years).toEqual(Array.from({ length: years.length }, (_, i) => 2002 + i));
    for (const [year, row] of Object.entries(SPANISH_CPI)) {
      expect(row.pct).toMatch(/^-?\d+\.\d$/);
      expect(row.source).toBe(
        `https://servicios.ine.es/wstempus/js/ES/DATOS_SERIE/${Number(year) >= 2022 ? "IPC251856" : "IPC206448"}?date=${year}1201:${year}1201`,
      );
      expect(row.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("is the table the real return takes, and a core of 2026 gets a real figure up to 2025", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.deposit({ account_id: "acc_fund", amount: "1000", value_date: "2025-01-02" });
    b.buy({ account_id: "acc_fund", asset_id: "ast_world", trade_date: "2025-01-05" });
    for (const date of ["2025-12-31", "2026-11-03"]) {
      b.valuation({
        account_id: "acc_fund",
        asset_id: "ast_world",
        date,
        quantity: "10",
        unit_value: "110",
      });
    }
    const result = coreXirr(b.build(), "2026-11-03", spanishCpiPct());
    expect(result.real?.until).toBe("2025-12-31");
    expect(result.real?.missing_years).toEqual(["2026"]);
    expect(result.real?.gain_eur?.amount.isPositive()).toBe(true);
  });
});
