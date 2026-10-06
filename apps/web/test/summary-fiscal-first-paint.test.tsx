// @vitest-environment happy-dom
//
// The tax card is in its place on the first paint of the summary, in the
// income tax season (feature 020, E2, M2). It only draws, so its code is on
// the boot path: fetched after the first paint, it came late and pushed the
// whole summary down 213px on a phone. Here its module takes two seconds to
// arrive, as on a slow network; a card that waited for it would be missing.

import { describe, vi } from "vitest";
import { withGoldenLedger } from "./helpers/render.jsx";

vi.mock("../src/routes/resumen/FiscalCard.jsx", async (original) => {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return original();
});

withGoldenLedger();

describe("the tax card of the summary", () => {});
