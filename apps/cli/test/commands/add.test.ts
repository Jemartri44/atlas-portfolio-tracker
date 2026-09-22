import { describe, expect, it } from "vitest";
import { BUY_GOLD, BUY_WORLD, harness, seed } from "../harness.js";

describe("atlas add buy|sell: the wash-sale warning before confirming", () => {
  /** Buys 10 of the fund, sells 6 at a loss (4 stay: #18), and buys again later. */
  const cycle = async () => {
    const h = harness({ events: seed(), confirm: true });
    const trade = (type: string, date: string, price: string, quantity = "10") => [
      "add",
      type,
      "--account",
      "acc_fund",
      "--asset",
      "ast_world",
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
      "--yes",
    ];
    expect(await h.exec(trade("buy", "2027-01-11", "10"))).toBe(0);
    h.reset();
    expect(await h.exec(trade("sell", "2027-02-10", "8", "6"))).toBe(0);
    // The sale itself warns about the purchase inside the previous window that
    // it leaves in the portfolio, names it by its date and by what of it is
    // still held (10 bought, 6 sold), and the window that actually applies: a
    // fund has one year, not two months.
    expect(h.text()).toContain("cuando siguen en cartera 4 títulos de una compra del 2027-01-11");
    expect(h.text()).toContain("ventana de un año");
    expect(h.text()).toContain("puede no ser computable en 2027");
    h.reset();
    return { h, trade };
  };

  it("warns before the question when the repurchase falls inside the window", async () => {
    const { h, trade } = await cycle();
    expect(await h.exec(trade("buy", "2027-06-01", "8", "5"))).toBe(0);
    const text = h.text();
    // The purchase by its date and quantity, the sale by its asset and date, the
    // year with its number, and no internal identifier in the sentence.
    expect(text).toContain(
      "Compra del 2027-06-01 de 5 títulos de ast_world dentro de la ventana de su venta con pérdida del 2027-02-10",
    );
    expect(text).toContain("2028-02-10");
    expect(text).toContain("no sea computable en 2027");
    expect(text).toContain("atlas tax 2027");
    expect(text).not.toMatch(/ventana de la venta 01[0-9A-Z]{24}/);
    // The window is a year (ADR-0014): calling it "the two-month rule" next to a
    // date a year away contradicted the date and was fiscally false.
    expect(text).toContain("ventana de un año");
    expect(text).not.toContain("regla de los dos meses");
    // The warning comes before the confirmation, not after the write.
    expect(text.indexOf("Compra del 2027-06-01")).toBeLessThan(text.indexOf("Registrado"));
  });

  it("does not warn when the repurchase is outside the window, and never blocks", async () => {
    const { h, trade } = await cycle();
    expect(await h.exec(trade("buy", "2028-03-01", "8", "5"))).toBe(0);
    expect(h.text()).not.toContain("dentro de la ventana de su venta con pérdida");
    expect(h.text()).toContain("Registrado");
    // Even inside the window the purchase is recorded: it is a warning, not a rejection.
    const { events } = await h.store.load();
    expect(events.filter((event) => event.type === "buy")).toHaveLength(2);
  });
});

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
        "2027-01-11",
        "--value-date",
        "2027-01-11",
        "--quantity",
        "1e3",
        "--unit-price",
        "1",
        "--currency",
        "EUR",
        "--fx-rate",
        "1",
        "--fx-rate-date",
        "2027-01-11",
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
        "2027-01-11",
        "--value-date",
        "2027-01-11",
        "--quantity",
        "1",
        "--unit-price",
        "1",
        "--currency",
        "EUR",
        "--fx-rate",
        "1",
        "--fx-rate-date",
        "2027-01-11",
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
        "2027-01-11",
        "--value-date",
        "2027-01-11",
        "--quantity",
        "1",
        "--currency",
        "EUR",
        "--fx-rate",
        "1",
        "--fx-rate-date",
        "2027-01-11",
        "--yes",
      ]),
    ).toBe(1);
    expect(h.text()).toContain("unit_price");
    // `swap` used to be the example of a subcommand that does not exist. It
    // does now (feature 008), so the example has to be one that really does not.
    expect(await h.exec(["add", "barter"])).toBe(64);
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
        // Required since ADR-0021, in euros too: the date of the rate applied.
        "--fx-rate-date",
        "2026-08-31",
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
        "--fx-rate-date",
        "2027-06-01",
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
        "--fx-rate-date",
        "2027-06-30",
        "--description",
        "custodia",
        "--fee-kind",
        "custody",
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
        "2027-05-04",
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
        "2027-05-04",
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
        // Feature 005: the date of the rate, without which a 31/12 valuation is
        // not reproducible from the ECB table (31/12/2026 was a Thursday).
        "--fx-rate-date",
        "2026-12-31",
      ],
    ];
    for (const argv of cases) {
      expect(await h.exec([...argv, "--yes"]), argv[1]).toBe(0);
    }
    expect((await h.store.load()).events).toHaveLength(5 + cases.length);
    const valuation = (await h.store.load()).events.at(-1) as { fx_rate_date?: string };
    expect(valuation.fx_rate_date).toBe("2026-12-31");
  });
});

/**
 * A swap is neither a buy nor a transfer, and the CLI has to make that visible
 * before the user confirms: it is a disposal and an acquisition at once, so
 * both halves of the wash-sale rule can fire on the same event (ADR-0021).
 */
describe("atlas add swap", () => {
  const swap = (overrides: string[] = []) => [
    "add",
    "swap",
    "--account",
    "acc_etf",
    "--trade-date",
    "2027-06-10",
    "--value-date",
    "2027-06-10",
    "--from-asset",
    "ast_gold",
    "--quantity-out",
    "2",
    "--market-value-out",
    "380",
    "--to-asset",
    "ast_world",
    "--quantity-in",
    "3",
    "--market-value-in",
    "400",
    "--currency",
    "EUR",
    "--fx-rate",
    "1",
    "--fx-rate-date",
    "2027-06-10",
    ...overrides,
    "--yes",
  ];

  it("records the disposal and the acquisition, valued by the greater of the two", async () => {
    const h = harness({ events: seed(), confirm: true });
    expect(await h.exec(BUY_GOLD)).toBe(0);
    h.reset();
    expect(await h.exec(swap())).toBe(0);
    const { events } = await h.store.load();
    const written = events[events.length - 1] as unknown as Record<string, unknown>;
    expect(written.type).toBe("swap");
    expect(written.market_value_out).toBe("380");
    expect(written.market_value_in).toBe("400");
    expect(written.fee).toBe("0");
    expect(written.source).toBe("manual");
  });

  it("refuses a swap of an asset for itself, in Spanish", async () => {
    const h = harness({ events: seed(), confirm: true });
    expect(await h.exec(BUY_GOLD)).toBe(0);
    h.reset();
    expect(await h.exec(swap(["--to-asset", "ast_gold"]))).toBe(1);
    expect(h.text()).toContain("to_asset_id");
  });
});
