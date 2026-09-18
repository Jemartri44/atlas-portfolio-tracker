// @vitest-environment happy-dom
//
// Reversing is destructive. Its confirmation wore the primary blue of
// "Registrar", and its dialog explained itself with "append-only" and a
// reference to ADR-0003.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import Detail from "../src/routes/movimientos/detail.jsx";
import { press, show, text, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

/** A purchase of the golden ledger. */
const PURCHASE = "01M1PS7N80HK088D7010QSGMEQ";

/** A path of the web, from this file: `new URL` is not Node's under happy-dom. */
const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "../src/styles/components.css"), "utf8");

/** The declarations of one selector of the stylesheet, comments out. */
const declarations = (selector: string): string[] => {
  const found: string[] = [];
  for (const match of css.replace(/\/\*[\s\S]*?\*\//g, " ").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (
      (match[1] as string)
        .split(",")
        .map((one) => one.trim())
        .includes(selector)
    ) {
      found.push(...(match[2] as string).split(";").map((one) => one.trim().replace(/\s+/g, " ")));
    }
  }
  return found;
};

describe("reversing a movement", () => {
  it("does not dress the confirmation as the primary action nor cite a document", async () => {
    const host = await show(`/movimientos/${PURCHASE}`, Detail, "/movimientos/:id");
    await press(host, "Anular");
    const dialog = host.querySelector("dialog");
    const confirm = [...(dialog?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent?.trim() === "Anular",
    );
    expect(confirm?.classList.contains("destructive")).toBe(true);
    expect(text(dialog)).not.toMatch(/ADR|append-only/);
    expect(text(dialog)).toContain("No se borra nada");
  });

  it("paints a destructive action in the colour of a loss, not the primary blue", () => {
    expect(declarations("button.destructive")).toContain("background-color: var(--c-negative)");
  });
});
