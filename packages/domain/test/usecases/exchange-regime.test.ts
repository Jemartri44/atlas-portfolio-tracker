// An exchange without the neutrality regime is a taxable disposal, so a
// `convert` or `carve_out` that denies the regime is refused when written and
// only warned about when a ledger already holds it (ADR-0018). The rest of the
// requisites Atlas cannot decide are notices, on recording and in the return.

import { describe, expect, it } from "vitest";
import { say } from "../../src/messages/index.js";
import type { Voice } from "../../src/messages/voice.js";
import { exchangeNotices } from "../../src/projections/exchange-notices.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import type { CorporateActionEvent, Effect } from "../../src/schema/events.js";
import { recordEvent } from "../../src/usecases/record-event.js";
import { LedgerBuilder } from "../ledger-builder.js";
import { TestStore } from "../memory-store.js";
import { reportOf, taxBuilder } from "../tax/helpers.js";
import { testDeps } from "./helpers.js";

const convert: Effect = { op: "convert", to_asset_id: "new", ratio: "1" } as Effect;

const seeded = (): LedgerBuilder => {
  const b = new LedgerBuilder();
  b.account("acc", { platform: "ibkr", country: "IE" });
  b.asset("old", { asset_type: "stock", transferable: false });
  b.asset("new", { asset_type: "stock", transferable: false });
  b.buy({ account_id: "acc", asset_id: "old", value_date: "2027-01-11" });
  return b;
};

const draft = (regime: boolean | undefined) => ({
  type: "corporate_action" as const,
  kind: "merger" as const,
  asset_id: "old",
  effective_date: "2027-06-01",
  source_document: "https://issuer.example/merger",
  effects: [convert],
  ...(regime === undefined ? {} : { neutrality_regime: regime }),
});

describe("a conversion that denies the neutrality regime", () => {
  it.each([
    [false, "neutrality_denied_keeps_cost"],
    [true, "recorded"],
    [undefined, "recorded"],
  ])("with neutrality_regime %s is %s when written", async (regime, expected) => {
    const store = new TestStore(seeded().build());
    const outcome = await recordEvent(testDeps(store), draft(regime)).then(
      () => "recorded",
      (error: { code: string }) => error.code,
    );
    expect(outcome).toBe(expected);
  });

  it.each([
    ["merger", "Regístralo como una permuta"],
    ["issuer_restructuring", "Regístralo como una permuta"],
    ["spin_off", "aún no se puede registrar"],
    ["share_class_change", "no marques que no hay régimen"],
  ])("a %s is told what to do in the refusal itself", (kind, sentence) => {
    const voice = { text: String, word: String, surface: "web" } as unknown as Voice;
    const text = say("error", "neutrality_denied_keeps_cost", { kind }, voice, "domain message");
    expect(text).toContain(sentence);
  });

  it("is only a warning in a ledger that already holds it", () => {
    const b = seeded();
    const action = b.corporateAction({ ...draft(false) });
    const state = projectLedger(b.build());
    expect(state.warnings).toContainEqual(
      expect.objectContaining({ code: "neutrality_denied_keeps_cost", event_id: action.id }),
    );
  });
});

const asset = (asset_type: "stock" | "fund" | "etf", isin?: string, issuer_country?: string) => ({
  asset_type,
  ...(isin === undefined ? {} : { isin }),
  ...(issuer_country === undefined ? {} : { issuer_country }),
});

const noticesOf = (
  from: ReturnType<typeof asset>,
  to: ReturnType<typeof asset>,
  event: Partial<CorporateActionEvent> = {},
): string[] =>
  exchangeNotices(
    new Map([
      ["old", from],
      ["new", to],
    ]),
    { ...draft(undefined), ...event } as CorporateActionEvent,
  ).map((notice) => notice.code);

describe("what an exchange that keeps date and cost is told", () => {
  const es = asset("stock", "ES0000000001");
  const de = asset("stock", "DE0000000001");
  const us = asset("stock", "US0000000001");

  it.each([
    ["Spanish into German", es, de, []],
    ["German into Spanish", de, es, []],
    ["Spanish into American", es, us, ["exchange_acquirer_outside_eu"]],
    ["German into French", de, asset("stock", "FR0000000001"), ["exchange_partner_communication"]],
    [
      "American into American",
      us,
      asset("stock", "US0000000002"),
      ["exchange_acquirer_outside_eu", "exchange_partner_communication"],
    ],
    ["into an unknown domicile", us, asset("stock"), []],
    ["an international ISIN says nothing", es, asset("stock", "XS0000000001"), []],
    [
      "the country when there is no ISIN",
      es,
      asset("stock", undefined, "us"),
      ["exchange_acquirer_outside_eu"],
    ],
  ])("%s", (_name, from, to, expected) => {
    expect(noticesOf(from, to)).toEqual(expected);
  });

  it("a spin-off looks at the shareholder, so only the communication applies", () => {
    const carveOut = { op: "carve_out", to_asset_id: "new", ratio: "1", cost_share: "0.2" };
    expect(
      noticesOf(us, asset("stock", "US0000000002"), {
        kind: "spin_off",
        effects: [carveOut as Effect],
      }),
    ).toEqual(["exchange_partner_communication"]);
  });

  it("says nothing once the regime is denied: that is the refusal's job", () => {
    expect(noticesOf(es, us, { neutrality_regime: false })).toEqual([]);
  });

  it("asks for one communication per operation, however many securities it hands over", () => {
    const twice = { ...convert, ratio: "2" } as Effect;
    expect(noticesOf(de, asset("stock", "FR0000000001"), { effects: [convert, twice] })).toEqual([
      "exchange_partner_communication",
    ]);
  });

  it("recalls the cap on the cash of the exchange", () => {
    const cash = { op: "cost_adjustment", asset_id: "new" } as unknown as Effect;
    expect(noticesOf(es, de, { effects: [convert, cash] })).toEqual(["exchange_cash_cap"]);
  });

  it("warns of a fund converted into an ETF, whatever the kind", () => {
    expect(noticesOf(asset("fund"), asset("etf"), { kind: "fund_merger" as const })).toEqual([
      "convert_fund_to_listed_fund",
    ]);
  });
});

describe("in the return", () => {
  it("the notice of the communication reaches the notes of the year", () => {
    const b = taxBuilder();
    b.asset("us_old", { asset_type: "stock", transferable: false, isin: "US0000000001" });
    b.asset("us_new", { asset_type: "stock", transferable: false, isin: "US0000000002" });
    b.buy({ account_id: "acc_a", asset_id: "us_old", value_date: "2027-01-11" });
    const action = b.corporateAction({
      kind: "merger",
      asset_id: "us_old",
      effective_date: "2027-06-01",
      neutrality_regime: true,
      effects: [{ op: "convert", to_asset_id: "us_new", ratio: "1" }],
    });
    const notes = reportOf(b.build(), 2027).notes.filter((n) => n.event_id === action.id);
    expect(notes.map((n) => n.code)).toEqual([
      "exchange_acquirer_outside_eu",
      "exchange_partner_communication",
    ]);
  });
});
