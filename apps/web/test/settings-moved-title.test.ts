// @vitest-environment happy-dom
//
// The headline of the question a configuration change asks about past years.
//
// It said «mueve ganancias de ejercicios anteriores» whatever moved. Before the
// review of feature 011 only a Renta reached that dialog; since then a change
// of the fiscal date rule reaches a Modelo 720 or 721 too, which declares no
// gains at all, and the headline —the first thing read— said something false
// about it. It now says what really moves, or stays neutral when several
// things do.

import type { FilingModel, FiscalYearImpact } from "@atlas/domain";
import { Money } from "@atlas/domain";
import type { ClosedYearImpact } from "@atlas/domain/fiscal";
import { describe, expect, it } from "vitest";
import { movedTitle } from "../src/routes/ajustes/SettingsDialogs.jsx";

const gain: FiscalYearImpact = {
  year: 2027,
  before: Money.parse("10", "EUR"),
  after: Money.parse("20", "EUR"),
} as FiscalYearImpact;
const filed = (model: FilingModel, year = 2027): ClosedYearImpact =>
  ({ model, year, filed_at: `${year + 1}-03-20` }) as unknown as ClosedYearImpact;

describe("the headline of the question about past years", () => {
  it("says gains move only when a realized gain moves", () => {
    expect(movedTitle([gain], [filed("renta")])).toBe(
      "Este cambio mueve ganancias de ejercicios anteriores",
    );
  });

  it("names the Modelo 720 when it is the only thing reached, and speaks of no gains", () => {
    const title = movedTitle([], [filed("720")]);
    expect(title).toBe("Este cambio puede afectar a lo que declaraste en el Modelo 720");
    expect(title).not.toContain("ganancias");
  });

  it("names the Modelo 721 the same way, for several of its years", () => {
    expect(movedTitle([], [filed("721", 2027), filed("721", 2028)])).toBe(
      "Este cambio puede afectar a lo que declaraste en el Modelo 721",
    );
  });

  it("names the Renta when it moves without a single realized gain moving", () => {
    expect(movedTitle([], [filed("renta")])).toBe(
      "Este cambio puede afectar a lo que declaraste en la Renta",
    );
  });

  it("stays neutral when returns of more than one model are reached", () => {
    expect(movedTitle([], [filed("renta"), filed("720")])).toBe(
      "Este cambio puede afectar a declaraciones ya presentadas",
    );
  });
});
