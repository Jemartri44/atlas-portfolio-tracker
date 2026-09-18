// atlas networth — the only view that adds the two books, always broken down.

import { DEFAULT_SETTINGS } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { EXIT } from "../../src/context.js";
import { bucketSeed, harness } from "../harness.js";

const DATE = "2027-06-30";

const settingsEvent = (settings: Record<string, unknown>) => ({
  schema_version: 1 as const,
  id: "01ARYZ6S41TSV4RRFFQ69G5SET",
  recorded_at: "2026-09-01T17:00:00.000Z",
  type: "settings_changed" as const,
  settings: { ...DEFAULT_SETTINGS, ...settings },
});

/** Core with a fund, bucket with a share bought in dollars, cash in both books. */
const portfolio = async () => {
  const h = harness({
    events: [
      ...bucketSeed(),
      settingsEvent({ target_weights: { ast_world: "100" }, stale_price_days: 5 }),
    ],
    confirm: true,
  });
  const run = async (argv: string[]) => {
    const code = await h.exec([...argv, "--yes"]);
    expect({ argv: argv.slice(0, 3).join(" "), code, err: h.err.join("\n") }).toMatchObject({ code: 0, err: "" });
  };
  await run([
    "add",
    "cash-in",
    "--account",
    "acc_fund",
    "--value-date",
    "2027-01-05",
    "--amount",
    "1000",
    "--currency",
    "EUR",
    "--fx-rate",
    "1",
  ]);
  await run([
    "add",
    "buy",
    "--account",
    "acc_fund",
    "--asset",
    "ast_world",
    "--trade-date",
    "2027-01-11",
    "--value-date",
    "2027-01-12",
    "--quantity",
    "6",
    "--unit-price",
    "100",
    "--currency",
    "EUR",
    "--fx-rate",
    "1",
    "--fx-rate-date",
    "2027-01-12",
  ]);
  await run([
    "thesis",
    "open",
    "--id",
    "th1",
    "--account",
    "acc_bucket",
    "--asset",
    "ast_spec",
    "--hypothesis",
    "h",
    "--horizon-days",
    "90",
    "--invalidation",
    "i",
    "--planned-size",
    "500",
  ]);
  await run([
    "add",
    "buy",
    "--account",
    "acc_bucket",
    "--asset",
    "ast_spec",
    "--thesis",
    "th1",
    "--trade-date",
    "2027-01-11",
    "--value-date",
    "2027-01-13",
    "--quantity",
    "4",
    "--unit-price",
    "25",
    "--currency",
    "USD",
    "--fx-rate",
    "1.25",
    "--fx-rate-date",
    "2027-01-11",
  ]);
  await run([
    "add",
    "valuation",
    "--account",
    "acc_fund",
    "--asset",
    "ast_world",
    "--date",
    DATE,
    "--quantity",
    "6",
    "--unit-value",
    "110",
    "--currency",
    "EUR",
    "--fx-rate",
    "1",
  ]);
  await run([
    "add",
    "valuation",
    "--account",
    "acc_bucket",
    "--asset",
    "ast_spec",
    "--date",
    DATE,
    "--quantity",
    "4",
    "--unit-value",
    "30",
    "--currency",
    "USD",
    "--fx-rate",
    "1.25",
    "--fx-rate-date",
    "2027-06-30",
  ]);
  h.reset();
  return h;
};

describe("atlas networth", () => {
  it("prints the three blocks, the cash rate with its date and the total", async () => {
    const h = await portfolio();
    expect(await h.exec(["networth", "--date", DATE])).toBe(0);
    const text = h.text();
    expect(text).toContain("Patrimonio total a 2027-06-30");
    expect(text).toContain("Núcleo:");
    expect(text).toContain("Cubo:");
    expect(text).toContain("Efectivo:");
    expect(text).toContain("[equity]");
    expect(text).toMatch(/acc_bucket \/ ast_spec\s+96/);
    expect(text).toMatch(/acc_fund\s+EUR\s+400/);
    expect(text).toMatch(/acc_bucket\s+USD\s+-100\s+1\.25\s+2027-06-30/);
    // 660 of core + 96 of bucket + 400 of euros − 80 of dollars.
    expect(text).toContain("TOTAL");
    expect(text).toContain("1076");
    expect(text).not.toContain(" (parcial)");
  });

  it("marks the total partial and says what is missing", async () => {
    const h = await portfolio();
    expect(
      await h.exec([
        "add",
        "buy",
        "--account",
        "acc_etf",
        "--asset",
        "ast_gold",
        "--trade-date",
        "2027-01-11",
        "--value-date",
        "2027-01-12",
        "--quantity",
        "1",
        "--unit-price",
        "200",
        "--currency",
        "USD",
        "--fx-rate",
        "1.1",
        "--fx-rate-date",
        "2027-01-11",
        "--yes",
      ]),
    ).toBe(0);
    h.reset();
    expect(await h.exec(["networth", "--date", DATE])).toBe(0);
    expect(h.text()).toContain("(parcial)");
    expect(h.text()).toContain("Faltan: ast_gold");
  });

  it("answers in JSON with the envelope, and never a bare total", async () => {
    const h = await portfolio();
    expect(await h.exec(["networth", "--date", DATE, "--json"])).toBe(0);
    const payload = JSON.parse(h.out.join("\n")) as {
      invalid_count: number;
      data: { total_eur: string; core: unknown; bucket: unknown; cash: unknown };
    };
    expect(payload.invalid_count).toBe(0);
    expect(payload.data.total_eur).toBe("1076");
    expect(payload.data.core).toBeDefined();
    expect(payload.data.bucket).toBeDefined();
    expect(payload.data.cash).toBeDefined();
  });

  it("rejects a date that is not a date instead of answering something plausible", async () => {
    const h = await portfolio();
    expect(await h.exec(["networth", "--date", "mañana"])).toBe(EXIT.usage);
  });

  it("does not write: the ledger is the same after asking", async () => {
    const h = await portfolio();
    const before = (await h.store.load()).etag;
    expect(await h.exec(["networth", "--date", DATE])).toBe(0);
    expect((await h.store.load()).etag).toBe(before);
  });
});
