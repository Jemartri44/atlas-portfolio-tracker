// @vitest-environment happy-dom
//
// The ECB rate in the form: proposed from the history read from the cloud for the fiscal
// date, never invented, and a typed rate that is not the official one asks for its yes before the
// write.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { forgetWebHistory, reloadWebHistory } from "../src/ecb/history.js";
import RegistrarForm from "../src/routes/registrar/form.jsx";
import { serveReference } from "./helpers/cloud-reference.js";
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
import { withoutStyles, withStyles } from "./helpers/styles.js";

withGoldenLedger();

const synthetic = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../../tests/fixtures/ecb/eurofxref-hist.csv"),
  "utf8",
);

let restore: (() => void) | undefined;
beforeAll(async () => {
  restore = serveReference({ ecb: { csv: synthetic } });
  await reloadWebHistory();
});

afterAll(() => {
  restore?.();
  forgetWebHistory();
});

const value = (host: HTMLElement, id: string): string =>
  (host.querySelector(`#${id}`) as HTMLInputElement | null)?.value ?? "";

const hasButton = (host: HTMLElement, label: string): boolean =>
  [...host.querySelectorAll("button")].some(
    (button) => button.textContent?.trim() === label && !button.disabled,
  );

const goldBuy = async (trade: string): Promise<HTMLElement> => {
  const host = await show("/registrar/buy", RegistrarForm, "/registrar/:tipo");
  choose(host, "f-account_id", "acc_ibkr");
  choose(host, "f-asset_id", "ast_gold");
  await settle();
  type(host, "f-trade_date", trade);
  type(host, "f-value_date", trade);
  type(host, "f-quantity", "1");
  type(host, "f-unit_price", "100");
  await until(() => host.querySelector("#f-fx_rate") !== null, "the exchange rate field");
  return host;
};

describe("the ECB rate in the form", () => {
  it("proposes the official rate of the fiscal date, as the history writes it", async () => {
    const host = await goldBuy("2026-01-02");
    await until(() => value(host, "f-fx_rate") === "1,1169");
    expect(value(host, "f-fx_rate_date")).toBe("2026-01-02");
    expect(text(host)).toContain("Tipo propuesto por el histórico del BCE");
  });

  it("proposes nothing for a day the ECB has not published, and takes the euro's 1 away", async () => {
    const host = await goldBuy("2026-04-01");
    await until(() => text(host).includes("El BCE todavía no ha publicado este tipo"));
    expect(value(host, "f-fx_rate")).toBe("");
  });

  it("asks for the yes when the typed rate is not the official one, and only writes after it", async () => {
    const host = await goldBuy("2026-01-02");
    await until(() => value(host, "f-fx_rate") === "1,1169");
    type(host, "f-fx_rate", "1,2");
    await until(() => hasButton(host, "Ver el efecto"), "the effect button");
    await press(host, "Ver el efecto");
    await until(() => text(host).includes("El tipo no es el oficial"));
    expect(text(host)).toContain("el BCE publicó 1,1169");
    const confirm = [...host.querySelectorAll("section.effect button")].find(
      (button) => button.textContent?.trim() === "Registrar",
    ) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    (host.querySelector("#confirm-fx-rate") as HTMLInputElement).click();
    await until(() => !confirm.disabled, "el sí al tipo");
  });

  it("does not ask when the typed rate is the same number written otherwise", async () => {
    const host = await goldBuy("2026-01-02");
    await until(() => value(host, "f-fx_rate") === "1,1169");
    type(host, "f-fx_rate", "1,11690");
    await until(() => hasButton(host, "Ver el efecto"), "the effect button");
    await press(host, "Ver el efecto");
    await until(() => host.querySelector("section.effect") !== null);
    expect(text(host)).not.toContain("El tipo no es el oficial");
  });
});

describe("the effect beside the form, in a foreign currency", () => {
  it("still comes when the form fills the ECB rate on its own after the last key", async () => {
    withStyles(1440, 900);
    try {
      const host = await goldBuy("2026-01-02");
      await until(() => value(host, "f-fx_rate") === "1,1169");
      await until(
        () => text(host.querySelector(".effect")).includes("Registrar"),
        "el efecto en vivo",
      );
    } finally {
      withoutStyles();
    }
  });
});

describe("the yes to a rate that is not the official one, on a computer", () => {
  it("is not undone by the effect beside the form that was still on its way", async () => {
    withStyles(1440, 900);
    try {
      const host = await goldBuy("2026-01-02");
      await until(() => value(host, "f-fx_rate") === "1,1169");
      type(host, "f-fx_rate", "1,2");
      // Pressed before the effect that follows the keys would come on its own.
      await press(host, "Ver el efecto");
      await until(() => text(host).includes("El tipo no es el oficial"));
      (host.querySelector("#confirm-fx-rate") as HTMLInputElement).click();
      const recordButton = () =>
        [...host.querySelectorAll("section.effect button")].find(
          (button) => button.textContent?.trim() === "Registrar",
        ) as HTMLButtonElement | undefined;
      await until(() => recordButton()?.disabled === false, "el sí al tipo");
      // Longer than the delay of the effect that follows the keys: the yes stays.
      // negative wait: nothing to poll
      await settle(600);
      expect(recordButton()?.disabled).toBe(false);
    } finally {
      withoutStyles();
    }
  });
});
