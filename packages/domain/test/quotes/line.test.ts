import { describe, expect, it } from "vitest";
import {
  type CloseLine,
  closeOn,
  closeOnOrBefore,
  effectiveCloses,
  encodeCloseLine,
  linesToAppend,
  readCloseFile,
  readCloses,
} from "../../src/quotes/line.js";

const line = (
  date: string,
  close: string,
  source: "eodhd" | "alpha_vantage" = "eodhd",
  currency = "EUR",
): CloseLine => ({
  schema_version: 1,
  date,
  close,
  currency,
  source,
  fetched_at: "2027-01-05T06:00:00.000Z",
});

const text = (...lines: CloseLine[]): string =>
  lines.map((l) => `${encodeCloseLine(l)}\n`).join("");

describe("a line of prices/<asset_id>.jsonl", () => {
  it("is written with exactly the fields of ADR-0031, in a fixed order, and no value in euros", () => {
    const encoded = encodeCloseLine(line("2027-01-04", "101.5"));
    expect(encoded).toBe(
      '{"schema_version":1,"date":"2027-01-04","close":"101.5","currency":"EUR","source":"eodhd","fetched_at":"2027-01-05T06:00:00.000Z"}',
    );
    expect(encoded).not.toMatch(/eur"|value_eur|fx_rate/);
  });

  it("reads back what it writes, skipping the blank end of the file", () => {
    expect(readCloseFile("ast_x", text(line("2027-01-04", "101.5")))).toEqual([
      line("2027-01-04", "101.5"),
    ]);
    expect(readCloseFile("ast_x", "")).toEqual([]);
  });

  it("refuses a line it does not understand, with its number, never a price by halves", () => {
    const good = encodeCloseLine(line("2027-01-04", "101.5"));
    const cases: [string, string][] = [
      ["not json", "json"],
      ["[1]", "json"],
      ["null", "json"],
      ['{"schema_version":"1"}', "schema_version"],
      ['{"schema_version":0}', "schema_version"],
      ['{"schema_version":1.5}', "schema_version"],
      [good.replace('"fetched_at"', '"value_eur":"1","fetched_at"'), "value_eur"],
      [good.replace("2027-01-04", "2027-02-30"), "date"],
      [good.replace('"101.5"', "101.5"), "close"],
      [good.replace('"101.5"', '"-1"'), "close"],
      [good.replace('"101.5"', '"0"'), "close"],
      [good.replace('"EUR"', '"eur"'), "currency"],
      [good.replace('"EUR"', "1"), "currency"],
      [good.replace('"eodhd"', '"coingecko"'), "source"],
      [good.replace("2027-01-05T06:00:00.000Z", "yesterday"), "fetched_at"],
      [good.replace('"2027-01-05T06:00:00.000Z"', "5"), "fetched_at"],
    ];
    for (const [bad, field] of cases) {
      expect(() => readCloseFile("ast_x", `${good}\n${bad}\n`), bad).toThrow(
        expect.objectContaining({
          code: "price_line_invalid",
          details: { asset_id: "ast_x", line: 2, field },
        }),
      );
    }
  });

  it("refuses the whole file when a line is of a newer version (trap 10)", () => {
    const newer = encodeCloseLine(line("2027-01-04", "1")).replace(
      '"schema_version":1',
      '"schema_version":2',
    );
    expect(() => readCloseFile("ast_x", `${newer}\n`)).toThrow(
      expect.objectContaining({
        code: "price_file_newer_version",
        details: expect.objectContaining({ version: 2 }),
      }),
    );
    const { closes, unreadable } = readCloses(
      new Map([
        ["ast_new", `${encodeCloseLine(line("2027-01-01", "5"))}\n${newer}\n`],
        ["ast_ok", text(line("2027-01-04", "7"))],
      ]),
    );
    // The asset of the newer file has no automatic price at all, not the part that read.
    expect(closes.has("ast_new")).toBe(false);
    expect(closes.get("ast_ok")?.[0]?.close).toBe("7");
    expect(unreadable).toEqual([
      { asset_id: "ast_new", code: "price_file_newer_version", line: 2 },
    ]);
  });
});

describe("the close in force of each date (D-Q10)", () => {
  it("is the last line of the date, which says what it replaced", () => {
    const closes = effectiveCloses([
      line("2027-01-05", "10"),
      line("2027-01-04", "9", "alpha_vantage"),
      line("2027-01-04", "9.10"),
      line("2027-01-05", "10.0"),
    ]);
    expect(closes.map((c) => [c.date, c.close, c.source])).toEqual([
      ["2027-01-04", "9.10", "eodhd"],
      ["2027-01-05", "10.0", "eodhd"],
    ]);
    expect(closes[0]?.replaced).toEqual({ close: "9", source: "alpha_vantage" });
    // The same number from the same source is not a replacement.
    expect(closes[1]?.replaced).toBeUndefined();
  });

  it("is looked up on or before a date, never after and never between two", () => {
    const closes = effectiveCloses([line("2027-01-04", "9"), line("2027-01-08", "11")]);
    expect(closeOnOrBefore(closes, "2027-01-03")).toBeUndefined();
    expect(closeOnOrBefore(closes, "2027-01-06")?.close).toBe("9");
    expect(closeOnOrBefore(closes, "2027-01-08")?.close).toBe("11");
    expect(closeOnOrBefore(closes, "2027-02-01")?.close).toBe("11");
    expect(closeOn(closes, "2027-01-06")).toBeUndefined();
    expect(closeOn(closes, "2027-01-08")?.close).toBe("11");
  });
});

describe("what a download appends", () => {
  const order = ["eodhd", "alpha_vantage"] as const;
  const at = "2027-01-06T06:00:00.000Z";

  it("appends a new date and nothing for the same number of the same source (101.50 is 101.5)", () => {
    const existing = [line("2027-01-04", "101.5")];
    const added = linesToAppend(
      existing,
      [
        { date: "2027-01-04", close: "101.50", currency: "EUR" },
        { date: "2027-01-05", close: "102", currency: "EUR" },
      ],
      "eodhd",
      order,
      at,
    );
    expect(added).toEqual([{ ...line("2027-01-05", "102"), fetched_at: at }]);
  });

  it("appends a correction of the same source, which then wins", () => {
    const added = linesToAppend(
      [line("2027-01-04", "101.5")],
      [{ date: "2027-01-04", close: "101.6", currency: "EUR" }],
      "eodhd",
      order,
      at,
    );
    expect(added).toHaveLength(1);
    expect(effectiveCloses([line("2027-01-04", "101.5"), ...added])[0]?.close).toBe("101.6");
  });

  it("appends a different currency of the same number as a correction", () => {
    expect(
      linesToAppend(
        [line("2027-01-04", "5")],
        [{ date: "2027-01-04", close: "5", currency: "USD" }],
        "eodhd",
        order,
        at,
      ),
    ).toHaveLength(1);
  });

  it("lets the primary replace the fallback, never the other way round, and averages nothing (P7)", () => {
    const fallback = [line("2027-01-04", "100", "alpha_vantage")];
    const primary = linesToAppend(
      fallback,
      [{ date: "2027-01-04", close: "100.2", currency: "EUR" }],
      "eodhd",
      order,
      at,
    );
    expect(primary.map((l) => [l.source, l.close])).toEqual([["eodhd", "100.2"]]);
    expect(effectiveCloses([...fallback, ...primary])[0]?.close).toBe("100.2");
    const late = linesToAppend(
      [line("2027-01-04", "100.2")],
      [{ date: "2027-01-04", close: "100", currency: "EUR" }],
      "alpha_vantage",
      order,
      at,
    );
    expect(late).toEqual([]);
  });

  it("ranks a source missing from the configured order after every one in it", () => {
    const added = linesToAppend(
      [line("2027-01-04", "100", "alpha_vantage")],
      [{ date: "2027-01-04", close: "99", currency: "EUR" }],
      "eodhd",
      ["alpha_vantage"],
      at,
    );
    expect(added).toEqual([]);
  });

  it("does not append the same date twice from one answer", () => {
    const added = linesToAppend(
      [],
      [
        { date: "2027-01-04", close: "1", currency: "EUR" },
        { date: "2027-01-04", close: "1.0", currency: "EUR" },
      ],
      "eodhd",
      order,
      at,
    );
    expect(added).toHaveLength(1);
  });
});
