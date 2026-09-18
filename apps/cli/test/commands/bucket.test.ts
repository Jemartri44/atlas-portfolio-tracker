// atlas bucket · atlas thesis show — the view of the speculative bucket.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_SETTINGS } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { EXIT } from "../../src/context.js";
import { bucketSeed, harness } from "../harness.js";

const goldenLines = (): string[] =>
  readFileSync(
    join(
      resolve(dirname(fileURLToPath(import.meta.url)), "../../../../tests/fixtures/ledger"),
      "synthetic-v1.jsonl",
    ),
    "utf8",
  )
    .split("\n")
    .filter((line) => line !== "");

const DATE = "2027-12-31";

const settingsEvent = (settings: Record<string, unknown>) => ({
  schema_version: 1 as const,
  id: "01ARYZ6S41TSV4RRFFQ69G5SET",
  recorded_at: "2026-09-01T17:00:00.000Z",
  type: "settings_changed" as const,
  settings: { ...DEFAULT_SETTINGS, ...settings },
});

/**
 * A bucket with one thesis closed at a profit and one still open, an index
 * priced on both dates, and the three thresholds configured.
 *
 * The clock moves along with the story: a thesis is dated by the `recorded_at`
 * of its opening (data-schema.md §6.4), so recording everything on one instant
 * would put both theses in the future of every dated view.
 */
const bucket = async (settings: Record<string, unknown> = {}) => {
  const h = harness({
    events: [
      ...bucketSeed(),
      settingsEvent({
        bucket_benchmark_asset_id: "ast_world",
        bucket_max_cumulative_contribution: "10000",
        bucket_stop_loss_pct: "30",
        bucket_max_weight_pct: "50",
        stale_price_days: 400,
        ...settings,
      }),
    ],
    confirm: true,
    instant: "2027-01-05T10:00:00.000Z",
  });
  const run = async (argv: string[]) => {
    const code = await h.exec([...argv, "--yes"]);
    expect({ code, err: h.err.join("\n") }).toMatchObject({ code: 0, err: "" });
  };
  const price = (asset: string, date: string, value: string, account = "acc_fund") =>
    run([
      "add",
      "valuation",
      "--account",
      account,
      "--asset",
      asset,
      "--date",
      date,
      "--quantity",
      "10",
      "--unit-value",
      value,
      "--currency",
      "EUR",
      "--fx-rate",
      "1",
    ]);
  const trade = (type: string, date: string, price: string, thesis: string, quantity = "10") =>
    run([
      "add",
      type,
      "--account",
      "acc_bucket",
      "--asset",
      "ast_spec",
      "--thesis",
      thesis,
      "--trade-date",
      date,
      "--value-date",
      date,
      "--quantity",
      quantity,
      "--unit-price",
      price,
      "--currency",
      "EUR",
      "--fx-rate",
      "1",
      "--fx-rate-date",
      date,
      "--fee",
      "1",
    ]);

  await run([
    "add",
    "cash-in",
    "--account",
    "acc_bucket",
    "--value-date",
    "2027-01-02",
    "--amount",
    "5000",
    "--currency",
    "EUR",
    "--fx-rate",
    "1",
  ]);
  await price("ast_world", "2027-01-01", "100");
  await price("ast_world", "2027-06-01", "110");
  h.setInstant("2027-01-10T10:00:00.000Z");
  await run([
    "thesis",
    "open",
    "--id",
    "th_a",
    "--account",
    "acc_bucket",
    "--asset",
    "ast_spec",
    "--hypothesis",
    "sube",
    "--horizon-days",
    "30",
    "--invalidation",
    "cierra bajo 8",
    "--planned-size",
    "500",
  ]);
  h.setInstant("2027-01-11T10:00:00.000Z");
  await trade("buy", "2027-01-11", "10", "th_a");
  h.setInstant("2027-06-01T10:00:00.000Z");
  await trade("sell", "2027-06-01", "13", "th_a");
  await run(["thesis", "close", "th_a", "--notes", "salió bien"]);
  h.setInstant("2027-09-01T10:00:00.000Z");
  await run([
    "thesis",
    "open",
    "--id",
    "th_b",
    "--account",
    "acc_bucket",
    "--asset",
    "ast_spec",
    "--hypothesis",
    "otra vez",
    "--horizon-days",
    "30",
    "--invalidation",
    "cierra bajo 10",
    "--planned-size",
    "500",
  ]);
  await trade("buy", "2027-09-01", "12", "th_b");
  h.setInstant("2027-12-01T10:00:00.000Z");
  await price("ast_spec", "2027-12-01", "15", "acc_bucket");
  h.setInstant("2028-01-15T10:00:00.000Z");
  h.reset();
  return h;
};

describe("atlas bucket", () => {
  it("shows positions, theses, statistics and the control block", async () => {
    const h = await bucket();
    expect(await h.exec(["bucket", "--date", DATE])).toBe(0);
    const text = h.text();
    expect(text).toContain("Cubo especulativo a 2027-12-31");
    expect(text).toContain("Posiciones abiertas:");
    // Open position: 10 at 12 (+1 of fee) against a price of 15.
    expect(text).toMatch(/acc_bucket\s+ast_spec\s+10\s+12\.1\s+15/);
    expect(text).toContain("cierra bajo 10");
    expect(text).toContain("Tesis:");
    expect(text).toMatch(/th_a\s+cerrada/);
    expect(text).toContain("COMISIONES SOBRE CAPITAL OPERADO");
    expect(text).toContain("Tasa de acierto");
    expect(text).toContain("Control del cubo:");
    expect(text).toContain("Aporte bruto");
  });

  it("compares each thesis with the index and says when it cannot", async () => {
    const h = await bucket();
    expect(await h.exec(["bucket", "--date", DATE, "--json"])).toBe(0);
    const data = h.json() as {
      theses: { thesis_id: string; result_vs_index_eur?: string; missing_benchmark: unknown[] }[];
    };
    const closed = data.theses.find((thesis) => thesis.thesis_id === "th_a");
    // 101 invested; the index went 100 → 110, so it would have made 111.10.
    // The thesis made 28 (130 − 1 of fee − 101), so it beat it by 17.90.
    expect(closed?.result_vs_index_eur).toBe("17.9");
    expect(closed?.missing_benchmark).toEqual([]);
  });

  it("marks the sample as too small and never blocks anything", async () => {
    const h = await bucket();
    expect(await h.exec(["bucket", "--date", DATE])).toBe(0);
    expect(h.text()).toContain("no distingue habilidad de suerte");
  });

  it("puts the stop-loss rule at the top when it is passed", async () => {
    // A tiny cap: any loss passes it.
    const h = await bucket({
      bucket_stop_loss_pct: "0.01",
      bucket_max_cumulative_contribution: "100",
    });
    expect(await h.exec(["bucket", "--date", DATE])).toBe(0);
    const text = h.text();
    expect(text).toContain("El aporte bruto al cubo");
    // The contribution cap is passed, and the message names rule 17.
    expect(text).toContain("regla 17");
  });

  it("shows only the theses that already existed at the date asked", async () => {
    // The golden ends in 2028 with nine theses; in June 2027 only four had been
    // opened and only one had been closed (ADR-0016 cuts pass A, and the
    // administrative dates of a thesis cut the view).
    const h = harness({ lines: goldenLines() });
    expect(await h.exec(["bucket", "--date", "2027-06-30", "--json"])).toBe(0);
    const data = h.json() as {
      theses: { thesis_id: string; status: string; days_open: number }[];
      stats: { closed_theses: number; measured_theses: number };
    };
    expect(data.theses.map((t) => t.thesis_id)).toEqual([
      "th_alpha",
      "th_beta",
      "th_delta_1",
      "th_epsilon_1",
    ]);
    expect(data.theses.filter((t) => t.status === "closed").map((t) => t.thesis_id)).toEqual([
      "th_epsilon_1",
    ]);
    expect(data.theses.every((t) => t.days_open > 0)).toBe(true);
    expect(data.stats).toMatchObject({ closed_theses: 1, measured_theses: 1 });
  });

  it("says which control rules a position without a price switched off", async () => {
    // The golden keeps a delisted asset with no price on purpose: both rules go
    // unmeasured, and the view must say so instead of leaving a blank line.
    const h = harness({ lines: goldenLines() });
    expect(await h.exec(["bucket", "--date", "2028-12-31"])).toBe(0);
    const text = h.text();
    expect(text).toContain("La regla de parada (30 %) no se ha podido evaluar");
    expect(text).toContain("La regla de peso (10 %) no se ha podido evaluar");
    expect(text).toContain("faltan ast_alpha_spin");
    h.reset();
    expect(await h.exec(["bucket", "--date", "2028-12-31", "--json"])).toBe(0);
    const data = h.json() as {
      controls: { weight_pct?: string; weight_pct_unavailable?: { reason: string } };
    };
    // The reason travels next to the field that is missing.
    expect(data.controls.weight_pct).toBeUndefined();
    expect(data.controls.weight_pct_unavailable?.reason).toBe("partial_net_worth");
  });

  it("answers in JSON with the envelope and does not write", async () => {
    const h = await bucket();
    const before = (await h.store.load()).etag;
    expect(await h.exec(["bucket", "--date", DATE, "--json"])).toBe(0);
    const payload = JSON.parse(h.out.join("\n")) as { invalid_count: number; data: unknown };
    expect(payload.invalid_count).toBe(0);
    expect(payload.data).toBeDefined();
    expect((await h.store.load()).etag).toBe(before);
  });

  it("rejects a date that is not a date", async () => {
    const h = await bucket();
    expect(await h.exec(["bucket", "--date", "ayer"])).toBe(EXIT.usage);
  });
});

describe("atlas thesis show", () => {
  it("prints the sheet of a thesis with its trades and its comparison", async () => {
    const h = await bucket();
    expect(await h.exec(["thesis", "show", "th_a", "--date", DATE])).toBe(0);
    const text = h.text();
    expect(text).toContain("Tesis th_a (cerrada)");
    expect(text).toContain("sube");
    expect(text).toContain("cierra bajo 8");
    expect(text).toContain("Compras:");
    expect(text).toContain("Ventas:");
    expect(text).toContain("equivalente en índice");
    expect(text).toContain("resultado vs índice");
  });

  it("says a thesis that does not exist does not exist", async () => {
    const h = await bucket();
    expect(await h.exec(["thesis", "show", "th_x"])).toBe(EXIT.domain);
    expect(h.err.join("\n")).toContain("La tesis th_x no existe");
  });

  it("needs an id", async () => {
    const h = await bucket();
    expect(await h.exec(["thesis", "show"])).toBe(EXIT.usage);
  });
});
