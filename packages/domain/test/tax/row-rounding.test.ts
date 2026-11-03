// The result of each row as Renta WEB computes it (criterion #6, fiscal audit
// of 2026-11-03, H6): the user types the transmission and the acquisition
// rounded to cents and the form subtracts them, so the engine does the same.

import { describe, expect, it } from "vitest";
import { taxBoxes } from "../../src/tax/boxes/boxes.js";
import { buy, HAND_SETTINGS, reportOf, sell, taxBuilder, text } from "./helpers.js";

const TODAY = "2035-01-01";

describe("a row is its two legs rounded and then subtracted", () => {
  // Three sales with transmission 100,0041 and acquisition 99,9951 (case C9a).
  // Rounding the result: 0,009 → 0,01 each, 0,03 in all. Rounding the legs:
  // 100,00 − 100,00 = 0,00 each, 0,00 in all, which is what the form adds up.
  const ledger = () => {
    const b = taxBuilder(HAND_SETTINGS);
    for (const [asset, day] of [
      ["stock_s", "03"],
      ["stock_t", "04"],
      ["fund_f", "05"],
    ] as const) {
      buy(b, asset, `2025-01-${day}`, "1", "99.9951");
      sell(b, asset, `2025-06-${day}`, "1", "100.0041");
    }
    return b.build();
  };

  it("gives a base of 0,00, not 0,03", () => {
    const report = reportOf(ledger(), 2025);
    expect(report.capital_gains.lines.map((line) => text(line.computable_eur_rounded))).toEqual([
      "0",
      "0",
      "0",
    ]);
    expect(text(report.base_eur)).toBe("0");
  });

  it("and the boxes of the form say the same", () => {
    const boxes = taxBoxes(ledger(), 2025, { today: TODAY });
    const box = (number: string) =>
      boxes.entries.find((entry) => entry.box === number && entry.row === undefined);
    expect(text(box("0460")?.amount_eur)).toBe("0");
    expect(text(box("0422")?.amount_eur)).toBe("0");
  });

  // A loss of 10 at 9,9951 − 19,9998 (−10,0047): the legs give 10,00 − 20,00 =
  // −10,00, where rounding the result would give −10,00 as well; and with half
  // of it deferred by a repurchase (−5,00235 → −5,00), what is computable is
  // −10,00 + 5,00 = −5,00.
  it("rounds what the wash-sale rule holds back on its own", () => {
    const b = taxBuilder(HAND_SETTINGS);
    buy(b, "stock_s", "2025-01-10", "2", "9.9999");
    sell(b, "stock_s", "2025-03-10", "2", "4.99755");
    buy(b, "stock_s", "2025-03-20", "1", "5");
    const [line] = reportOf(b.build(), 2025).capital_gains.lines;
    expect(text(line?.own_eur)).toBe("-10.0047");
    expect(text(line?.deferred_eur)).toBe("-5.00235");
    expect(text(line?.computable_eur_rounded)).toBe("-5");
  });
});
