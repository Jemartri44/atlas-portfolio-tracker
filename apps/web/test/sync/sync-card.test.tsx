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
import { startSync } from "../../src/sync/engine.js";
import { type Api, apiAt, browserOf, cloudText, DEVICE, depsOf, OTHER } from "./api-support.js";

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

const show = async (
  browser: Awaited<ReturnType<typeof browserOf>>,
  device: string,
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
  await startSync(first.env, DEVICE, "init");
  const own = new Builder(60);
  own.deposit("250");
  const second = await browserOf([...base(), ...own.events], api, OTHER);
  await startSync(second.env, OTHER, "join_from_remote");
  return second;
};

describe("the card of the sync", () => {
  it("offers the three starts, and asks before writing anything", async () => {
    const api = apiAt();
    const browser = await browserOf(base(), api);
    const host = await show(browser, DEVICE);
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
    await startSync(browser.env, DEVICE, "init");
    const host = await show(browser, OTHER);
    expect(host.textContent).toContain("Otro dispositivo");
    expect(button(host, "Sincronizar")).toBeUndefined();
    expect(button(host, "Unirme desde la nube")).toBeDefined();
    expect(button(host, "Unirme con mis operaciones")).toBeDefined();
  });

  it("shows what is held with its type, date and reason, and no amount under privacy", async () => {
    const api = apiAt();
    const second = await joinedFromTheCloud(api);
    store.setPrivacy(true);
    const host = await show(second, OTHER);
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
    const host = await show(second, OTHER);
    await until(() => (host.textContent ?? "").includes("Retenidas"), "lo retenido");
    expect(host.textContent).toMatch(/250/);
  });

  it("redoes what is held only after showing the plan", async () => {
    const api = apiAt();
    const second = await joinedFromTheCloud(api);
    const host = await show(second, OTHER);
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
    await startSync(browser.env, DEVICE, "init");
    await browser.web.record([new Builder(120).deposit("60")]);
    const host = await show(browser, DEVICE);
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

  it("refuses to deactivate with operations pending, and deactivates without them", async () => {
    const api = apiAt();
    const browser = await browserOf(base(), api);
    await startSync(browser.env, DEVICE, "init");
    await browser.web.record([new Builder(140).deposit("80")]);
    const host = await show(browser, DEVICE);
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
