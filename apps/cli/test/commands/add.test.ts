import { describe, expect, it } from "vitest";
import { BUY_GOLD, BUY_WORLD, harness, seed } from "../harness.js";

describe("atlas add", () => {
  it("previews, confirms and records a buy with amount as cost basis", async () => {
    const h = harness({ events: seed(), confirm: true });
    expect(await h.exec(BUY_WORLD.filter((arg) => arg !== "--yes"))).toBe(0);
    expect(h.text()).toContain("Registrado buy");
    const events = (await h.store.load()).events;
    const buy = events[events.length - 1] as Record<string, unknown>;
    expect(buy.amount).toBe("1000");
    expect("unit_price" in buy).toBe(false);
    expect(buy.fee).toBe("0");
    expect(buy.source).toBe("manual");
    expect(buy.fingerprint).toMatch(/^sha256:/);
  });

  it("stops on declined confirmation and on missing terminal", async () => {
    const declined = harness({ events: seed(), confirm: false });
    expect(await declined.exec(BUY_WORLD.filter((arg) => arg !== "--yes"))).toBe(0);
    expect(declined.text()).toContain("Cancelado.");
    expect((await declined.store.load()).events).toHaveLength(5);
    const noTty = harness({ events: seed() });
    expect(await noTty.exec(BUY_WORLD.filter((arg) => arg !== "--yes"))).toBe(4);
    expect(noTty.text()).toContain("--yes");
  });

  it("treats a repeated fingerprint as a warning that needs confirmation", async () => {
    const h = harness({ events: seed() });
    expect(await h.exec(BUY_WORLD)).toBe(0);
    expect(await h.exec(BUY_WORLD)).toBe(3);
    expect(h.text()).toContain("--confirm-duplicate");
    expect(await h.exec([...BUY_WORLD, "--confirm-duplicate"])).toBe(0);
    expect((await h.store.load()).events).toHaveLength(7);
  });

  it("reports validation and projection errors in Spanish with exit code 1", async () => {
    const h = harness({ events: seed() });
    expect(
      await h.exec([
        "add",
        "buy",
        "--account",
        "acc_fund",
        "--asset",
        "ast_world",
        "--trade-date",
        "2027-01-10",
        "--value-date",
        "2027-01-10",
        "--quantity",
        "1e3",
        "--unit-price",
        "1",
        "--currency",
        "EUR",
        "--fx-rate",
        "1",
        "--fx-rate-date",
        "2027-01-10",
        "--yes",
      ]),
    ).toBe(1);
    expect(h.text()).toContain("quantity");
    h.reset();
    expect(
      await h.exec([
        "add",
        "sell",
        "--account",
        "acc_fund",
        "--asset",
        "ast_world",
        "--trade-date",
        "2027-01-10",
        "--value-date",
        "2027-01-10",
        "--quantity",
        "1",
        "--unit-price",
        "1",
        "--currency",
        "EUR",
        "--fx-rate",
        "1",
        "--fx-rate-date",
        "2027-01-10",
        "--yes",
      ]),
    ).toBe(1);
    expect(h.text()).toContain("no tiene suficiente ast_world");
    h.reset();
    expect(
      await h.exec([
        "add",
        "buy",
        "--account",
        "acc_fund",
        "--asset",
        "ast_world",
        "--trade-date",
        "2027-01-10",
        "--value-date",
        "2027-01-10",
        "--quantity",
        "1",
        "--currency",
        "EUR",
        "--fx-rate",
        "1",
        "--fx-rate-date",
        "2027-01-10",
        "--yes",
      ]),
    ).toBe(1);
    expect(h.text()).toContain("unit_price");
    expect(await h.exec(["add", "swap"])).toBe(64);
    expect(await h.exec(["add", "buy", "--bogus", "1", "--yes"])).toBe(64);
  });

  it("prints warnings of the recorded event", async () => {
    const h = harness({ events: seed() });
    expect(await h.exec([...BUY_GOLD.slice(0, -1), "--fx-rate-date", "2027-01-05", "--yes"])).toBe(
      0,
    );
    expect(h.text()).toContain("Aviso (fx_rate_date_after_fiscal_date)");
  });

  it("records every other operation type", async () => {
    const h = harness({ events: seed() });
    const cases = [
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
      ],
      [
        "add",
        "cash-out",
        "--account",
        "acc_fund",
        "--value-date",
        "2027-06-01",
        "--amount",
        "100",
        "--currency",
        "EUR",
        "--fx-rate",
        "1",
      ],
      [
        "add",
        "fee",
        "--account",
        "acc_fund",
        "--value-date",
        "2027-06-30",
        "--amount",
        "3",
        "--currency",
        "EUR",
        "--fx-rate",
        "1",
        "--description",
        "custodia",
      ],
      [
        "add",
        "dividend",
        "--account",
        "acc_etf",
        "--asset",
        "ast_gold",
        "--value-date",
        "2027-04-01",
        "--gross",
        "10",
        "--withholding-origin",
        "1.5",
        "--withholding-spain",
        "1.9",
        "--currency",
        "USD",
        "--fx-rate",
        "1.085",
        "--fx-rate-date",
        "2027-04-01",
      ],
      [
        "add",
        "interest",
        "--account",
        "acc_etf",
        "--value-date",
        "2027-04-30",
        "--gross",
        "5",
        "--currency",
        "EUR",
        "--fx-rate",
        "1",
        "--fx-rate-date",
        "2027-04-30",
      ],
      [
        "add",
        "fx",
        "--account",
        "acc_etf",
        "--value-date",
        "2027-05-02",
        "--sold-amount",
        "1085",
        "--sold-currency",
        "EUR",
        "--bought-amount",
        "1170",
        "--bought-currency",
        "USD",
        "--fee-currency",
        "USD",
        "--fx-rate-sold",
        "1",
        "--fx-rate-bought",
        "1.0783",
        "--fx-rate-date",
        "2027-05-02",
      ],
      [
        "add",
        "valuation",
        "--account",
        "acc_etf",
        "--asset",
        "ast_gold",
        "--date",
        "2026-12-31",
        "--quantity",
        "5",
        "--unit-value",
        "210",
        "--currency",
        "USD",
        "--fx-rate",
        "1.09",
      ],
    ];
    for (const argv of cases) {
      expect(await h.exec([...argv, "--yes"]), argv[1]).toBe(0);
    }
    expect((await h.store.load()).events).toHaveLength(5 + cases.length);
  });
});
