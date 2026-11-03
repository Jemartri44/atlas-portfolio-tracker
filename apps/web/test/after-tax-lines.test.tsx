// @vitest-environment happy-dom
//
// The lines of the return after tax in Cartera: the year not yet closed is said in words, the tax
// is masked like any amount, and nothing is shown before the figure of the date is computed.

import type { LedgerEvent } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { AfterTaxLines } from "../src/routes/cartera/AfterTaxLines.jsx";
import { setPrivacy } from "../src/shell/preferences.js";
import { show, text, until } from "./helpers/render.jsx";

/**
 * 1,000 € in 2027 buy 10 units at 100; 5 are sold at 120 (a gain of 100); on 30/06/2028 the rest
 * is worth 120 a unit. Written out: the builder of the domain tests is not part of the web project.
 */
const EVENTS = [
  {
    schema_version: 1,
    id: "01ARYZ6S41TSV4RRFFQ6900000",
    recorded_at: "2026-09-01T18:00:00.000Z",
    type: "account_created",
    account_id: "acc_fund",
    name: "acc_fund",
    platform: "test",
    book: "core",
    base_currency: "EUR",
    country: "ES",
    active: true,
  },
  {
    schema_version: 1,
    id: "01ARYZ6S41TSV4RRFFQ6900001",
    recorded_at: "2026-09-01T18:00:01.000Z",
    type: "asset_created",
    asset_id: "ast_world",
    asset_type: "fund",
    book: "core",
    asset_class: "equity",
    name: "ast_world",
    currency: "EUR",
    transferable: true,
    active: true,
  },
  {
    schema_version: 1,
    id: "01ARYZ6S41TSV4RRFFQ6900002",
    recorded_at: "2026-09-01T18:00:02.000Z",
    type: "cash_deposit",
    value_date: "2027-01-02",
    amount: "1000",
    currency: "EUR",
    fx_rate: "1",
    fx_rate_date: "2027-01-01",
    account_id: "acc_fund",
    fingerprint: "sha256:d04236cb47c8cfa855222e492e0fc7f11c82bd2cc508642421d2c6f9ec58ca82",
  },
  {
    schema_version: 1,
    id: "01ARYZ6S41TSV4RRFFQ6900003",
    recorded_at: "2026-09-01T18:00:03.000Z",
    type: "buy",
    trade_date: "2027-01-05",
    value_date: "2027-01-05",
    quantity: "10",
    unit_price: "100",
    currency: "EUR",
    fx_rate: "1",
    fx_rate_date: "2027-01-05",
    fee: "0",
    source: "manual",
    account_id: "acc_fund",
    asset_id: "ast_world",
    fingerprint: "sha256:fbbfcc236e1b50c59c6eb2bf3513ff135ca5600afe3e1690994adf53dab7e861",
  },
  {
    schema_version: 1,
    id: "01ARYZ6S41TSV4RRFFQ6900004",
    recorded_at: "2026-09-01T18:00:04.000Z",
    type: "sell",
    trade_date: "2027-06-10",
    value_date: "2027-06-10",
    quantity: "5",
    unit_price: "120",
    currency: "EUR",
    fx_rate: "1",
    fx_rate_date: "2027-06-10",
    fee: "0",
    source: "manual",
    account_id: "acc_fund",
    asset_id: "ast_world",
    fingerprint: "sha256:0ee9f33ad6f9f25f8d5d26f77b6e022d9813f069b8aec5e8af5b5b16b7e3c911",
  },
  {
    schema_version: 1,
    id: "01ARYZ6S41TSV4RRFFQ6900005",
    recorded_at: "2026-09-01T18:00:05.000Z",
    type: "valuation",
    date: "2028-06-30",
    quantity: "5",
    unit_value: "120",
    currency: "EUR",
    fx_rate: "1",
    fx_rate_date: "2028-06-30",
    source: "manual",
    account_id: "acc_fund",
    asset_id: "ast_world",
  },
] as LedgerEvent[];

const ledger = (): LedgerEvent[] => EVENTS;

const linesAt = async (to: string): Promise<string> => {
  const events = ledger();
  const host = await show("/", () => <AfterTaxLines events={events} to={to} />);
  await until(() => !text(host).includes("calculando…"), "the rate after tax");
  return text(host);
};

describe("the lines of the return after tax", () => {
  it("says the tax of the year not yet closed is left out", async () => {
    const shown = await linesAt("2028-06-30");
    expect(shown).toMatch(/Rentabilidad anual después de impuestos \(estimación\)[+−]\d+,\d\s*%/);
    expect(shown).toContain("Sin el impuesto de 2028, que se calcula al cerrar el año.");
  });

  it("masks the tax with the privacy mode on and leaves the rate in sight", async () => {
    setPrivacy(true);
    const shown = await linesAt("2028-06-30");
    setPrivacy(false);
    expect(shown).toMatch(/Impuestos estimados de la cartera principal\s*[•·]{4}/);
    expect(shown).toMatch(/\(estimación\)[+−]\d+,\d\s*%/);
  });
});
