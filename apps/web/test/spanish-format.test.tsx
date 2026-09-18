// @vitest-environment happy-dom
//
// Numbers, dates and units the Spanish way in every text: "-6.59 pp" and
// "30.2 pp" in the warnings, ISO dates in the content, "0,0000 %", amounts
// without their currency, and a unit that could fall on the next line.

import { describe, expect, it } from "vitest";
import type { ERROR_MESSAGES } from "../src/format/messages/errors.js";
import { WARNING_MESSAGES } from "../src/format/messages/warnings.js";
import { namingOf } from "../src/format/names.js";
import { meaningfulDecimals } from "../src/format/number.js";
import { figuresOf } from "../src/format/privacy.js";
import Cubo from "../src/routes/cubo/index.jsx";
import Nucleo from "../src/routes/nucleo/index.jsx";
import { show, text, today, withGoldenLedger } from "./helpers/render.jsx";

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

describe("figures and units", () => {
  it("writes deviations and weights with a comma and one minus sign", () => {
    const text = render(WARNING_MESSAGES, "deviation_above_threshold", {
      asset_id: "ast_world",
      deviation_pp: "-6.59",
      threshold_pp: "5",
    });
    expect(text).toContain("−6,59\u00a0pp");
    expect(text).toContain("umbral 5,00\u00a0pp");
    const satellite = render(WARNING_MESSAGES, "satellite_below_minimum", {
      asset_class: "gold",
      weight_pct: "30.2",
      minimum_pct: "2",
    });
    expect(satellite).toContain("Oro pesa 30,2\u00a0%");
    expect(satellite).not.toMatch(/satélite gold|clase satélite/);
  });

  it("gives decimals that say something: 0 %, not 0,0000 %", () => {
    expect(meaningfulDecimals("0")).toBe(0);
    expect(meaningfulDecimals("0.0000")).toBe(0);
    expect(meaningfulDecimals("0.5165")).toBe(2);
    expect(meaningfulDecimals("0.0012")).toBe(4);
  });

  it("keeps the unit of an amount a message says on the same line as the figure", () => {
    expect(figuresOf(false).money("5000")).toBe("5.000,00\u00a0EUR");
  });

  it("writes an amount always with its currency", async () => {
    today("2026-09-18");
    // On a card of the bucket the header that said EUR is not there.
    expect(text(await show("/cubo", Cubo))).toContain("coste 199,49 EUR");
  });

  it("gives a percentage the decimals that say something", async () => {
    expect(text(await show("/nucleo?fecha=2029-06-30", Nucleo))).not.toContain("0,0000");
  });
});
