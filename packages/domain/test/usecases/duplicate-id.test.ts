// A second event with an id already in the ledger is refused when it is
// appended — a refusal, not a warning (third review of PR #75: a confirmation
// of a draft retried with its stamped id relies on it).

import { describe, expect, it } from "vitest";
import { ProjectionError } from "../../src/errors.js";
import { recordEvent } from "../../src/usecases/record-event.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";
import { TestStore } from "../memory-store.js";
import { testDeps } from "./helpers.js";

const buy = {
  type: "buy" as const,
  account_id: "acc_fund",
  asset_id: "ast_world",
  trade_date: "2027-01-11",
  value_date: "2027-01-11",
  quantity: "1",
  unit_price: "10",
  currency: "EUR",
  fx_rate: "1",
  fx_rate_date: "2027-01-11",
  fee: "0",
  source: "manual" as const,
};

describe("an event id already in the ledger", () => {
  it("is refused on append, and nothing is written", async () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const store = new TestStore(b.build());
    const deps = testDeps(store);
    const first = await recordEvent(deps, buy);
    const lines = (await store.load()).lines.length;
    const again = await recordEvent(
      deps,
      { ...buy, quantity: "2" },
      { id: first.event.id, confirmDuplicate: true },
    ).catch((error: unknown) => error);
    expect(again).toBeInstanceOf(ProjectionError);
    expect((again as ProjectionError).code).toBe("duplicate_id");
    expect((await store.load()).lines.length).toBe(lines);
  });
});
