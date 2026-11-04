// @vitest-environment happy-dom
//
// The plan per platform on the contribution card and the rebalance card
// (feature 028). The figures are the domain's and are tested there; this checks
// that the screen says them, with the sentences that must not be missing: the
// commissions go apart, the deposit is what is left to put in, a rebalance is a
// proposal, and a sale shows its tax before anyone decides.

import { describe, expect, it } from "vitest";
import Cartera from "../src/routes/cartera/index.jsx";
import {
  openLedger,
  press,
  settle,
  show,
  text,
  type,
  until,
  withGoldenLedger,
} from "./helpers/render.jsx";
import { withStyles } from "./helpers/styles.js";

withGoldenLedger();

const DATE = "2029-01-10";

const card = (host: HTMLElement, title: string): Element | undefined =>
  [...host.querySelectorAll("section.card")].find((section) =>
    text(section.querySelector("h2")).startsWith(title),
  );

describe("the contribution card per platform", () => {
  it("says what to buy on each platform and how much to deposit, with commissions apart", async () => {
    const host = await show(`/cartera?fecha=${DATE}`, Cartera);
    const aportacion = card(host, "Aportación de");
    expect(text(aportacion)).toContain("Por plataforma");
    expect(text(aportacion)).toContain("Las comisiones van aparte del importe del mes");
    const platforms = [...(aportacion?.querySelectorAll("[data-testid=platform]") ?? [])];
    expect(platforms.length).toBeGreaterThan(0);
    for (const platform of platforms) {
      // The account and its platform by name; the identifiers of the ledger stay out of sight.
      expect(text(platform.querySelector("h4"))).not.toMatch(/\bacc_|\bibkr\b|\bmyinvestor\b/);
      expect(text(platform.querySelector("h4"))).toMatch(/ · (Interactive Brokers|MyInvestor)/);
      expect(text(platform.querySelector("[data-testid=deposit]"))).toMatch(/€/);
      // A commission is the owner's own or it is unknown: never a made-up figure.
      for (const fee of platform.querySelectorAll("[data-testid=fee]")) {
        expect(text(fee)).toMatch(/comisión (desconocida|.*€)/);
        // The figure and its percentage travel in one element, never split across lines.
        if (/%/.test(text(fee))) {
          expect([...fee.children].some((part) => /comisión.*€.*\(.*%\)/.test(text(part)))).toBe(
            true,
          );
        }
      }
    }
  });
});

describe("the rebalance card", () => {
  it("says the new money is for the portfolio, not for the nucleus", async () => {
    const host = await show(`/cartera?fecha=${DATE}`, Cartera);
    expect(text(card(host, "Rebalancear"))).toContain("Dinero nuevo para la cartera");
    expect(text(host)).not.toMatch(/núcleo/i);
  });

  it("is a proposal that waits for the button and writes nothing", async () => {
    const host = await show(`/cartera?fecha=${DATE}`, Cartera);
    const rebalance = card(host, "Rebalancear");
    expect(text(rebalance)).toContain("Propuesta");
    expect(text(rebalance)).toContain("Nada se registra");
    expect(rebalance?.querySelector("[aria-label='Desviación de cada activo']")).toBeNull();
  });

  it("shows the deviation of every asset and the steps after pressing the button", async () => {
    const host = await show(`/cartera?fecha=${DATE}`, Cartera);
    await press(host, "Calcular rebalanceo");
    await until(
      () =>
        card(host, "Rebalancear")?.querySelector("[aria-label='Desviación de cada activo']") !==
        null,
      "the deviation of every asset",
    );
    const rebalance = card(host, "Rebalancear");
    // Either something is beyond the threshold and there are steps, or it says that nothing is.
    const steps = rebalance?.querySelectorAll("[data-testid=step]") ?? [];
    if (steps.length === 0) {
      expect(text(rebalance)).toMatch(/No hace falta rebalancear|Nada que traspasar ni vender/);
    }
    for (const step of steps) {
      expect(text(step)).toMatch(/Sin impuestos|Con impuestos · decides tú/);
      expect(text(step.querySelector("[data-testid=stop-here]"))).toContain("Si te quedas aquí");
      if (step.getAttribute("data-kind") === "sale") {
        expect(text(step.querySelector("[data-testid=tax]"))).toMatch(/Impuesto/);
      }
    }
  });

  it("drops its proposal when the ledger is read again under it", async () => {
    const host = await show(`/cartera?fecha=${DATE}`, Cartera);
    await press(host, "Calcular rebalanceo");
    const shown = () =>
      card(host, "Rebalancear")?.querySelector("[aria-label='Desviación de cada activo']") !== null;
    await until(shown, "the proposal");
    await openLedger(undefined, true);
    await until(() => !shown(), "the proposal to go");
  });

  it("refuses a new-money amount that is not a number without computing", async () => {
    const host = await show(`/cartera?fecha=${DATE}`, Cartera);
    type(host, "rebalance-amount", "1.5");
    await settle();
    expect(host.querySelector("#rebalance-amount-error")).not.toBeNull();
    expect(host.querySelector<HTMLButtonElement>("button[disabled]")?.textContent ?? "").toContain(
      "Calcular rebalanceo",
    );
  });
});

describe("the cards of the portfolio by device", () => {
  it("fold the rebalance on a phone, «mejor en el ordenador», and keep its field there", async () => {
    withStyles(390);
    const host = await show(`/cartera?fecha=${DATE}`, Cartera);
    const rebalance = card(host, "Rebalancear");
    const fold = rebalance?.querySelector("details");
    expect(text(fold?.querySelector("summary"))).toContain("mejor en el ordenador");
    expect(fold?.querySelector("input")).not.toBeNull();
  });

  it("show the rebalance whole on a computer, and the split with its details folded apart", async () => {
    withStyles(1440, 900);
    const host = await show(`/cartera?fecha=${DATE}`, Cartera);
    expect(card(host, "Rebalancear")?.querySelector("details")).toBeNull();
    const split = card(host, "Aportación de");
    const folded = [...(split?.querySelectorAll(":scope > details > summary") ?? [])].map(text);
    expect(folded).toEqual(["Por plataforma (2)", "Por qué este reparto"]);
    const note = [...(split?.querySelectorAll(".note-line") ?? [])].find((line) =>
      text(line).includes("nada se ha registrado"),
    );
    expect(note?.closest("details")).toBeNull();
  });

  it("leave the split and the way to record it on a phone, the rest in one fold", async () => {
    withStyles(390);
    const host = await show(`/cartera?fecha=${DATE}`, Cartera);
    const split = card(host, "Aportación de");
    const fold = split?.querySelector(":scope > details");
    expect(text(fold?.querySelector("summary"))).toBe("Notas, plataformas y por qué");
    expect(fold?.querySelector('table[aria-label="Cálculo del reparto"]')).not.toBeNull();
    expect(text(fold)).toContain("nada se ha registrado");
    expect(
      split?.querySelector('ul[aria-label="Reparto de la aportación"]')?.closest("details"),
    ).toBeNull();
    // That it is a proposal stays said beside the title.
    expect(text(split?.querySelector(".card-head"))).toContain("Propuesta");
  });

  it("fold six cards under a summary line on a phone, and none on a computer", async () => {
    const folded = [
      "Rentabilidad",
      "Exposición",
      "Rebalancear",
      "Costes",
      "Coste total a largo plazo",
      "Proyección",
    ];
    const open = ["Pesos frente al objetivo"];
    withStyles(390);
    const phone = await show(`/cartera?fecha=${DATE}`, Cartera);
    for (const title of folded) {
      const fold = card(phone, title)?.querySelector(":scope > div > details");
      expect(text(fold?.querySelector("summary h2"))).toBe(title);
      expect(text(fold?.querySelector(".fold-summary")).length).toBeGreaterThan(0);
    }
    for (const title of open) {
      expect(
        card(phone, title)?.querySelector(":scope > div > details.disclosure > summary h2"),
      ).toBeNull();
    }
    phone.remove();
    withStyles(1440, 900);
    const computer = await show(`/cartera?fecha=${DATE}`, Cartera);
    expect(computer.querySelector(".fold-card")).toBeNull();
    expect(text(card(computer, "Costes")?.querySelector(":scope > .card-head h2"))).toBe("Costes");
  });
});
