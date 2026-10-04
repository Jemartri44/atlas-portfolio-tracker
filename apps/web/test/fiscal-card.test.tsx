// @vitest-environment happy-dom
//
// The card of the summary is the only way into the fiscal screen, and it has
// two shapes (feature 020, E2, M2): in the income tax season, a card with
// «Campaña de la Renta» and what is pending; out of it, a row folded at the
// end that says only its neutral state and the years with no return recorded.
// Whether it is the season is the domain's (`inRentaSeason`); where the card
// goes is the order of the summary (`summary-first-screen.test.tsx`).

import { type LedgerEvent, nextReturnYear } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import FiscalCard from "../src/routes/resumen/FiscalCard.jsx";
import { fiscalStatus } from "../src/routes/resumen/fiscal-status.js";
import { goldenEvents } from "./helpers/golden.js";
import { show, text, until, withGoldenLedger } from "./helpers/render.jsx";

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

const card = (season: boolean, date: string, ledger: LedgerEvent[] = events) => {
  const status = fiscalStatus(ledger, date);
  return show("/", () => (
    <FiscalCard
      season={season}
      status={() => status}
      year={nextReturnYear({}, date)}
      today={date}
      names={{}}
    />
  ));
};

describe("the fiscal card of the summary", () => {
  it("keeps its place with a skeleton until the engine answers, in the season", async () => {
    const host = await show("/", () => (
      <FiscalCard
        season={true}
        status={() => undefined}
        year={2028}
        today="2029-05-10"
        names={{}}
      />
    ));
    expect(text(host)).toContain("Declaración");
    expect(host.querySelector(".skel")).not.toBeNull();
    expect(text(host)).toContain("Ver la declaración");
  });

  it("says «Campaña de la Renta» in the season, and what is pending", async () => {
    // May 2029: the 720 of 2028 has its securities abroad and no return recorded.
    const host = await card(true, "2029-05-10");
    expect(text(host)).toContain("Campaña de la Renta");
    await until(() => host.querySelector(".fiscal-todo") !== null, "the list, which is lazy");
    expect(host.querySelector(".fiscal-todo")).not.toBeNull();
    expect(text(host)).toMatch(/tiene cifras y no consta|tienen cifras y no constan/);
  });

  it("folds to a row out of the season that says only its neutral state", async () => {
    const host = await card(false, "2029-01-20");
    const row = host.querySelector(".summary-fiscal.is-row");
    expect(row).not.toBeNull();
    expect(text(row)).toContain("Declaración 2028 · fuera de campaña");
    // Q2: the years with figures and no return, as a state, not a warning.
    expect(text(row)).toMatch(/sin declarar: 2026, 2027 y 2028/);
    // Never a notice: the 720 goes to *Atención*, the invalid events too.
    expect(text(row)).not.toMatch(/Modelo 72[01]|inválidos|Campaña/);
    expect(row?.querySelector('a[href="/fiscal"]')).not.toBeNull();
  });

  it("says nothing it does not know in the row of a quiet ledger", async () => {
    const host = await card(false, "2028-09-01", quiet());
    expect(text(host.querySelector(".summary-fiscal"))).toContain(
      "Declaración 2028 · fuera de campaña",
    );
  });
});
