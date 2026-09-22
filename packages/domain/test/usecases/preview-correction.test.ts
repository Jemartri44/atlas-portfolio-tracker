import { describe, expect, it } from "vitest";
import { DependentEventsError, NotFoundError } from "../../src/errors.js";
import type { Draft, LedgerEvent, SupportedEvent } from "../../src/schema/events.js";
import { previewCorrection, previewEvent } from "../../src/usecases/preview-event.js";
import { correctEvent } from "../../src/usecases/rectify.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";
import { TestStore } from "../memory-store.js";
import { testDeps } from "./helpers.js";

const draftOf = <E extends SupportedEvent>(event: E): Draft<E> => {
  const {
    schema_version: _v,
    id: _id,
    recorded_at: _at,
    fingerprint: _fp,
    ...rest
  } = event as E & { fingerprint?: string };
  return rest as unknown as Draft<E>;
};

const rejection = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected rejection");
};

describe("previewCorrection", () => {
  /**
   * The case of the review: a deposit of 8.700 € corrected to 8.000 €. Adding
   * the corrected deposit to the ledger as it is showed 8.700 + 8.000.
   */
  it("replaces the original instead of adding the corrected event to it", async () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.deposit({ account_id: "acc_fund", amount: "1392.05" });
    const deposit = b.deposit({ account_id: "acc_fund", amount: "8700" });
    const store = new TestStore(b.build());
    const draft = { ...draftOf(deposit), amount: "8000" };

    const corrected = await previewCorrection(testDeps(store), deposit.id, draft, "tecleado mal");
    expect(corrected.cash.map((row) => [`${row.before}`, `${row.after}`])).toEqual([
      ["10092.05 EUR", "9392.05 EUR"],
    ]);
    expect(corrected.candidate.type).toBe("cash_deposit");
    expect((corrected.candidate as { corrects_id?: string }).corrects_id).toBe(deposit.id);

    // What it used to show: the same draft recorded as a new event.
    const added = await previewEvent(testDeps(store), draft);
    expect(`${added.cash[0]?.after}`).toBe("18092.05 EUR");
    // Nothing was written.
    expect((await store.load()).etag).toBe("0");
  });

  it("replaces the position and the lot of a corrected purchase, not adds to them", async () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const buy = b.buy({ account_id: "acc_fund", asset_id: "ast_world", quantity: "10" });
    const store = new TestStore(b.build());

    const preview = await previewCorrection(
      testDeps(store),
      buy.id,
      { ...draftOf(buy), quantity: "12" },
      "eran doce",
    );
    const quantities = (rows: { quantity: { toString(): string } }[]) =>
      rows.map((row) => row.quantity.toString());
    expect(quantities(preview.before.positions)).toEqual(["10"]);
    expect(quantities(preview.after.positions)).toEqual(["12"]);
    // One open lot after, the corrected one: the original's lot is gone.
    expect(quantities(preview.after.lots)).toEqual(["12"]);
  });

  /**
   * The defect that was already there: the original purchase filled the order,
   * so the corrected one was refused with «order_closed» in the preview, while
   * the write — which reverses the original first — accepted it.
   */
  it("lets the corrected purchase fill the order the original filled", async () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const order = b.orderPlaced({ account_id: "acc_fund", asset_id: "ast_world" });
    const buy = b.buy({
      account_id: "acc_fund",
      asset_id: "ast_world",
      order_id: order.id,
      value_date: "2027-07-05",
    });
    const store = new TestStore(b.build());
    const draft = { ...draftOf(buy), unit_price: "101" };

    const preview = await previewCorrection(testDeps(store), buy.id, draft, "precio");
    expect((preview.candidate as { order_id?: string }).order_id).toBe(order.id);
    expect(preview.newlyInvalid).toEqual([]);
    // And the write agrees with the preview.
    const written = await correctEvent(testDeps(store), buy.id, draft, "precio");
    expect(written.event.type).toBe("buy");
  });

  it("refuses what the write refuses, with the same error", async () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const buy = b.buy({ account_id: "acc_fund", asset_id: "ast_world", quantity: "10" });
    b.sell({ account_id: "acc_fund", asset_id: "ast_world", quantity: "10" });
    const store = new TestStore(b.build());
    const draft = { ...draftOf(buy), quantity: "5" };

    const previewed = await rejection(previewCorrection(testDeps(store), buy.id, draft, "x"));
    const written = await rejection(correctEvent(testDeps(store), buy.id, draft, "x"));
    expect(previewed).toBeInstanceOf(DependentEventsError);
    expect(written).toBeInstanceOf(DependentEventsError);
    expect((previewed as DependentEventsError).code).toBe((written as DependentEventsError).code);

    const missing = await rejection(previewCorrection(testDeps(store), "01NOPE", draft, "x"));
    expect(missing).toBeInstanceOf(NotFoundError);
  });

  it("counts no duplicate for a correction identical to its original", async () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const buy = b.buy({ account_id: "acc_fund", asset_id: "ast_world" });
    const twin = b.buy({ account_id: "acc_fund", asset_id: "ast_world" });
    const store = new TestStore(b.build());

    // The original no longer holds its fingerprint; its twin still does.
    const preview = await previewCorrection(testDeps(store), buy.id, draftOf(buy), "x");
    expect(preview.duplicates).toEqual([twin.id]);
    const alone = new LedgerBuilder();
    catalogue(alone);
    const only = alone.buy({ account_id: "acc_fund", asset_id: "ast_world" });
    const single = await previewCorrection(
      testDeps(new TestStore(alone.build())),
      only.id,
      draftOf(only),
      "x",
    );
    expect(single.duplicates).toEqual([]);
  });

  it("shows the assets of the original and of the corrected event, or the ones asked", async () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const buy = b.buy({ account_id: "acc_fund", asset_id: "ast_world" });
    const store = new TestStore(b.build());
    const draft = { ...draftOf(buy), asset_id: "ast_bonds" };

    const moved = await previewCorrection(testDeps(store), buy.id, draft, "otro fondo");
    const assets = (rows: { asset_id: string }[]) => rows.map((row) => row.asset_id).sort();
    expect(assets(moved.before.positions)).toEqual(["ast_world"]);
    expect(assets(moved.after.positions)).toEqual(["ast_bonds"]);

    const asked = await previewCorrection(testDeps(store), buy.id, draft, "x", {
      assets: ["ast_world"],
    });
    expect(assets(asked.after.positions)).toEqual([]);
    expect(assets(asked.before.positions)).toEqual(["ast_world"]);
    expect(asked.events as LedgerEvent[]).toHaveLength(b.build().length);
  });
});
