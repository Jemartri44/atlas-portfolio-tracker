// `atlas admin prices push` (feature 016, E2, block 3; R24): the difference
// with the remote and the refusals, before the console writes anything.

import { describe, expect, it } from "vitest";
import { DomainError, ValidationError } from "../../src/errors.js";
import { serializeSymbols } from "../../src/quotes/symbols.js";
import { symbolsPushPlan } from "../../src/quotes/symbols-push.js";

const AT = "2026-09-01T00:00:00.000Z";

const entry = (symbol: string, extra: object = {}) => ({
  eodhd: symbol,
  currencies: { eodhd: "EUR" },
  confirmed_at: AT,
  ...extra,
});

const file = (assets: Record<string, object>, format = 2): string =>
  serializeSymbols({ symbols_format: format, assets } as never);

const refusal = (run: () => unknown): { code: string; details: unknown } => {
  try {
    run();
  } catch (error) {
    if (error instanceof DomainError) {
      return { code: error.code, details: error.details };
    }
    throw error;
  }
  throw new Error("no refusal");
};

describe("symbolsPushPlan (016, E2, block 3)", () => {
  it("has nothing to upload when the remote has the same bytes", () => {
    const text = file({ ast_a: entry("A.XETRA") });
    expect(symbolsPushPlan(text, text)).toEqual({ kind: "same" });
  });

  it("uploads everything as added when there is no remote", () => {
    const text = file({ ast_b: entry("B.XETRA"), ast_a: entry("A.XETRA") });
    expect(symbolsPushPlan(text, undefined)).toEqual({
      kind: "push",
      remote: "absent",
      changes: [
        { asset_id: "ast_a", change: "added", fields: [] },
        { asset_id: "ast_b", change: "added", fields: [] },
      ],
    });
  });

  it("says what is added, removed and changed, field by field, and not what stays", () => {
    const remote = file({
      ast_same: entry("S.XETRA"),
      ast_gone: entry("G.XETRA"),
      ast_moved: entry("M.XETRA"),
    });
    const local = file({
      ast_same: entry("S.XETRA"),
      ast_moved: entry("M.LSE", { currencies: { eodhd: "GBX" } }),
      ast_new: entry("N.XETRA"),
    });
    expect(symbolsPushPlan(local, remote)).toEqual({
      kind: "push",
      remote: "readable",
      changes: [
        { asset_id: "ast_gone", change: "removed", fields: [] },
        { asset_id: "ast_moved", change: "changed", fields: ["currencies", "eodhd"] },
        { asset_id: "ast_new", change: "added", fields: [] },
      ],
    });
  });

  it("compares by content, not by the order the keys were written in", () => {
    const remote = JSON.stringify({
      symbols_format: 2,
      assets: { ast_a: { confirmed_at: AT, currencies: { eodhd: "EUR" }, eodhd: "A.XETRA" } },
    });
    const local = file({ ast_a: entry("A.XETRA") });
    expect(symbolsPushPlan(local, remote)).toEqual({
      kind: "push",
      remote: "readable",
      changes: [],
    });
  });

  it("sees a change deep inside an entry", () => {
    const check = (found: string) => ({ currency_check: { eodhd: { found, at: AT } } });
    const remote = file({ ast_a: entry("A.XETRA", check("EUR")) });
    const local = file({ ast_a: entry("A.XETRA", check("USD")) });
    expect(symbolsPushPlan(local, remote)).toMatchObject({
      changes: [{ asset_id: "ast_a", change: "changed", fields: ["currency_check"] }],
    });
  });

  it("replaces a remote it cannot read, and says so", () => {
    const local = file({ ast_a: entry("A.XETRA") });
    for (const remote of ["{", JSON.stringify({ symbols_format: 2 }), ""]) {
      expect(symbolsPushPlan(local, remote)).toEqual({
        kind: "push",
        remote: "unreadable",
        changes: [{ asset_id: "ast_a", change: "added", fields: [] }],
      });
    }
  });

  it("refuses a remote of a newer format, which an older console must not rewrite", () => {
    const local = file({ ast_a: entry("A.XETRA") });
    const remote = JSON.stringify({ symbols_format: 3, assets: {} });
    expect(refusal(() => symbolsPushPlan(local, remote))).toEqual({
      code: "symbols_push_remote_newer",
      details: { format: 3 },
    });
  });

  it("refuses when there is no local file", () => {
    expect(refusal(() => symbolsPushPlan(undefined, undefined)).code).toBe("symbols_push_missing");
  });

  it("refuses a local file with closes stored in another currency, naming every asset", () => {
    const local = file({
      ast_b: entry("B.LSE", { misstored: { eodhd: "GBP" } }),
      ast_ok: entry("O.XETRA"),
      ast_a: entry("A.LSE", { misstored: { eodhd: "GBP" } }),
    });
    expect(refusal(() => symbolsPushPlan(local, undefined))).toEqual({
      code: "symbols_push_misstored",
      details: { assets: ["ast_a", "ast_b"] },
    });
  });

  it("refuses a local file of format 1 whose confirmation leaves closes misstored", () => {
    const legacy = JSON.stringify({
      symbols_format: 1,
      assets: {
        ast_l: {
          eodhd: "L.LSE",
          currency: "GBP",
          confirmed_at: AT,
          currency_check: { eodhd: { found: "GBX", at: AT } },
          currency_confirmed_over: { eodhd: "GBX" },
        },
      },
    });
    expect(refusal(() => symbolsPushPlan(legacy, undefined)).code).toBe("symbols_push_misstored");
  });

  it("refuses a local file it cannot read or of a newer format, with the code of the reader", () => {
    for (const [local, code] of [
      ["{", "invalid_symbols_file"],
      [JSON.stringify({ symbols_format: 3, assets: {} }), "symbols_file_newer_version"],
    ] as const) {
      expect(() => symbolsPushPlan(local, undefined)).toThrow(ValidationError);
      expect(refusal(() => symbolsPushPlan(local, undefined)).code).toBe(code);
    }
  });

  it("refuses a top-level key it does not know, naming the key and never its value (review of PR #106, B1)", () => {
    const remote = file({ ast_a: entry("A.XETRA") });
    const local = JSON.stringify({
      symbols_format: 2,
      assets: JSON.parse(remote).assets,
      eodhd_api_key: "sentinel-secret-of-the-push",
    });
    const refused = refusal(() => symbolsPushPlan(local, remote));
    expect(refused).toEqual({
      code: "symbols_file_unknown_key",
      details: { key: "eodhd_api_key" },
    });
    expect(JSON.stringify(refused)).not.toContain("sentinel-secret-of-the-push");
  });

  it("replaces a remote with a top-level key it does not know, as one it cannot read", () => {
    const local = file({ ast_a: entry("A.XETRA") });
    const remote = JSON.stringify({ ...JSON.parse(local), extra: 1 });
    expect(symbolsPushPlan(local, remote)).toMatchObject({ kind: "push", remote: "unreadable" });
  });

  it("is not fooled by assets named like the properties of every object (review of PR #106, N4)", () => {
    const local = JSON.stringify({
      symbols_format: 2,
      assets: { constructor: entry("C.XETRA"), toString: entry("T.XETRA") },
    });
    expect(symbolsPushPlan(local, undefined)).toEqual({
      kind: "push",
      remote: "absent",
      changes: [
        { asset_id: "constructor", change: "added", fields: [] },
        { asset_id: "toString", change: "added", fields: [] },
      ],
    });
    const proto = JSON.stringify({
      symbols_format: 2,
      assets: JSON.parse(
        `{"__proto__": ${JSON.stringify(entry("P.LSE", { misstored: { eodhd: "GBP" } }))}}`,
      ),
    });
    expect(proto).toContain('"__proto__"');
    expect(refusal(() => symbolsPushPlan(proto, undefined))).toEqual({
      code: "symbols_push_misstored",
      details: { assets: ["__proto__"] },
    });
  });

  it("does not take a readable remote with the same content but other bytes as the same", () => {
    const local = file({ ast_a: entry("A.XETRA") });
    expect(symbolsPushPlan(local, `${local}\n`)).toEqual({
      kind: "push",
      remote: "readable",
      changes: [],
    });
  });
});
