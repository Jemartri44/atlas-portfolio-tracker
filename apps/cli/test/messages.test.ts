// The Spanish texts of the CLI: what the user reads has to be true.

import { describe, expect, it } from "vitest";
import { describeWarning } from "../src/output/messages.js";

const repurchase = (window: string) =>
  describeWarning({
    code: "wash_sale_window_repurchase",
    event_id: "01ARYZ6S41TSV4RRFFQ69G5SET",
    message: "",
    details: {
      asset_id: "ast_world",
      sale_event_id: "01ARYZ6S41TSV4RRFFQ69G5SEV",
      sale_date: "2027-01-06",
      loss_eur: "-10",
      window_end: "2028-01-06",
      window,
    },
  });

describe("describeWarning: the wash-sale window by its real name", () => {
  it("names the window that applies, never the one that does not", () => {
    expect(repurchase("1y")).toContain("ventana de un año");
    expect(repurchase("2m")).toContain("ventana de dos meses");
    expect(repurchase("45d")).toContain("ventana de 45 días");
    // The old text called every window "the two-month rule", even a one-year one.
    expect(repurchase("1y")).not.toContain("dos meses");
  });
});
