import { describe, expect, it } from "vitest";
import { ProjectionError } from "../../src/errors.js";
import { Money } from "../../src/money/money.js";
import { Quantity } from "../../src/money/quantity.js";
import { adjustCash, cashBalances } from "../../src/projections/cash.js";
import {
  accountsHolding,
  adjustPosition,
  physicalPositions,
  positionOf,
} from "../../src/projections/positions.js";
import { createEmptyState } from "../../src/projections/state.js";
import { DEFAULT_SETTINGS } from "../../src/settings/settings.js";

const q = (text: string) => Quantity.parse(text);

describe("physical positions", () => {
  it("adds and removes per account and asset, never below zero", () => {
    const state = createEmptyState(DEFAULT_SETTINGS);
    expect(positionOf(state, "a", "x").isZero()).toBe(true);
    adjustPosition(state, "a", "x", q("10.5"), "e1");
    adjustPosition(state, "b", "x", q("1"), "e2");
    adjustPosition(state, "a", "y", q("3"), "e3");
    expect(adjustPosition(state, "a", "x", q("-0.5"), "e4").toString()).toBe("10");
    expect(() => adjustPosition(state, "a", "x", q("-10.000000001"), "e5")).toThrow(
      ProjectionError,
    );
    expect(accountsHolding(state, "x")).toEqual(["a", "b"]);
    adjustPosition(state, "b", "x", q("-1"), "e6");
    expect(accountsHolding(state, "x")).toEqual(["a"]);
    expect(
      physicalPositions(state).map((p) => `${p.account_id}|${p.asset_id}=${p.quantity}`),
    ).toEqual(["a|x=10", "a|y=3"]);
  });
});

describe("cash balances", () => {
  it("accumulates per account and currency and hides zero balances", () => {
    const state = createEmptyState(DEFAULT_SETTINGS);
    adjustCash(state, "a", Money.parse("100", "EUR"));
    adjustCash(state, "a", Money.parse("-40.5", "EUR"));
    adjustCash(state, "a", Money.parse("20", "USD"));
    adjustCash(state, "b", Money.parse("5", "EUR"));
    adjustCash(state, "b", Money.parse("-5", "EUR"));
    expect(
      cashBalances(state).map((c) => `${c.account_id}|${c.currency}=${c.balance.amount}`),
    ).toEqual(["a|EUR=59.5", "a|USD=20"]);
  });
});
