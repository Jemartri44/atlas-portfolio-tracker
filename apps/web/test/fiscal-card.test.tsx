// @vitest-environment happy-dom
//
// The card of the summary is the only way into the fiscal screen, and the only
// card of the application that **moves**: in the income tax season, or when
// there is something of the 720 to do, it goes to the top; the rest of the
// year it sits at the end, quiet (P1 of the prompt).
//
// The four edges of the season are checked here as well as in the domain,
// because what the domain decides and what the screen paints are two different
// things, and it is the second one the user sees.

import type { LedgerEvent } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import FiscalCard from "../src/routes/resumen/FiscalCard.jsx";
import { goldenEvents } from "./helpers/golden.js";
import { settle, show, text, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

const events = goldenEvents();

/**
 * A ledger with **nothing to do**: one Spanish account, one purchase and no
 * return of any kind due. With the golden one the card is prominent all year
 * round —securities abroad and no 720 recorded— so the season could not be
 * told apart from the rest.
 */
const quiet = (): LedgerEvent[] => {
  let n = 0;
  const envelope = (type: string): Record<string, unknown> => ({
    schema_version: 1,
    id: `01ARYZ6S41TSV4RRFFQ6900${String(n++).padStart(3, "0")}`,
    recorded_at: "2027-01-05T18:00:00.000Z",
    type,
    fingerprint: `sha256:${type}${n}`,
  });
  return [
    {
      ...envelope("account_created"),
      account_id: "acc_es",
      name: "Cuenta",
      platform: "test",
      book: "core",
      base_currency: "EUR",
      country: "ES",
      active: true,
    },
    {
      ...envelope("asset_created"),
      asset_id: "ast_f",
      asset_type: "fund",
      book: "core",
      asset_class: "equity",
      name: "Fondo",
      currency: "EUR",
      transferable: true,
      active: true,
    },
    {
      ...envelope("cash_deposit"),
      account_id: "acc_es",
      value_date: "2027-01-04",
      amount: "1000",
      currency: "EUR",
      fx_rate: "1",
      fx_rate_date: "2027-01-04",
    },
    {
      ...envelope("buy"),
      account_id: "acc_es",
      asset_id: "ast_f",
      trade_date: "2027-01-05",
      value_date: "2027-01-05",
      quantity: "10",
      unit_price: "100",
      currency: "EUR",
      fx_rate: "1",
      fx_rate_date: "2027-01-05",
      fee: "0",
      source: "manual",
    },
  ] as unknown as LedgerEvent[];
};

const cardOn = async (date: string, ledger: LedgerEvent[] = events): Promise<HTMLElement> => {
  const host = await show("/", () => <FiscalCard events={ledger} date={date} />);
  // The status arrives after the first paint, on purpose: the tax engine is
  // not on the boot path.
  await settle(120);
  return host;
};

const classOf = (host: HTMLElement): string => host.querySelector("section.card")?.className ?? "";

describe("the fiscal card of the summary", () => {
  it("is there from the first paint, before the tax engine arrives", async () => {
    const host = await show("/", () => <FiscalCard events={events} date="2028-02-10" />);
    // No `settle`: this is what the user sees while the chunk is downloading.
    expect(text(host)).toContain("Declaración");
    expect(host.querySelector(".skel")).not.toBeNull();
    await settle(30);
    expect(text(host)).toContain("Ver la declaración");
  });

  it("goes to the end outside the season, and to the top inside it", async () => {
    const ledger = quiet();
    expect(classOf(await cardOn("2028-03-31", ledger))).toContain("is-last");
    expect(classOf(await cardOn("2028-04-01", ledger))).toContain("is-first");
    expect(classOf(await cardOn("2028-06-30", ledger))).toContain("is-first");
    expect(classOf(await cardOn("2028-07-01", ledger))).toContain("is-last");
  });

  it("says «Campaña de la Renta» only in season", async () => {
    const ledger = quiet();
    expect(text(await cardOn("2028-04-01", ledger))).toContain("Campaña de la Renta");
    expect(text(await cardOn("2028-07-01", ledger))).not.toContain("Campaña de la Renta");
  });

  it("goes to the top out of season when a return is due, and says which", async () => {
    // February 2028: the 720 of 2027 is due —the golden ledger holds securities
    // abroad— and nothing of it is recorded.
    const host = await cardOn("2028-02-10");
    expect(classOf(host)).toContain("is-first");
    const shown = text(host);
    expect(shown).toMatch(/Modelo 72[01] de 2027/);
    expect(shown).toContain("2027");
  });

  it("names the past years nobody has recorded a return for", async () => {
    const host = await cardOn("2029-02-10");
    expect(text(host)).toMatch(/tiene cifras y no consta|tienen cifras y no constan/);
  });
});
