import { describe, expect, it } from "vitest";
import { bucketSeed, harness } from "../harness.js";

const OPEN = [
  "thesis",
  "open",
  "--id",
  "th_spec_1",
  "--account",
  "acc_bucket",
  "--asset",
  "ast_spec",
  "--hypothesis",
  "Q3 above consensus",
  "--horizon-days",
  "90",
  "--invalidation",
  "Guidance cut",
  "--planned-size",
  "500",
  "--yes",
];

const trade = (side: "buy" | "sell", price: string, date: string, thesis?: string) => [
  "add",
  side,
  "--account",
  "acc_bucket",
  "--asset",
  "ast_spec",
  "--trade-date",
  date,
  "--value-date",
  date,
  "--quantity",
  "10",
  "--unit-price",
  price,
  "--fee",
  "1",
  "--currency",
  "USD",
  "--fx-rate",
  "1.1",
  "--fx-rate-date",
  date,
  ...(thesis === undefined ? [] : ["--thesis", thesis]),
  "--yes",
];

describe("atlas thesis", () => {
  it("rejects a bucket buy without thesis, citing rule 15", async () => {
    const h = harness({ events: bucketSeed() });
    expect(await h.exec(trade("buy", "50", "2027-07-01"))).toBe(1);
    expect(h.text()).toContain("regla 15");
    expect(h.text()).toContain("atlas thesis open");
  });

  it("opens, buys and sells with --thesis, closes and lists the derived metrics", async () => {
    const h = harness({ events: bucketSeed(), instant: "2027-07-01T10:00:00.000Z" });
    expect(await h.exec(OPEN)).toBe(0);
    expect(await h.exec(trade("buy", "50", "2027-07-01", "th_spec_1"))).toBe(0);
    h.reset();
    expect(await h.exec(["thesis", "list", "--at", "2027-07-31"])).toBe(0);
    expect(h.text()).toMatch(
      /th_spec_1\s+acc_bucket\s+ast_spec\s+abierta\s+2027-07-01\s+30\s+90\s+455.4545454545\s+0\s+0.91\s+10\s+500/,
    );
    expect(await h.exec(trade("sell", "60", "2027-09-01", "th_spec_1"))).toBe(0);
    expect(await h.exec(["thesis", "close", "th_spec_1", "--notes", "played out", "--yes"])).toBe(
      0,
    );
    h.reset();
    expect(await h.exec(["thesis", "list"])).toBe(0);
    expect(h.text()).not.toContain("th_spec_1");
    h.reset();
    expect(await h.exec(["thesis", "list", "--closed", "--json"])).toBe(0);
    const [row] = JSON.parse(h.out[0] as string) as Record<string, unknown>[];
    expect(row).toMatchObject({
      thesis_id: "th_spec_1",
      status: "closed",
      closing_notes: "played out",
      invested_eur: "455.4545454545",
      result_eur_rounded: "89.09",
      fees_eur: "1.8181818182",
      position: "0",
      days_open: 0,
    });
    const events = (await h.store.load()).events;
    expect(events.map((e) => e.type).slice(-4)).toEqual([
      "thesis_opened",
      "buy",
      "sell",
      "thesis_closed",
    ]);
    expect((events[events.length - 4] as Record<string, unknown>).expected_horizon_days).toBe(90);
  });

  it("warns on a sale without thesis and on closing with a live position", async () => {
    const h = harness({ events: bucketSeed() });
    expect(await h.exec(OPEN)).toBe(0);
    expect(await h.exec(trade("buy", "50", "2027-07-01", "th_spec_1"))).toBe(0);
    h.reset();
    expect(await h.exec(trade("sell", "60", "2027-09-01"))).toBe(0);
    expect(h.text()).toContain("sell_without_thesis");
    expect(await h.exec(trade("buy", "50", "2027-09-02", "th_spec_1"))).toBe(0);
    h.reset();
    expect(await h.exec(["thesis", "close", "th_spec_1", "--notes", "early", "--yes"])).toBe(0);
    expect(h.text()).toContain("thesis_closed_with_position");
    h.reset();
    expect(await h.exec(trade("buy", "50", "2027-09-03", "th_spec_1"))).toBe(1);
    expect(h.text()).toContain("no está abierta");
  });

  it("validates usage: horizon must be an integer, actions and ids are required", async () => {
    const h = harness({ events: bucketSeed() });
    expect(await h.exec([...OPEN.slice(0, -1), "--horizon-days", "90.5", "--yes"])).toBe(64);
    expect(await h.exec(["thesis", "close", "--notes", "x", "--yes"])).toBe(64);
    expect(await h.exec(["thesis", "bogus"])).toBe(64);
    expect(await h.exec(["thesis", "open", "--id", "th", "--yes"])).toBe(64);
    expect(await h.exec(["thesis", "close", "th_nope", "--notes", "x", "--yes"])).toBe(1);
    expect(h.text()).toContain("no existe");
  });
});
