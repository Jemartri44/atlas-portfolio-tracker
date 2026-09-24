// @vitest-environment happy-dom
//
// "Esto toca un ejercicio que ya declaraste", in the four places the web
// writes (FR-018, ADR-0020 amended): registering, correcting, annulling and
// changing the configuration. It never refuses; what it may never do is stay
// quiet, and the moment it is useful is **before** the question.
//
// The same notice in the four of them on purpose: a warning that looks
// different in each screen is the warning nobody recognises.

import { describe, expect, it } from "vitest";
import { MASK } from "../src/format/money.js";
import { store } from "../src/ledger/state.js";
import Configuracion from "../src/routes/ajustes/configuracion.jsx";
import Detalle from "../src/routes/movimientos/detail.jsx";
import RegistrarForm from "../src/routes/registrar/form.jsx";
import { goldenEvents, goldenText } from "./helpers/golden.js";
import {
  choose,
  DECIMAL,
  figuresLeft,
  openLedger,
  press,
  settle,
  show,
  text,
  today,
  type,
  withGoldenLedger,
} from "./helpers/render.jsx";

withGoldenLedger();

/** The income tax of 2027, filed: what the golden ledger says that year is 174,35. */
const FILING = `${JSON.stringify({
  schema_version: 1,
  id: "01P0000000000000000000FEED",
  recorded_at: "2028-06-10T18:00:00.000Z",
  type: "tax_return_filed",
  model: "renta",
  tax_year: 2027,
  filed_at: "2028-06-10",
  receipt_reference: "100-2027-ABCDEFGHIJKL",
  declared: { savings_base_eur: "174.35", pending_losses: [], deferred_losses_eur: "0.00" },
  computed: {
    as_of: "2028-06-10",
    settings_origin: "event",
    settings: (
      [...goldenEvents()]
        .reverse()
        .find((event) => event.type === "settings_changed") as unknown as {
        settings: unknown;
      }
    ).settings,
    savings_base_eur: "174.35",
    pending_losses: [],
    deferred_losses_eur: "0.00",
  },
  ledger_fingerprint: { schema_version: 1, lines: 200, sha256: "0".repeat(64) },
  fingerprint: "sha256:filing",
})}\n`;

const withFiling = async (): Promise<void> => {
  await openLedger(goldenText() + FILING);
};

describe("a write that reaches a filed return", () => {
  it("says so in Registrar, before the button that writes", async () => {
    await withFiling();
    const host = await show("/registrar/cash-in", RegistrarForm, "/registrar/:tipo");
    choose(host, "f-account_id", "acc_mi");
    type(host, "f-value_date", "2027-11-02");
    type(host, "f-amount", "100");
    await press(host, "Ver el efecto");
    await settle(30);
    const effect = host.querySelector(".effect");
    expect(text(effect)).toContain("Afecta a la Renta de 2027");
    expect(text(effect)).toContain("10/06/2028");
    // And before the button, not after it.
    const shown = text(effect);
    expect(shown.indexOf("Afecta a la Renta")).toBeLessThan(shown.indexOf("Registrar"));
  });

  it("says so in the dialog that annuls, with the figure it moves", async () => {
    await withFiling();
    // A sale of 2027 of the golden ledger: annulling it moves the base filed.
    const sale = goldenEvents().find(
      (event) =>
        event.type === "sell" && (event as { value_date?: string }).value_date === "2027-01-06",
    );
    const host = await show(
      `/movimientos/${(sale as { id: string }).id}`,
      Detalle,
      "/movimientos/:id",
    );
    await press(host, "Anular");
    await settle(60);
    const dialog = host.querySelector("dialog");
    expect(text(dialog)).toContain("Afecta a la Renta de 2027, que presentaste el 10/06/2028");
    // The base does not move: what moves is what was deferred by the repurchase
    // rule, which is exactly the figure a rule "by date" would have missed.
    expect(text(dialog)).toContain("Cae en ese ejercicio y mueve lo que declaraste");
    expect(text(dialog)).toContain("lo aplazado por recompra a 31 de diciembre");
    expect(text(dialog)).toContain("Puede que toque presentar una complementaria");
  });

  it("has the warning in the dialog the moment it opens, not a tick later", async () => {
    await withFiling();
    const sale = goldenEvents().find(
      (event) =>
        event.type === "sell" && (event as { value_date?: string }).value_date === "2027-01-06",
    );
    const host = await show(
      `/movimientos/${(sale as { id: string }).id}`,
      Detalle,
      "/movimientos/:id",
    );
    const button = [...host.querySelectorAll("button")].find(
      (candidate) => candidate.textContent?.trim() === "Anular",
    );
    button?.click();
    // Nothing awaited yet: the dialog must **not** be up. Fired with
    // `void … .then(…)` it opened on the spot and the impact arrived a tick
    // later, which is after the user has read the question.
    const open = () =>
      [...host.querySelectorAll("dialog")].find((node) => node.hasAttribute("open"));
    expect(open()).toBeUndefined();
    await settle(30);
    expect(text(open())).toContain("Afecta a la Renta de 2027");
  });

  /**
   * A filed base is as private as any other figure, and this notice is the one
   * place of the application that prints an amount that does not come from the
   * screen the user is on. Replacing its two `Amount` calls with the raw
   * strings of the impact survived the whole suite: the mask lives in the
   * call, so only a rendered notice sees it.
   */
  it("masks the figures it moves when privacy is on", async () => {
    store.setPrivacy(true);
    await withFiling();
    const sale = goldenEvents().find(
      (event) =>
        event.type === "sell" && (event as { value_date?: string }).value_date === "2027-01-06",
    );
    const host = await show(
      `/movimientos/${(sale as { id: string }).id}`,
      Detalle,
      "/movimientos/:id",
    );
    await press(host, "Anular");
    await settle(60);
    const dialog = host.querySelector("dialog");
    const shown = text(dialog);
    // It still says which return it reaches and which figure moves: what is
    // hidden is the money, not the warning.
    expect(shown).toContain("Afecta a la Renta de 2027");
    expect(shown).toContain("lo aplazado por recompra a 31 de diciembre");
    expect(shown).toContain(MASK);
    // And not one amount survives, in the text or in an attribute.
    expect(DECIMAL.test(figuresLeft(shown))).toBe(false);
    expect(DECIMAL.test(dialog?.innerHTML ?? "")).toBe(false);
  });

  it("says so in Configuración, where not a single event moves", async () => {
    await withFiling();
    today("2029-07-01");
    const host = await show("/ajustes/configuracion", Configuracion);
    // Reading listed shares by value date moves a sale of December 2027 into
    // 2028, and with it the base of the year that was filed.
    choose(host, "fdr-stock", "value_date");
    await press(host, "Guardar configuración");
    await settle(60);
    const open = () =>
      [...host.querySelectorAll("dialog")].find((node) => node.hasAttribute("open"));
    // First the question about the ECB rates of the lines whose fiscal date
    // moves (feature 012, block 6), then the one about the filed return.
    expect(text(open())).toContain("Este cambio deja tipos del BCE de otra fecha");
    await press(open() as HTMLElement, "Guardar de todas formas");
    await settle(60);
    const dialog = open();
    expect(text(dialog)).toContain("Afecta a la Renta de 2027");
    expect(text(dialog)).toContain("Puede que toque presentar una complementaria");
  });
});
