// One ISIN, one asset (ADR-0009; feature 009, fiscal review, blocking finding
// 1). Two assets with the same ISIN are one security to the tax agency and two
// to FIFO and the wash-sale rule: recording refuses them, and a ledger written
// before is told by `integrity` and by the tax report, never refused on load.

import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/errors.js";
import { integrity } from "../../src/projections/integrity.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { DEFAULT_SETTINGS } from "../../src/settings/settings.js";
import { taxYear } from "../../src/tax/year.js";
import { previewEvent } from "../../src/usecases/preview-event.js";
import { recordEvent } from "../../src/usecases/record-event.js";
import { LedgerBuilder } from "../ledger-builder.js";
import { TestStore } from "../memory-store.js";
import { testDeps } from "./helpers.js";

const ISIN = "IE00BK5BQT80";

const asset = (asset_id: string, extra: Record<string, unknown> = {}) => ({
  type: "asset_created" as const,
  asset_id,
  asset_type: "etf" as const,
  book: "core" as const,
  asset_class: "equity" as const,
  name: asset_id,
  currency: "EUR",
  transferable: false,
  active: true,
  ...extra,
});

const withCoreEtf = (): TestStore => {
  const b = new LedgerBuilder();
  b.account("acc_core", { platform: "ibkr", country: "IE" });
  b.account("acc_bkt", { platform: "ibkr", country: "IE", book: "bucket" });
  b.asset("vwce_core", { asset_type: "etf", transferable: false, isin: ISIN });
  return new TestStore(b.build());
};

const codeOf = async (run: () => Promise<unknown>): Promise<string> => {
  try {
    await run();
  } catch (error) {
    return (error as ValidationError).code;
  }
  return "recorded";
};

describe("recording an ISIN another asset already has", () => {
  it("is refused, in any book, naming the asset to use instead", async () => {
    const store = withCoreEtf();
    const draft = { ...asset("vwce_bkt", { isin: ISIN }), book: "bucket" as const };
    delete (draft as { asset_class?: string }).asset_class;
    try {
      await recordEvent(testDeps(store), draft as never);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).code).toBe("duplicate_isin");
      expect((error as ValidationError).details).toEqual({
        isin: ISIN,
        asset_id: "vwce_bkt",
        existing_asset_id: "vwce_core",
      });
    }
    expect((await store.load()).events).toHaveLength(3);
  });

  it("is refused by the preview exactly where the write would be", async () => {
    const store = withCoreEtf();
    expect(
      await codeOf(() => previewEvent(testDeps(store), asset("vwce_2", { isin: ISIN }) as never)),
    ).toBe("duplicate_isin");
  });

  it("is refused when an update changes an asset's ISIN to one that is taken", async () => {
    const store = withCoreEtf();
    const deps = testDeps(store);
    await recordEvent(deps, asset("other", { isin: "IE00B4L5Y983" }) as never);
    expect(
      await codeOf(() =>
        recordEvent(deps, {
          ...asset("other", { isin: ISIN }),
          type: "asset_updated",
        } as never),
      ),
    ).toBe("duplicate_isin");
  });

  it("lets an asset without an ISIN, a new ISIN, and an update that keeps its own through", async () => {
    const store = withCoreEtf();
    // One set of dependencies: a fresh one per write would draw the same id twice.
    const deps = testDeps(store);
    expect(await codeOf(() => recordEvent(deps, asset("no_isin") as never))).toBe("recorded");
    expect(
      await codeOf(() => recordEvent(deps, asset("fresh", { isin: "IE00B4L5Y983" }) as never)),
    ).toBe("recorded");
    expect(
      await codeOf(() =>
        recordEvent(deps, {
          ...asset("vwce_core", { isin: ISIN, ter: "0.22" }),
          type: "asset_updated",
        } as never),
      ),
    ).toBe("recorded");
  });
});

describe("a ledger written before, with two assets on one ISIN", () => {
  /** The reviewer's case: a loss in the core, a repurchase in the bucket 14 days later. */
  const legacy = () => {
    const b = new LedgerBuilder();
    b.settings(DEFAULT_SETTINGS);
    b.account("acc_core", { platform: "ibkr", country: "IE" });
    b.account("acc_bkt", { platform: "ibkr", country: "IE", book: "bucket" });
    b.asset("vwce_core", { asset_type: "etf", transferable: false, isin: ISIN });
    b.asset("vwce_bkt", { asset_type: "etf", book: "bucket", transferable: false, isin: ISIN });
    b.thesisOpened({ thesis_id: "th", account_id: "acc_bkt", asset_id: "vwce_bkt" });
    b.buy({
      account_id: "acc_core",
      asset_id: "vwce_core",
      value_date: "2021-02-01",
      quantity: "10",
      unit_price: "100",
    });
    b.sell({
      account_id: "acc_core",
      asset_id: "vwce_core",
      value_date: "2021-06-01",
      quantity: "10",
      unit_price: "80",
    });
    b.buy({
      account_id: "acc_bkt",
      asset_id: "vwce_bkt",
      value_date: "2021-06-15",
      quantity: "10",
      unit_price: "81",
      thesis_id: "th",
    });
    return b.build();
  };

  it("still loads and projects, and integrity says what is wrong", () => {
    const state = projectLedger(legacy());
    expect(state.invalid).toEqual([]);
    expect(integrity(state).map((finding) => [finding.severity, finding.code])).toEqual([
      ["error", "duplicate_isin"],
    ]);
  });

  it("gives its tax report, and the report says the figures of that security may be wrong", () => {
    const report = taxYear(legacy(), 2021, { today: "2025-01-01" });
    expect(report.notes.find((note) => note.code === "tax_duplicate_isin")?.details).toEqual({
      isin: ISIN,
      assets: ["vwce_core", "vwce_bkt"],
    });
  });
});
