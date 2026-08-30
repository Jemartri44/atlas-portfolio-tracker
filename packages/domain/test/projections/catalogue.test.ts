import { describe, expect, it } from "vitest";
import { ProjectionError } from "../../src/errors.js";
import {
  accounts,
  applyAccountCreated,
  applyAccountUpdated,
  applyAssetCreated,
  applyAssetUpdated,
  assets,
  requireAccount,
  requireAsset,
} from "../../src/projections/catalogue.js";
import { createEmptyState } from "../../src/projections/state.js";
import { DEFAULT_SETTINGS } from "../../src/settings/settings.js";
import { ID, SAMPLES } from "../samples.js";

const fresh = () => createEmptyState(DEFAULT_SETTINGS);

describe("accounts projection", () => {
  it("creates, updates and keeps the history of ids", () => {
    const state = fresh();
    applyAccountCreated(state, SAMPLES.account_created);
    applyAccountUpdated(state, SAMPLES.account_updated);
    const account = requireAccount(state, "acc_fund", "x");
    expect(account.name).toBe("Fondos indexados");
    expect(account.history).toEqual([ID.account, ID.account2]);
    expect(accounts(state)).toHaveLength(1);
    expect((account as unknown as Record<string, unknown>).type).toBeUndefined();
  });

  it("rejects duplicates, unknown ids and book changes of accounts in use", () => {
    const state = fresh();
    applyAccountCreated(state, SAMPLES.account_created);
    expect(() => applyAccountCreated(state, SAMPLES.account_created)).toThrow(ProjectionError);
    expect(() =>
      applyAccountUpdated(state, { ...SAMPLES.account_updated, account_id: "nope" }),
    ).toThrow(ProjectionError);
    expect(() => requireAccount(state, "nope", "x")).toThrow(ProjectionError);
    applyAccountUpdated(state, { ...SAMPLES.account_updated, book: "bucket" });
    expect(requireAccount(state, "acc_fund", "x").book).toBe("bucket");
    state.usage.accounts.add("acc_fund");
    expect(() => applyAccountUpdated(state, { ...SAMPLES.account_updated, book: "core" })).toThrow(
      ProjectionError,
    );
    applyAccountUpdated(state, { ...SAMPLES.account_updated, book: "bucket", name: "Renamed" });
    expect(requireAccount(state, "acc_fund", "x").name).toBe("Renamed");
  });
});

describe("assets projection", () => {
  it("creates, updates and records previous identifiers", () => {
    const state = fresh();
    applyAssetCreated(state, { ...SAMPLES.asset_created, ticker: "WLD" });
    applyAssetUpdated(state, { ...SAMPLES.asset_updated, ticker: "WLD" });
    const asset = requireAsset(state, "ast_world", "x");
    expect(asset.isin).toBe("XX0000000009");
    expect(asset.identifier_history).toEqual([
      { isin: "XX0000000001", ticker: "WLD", until_event_id: ID.asset2 },
    ]);
    applyAssetUpdated(state, {
      ...SAMPLES.asset_updated,
      ticker: "WLD",
      name: "World Index (Acc)",
    });
    expect(requireAsset(state, "ast_world", "x").identifier_history).toHaveLength(1);
    expect(assets(state)).toHaveLength(1);
  });

  it("keeps history entries without undefined identifiers", () => {
    const state = fresh();
    applyAssetCreated(state, { ...SAMPLES.asset_created, isin: undefined } as never);
    applyAssetUpdated(state, { ...SAMPLES.asset_updated, ticker: "NEW" });
    expect(requireAsset(state, "ast_world", "x").identifier_history).toEqual([
      { until_event_id: ID.asset2 },
    ]);
  });

  it("rejects duplicates, unknown ids and book changes", () => {
    const state = fresh();
    applyAssetCreated(state, SAMPLES.asset_created);
    expect(() => applyAssetCreated(state, SAMPLES.asset_created)).toThrow(ProjectionError);
    expect(() => applyAssetUpdated(state, { ...SAMPLES.asset_updated, asset_id: "nope" })).toThrow(
      ProjectionError,
    );
    expect(() => requireAsset(state, "nope", "x")).toThrow(ProjectionError);
    expect(() =>
      applyAssetUpdated(state, {
        ...SAMPLES.asset_updated,
        book: "bucket",
        asset_class: undefined,
      } as never),
    ).toThrow(ProjectionError);
  });
});
