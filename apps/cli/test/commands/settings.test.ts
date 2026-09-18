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
