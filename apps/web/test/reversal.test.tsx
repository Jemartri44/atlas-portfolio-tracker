// @vitest-environment happy-dom
//
// Reversing is destructive. Its confirmation wore the primary blue of
// "Registrar", and its dialog explained itself with "append-only" and a
// reference to ADR-0003.

import { afterEach, describe, expect, it } from "vitest";
import Detail from "../src/routes/movimientos/detail.jsx";
import { press, show, text, withGoldenLedger } from "./helpers/render.jsx";
import { applied, token, withoutStyles, withStyles } from "./helpers/styles.js";

withGoldenLedger();

/** A purchase of the golden ledger. */
const PURCHASE = "01M1PS7N80HK088D7010QSGMEQ";

afterEach(() => withoutStyles());

describe("reversing a movement", () => {
  it("does not dress the confirmation as the primary action nor cite a document", async () => {
    const host = await show(`/movimientos/${PURCHASE}`, Detail, "/movimientos/:id");
    await press(host, "Anular");
    const dialog = host.querySelector("dialog");
    const confirm = [...(dialog?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent?.trim() === "Anular",
    );
    expect(confirm?.classList.contains("danger")).toBe(true);
    expect(text(dialog)).not.toMatch(/ADR|append-only/);
    expect(text(dialog)).toContain("No se borra nada");
  });

  it("paints a destructive action in the colour of danger, not the primary blue", async () => {
    withStyles();
    const host = await show(`/movimientos/${PURCHASE}`, Detail, "/movimientos/:id");
    // The button that opens the question: outlined in danger.
    const open = [...host.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Anular",
    );
    expect(applied(open, "color")).toBe(token("--c-danger"));
    expect(applied(open, "background-color")).not.toBe(token("--c-accent"));
    await press(host, "Anular");
    // The one that confirms it: filled with danger, inside its dialog.
    const confirm = [...(host.querySelector("dialog")?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent?.trim() === "Anular",
    );
    expect(applied(confirm, "background-color")).toBe(token("--c-danger"));
    expect(applied(confirm, "background-color")).not.toBe(token("--c-accent"));
  });
});
