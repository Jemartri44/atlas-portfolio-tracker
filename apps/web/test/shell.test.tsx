// @vitest-environment happy-dom
//
// The frame of the application, **with its stylesheets applied**. The defects
// of the shell were never missing declarations: the rail spread its buttons
// over the whole height, Registrar and Ajustes came out empty from 1024px
// because a rule meant for another list hid theirs, two elements claimed to be
// the current page, and an id appeared twice. A test that reads a stylesheet
// for the presence of a line sees none of that; one that asks the document
// what it applies, at the width of each device, sees all of it.

import type { JSX } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { store } from "../src/ledger/state.js";
import Ajustes from "../src/routes/ajustes/index.jsx";
import Registrar from "../src/routes/registrar/index.jsx";
import Resumen from "../src/routes/resumen/index.jsx";
import { showInShell, withGoldenLedger } from "./helpers/render.jsx";
import { applied, pixels, withoutStyles, withStyles } from "./helpers/styles.js";

withGoldenLedger();
afterEach(() => withoutStyles());

const ROUTES = { "/": Resumen, "/registrar": Registrar, "/ajustes": Ajustes };

/** Seen: nothing between it and the page is hidden or collapsed away. */
const isShown = (element: Element | null | undefined): boolean => {
  for (
    let node = element ?? null;
    node !== null && node !== document.body;
    node = node.parentElement
  ) {
    if (applied(node, "display") === "none" || applied(node, "visibility") === "hidden") {
      return false;
    }
  }
  return element !== null && element !== undefined;
};

/** The element of the page whose own text is exactly this. */
const byText = (host: HTMLElement, words: string): Element | undefined =>
  [...host.querySelectorAll("main *")].find((element) =>
    [...element.childNodes].some(
      (node) => node.nodeType === 3 && node.textContent?.trim() === words,
    ),
  );

const DEVICES = [
  { name: "su móvil", width: 400 },
  { name: "una tableta en horizontal", width: 1024 },
  { name: "un portátil", width: 1440 },
  { name: "su monitor", width: 2045 },
];

describe("the content of every screen is shown at every width", () => {
  for (const device of DEVICES) {
    it(`shows Registrar and Ajustes on ${device.name} (${device.width}px)`, async () => {
      withStyles(device.width);
      const record = await showInShell("/registrar", ROUTES);
      expect(isShown(byText(record, "Compra"))).toBe(true);
      expect(isShown(byText(record, "Alta de activo"))).toBe(true);
      document.body.innerHTML = "";

      const settings = await showInShell("/ajustes", ROUTES);
      expect(isShown(byText(settings, "Configuración"))).toBe(true);
      expect(isShown(byText(settings, "Verificación"))).toBe(true);
    });
  }
});

describe("one navigation, in the order the eye reads it", () => {
  const order = (host: HTMLElement): string[] =>
    [...host.querySelectorAll("nav a")].map((link) => (link.textContent ?? "").trim());

  it("puts Registrar in the middle of the bottom bar, and its tab stop there too", async () => {
    withStyles(400);
    const host = await showInShell("/", ROUTES);
    expect(order(host)).toEqual(["Resumen", "Movimientos", "Registrar", "Cartera", "Cubo"]);
    expect(applied(host.querySelector("nav"), "position")).toBe("fixed");
  });

  it("puts Registrar after the group of the top bar from 1200px, in the DOM too", async () => {
    withStyles(1440);
    const host = await showInShell("/", ROUTES);
    expect(order(host)).toEqual(["Resumen", "Movimientos", "Cartera", "Cubo", "Registrar"]);
    expect(applied(host.querySelector("nav"), "position")).toBe("static");
  });

  it("comes before the content in the document", async () => {
    const host = await showInShell("/", ROUTES);
    const nav = host.querySelector("nav");
    const main = host.querySelector("main");
    expect(nav).not.toBeNull();
    expect(
      (main?.compareDocumentPosition(nav as Node) ?? 0) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
    expect(host.querySelectorAll("nav")).toHaveLength(1);
  });

  it("marks one current page, never two", async () => {
    for (const url of ["/", "/registrar", "/ajustes"]) {
      const host = await showInShell(url, ROUTES);
      const current = [...host.querySelectorAll('[aria-current="page"]')].map(
        (element) => `${url} → ${element.outerHTML.slice(0, 80)}`,
      );
      expect(current, current.join("\n")).toHaveLength(1);
      document.body.innerHTML = "";
    }
  });

  it("marks the section of a page under it: a detail, a correction, a form", async () => {
    const pages: Record<string, (props: never) => JSX.Element> = {
      "/movimientos/:id": () => <p>detalle</p>,
      "/movimientos/:id/editar": () => <p>corregir</p>,
      "/registrar/:tipo": () => <p>formulario</p>,
      "/ajustes/configuracion": () => <p>configuración</p>,
    };
    const expected: [string, string][] = [
      ["/movimientos/01ARYZ6S41TSV4RRFFQ6900001", "Movimientos"],
      ["/movimientos/01ARYZ6S41TSV4RRFFQ6900001/editar", "Movimientos"],
      ["/registrar/buy", "Registrar"],
      ["/ajustes/configuracion", "Ajustes"],
    ];
    for (const [url, section] of expected) {
      const host = await showInShell(url, pages);
      const current = [...host.querySelectorAll('[aria-current="page"]')];
      expect(current, url).toHaveLength(1);
      expect(
        current[0]?.textContent?.includes(section) ||
          current[0]?.getAttribute("aria-label") === section,
        `${url}: ${current[0]?.outerHTML.slice(0, 80)}`,
      ).toBe(true);
      document.body.innerHTML = "";
    }
  });

  it("writes no id twice", async () => {
    for (const url of ["/", "/ajustes"]) {
      const host = await showInShell(url, ROUTES);
      const ids = [...host.querySelectorAll("[id]")].map((element) => element.id);
      expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
      document.body.innerHTML = "";
    }
  });

  it("labels the bar at 13px or more, never the 10px it had", async () => {
    withStyles(400);
    const host = await showInShell("/", ROUTES);
    for (const label of host.querySelectorAll(".nav-label")) {
      expect(pixels(applied(label, "font-size"))).toBeGreaterThanOrEqual(13);
    }
  });

  it("has no navigation while no ledger is open, and has it with an empty one", async () => {
    store.setLoad({ phase: "unconfigured" });
    const first = await showInShell("/", { "/": () => <p>primer arranque</p> });
    expect(first.querySelector("nav")).toBeNull();
    document.body.innerHTML = "";
    store.setLoad({ phase: "loading" });
    const loading = await showInShell("/", { "/": () => <p>cargando</p> });
    expect(loading.querySelector("nav")).not.toBeNull();
  });
});
