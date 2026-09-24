// @vitest-environment happy-dom
//
// Importing a ledger over the one this browser holds asks first (feature 012,
// block 0): it used to replace it without a word. And a session that wrote in
// the console's folder is told that the web no longer does.
//
// The browser storage here is the IndexedDB double of the adapters, installed
// as `indexedDB`, so the real `BrowserLedgerBlob` runs underneath.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FakeIdbFactory } from "../../../packages/adapters/test/fake-idb.js";
import { store } from "../src/ledger/state.js";
import Libro from "../src/routes/libro/index.jsx";
import { goldenText } from "./helpers/golden.js";
import { settle, show, text, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

const factory = new FakeIdbFactory();
const holder = globalThis as { indexedDB?: unknown };
const before = holder.indexedDB;

beforeAll(() => {
  holder.indexedDB = factory;
});

afterAll(() => {
  holder.indexedDB = before;
});

/** The ledger this browser holds, straight from the double. */
const held = (): string =>
  (factory.databases.get("atlas")?.store("ledger").get("current") as { text: string } | undefined)
    ?.text ?? "";

const choose = async (host: HTMLElement, content: string): Promise<void> => {
  const input = host.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, "files", {
    value: [{ text: () => Promise.resolve(content) }],
    configurable: true,
  });
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await settle(40);
};

const button = (host: HTMLElement, label: string): HTMLButtonElement =>
  [...host.querySelectorAll("button")].find(
    (candidate) => text(candidate) === label,
  ) as HTMLButtonElement;

describe("importing over the ledger of this browser", () => {
  it("imports without asking when there is nothing to replace", async () => {
    const host = await show("/libro", Libro);
    const golden = goldenText();
    await choose(host, golden);
    expect(held()).toBe(golden);
    expect(text(host)).not.toContain("¿Sustituir");
  });

  it("asks with both numbers when there is something, and only replaces on yes", async () => {
    const current = held();
    expect(current).not.toBe("");
    const smaller = `${current.split("\n").slice(0, 3).join("\n")}\n`;
    const host = await show("/libro", Libro);
    await choose(host, smaller);
    const said = text(host);
    expect(said).toContain("¿Sustituir los datos de este navegador?");
    expect(said).toContain(`Este navegador tiene ${current.split("\n").length - 1} movimientos`);
    expect(said).toContain("el archivo elegido trae 3 movimientos");
    expect(held()).toBe(current);
    button(host, "Cancelar").click();
    await settle(20);
    expect(text(host)).not.toContain("¿Sustituir");
    expect(held()).toBe(current);
    await choose(host, smaller);
    button(host, "Sustituir").click();
    await settle(60);
    expect(held()).toBe(smaller);
  });

  it("refuses a file that is not a ledger before asking anything", async () => {
    const current = held();
    const host = await show("/libro", Libro);
    await choose(host, "no es un libro\n");
    expect(text(host)).not.toContain("¿Sustituir");
    expect(text(host)).toContain("No se ha podido abrir");
    expect(held()).toBe(current);
  });
});

describe("a session that wrote in the console's folder", () => {
  it("is told that the web no longer writes there, and that the file is intact", async () => {
    const host = await show("/libro", Libro);
    store.setLoad({ phase: "unconfigured", retiredFolder: true });
    await settle();
    const said = text(host);
    expect(said).toContain("La web ya no escribe en la carpeta de la consola");
    expect(said).toContain("sigue intacto");
  });
});
