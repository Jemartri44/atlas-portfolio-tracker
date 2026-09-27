// What only tests of **other** projects used to cover in the domain (feature
// 015, E5; `questions.md` §33.5 and §34) — ten branches, two functions and
// the lines in them —: the domain's 100 % is now measured in a pass of its
// own, so each one is covered here, by the domain's own tests.

import { describe, expect, it } from "vitest";
import { DraftChangedError } from "../src/ecb/drafts.js";
import { readEcbZipCsv } from "../src/ecb/history.js";
import { ruleChangeRates } from "../src/ecb/rule-change.js";
import { closedYearImpact } from "../src/filings/closed-years.js";
import { filingProposal } from "../src/filings/proposal.js";
import { model720 } from "../src/informative/m720.js";
import type { Draft, SellEvent } from "../src/schema/events.js";
import { DEFAULT_SETTINGS, mergeSettings, type Settings } from "../src/settings/settings.js";
import { previewCorrection, previewReversal } from "../src/usecases/preview-event.js";
import { ecbFixture } from "./fixtures-path.js";
import { catalogue, LedgerBuilder } from "./ledger-builder.js";
import { TestStore } from "./memory-store.js";
import { buy, HAND_SETTINGS, sell, taxBuilder } from "./tax/helpers.js";
import { testDeps } from "./usecases/helpers.js";

describe("DraftChangedError (ecb/drafts.ts)", () => {
  it("says a draft that is gone apart from one stamped elsewhere", () => {
    const gone = new DraftChangedError("d1", "gone");
    expect(gone.code).toBe("draft_changed");
    expect(gone.details).toEqual({ id: "d1", now: "gone" });
    expect(gone.message).toContain("no longer there");
    const stamped = new DraftChangedError("d2", "stamped");
    expect(stamped.details).toEqual({ id: "d2", now: "stamped" });
    expect(stamped.message).toContain("stamped with another id");
  });
});

describe("ruleChangeRates (ecb/rule-change.ts)", () => {
  it("never names a rate of business date: a change of the fiscal rule does not move it", () => {
    const history = readEcbZipCsv(ecbFixture("eurofxref-hist.csv"));
    const b = new LedgerBuilder();
    catalogue(b);
    b.asset("ast_us", { asset_type: "stock", currency: "USD", transferable: false });
    const dividend = b.dividend({
      account_id: "acc_etf",
      asset_id: "ast_us",
      value_date: "2026-01-06",
      gross: "10",
      currency: "USD",
      fx_rate: "1.1169",
      fx_rate_date: "2026-01-02",
    });
    const next = mergeSettings(DEFAULT_SETTINGS, {
      fiscal_date_rule: { ...DEFAULT_SETTINGS.fiscal_date_rule, stock: "value_date" },
    } as Partial<Settings>);
    const impact = ruleChangeRates(history, b.build(), DEFAULT_SETTINGS, next, 30);
    expect(impact.lines.some((line) => line.event_id === dividend.id)).toBe(false);
  });
});

describe("closedYearImpact (filings/closed-years.ts)", () => {
  it("reads the rule of the fiscal date by default when no settings were ever recorded", () => {
    const b = taxBuilder(null);
    buy(b, "stock_s", "2027-01-11", "10", "100");
    sell(b, "stock_s", "2027-06-01", "10", "120");
    b.filed({
      tax_year: 2027,
      filed_at: "2028-06-18",
      declared: { savings_base_eur: "200", pending_losses: [], deferred_losses_eur: "0" },
    });
    const before = b.build();
    b.fee({ account_id: "acc_a", value_date: "2027-09-01", amount: "10" });
    const [impact] = closedYearImpact({ events: before }, { events: b.build() }, "2030-06-01");
    expect(impact?.year).toBe(2027);
    expect(impact?.by_date).toBe(true);
  });
});

describe("filingProposal (filings/proposal.ts)", () => {
  it("proposes the value of a security abroad, and writes it as the value of that asset", () => {
    const b = new LedgerBuilder();
    b.settings({
      ...HAND_SETTINGS,
      model_720_threshold_eur: "50000",
      model_720_increase_eur: "20000",
      model_720_alert_threshold_eur: "45000",
    });
    b.account("acc_ib", { platform: "ibkr", country: "IE" });
    b.asset("etf_ie", { asset_type: "etf", transferable: false });
    b.deposit({ account_id: "acc_ib", value_date: "2027-01-04", amount: "60000" });
    b.buy({
      account_id: "acc_ib",
      asset_id: "etf_ie",
      value_date: "2027-10-01",
      quantity: "600",
      unit_price: "100",
    });
    b.valuation({
      account_id: "acc_ib",
      asset_id: "etf_ie",
      date: "2027-12-31",
      quantity: "600",
      unit_value: "100",
    });
    const proposal = filingProposal(b.build(), "720", 2027, { today: "2028-03-01" });
    const figure = proposal.figures.find((entry) => entry.key === "item.acc_ib.etf_ie");
    expect(figure).toMatchObject({ kind: "item_value", asset_id: "etf_ie" });
    const items = (
      proposal.draft(new Map(), { filed_at: "2028-03-01", receipt_reference: "x" }).declared as {
        items: { asset_id?: string; value_eur?: string }[];
      }
    ).items;
    expect(items.find((item) => item.asset_id === "etf_ie")?.value_eur).toBeDefined();
  });
});

describe("model720 (informative/m720.ts)", () => {
  it("refuses a ledger with invalid events, naming them, before any verdict", () => {
    const b = new LedgerBuilder();
    b.account("acc_ib", { platform: "ibkr", country: "IE" });
    b.asset("fund_f");
    const orphan = b.sell({
      account_id: "acc_ib",
      asset_id: "fund_f",
      value_date: "2027-09-01",
      quantity: "1",
      unit_price: "50",
    });
    expect(() => model720(b.build(), 2027, { today: "2028-03-01" })).toThrow(
      expect.objectContaining({
        code: "tax_ledger_invalid",
        details: expect.objectContaining({
          count: 1,
          invalid: [expect.objectContaining({ id: orphan.id })],
        }),
      }),
    );
  });
});

describe("filingProposal of a renta (filings/proposal.ts)", () => {
  it("proposes as deferred the loss a repurchase inside the window defers", () => {
    const b = taxBuilder(HAND_SETTINGS);
    buy(b, "stock_s", "2027-01-11", "10", "100");
    sell(b, "stock_s", "2027-12-20", "10", "60");
    buy(b, "stock_s", "2028-01-15", "10", "60");
    const proposal = filingProposal(b.build(), "renta", 2027, { today: "2028-03-01" });
    const deferred = proposal.figures.find((figure) => figure.key === "deferred");
    expect(deferred?.amount_eur.amount.toString()).not.toBe("0");
  });
});

describe("the previews of a reversal and of a correction (usecases/preview-event.ts)", () => {
  const ledger = () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "10",
      unit_price: "10",
      trade_date: "2027-01-08",
      value_date: "2027-01-12",
    });
    const sale = b.sell({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "5",
      unit_price: "6",
      trade_date: "2027-03-08",
      value_date: "2027-03-10",
    });
    const repurchase = b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "1",
      unit_price: "6",
      trade_date: "2027-04-08",
      value_date: "2027-04-10",
    });
    return { store: new TestStore(b.build()), sale, repurchase };
  };

  it("previews a reversal as the write would append it, and writes nothing", async () => {
    const { store, repurchase } = ledger();
    const preview = await previewReversal(testDeps(store), repurchase.id, "no era mía");
    expect(preview.candidate.type).toBe("reversal");
    expect((preview.candidate as unknown as { reverses_id: string }).reverses_id).toBe(
      repurchase.id,
    );
    expect(preview.before.positions.map((row) => row.quantity.toString())).toEqual(["6"]);
    expect(preview.after.positions.map((row) => row.quantity.toString())).toEqual(["5"]);
    expect((await store.load()).etag).toBe("0");
  });

  it("previews a correction with only the warnings of the corrected event", async () => {
    const { store, sale } = ledger();
    const {
      schema_version: _v,
      id: _id,
      recorded_at: _at,
      fingerprint: _fp,
      ...rest
    } = sale as SellEvent & { fingerprint?: string };
    const draft = { ...rest, unit_price: "7" } as unknown as Draft<SellEvent>;
    const preview = await previewCorrection(testDeps(store), sale.id, draft, "precio mal");
    expect(preview.warnings.every((warning) => warning.event_id === preview.candidate.id)).toBe(
      true,
    );
  });
});
