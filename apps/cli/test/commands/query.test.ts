import { describe, expect, it } from "vitest";
import { BUY_GOLD, BUY_WORLD, harness, SELL_GOLD, seed } from "../harness.js";

const populated = async () => {
  const h = harness({ events: seed() });
  for (const argv of [
    [
      "add",
      "cash-in",
      "--account",
      "acc_fund",
      "--value-date",
      "2026-08-31",
      "--amount",
      "5000",
      "--currency",
      "EUR",
      "--fx-rate",
      "1",
      "--yes",
    ],
    BUY_WORLD,
    BUY_GOLD,
    SELL_GOLD,
    [
      "add",
      "interest",
      "--account",
      "acc_etf",
      "--value-date",
      "2027-04-30",
      "--gross",
      "5",
      "--withholding-spain",
      "0.95",
      "--currency",
      "EUR",
      "--fx-rate",
      "1",
      "--fx-rate-date",
      "2027-04-30",
      "--yes",
    ],
  ]) {
    expect(await h.exec(argv)).toBe(0);
  }
  h.reset();
  return h;
};

describe("atlas queries", () => {
  it("shows positions, lots, cash, gains, income and a clean check", async () => {
    const h = await populated();
    expect(await h.exec(["positions"])).toBe(0);
    expect(h.text()).toContain("acc_fund  ast_world  10.123456");
    expect(h.text()).toContain("acc_etf   ast_gold   3");
    h.reset();
    expect(
      await h.exec(["positions", "--account", "acc_etf", "--asset", "ast_gold", "--json"]),
    ).toBe(0);
    expect(JSON.parse(h.out.join("\n"))).toHaveLength(1);
    h.reset();
    expect(await h.exec(["lots", "ast_gold"])).toBe(0);
    expect(h.text()).toContain("2026-12-30");
    expect(h.text()).toContain("923.0414746544");
    h.reset();
    expect(await h.exec(["lots", "--closed", "--json"])).toBe(0);
    expect(JSON.parse(h.out.join("\n"))).toHaveLength(2);
    h.reset();
    expect(await h.exec(["cash"])).toBe(0);
    expect(h.text()).toContain("acc_fund  EUR     4000");
    expect(h.text()).toContain("-582.5");
    h.reset();
    expect(await h.exec(["cash", "--account", "acc_etf", "--json"])).toBe(0);
    expect(
      JSON.parse(h.out.join("\n"))
        .map((c: { currency: string }) => c.currency)
        .sort(),
    ).toEqual(["EUR", "USD"]);
    h.reset();
    expect(await h.exec(["gains", "2026", "--lots"])).toBe(0);
    expect(h.text()).toContain("15.19");
    expect(h.text()).toContain("Total 2026: 15.19 EUR");
    h.reset();
    expect(await h.exec(["gains", "2027", "--json"])).toBe(0);
    expect(JSON.parse(h.out.join("\n"))).toEqual([]);
    h.reset();
    expect(await h.exec(["income", "2027"])).toBe(0);
    expect(h.text()).toContain("interest");
    expect(h.text()).toContain("4.05");
    h.reset();
    expect(await h.exec(["income", "2027", "--json"])).toBe(0);
    expect(JSON.parse(h.out.join("\n"))[0].net_eur).toBe("4.05");
    h.reset();
    expect(await h.exec(["check"])).toBe(0);
    expect(h.text()).toContain("Libro íntegro");
    h.reset();
    expect(await h.exec(["check", "--json"])).toBe(0);
    expect(JSON.parse(h.out.join("\n")).findings).toEqual([]);
    expect(await h.exec(["gains", "abc"])).toBe(64);
    expect(await h.exec(["income"])).toBe(64);
  });

  it("moves the gain to the settlement year after a settings change", async () => {
    const h = await populated();
    expect(await h.exec(["settings", "set", "--fiscal-date-rule", "etc=value_date", "--yes"])).toBe(
      0,
    );
    h.reset();
    expect(await h.exec(["gains", "2027"])).toBe(0);
    expect(h.text()).toContain("15.19");
  });

  it("lists valuations at a date and shows corporate action origins in lots and gains", async () => {
    const h = await populated();
    expect(
      await h.exec([
        "add",
        "valuation",
        "--account",
        "acc_etf",
        "--asset",
        "ast_gold",
        "--date",
        "2026-12-31",
        "--quantity",
        "3",
        "--unit-value",
        "210",
        "--currency",
        "USD",
        "--fx-rate",
        "1.09",
        "--yes",
      ]),
    ).toBe(0);
    h.reset();
    expect(await h.exec(["valuations", "--date", "2026-12-30"])).toBe(0);
    expect(h.text()).not.toContain("ast_gold");
    h.reset();
    expect(await h.exec(["valuations", "--date", "2027-01-15"])).toBe(0);
    expect(h.text()).toMatch(
      /acc_etf\s+ast_gold\s+2026-12-31\s+3\s+210\s+USD\s+1.09\s+577.9816513761/,
    );
    h.reset();
    expect(await h.exec(["valuations", "--json"])).toBe(0);
    expect(JSON.parse(h.out[0] as string)).toEqual([
      expect.objectContaining({ asset_id: "ast_gold", value_eur: "577.9816513761" }),
    ]);
    expect(
      await h.exec([
        "ca",
        "split",
        "--asset",
        "ast_gold",
        "--ratio",
        "2",
        "--effective-date",
        "2027-02-01",
        "--source-document",
        "doc",
        "--yes",
      ]),
    ).toBe(0);
    h.reset();
    expect(await h.exec(["lots"])).toBe(0);
    expect(h.text()).toMatch(/ast_gold\s+2026-12-30\s+6\s+5\s+.*\s+buy\s+/);
    h.reset();
    expect(await h.exec(["lots", "--json"])).toBe(0);
    expect(
      (JSON.parse(h.out[0] as string) as { origin: string }[]).map((lot) => lot.origin),
    ).toEqual(["buy", "buy"]);
  });

  it("reports integrity warnings and errors", async () => {
    const h = await populated();
    expect(await h.exec([...BUY_WORLD, "--confirm-duplicate"])).toBe(0);
    h.reset();
    expect(await h.exec(["check"])).toBe(0);
    expect(h.text()).toContain("duplicate_fingerprint");
    const broken = harness({
      events: [
        ...seed(),
        {
          schema_version: 1,
          id: "01ARYZ6S41TSV4RRFFQ69G5FZZ",
          recorded_at: "2026-09-01T18:00:00.000Z",
          type: "cash_deposit",
          account_id: "acc_missing",
          value_date: "2026-09-01",
          amount: "1",
          currency: "EUR",
          fx_rate: "1",
          fingerprint: "sha256:x",
        },
      ],
    });
    expect(await broken.exec(["check"])).toBe(1);
    expect(broken.text()).toContain("unknown_account");
    expect(await broken.exec(["positions"])).toBe(1);
    expect(broken.text()).toContain("acc_missing no existe");
  });
});
