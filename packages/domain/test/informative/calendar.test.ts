// The fiscal calendar (feature 020, E4, M12): what it asks of the domain and
// what it must never say.

import { describe, expect, it } from "vitest";
import {
  type CalendarDate,
  FILING_DEADLINES,
  type FiscalCalendar,
  fiscalCalendar,
} from "../../src/fiscal.js";
import { DEFAULT_SETTINGS, mergeSettings, type Settings } from "../../src/settings/settings.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const settingsOf = (extra: Partial<Settings>): Settings => mergeSettings(DEFAULT_SETTINGS, extra);

/** The catalogue has an account in Ireland (`acc_etf`) and two in Spain. */
const spanishOnly = (): LedgerBuilder => {
  const b = new LedgerBuilder();
  b.account("acc_fund");
  b.asset("ast_world");
  return b;
};

/** A purchase at 100 and a sale of the same unit at `price` on `date`. */
const cycle = (b: LedgerBuilder, price: string, date: string, asset = "ast_world"): void => {
  b.buy({
    account_id: "acc_fund",
    asset_id: asset,
    trade_date: "2027-01-05",
    quantity: "10",
    unit_price: "100",
  });
  b.sell({
    account_id: "acc_fund",
    asset_id: asset,
    trade_date: date,
    quantity: "1",
    unit_price: price,
  });
};

const of = (calendar: FiscalCalendar, kind: CalendarDate["kind"]): CalendarDate[] =>
  calendar.dates.filter((entry) => entry.kind === kind);

describe("fiscalCalendar: the season", () => {
  it("is the season of the settings, in the year of the query, both ends dated", () => {
    const calendar = fiscalCalendar(spanishOnly().build(), "2029-01-20");
    expect(calendar.year).toBe(2029);
    expect(calendar.season).toEqual({ start: "2029-04-01", end: "2029-06-30" });
    expect(calendar.dates.map((entry) => [entry.kind, entry.date])).toEqual([
      ["season_start", "2029-04-01"],
      ["season_end", "2029-06-30"],
    ]);
  });

  it("follows a configured season, never a constant", () => {
    const b = spanishOnly();
    b.settings(settingsOf({ renta_season_start: "03-15", renta_season_end: "05-20" }));
    const calendar = fiscalCalendar(b.build(), "2029-01-20");
    expect(calendar.season).toEqual({ start: "2029-03-15", end: "2029-05-20" });
  });
});

describe("fiscalCalendar: the end of a wash-sale window", () => {
  it("is washSaleWindowEnd of each loss-making sale whose window is still open", () => {
    const b = spanishOnly();
    cycle(b, "50", "2027-06-10");
    const calendar = fiscalCalendar(b.build(), "2027-07-01");
    const [end] = of(calendar, "wash_sale_end");
    expect(end?.date).toBe("2027-08-10");
    expect(end?.year).toBe(2027);
    expect(end?.sources).toContain("ast_world");
    expect(end?.sources).toHaveLength(2);
  });

  it("keeps the window on its last day and drops it the day after", () => {
    const b = spanishOnly();
    cycle(b, "50", "2027-06-10");
    expect(of(fiscalCalendar(b.build(), "2027-08-10"), "wash_sale_end")).toHaveLength(1);
    expect(of(fiscalCalendar(b.build(), "2027-08-11"), "wash_sale_end")).toHaveLength(0);
  });

  it("ignores a sale that made a gain", () => {
    const b = spanishOnly();
    cycle(b, "150", "2027-06-10");
    expect(of(fiscalCalendar(b.build(), "2027-07-01"), "wash_sale_end")).toHaveLength(0);
  });

  it("uses the window configured for the type of asset, and may fall outside the year", () => {
    const b = spanishOnly();
    b.settings(
      settingsOf({ wash_sale_window: { ...DEFAULT_SETTINGS.wash_sale_window, fund: "1y" } }),
    );
    cycle(b, "50", "2027-06-10");
    const calendar = fiscalCalendar(b.build(), "2027-07-01");
    expect(of(calendar, "wash_sale_end")[0]?.date).toBe("2028-06-10");
    expect(calendar.year).toBe(2027);
  });

  it("gathers the sales of the same day into one date with all their sources", () => {
    const b = spanishOnly();
    cycle(b, "50", "2027-06-10");
    b.sell({
      account_id: "acc_fund",
      asset_id: "ast_world",
      trade_date: "2027-06-10",
      quantity: "1",
      unit_price: "40",
    });
    const ends = of(fiscalCalendar(b.build(), "2027-07-01"), "wash_sale_end");
    expect(ends).toHaveLength(1);
    expect(ends[0]?.sources).toHaveLength(4);
  });

  it("does not look at what happens after the date of the query", () => {
    const b = spanishOnly();
    cycle(b, "50", "2027-06-10");
    expect(of(fiscalCalendar(b.build(), "2027-05-01"), "wash_sale_end")).toHaveLength(0);
  });
});

describe("fiscalCalendar: the informative returns", () => {
  const abroad = (): LedgerBuilder => {
    const b = new LedgerBuilder();
    catalogue(b);
    return b;
  };

  it("dates the deadline of the 720 and the 721 of the year before, and the valuation of 31 December", () => {
    const calendar = fiscalCalendar(abroad().build(), "2027-01-20");
    expect(
      calendar.dates.map((entry) => [entry.kind, entry.date, entry.model, entry.year]),
    ).toEqual(
      [
        ["filing_deadline", "2027-03-31", "720", 2026],
        ["filing_deadline", "2027-03-31", "721", 2026],
        ["season_start", "2027-04-01", undefined, 2027],
        ["season_end", "2027-06-30", undefined, 2027],
        ["year_end_valuation", "2027-12-31", undefined, 2027],
      ].sort((a, b) => String(a[1]).localeCompare(String(b[1]))),
    );
    expect(calendar.unknown_deadlines).toEqual([]);
    // 31/03/2027 is a Wednesday: the order says it and nothing shifts it.
    expect(of(calendar, "filing_deadline").map((entry) => entry.verified)).toEqual([true, true]);
  });

  it("carries the mark of a deadline that nobody verified", () => {
    // 31/03/2024 was a Sunday: the row of 2023 stays at the literal day, unverified.
    const b = new LedgerBuilder();
    b.recordedAt("2023-06-01");
    catalogue(b);
    const calendar = fiscalCalendar(b.build(), "2024-01-20");
    const deadlines = of(calendar, "filing_deadline");
    expect(deadlines.map((entry) => [entry.model, entry.date, entry.verified])).toEqual([
      ["720", "2024-03-31", false],
      ["721", "2024-03-31", false],
    ]);
  });

  it("has none of them without an account abroad", () => {
    const calendar = fiscalCalendar(spanishOnly().build(), "2027-01-20");
    expect(of(calendar, "filing_deadline")).toEqual([]);
    expect(of(calendar, "year_end_valuation")).toEqual([]);
    expect(calendar.unknown_deadlines).toEqual([]);
  });

  it("says it, and draws no deadline, for a year nobody verified", () => {
    const calendar = fiscalCalendar(abroad().build(), "2040-01-20");
    expect(of(calendar, "filing_deadline")).toEqual([]);
    expect(calendar.unknown_deadlines).toEqual([
      { model: "720", year: 2039 },
      { model: "721", year: 2039 },
    ]);
  });

  it("orders the dates of a day by their kind", () => {
    const b = abroad();
    b.settings(settingsOf({ renta_season_start: "03-31" }));
    const kinds = fiscalCalendar(b.build(), "2027-01-20").dates.map((entry) => entry.kind);
    expect(kinds.slice(0, 3)).toEqual(["season_start", "filing_deadline", "filing_deadline"]);
  });
});

describe("FILING_DEADLINES", () => {
  it("is one row per verified year, with its source, from 1 January to 31 March of the next", () => {
    expect(FILING_DEADLINES.filter((row) => row.model === "720").map((row) => row.year)).toEqual(
      Array.from({ length: 14 }, (_, index) => 2013 + index),
    );
    expect(FILING_DEADLINES.filter((row) => row.model === "721").map((row) => row.year)).toEqual([
      2023, 2024, 2025, 2026,
    ]);
    for (const row of FILING_DEADLINES) {
      expect(row.deadline).toBe(`${row.year + 1}-03-31`);
      expect(row.source.url.startsWith("https://www.boe.es/")).toBe(true);
      expect(row.source.checked).toBe("2026-10-04");
    }
  });

  it("verifies the years whose 31 March is a working day and only those", () => {
    const weekend = (deadline: string): boolean =>
      [0, 6].includes(new Date(`${deadline}T00:00:00Z`).getUTCDay());
    for (const row of FILING_DEADLINES) {
      expect(row.verified, `${row.model} ${row.year}`).toBe(!weekend(row.deadline));
      // An unverified row says why, with the day the general rule would give; a verified one says nothing.
      expect(row.note !== undefined).toBe(!row.verified);
    }
    expect(
      FILING_DEADLINES.filter((row) => !row.verified).map((row) => `${row.model}-${row.year}`),
    ).toEqual(["720-2017", "720-2018", "720-2023", "721-2023"]);
    const note = FILING_DEADLINES.find((row) => row.model === "720" && row.year === 2017)?.note;
    expect(note).toContain("2018-04-02");
    expect(note).toContain("Ley 39/2015");
  });
});

describe("fiscalCalendar: no amount, ever", () => {
  it("carries only dates, names and ids", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    cycle(b, "50", "2027-06-10");
    const text = JSON.stringify(fiscalCalendar(b.build(), "2027-07-01"));
    expect(text).not.toMatch(/amount|eur|[0-9]+\.[0-9]+/i);
    expect(text).not.toContain("-500");
  });
});
