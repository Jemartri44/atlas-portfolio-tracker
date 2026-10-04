// @vitest-environment happy-dom
//
// A bucket with nothing to compare says why (feature 020, E4, second part): it
// is not a hole in the prices, and it is not «pending prices» either.

import { describe, expect, it } from "vitest";
import Cubo from "../src/routes/cubo/index.jsx";
import { goldenLines } from "./helpers/golden.js";
import { openLedger, show, text, until, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

/** The golden ledger up to the line before the first thing of the bucket's account. */
const upTo = (line: number): string => `${goldenLines().slice(0, line).join("\n")}\n`;

/** The ledger up to `line`, without the bucket's deposits. */
const withoutBucketDeposits = (line: number): string =>
  `${goldenLines()
    .slice(0, line)
    .filter((entry) => !(entry.includes('"cash_deposit"') && entry.includes("acc_bucket")))
    .join("\n")}\n`;

describe("the bucket against the index with nothing to compare", () => {
  it("says there are no investments, and paints no hole", async () => {
    // 17 lines: the catalogue and the core's deposits, before any bucket deposit or purchase.
    await openLedger(upTo(17));
    const host = await show("/cubo?fecha=2026-09-03", Cubo);
    await until(() => text(host).includes("Frente al índice"), "the card");
    expect(text(host)).toContain("Sin inversiones en el cubo");
    expect(text(host)).not.toContain("sin precios");
    expect(host.querySelector(".summary-evolution")).toBeNull();
  });

  it("says there are purchases and no deposit, not that prices are pending", async () => {
    await openLedger(withoutBucketDeposits(200));
    const host = await show("/cubo?fecha=2027-01-10", Cubo);
    await until(() => text(host).includes("Frente al índice"), "the card");
    expect(text(host)).toContain("ningún ingreso registrado");
    expect(text(host)).not.toContain("sin precios");
    expect(text(host)).not.toContain("falta el precio");
  });
});
