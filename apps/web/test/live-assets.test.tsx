// @vitest-environment happy-dom
//
// A fund merged into another, or a share class that no longer exists, is not
// bought and no order is placed on it: its units became another asset, though
// the catalogue still calls it active (review of 2026-09-19). The rule is the
// one of the configuration (`view-models/weighted.ts`). A sale and a valuation
// keep their lists as they were.

import { afterEach, describe, expect, it, vi } from "vitest";
import RegistrarForm from "../src/routes/registrar/form.jsx";
import { choose, optionsOf, show, today, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();
afterEach(() => vi.useRealTimers());

/** The assets a form offers for the core account of the golden ledger, on a day. */
const offered = async (form: string, date: string): Promise<string> => {
  today(date);
  const host = await show(`/registrar/${form}`, RegistrarForm, "/registrar/:tipo");
  choose(host, "f-account_id", "acc_mi");
  return optionsOf(host, "f-asset_id").join(" | ");
};

// The fund merger of 07/02/2028 and the class change of 06/03/2028.
const MERGED = /Small Cap Index Fund —|Global Bond Index Fund —/;

describe("the assets a purchase or an order offers", () => {
  it("leave out a fund merged away and a class that no longer exists", async () => {
    for (const form of ["buy", "order"]) {
      const list = await offered(form, "2029-01-10");
      expect(list, form).toContain("Small Cap Index Fund B");
      expect(list, form).toContain("Global Bond Index Fund I");
      expect(list, form).not.toMatch(MERGED);
    }
  });

  it("offer them while they still exist, before the merger", async () => {
    const list = await offered("buy", "2027-06-01");
    expect(list).toMatch(/Small Cap Index Fund —/);
    expect(list).toMatch(/Global Bond Index Fund —/);
  });

  it("leave the lists of a sale and a valuation as they were", async () => {
    for (const form of ["sell", "valuation"]) {
      expect(await offered(form, "2029-01-10"), form).toMatch(/Small Cap Index Fund —/);
    }
  });
});
