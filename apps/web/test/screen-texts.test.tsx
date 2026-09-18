// @vitest-environment happy-dom
//
// Texts that said the wrong thing: an empty ledger blamed on filters nobody
// had set, a button to record a valuation when what was missing were the
// target weights, "1 tesis quedan", two different totals both called "Total
// del núcleo", and an import error that did not say which line was wrong.

import { describe, expect, it } from "vitest";
import { ERROR_MESSAGES } from "../src/format/messages/errors.js";
import { WARNING_MESSAGES } from "../src/format/messages/warnings.js";
import { namingOf } from "../src/format/names.js";
import { figuresOf } from "../src/format/privacy.js";
import { messageWithLine } from "../src/ledger/state.js";
import Movimientos from "../src/routes/movimientos/index.jsx";
import { ContributionCard } from "../src/routes/nucleo/ContributionCard.jsx";
import Nucleo from "../src/routes/nucleo/index.jsx";
import { SETTINGS_NUMBERS } from "../src/view-models/index.js";
import { openLedger, show, text, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

const messageNames = {
  ast_world: "World Index Fund",
  acc_mi: "Fondos indexados",
  "tesis:th_alpha": "sobre Alpha Robotics (abierta el 01/09/2026)",
};
const render = (catalogue: typeof ERROR_MESSAGES, code: string, details: Record<string, unknown>) =>
  (catalogue[code] as (d: unknown, n: unknown, f: unknown) => string)(
    details,
    namingOf(messageNames),
    figuresOf(false),
  );

describe("the words", () => {
  /**
   * Found during this round: the configuration said the transfer limit "hoy no
   * dispara ningún aviso", and since feature 007 it raises `transfer_overdue`,
   * which the summary shows. A hint that denies a warning is worse than none.
   */
  it("does not deny the warning the transfer limit raises", () => {
    const hint = SETTINGS_NUMBERS.find((setting) => setting.key === "transfer_max_days")?.hint;
    expect(hint).toContain("Atención");
    expect(hint).not.toContain("no dispara");
  });

  it("makes the nouns agree with their count", () => {
    const one = render(WARNING_MESSAGES, "bucket_contaminated_theses", { theses: ["th_alpha"] });
    expect(one).toMatch(/^Una tesis queda fuera/);
    const sample = render(WARNING_MESSAGES, "bucket_sample_too_small", {
      closed_theses: 1,
      realized_operations: 1,
      sample: 30,
    });
    expect(sample).toContain("1 tesis cerrada y 1 operación realizada");
    const invalid = render(ERROR_MESSAGES, "newly_invalid_events", { affected: [1] });
    expect(invalid).toContain("1 evento ya registrado.");
  });

  it("says which line of the file a load error comes from", () => {
    expect(
      messageWithLine({ code: "invalid_field", message: "«Comisión» no es válido.", line: 12 }),
    ).toBe("Línea 12 del fichero: «Comisión» no es válido.");
    expect(messageWithLine({ code: "conflict", message: "cambió" })).toBe("cambió");
  });
});

describe("the screens", () => {
  it("does not blame the filters of an empty ledger", async () => {
    await openLedger("");
    const empty = text(await show("/movimientos", Movimientos));
    expect(empty).toContain("Todavía no hay ningún movimiento");
    expect(empty).not.toContain("coincide con los filtros");

    await openLedger();
    const filtered = text(await show("/movimientos?q=nada-de-esto", Movimientos));
    expect(filtered).toContain("Ningún movimiento coincide con los filtros");
  });

  it("offers the remedy of the refusal, not always a valuation", async () => {
    const card = (code: string) =>
      show("/", () => (
        <ContributionCard view={undefined} error={{ code, message: "Falta algo." }} />
      ));
    const weights = await card("missing_target_weights");
    const prices = await card("missing_manual_prices");
    expect(text(weights)).toContain("Fijar los pesos objetivo");
    expect(text(weights)).not.toContain("Registrar una valoración");
    expect(text(prices)).toContain("Registrar una valoración");
  });

  it("gives the two cost totals of the core two different names", async () => {
    const shown = text(await show("/nucleo?fecha=2029-06-30", Nucleo));
    expect(shown).toContain("Comisiones de operaciones del núcleo");
    expect(shown.match(/Total del núcleo/g)).toHaveLength(1);
  });
});
