// @vitest-environment happy-dom
//
// An identifier of the ledger — `acc_mi`, `ast_world`, the ULID of an order —
// is shown **only** inside the folded technical record, where the ledger is
// checked and a repair is written. Everywhere else a thing is named: an
// account and an asset by their names, an order by what it asked for and
// when (review of 2026-09-19).

import { describe, expect, it } from "vitest";
import Detail from "../src/routes/movimientos/detail.jsx";
import Edit from "../src/routes/movimientos/edit.jsx";
import { optionsOf, show, text, ULID, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

/** A purchase that executed an order of 02/09/2026. */
const PURCHASE = "01M1PS7R5RJ4XWKK5GX24DQ2FE";
const ORDER = "01M1PS7Q6GB2BV0HFJVSWXNGT8";
const IDS = /\b(acc|ast)_[a-z_0-9]+\b/;

/** What is seen, outside the folded technical record. */
const outsideRecord = (host: HTMLElement): string => {
  const copy = host.cloneNode(true) as HTMLElement;
  for (const record of copy.querySelectorAll("details")) {
    record.remove();
  }
  return text(copy);
};

describe("the identifiers of a movement", () => {
  it("stay in the technical record of the detail, and the names outside it", async () => {
    const host = await show(`/movimientos/${PURCHASE}`, Detail, "/movimientos/:id");
    const seen = outsideRecord(host);
    expect(seen).toContain("World Index Fund");
    expect(seen).not.toMatch(IDS);
    expect(seen).not.toMatch(ULID);
    expect(seen).toContain("Orden de compra de World Index Fund del 02/09/2026");
    const record = text(host.querySelector("details"));
    expect(record).toContain("acc_mi");
    expect(record).toContain(ORDER);
  });

  it("never reach the correction, which keeps the order it executed by its name", async () => {
    const host = await show(`/movimientos/${PURCHASE}/editar`, Edit, "/movimientos/:id/editar");
    expect(text(host)).not.toMatch(IDS);
    expect(text(host)).not.toMatch(ULID);
    const order = host.querySelector("#f-order_id") as HTMLSelectElement;
    expect(order.value).toBe(ORDER);
    expect(optionsOf(host, "f-order_id").join(" | ")).toContain("Compra de World Index Fund");
  });
});
