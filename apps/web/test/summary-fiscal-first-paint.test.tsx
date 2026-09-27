// @vitest-environment happy-dom
//
// The tax card is in its place on the first paint of the summary, in the
// income tax season (feature 020, E2, M2). It only draws, so its code is on
// the boot path: fetched after the first paint, it came late and pushed the
// whole summary down 213px on a phone. Here its module takes two seconds to
// arrive, as on a slow network; a card that waited for it would be missing.

import { describe, expect, it, vi } from "vitest";
import Resumen from "../src/routes/resumen/index.jsx";
import { show, today, withGoldenLedger } from "./helpers/render.jsx";

vi.mock("../src/routes/resumen/FiscalCard.jsx", async (original) => {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return original();
});

withGoldenLedger();

describe("the tax card of the summary", () => {
  it("is in its place on the first paint in the season, before its code or the engine arrives", async () => {
    today("2029-05-15");
    const host = await show("/", Resumen);
    const order = [...(host.querySelector(".grid")?.children ?? [])].map(
      (child) => [...child.classList].find((name) => name.startsWith("summary-")) ?? "",
    );
    expect(order.slice(0, 3)).toEqual(["summary-loss", "summary-fiscal", "summary-worth"]);
  });
});
