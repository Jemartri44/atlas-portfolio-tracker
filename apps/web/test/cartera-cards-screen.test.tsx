// @vitest-environment happy-dom
//
// The questions about the core that the Cartera answers from the domain: what it has earned, what
// it costs and what it projects in three cases. Through the real handler
// with the doubles of S3, SSM and Google, on the golden ledger.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootCloud } from "../src/ledger/cloud.js";
import { store } from "../src/ledger/state.js";
import Cartera from "../src/routes/cartera/index.jsx";
import { setPrivacy } from "../src/shell/preferences.js";
import { type Api, apiAt, sameOrigin, signedIn } from "./cloud/api-support.js";
import { goldenText } from "./helpers/golden.js";
import { press, settle, show, text, type, until, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

const DATE = "2027-12-31";

let api: Api;

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

  it("shows the rate after tax beside the one before, loaded on demand", async () => {
    const host = await show("/cartera?fecha=2028-12-31", Cartera);
    await until(
      () =>
        text(host).includes("después de impuestos (estimación)") &&
        !text(host).includes("calculando…"),
      "the rate after tax",
    );
    const card = text(host.querySelector(".returns-card"));
    expect(card).toContain("Rentabilidad anual, ponderada por dinero");
    expect(card).toMatch(/Rentabilidad anual después de impuestos \(estimación\)[+−]?\d+,\d\s*%/);
    expect(card).toContain("Impuestos estimados de la cartera principal");
    expect(card).toContain("Lo pagado por la Renta no se resta");
    // On 31/12 the year is closed: nothing is left out.
    expect(card).not.toContain("Sin el impuesto de");
  }, 30_000);

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

describe("the projection", () => {
  const card = (host: Element) => text(host.querySelector(".projection-card"));
  const open = async () => {
    const host = await show(`/cartera?fecha=${DATE}`, Cartera);
    await until(() => host.querySelector("#pj-years") !== null, "the card");
    return host;
  };
  const box = (host: Element, label: string) =>
    [...host.querySelectorAll(".projection-boxes label")]
      .find((row) => row.textContent?.includes(label))
      ?.querySelector("input") as HTMLInputElement;

  it("starts with the published figures, three cases and everything discounted", async () => {
    const host = await open();
    await until(() => card(host).includes("Normal, dentro de 20 años"), "the cases");
    expect((host.querySelector("#pj-equity-return") as HTMLInputElement).value).toBe("7");
    expect((host.querySelector("#pj-crypto-volatility") as HTMLInputElement).value).toBe("55");
    expect(card(host)).toContain("J.P. Morgan 2027 · datos a 30/09/2026 · en euros");
    expect(card(host)).toContain("bitcoin, en dólares");
    expect(card(host)).toContain("Pesimista, dentro de 20 años");
    expect(card(host)).toContain("Qué se llevan los costes");
    expect(card(host)).toContain("inflación");
    expect(card(host)).not.toContain("Objetivo");
  });

  it("says what is discounted as each box is unmarked, and nothing at the end", async () => {
    const host = await open();
    await until(() => card(host).includes("Normal, dentro de 20 años"), "the cases");
    for (const label of ["Inflación", "Impuestos al vender", "Comisiones y TER"]) {
      box(host, label).click();
    }
    await until(() => card(host).includes("Sin descontar nada."), "the sentence");
  });

  it("keeps the very input (and its focus) while the owner types in it", async () => {
    const host = await open();
    const input = host.querySelector("#pj-equity-return") as HTMLInputElement;
    input.focus();
    type(host, "pj-equity-return", "6");
    // negative wait: nothing to poll (the input must survive the re-render)
    await settle(3);
    expect(host.querySelector("#pj-equity-return")).toBe(input);
    expect(document.activeElement).toBe(input);
  });

  it("says what a wrong figure is", async () => {
    const host = await open();
    type(host, "pj-years", "veinte");
    await until(() => /entero|número|válid/i.test(card(host)), "the error");
  });

  const KEY = "settings/projection.json";
  const ready = (host: Element) =>
    until(
      () => (host.querySelector("#pj-gold-return") as HTMLInputElement).value === "4",
      "what is stored",
    );

  it("keeps only what was edited, and reads it back when it opens again", async () => {
    const host = await open();
    await until(() => card(host).includes("Normal, dentro de 20 años"), "the cases");
    type(host, "pj-gold-return", "4");
    await until(() => api.s3.text(KEY) !== undefined, "the write");
    expect(JSON.parse(api.s3.text(KEY) as string)).toEqual({
      projection_format: 1,
      classes: { gold: { return_pct: "4" } },
    });
    await ready(await open());
  });

  it("leaves what is typed as it is once it is saved", async () => {
    const host = await open();
    await until(() => card(host).includes("Normal, dentro de 20 años"), "the cases");
    type(host, "pj-gold-return", "4,50");
    await until(() => api.s3.text(KEY) !== undefined, "the write");
    await settle(3);
    expect((host.querySelector("#pj-gold-return") as HTMLInputElement).value).toBe("4,50");
  });

  it("goes back to the published figures with Restablecer", async () => {
    api.s3.seed(KEY, '{"projection_format":1,"classes":{"gold":{"return_pct":"4"}}}\n');
    const host = await open();
    await ready(host);
    await press(host, "Restablecer");
    await until(() => api.s3.text(KEY) === '{"projection_format":1}\n', "the reset");
    expect((host.querySelector("#pj-gold-return") as HTMLInputElement).value).toBe("5");
  });

  it("says a stored object it cannot read, and shows the published figures", async () => {
    api.s3.seed(KEY, '{"projection_format":9}\n');
    const host = await open();
    await until(() => card(host).includes("no se pueden leer"), "the notice");
    expect((host.querySelector("#pj-gold-return") as HTMLInputElement).value).toBe("5");
  });

  it("re-reads and says so when another device wrote first, keeping what is there", async () => {
    api.s3.seed(KEY, '{"projection_format":1,"years":30}\n');
    const host = await open();
    await until(
      () => (host.querySelector("#pj-years") as HTMLInputElement).value === "30",
      "what is stored",
    );
    api.s3.seed(KEY, '{"projection_format":1,"years":40}\n');
    type(host, "pj-gold-return", "4");
    await until(() => card(host).includes("desde otro dispositivo"), "the conflict");
    expect(api.s3.text(KEY)).toBe('{"projection_format":1,"years":40}\n');
    expect((host.querySelector("#pj-years") as HTMLInputElement).value).toBe("40");
  });

  it("masks the amounts with the privacy mode on", async () => {
    setPrivacy(true);
    const host = await open();
    await until(() => card(host).includes("Normal, dentro de 20 años"), "the cases");
    expect(card(host)).not.toMatch(/\d,\d{2}\s*€/);
    setPrivacy(false);
  });
});
