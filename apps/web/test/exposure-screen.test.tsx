// @vitest-environment happy-dom
//
// The exposure on screen, through the real handler with the doubles of S3, SSM and Google: the
// block of Cartera and the card of the configuration. Whatever the owner declares is written to the
// cloud object and nowhere else.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FakeIdbFactory } from "../../../packages/adapters/test/fake-idb.js";
import { bootCloud } from "../src/ledger/cloud.js";
import { store } from "../src/ledger/state.js";
import Configuracion from "../src/routes/ajustes/configuracion.jsx";
import Cartera from "../src/routes/cartera/index.jsx";
import { setPrivacy } from "../src/shell/preferences.js";
import { type Api, apiAt, sameOrigin, signedIn } from "./cloud/api-support.js";
import { goldenText } from "./helpers/golden.js";
import {
  choose,
  press,
  settle,
  show,
  text,
  type,
  until,
  withGoldenLedger,
} from "./helpers/render.jsx";

withGoldenLedger();

const holder = globalThis as { indexedDB?: unknown };
const before = holder.indexedDB;
const KEY = "settings/exposure.json";
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

const seeded = {
  exposure_format: 1,
  assets: {
    ast_world: { index: "msci_world" },
    ast_bonds: { index: "global_agg_eur_hedged" },
    ast_smallcap: { currency: { USD: "100" }, region: { north_america: "100" } },
  },
};
const stored = (): unknown => JSON.parse(api.s3.text(KEY) as string);

describe("the exposure block of Cartera", () => {
  it("says where each split comes from, complete and in sight, and counts the assets", async () => {
    const host = await show(`/cartera?fecha=${DATE}`, Cartera);
    await until(() => text(host).includes("Con porcentajes por defecto"), "the block");
    const shown = text(host);
    // Nothing declared and no index known for the synthetic funds: no split, and it says which assets.
    expect(shown).toContain("Por divisa");
    expect(shown).toContain("Sin propuesta");
    expect(shown).toContain("Falta el reparto de");
    // Gold and crypto come by definition, with the label complete.
    expect(shown).toContain("por defecto · Physical gold · por definición");
  });

  it("draws the bars once every asset has a split, with the complete label of each default", async () => {
    api.s3.seed(
      KEY,
      JSON.stringify({
        exposure_format: 1,
        assets: {
          ast_world: { index: "msci_world" },
          ast_smallcap: { index: "msci_world" },
          ast_bonds: { index: "global_agg_eur_hedged" },
          ast_mm: { currency: { EUR: "100" }, region: { europe_developed: "100" } },
        },
      }),
    );
    // A percentage is not an amount: it stays in sight with the privacy mode on.
    setPrivacy(true);
    const host = await show(`/cartera?fecha=${DATE}`, Cartera);
    await until(() => host.querySelector(".exposure-block .share-legend") !== null, "the bars");
    const shown = text(host.querySelector(".exposure-block"));
    expect(shown).toContain(
      "por defecto · MSCI World (según la cartera de SPDR MSCI World UCITS ETF (Acc)) · ficha 02/11/2026",
    );
    expect(shown).toMatch(/USD \d+,\d %/);
    expect(host.querySelectorAll(".exposure-block svg.shares").length).toBe(2);
  });
});

describe("the exposure card of the configuration", () => {
  it("writes only the index chosen, then shows its default with the label", async () => {
    const host = await show(`/ajustes/configuracion?fecha=${DATE}`, Configuracion);
    await until(() => host.querySelector("#exposicion .exposure-row") !== null, "the rows");
    choose(host, "index-ast_world", "msci_world");
    await until(() => api.s3.text(KEY) !== undefined, "the write");
    expect(stored()).toEqual({
      exposure_format: 1,
      assets: { ast_world: { index: "msci_world" } },
    });
    await until(
      () => text(host.querySelector("#exposicion")).includes("ficha 02/11/2026"),
      "the label",
    );
    // Back to the proposal: the asset leaves the file.
    choose(host, "index-ast_world", "");
    await until(
      () =>
        (stored() as { assets: object }).assets !== undefined &&
        Object.keys((stored() as { assets: object }).assets).length === 0,
      "the asset leaving the file",
    );
  });

  it("writes the owner's own percentages, says how much is missing, and restores the defaults", async () => {
    const host = await show(`/ajustes/configuracion?fecha=${DATE}`, Configuracion);
    await until(() => host.querySelector("#exposicion .exposure-row") !== null, "the rows");
    await press(host, "Editar divisa");
    await press(host, "Añadir fila");
    await press(host, "Añadir fila");
    type(host, "split-key-0", "usd");
    type(host, "split-pct-0", "60,5");
    type(host, "split-key-1", "EUR");
    type(host, "split-pct-1", "30");
    await settle();
    expect(text(host)).toContain("Suman 90,5 %: faltan 9,5 para llegar a 100.");
    type(host, "split-pct-1", "39,5");
    await settle();
    expect(text(host)).toContain("Suman 100 %.");
    await press(host, "Guardar");
    await until(() => api.s3.text(KEY) !== undefined, "the write");
    expect(stored()).toEqual({
      exposure_format: 1,
      assets: { ast_world: { currency: { USD: "60.5", EUR: "39.5" } } },
    });
    await until(() => text(host).includes("tuyo"), "the owner's tag");
    await press(host, "Restablecer a los de por defecto");
    await press(host, "Restablecer");
    await until(
      () => Object.keys((stored() as { assets: object }).assets).length === 0,
      "the reset",
    );
  });

  it("refuses a dot, and a stale write reads again and says so", async () => {
    const host = await show(`/ajustes/configuracion?fecha=${DATE}`, Configuracion);
    await until(() => host.querySelector("#exposicion .exposure-row") !== null, "the rows");
    await press(host, "Editar región");
    await press(host, "Añadir fila");
    choose(host, "split-key-0", "global");
    type(host, "split-pct-0", "100");
    await settle();
    // Someone else writes first: our etag is stale.
    api.s3.seed(KEY, JSON.stringify(seeded));
    await press(host, "Guardar");
    await until(
      () => text(host).includes("ha cambiado desde otro dispositivo"),
      "the stale notice",
    );
    expect(stored()).toEqual(seeded);
  });
});
