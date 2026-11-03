// @vitest-environment happy-dom
//
// The questions about the core that the Cartera answers from the domain: what it has earned, what
// it costs over the years and what it projects under the owner's scenarios. Through the real handler
// with the doubles of S3, SSM and Google, on the golden ledger.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FakeIdbFactory } from "../../../packages/adapters/test/fake-idb.js";
import { bootCloud } from "../src/ledger/cloud.js";
import { store } from "../src/ledger/state.js";
import Cartera from "../src/routes/cartera/index.jsx";
import { setPrivacy } from "../src/shell/preferences.js";
import { type Api, apiAt, sameOrigin, signedIn } from "./cloud/api-support.js";
import { goldenText } from "./helpers/golden.js";
import { settle, show, text, type, until, withGoldenLedger } from "./helpers/render.jsx";

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
    // The transfers and the corporate actions of the golden ledger are read: every class has a figure.
    expect(shown).not.toContain("todavía no se calcula");
    expect(shown).toContain("recuperado");
    // The golden ledger has no inflation for its years: the real rate says so instead of a figure.
    expect(shown).toContain("Real: falta el IPC de");
  });

  it("masks the amounts with the privacy mode on and leaves the percentages in sight", async () => {
    setPrivacy(true);
    const host = await show(`/cartera?fecha=${DATE}`, Cartera);
    await until(() => text(host).includes("Has aportado"), "the card");
    const card = text(host.querySelector(".returns-card"));
    expect(card).toMatch(/Has aportado\s*[•·]{4}/);
    expect(card).toMatch(/−?\d+,\d+\s*%/);
    setPrivacy(false);
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
  it("masks the amounts with the privacy mode on", async () => {
    setPrivacy(true);
    const host = await show(`/cartera?fecha=${DATE}`, Cartera);
    await until(() => host.querySelector("#tc-gross") !== null, "the card");
    type(host, "tc-gross", "5");
    await settle(30);
    const card = text(host.querySelector(".total-cost"));
    expect(card).toContain("Coste total en el horizonte");
    expect(card).not.toMatch(/\d,\d{2}\s*€/);
    setPrivacy(false);
  });
});
