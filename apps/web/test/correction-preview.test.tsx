// @vitest-environment happy-dom
//
// The effect of a correction is the effect of what will be written: the
// original reversed and the corrected event in its place (`previewCorrection`,
// in the domain). The preview used to add the corrected event to the ledger as
// it was: a deposit of 8.700 € corrected to 8.000 € showed the cash going from
// 10.092,05 € to 18.092,05 €, and a purchase that had executed an order was
// refused because «the order is already closed» — by that very purchase.

import { describe, expect, it } from "vitest";
import { store } from "../src/ledger/state.js";
import Edit from "../src/routes/movimientos/edit.jsx";
import { press, show, text, type, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

/** A deposit of 8.700 € into the indexed funds account, on 05/09/2028. */
const DEPOSIT = "01NWVBBZ78ZF4XD31K965DE3ET";
/** A purchase of World Index Fund that executed an order of 02/09/2026. */
const WITH_ORDER = "01M1PS7R5RJ4XWKK5GX24DQ2FE";

const correct = async (id: string, field: string, value: string): Promise<HTMLElement> => {
  store.setPrivacy(false);
  const host = await show(`/movimientos/${id}/editar`, Edit, "/movimientos/:id/editar");
  type(host, `f-${field}`, value);
  type(host, "correct-reason", "mal tecleado");
  await press(host, "Ver el efecto");
  return host;
};

describe("the effect of a correction", () => {
  it("replaces the corrected deposit instead of adding it", async () => {
    const host = await correct(DEPOSIT, "amount", "8000");
    const cash = [...host.querySelectorAll(".preview section.card")].find(
      (card) => card.querySelector("h2")?.textContent === "Efectivo",
    );
    const figures = [...text(cash?.querySelector(".values")).matchAll(/[\d.]+,\d{2}/g)].map(
      (found) => Number(found[0].replace(/\./g, "").replace(",", ".")),
    );
    expect(figures).toHaveLength(2);
    const [before, after] = figures as [number, number];
    // Down by the 700 € the correction takes away, not up by the 8.000 € it writes.
    expect(Math.round((before - after) * 100) / 100).toBe(700);
  });

  it("lets a purchase keep the order it executed", async () => {
    const host = await correct(WITH_ORDER, "fee", "1");
    expect(text(host)).not.toContain("ya está");
    expect(host.querySelector(".preview")).not.toBeNull();
  });
});
