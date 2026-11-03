// What the console adds of the closes the cloud downloaded — the rules of the
// local download, the source and the time of the cloud kept — and which files
// it asks for again; and the budget of a console that shares the free plans
// with the cloud.

import { describe, expect, it } from "vitest";
import {
  assetOfPriceFile,
  CLOUD_PULL_FILE,
  changedPriceFiles,
  cloudLinesToAppend,
  parseCloudPull,
  serializeCloudPull,
} from "../../src/quotes/cloud.js";
import { parsePriceConfig } from "../../src/quotes/config.js";
import type { CloseLine } from "../../src/quotes/line.js";

const line = (date: string, close: string, fetched_at = "2026-10-01T05:00:00.000Z"): CloseLine => ({
  schema_version: 1,
  date,
  close,
  currency: "EUR",
  source: "eodhd",
  fetched_at,
});

const TODAY = "2026-10-01";

describe("the closes the console takes from the cloud", () => {
  it("adds a date it does not have, keeping the source and the time of the cloud", () => {
    expect(
      cloudLinesToAppend([line("2026-09-29", "10")], [line("2026-09-30", "11")], { today: TODAY })
        .added,
    ).toEqual([line("2026-09-30", "11")]);
  });

  it("follows the rules of the daily download: only a new date or a correction", () => {
    const local = [line("2026-09-28", "10"), line("2026-09-30", "10")];
    const cloud = [
      line("2026-09-28", "10.0"), // the same value as a number: nothing
      line("2026-09-29", "12"), // a date it does not have: added
      line("2026-09-30", "14"), // a correction: added
    ];
    expect(cloudLinesToAppend(local, cloud, { today: TODAY }).added).toEqual([
      line("2026-09-29", "12"),
      line("2026-09-30", "14"),
    ]);
  });

  it("decides each line of the cloud against what it added before it", () => {
    expect(
      cloudLinesToAppend([], [line("2026-09-30", "10"), line("2026-09-30", "10")], {
        today: TODAY,
      }).added,
    ).toEqual([line("2026-09-30", "10")]);
  });
});

describe("what the console never takes from the cloud", () => {
  it("never a close of today or of a day to come, and says how many it left (B1)", () => {
    expect(
      cloudLinesToAppend(
        [],
        [line("2026-09-30", "10"), line("2026-10-01", "11"), line("2099-01-01", "12")],
        { today: TODAY },
      ),
    ).toEqual({ added: [line("2026-09-30", "10")], future: 2, mismatched: 0 });
  });

  it("never a close taken on the day of its own session, not even the day after (R2-B1)", () => {
    expect(
      cloudLinesToAppend(
        [],
        [
          // Taken at mid-session, 11:00 in Madrid of the same day: never.
          line("2026-10-01", "11", "2026-10-01T09:00:00.000Z"),
          // Its close, taken the day after: taken.
          line("2026-10-01", "12", "2026-10-02T05:00:00.000Z"),
          // 23:59:59 in Madrid of its own day (summer time): never.
          line("2026-09-28", "9", "2026-09-28T21:59:59.000Z"),
          // 00:00 in Madrid of the day after, still its day in UTC: taken.
          line("2026-09-29", "10", "2026-09-29T22:00:00.000Z"),
        ],
        { today: "2026-10-02" },
      ),
    ).toEqual({
      added: [
        line("2026-10-01", "12", "2026-10-02T05:00:00.000Z"),
        line("2026-09-29", "10", "2026-09-29T22:00:00.000Z"),
      ],
      future: 2,
      mismatched: 0,
    });
  });

  it("never a close in another currency than the one the folder declares for its source (N5)", () => {
    const gbp = { ...line("2026-09-29", "900"), currency: "GBP" };
    expect(
      cloudLinesToAppend([], [gbp, line("2026-09-30", "10")], {
        today: TODAY,
        declared: { eodhd: "EUR" },
      }),
    ).toEqual({ added: [line("2026-09-30", "10")], future: 0, mismatched: 1 });
  });
});

describe("which files of the cloud the console asks for", () => {
  const index = [
    { name: "ast_a.jsonl", version: "v1" },
    { name: "ast_b.jsonl", version: "v2" },
    { name: "symbols.json", version: "v3" },
  ];

  it("asks for every file of closes the first time, and only those whose version changed after", () => {
    expect(changedPriceFiles(index, undefined, "https://a.example").map((f) => f.name)).toEqual([
      "ast_a.jsonl",
      "ast_b.jsonl",
    ]);
    const pull = {
      cloud_format: 1 as const,
      origin: "https://a.example",
      pulled_at: "2026-10-01T06:00:00.000Z",
      versions: { "ast_a.jsonl": "v1", "ast_b.jsonl": "old" },
    };
    expect(changedPriceFiles(index, pull, "https://a.example").map((f) => f.name)).toEqual([
      "ast_b.jsonl",
    ]);
    // Another origin: its versions say nothing of this one.
    expect(changedPriceFiles(index, pull, "https://b.example")).toHaveLength(2);
  });

  it("takes the asset of a name only by the round trip of its name", () => {
    expect(assetOfPriceFile("ast_a.jsonl")).toBe("ast_a");
    expect(assetOfPriceFile("a%2Fb.jsonl")).toBe("a/b");
    for (const name of ["symbols.json", ".jsonl", "%E0.jsonl", "a/b.jsonl", "x.csv"]) {
      expect(assetOfPriceFile(name), name).toBeUndefined();
    }
  });

  it("reads back what it writes, strictly, and says a file it cannot read", () => {
    const pull = {
      cloud_format: 1 as const,
      origin: "https://a.example",
      pulled_at: "2026-10-01T06:00:00.000Z",
      versions: { "ast_a.jsonl": "v1" },
    };
    expect(CLOUD_PULL_FILE).toBe("_cloud.json");
    expect(parseCloudPull(serializeCloudPull(pull))).toEqual(pull);
    const said = { ...pull, discarded: { future: 2, currency_mismatch: 1 } };
    expect(parseCloudPull(serializeCloudPull(said))).toEqual(said);
    expect(parseCloudPull(undefined)).toBeUndefined();
    for (const text of [
      "{",
      "[]",
      JSON.stringify({ ...pull, cloud_format: 2 }),
      JSON.stringify({ ...pull, extra: 1 }),
      JSON.stringify({ ...pull, origin: 1 }),
      JSON.stringify({ ...pull, pulled_at: 1 }),
      JSON.stringify({ ...pull, versions: [] }),
      JSON.stringify({ ...pull, versions: { a: 1 } }),
      JSON.stringify({ ...pull, discarded: [] }),
      JSON.stringify({ ...pull, discarded: { future: -1, currency_mismatch: 0 } }),
      JSON.stringify({ ...pull, discarded: { future: 1 } }),
      JSON.stringify({ ...pull, discarded: { future: 1, currency_mismatch: 0, x: 0 } }),
      '{"cloud_format":1,"cloud_format":1,"origin":"o","pulled_at":"t","versions":{}}',
    ]) {
      expect(() => parseCloudPull(text), text).toThrow(
        expect.objectContaining({
          code: expect.stringMatching(/invalid_cloud_pull|json_key_repeated/),
        }),
      );
    }
  });
});

describe("the budget of a console that shares the free plan with the cloud (N2 of §15)", () => {
  it("is the leftover of the plan, 2, unless config.json says otherwise", () => {
    expect(parsePriceConfig(undefined).daily_calls).toEqual({ eodhd: 20 });
    expect(parsePriceConfig(undefined, { sharedWithCloud: true }).daily_calls).toEqual({
      eodhd: 2,
    });
    expect(
      parsePriceConfig('{"failure_threshold":4}', { sharedWithCloud: true }).daily_calls,
    ).toEqual({ eodhd: 2 });
    expect(
      parsePriceConfig('{"daily_calls":{"eodhd":5}}', { sharedWithCloud: true }).daily_calls,
    ).toEqual({ eodhd: 5 });
    expect(parsePriceConfig('{"daily_calls":{"eodhd":5}}').daily_calls).toEqual({ eodhd: 5 });
  });
});
