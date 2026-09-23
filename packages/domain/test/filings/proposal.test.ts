// What a return proposes to declare, and the event that records what was
// actually filed (ADR-0020, decision (l) of prompt 010).
//
// It lives in the domain because **which figures a return declares** is a
// fiscal question: the console and the web propose the same ones, name them
// the same way and build the same event. These check the three shapes —the
// income tax, an informative return, and a supplementary one— and the one rule
// that matters above all: what the user confirms is what is written, and what
// the application computed that day travels beside it, untouched.

import { describe, expect, it } from "vitest";
import { filingProposal } from "../../src/filings/proposal.js";
import type { Money } from "../../src/money/money.js";
import type { Settings } from "../../src/settings/settings.js";
import { LedgerBuilder } from "../ledger-builder.js";
import { HAND_SETTINGS } from "../tax/helpers.js";

const SETTINGS: Settings = {
  ...HAND_SETTINGS,
  model_720_threshold_eur: "50000",
  model_720_increase_eur: "20000",
  model_720_alert_threshold_eur: "45000",
};

const TODAY = "2028-03-01";

const text = (money: Money): string => money.amount.toString();

/** A loss in 2027 that leaves something pending, and a foreign account with two things in it. */
const ledger = (): LedgerBuilder => {
  const b = new LedgerBuilder();
  b.settings(SETTINGS);
  b.account("acc_ib", { platform: "ibkr", country: "IE" });
  b.asset("fund_f");
  b.deposit({ account_id: "acc_ib", value_date: "2027-01-04", amount: "60000" });
  b.buy({
    account_id: "acc_ib",
    asset_id: "fund_f",
    value_date: "2027-01-05",
    quantity: "100",
    unit_price: "100",
  });
  b.sell({
    account_id: "acc_ib",
    asset_id: "fund_f",
    value_date: "2027-09-01",
    quantity: "100",
    unit_price: "50",
  });
  b.valuation({
    account_id: "acc_ib",
    asset_id: "fund_f",
    date: "2027-12-31",
    quantity: "0",
    unit_value: "50",
  });
  return b;
};

describe("what a return proposes to declare", () => {
  it("proposes the base, what is left pending and what is deferred", () => {
    const proposal = filingProposal(ledger().build(), "renta", 2027, { today: TODAY });
    expect(proposal.figures.map((figure) => [figure.key, figure.kind])).toEqual([
      ["base", "savings_base"],
      ["pending.2027.capital_gain", "pending_loss"],
      ["deferred", "deferred"],
    ]);
    // A loss of 5.000,00 leaves the base at zero and the whole loss pending.
    expect(text(proposal.figures[0]?.amount_eur as Money)).toBe("0");
    expect(text(proposal.figures[1]?.amount_eur as Money)).toBe("-5000");
    expect(proposal.figures[1]?.origin_year).toBe(2027);
    expect(proposal.figures[1]?.category).toBe("capital_gain");
    expect(proposal.supersedes).toBeUndefined();
  });

  it("writes what the user confirms, and keeps what it computed beside it", () => {
    const proposal = filingProposal(ledger().build(), "renta", 2027, { today: TODAY });
    const draft = proposal.draft(new Map([["base", "10.00"]]), {
      filed_at: "2028-06-18",
      receipt_reference: "100-2027-ABCDEFGHIJKL",
      notes: "presentada en plazo",
    });
    expect(draft.type).toBe("tax_return_filed");
    expect(draft.tax_year).toBe(2027);
    expect(draft.notes).toBe("presentada en plazo");
    const declared = draft.declared as {
      savings_base_eur: string;
      pending_losses: { origin_year: number; amount_eur: string }[];
      deferred_losses_eur: string;
    };
    expect(declared.savings_base_eur).toBe("10.00");
    expect(declared.pending_losses).toEqual([
      { origin_year: 2027, category: "capital_gain", amount_eur: "-5000.00" },
    ]);
    expect(declared.deferred_losses_eur).toBe("0.00");
    const computed = draft.computed as { savings_base_eur: string; settings: Settings };
    expect(computed.savings_base_eur).toBe("0.00");
    // The whole configuration of the day travels with it, not only the line in
    // force: without it the figure cannot be computed again (S13).
    expect(computed.settings.wash_sale_window.fund).toBe(SETTINGS.wash_sale_window.fund);
    // A key the return does not have changes nothing at all.
    const same = proposal.draft(new Map([["nope", "1"]]), {
      filed_at: "2028-06-18",
      receipt_reference: "x",
    });
    expect((same.declared as { savings_base_eur: string }).savings_base_eur).toBe("0.00");
    expect(same.notes).toBeUndefined();
  });

  it("proposes the total, the quarterly average and every asset of a 720", () => {
    const proposal = filingProposal(ledger().build(), "720", 2027, { today: TODAY });
    const keys = proposal.figures.map((figure) => figure.key);
    expect(keys).toContain("accounts.value");
    expect(keys).toContain("accounts.q4_average");
    expect(keys).toContain("item.acc_ib.balance");
    expect(keys).toContain("item.acc_ib.q4_average");
    const draft = proposal.draft(new Map(), {
      filed_at: "2028-03-01",
      receipt_reference: "720-2027-ABCDEFGHIJKL",
    });
    const declared = draft.declared as {
      accounts: { balance_eur: string; q4_average_eur: string };
      items: { category: string; account_id: string; balance_eur?: string }[];
    };
    expect(declared.accounts.balance_eur).toBe("55000.00");
    expect(declared.accounts.q4_average_eur).toBe("55000.00");
    expect(declared.items).toEqual([
      {
        category: "accounts",
        account_id: "acc_ib",
        balance_eur: "55000.00",
        q4_average_eur: "55000.00",
      },
    ]);
  });

  it("proposes no figure for an asset that has no value to declare", () => {
    // A security abroad with no valuation at 31 December: the model cannot be
    // decided and the figure does not exist, so the form does not ask for it.
    // Inventing a zero here would be a declared amount nobody computed.
    const b = ledger();
    b.asset("etf_ie", { asset_type: "etf", transferable: false });
    b.buy({
      account_id: "acc_ib",
      asset_id: "etf_ie",
      value_date: "2027-10-01",
      quantity: "10",
      unit_price: "100",
    });
    const proposal = filingProposal(b.build(), "720", 2027, { today: TODAY });
    const keys = proposal.figures.map((figure) => figure.key);
    expect(keys).toContain("item.acc_ib.balance");
    expect(keys.some((key) => key.includes("etf_ie"))).toBe(false);
    // And the asset is in the return: what is missing is its value, not the asset.
    const items = (
      proposal.draft(new Map(), { filed_at: "2028-03-01", receipt_reference: "x" }).declared as {
        items: { asset_id?: string }[];
      }
    ).items;
    expect(items.some((item) => item.asset_id === "etf_ie")).toBe(false);
  });

  it("knows it is a supplementary return, and says which one it replaces", () => {
    const b = ledger();
    const first = b.filed({
      tax_year: 2027,
      filed_at: "2028-06-18",
      declared: { savings_base_eur: "0", pending_losses: [], deferred_losses_eur: "0" },
    });
    const proposal = filingProposal(b.build(), "renta", 2027, { today: "2028-09-01" });
    expect(proposal.supersedes).toBe(first.id);
    const draft = proposal.draft(new Map(), {
      filed_at: "2028-09-01",
      receipt_reference: "100-2027-COMPLEMENTARIA",
    });
    expect(draft.supersedes).toBe(first.id);
    // And another one can be named by hand, for a chain corrected afterwards.
    const byHand = proposal.draft(new Map(), {
      filed_at: "2028-09-01",
      receipt_reference: "x",
      supersedes: "01ARYZ6S41TSV4RRFFQ69G5FAV",
    });
    expect(byHand.supersedes).toBe("01ARYZ6S41TSV4RRFFQ69G5FAV");
  });
});

/**
 * **The bytes of the line, pinned.**
 *
 * The proposal is being refactored to stop taking the fields of a figure back
 * out of its own key (`"pending.2027.capital_gain"` split on the dots) and to
 * read them off the typed figure instead. That is a change of an in-memory
 * contract and **nothing else may move**: the ledger is append-only, the
 * fingerprint of a line is its bytes, and a correction already writes lines
 * that are identical byte for byte. What is typed goes in as it was typed —
 * `1950` stays `1950`, never normalised to `1950.00`.
 *
 * So the text of the line is written down here, whole. If a refactor moves a
 * character, this fails, and that is the point.
 */
describe("what is written to the ledger, byte for byte", () => {
  const line = (declared: ReadonlyMap<string, string>): string => {
    const events = ledger().build();
    const proposal = filingProposal(events, "renta", 2027, { today: TODAY });
    const draft = proposal.draft(declared, {
      filed_at: "2028-06-18",
      receipt_reference: "100-2027-ABCDEFGHIJKL",
    });
    // Only the part the proposal builds: the envelope and the fingerprint are
    // put on by `recordEvent` and are not what this is about.
    return JSON.stringify(draft.declared);
  };

  it("writes the figures exactly as they were typed", () => {
    expect(line(new Map([["base", "1950"]]))).toBe(
      '{"savings_base_eur":"1950","pending_losses":[{"origin_year":2027,"category":"capital_gain","amount_eur":"-5000.00"}],"deferred_losses_eur":"0.00"}',
    );
  });

  it("writes what it computed when the user changes nothing", () => {
    expect(line(new Map())).toBe(
      '{"savings_base_eur":"0.00","pending_losses":[{"origin_year":2027,"category":"capital_gain","amount_eur":"-5000.00"}],"deferred_losses_eur":"0.00"}',
    );
  });

  it("keeps the order of the keys inside a pending loss", () => {
    // The order of the keys is part of the bytes: a line is never rewritten,
    // so what `JSON.stringify` emits today is what a ledger of 2046 holds.
    const declared = JSON.parse(line(new Map())) as {
      pending_losses: Record<string, unknown>[];
    };
    expect(Object.keys(declared.pending_losses[0] as object)).toEqual([
      "origin_year",
      "category",
      "amount_eur",
    ]);
    expect(Object.keys(declared)).toEqual([
      "savings_base_eur",
      "pending_losses",
      "deferred_losses_eur",
    ]);
  });
});
