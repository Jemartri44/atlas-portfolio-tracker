// @vitest-environment happy-dom
//
// Drafts in the cloud (feature 027, E6 of ADR-0035; ADR-0029, point 9): an
// operation whose ECB rate is not published yet is kept **in the cloud** without
// a rate, through the real handler with the doubles of S3, SSM and Google. It
// counts in no figure, the frame counts it, and it is recorded only when the
// user opens it and says yes — with the official rate proposed as for any other
// operation. Nothing of a draft stays on the device (`sync/cloud-device.test`).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ApiDraftStore } from "@atlas/adapters/drafts-http";
import { saveImportedHistory } from "@atlas/adapters/reference";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FakeIdbFactory } from "../../../packages/adapters/test/fake-idb.js";
import { reloadWebHistory } from "../src/ecb/history.js";
import { bootCloud } from "../src/ledger/cloud.js";
import { store } from "../src/ledger/state.js";
import Borradores from "../src/routes/registrar/borradores.jsx";
import RegistrarForm from "../src/routes/registrar/form.jsx";
import Resumen from "../src/routes/resumen/index.jsx";
import { goldenText } from "./helpers/golden.js";
import {
  choose,
  press,
  settle,
  show,
  showInShell,
  text,
  type,
  until,
  withGoldenLedger,
} from "./helpers/render.jsx";
import { type Api, apiAt, cloudText, sameOrigin, signedIn } from "./sync/api-support.js";

withGoldenLedger();

const LEDGER = "ledger/ledger.jsonl";
const holder = globalThis as { indexedDB?: unknown };
const before = holder.indexedDB;
const synthetic = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../../tests/fixtures/ecb/eurofxref-hist.csv"),
  "utf8",
);
/** The same history one working day later: 2026-04-01 published, dollar at 1.1104. */
const later = (() => {
  const [header, newest, ...rest] = synthetic.split("\n");
  const next = (newest as string).replace("2026-03-31,1.1091,", "2026-04-01,1.1104,");
  return [header, next, newest, ...rest].join("\n");
})();

const importHistory = async (csv: string): Promise<void> => {
  await saveImportedHistory({
    text: csv,
    source: "zip",
    file_name: "eurofxref-hist.csv",
    imported_at: "2026-04-01T10:00:00.000Z",
  });
  await reloadWebHistory();
};

/** How the network misbehaves for the next request to the drafts, if at all. */
interface Net {
  /** `dropped`: never leaves; `lost`: the API answers and the answer never comes. */
  next: { match: RegExp; mode: "dropped" | "lost" } | undefined;
  /** Runs once, just before the next request that matches goes through. */
  before: { match: RegExp; run: () => Promise<void> } | undefined;
}

let api: Api;
let net: Net;
let request: typeof fetch;
let cookie: string | undefined;

beforeAll(() => {
  holder.indexedDB = new FakeIdbFactory();
});
afterAll(() => {
  holder.indexedDB = before;
});

beforeEach(async () => {
  await importHistory(synthetic);
  api = apiAt();
  api.s3.seed(LEDGER, goldenText());
  cookie = (await signedIn(api)).cookie;
  net = { next: undefined, before: undefined };
  const through = sameOrigin(api, () => cookie);
  request = (async (input: string | URL | Request, init?: RequestInit) => {
    const asked = String(input);
    if (net.before?.match.test(asked) === true) {
      const { run } = net.before;
      net.before = undefined;
      await run();
    }
    if (net.next?.match.test(asked) === true) {
      const { mode } = net.next;
      net.next = undefined;
      if (mode === "lost") {
        await through(input, init);
      }
      throw new TypeError("network lost");
    }
    return through(input, init);
  }) as typeof fetch;
  await bootCloud(request);
  await until(() => store.load().phase === "ready", "the ledger");
});

afterEach(() => {
  store.setDeps(undefined);
  store.setPending(undefined);
});

/** The drafts of the account as a second device would read them. */
const elsewhere = (): ApiDraftStore => new ApiDraftStore({ origin: "", fetch: request });
const pending = async () => (await elsewhere().list()).drafts;
const events = (): number => store.snapshot()?.events.length ?? 0;

const value = (host: HTMLElement, id: string): string =>
  (host.querySelector(`#${id}`) as HTMLInputElement | null)?.value ?? "";

/** The form of a purchase of gold on 2026-04-01, a day the synthetic history does not reach. */
const fillGold = async (): Promise<HTMLElement> => {
  const host = await show("/registrar/buy", RegistrarForm, "/registrar/:tipo");
  choose(host, "f-account_id", "acc_ibkr");
  choose(host, "f-asset_id", "ast_gold");
  await settle();
  type(host, "f-trade_date", "2026-04-01");
  type(host, "f-value_date", "2026-04-01");
  type(host, "f-quantity", "1");
  type(host, "f-unit_price", "100");
  await until(
    () => text(host).includes("El BCE todavía no ha publicado este tipo"),
    "the waiting notice",
  );
  return host;
};

const saveGoldDraft = async (): Promise<string> => {
  const host = await fillGold();
  await press(host, "Guardar como borrador");
  await until(() => window.location.pathname === "/registrar/borradores", "the list");
  const saved = new URLSearchParams(window.location.search).get("guardado");
  expect(saved).toMatch(/^[0-9A-Z]{26}$/);
  document.body.innerHTML = "";
  return saved as string;
};

const confirmButton = (host: HTMLElement): HTMLButtonElement =>
  [...host.querySelectorAll("section.effect button")].find(
    (button) => button.textContent?.trim() === "Registrar",
  ) as HTMLButtonElement;

/** Opens the draft in its form, with the official rate proposed, and asks for the effect. */
const openToConfirm = async (id: string): Promise<HTMLElement> => {
  await importHistory(later);
  const host = await show(`/registrar/buy?borrador=${id}`, RegistrarForm, "/registrar/:tipo");
  await until(() => value(host, "f-fx_rate") === "1,1104", "the official rate");
  await press(host, "Ver el efecto");
  await until(() => host.querySelector("section.effect") !== null, "the effect");
  return host;
};

describe("a draft from the form", () => {
  it("is kept in the cloud without a rate, outside the ledger", async () => {
    const recorded = events();
    const ledger = await cloudText(api);
    const id = await saveGoldDraft();
    const [draft] = await pending();
    expect(draft?.id).toBe(id);
    expect(draft?.event).toMatchObject({ type: "buy", asset_id: "ast_gold", currency: "USD" });
    expect(draft?.event).not.toHaveProperty("fx_rate");
    expect(draft?.event).not.toHaveProperty("fx_rate_date");
    expect(api.s3.keys().filter((key) => key.startsWith("drafts/"))).toEqual([`drafts/${id}.json`]);
    expect(events()).toBe(recorded);
    expect(await cloudText(api)).toBe(ledger);
  });

  it("is counted in the frame, on every screen", async () => {
    await saveGoldDraft();
    const host = await showInShell("/", { "/": Resumen });
    await until(() => host.querySelector('a[href="/registrar/borradores"]') !== null, "the count");
    const link = host.querySelector('a[href="/registrar/borradores"]') as HTMLAnchorElement;
    expect(link.getAttribute("aria-label")).toBe("1 borrador pendiente");
    expect(text(link)).toBe("1");
  });

  it("counts a draft it cannot read too, and says nothing when the cloud cannot be read", async () => {
    api.s3.seed("drafts/not-a-draft.json", "{");
    const host = await showInShell("/", { "/": Resumen });
    await until(
      () => text(host.querySelector('[data-slot="drafts"]')) === "1",
      "the unreadable one",
    );
    expect(host.querySelector('a[href="/registrar/borradores"]')?.getAttribute("aria-label")).toBe(
      "1 borrador pendiente",
    );
    // The connection goes: a count that is not known is not painted as zero, nor kept.
    net.next = { match: /\/api\/drafts$/, mode: "dropped" };
    window.dispatchEvent(new Event("atlas:drafts"));
    await until(() => text(host.querySelector('[data-slot="drafts"]')) === "", "nothing painted");
  });

  it("waits in the list, and is never recorded by itself when the rate arrives", async () => {
    const id = await saveGoldDraft();
    const recorded = events();
    let host = await show("/registrar/borradores", RegistrarForm, "/registrar/:tipo");
    await until(() => text(host).includes("Esperando el tipo de USD del 01/04/2026"), "waiting");
    expect(text(host)).toContain("Están en tu cuenta");
    expect(text(host)).not.toContain("Revisar y registrar");

    await importHistory(later);
    document.body.innerHTML = "";
    host = await show("/registrar/borradores", Borradores, "/registrar/borradores");
    await until(() => text(host).includes("Puedes registrarlo"), "confirmable");
    expect(text(host)).toContain("1,1104 USD por euro del 01/04/2026");
    expect(host.querySelector(`a[href="/registrar/buy?borrador=${id}"]`)).not.toBeNull();
    expect(events()).toBe(recorded);
    expect(await pending()).toHaveLength(1);
  });

  it("is recorded from its form with the official rate, and only then is closed as confirmed", async () => {
    const id = await saveGoldDraft();
    const recorded = events();
    const host = await openToConfirm(id);
    expect(value(host, "f-fx_rate_date")).toBe("2026-04-01");
    expect(value(host, "f-quantity")).toBe("1");
    expect(text(host)).not.toContain("Guardar como borrador");
    confirmButton(host).click();
    await until(() => window.location.pathname.startsWith("/movimientos/"), "the movement");
    expect(events()).toBe(recorded + 1);
    const last = store.snapshot()?.events.at(-1) as unknown as Record<string, unknown>;
    expect(last).toMatchObject({ type: "buy", fx_rate: "1.1104", fx_rate_date: "2026-04-01" });
    expect(await pending()).toEqual([]);
    // Closed, never deleted: stamped with the id the event has, and ended as confirmed.
    const stamp = JSON.parse(api.s3.text(`drafts/${id}.stamp.json`) as string);
    expect(stamp.pending_event_id).toBe(last.id);
    expect(JSON.parse(api.s3.text(`drafts/${id}.end.json`) as string)).toMatchObject({
      outcome: "confirmed",
      event_id: last.id,
    });
  });

  it("says so when the draft cannot be closed, and closing it later records nothing", async () => {
    const id = await saveGoldDraft();
    const recorded = events();
    const host = await openToConfirm(id);
    // The connection is lost on the closing, after the line was written.
    net.next = { match: /\/end$/, mode: "dropped" };
    confirmButton(host).click();
    await until(() => text(host).includes("Registrado, pero el borrador sigue aquí"), "the notice");
    await until(() => text(host).includes("Ya está en tus datos"), "recorded");
    expect(events()).toBe(recorded + 1);
    expect((await pending()).map((draft) => draft.id)).toEqual([id]);
    // «Cerrar» closes it as confirmed with the id of its event: nothing is recorded again.
    await press(host, "Cerrar");
    const dialog = [...host.querySelectorAll("dialog")].find((node) =>
      node.hasAttribute("open"),
    ) as HTMLElement;
    await press(dialog, "Cerrar");
    await until(() => text(host).includes("No hay borradores pendientes."), "closed");
    expect(events()).toBe(recorded + 1);
    const ended = JSON.parse(api.s3.text(`drafts/${id}.end.json`) as string);
    expect(ended.outcome).toBe("confirmed");
  });

  it("keeps the draft and the ledger when the cloud ledger moved on (a 412): the same form asks again", async () => {
    const id = await saveGoldDraft();
    const host = await openToConfirm(id);
    // Another device writes meanwhile.
    const first = (await cloudText(api)).split("\n")[0] as string;
    api.s3.seed(
      LEDGER,
      `${await cloudText(api)}${first.replace(/"id":"[^"]+"/, '"id":"01ARYZ6S41TSV4RRFFQ69G5FZY"')}\n`,
    );
    const written = (await cloudText(api)).split("\n").filter((line) => line !== "").length;
    confirmButton(host).click();
    await until(() => text(host).includes("Tus datos han cambiado"), "the reload notice");
    expect((await cloudText(api)).split("\n").filter((line) => line !== "").length).toBe(written);
    expect((await pending()).map((draft) => draft.id)).toEqual([id]);
    // Confirming again, on the new ledger, records it.
    await until(() => host.querySelector("section.effect") !== null, "the effect again");
    confirmButton(host).click();
    await until(() => window.location.pathname.startsWith("/movimientos/"), "the movement");
    expect(await pending()).toEqual([]);
  });

  it("records nothing when another device closed it first (draft_changed)", async () => {
    const id = await saveGoldDraft();
    const host = await openToConfirm(id);
    const recorded = events();
    const written = await cloudText(api);
    await elsewhere().remove(id);
    confirmButton(host).click();
    await until(() => text(host).includes("Ese borrador ya no está pendiente"), "the refusal");
    expect(events()).toBe(recorded);
    expect(await cloudText(api)).toBe(written);
    expect(window.location.pathname).toBe("/registrar/buy");
  });

  it("records nothing when another device stamped it with another id after it was read", async () => {
    const id = await saveGoldDraft();
    const host = await openToConfirm(id);
    const written = await cloudText(api);
    const [draft] = await pending();
    // Between the read of the draft and its stamp, another device confirms it.
    net.before = {
      match: /\/stamp$/,
      run: () =>
        elsewhere().update(
          {
            ...(draft as NonNullable<typeof draft>),
            pending_event_id: "01ARYZ6S41TSV4RRFFQ69G5FZY",
          },
          undefined,
        ),
    };
    confirmButton(host).click();
    await until(() => text(host).includes("se está confirmando en otro sitio"), "the refusal");
    expect(await cloudText(api)).toBe(written);
    expect((await pending()).map((one) => one.id)).toEqual([id]);
  });

  it("says a draft that is gone is gone", async () => {
    const host = await show(
      "/registrar/buy?borrador=01K00000000000000000000009",
      RegistrarForm,
      "/registrar/:tipo",
    );
    await until(() => text(host).includes("Ese borrador ya no está pendiente"), "gone");
  });

  it("can be discarded, after a yes, and is closed in the cloud, not deleted", async () => {
    const id = await saveGoldDraft();
    const host = await show("/registrar/borradores", Borradores, "/registrar/borradores");
    await until(() => text(host).includes("Esperando el tipo"), "the draft");
    await press(host, "Descartar");
    const dialog = [...host.querySelectorAll("dialog")].find((node) =>
      node.hasAttribute("open"),
    ) as HTMLElement;
    await press(dialog, "Descartar");
    await until(() => text(host).includes("No hay borradores pendientes."), "discarded");
    expect(await pending()).toEqual([]);
    expect(JSON.parse(api.s3.text(`drafts/${id}.end.json`) as string)).toMatchObject({
      outcome: "discarded",
    });
    expect(api.s3.text(`drafts/${id}.json`)).toBeDefined();
  });
});

describe("without a connection", () => {
  it("says nothing was saved when the cloud cannot even be asked", async () => {
    const host = await fillGold();
    // The ledger read that checks the draft never leaves: nothing was sent.
    net.next = { match: /\/api\/ledger$/, mode: "dropped" };
    await press(host, "Guardar como borrador");
    await until(() => text(host).includes("No hay conexión con la nube"), "the message");
    expect(text(host)).toContain("no se ha guardado nada");
    expect(text(host)).not.toContain("remote answered");
    expect(window.location.pathname).not.toBe("/registrar/borradores");
    expect(api.s3.keys().filter((key) => key.startsWith("drafts/"))).toEqual([]);
  });

  it("does not know whether a lost answer saved it, and sending again never saves it twice", async () => {
    const host = await fillGold();
    net.next = { match: /\/api\/drafts$/, mode: "lost" };
    await press(host, "Guardar como borrador");
    await until(() => text(host).includes("No sabemos si se ha guardado el borrador"), "unknown");
    expect(window.location.pathname).toBe("/registrar/buy");
    expect(await pending()).toHaveLength(1);
    await press(host, "Guardar como borrador");
    await until(() => window.location.pathname === "/registrar/borradores", "the list");
    const drafts = await pending();
    expect(drafts).toHaveLength(1);
    expect(new URLSearchParams(window.location.search).get("guardado")).toBe(drafts[0]?.id);
  });

  it("sends the same draft again when the first never left", async () => {
    const host = await fillGold();
    net.next = { match: /\/api\/drafts$/, mode: "dropped" };
    await press(host, "Guardar como borrador");
    await until(() => text(host).includes("No sabemos si se ha guardado el borrador"), "unknown");
    expect(await pending()).toEqual([]);
    await press(host, "Guardar como borrador");
    await until(() => window.location.pathname === "/registrar/borradores", "the list");
    expect(await pending()).toHaveLength(1);
  });

  it("says the session ended instead of losing the form", async () => {
    const host = await fillGold();
    cookie = undefined;
    await press(host, "Guardar como borrador");
    await until(() => text(host).includes("sesión"), "the session notice");
    expect(window.location.pathname).toBe("/registrar/buy");
  });

  it("says the list cannot be read, and touches nothing", async () => {
    await saveGoldDraft();
    net.next = { match: /\/api\/drafts$/, mode: "dropped" };
    const host = await show("/registrar/borradores", Borradores, "/registrar/borradores");
    await until(() => text(host).includes("No se han podido leer los borradores"), "the error");
    expect(await pending()).toHaveLength(1);
  });

  it("says why a draft could not be discarded and leaves it pending", async () => {
    await saveGoldDraft();
    const host = await show("/registrar/borradores", Borradores, "/registrar/borradores");
    await until(() => text(host).includes("Esperando el tipo"), "the draft");
    await press(host, "Descartar");
    const dialog = [...host.querySelectorAll("dialog")].find((node) =>
      node.hasAttribute("open"),
    ) as HTMLElement;
    net.next = { match: /\/end$/, mode: "dropped" };
    await press(dialog, "Descartar");
    await until(() => text(host).includes("No se ha cerrado el borrador"), "the refusal");
    expect(await pending()).toHaveLength(1);
  });
});
