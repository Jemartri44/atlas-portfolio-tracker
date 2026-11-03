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
import { show, text, until, withGoldenLedger } from "./helpers/render.jsx";

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
    // The golden ledger has no inflation for its years: the real rate says so instead of a figure.
    expect(shown).toContain("Real: falta el IPC de");
  });

  it("shows the rate after tax beside the one before, and says the open year's tax is not in it", async () => {
    const host = await show("/cartera?fecha=2028-06-30", Cartera);
    await until(
      () => text(host).includes("después de impuestos (estimación)"),
      "the rate after tax",
    );
    const card = text(host.querySelector(".returns-card"));
    expect(card).toContain("Rentabilidad anual, ponderada por dinero");
    expect(card).toMatch(
      /Rentabilidad anual después de impuestos \(estimación\)\s*[+−]?\d+,\d\s*%/,
    );
    expect(card).toContain("Impuestos estimados de la cartera principal");
    expect(card).toContain("Sin el impuesto de 2028, que se calcula al cerrar el año.");
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
