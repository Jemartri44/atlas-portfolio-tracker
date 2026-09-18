// atlas settings set: the two guards of ADR-0015 and of constitution IV.

import { DEFAULT_SETTINGS, type LedgerEvent } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { EXIT } from "../../src/context.js";
import { harness, seed } from "../harness.js";

const DATE = "2027-06-30";

const settingsEvent = (id: string, settings: Record<string, unknown>) => ({
  schema_version: 1 as const,
  id,
  recorded_at: "2026-09-01T17:00:00.000Z",
  type: "settings_changed" as const,
  settings: { ...DEFAULT_SETTINGS, ...settings },
});

/** ast_world at 100 % of the core against a target of 60 %: a live 40 pp deviation. */
const deviating = async (threshold: string) => {
  const h = harness({
    events: [
      ...seed(),
      settingsEvent("01ARYZ6S41TSV4RRFFQ69G5SET", {
        target_weights: { ast_world: "60", ast_bonds: "40" },
        deviation_threshold_pp: threshold,
        bucket_pct_of_contribution: "10",
      }),
    ],
    confirm: true,
    instant: `${DATE}T10:00:00.000Z`,
  });
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
      "2027-01-12",
      "--quantity",
      "10",
      "--unit-price",
      "100",
      "--currency",
      "EUR",
      "--fx-rate",
      "1",
      "--fx-rate-date",
      "2027-01-12",
      "--yes",
    ]),
  ).toBe(0);
  expect(
    await h.exec([
      "add",
      "valuation",
      "--account",
      "acc_fund",
      "--asset",
      "ast_world",
      "--date",
      DATE,
      "--quantity",
      "10",
      "--unit-value",
      "100",
      "--currency",
      "EUR",
      "--fx-rate",
      "1",
      "--yes",
    ]),
  ).toBe(0);
  h.reset();
  return h;
};

describe("atlas settings set: a threshold that silences a live warning", () => {
  it("lists what it silences and asks before writing", async () => {
    const h = await deviating("5");
    expect(await h.exec(["settings", "set", "--deviation-threshold-pp", "50"])).toBe(0);
    expect(h.text()).toContain("Este cambio silencia avisos activos:");
    expect(h.text()).toContain("deviation_above_threshold");
    expect(h.text()).toContain("ast_world");
    expect(h.text()).toContain("Registrado settings_changed");
  });

  it("does not write when the user declines", async () => {
    const source = await deviating("5");
    const { lines } = await source.store.load();
    const h = harness({ lines: [...lines], confirm: false, instant: `${DATE}T10:00:00.000Z` });
    expect(await h.exec(["settings", "set", "--deviation-threshold-pp", "50"])).toBe(0);
    expect(h.text()).toContain("Cancelado.");
    expect((await h.store.load()).lines).toHaveLength(lines.length);
  });

  it("says nothing when the change silences no warning", async () => {
    const h = await deviating("5");
    expect(await h.exec(["settings", "set", "--stale-price-days", "9"])).toBe(0);
    expect(h.text()).not.toContain("silencia avisos");
  });

  it("says it could not check when a price is missing, and continues", async () => {
    const h = harness({
      events: [
        ...seed(),
        settingsEvent("01ARYZ6S41TSV4RRFFQ69G5SET", {
          target_weights: { ast_world: "60", ast_bonds: "40" },
          deviation_threshold_pp: "5",
        }),
      ],
      confirm: true,
      instant: `${DATE}T10:00:00.000Z`,
    });
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
        "2027-01-12",
        "--quantity",
        "10",
        "--unit-price",
        "100",
        "--currency",
        "EUR",
        "--fx-rate",
        "1",
        "--fx-rate-date",
        "2027-01-12",
        "--yes",
      ]),
    ).toBe(0);
    h.reset();
    expect(await h.exec(["settings", "set", "--deviation-threshold-pp", "50"])).toBe(0);
    expect(h.text()).toContain("No se han podido evaluar los avisos");
    expect(h.text()).toContain("ast_world");
    expect(h.text()).toContain("Registrado settings_changed");
  });
});

describe("atlas settings set: the legacy wash-sale window", () => {
  it("writes only the new form over a ledger that carries the old one", async () => {
    const { wash_sale_window: _window, ...withoutWindow } = DEFAULT_SETTINGS;
    const legacy = {
      schema_version: 1 as const,
      id: "01ARYZ6S41TSV4RRFFQ69G5SET",
      recorded_at: "2026-09-01T17:00:00.000Z",
      type: "settings_changed" as const,
      settings: {
        ...withoutWindow,
        wash_sale_window_days: {
          stock: 61,
          etc: 61,
          etp: 61,
          crypto: 365,
          fund: 365,
          money_market: 365,
        },
      },
    };
    const h = harness({ events: [...seed(), legacy as unknown as LedgerEvent], confirm: true });
    expect(await h.exec(["settings", "set", "--stale-price-days", "9"])).toBe(0);
    const { events } = await h.store.load();
    const written = events[events.length - 1] as unknown as {
      settings: Record<string, unknown> & { wash_sale_window: Record<string, string> };
    };
    expect("wash_sale_window_days" in written.settings).toBe(false);
    expect(written.settings.wash_sale_window.fund).toBe("365d");
    // The old line is untouched: the ledger is append-only.
    expect(
      (events[events.length - 2] as unknown as { settings: Record<string, unknown> }).settings,
    ).toEqual(legacy.settings);
  });
});

describe("atlas settings set: a change that moves a past tax year", () => {
  /** A sale agreed on 30/12/2027 and settled on 02/01/2028. */
  const straddling = async (confirm = true) => {
    // Standing in 2029: 2027 and 2028 are both over, so both may have been filed.
    const h = harness({ events: seed(), confirm, instant: "2029-03-01T10:00:00.000Z" });
    const trade = (type: string, trade_date: string, value_date: string, price: string) => [
      "add",
      type,
      "--account",
      "acc_fund",
      "--asset",
      "ast_world",
      "--trade-date",
      trade_date,
      "--value-date",
      value_date,
      "--quantity",
      "10",
      "--unit-price",
      price,
      "--currency",
      "EUR",
      "--fx-rate",
      "1",
      "--fx-rate-date",
      trade_date,
      "--yes",
    ];
    expect(await h.exec(trade("buy", "2027-01-11", "2027-01-13", "10"))).toBe(0);
    expect(await h.exec(trade("sell", "2027-12-30", "2028-01-03", "13"))).toBe(0);
    h.reset();
    return h;
  };

  it("lists the years that move, with both figures, and asks before writing", async () => {
    const h = await straddling();
    expect(await h.exec(["settings", "set", "--fiscal-date-rule", "fund=trade_date"])).toBe(0);
    const text = h.text();
    expect(text).toContain("mueve las ganancias realizadas de ejercicios anteriores");
    expect(text).toContain("2027");
    expect(text).toContain("2028");
    expect(text).toContain("Puede afectar a una declaración ya presentada");
    expect(text).toContain("Registrado");
  });

  it("does not write when the user declines", async () => {
    // The setup uses --yes; only the settings change goes through the question.
    const h = await straddling(false);
    expect(await h.exec(["settings", "set", "--fiscal-date-rule", "fund=trade_date"])).toBe(0);
    expect(h.text()).toContain("Cancelado");
    const { events } = await h.store.load();
    expect(events.filter((event) => event.type === "settings_changed")).toHaveLength(0);
  });

  it("says nothing when the change moves no past year", async () => {
    const h = await straddling();
    expect(await h.exec(["settings", "set", "--stale-price-days", "9"])).toBe(0);
    expect(h.text()).not.toContain("mueve las ganancias realizadas");
  });
});

describe("atlas settings set: the bucket benchmark", () => {
  it("writes the asset_id without checking the catalogue: the asset may come later", async () => {
    const h = harness({ events: seed(), confirm: true });
    expect(await h.exec(["settings", "set", "--bucket-benchmark-asset", "ast_not_yet"])).toBe(0);
    const { events } = await h.store.load();
    const written = events[events.length - 1] as unknown as {
      settings: { bucket_benchmark_asset_id?: string };
    };
    expect(written.settings.bucket_benchmark_asset_id).toBe("ast_not_yet");
  });

  it("rejects an empty asset_id in Spanish, naming the parameter", async () => {
    const h = harness({ events: seed(), confirm: true });
    expect(await h.exec(["settings", "set", "--bucket-benchmark-asset", ""])).toBe(EXIT.domain);
    expect(h.err.join("\n")).toContain(
      "El parámetro bucket_benchmark_asset_id no admite ese valor",
    );
    expect((await h.store.load()).events).toHaveLength(seed().length);
  });

  it("rejects a threshold out of range in Spanish, with the range", async () => {
    const h = harness({ events: seed(), confirm: true });
    expect(await h.exec(["settings", "set", "--bucket-stop-loss-pct", "120"])).toBe(EXIT.domain);
    expect(h.err.join("\n")).toContain(
      "El parámetro bucket_stop_loss_pct debe ser un valor entre 0 y 100 (recibido: 120)",
    );
  });
});

describe("atlas settings set: assignments keyed by asset type", () => {
  it("rejects a type the enum does not have, instead of writing a map nobody reads", async () => {
    const h = harness({ events: seed(), confirm: true });
    expect(await h.exec(["settings", "set", "--fiscal-date-rule", "stcok=trade_date"])).toBe(64);
    expect(h.err.join("\n")).toContain("no es un tipo de activo");
    expect(await h.exec(["settings", "set", "--wash-sale-window", "bond=2m"])).toBe(64);
    // The ledger tolerates a partial map (ADR-0018), so a typo would otherwise
    // be written and silently ignored for ever.
    expect((await h.store.load()).events).toHaveLength(seed().length);
  });

  it("accepts the types the enum does have, including the new etf", async () => {
    const h = harness({ events: seed(), confirm: true });
    expect(await h.exec(["settings", "set", "--wash-sale-window", "etf=2m,fund=1y"])).toBe(0);
    const { events } = await h.store.load();
    const written = events[events.length - 1] as unknown as {
      settings: { wash_sale_window: Record<string, string> };
    };
    expect(written.settings.wash_sale_window.etf).toBe("2m");
  });

  /**
   * ADR-0021: the category is stored and nothing reads it yet, so the only way
   * to check it works is that it can be written, comes back, and leaves every
   * other type on its default.
   */
  it("sets the income category of one asset type and leaves the rest on their default", async () => {
    const h = harness({ events: seed(), confirm: true });
    expect(await h.exec(["settings", "set", "--income-category", "etc=movable_capital"])).toBe(0);
    const { events } = await h.store.load();
    const written = events[events.length - 1] as unknown as {
      settings: { income_category: Record<string, string> };
    };
    expect(written.settings.income_category.etc).toBe("movable_capital");
    expect(written.settings.income_category.fund).toBe("capital_gain");
  });

  it("rejects a category the enumeration does not have", async () => {
    const h = harness({ events: seed(), confirm: true });
    expect(await h.exec(["settings", "set", "--income-category", "etc=rendimiento"])).toBe(1);
    expect((await h.store.load()).events).toHaveLength(seed().length);
  });
});

describe("atlas settings set: a change that reinterprets the past (ADR-0015)", () => {
  /** The buy settles after the sale was agreed: reading funds by trade date puts the sale first. */
  const reorderable = async () => {
    const h = harness({ events: seed(), confirm: true });
    expect(
      await h.exec([
        "add",
        "buy",
        "--account",
        "acc_fund",
        "--asset",
        "ast_world",
        "--trade-date",
        "2027-01-13",
        "--value-date",
        "2027-01-15",
        "--quantity",
        "10",
        "--unit-price",
        "100",
        "--currency",
        "EUR",
        "--fx-rate",
        "1",
        "--fx-rate-date",
        "2027-01-15",
        "--yes",
      ]),
    ).toBe(0);
    expect(
      await h.exec([
        "add",
        "sell",
        "--account",
        "acc_fund",
        "--asset",
        "ast_world",
        "--trade-date",
        "2027-01-12",
        "--value-date",
        "2027-01-20",
        "--quantity",
        "10",
        "--unit-price",
        "110",
        "--currency",
        "EUR",
        "--fx-rate",
        "1",
        "--fx-rate-date",
        "2027-01-20",
        "--yes",
      ]),
    ).toBe(0);
    h.reset();
    return h;
  };

  it("refuses without --accept-invalid, listing the events that become invalid", async () => {
    const h = await reorderable();
    const before = (await h.store.load()).lines.length;
    expect(await h.exec(["settings", "set", "--fiscal-date-rule", "fund=trade_date"])).toBe(
      EXIT.domain,
    );
    expect(h.text()).toContain("Eventos que pasan a ser inválidos");
    expect(h.text()).toContain("--accept-invalid");
    expect(h.text()).toContain("sell");
    expect((await h.store.load()).lines).toHaveLength(before);
  });

  it("writes with --accept-invalid and says the queries will warn", async () => {
    const h = await reorderable();
    expect(
      await h.exec([
        "settings",
        "set",
        "--fiscal-date-rule",
        "fund=trade_date",
        "--accept-invalid",
      ]),
    ).toBe(0);
    expect(h.text()).toContain("quedan inválidos");
    h.reset();
    expect(await h.exec(["positions"])).toBe(0);
    expect(h.text()).toContain("evento inválido");
  });

  it("does not admit --accept-invalid on any other event", async () => {
    const h = await reorderable();
    expect(
      await h.exec([
        "add",
        "cash-in",
        "--account",
        "acc_fund",
        "--value-date",
        "2027-03-01",
        "--amount",
        "100",
        "--currency",
        "EUR",
        "--fx-rate",
        "1",
        "--accept-invalid",
        "--yes",
      ]),
    ).toBe(EXIT.domain);
    expect(h.text()).toContain("--accept-invalid solo se admite");
  });
});
