// @vitest-environment happy-dom
//
// The attention list of the summary: the risk of losing the data was item 23
// of 27, the warnings of repurchase windows closed long ago were still there,
// and one rule tripped by eleven purchases was eleven items in a row.

import type { Warning } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import Resumen from "../src/routes/resumen/index.jsx";
import { attentionItems } from "../src/view-models/index.js";
import { show, text, today, ULID, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

const warning = (
  code: string,
  details: Record<string, unknown>,
  event_id = "01ARYZ6S41TSV4RRFFQ6900001",
): Warning => ({ code, event_id, message: `english ${code}`, details });

const attention = (
  warnings: Warning[],
  extra: Partial<Parameters<typeof attentionItems>[0]> = {},
) =>
  attentionItems({
    invalidCount: 0,
    privacy: false,
    warnings,
    findings: [],
    openOrders: [],
    openTransfers: [],
    ...extra,
  });

describe("the list, as data", () => {
  it("puts the risk of losing the data first, above a degraded ledger and a breached rule", () => {
    const items = attention(
      [
        warning("bucket_stop_loss_reached", {
          loss_eur: "100",
          loss_pct: "30",
          gross_eur: "300",
          limit_pct: "25",
        }),
      ],
      { invalidCount: 3, exportOverdueDays: "never" },
    );
    expect(items.map((item) => item.code)).toEqual([
      "export_overdue",
      "invalid_events",
      "bucket_stop_loss_reached",
    ]);
  });

  it("leaves out a repurchase window that had already closed on the date asked", () => {
    const repurchase = (end: string) =>
      warning("wash_sale_window_repurchase", {
        asset_id: "ast_world",
        sale_event_id: "01ARYZ6S41TSV4RRFFQ6900009",
        sale_date: "2026-01-10",
        loss_eur: "-50",
        window_end: end,
        window: "2m",
      });
    expect(attention([repurchase("2026-03-10")], { date: "2026-03-10" })).toHaveLength(1);
    expect(attention([repurchase("2026-03-10")], { date: "2026-03-11" })).toHaveLength(0);
  });

  it("closes the window of a prior purchase at the sale plus the window, from the sale's own date", () => {
    const prior = warning(
      "wash_sale_window_prior_buy",
      {
        asset_id: "ast_world",
        buy_date: "2025-12-20",
        quantity: "2",
        loss_eur: "-50",
        window_start: "2025-11-10",
        window: "2m",
      },
      "01ARYZ6S41TSV4RRFFQ6900009",
    );
    const saleDates = new Map([["01ARYZ6S41TSV4RRFFQ6900009", "2026-01-10"]]);
    expect(attention([prior], { date: "2026-03-10", saleDates })).toHaveLength(1);
    expect(attention([prior], { date: "2026-03-11", saleDates })).toHaveLength(0);
    // Without the sale's date nothing is hidden: fail safe.
    expect(attention([prior], { date: "2030-01-01" })).toHaveLength(1);
  });

  it("groups the same rule about the same sale into one item with a count", () => {
    const buys = ["2025-12-01", "2025-12-05", "2025-12-09"].map((buy_date) =>
      warning(
        "wash_sale_window_prior_buy",
        {
          asset_id: "ast_world",
          buy_date,
          quantity: "1",
          loss_eur: "-50",
          window_start: "2025-11-10",
          window: "2m",
        },
        "01ARYZ6S41TSV4RRFFQ6900009",
      ),
    );
    const other = warning(
      "wash_sale_window_prior_buy",
      { ...buys[0]?.details, buy_date: "2026-05-01" },
      "01ARYZ6S41TSV4RRFFQ690000A",
    );
    const items = attention([...buys, other, { ...(buys[0] as Warning) }]);
    expect(items.map((item) => item.count).sort()).toEqual([1, 3]);
  });
});

describe("the list, on the summary", () => {
  it("puts the export first and never an identifier or an ISO date", async () => {
    const host = await show("/", Resumen);
    const items = [...host.querySelectorAll('[aria-label="Lo que reclama atención"] .notice')];
    expect(text(items[0])).toContain("nunca se han exportado");
    const shown = text(host.querySelector('[aria-label="Lo que reclama atención"]'));
    expect(shown).not.toMatch(ULID);
    expect(shown).not.toMatch(/\d{4}-\d{2}-\d{2}|th_alpha/);
  });

  it("groups the repeats of one rule about one sale, and drops the windows already closed", async () => {
    // 10/01/2027: days after a fund sold at a loss (value date 06/01/2027) with
    // eleven purchases inside the year before it.
    today("2027-01-10");
    const early = text(await show("/", Resumen));
    expect(early).toMatch(/Venta con pérdida de World Index Fund.*\d+ iguales/);
    expect(early.match(/Venta con pérdida de World Index Fund/g)).toHaveLength(1);

    // Two years later that window is long closed and is not something to act on.
    today("2029-01-05");
    const late = text(await show("/", Resumen));
    expect(late).not.toContain("dentro de la ventana abierta el 06/01/2026");
  });
});
