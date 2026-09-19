// @vitest-environment happy-dom
//
// Settings and the first run as composed in docs/design/system.md §7.1 and
// §7.7: the configuration in groups that fold, the target weights open with
// their total; a benchmark that never offers a delisted asset; the warnings of
// the verification grouped as on the summary; the theme chosen with a
// segmented control; and the first run offering first what this browser can do.

import { describe, expect, it } from "vitest";
import Configuracion from "../src/routes/ajustes/configuracion.jsx";
import Ajustes from "../src/routes/ajustes/index.jsx";
import Verificacion from "../src/routes/ajustes/verificacion.jsx";
import Libro from "../src/routes/libro/index.jsx";
import { optionsOf, show, text, withGoldenLedger } from "./helpers/render.jsx";

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
    expect(text(groups[0]?.querySelector("summary"))).toMatch(/suman [\d.,]+ de 100/);
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
});

describe("the settings", () => {
  it("chooses the theme with a segmented control, the one in force pressed", async () => {
    const host = await show("/ajustes", Ajustes);
    const pressed = [...host.querySelectorAll('.theme-choice button[aria-pressed="true"]')];
    expect(pressed.map(text)).toEqual(["Sistema"]);
  });
});

describe("the first run", () => {
  it("offers first what this browser can do, and the folder after it, dimmed", async () => {
    // happy-dom has no folder picker, like a phone, Firefox or Safari.
    const host = await show("/libro", Libro);
    const choices = [...host.querySelectorAll(".choices > .choice")];
    expect(choices.map((choice) => text(choice.querySelector("h2")))).toEqual([
      "El almacenamiento del navegador",
      "Una carpeta de tu ordenador",
    ]);
    expect(choices[1]?.classList.contains("is-unavailable")).toBe(true);
    expect(choices[1]?.querySelector("button")).toBeNull();
  });
});
