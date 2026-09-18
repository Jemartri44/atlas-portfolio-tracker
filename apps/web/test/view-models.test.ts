// The presentation logic: the order of the attention list, the mapping of a
// ledger entry to a row, the breakdown of the patrimony and the form specs.
// All of it pure, so it is tested without painting anything (Q8).

import {
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
  detailView,
  movementRows,
  netWorthView,
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
    const view = detailView(entry as never);
    expect(view.fields.find((field) => field.name === "quantity")?.kind).toBe("quantity");
    expect(view.fields.find((field) => field.name === "quantity")?.quantity).toBeDefined();
    expect(view.fields.find((field) => field.name === "unit_price")?.kind).toBe("amount");
    expect(view.fields.find((field) => field.name === "fee")?.amount).toBeDefined();
    // The currency of the amount is the event's, not a guess.
    expect(view.fields.find((field) => field.name === "unit_price")?.amount?.currency).toBe(
      (entry?.event as unknown as { currency: string }).currency,
    );
  });

  it("does not offer to correct what the CLI refuses to correct", () => {
    const events = goldenEvents();
    const state = projectLedger(events, { collectErrors: true });
    const entries = ledgerEntries(state, events);
    const action = entries.find((row) => row.event.type === "corporate_action");
    expect(detailView(action as never).editable).toBe(false);
    const buy = entries.find((row) => row.event.type === "buy" && row.status === "current");
    expect(detailView(buy as never).editable).toBe(true);
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

describe("the form specs", () => {
  /**
   * FR-048: a field the schema gains and a form forgets has to make the suite
   * fail, or the day `buy` grows a field the web will quietly stop writing it.
   */
  it("covers every field of the schema for the nine forms", () => {
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
