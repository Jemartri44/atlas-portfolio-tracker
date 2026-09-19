// @vitest-environment happy-dom
//
// A thesis is read at the date asked, by every screen. On 18/09/2026 the
// thesis on Alpha Robotics had been open for 17 days (it was closed on
// 30/12/2027): the summary warned "está cerrada" while the bucket, cutting
// the same ledger at the same date, showed it "abierta, 17 de 180 días".

import { beforeEach, describe, expect, it } from "vitest";
import Cubo from "../src/routes/cubo/index.jsx";
import Resumen from "../src/routes/resumen/index.jsx";
import { show, text, today, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

describe("the summary and the bucket read the thesis at the same date", () => {
  beforeEach(() => today("2026-09-18"));

  /**
   * On 18/09/2026 the thesis on Alpha Robotics had been open for 17 days; it
   * was closed on 30/12/2027. The summary said it "está cerrada" and the bucket
   * said "abierta, 17 de 180 días": the warning read the end of the ledger.
   */
  it("does not call closed a thesis that the bucket shows open", async () => {
    const summary = text(await show("/", Resumen));
    expect(summary).not.toContain("está cerrada");
    const bucket = text(await show("/cubo", Cubo));
    expect(bucket).toContain("abierta");
    expect(bucket).toContain("17 de 180 días");
  });
});
