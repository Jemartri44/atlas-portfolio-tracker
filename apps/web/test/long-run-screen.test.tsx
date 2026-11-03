// @vitest-environment happy-dom
//
// The three questions about the core that the Cartera answers from the domain: what it has earned,
// what it projects under the owner's scenarios, and what it costs over the years. Through the real
// handler with the doubles of S3, SSM and Google, on the golden ledger.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FakeIdbFactory } from "../../../packages/adapters/test/fake-idb.js";
import { bootCloud } from "../src/ledger/cloud.js";
import { store } from "../src/ledger/state.js";
import Cartera from "../src/routes/cartera/index.jsx";
import { type Api, apiAt, sameOrigin, signedIn } from "./cloud/api-support.js";
import { goldenText } from "./helpers/golden.js";
import { press, settle, show, text, type, until, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

const holder = globalThis as { indexedDB?: unknown };
const before = holder.indexedDB;
const DATE = "2027-12-31";

let api: Api;

beforeAll(() => {
  holder.indexedDB = new FakeIdbFactory();
});
afterAll(() => {
  holder.indexedDB = before;
});

beforeEach(async () => {
  api = apiAt();
  api.s3.seed("ledger/ledger.jsonl", goldenText());
  const { cookie } = await signedIn(api);
  await bootCloud(sameOrigin(api, () => cookie));
  await until(() => store.load().phase === "ready", "the ledger");
});

afterEach(() => {
  store.setDeps(undefined);
  store.setPending(undefined);
});

describe("the return of the core", () => {
  it("says what was contributed, what it is worth and what it earned, and the same by class", async () => {
    const host = await show(`/cartera?fecha=${DATE}`, Cartera);
    await until(() => text(host).includes("Has aportado"), "the card");
    const shown = text(host);
    expect(shown).toContain("Vale ahora");
    expect(shown).toContain("Has ganado");
    expect(shown).toContain("Rentabilidad anual, ponderada por dinero");
    expect(shown).toContain("Rentabilidad anual real, descontando el IPC");
    expect(shown).toContain("Por tipo de activo");
    // A class without a figure says why, in a sentence, and not squeezed in a cell.
    expect(shown).toContain("Oro: sin cifra por una operación corporativa.");
  });
});

describe("the projection", () => {
  it("asks for the returns instead of inventing them, then projects once they are typed", async () => {
    const host = await show(`/cartera?fecha=${DATE}`, Cartera);
    await until(() => host.querySelector("#pj-years") !== null, "the card");
    expect(text(host.querySelector(".projection-card"))).toContain("Falta la rentabilidad de");
    for (const input of host.querySelectorAll("input[id^='pj-0-']")) {
      type(host, input.id, "5");
    }
    await settle(30);
    const card = text(host.querySelector(".projection-card"));
    expect(card).toContain("Dentro de 20 años");
    expect(card).not.toContain("Falta la rentabilidad de");
  });

  it("keeps up to three scenarios and says what a wrong figure is", async () => {
    const host = await show(`/cartera?fecha=${DATE}`, Cartera);
    await until(() => host.querySelector("#pj-years") !== null, "the card");
    await press(host, "Añadir un escenario");
    await press(host, "Añadir un escenario");
    expect(host.querySelectorAll("[id^='pj-name-']").length).toBe(3);
    expect(
      [...host.querySelectorAll("button")].some((b) => b.textContent === "Añadir un escenario"),
    ).toBe(false);
    type(host, "pj-years", "veinte");
    await settle(30);
    expect(text(host.querySelector(".projection-card"))).toMatch(/entero|número|válid/i);
  });
});

describe("the total cost", () => {
  it("shows no figure without a gross return, and the costs once it is typed", async () => {
    const host = await show(`/cartera?fecha=${DATE}`, Cartera);
    await until(() => host.querySelector("#tc-gross") !== null, "the card");
    expect(text(host.querySelector(".total-cost"))).toContain(
      "Escribe la rentabilidad bruta anual",
    );
    type(host, "tc-gross", "5");
    await settle(30);
    const card = text(host.querySelector(".total-cost"));
    expect(card).toContain("Coste total en el horizonte");
    expect(card).toContain("Se lleva el TER");
    type(host, "tc-gross", "5,x");
    await settle(30);
    expect(text(host.querySelector(".total-cost"))).not.toContain("Coste total en el horizonte");
  });
});
