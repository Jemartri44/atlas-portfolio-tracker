// @vitest-environment happy-dom
//
// The plan per platform on the contribution card and the rebalance card
// (feature 028). The figures are the domain's and are tested there; this checks
// that the screen says them, with the sentences that must not be missing: the
// commissions go apart, the deposit is what is left to put in, a rebalance is a
// proposal, and a sale shows its tax before anyone decides.

import { describe, expect, it } from "vitest";
import Cartera from "../src/routes/cartera/index.jsx";
import { press, settle, show, text, type, until, withGoldenLedger } from "./helpers/render.jsx";

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
      expect(text(platform.querySelector("[data-testid=deposit]"))).toMatch(/€/);
      // A commission is the owner's own or it is unknown: never a made-up figure.
      for (const fee of platform.querySelectorAll("[data-testid=fee]")) {
        expect(text(fee)).toMatch(/comisión (desconocida|.*€)/);
      }
    }
  });
});

describe("the rebalance card", () => {
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
