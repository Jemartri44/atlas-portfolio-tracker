// @vitest-environment happy-dom
//
// The step of the monitor (feature 020, M4): from 1800px one more step of
// type, a taller chart and more air; and the summary in 8+4, with the net
// worth beside the tax card and the evolution beside attention and the recent
// movements. Measured here on what the browser applies, and again in the
// real browser at 1799, 1800 and 2045×1141 (`medidas.json` of the captures).

import { afterEach, describe, expect, it } from "vitest";
import { token, withoutStyles, withStyles } from "./helpers/styles.js";

afterEach(() => withoutStyles());

describe("the step of the monitor", () => {
  it("changes the type, the chart, the gutter and the container exactly at 1800px", () => {
    withStyles(1799, 1141);
    const before = [
      "--text-md",
      "--text-lg",
      "--text-xl",
      "--text-display",
      "--gutter",
      "--grid-gap",
      "--content-max",
      "--chart-h",
    ].map(token);
    withoutStyles();
    withStyles(1800, 1141);
    const after = [
      "--text-md",
      "--text-lg",
      "--text-xl",
      "--text-display",
      "--gutter",
      "--grid-gap",
      "--content-max",
      "--chart-h",
    ].map(token);
    expect(before).toEqual([
      "0.9375rem",
      "1.0625rem",
      "1.625rem",
      "2.75rem",
      "2rem",
      "1.25rem",
      "105rem",
      "15rem",
    ]);
    expect(after).toEqual([
      "1rem",
      "1.1875rem",
      "1.75rem",
      "3rem",
      "2.5rem",
      "1.5rem",
      "115rem",
      "clamp(15rem, 28vh, 22rem)",
    ]);
  });
});
