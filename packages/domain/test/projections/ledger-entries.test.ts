import { describe, expect, it } from "vitest";
import { ledgerEntries } from "../../src/projections/ledger-entries.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { DEFAULT_SETTINGS, mergeSettings } from "../../src/settings/settings.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const listed = (
  events: ReturnType<LedgerBuilder["build"]>,
  filter?: Parameters<typeof ledgerEntries>[2],
) => {
  const state = projectLedger(events, { collectErrors: true });
  return ledgerEntries(state, events, filter);
};

/** A ledger with one of everything the list has to be able to show. */
const ledger = () => {
  const b = new LedgerBuilder();
  catalogue(b);
  const buy = b.buy({
    account_id: "acc_fund",
    asset_id: "ast_world",
    quantity: "10",
    unit_price: "10",
    trade_date: "2027-01-08",
    value_date: "2027-01-12",
    notes: "primera compra",
    broker_ref: "MI-001",
  });
  const mistake = b.deposit({ account_id: "acc_fund", value_date: "2027-02-01", amount: "500" });
  b.reversal(mistake.id, "importe equivocado");
  const corrected = b.raw({
    ...b.nextEnvelope("cash_deposit"),
    type: "cash_deposit",
    account_id: "acc_fund",
    value_date: "2027-02-01",
    amount: "600",
    currency: "EUR",
    fx_rate: "1",
    fingerprint: "sha256:corrected",
    corrects_id: mistake.id,
  } as never);
  const sell = b.sell({
    account_id: "acc_fund",
    asset_id: "ast_world",
    quantity: "4",
    unit_price: "12",
    trade_date: "2027-06-08",
    value_date: "2027-06-10",
  });
  return { events: b.build(), buy, mistake, corrected, sell };
};

describe("ledgerEntries", () => {
  it("lists every event in reverse chronological order", () => {
    const { events } = ledger();
    const entries = listed(events);
    expect(entries).toHaveLength(events.length);
    const dates = entries.map((entry) => entry.sort_date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("breaks a tie by file position, inverted", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const first = b.deposit({ account_id: "acc_fund", value_date: "2027-03-01", amount: "1" });
    const second = b.deposit({ account_id: "acc_fund", value_date: "2027-03-01", amount: "2" });
    const events = b.build();
    const entries = listed(events, { types: ["cash_deposit"] });
    expect(entries.map((entry) => entry.event.id)).toEqual([second.id, first.id]);
    // The position is the one in the file, so a row can point back at the projection.
    expect(entries.map((entry) => entry.position)).toEqual([
      events.findIndex((event) => event.id === second.id),
      events.findIndex((event) => event.id === first.id),
    ]);
  });

  it("dates an operation by its business date and everything else by its administrative one", () => {
    const { events, buy } = ledger();
    const entries = listed(events);
    const buyEntry = entries.find((entry) => entry.event.id === buy.id);
    // The fund settles by value date (ADR-0013), not by trade date.
    expect(buyEntry?.business_date).toBe("2027-01-12");
    expect(buyEntry?.sort_date).toBe("2027-01-12");
    const account = entries.find((entry) => entry.event.type === "account_created");
    expect(account?.business_date).toBeUndefined();
    expect(account?.sort_date).toBe(account?.recorded_date);
    expect(account?.recorded_date).toBe("2026-09-01");
  });

  it("follows the fiscal date rule in force, so the list and the engine cannot disagree", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.settings(mergeSettings(DEFAULT_SETTINGS, { fiscal_date_rule: { fund: "trade_date" } }));
    const buy = b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      trade_date: "2027-01-08",
      value_date: "2027-01-12",
    });
    const entry = listed(b.build()).find((candidate) => candidate.event.id === buy.id);
    expect(entry?.business_date).toBe("2027-01-08");
  });

  it("says the state of each event with words", () => {
    const { events, mistake, corrected } = ledger();
    const entries = listed(events);
    const byId = new Map(entries.map((entry) => [entry.event.id, entry]));
    expect(byId.get(mistake.id)?.status).toBe("reversed");
    expect(byId.get(mistake.id)?.reversed_by).toBeDefined();
    expect(byId.get(mistake.id)?.corrected_by).toBe(corrected.id);
    expect(byId.get(corrected.id)?.status).toBe("correction");
    expect(byId.get(corrected.id)?.corrects_id).toBe(mistake.id);
    const reversal = entries.find((entry) => entry.event.type === "reversal");
    expect(reversal?.status).toBe("reversal");
    expect(reversal?.reverses_id).toBe(mistake.id);
  });

  it("marks a corrected event that is also reversed with both references", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const first = b.deposit({ account_id: "acc_fund", value_date: "2027-02-01", amount: "500" });
    b.reversal(first.id, "mal");
    const second = b.raw({
      ...b.nextEnvelope("cash_deposit"),
      type: "cash_deposit",
      account_id: "acc_fund",
      value_date: "2027-02-01",
      amount: "600",
      currency: "EUR",
      fx_rate: "1",
      fingerprint: "sha256:second",
      corrects_id: first.id,
    } as never);
    b.reversal(second.id, "también mal");
    const entry = listed(b.build()).find((candidate) => candidate.event.id === second.id);
    // Reversed wins over correction: what matters first is that it is not in force.
    expect(entry?.status).toBe("reversed");
    expect(entry?.corrects_id).toBe(first.id);
  });

  it("exposes the references a person follows", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const order = b.orderPlaced({
      account_id: "acc_fund",
      asset_id: "ast_world",
      requested_date: "2027-01-05",
    });
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      order_id: order.id,
      trade_date: "2027-01-08",
      value_date: "2027-01-12",
    });
    b.thesisOpened({ thesis_id: "th_1" });
    b.buy({
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      thesis_id: "th_1",
      currency: "USD",
      fx_rate: "1.1",
      fx_rate_date: "2027-02-01",
      trade_date: "2027-02-01",
      value_date: "2027-02-01",
    });
    const request = b.transferRequested({
      from_account_id: "acc_fund",
      from_asset_id: "ast_world",
      to_account_id: "acc_fund",
      to_asset_id: "ast_bonds",
      quantity_out: "5",
      requested_date: "2027-03-01",
    });
    b.transferRequestUpdated({ request_id: request.id, stage: "redeemed", date: "2027-03-05" });
    const entries = listed(b.build());
    expect(entries.find((entry) => entry.order_id !== undefined)?.order_id).toBe(order.id);
    expect(entries.find((entry) => entry.thesis_id !== undefined)?.thesis_id).toBe("th_1");
    expect(entries.find((entry) => entry.request_id !== undefined)?.request_id).toBe(request.id);
  });

  it("names both sides of a transfer for the account and asset filters", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "10",
      unit_price: "10",
      value_date: "2027-01-12",
    });
    const transfer = b.transfer({
      from_account_id: "acc_fund",
      from_asset_id: "ast_world",
      quantity_out: "10",
      value_date_out: "2027-05-02",
      to_account_id: "acc_etf",
      to_asset_id: "ast_bonds",
      quantity_in: "5",
      value_date_in: "2027-05-04",
    });
    const events = b.build();
    expect(listed(events, { asset_id: "ast_bonds" }).map((entry) => entry.event.id)).toContain(
      transfer.id,
    );
    expect(listed(events, { account_id: "acc_etf" }).map((entry) => entry.event.id)).toContain(
      transfer.id,
    );
    const entry = listed(events, { types: ["transfer"] })[0];
    expect(entry?.account_id).toBe("acc_fund");
    expect(entry?.asset_id).toBe("ast_world");
    expect(entry?.business_date).toBe("2027-05-02");
  });

  it("combines the filters with and, and keeps them independent", () => {
    const { events, sell } = ledger();
    expect(listed(events, { types: [] })).toHaveLength(events.length);
    expect(listed(events, { types: ["sell"] })).toHaveLength(1);
    expect(listed(events, { types: ["sell"], account_id: "acc_etf" })).toHaveLength(0);
    expect(listed(events, { account_id: "acc_fund", asset_id: "ast_world" })).toHaveLength(2);
    expect(listed(events, { from: "2027-06-01" }).map((entry) => entry.event.id)).toEqual([
      sell.id,
    ]);
    expect(
      listed(events, { to: "2026-12-31" }).every((entry) => entry.sort_date <= "2026-12-31"),
    ).toBe(true);
    expect(listed(events, { from: "2027-06-01", to: "2027-06-09" })).toHaveLength(0);
  });

  it("searches text over the fields a person would type", () => {
    const { events, buy } = ledger();
    expect(listed(events, { text: "" })).toHaveLength(events.length);
    expect(listed(events, { text: "PRIMERA compra" }).map((entry) => entry.event.id)).toEqual([
      buy.id,
    ]);
    expect(listed(events, { text: "mi-001" }).map((entry) => entry.event.id)).toEqual([buy.id]);
    expect(listed(events, { text: buy.id })).toHaveLength(1);
    expect(listed(events, { text: "importe equivocado" })).toHaveLength(1);
    expect(listed(events, { text: "custody" })).toHaveLength(0);
    expect(listed(events, { text: "ast_world" }).length).toBeGreaterThan(1);
  });

  it("hides the reversed events only when asked", () => {
    const { events, mistake } = ledger();
    expect(listed(events).map((entry) => entry.event.id)).toContain(mistake.id);
    const visible = listed(events, { include_reversed: false });
    expect(visible.map((entry) => entry.event.id)).not.toContain(mistake.id);
    // The reversal itself stays: it is a fact of the ledger.
    expect(visible.some((entry) => entry.status === "reversal")).toBe(true);
  });

  it("carries the reason of an invalid event and keeps listing it", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const orphan = b.sell({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "5",
      value_date: "2027-06-10",
    });
    const events = b.build();
    const entry = listed(events).find((candidate) => candidate.event.id === orphan.id);
    expect(entry?.invalid_reason).toMatch(/acc_fund/);
    expect(listed(events)).toHaveLength(events.length);
  });

  it("lists an event type the web cannot register", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "10",
      unit_price: "10",
      value_date: "2027-01-12",
    });
    b.corporateAction({
      kind: "split",
      asset_id: "ast_world",
      effective_date: "2027-03-01",
      effects: [{ op: "scale", ratio: "2" }],
    });
    b.thesisOpened({ thesis_id: "th_1" });
    b.thesisClosed("th_1");
    const entries = listed(b.build());
    // Reading covers every type; only writing is limited to the seven forms.
    const action = entries.find((entry) => entry.event.type === "corporate_action");
    expect(action?.business_date).toBe("2027-03-01");
    expect(action?.asset_id).toBe("ast_world");
    const thesis = entries.find((entry) => entry.event.type === "thesis_opened");
    expect(thesis?.business_date).toBeUndefined();
    expect(thesis?.thesis_id).toBe("th_1");
  });

  it("returns nothing for an empty ledger", () => {
    expect(listed([])).toEqual([]);
  });
});
