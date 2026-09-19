// @vitest-environment happy-dom
//
// A fund merged into another, or a share class that no longer exists, is not
// bought and no order is placed on it: its units became another asset, though
// the catalogue still calls it active (review of 2026-09-19). With no position
// left there is nothing of it to sell, value or transfer either (second pass).
// The rule is the one of the configuration (`view-models/weighted.ts`).

import { afterEach, describe, expect, it, vi } from "vitest";
import Cartera from "../src/routes/cartera/index.jsx";
import RegistrarForm from "../src/routes/registrar/form.jsx";
import { choose, optionsOf, show, today, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();
afterEach(() => vi.useRealTimers());

/** The assets a form offers for an account of the golden ledger, on a day. */
const offered = async (form: string, date: string, account = "acc_mi"): Promise<string> => {
  today(date);
  const host = await show(`/registrar/${form}`, RegistrarForm, "/registrar/:tipo");
  choose(host, "f-account_id", account);
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

  it("leave them out of a sale and a valuation too: nothing of them is left", async () => {
    for (const form of ["sell", "valuation", "dividend"]) {
      const list = await offered(form, "2029-01-10");
      expect(list, form).toContain("Small Cap Index Fund B");
      expect(list, form).not.toMatch(MERGED);
    }
  });

  it("offer an order no delisted asset, even one still held", async () => {
    const list = await offered("order", "2029-01-10", "acc_bucket");
    expect(list).not.toContain("Alpha Spin-off");
    // A sale and a valuation still reach it: it is held and it needs a price.
    expect(await offered("sell", "2029-01-10", "acc_bucket")).toContain("Alpha Spin-off");
  });

  it("offer a thesis no share a merger converted into another", async () => {
    today("2029-01-10");
    const host = await show("/registrar/tesis", RegistrarForm, "/registrar/:tipo");
    const list = optionsOf(host, "f-asset_id").join(" | ");
    expect(list).toContain("Beta Holdings");
    expect(list).not.toContain("Beta Biotech");
  });

  it("offer the transfer simulator no fund merged away", async () => {
    today("2029-01-10");
    const host = await show("/cartera", Cartera);
    const list = optionsOf(host, "tr-from").join(" | ");
    expect(list).toContain("Small Cap Index Fund B");
    expect(list).not.toMatch(MERGED);
  });
});
