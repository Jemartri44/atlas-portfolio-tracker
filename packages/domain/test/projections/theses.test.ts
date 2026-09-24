import { describe, expect, it } from "vitest";
import { ProjectionError } from "../../src/errors.js";
import { Money } from "../../src/money/money.js";
import { Quantity } from "../../src/money/quantity.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import type { LedgerState } from "../../src/projections/state.js";
import { theses } from "../../src/projections/theses.js";
import type { BuyEvent, LedgerEvent } from "../../src/schema/events.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const USD = { currency: "USD", fx_rate: "1.1", fx_rate_date: "2027-01-11" } as const;

const bucketCatalogue = (b: LedgerBuilder): void => {
  catalogue(b);
  b.account("acc_bucket2", { book: "bucket", platform: "ibkr" });
  b.asset("ast_spec2", {
    book: "bucket",
    asset_type: "stock",
    currency: "USD",
    transferable: false,
  });
};

const buyWithThesis = (
  b: LedgerBuilder,
  thesis_id: string | undefined,
  overrides: Partial<BuyEvent> = {},
) =>
  b.buy({
    account_id: "acc_bucket",
    asset_id: "ast_spec",
    quantity: "10",
    unit_price: "50",
    fee: "1",
    ...USD,
    ...(thesis_id === undefined ? {} : { thesis_id }),
    ...overrides,
  });

const failure = (events: readonly LedgerEvent[]): ProjectionError => {
  try {
    projectLedger(events);
  } catch (error) {
    if (error instanceof ProjectionError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected a ProjectionError");
};

const codes = (state: LedgerState): string[] => state.warnings.map((w) => w.code);

describe("theses: lifecycle and derived metrics", () => {
  it("opens, links a buy and a sell, closes, and derives invested, result, fees, position and days", () => {
    const b = new LedgerBuilder();
    bucketCatalogue(b);
    const opened = b.thesisOpened({ thesis_id: "th1", planned_size_eur: "500" });
    const buy = buyWithThesis(b, "th1");
    const sell = b.sell({
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      quantity: "10",
      unit_price: "60",
      fee: "1",
      ...USD,
      value_date: "2027-03-10",
      thesis_id: "th1",
    });
    const closed = b.thesisClosed("th1", "played out");
    const state = projectLedger(b.build());
    expect(codes(state)).toEqual([]);
    const [view] = theses(state, "2027-04-01");
    expect(view).toMatchObject({
      thesis_id: "th1",
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      hypothesis: "test hypothesis",
      expected_horizon_days: 90,
      invalidation: "test invalidation",
      status: "closed",
      opened_event_id: opened.id,
      opened_position: state.positionOf.get(opened.id),
      opened_at: "2026-09-01",
      closed_event_id: closed.id,
      closed_position: state.positionOf.get(closed.id),
      closed_at: "2026-09-01",
      closing_notes: "played out",
      days_open: 0,
    });
    // The legs carry what measuring against the index needs (feature 005): the
    // event, its fiscal date, its quantity and its money.
    expect(view?.buys).toEqual([
      {
        event_id: buy.id,
        fiscal_date: "2027-01-11",
        quantity: Quantity.parse("10"),
        amount_eur: view?.invested_eur,
        fee_eur: Money.parse("0.9090909091", "EUR"),
      },
    ]);
    expect(view?.sells).toHaveLength(1);
    expect(view?.sells[0]?.event_id).toBe(sell.id);
    expect(view?.sells[0]?.gain_eur?.amount.toString()).toBe("89.090909091");
    expect(view?.sells[0]?.amount_eur.amount.toString()).toBe("544.5454545455");
    expect(view?.planned_size_eur.amount.toString()).toBe("500");
    expect(view?.quantity_bought.toString()).toBe("10");
    expect(view?.quantity_sold.toString()).toBe("10");
    expect(view?.invested_eur.amount.toString()).toBe("455.4545454545");
    expect(view?.result_eur.amount.toString()).toBe("89.090909091");
    expect(view?.result_eur_rounded.amount.toString()).toBe("89.09");
    expect(view?.fees_eur.amount.toString()).toBe("1.8181818182");
    expect(view?.position.toString()).toBe("0");
    expect(state.usage.accounts.has("acc_bucket")).toBe(true);
    expect(state.usage.assets.has("ast_spec")).toBe(true);
  });

  it("counts days_open up to the date asked while the thesis is open", () => {
    const b = new LedgerBuilder();
    bucketCatalogue(b);
    b.thesisOpened({ thesis_id: "th1" });
    const state = projectLedger(b.build());
    expect(theses(state, "2026-09-11")[0]?.days_open).toBe(10);
    expect(theses(state, "2026-09-11")[0]?.status).toBe("open");
  });

  it("cuts the list by the administrative dates: nothing from the future, no negative days", () => {
    const b = new LedgerBuilder();
    bucketCatalogue(b);
    b.recordedAt("2027-01-10");
    b.thesisOpened({ thesis_id: "th_early" });
    b.recordedAt("2027-06-01");
    b.thesisClosed("th_early");
    b.recordedAt("2027-09-01");
    b.thesisOpened({ thesis_id: "th_late" });
    const state = projectLedger(b.build());

    // The day before it was opened, the first thesis does not exist yet.
    expect(theses(state, "2027-01-09")).toEqual([]);
    // Between opening and closing it is open, with its clock running.
    const midway = theses(state, "2027-03-01");
    expect(midway.map((t) => [t.thesis_id, t.status, t.days_open])).toEqual([
      ["th_early", "open", 50],
    ]);
    expect(midway[0]?.closed_at).toBeUndefined();
    expect(midway[0]?.closing_notes).toBeUndefined();
    // After its closing it is closed, and the second one still does not exist.
    const summer = theses(state, "2027-06-30");
    expect(summer.map((t) => [t.thesis_id, t.status, t.days_open])).toEqual([
      ["th_early", "closed", 142],
    ]);
    expect(summer[0]?.closed_at).toBe("2027-06-01");
    // At the end both are there, each in its own state.
    expect(theses(state, "2027-12-31").map((t) => [t.thesis_id, t.status, t.days_open])).toEqual([
      ["th_early", "closed", 142],
      ["th_late", "open", 121],
    ]);
  });

  it("is valid before the asset_created of its asset in the file (catalogue resolves first)", () => {
    const b = new LedgerBuilder();
    b.account("acc_bucket", { book: "bucket" });
    b.thesisOpened({ thesis_id: "th1" });
    b.asset("ast_spec", {
      book: "bucket",
      asset_type: "stock",
      currency: "USD",
      transferable: false,
    });
    expect(theses(projectLedger(b.build()), "2026-09-01")).toHaveLength(1);
  });
});

describe("theses: rejections at opening and closing", () => {
  it("needs a bucket account and a bucket asset", () => {
    const core = new LedgerBuilder();
    bucketCatalogue(core);
    core.thesisOpened({ thesis_id: "th1", account_id: "acc_fund" });
    expect(failure(core.build()).code).toBe("not_bucket");
    const coreAsset = new LedgerBuilder();
    bucketCatalogue(coreAsset);
    coreAsset.thesisOpened({ thesis_id: "th1", asset_id: "ast_world" });
    expect(failure(coreAsset.build()).code).toBe("not_bucket");
    const unknown = new LedgerBuilder();
    bucketCatalogue(unknown);
    unknown.thesisOpened({ thesis_id: "th1", asset_id: "ast_nope" });
    expect(failure(unknown.build()).code).toBe("unknown_asset");
  });

  it("rejects a repeated id and a second open thesis on the same account and asset", () => {
    const repeated = new LedgerBuilder();
    bucketCatalogue(repeated);
    repeated.thesisOpened({ thesis_id: "th1" });
    repeated.thesisClosed("th1");
    repeated.thesisOpened({ thesis_id: "th1" });
    expect(failure(repeated.build()).code).toBe("duplicate_thesis");
    const twice = new LedgerBuilder();
    bucketCatalogue(twice);
    twice.thesisOpened({ thesis_id: "th1" });
    twice.thesisOpened({ thesis_id: "th2" });
    const error = failure(twice.build());
    expect(error.code).toBe("thesis_already_open");
    expect(error.details.thesis_id).toBe("th1");
    const other = new LedgerBuilder();
    bucketCatalogue(other);
    other.thesisOpened({ thesis_id: "th1" });
    other.thesisOpened({ thesis_id: "th2", asset_id: "ast_spec2" });
    other.thesisOpened({ thesis_id: "th3", account_id: "acc_bucket2" });
    expect(theses(projectLedger(other.build()), "2026-09-01")).toHaveLength(3);
  });

  it("closes only an existing, open thesis", () => {
    const unknown = new LedgerBuilder();
    bucketCatalogue(unknown);
    unknown.thesisClosed("th1");
    expect(failure(unknown.build()).code).toBe("unknown_thesis");
    const twice = new LedgerBuilder();
    bucketCatalogue(twice);
    twice.thesisOpened({ thesis_id: "th1" });
    twice.thesisClosed("th1");
    twice.thesisClosed("th1");
    expect(failure(twice.build()).code).toBe("thesis_already_closed");
  });
});

describe("theses: bucket buys and sells", () => {
  it("rejects a bucket buy without thesis, with an unknown one, or with one of another asset or account", () => {
    const none = new LedgerBuilder();
    bucketCatalogue(none);
    buyWithThesis(none, undefined);
    expect(failure(none.build()).code).toBe("thesis_required");
    const unknown = new LedgerBuilder();
    bucketCatalogue(unknown);
    buyWithThesis(unknown, "th_nope");
    expect(failure(unknown.build()).code).toBe("unknown_thesis");
    const otherAsset = new LedgerBuilder();
    bucketCatalogue(otherAsset);
    otherAsset.thesisOpened({ thesis_id: "th1", asset_id: "ast_spec2" });
    buyWithThesis(otherAsset, "th1");
    expect(failure(otherAsset.build()).code).toBe("thesis_mismatch");
    const otherAccount = new LedgerBuilder();
    bucketCatalogue(otherAccount);
    otherAccount.thesisOpened({ thesis_id: "th1", account_id: "acc_bucket2" });
    buyWithThesis(otherAccount, "th1");
    expect(failure(otherAccount.build()).code).toBe("thesis_mismatch");
  });

  it("requires the thesis to be open at the buy's point in the file: not closed before, not opened after", () => {
    const closedBefore = new LedgerBuilder();
    bucketCatalogue(closedBefore);
    closedBefore.thesisOpened({ thesis_id: "th1" });
    closedBefore.thesisClosed("th1");
    buyWithThesis(closedBefore, "th1");
    const closed = failure(closedBefore.build());
    expect(closed.code).toBe("thesis_not_open");
    expect(closed.details).toMatchObject({ opened_before: true, closed_before: true });
    const openedAfter = new LedgerBuilder();
    bucketCatalogue(openedAfter);
    buyWithThesis(openedAfter, "th1");
    openedAfter.thesisOpened({ thesis_id: "th1" });
    const later = failure(openedAfter.build());
    expect(later.code).toBe("thesis_not_open");
    expect(later.details).toMatchObject({ opened_before: false, closed_before: false });
  });

  it("lets a correction of a buy keep the thesis window of the original (corrects_id)", () => {
    const b = new LedgerBuilder();
    bucketCatalogue(b);
    b.thesisOpened({ thesis_id: "th1" });
    const wrong = buyWithThesis(b, "th1", { unit_price: "55" });
    b.thesisClosed("th1");
    b.reversal(wrong.id, "price typo");
    const fixed = buyWithThesis(b, "th1");
    fixed.corrects_id = wrong.id;
    const state = projectLedger(b.build());
    expect(state.theses.get("th1")?.buys.map((leg) => leg.event_id)).toEqual([fixed.id]);
    expect(state.theses.get("th1")?.invested_eur.amount.toString()).toBe("455.4545454545");
    // A plain new buy after the closing is still rejected.
    buyWithThesis(b, "th1");
    expect(failure(b.build()).code).toBe("thesis_not_open");
  });

  it("lets a correction of a correction keep the thesis window of the root (second review of PR #75)", () => {
    const b = new LedgerBuilder();
    bucketCatalogue(b);
    b.thesisOpened({ thesis_id: "th1" });
    const wrong = buyWithThesis(b, "th1", { unit_price: "55" });
    b.thesisClosed("th1");
    b.reversal(wrong.id, "price typo");
    const first = buyWithThesis(b, "th1", { unit_price: "54" });
    first.corrects_id = wrong.id;
    b.reversal(first.id, "still a typo");
    const second = buyWithThesis(b, "th1");
    second.corrects_id = first.id;
    const state = projectLedger(b.build());
    expect(state.theses.get("th1")?.buys.map((leg) => leg.event_id)).toEqual([second.id]);
  });

  it("rejects thesis_id outside the bucket", () => {
    const buy = new LedgerBuilder();
    bucketCatalogue(buy);
    buy.thesisOpened({ thesis_id: "th1" });
    buy.buy({ account_id: "acc_fund", asset_id: "ast_world", thesis_id: "th1" });
    expect(failure(buy.build()).code).toBe("thesis_not_allowed");
    const sell = new LedgerBuilder();
    bucketCatalogue(sell);
    sell.buy({ account_id: "acc_fund", asset_id: "ast_world" });
    sell.sell({ account_id: "acc_fund", asset_id: "ast_world", thesis_id: "th1" });
    expect(failure(sell.build()).code).toBe("thesis_not_allowed");
  });

  it("accepts a bucket sell without thesis with a warning, and validates a linked one like a buy", () => {
    const b = new LedgerBuilder();
    bucketCatalogue(b);
    b.thesisOpened({ thesis_id: "th1" });
    buyWithThesis(b, "th1");
    const sell = b.sell({
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      quantity: "4",
      unit_price: "60",
      ...USD,
      value_date: "2027-03-10",
    });
    const state = projectLedger(b.build());
    expect(codes(state)).toEqual(["sell_without_thesis"]);
    expect(state.warnings[0]?.event_id).toBe(sell.id);
    expect(state.gains).toHaveLength(1);
    expect(state.theses.get("th1")?.sells).toEqual([]);
    expect(state.theses.get("th1")?.result_eur.isZero()).toBe(true);
    b.sell({
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      quantity: "1",
      unit_price: "60",
      ...USD,
      value_date: "2027-03-11",
      thesis_id: "th_nope",
    });
    expect(failure(b.build()).code).toBe("unknown_thesis");
  });

  it("warns when the invested amount exceeds the planned size", () => {
    const b = new LedgerBuilder();
    bucketCatalogue(b);
    b.thesisOpened({ thesis_id: "th1", planned_size_eur: "500" });
    buyWithThesis(b, "th1", { quantity: "8", unit_price: "50", fee: "0", fx_rate: "1" });
    const first = projectLedger(b.build());
    expect(codes(first)).toEqual([]);
    const over = buyWithThesis(b, "th1", {
      quantity: "4",
      unit_price: "50",
      fee: "0",
      fx_rate: "1",
      value_date: "2027-01-11",
    });
    const state = projectLedger(b.build());
    expect(codes(state)).toEqual(["thesis_size_exceeded"]);
    expect(state.warnings[0]).toMatchObject({
      event_id: over.id,
      details: { thesis_id: "th1", invested_eur: "600", planned_size_eur: "500" },
    });
  });

  it("warns when a thesis closes with a live position, until a newer thesis takes the pair over", () => {
    const b = new LedgerBuilder();
    bucketCatalogue(b);
    b.thesisOpened({ thesis_id: "th1" });
    buyWithThesis(b, "th1");
    const closed = b.thesisClosed("th1");
    const state = projectLedger(b.build());
    expect(codes(state)).toEqual(["thesis_closed_with_position"]);
    expect(state.warnings[0]).toMatchObject({
      event_id: closed.id,
      details: { thesis_id: "th1", position: "10" },
    });
    b.thesisOpened({ thesis_id: "th2" });
    expect(codes(projectLedger(b.build()))).toEqual([]);
  });

  /**
   * The summary warned "la tesis está cerrada" at a date on which the bucket
   * screen, cutting the same ledger, showed it open: the theses are applied
   * whole and the warning read their status at the end of the ledger.
   */
  it("reads closed and open at the date asked, like every other view of a thesis", () => {
    const b = new LedgerBuilder();
    bucketCatalogue(b);
    b.recordedAt("2027-01-10");
    b.thesisOpened({ thesis_id: "th1" });
    buyWithThesis(b, "th1", { trade_date: "2027-01-11", value_date: "2027-01-13" });
    b.recordedAt("2027-06-01");
    b.thesisClosed("th1");
    b.recordedAt("2027-09-01");
    b.thesisOpened({ thesis_id: "th2" });
    const events = b.build();

    // Before the closing, nothing is closed yet.
    expect(codes(projectLedger(events, { asOf: "2027-03-01" }))).toEqual([]);
    // Between the closing and the next thesis, the pair is uncovered.
    const summer = projectLedger(events, { asOf: "2027-07-01" });
    expect(codes(summer)).toEqual(["thesis_closed_with_position"]);
    expect(summer.warnings[0]?.details).toMatchObject({ thesis_id: "th1", position: "10" });
    // Once the newer thesis exists, it takes the pair over, as without a date.
    expect(codes(projectLedger(events, { asOf: "2027-12-31" }))).toEqual([]);
    expect(codes(projectLedger(events))).toEqual([]);
  });
});
