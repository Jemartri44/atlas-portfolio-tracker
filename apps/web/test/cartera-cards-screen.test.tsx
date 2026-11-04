// @vitest-environment happy-dom
//
// The questions about the core that the Cartera answers from the domain: what it has earned, what
// it costs over the years and what it projects under the owner's scenarios. Through the real handler
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

describe("the total cost", () => {
  it("shows no figure without a gross return, and the costs once it is typed", async () => {
    const host = await show(`/cartera?fecha=${DATE}`, Cartera);
    await until(() => host.querySelector("#tc-gross") !== null, "the card");
    expect(text(host.querySelector(".total-cost"))).toContain(
      "Escribe la rentabilidad bruta anual",
    );
    type(host, "tc-gross", "5");
    const costText = () => text(host.querySelector(".total-cost"));
    await until(() => costText().includes("Coste total en el horizonte"), "the cost");
    expect(costText()).toContain("Se lleva el TER");
    type(host, "tc-gross", "5,x");
    await until(() => !costText().includes("Coste total en el horizonte"), "the cost to go");
  });
  it("masks the amounts with the privacy mode on", async () => {
    setPrivacy(true);
    const host = await show(`/cartera?fecha=${DATE}`, Cartera);
    await until(() => host.querySelector("#tc-gross") !== null, "the card");
    type(host, "tc-gross", "5");
    await until(
      () => text(host.querySelector(".total-cost")).includes("Coste total en el horizonte"),
      "the cost",
    );
    const card = text(host.querySelector(".total-cost"));
    expect(card).not.toMatch(/\d,\d{2}\s*€/);
    setPrivacy(false);
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
    await until(
      () => text(host.querySelector(".projection-card")).includes("Dentro de 20 años"),
      "the projection",
    );
    const card = text(host.querySelector(".projection-card"));
    // Year by year, in the table that goes with the chart.
    expect(card).toContain("Ver los datos de la gráfica");
    expect(card).toContain("31/12/2028");
    expect(card).not.toContain("Falta la rentabilidad de");
  });

  it("keeps the very input (and its focus) while the owner types in it", async () => {
    const host = await show(`/cartera?fecha=${DATE}`, Cartera);
    await until(() => host.querySelector("#pj-years") !== null, "the card");
    for (const id of ["pj-name-0", "pj-0-equity"]) {
      const input = host.querySelector(`#${id}`) as HTMLInputElement;
      input.focus();
      type(host, id, "5");
      // negative wait: nothing to poll (the input must survive the re-render)
      await settle(3);
      expect(host.querySelector(`#${id}`)).toBe(input);
      expect(document.activeElement).toBe(input);
    }
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
    await until(
      () => /entero|número|válid/i.test(text(host.querySelector(".projection-card"))),
      "the error",
    );
  });
  it("masks the amounts with the privacy mode on and leaves the blended return in sight", async () => {
    setPrivacy(true);
    const host = await show(`/cartera?fecha=${DATE}`, Cartera);
    await until(() => host.querySelector("#pj-years") !== null, "the card");
    for (const input of host.querySelectorAll("input[id^='pj-0-']")) {
      type(host, input.id, "5");
    }
    type(host, "pj-goal", "300000");
    await until(
      () => text(host.querySelector(".projection-card")).includes("Dentro de 20 años"),
      "the projection",
    );
    const card = text(host.querySelector(".projection-card"));
    expect(card).toContain("Rentabilidad mezclada con tus pesos objetivo");
    expect(card).not.toMatch(/\d,\d{2}\s*€/);
    // The goal is an amount too: masked in the result, where the sentence says when it is reached.
    expect(card).not.toContain("300.000");
    expect(card).toContain("Objetivo");
    setPrivacy(false);
  });

  it("shows the goal as an amount next to when it is reached, with the privacy mode off", async () => {
    const host = await show(`/cartera?fecha=${DATE}`, Cartera);
    await until(() => host.querySelector("#pj-years") !== null, "the card");
    for (const input of host.querySelectorAll("input[id^='pj-0-']")) {
      type(host, input.id, "5");
    }
    type(host, "pj-goal", "300000");
    await until(
      () => text(host.querySelector(".projection-card")).includes("300.000,00"),
      "the goal",
    );
  });

  it("says a goal that is not above zero, and removes a scenario", async () => {
    const host = await show(`/cartera?fecha=${DATE}`, Cartera);
    await until(() => host.querySelector("#pj-years") !== null, "the card");
    type(host, "pj-goal", "0");
    await until(
      () =>
        text(host.querySelector(".projection-card")).includes(
          "El objetivo tiene que ser mayor que cero.",
        ),
      "the message of a goal that is not above zero",
    );
    await press(host, "Añadir un escenario");
    expect(host.querySelectorAll("[id^='pj-name-']").length).toBe(2);
    await press(host, "Quitar este escenario");
    expect(host.querySelectorAll("[id^='pj-name-']").length).toBe(1);
  });
});
