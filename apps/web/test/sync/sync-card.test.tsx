// @vitest-environment happy-dom
//
// The card of the sync in Ajustes (feature 015, E4; §27.5), rendered against
// the API of the tests: every start asks before writing, the button syncs
// only as the device the browser joined with, what is held shows its type,
// date and reason and **never an amount under the privacy mode**, and
// «Volver a descargar» appears only after the cloud was rewritten.

import { render } from "solid-js/web";
import { afterEach, describe, expect, it } from "vitest";
import { Builder, base, textOf } from "../../../../packages/adapters/test/sync/builder.js";
import { store } from "../../src/ledger/state.js";
import { SyncCard } from "../../src/routes/ajustes/sync/SyncCard.jsx";
import { startSync, syncNow } from "../../src/sync/engine.js";
import { type Api, apiAt, browserOf, cloudText, depsOf } from "./api-support.js";

const settle = async (): Promise<void> => {
  for (let turn = 0; turn < 40; turn += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

/** Waits for a condition of the page: the API and the double of IndexedDB answer in turns. */
const until = async (holds: () => boolean, what: string): Promise<void> => {
  for (let turn = 0; turn < 50; turn += 1) {
    if (holds()) {
      return;
    }
    await settle();
  }
  throw new Error(`nunca llegó: ${what}`);
};

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.innerHTML = "";
  store.setPrivacy(false);
});

/** The card as the session card paints it: with the device the session had when it was read. */
const show = async (
  browser: Awaited<ReturnType<typeof browserOf>>,
  device: string = browser.device(),
): Promise<HTMLElement> => {
  const host = document.createElement("div");
  document.body.append(host);
  dispose = render(
    () => (
      <SyncCard
        device={device}
        request={browser.env.fetch}
        open={browser.web.open}
        deps={() => depsOf(browser.web, browser.env)}
      />
    ),
    host,
  );
  await until(() => !(host.textContent ?? "").includes("Comprobando"), "el estado");
  return host;
};

const button = (host: HTMLElement, label: string): HTMLButtonElement | undefined =>
  [...host.querySelectorAll("button")].find((each) => each.textContent?.trim() === label);

const press = async (host: HTMLElement, label: string): Promise<void> => {
  const found = button(host, label);
  if (found === undefined) {
    throw new Error(`no hay botón «${label}»: ${host.textContent}`);
  }
  found.click();
  await settle();
};

const joinedFromTheCloud = async (api: Api) => {
  const first = await browserOf(base(), api);
  await startSync(first.env, "init");
  const own = new Builder(60);
  own.deposit("250");
  const second = await browserOf([...base(), ...own.events], api);
  await startSync(second.env, "join_from_remote");
  return second;
};

describe("the card of the sync", () => {
  it("offers the three starts, and asks before writing anything", async () => {
    const api = apiAt();
    const browser = await browserOf(base(), api);
    const host = await show(browser);
    for (const label of [
      "Subir mis datos a la nube",
      "Unirme desde la nube",
      "Unirme con mis operaciones",
    ]) {
      expect(button(host, label), label).toBeDefined();
    }
    await press(host, "Subir mis datos a la nube");
    expect(host.textContent).toContain("¿Subir mis datos a la nube?");
    expect(await cloudText(api)).toBe("");
    await press(host, "Cancelar");
    expect(await cloudText(api)).toBe("");
    await press(host, "Subir mis datos a la nube");
    await press(host, "Sí, seguir");
    await until(() => (host.textContent ?? "").includes("Pendientes de subir"), "sincronizado");
    expect(await cloudText(api)).toBe(await browser.web.text());
    expect(button(host, "Sincronizar")).toBeDefined();
    expect(host.textContent).toContain("puede cambiar después");
  });

  it("syncs only as the device it joined with, and offers joining again otherwise", async () => {
    const api = apiAt();
    const browser = await browserOf(base(), api);
    await startSync(browser.env, "init");
    await browser.signInAgain();
    const host = await show(browser);
    expect(host.textContent).toContain("Otro dispositivo");
    expect(button(host, "Sincronizar")).toBeUndefined();
    expect(button(host, "Unirme desde la nube")).toBeDefined();
    expect(button(host, "Unirme con mis operaciones")).toBeDefined();
  });

  // Review of PR #97, security B1: the card is painted under one session,
  // and another tab signs in again before the click. The order reads the
  // session again, and the API would refuse the other device anyway.
  it("refuses to sync when the session changed between painting and the click, and writes nothing", async () => {
    const api = apiAt();
    const browser = await browserOf(base(), api);
    await startSync(browser.env, "init");
    await browser.web.record([new Builder(150).deposit("90")]);
    const host = await show(browser);
    expect(button(host, "Sincronizar")).toBeDefined();
    const painted = browser.device();
    await browser.signInAgain();
    const published = api.s3.text(`sync/devices/${browser.device()}.json`);
    await press(host, "Sincronizar");
    await until(() => (host.textContent ?? "").includes("No se ha hecho"), "la negativa");
    expect(host.textContent).toContain("se unió a la nube con otro dispositivo");
    expect(await cloudText(api)).toBe(textOf(base()));
    expect(api.s3.text(`sync/devices/${browser.device()}.json`)).toBe(published);
    expect(browser.device()).not.toBe(painted);
  });

  it("shows what is held with its type, date and reason, and no amount under privacy", async () => {
    const api = apiAt();
    const second = await joinedFromTheCloud(api);
    store.setPrivacy(true);
    const host = await show(second);
    await until(() => (host.textContent ?? "").includes("Retenidas"), "lo retenido");
    const shown = host.textContent ?? "";
    expect(shown).toContain("Retenida al empezar desde la nube");
    expect(shown).toMatch(/11\/01\/2027|11 ene/);
    expect(shown).not.toMatch(/250/);
    expect(button(host, "Rehacer")).toBeDefined();
    expect(button(host, "Descartar")).toBeDefined();
    expect(button(host, "Confirmar")).toBeUndefined();
  });

  it("shows the amount of what is held when privacy is off", async () => {
    const api = apiAt();
    const second = await joinedFromTheCloud(api);
    const host = await show(second);
    await until(() => (host.textContent ?? "").includes("Retenidas"), "lo retenido");
    expect(host.textContent).toMatch(/250/);
  });

  // Review of PR #97, correctness B2: two held purchases of the same day are
  // told apart by their asset, quantity and price, and none of those figures
  // shows under the privacy mode.
  it("shows the asset, the quantity and the price of a held purchase, masked under privacy", async () => {
    for (const privacy of [false, true]) {
      const api = apiAt();
      const first = await browserOf(base(), api);
      await startSync(first.env, "init");
      const own = new Builder(60);
      own.trade("buy", "37", "2027-01-12");
      const second = await browserOf([...base(), ...own.events], api);
      await startSync(second.env, "join_from_remote");
      store.setPrivacy(privacy);
      const host = await show(second);
      await until(() => (host.textContent ?? "").includes("ast_world"), "la compra retenida");
      const shown = host.textContent ?? "";
      expect(shown).toContain("Compra");
      expect(shown).toMatch(/12\/01\/2027/);
      if (privacy) {
        expect(shown).not.toMatch(/37/);
        expect(shown).not.toMatch(/100/);
      } else {
        expect(shown).toMatch(/37/);
        expect(shown).toMatch(/100,00/);
      }
      dispose?.();
      dispose = undefined;
      document.body.innerHTML = "";
    }
  });

  it("redoes what is held only after showing the plan", async () => {
    const api = apiAt();
    const second = await joinedFromTheCloud(api);
    const host = await show(second);
    await until(() => button(host, "Rehacer") !== undefined, "lo retenido");
    const before = await second.web.text();
    await press(host, "Rehacer");
    await until(() => (host.textContent ?? "").includes("¿Registrarla así"), "el plan");
    expect(await second.web.text()).toBe(before);
    await press(host, "Registrar");
    await until(() => (host.textContent ?? "").includes("Rehecha"), "rehecha");
    expect(await second.web.text()).not.toBe(before);
    await until(() => button(host, "Rehacer") === undefined, "sin retenidas");
  });

  it("offers downloading again only after the cloud was rewritten", async () => {
    const api = apiAt();
    const browser = await browserOf(base(), api);
    await startSync(browser.env, "init");
    await browser.web.record([new Builder(120).deposit("60")]);
    const host = await show(browser);
    expect(button(host, "Volver a descargar")).toBeUndefined();
    await press(host, "Sincronizar");
    await until(() => (host.textContent ?? "").includes("Sincronizado"), "sincronizado");
    expect(button(host, "Volver a descargar")).toBeUndefined();
    // An administration rewrite: the cloud without the last line.
    api.s3.seed("ledger/ledger.jsonl", textOf(base()));
    await press(host, "Sincronizar");
    await until(() => button(host, "Volver a descargar") !== undefined, "la reescritura");
    await press(host, "Volver a descargar");
    expect(host.textContent).toContain("¿Volver a descargar?");
    await press(host, "Sí, seguir");
    await until(() => (host.textContent ?? "").includes("Descargado de nuevo"), "descargado");
    expect(await browser.web.text()).toBe(textOf(base()));
  });

  // Review of PR #97, security N4: discarding asks first; confirming does not.
  it("asks before discarding what is held, and discards only on the yes", async () => {
    const api = apiAt();
    const second = await joinedFromTheCloud(api);
    const host = await show(second);
    await until(() => button(host, "Descartar") !== undefined, "lo retenido");
    await press(host, "Descartar");
    expect(host.textContent).toContain("¿Descartar lo retenido?");
    expect(await second.web.discarded()).toBe("");
    await press(host, "Cancelar");
    expect(host.textContent).not.toContain("¿Descartar lo retenido?");
    expect(await second.web.discarded()).toBe("");
    await press(host, "Descartar");
    await press(host, "Sí, descartar");
    await until(() => (host.textContent ?? "").includes("Descartada"), "descartada");
    expect(await second.web.discarded()).not.toBe("");
    expect(button(host, "Descartar")).toBeUndefined();
  });

  it("confirms a repeated operation without a question", async () => {
    const api = apiAt();
    const first = await browserOf(base(), api);
    await startSync(first.env, "init");
    const second = await browserOf(base(), api);
    await startSync(second.env, "join_from_remote");
    await first.web.record([new Builder(100).deposit("50")]);
    await syncNow(first.env);
    await second.web.record([new Builder(900).deposit("50")]);
    await syncNow(second.env);
    const host = await show(second);
    await until(() => button(host, "Confirmar") !== undefined, "la repetida");
    await press(host, "Confirmar");
    await until(() => (host.textContent ?? "").includes("Confirmada"), "confirmada");
    expect(host.textContent).not.toContain("¿Confirmar");
  });

  it("refuses to deactivate with operations pending, and deactivates without them", async () => {
    const api = apiAt();
    const browser = await browserOf(base(), api);
    await startSync(browser.env, "init");
    await browser.web.record([new Builder(140).deposit("80")]);
    const host = await show(browser);
    await press(host, "Desactivar");
    await until(() => (host.textContent ?? "").includes("No se ha desactivado"), "la negativa");
    await press(host, "Sincronizar");
    await until(() => (host.textContent ?? "").includes("Sincronizado"), "sincronizado");
    await press(host, "Desactivar");
    await until(() => (host.textContent ?? "").includes("Sincronización desactivada"), "hecho");
    expect(button(host, "Sincronizar")).toBeUndefined();
    expect(button(host, "Unirme desde la nube")).toBeDefined();
  });
});
