// @vitest-environment happy-dom
//
// Settings and the first run as composed in docs/design/system.md §7.1 and
// §7.7: the configuration in groups that fold, the target weights open with
// their total; a benchmark that never offers a delisted asset; the warnings of
// the verification grouped as on the summary; the theme chosen with a
// segmented control; and the first run offering first what this browser can do.

import { describe, expect, it, vi } from "vitest";
import Configuracion from "../src/routes/ajustes/configuracion.jsx";
import Ajustes from "../src/routes/ajustes/index.jsx";
import Verificacion from "../src/routes/ajustes/verificacion.jsx";
import Libro from "../src/routes/libro/index.jsx";
import { optionsOf, show, text, today, withGoldenLedger } from "./helpers/render.jsx";
import { withoutStyles, withStyles } from "./helpers/styles.js";

withGoldenLedger();

describe("the configuration", () => {
  it("folds its groups, with the target weights open and their total in sight", async () => {
    const host = await show("/ajustes/configuracion", Configuracion);
    const groups = [...host.querySelectorAll("details.fold")];
    expect(groups.map((group) => text(group.querySelector("summary h2")))).toEqual([
      "Pesos objetivo",
      "Umbrales y avisos",
      "Cubo e identidad fiscal",
      "Fecha fiscal y ventana de recompra",
    ]);
    expect(groups.map((group) => (group as HTMLDetailsElement).open)).toEqual([
      true,
      false,
      false,
      false,
    ]);
    expect(text(groups[0]?.querySelector("summary"))).toContain("suman 100 %");
  });

  it("asks a weight only of a live asset, not of one a merger converted away", async () => {
    // After the fund merger of 07/02/2028 and the class change of 06/03/2028.
    today("2029-01-10");
    const host = await show("/ajustes/configuracion", Configuracion);
    vi.useRealTimers();
    const asked = [...host.querySelectorAll("details.fold")][0];
    const labels = [...(asked?.querySelectorAll(".field > label") ?? [])].map(text);
    // Their units became Small Cap Index Fund B and Global Bond Index Fund I:
    // the catalogue still says «active», and they hold nothing.
    expect(labels.some((label) => label.startsWith("Small Cap Index Fund B"))).toBe(true);
    expect(labels.some((label) => label.startsWith("Global Bond Index Fund I"))).toBe(true);
    expect(labels.some((label) => /^Small Cap Index Fund \(/.test(label))).toBe(false);
    expect(labels.some((label) => /^Global Bond Index Fund \(/.test(label))).toBe(false);
    // Every field asked is filled in: none of them is a weight left empty.
    const inputs = [...(asked?.querySelectorAll("input") ?? [])] as HTMLInputElement[];
    expect(inputs.every((input) => input.value !== "")).toBe(true);
  });

  it("never offers a delisted asset as the benchmark of the bucket", async () => {
    const host = await show("/ajustes/configuracion", Configuracion);
    const offered = optionsOf(host, "s-benchmark");
    expect(offered.length).toBeGreaterThan(1);
    expect(offered.join(" | ")).not.toContain("Alpha Spin-off");
  });
});

describe("the verification", () => {
  it("says the warnings of the data with the one notice, each with its events", async () => {
    const host = await show("/ajustes/verificacion", Verificacion);
    const warnings = host.querySelector('[aria-label="Avisos de tus datos"]');
    const notices = [...(warnings?.querySelectorAll(".notice") ?? [])];
    expect(notices.length).toBeGreaterThan(0);
    // No notice is a link that holds links: the events are the links.
    expect(warnings?.querySelector("a.notice")).toBeNull();
    expect(warnings?.querySelector(".notice .event-links a")).not.toBeNull();
  });

  it("names the command line only beside a folder, where it can be run", async () => {
    // The data of these tests do not come from a folder: a phone, as it were.
    const host = await show("/ajustes/verificacion", Verificacion);
    expect(text(host)).not.toContain("atlas backup");
    expect(text(host)).toContain("exporta tus datos desde Ajustes");
  });
});

describe("the settings", () => {
  it("chooses the theme with a segmented control, the one in force pressed", async () => {
    const host = await show("/ajustes", Ajustes);
    const pressed = [...host.querySelectorAll('.theme-choice button[aria-pressed="true"]')];
    expect(pressed.map(text)).toEqual(["Sistema"]);
  });
});

describe("the first run", () => {
  it("keeps the data in this browser, with one primary button and no folder where there is none", async () => {
    // happy-dom has no folder picker, like a phone, Firefox or Safari.
    const host = await show("/libro", Libro);
    const choices = [...host.querySelectorAll(".choices > .choice")];
    expect(choices.map((choice) => text(choice.querySelector("h2")))).toEqual([
      "Tus datos, en este navegador",
    ]);
    const primary = [...host.querySelectorAll(".choice button")].filter(
      (button) => !button.classList.contains("secondary"),
    );
    expect(primary.map(text)).toEqual(["Seguir con los datos de este navegador"]);
    expect(text(host)).not.toContain("carpeta de la consola");
    expect(text(host)).toContain("No es un almacén definitivo");
  });

  it("says once that nothing was touched when a chosen file cannot be read", async () => {
    const host = await show("/libro", Libro);
    const input = host.querySelector('input[type="file"]') as HTMLInputElement;
    const unreadable = {
      text: () => Promise.reject(new DOMException("gone", "NotReadableError")),
    };
    Object.defineProperty(input, "files", { value: [unreadable], configurable: true });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 30));
    const said = text(host.querySelector(".notice"));
    expect(said).toContain("No se ha podido leer el archivo");
    expect(said.match(/no se ha tocado nada/gi)).toHaveLength(1);
  });

  it("offers to import from the console's folder where there is one, and says the two are apart", async () => {
    const picker = window as unknown as { showDirectoryPicker?: () => Promise<never> };
    picker.showDirectoryPicker = () => Promise.reject(new Error("no se usa"));
    withStyles(2045, 1141);
    try {
      const host = await show("/libro", Libro);
      const buttons = [...host.querySelectorAll(".choice button")];
      expect(buttons.filter((button) => !button.classList.contains("secondary")).map(text)).toEqual(
        ["Seguir con los datos de este navegador"],
      );
      const folder = buttons.find((button) => text(button).includes("carpeta de la consola"));
      expect(folder?.classList.contains("secondary")).toBe(true);
      // The consequence of the decision of feature 012, written and not hidden.
      expect(text(host)).toContain("no comparten un libro vivo");
    } finally {
      delete picker.showDirectoryPicker;
      withoutStyles();
    }
  });
});
