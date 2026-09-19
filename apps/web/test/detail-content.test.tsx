// @vitest-environment happy-dom
//
// What the detail of a movement puts in sight and what it folds (review of
// 2026-09-19): the bookkeeping of an operation in euros — a rate of 1, its
// date, «EUR», where the line came from — goes to the technical record, and a
// sale says what it produced.

import { projectLedger } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import Detail from "../src/routes/movimientos/detail.jsx";
import { goldenEvents } from "./helpers/golden.js";
import { show, text, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

const events = goldenEvents();
const state = projectLedger(events, { collectErrors: true });

/** The labels of the data in sight, outside the folded record. */
const dataLabels = (host: HTMLElement): string[] =>
  [...host.querySelectorAll("section > .facts > .fact > dt")].map((label) => text(label));

const recordText = (host: HTMLElement): string => text(host.querySelector("details"));

const firstBuy = (currency: string): string => {
  const found = events.find(
    (event) =>
      event.type === "buy" && (event as unknown as { currency: string }).currency === currency,
  );
  if (found === undefined) {
    throw new Error(`el golden no trae ninguna compra en ${currency}`);
  }
  return found.id;
};

describe("the detail of a movement", () => {
  it("folds the bookkeeping of a purchase in euros into the technical record", async () => {
    const host = await show(`/movimientos/${firstBuy("EUR")}`, Detail, "/movimientos/:id");
    const labels = dataLabels(host);
    expect(labels.length).toBeGreaterThan(3);
    for (const label of ["Tipo del BCE", "Fecha del tipo", "Divisa", "Origen del dato"]) {
      expect(labels.some((shown) => shown.startsWith(label))).toBe(false);
    }
    expect(recordText(host)).toContain("Origen del dato");
    expect(recordText(host)).toContain("Divisa");
  });

  it("keeps the rate of a purchase in another currency among its data", async () => {
    const host = await show(`/movimientos/${firstBuy("USD")}`, Detail, "/movimientos/:id");
    const labels = dataLabels(host);
    expect(labels.some((shown) => shown.startsWith("Divisa"))).toBe(true);
    expect(labels.some((shown) => shown.startsWith("Tipo"))).toBe(true);
    expect(labels.some((shown) => shown.startsWith("Origen del dato"))).toBe(false);
  });

  it("says what a sale produced, from the gain the ledger booked", async () => {
    const gain = state.gains[0];
    if (gain === undefined) {
      throw new Error("el golden no trae ninguna venta con ganancia");
    }
    const host = await show(`/movimientos/${gain.event_id}`, Detail, "/movimientos/:id");
    const shown = text(host);
    expect(shown).toContain("Resultado de la venta");
    expect(shown).toMatch(/Ganancia|Pérdida/);
  });

  it("says every sale of a corporate action, one per account, and their total", async () => {
    // The reverse split of Physical Gold ETC sells fractions in two accounts.
    const REVERSE_SPLIT = "01MQTWHB78RC2FADH9B774BHS5";
    const booked = state.gains.filter((gain) => gain.event_id === REVERSE_SPLIT);
    expect(booked).toHaveLength(2);
    const host = await show(`/movimientos/${REVERSE_SPLIT}`, Detail, "/movimientos/:id");
    const shown = text(host);
    expect(shown).toContain("Resultado de las ventas");
    // Both lines and the total, never the first sale presented as the whole.
    expect(shown).toContain("2,11");
    expect(shown).toContain("5,40");
    expect(shown).toMatch(/Pérdida total\s*[−-]7,51/);
  });

  it("says nothing of a result on a movement that is not a sale", async () => {
    const host = await show(`/movimientos/${firstBuy("EUR")}`, Detail, "/movimientos/:id");
    expect(text(host)).not.toContain("Resultado de la venta");
  });
});
