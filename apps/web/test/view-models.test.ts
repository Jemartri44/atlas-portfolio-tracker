// The presentation logic: the order of the attention list, the mapping of a
// ledger entry to a row, the breakdown of the patrimony and the form specs.
// All of it pure, so it is tested without painting anything (Q8).

import {
  Decimal,
  knownFieldsOf,
  ledgerEntries,
  Money,
  netWorth,
  projectLedger,
  type SupportedEvent,
  settingsAt,
  type Warning,
} from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { nameIndex } from "../src/format/names.js";
import {
  ENVELOPE_FIELDS,
  FORM_SPECS,
  initialValues,
  isVisible,
  missingRequired,
  normaliseDecimal,
  toDraft,
  valuesOfEvent,
} from "../src/view-models/forms/index.js";
import {
  ATTENTION_CODES,
  attentionDestination,
  attentionItems,
  candidateSettings,
  detailView,
  movementRow,
  movementRows,
  netWorthView,
  perAssetTypeValue,
  SETTINGS_NUMBERS,
  SETTINGS_TEXTS,
  settingsTouched,
  settingValue,
  targetWeightTotal,
  weightValues,
  withNumber,
  withOption,
  withPerAssetType,
  withText,
} from "../src/view-models/index.js";
import { goldenEvents } from "./helpers/golden.js";

const warning = (code: string, details: Record<string, unknown> = {}): Warning => ({
  code,
  event_id: "01ARYZ6S41TSV4RRFFQ6900001",
  message: `english message for ${code}`,
  details,
});

describe("attentionItems", () => {
  it("puts the ledger being degraded first, above every rule of the plan", () => {
    const items = attentionItems({
      invalidCount: 2,
      warnings: [
        warning("deviation_above_threshold", { asset_id: "ast_world", deviation_pp: "9" }),
      ],
      findings: [],
      openOrders: [],
      openTransfers: [],
    });
    expect(items[0]?.code).toBe("invalid_events");
    expect(items[0]?.severity).toBe("error");
    expect(items[0]?.message).toContain("2 eventos inválidos");
    expect(items[0]?.action.to).toBe("/ajustes/verificacion");
  });

  it("orders by severity first and by importance inside it", () => {
    const items = attentionItems({
      invalidCount: 0,
      warnings: [
        warning("stale_price", { asset_id: "ast_world", age_days: 40, date: "2027-01-01" }),
        warning("bucket_stop_loss_reached", {
          loss_eur: "100",
          loss_pct: "30",
          gross_eur: "300",
          limit_pct: "25",
        }),
        warning("deviation_above_threshold", {
          asset_id: "ast_world",
          deviation_pp: "9",
          threshold_pp: "5",
        }),
      ],
      findings: [],
      openOrders: [],
      openTransfers: [],
    });
    expect(items.map((item) => item.code)).toEqual([
      "bucket_stop_loss_reached",
      "deviation_above_threshold",
      "stale_price",
    ]);
  });

  it("says nothing calmly when there is nothing", () => {
    expect(
      attentionItems({
        invalidCount: 0,
        warnings: [],
        findings: [],
        openOrders: [],
        openTransfers: [],
      }),
    ).toEqual([]);
  });

  it("does not repeat the same warning about the same subject", () => {
    const repeated = warning("stale_price", { asset_id: "ast_world", age_days: 40 });
    const items = attentionItems({
      invalidCount: 0,
      warnings: [repeated, { ...repeated }],
      findings: [],
      openOrders: [],
      openTransfers: [],
    });
    expect(items).toHaveLength(1);
  });

  it("counts the pending orders and transfers, with the age of the oldest", () => {
    const items = attentionItems({
      invalidCount: 0,
      warnings: [],
      findings: [],
      openOrders: [{ days_open: 3 } as never, { days_open: 40 } as never],
      openTransfers: [{ days_open: 12 } as never],
    });
    expect(items.map((item) => item.code)).toEqual(["pending_orders", "pending_transfers"]);
    expect(items[0]?.message).toContain("40 días");
    expect(items[1]?.message).toContain("12 días");
  });

  it("nags about the export only when it is due, and says when it never happened", () => {
    const never = attentionItems({
      invalidCount: 0,
      warnings: [],
      findings: [],
      openOrders: [],
      openTransfers: [],
      exportOverdueDays: "never",
    });
    expect(never[0]?.code).toBe("export_overdue");
    expect(never[0]?.message).toContain("nunca");
    const late = attentionItems({
      invalidCount: 0,
      warnings: [],
      findings: [],
      openOrders: [],
      openTransfers: [],
      exportOverdueDays: 20,
    });
    expect(late[0]?.message).toContain("20 días");
  });

  it("carries the integrity findings with their events", () => {
    const items = attentionItems({
      invalidCount: 0,
      warnings: [],
      findings: [
        {
          severity: "error",
          code: "negative_position",
          message: "acc|ast is -1",
          event_ids: ["01ARYZ6S41TSV4RRFFQ6900002"],
        },
      ],
      openOrders: [],
      openTransfers: [],
    });
    expect(items[0]?.code).toBe("integrity_finding");
    expect(items[0]?.message).toContain("negative_position");
    expect(items[0]?.message).toContain("01ARYZ6S41TSV4RRFFQ6900002");
  });

  /** SC-008: every warning shown leads to the screen where it is fixed. */
  it("has a destination for every code it can show", () => {
    const orphan = ATTENTION_CODES.filter((code) => attentionDestination(code) === undefined);
    expect(orphan).toEqual([]);
  });

  it("falls back to a destination instead of an unreachable warning", () => {
    const items = attentionItems({
      invalidCount: 0,
      warnings: [warning("un_codigo_que_no_conozco")],
      findings: [],
      openOrders: [],
      openTransfers: [],
    });
    expect(items[0]?.action.to).toBe("/movimientos");
    // Unknown code: the domain message survives instead of being swallowed.
    expect(items[0]?.message).toContain("english message");
  });
});

describe("movementRows", () => {
  const rows = () => {
    const events = goldenEvents();
    const state = projectLedger(events, { collectErrors: true });
    return movementRows(ledgerEntries(state, events));
  };

  it("shows every event of the golden ledger, newest first", () => {
    const all = rows();
    expect(all.length).toBe(goldenEvents().length);
    const dates = all.map((row) => row.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("chooses the figure each type records, and never multiplies two fields", () => {
    const byType = new Map(rows().map((row) => [row.type, row]));
    const buy = byType.get("buy");
    expect(buy?.figureLabel === "importe liquidado" || buy?.figureLabel === "cantidad").toBe(true);
    expect(byType.get("cash_deposit")?.figureLabel).toBe("importe");
    expect(byType.get("dividend")?.figureLabel).toBe("importe bruto");
    expect(byType.get("valuation")?.figureLabel).toBe("valor unitario");
    expect(byType.get("transfer")?.figureLabel).toBe("cantidad traspasada");
    expect(byType.get("order_placed")?.figureLabel).toBe("importe pedido");
    // A reversal records no figure: it has nothing to show, not a zero.
    expect(byType.get("reversal")?.amount).toBeUndefined();
    expect(byType.get("reversal")?.quantity).toBeUndefined();
  });

  /*
   * Which recorded field each type takes its figure from, **checked by value**.
   * `figureOf` has eleven branches and the assertion above only looked at the
   * labels, so showing the withholding of a dividend instead of its gross
   * stayed green. Table-driven over the types the golden ledger contains.
   */
  it("takes the figure from the field each type records", () => {
    /** Candidates in order: the first one the event carries is the figure. */
    const CANDIDATES: Record<string, readonly string[]> = {
      buy: ["amount", "quantity"],
      sell: ["amount", "quantity"],
      cash_deposit: ["amount"],
      cash_withdrawal: ["amount"],
      standalone_fee: ["amount"],
      dividend: ["gross"],
      interest: ["gross"],
      fx_exchange: ["sold_amount"],
      valuation: ["unit_value"],
      transfer: ["quantity_out"],
      order_placed: ["amount", "quantity"],
      transfer_requested: ["quantity_out", "amount_eur"],
      thesis_opened: ["planned_size_eur"],
    };
    const events = goldenEvents();
    const state = projectLedger(events, { collectErrors: true });
    const seen = new Set<string>();
    for (const entry of ledgerEntries(state, events)) {
      const event = entry.event as unknown as Record<string, unknown>;
      const row = movementRow(entry);
      const shown = row.amount?.amount.toString() ?? row.quantity?.toString();
      const candidates = CANDIDATES[entry.event.type];
      if (candidates === undefined) {
        // A type with no figure of its own shows none: never a zero.
        expect(shown).toBeUndefined();
        continue;
      }
      const field = candidates.find((name) => typeof event[name] === "string");
      expect(shown).toBe(field === undefined ? undefined : Decimal.parse(event[field]).toString());
      seen.add(entry.event.type);
    }
    // And the golden ledger really exercises every row of the table.
    expect([...seen].sort()).toEqual(Object.keys(CANDIDATES).sort());
  });

  it("says the state in words and marks what is administrative", () => {
    const all = rows();
    const reversed = all.find((row) => row.status === "reversed");
    expect(reversed?.statusLabel).toBe("Anulado");
    const catalogue = all.find((row) => row.type === "account_created");
    expect(catalogue?.administrative).toBe(true);
    const buy = all.find((row) => row.type === "buy");
    expect(buy?.administrative).toBe(false);
  });

  it("builds a subtitle that says what the event is about", () => {
    const transfer = rows().find((row) => row.type === "transfer");
    expect(transfer?.subtitle).toMatch(/→/);
    const thesis = rows().find((row) => row.subtitle.includes("tesis"));
    expect(thesis).toBeDefined();
  });
});

describe("detailView", () => {
  it("shows every field of the event with a legible name", () => {
    const events = goldenEvents();
    const state = projectLedger(events, { collectErrors: true });
    const entry = ledgerEntries(state, events).find((row) => row.event.type === "buy");
    const view = detailView(entry as never);
    const names = view.fields.map((field) => field.name);
    const event = entry?.event as unknown as Record<string, unknown>;
    for (const name of Object.keys(event)) {
      if (["schema_version", "id", "recorded_at", "type", "fingerprint"].includes(name)) {
        continue;
      }
      expect(names, name).toContain(name);
    }
    expect(view.fields.every((field) => field.label !== field.name || field.name.length < 3)).toBe(
      true,
    );
  });

  it("marks amounts and quantities so the gate paints them", () => {
    const events = goldenEvents();
    const state = projectLedger(events, { collectErrors: true });
    const entry = ledgerEntries(state, events).find(
      (row) =>
        row.event.type === "buy" &&
        (row.event as unknown as { unit_price?: string }).unit_price !== undefined,
    );
    if (entry === undefined) {
      throw new Error("el golden no trae ninguna compra con valor unitario");
    }
    const view = detailView(entry);
    expect(view.fields.find((field) => field.name === "quantity")?.kind).toBe("quantity");
    expect(view.fields.find((field) => field.name === "quantity")?.quantity).toBeDefined();
    expect(view.fields.find((field) => field.name === "unit_price")?.kind).toBe("amount");
    expect(view.fields.find((field) => field.name === "fee")?.amount).toBeDefined();
    // The currency of the amount is the event's, not a guess.
    expect(view.fields.find((field) => field.name === "unit_price")?.amount?.currency).toBe(
      (entry.event as unknown as { currency: string }).currency,
    );
  });

  /*
   * "Corregir" and the screen behind it have to resolve the same thing.
   * `editable` used to be a blacklist while `routes/movimientos/edit.tsx`
   * resolves the form from `FORM_SPECS`, a whitelist of nine: seven types got
   * the button and a dead end, 14 of the 200 events of the golden ledger.
   */
  it("offers to correct only what the form can actually correct", () => {
    const events = goldenEvents();
    const state = projectLedger(events, { collectErrors: true });
    const entries = ledgerEntries(state, events);
    for (const entry of entries.filter((row) => detailView(row).editable)) {
      // Exactly what the destination screen does to build itself.
      expect(FORM_SPECS.find((spec) => spec.type === entry.event.type)).toBeDefined();
    }
    const action = entries.find((row) => row.event.type === "corporate_action");
    expect(detailView(action as never).editable).toBe(false);
    const buy = entries.find((row) => row.event.type === "buy" && row.status === "current");
    expect(detailView(buy as never).editable).toBe(true);
  });

  /*
   * The catalogue is **updated, not rectified** (`docs/data-schema.md` §6.1):
   * a change to an account or an asset is an `account_updated`/`asset_updated`
   * with the whole resulting state. Two of those types do have a form — the one
   * that creates them — so having a form is not on its own enough.
   */
  it("keeps the catalogue out of the correctable types, and says why", () => {
    const events = goldenEvents();
    const state = projectLedger(events, { collectErrors: true });
    const entries = ledgerEntries(state, events);
    const catalogue = ["account_created", "account_updated", "asset_created", "asset_updated"];
    const present = entries.filter((row) => catalogue.includes(row.event.type));
    expect(new Set(present.map((row) => row.event.type)).size).toBeGreaterThan(1);
    for (const entry of present) {
      const view = detailView(entry);
      expect(view.editable).toBe(false);
      // And the screen has something better to offer than a missing button.
      expect(view.editHint).toContain("se actualiza");
    }
    // Two of them are in FORM_SPECS: this is not a side effect of not having one.
    expect(FORM_SPECS.filter((spec) => catalogue.includes(spec.type)).length).toBe(2);
    // Nothing else carries the hint.
    const buy = entries.find((row) => row.event.type === "buy" && row.status === "current");
    expect(detailView(buy as never).editHint).toBeUndefined();
  });

  /**
   * Four of the original seven. The other three — `transfer`,
   * `transfer_requested` and `transfer_request_updated` — stopped being dead
   * ends in feature 007, when the web gained their forms: `editable` is derived
   * from `FORM_SPECS`, so offering the form and offering "Corregir" cannot drift
   * apart.
   */
  it("does not offer it on the four types that are still a dead end", () => {
    const events = goldenEvents();
    const state = projectLedger(events, { collectErrors: true });
    const entries = ledgerEntries(state, events);
    const deadEnds = ["interest", "standalone_fee", "fx_exchange", "order_updated"];
    const present = entries.filter((row) => deadEnds.includes(row.event.type));
    expect(present.length).toBeGreaterThan(0);
    for (const entry of present) {
      expect(detailView(entry).editable).toBe(false);
    }
    // A reversed event is never corrected either, whatever its type.
    const reversed = entries.find((row) => row.status === "reversed");
    expect(detailView(reversed as never).editable).toBe(false);
  });
});

describe("netWorthView", () => {
  it("shows the three blocks and a total that is the sum of what is shown", () => {
    const events = goldenEvents();
    const state = projectLedger(events, { collectErrors: true, asOf: "2029-06-30" });
    const settings = settingsAt(state, "2029-06-30").settings;
    const view = netWorthView(netWorth(state, "2029-06-30", settings));
    expect(view.blocks.map((block) => block.label)).toEqual(["Núcleo", "Cubo", "Efectivo"]);
    const sum = view.blocks.reduce(
      (total, block) => total.add(block.subtotal.roundToCents()),
      Money.zero("EUR"),
    );
    expect(view.total.amount.toString()).toBe(sum.amount.toString());
  });

  it("says what is missing instead of showing a smaller total", () => {
    const events = goldenEvents().filter(
      (event) =>
        !(event.type === "valuation" && (event as { asset_id: string }).asset_id === "ast_world"),
    );
    const state = projectLedger(events as SupportedEvent[], {
      collectErrors: true,
      asOf: "2029-06-30",
    });
    const settings = settingsAt(state, "2029-06-30").settings;
    const view = netWorthView(netWorth(state, "2029-06-30", settings));
    expect(view.partial).toBe(true);
    expect(view.missing).toContain("ast_world");
    const core = view.blocks[0];
    expect(core?.partial).toBe(true);
  });
});

describe("targetWeightTotal", () => {
  it("adds with the decimal of the domain, never through floating point", () => {
    // 0,1 + 0,2 is 0.30000000000000004 in floating point (trap 3, ADR-0005).
    expect(targetWeightTotal({ a: "0.1", b: "0.2" }).total).toBe("0.3");
    expect(targetWeightTotal({ a: "60.05", b: "39.95" })).toEqual({ total: "100", addsUp: true });
  });

  it("accepts the comma a Spanish keyboard types", () => {
    expect(targetWeightTotal({ a: "60,5", b: "39,5" })).toEqual({ total: "100", addsUp: true });
  });

  it("leaves an empty field out: an undeclared weight is not a zero", () => {
    expect(targetWeightTotal({ a: "100", b: "", c: "   " })).toEqual({
      total: "100",
      addsUp: true,
    });
    expect(targetWeightTotal({})).toEqual({ total: "0", addsUp: false });
  });

  it("says whether they add up to 100", () => {
    const cases: [Record<string, string>, boolean][] = [
      [{ a: "60", b: "40" }, true],
      [{ a: "33.33", b: "33.33", c: "33.34" }, true],
      [{ a: "33.33", b: "33.33", c: "33.33" }, false],
      [{ a: "50" }, false],
      [{ a: "60", b: "40.001" }, true],
      [{ a: "60", b: "40.01" }, false],
    ];
    for (const [weights, addsUp] of cases) {
      expect(targetWeightTotal(weights).addsUp).toBe(addsUp);
    }
  });

  it("never claims 100 when a field is not a number", () => {
    // Half typed: the sum cannot read it, so it must not say it adds up.
    expect(targetWeightTotal({ a: "100", b: "-" })).toEqual({ total: "100", addsUp: false });
    expect(targetWeightTotal({ a: "abc" })).toEqual({ total: "0", addsUp: false });
  });
});

describe("the names of the catalogue reach every screen", () => {
  /*
   * The complaint that opened this round: the screens showed `ast_delta` and
   * `acc_bucket` where the ledger has had "Beta Biotech" and "Cubo
   * especulativo" since the first event. Each of the three view-models takes
   * the index and none of them resolves anything on its own.
   */
  const events = goldenEvents();
  const state = projectLedger(events, { collectErrors: true });
  const names = nameIndex(state);

  it("names the account and the asset on every row of the ledger", () => {
    const named = movementRows(ledgerEntries(state, events), names);
    const plain = movementRows(ledgerEntries(state, events));
    const withSubtitle = named.filter((row) => row.subtitle !== "");
    expect(withSubtitle.length).toBeGreaterThan(50);
    // Not one identifier of the catalogue survives in the second line.
    for (const row of withSubtitle) {
      expect(row.subtitle).not.toMatch(/\bast_[a-z_0-9]+/);
      expect(row.subtitle).not.toMatch(/\bacc_[a-z_0-9]+/);
    }
    // Without the index, the identifiers: the fallback of `displayName`.
    expect(plain.some((row) => /ast_|acc_/.test(row.subtitle))).toBe(true);
  });

  it("names the bucket, the cash and what is missing in the patrimony", () => {
    const settings = settingsAt(
      projectLedger(events, { collectErrors: true, asOf: "2029-06-30" }),
      "2029-06-30",
    ).settings;
    const dated = projectLedger(events, { collectErrors: true, asOf: "2029-06-30" });
    const view = netWorthView(netWorth(dated, "2029-06-30", settings), names);
    const bucket = view.blocks.find((block) => block.label === "Cubo");
    const cash = view.blocks.find((block) => block.label === "Efectivo");
    for (const line of [...(bucket?.lines ?? []), ...(cash?.lines ?? [])]) {
      expect(line.name).not.toMatch(/\bast_[a-z_0-9]+/);
      expect(line.name).not.toMatch(/\bacc_[a-z_0-9]+/);
    }
    // The note at the bottom lists what is missing: names too.
    for (const missing of view.missing) {
      expect(missing).not.toMatch(/^ast_/);
    }
    // The core keeps its asset classes, in Spanish and not as an enum.
    const core = view.blocks.find((block) => block.label === "Núcleo");
    expect(core?.lines.map((line) => line.name)).toContain("Renta variable");
  });

  it("keeps the identifier next to the name where the ledger is checked", () => {
    const entry = ledgerEntries(state, events).find((one) => one.event.type === "buy");
    const view = detailView(entry as NonNullable<typeof entry>, names);
    const asset = view.fields.find((field) => field.name === "asset_id");
    expect(asset?.text).not.toMatch(/^ast_/);
    expect(asset?.hint).toMatch(/^ast_/);
    // With no catalogue there is no name to put beside it, so no hint either.
    const plain = detailView(entry as NonNullable<typeof entry>);
    expect(plain.fields.find((field) => field.name === "asset_id")?.hint).toBeUndefined();
  });
});

describe("the draft of the configuration screen", () => {
  /*
   * Everything this block covers used to be a closure inside a 517-line `.tsx`,
   * where no test could reach it (review of 2026-09-18). `mergeSettings` is the
   * domain's and has its own tests; what is checked here is the bookkeeping
   * around it, which is where a comma or an emptied field goes wrong.
   */
  const base = settingsAt(
    projectLedger(goldenEvents() as SupportedEvent[], { collectErrors: true }),
    "2029-06-30",
  ).settings;

  it("names every setting it edits with a key the type knows", () => {
    for (const setting of [...SETTINGS_NUMBERS, ...SETTINGS_TEXTS]) {
      expect(typeof setting.key).toBe("string");
      expect(setting.label.length).toBeGreaterThan(0);
    }
    // Two tables, no key in both: a field edited twice would fight itself.
    const keys = [...SETTINGS_NUMBERS, ...SETTINGS_TEXTS].map((one) => String(one.key));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("shows what is in force until something is typed", () => {
    expect(settingValue(base, {}, "tax_residence")).toBe(base.tax_residence ?? "");
    expect(settingValue(base, { tax_residence: "PT" }, "tax_residence")).toBe("PT");
    const { notification_email: _unset, ...withoutEmail } = base;
    expect(settingValue(withoutEmail, {}, "notification_email")).toBe("");
  });

  it("keeps a decimal a string and turns the comma into a point", () => {
    // Trap 3: a business decimal never becomes a float on the way in.
    expect(withNumber({}, "deviation_threshold_pp", "2,5")).toEqual({
      deviation_threshold_pp: "2.5",
    });
    expect(withNumber({}, "stale_price_days", " 7 ", true)).toEqual({ stale_price_days: 7 });
  });

  it("clears a setting when its field is emptied", () => {
    expect(withNumber({}, "deviation_threshold_pp", "  ")).toEqual({
      deviation_threshold_pp: undefined,
    });
    expect(withText({}, "notification_email", "   ")).toEqual({ notification_email: undefined });
    expect(withOption({}, "bucket_benchmark_asset_id", "")).toEqual({
      bucket_benchmark_asset_id: undefined,
    });
  });

  it("edits one asset type of a per-type map without dropping the others", () => {
    const current = {
      ...base,
      wash_sale_window: { fund: "1y" as const, stock: "2m" as const },
    };
    const patch = withPerAssetType(current, {}, "wash_sale_window", "crypto", " 30d ");
    expect(patch.wash_sale_window).toEqual({ fund: "1y", stock: "2m", crypto: "30d" });
    // A second keystroke builds on the first, not on what is in force.
    const twice = withPerAssetType(current, patch, "wash_sale_window", "etf", "2m");
    expect(twice.wash_sale_window).toEqual({
      fund: "1y",
      stock: "2m",
      crypto: "30d",
      etf: "2m",
    });
    expect(perAssetTypeValue(current, twice, "wash_sale_window", "crypto")).toBe("30d");
    expect(perAssetTypeValue(current, {}, "wash_sale_window", "fund")).toBe("1y");
  });

  /**
   * "Valor por defecto" used to do nothing at all: an empty field spread an
   * empty object, so a value already in force could not be taken off from the
   * screen and the user was told something had changed when nothing had (Q10).
   * ADR-0018 makes these maps partial, so removing a key is the documented way
   * of going back to the default.
   */
  /**
   * **End to end, on the `Settings` that gets written** — not on the draft in
   * the middle. The first version of this test looked at the patch, and the
   * patch was right: the key was gone from it. What was wrong was one step
   * further on, where `mergeSettings` merged the map back into the one in force
   * and the key returned. The screen said "guardado", the field went back to its
   * old value and the fiscal rule in force never moved.
   *
   * A test that stops at the intermediate step cannot see that, and this is
   * exactly the kind of figure where not seeing it costs money years later.
   */
  it("removes the key of an asset type, all the way to the settings it writes", () => {
    const current = {
      ...base,
      wash_sale_window: { fund: "1y" as const, stock: "2m" as const },
      fiscal_date_rule: { fund: "value_date" as const, stock: "trade_date" as const },
    };

    const cleared = withPerAssetType(current, {}, "wash_sale_window", "fund", "");
    const written = candidateSettings(current, cleared, undefined);

    expect(cleared.wash_sale_window).toEqual({ stock: "2m" });
    expect(written.wash_sale_window).toEqual({ stock: "2m" });
    expect(written.wash_sale_window.fund).toBeUndefined();
    // The field shows empty, and what gets written agrees with the field.
    expect(perAssetTypeValue(current, cleared, "wash_sale_window", "fund")).toBe("");
    expect(perAssetTypeValue(current, cleared, "wash_sale_window", "stock")).toBe("2m");
    // And nothing else moved.
    expect(written.fiscal_date_rule).toEqual(current.fiscal_date_rule);
  });

  it("writes the fiscal date rule it was asked to remove, too", () => {
    const current = {
      ...base,
      fiscal_date_rule: { fund: "trade_date" as const, stock: "trade_date" as const },
    };

    const cleared = withPerAssetType(current, {}, "fiscal_date_rule", "fund", "  ");
    const written = candidateSettings(current, cleared, undefined);

    expect(written.fiscal_date_rule).toEqual({ stock: "trade_date" });
  });

  it("removes a key that was only in the draft, not in force", () => {
    const current = { ...base, wash_sale_window: { fund: "1y" as const } };

    const added = withPerAssetType(current, {}, "wash_sale_window", "etf", "2m");
    const removed = withPerAssetType(current, added, "wash_sale_window", "etf", "  ");

    expect(removed.wash_sale_window).toEqual({ fund: "1y" });
  });

  it("shows an asset type with no value as empty, never as its default", () => {
    // ADR-0018: what the ledger does not say takes the documented default at
    // the point of use; the form must not write that default back in.
    const current = { ...base, fiscal_date_rule: {} };
    expect(perAssetTypeValue(current, {}, "fiscal_date_rule", "etf")).toBe("");
  });

  it("reads the weights in force until one is typed", () => {
    const current = { ...base, target_weights: { a: "60", b: "40" } };
    expect(weightValues(current, ["a", "b", "c"], undefined)).toEqual({ a: "60", b: "40", c: "" });
    expect(weightValues(current, ["a", "b"], { a: "70" })).toEqual({ a: "70" });
  });

  it("knows whether there is anything to save", () => {
    expect(settingsTouched({}, undefined)).toBe(false);
    expect(settingsTouched({ tax_residence: "PT" }, undefined)).toBe(true);
    expect(settingsTouched({}, { a: "100" })).toBe(true);
    // An emptied field counts as touched: clearing a setting is a change.
    expect(settingsTouched({ tax_residence: undefined }, undefined)).toBe(true);
  });
});

describe("the form specs", () => {
  /**
   * FR-048: a field the schema gains and a form forgets has to make the suite
   * fail, or the day `buy` grows a field the web will quietly stop writing it.
   */
  it("covers every field of the schema for every form", () => {
    const gaps: string[] = [];
    for (const spec of FORM_SPECS) {
      const known = knownFieldsOf(spec.type as never).filter(
        (field) => !ENVELOPE_FIELDS.includes(field),
      );
      const covered = new Set([
        ...spec.fields.map((field) => field.name),
        ...spec.omitted.map((field) => field.name),
      ]);
      for (const field of known) {
        if (!covered.has(field)) {
          gaps.push(`${spec.slug}: falta ${field}`);
        }
      }
      for (const field of covered) {
        if (!known.includes(field)) {
          gaps.push(`${spec.slug}: ${field} no existe en el esquema`);
        }
      }
    }
    expect(gaps).toEqual([]);
  });

  it("explains every field it leaves out", () => {
    for (const spec of FORM_SPECS) {
      for (const omitted of spec.omitted) {
        expect(omitted.reason.length, `${spec.slug}.${omitted.name}`).toBeGreaterThan(10);
      }
    }
  });

  it("starts from the declared defaults and today's date", () => {
    const spec = FORM_SPECS.find((candidate) => candidate.slug === "buy");
    const values = initialValues(spec as never, "2027-05-04");
    expect(values.fee).toBe("0");
    expect(values.source).toBe("manual");
    expect(values.currency).toBe("EUR");
    expect(values.trade_date).toBe("2027-05-04");
    expect(values.notes).toBe("");
  });

  it("hides the exchange rate in euros and shows it in any other currency", () => {
    const spec = FORM_SPECS.find((candidate) => candidate.slug === "buy");
    const fx = (spec as never as { fields: { name: string }[] }).fields.find(
      (field) => field.name === "fx_rate",
    );
    expect(isVisible(fx as never, { currency: "EUR" })).toBe(false);
    expect(isVisible(fx as never, { currency: "USD" })).toBe(true);
  });

  it("only shows the asset class in the core book", () => {
    const spec = FORM_SPECS.find((candidate) => candidate.slug === "activo");
    const assetClass = (spec as never as { fields: { name: string }[] }).fields.find(
      (field) => field.name === "asset_class",
    );
    expect(isVisible(assetClass as never, { book: "core" })).toBe(true);
    expect(isVisible(assetClass as never, { book: "bucket" })).toBe(false);
  });

  it("leaves an empty optional field out of the draft, never sends it empty", () => {
    const spec = FORM_SPECS.find((candidate) => candidate.slug === "cash-in");
    const draft = toDraft(spec as never, {
      account_id: "acc_mi",
      value_date: "2027-03-01",
      amount: "1.000,50",
      currency: "EUR",
      fx_rate: "1",
      fx_rate_date: "",
      notes: "",
    }) as unknown as Record<string, unknown>;
    expect(draft).toEqual({
      type: "cash_deposit",
      account_id: "acc_mi",
      value_date: "2027-03-01",
      // The decimal comma the user typed becomes the point the ledger stores.
      amount: "1.000.50",
      currency: "EUR",
      fx_rate: "1",
    });
    expect("notes" in draft).toBe(false);
  });

  it("keeps a hidden required field (the euro rate is 1 and is not asked)", () => {
    const spec = FORM_SPECS.find((candidate) => candidate.slug === "buy");
    const draft = toDraft(spec as never, {
      ...initialValues(spec as never, "2027-05-04"),
      account_id: "acc_mi",
      asset_id: "ast_world",
      quantity: "10",
      unit_price: "100",
    }) as unknown as Record<string, unknown>;
    expect(draft.fx_rate).toBe("1");
    expect(draft.currency).toBe("EUR");
    expect("fx_rate_date" in draft).toBe(false);
  });

  it("turns a switch into a real boolean", () => {
    const spec = FORM_SPECS.find((candidate) => candidate.slug === "cuenta");
    const draft = toDraft(spec as never, {
      ...initialValues(spec as never),
      account_id: "acc_x",
      name: "Cuenta",
      platform: "ibkr",
      book: "core",
      base_currency: "EUR",
      country: "IE",
      active: "true",
    }) as unknown as Record<string, unknown>;
    expect(draft.active).toBe(true);
  });

  it("lists the required fields that are still empty", () => {
    const spec = FORM_SPECS.find((candidate) => candidate.slug === "buy");
    const values = initialValues(spec as never, "2027-05-04");
    expect(missingRequired(spec as never, values)).toEqual(["account_id", "asset_id", "quantity"]);
  });

  it("fills itself from an existing event, to correct it", () => {
    const spec = FORM_SPECS.find((candidate) => candidate.slug === "buy");
    const values = valuesOfEvent(spec as never, {
      account_id: "acc_mi",
      asset_id: "ast_world",
      quantity: "10",
      fee: "0",
      notes: undefined,
    });
    expect(values.account_id).toBe("acc_mi");
    expect(values.quantity).toBe("10");
    expect(values.notes).toBe("");
  });

  it("normalises the decimal the way a Spanish keyboard types it", () => {
    expect(normaliseDecimal(" 1,5 ")).toBe("1.5");
    expect(normaliseDecimal("1 000.25")).toBe("1000.25");
  });
});
