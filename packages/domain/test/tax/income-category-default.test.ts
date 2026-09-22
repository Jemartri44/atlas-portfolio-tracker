// The hand-computed exercise of feature 009, read with the ETC as movable
// capital income — the reading criterion #24 documents (binding ruling
// V0267-25) and, since feature 010, the **default**.
//
// Every literal here comes from `specs/009-tax-engine/questions.md`, section
// "Dinero en juego de los dudosos", where the same year is worked out by hand
// under that reading: gains 462,50; movable capital income 64,00 − 90,00 =
// −26,00; phase 1 offsets the 26,00 against 25 % of 462,50 = 115,63; phase 2
// takes the −260,80 carried from 2027; base **175,70**, the same as the other
// reading. Nothing here was copied from the engine.

import { describe, expect, it } from "vitest";
import type { Money } from "../../src/money/money.js";
import { taxYear } from "../../src/tax/year.js";
import { exerciseLedger } from "./exercise-ledger.js";

const TODAY = "2029-06-01";

const text = (money: Money | undefined): string =>
  money === undefined ? "—" : money.amount.toString();

describe("the hand-computed year of feature 009 with the ETC as movable capital income", () => {
  const { events, id } = exerciseLedger("movable_capital");
  const report = taxYear(events, 2028, { today: TODAY });

  it("moves E12 and E19 out of the gains and into the movable capital income", () => {
    expect(
      report.movable_capital.transmissions.map((l) => [l.event_id, text(l.computable_eur_rounded)]),
    ).toEqual([
      [id.E12, "-75"],
      [id.E19, "-15"],
    ]);
    expect(report.capital_gains.lines.map((l) => l.event_id)).not.toContain(id.E12);
    expect(report.movable_capital.transmissions.map((l) => l.criteria.includes("24:etc"))).toEqual([
      true,
      true,
    ]);
  });

  it("offsets 26.00 in phase 1 within the 115.63 of the limit, and still lands on base 175.70", () => {
    const c = report.compensation;
    expect(text(c.capital_gain_eur)).toBe("462.5");
    expect(text(c.movable_capital_eur)).toBe("-26");
    expect(text(c.limit_eur.capital_gain)).toBe("115.63");
    expect(
      c.steps.map((s) => [s.phase, s.from, s.origin_year, s.against, text(s.amount_eur)]),
    ).toEqual([
      [1, "movable_capital", 2028, "capital_gain", "26"],
      [2, "capital_gain", 2027, "capital_gain", "260.8"],
    ]);
    expect(text(c.movable_capital_final_eur)).toBe("0");
    expect(text(report.base_eur)).toBe("175.7");
    expect(c.pending).toEqual([]);
  });

  it("stops doubting the ETC: the binding ruling makes criterion #24 certain", () => {
    const doubted = report.doubtful.map((entry) => entry.criterion);
    expect(doubted).not.toContain("24:etc");
    expect(doubted).not.toContain("24:etc_gain");
  });
});
