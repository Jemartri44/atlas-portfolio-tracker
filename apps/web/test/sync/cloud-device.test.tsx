// @vitest-environment happy-dom
//
// Feature 022 (ADR-0035, §3 and §6): what is left **on the device** after a
// session of the cloud mode. The ledger is not: no IndexedDB store holds it,
// no `localStorage` key names it, no cache entry holds a response of the API.
// Only the public copy of the ECB history (the same for anyone) and the
// preferences of the interface may remain. The walker below lists everything
// that is on the device, and a control proves it would see a ledger if one
// were there.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { IMPORTED_HISTORY_KEY, saveImportedHistory } from "@atlas/adapters/reference";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FakeIdbFactory } from "../../../../packages/adapters/test/fake-idb.js";
import { reloadWebHistory } from "../../src/ecb/history.js";
import { bootCloud } from "../../src/ledger/cloud.js";
import { store } from "../../src/ledger/state.js";
import Ajustes from "../../src/routes/ajustes/index.jsx";
import Movimientos from "../../src/routes/movimientos/index.jsx";
import Borradores from "../../src/routes/registrar/borradores.jsx";
import RegistrarForm from "../../src/routes/registrar/form.jsx";
import { goldenEvents, goldenText } from "../helpers/golden.js";
import { choose, press, settle, show, showInShell, text, type, until } from "../helpers/render.jsx";
import { apiAt, sameOrigin, signedIn } from "./api-support.js";

const holder = globalThis as { indexedDB?: unknown; caches?: unknown };
const before = { indexedDB: holder.indexedDB, caches: holder.caches };
// One factory for the whole file: `openAtlasDb` keeps its connection at module
// level, so a factory per test would leave the store writing into the first one.
// The first test is the one that needs a database that was never opened.
const factory = new FakeIdbFactory();
let cachesOpened: string[];

beforeAll(() => {
  holder.indexedDB = factory;
});
beforeEach(() => {
  for (const db of factory.databases.values()) {
    for (const name of ["ledger", "handles", "drafts"]) {
      db.store(name).clear();
    }
  }
  cachesOpened = [];
  // The Cache API as a recorder: opening any cache is a finding of this test.
  holder.caches = {
    open: async (name: string) => {
      cachesOpened.push(name);
      throw new Error("the application must not open a cache");
    },
    keys: async () => cachesOpened,
  };
  window.localStorage.clear();
  window.sessionStorage.clear();
});
afterEach(() => {
  store.setDeps(undefined);
  store.setLoad({ phase: "loading" });
  document.body.innerHTML = "";
});
afterAll(() => {
  holder.indexedDB = before.indexedDB;
  holder.caches = before.caches;
});

/** Everything on the device, as `store: key` strings, with the values apart. */
const onDevice = (): { entries: string[]; values: string[] } => {
  const entries: string[] = [];
  const values: string[] = [];
  for (const area of [window.localStorage, window.sessionStorage]) {
    const name = area === window.localStorage ? "localStorage" : "sessionStorage";
    for (let index = 0; index < area.length; index += 1) {
      const key = area.key(index) as string;
      entries.push(`${name}: ${key}`);
      values.push(area.getItem(key) ?? "");
    }
  }
  for (const [database, db] of factory.databases) {
    for (const storeName of ["ledger", "handles", "drafts"]) {
      for (const [key, value] of db.store(storeName)) {
        entries.push(`indexedDB ${database}/${storeName}: ${key}`);
        values.push(typeof value === "string" ? value : JSON.stringify(value));
      }
    }
  }
  for (const name of cachesOpened) {
    entries.push(`cache: ${name}`);
  }
  return { entries, values };
};

/** The preferences of the interface and the public copy of the ECB: nothing else may remain. */
const ALLOWED = new Set([
  "localStorage: atlas.privacy",
  "localStorage: atlas.theme",
  `indexedDB atlas/ledger: ${IMPORTED_HISTORY_KEY}`,
]);

const session = async () => {
  const api = apiAt();
  api.s3.seed("ledger/ledger.jsonl", goldenText());
  const { cookie } = await signedIn(api);
  return sameOrigin(api, () => cookie);
};

describe("what stays on the device after a session of the cloud", () => {
  it("opens no database at all when nothing public was saved", async () => {
    const request = await session();
    await bootCloud(request);
    await until(() => store.load().phase === "ready", "the ledger");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(factory.databases.size).toBe(0);
    expect(onDevice().entries).toEqual([]);
  });

  it("is only the interface preferences and the public ECB copy", async () => {
    const request = await session();
    const host = await showInShell("/", { "*": () => <p>{store.snapshot()?.events.length}</p> });
    await bootCloud(request);
    await until(() => text(host).includes("200"), "the ledger on the screen");

    // What a session does: preferences, and the ECB copy the cloud gives to anyone.
    store.setPrivacy(false);
    store.setTheme("dark");
    await saveImportedHistory({
      text: "Date,USD\n2026-10-01,1.1\n",
      source: "api",
      file_name: "eurofxref-hist.csv",
      imported_at: "2026-10-01T10:00:00.000Z",
      origin: "cloud",
    });

    const found = onDevice();
    expect(found.entries.sort()).toEqual([...ALLOWED].sort());
    // Not a byte of the ledger anywhere: not its text, not one of its ids.
    const everything = found.values.join("\n");
    expect(everything).not.toContain(goldenText().slice(0, 200));
    for (const event of goldenEvents()) {
      expect(everything).not.toContain(event.id);
    }
    expect(cachesOpened).toEqual([]);
  });

  it("keeps no draft on the device: saving, counting, listing and discarding go to the cloud", async () => {
    // The public ECB copy is what lets a draft be offered; it may stay (ALLOWED).
    await saveImportedHistory({
      text: readFileSync(
        join(
          dirname(fileURLToPath(import.meta.url)),
          "../../../../tests/fixtures/ecb/eurofxref-hist.csv",
        ),
        "utf8",
      ),
      source: "zip",
      file_name: "eurofxref-hist.csv",
      imported_at: "2026-04-01T10:00:00.000Z",
    });
    await reloadWebHistory();
    const request = await session();
    await bootCloud(request);
    await until(() => store.load().phase === "ready", "the ledger");
    const form = await show("/registrar/buy", RegistrarForm, "/registrar/:tipo");
    await until(() => form.querySelector("#f-account_id") !== null, "the form");
    choose(form, "f-account_id", "acc_ibkr");
    choose(form, "f-asset_id", "ast_gold");
    await settle();
    type(form, "f-trade_date", "2026-04-01");
    type(form, "f-value_date", "2026-04-01");
    type(form, "f-quantity", "1");
    type(form, "f-unit_price", "100");
    await until(
      () => text(form).includes("El BCE todavía no ha publicado este tipo"),
      "the waiting notice",
    );
    await press(form, "Guardar como borrador");
    await until(() => window.location.pathname === "/registrar/borradores", "the list");
    const id = new URLSearchParams(window.location.search).get("guardado") as string;
    document.body.innerHTML = "";
    const list = await show("/registrar/borradores", Borradores, "/registrar/borradores");
    await until(() => text(list).includes("Esperando el tipo"), "the draft in the list");
    // Not a key, not a byte of the draft on the device.
    expect(onDevice().entries.filter((entry) => !ALLOWED.has(entry))).toEqual([]);
    expect(onDevice().values.join("\n")).not.toContain(id);
    await press(list, "Descartar");
    const dialog = [...list.querySelectorAll("dialog")].find((node) =>
      node.hasAttribute("open"),
    ) as HTMLElement;
    await press(dialog, "Descartar");
    await until(() => text(list).includes("No hay borradores pendientes."), "discarded");
    expect(onDevice().entries.filter((entry) => !ALLOWED.has(entry))).toEqual([]);
    expect(onDevice().values.join("\n")).not.toContain(id);
    expect(cachesOpened).toEqual([]);
  });

  it("keeps nothing after walking the real screens: Registrar with a preview, Movimientos, Ajustes and a copy", async () => {
    const request = await session();
    await bootCloud(request);
    await until(() => store.load().phase === "ready", "the ledger");
    const form = await show("/registrar/cash-in", RegistrarForm, "/registrar/:tipo");
    choose(form, "f-account_id", "acc_mi");
    type(form, "f-value_date", "2027-11-02");
    type(form, "f-amount", "100");
    await settle(30);
    await press(form, "Ver el efecto");
    document.body.innerHTML = "";
    const list = await show("/movimientos", Movimientos);
    expect(text(list).length).toBeGreaterThan(0);
    document.body.innerHTML = "";
    const settings = await show("/ajustes", Ajustes);
    URL.createObjectURL = () => "blob:copy";
    URL.revokeObjectURL = () => undefined;
    await press(settings, "Descargar copia");
    await press(settings, "Descargar en CSV");
    await settle(30);
    expect(text(settings)).toContain("atlas-copia-");
    expect(onDevice().entries).toEqual([]);
    // Reading the public prices opens the database, but no store of the ledger holds anything (checked above).
    expect(cachesOpened).toEqual([]);
  });

  it("control: the walker would see a ledger, a remembered source or a cache entry", async () => {
    await saveImportedHistory({
      text: "x",
      source: "api",
      file_name: "f",
      imported_at: "2026-10-01T10:00:00.000Z",
    });
    factory.databases.get("atlas")?.store("ledger").set("current", goldenText());
    window.localStorage.setItem("atlas.source", "browser");
    cachesOpened.push("api-cache");
    const found = onDevice();
    expect(found.entries.filter((entry) => !ALLOWED.has(entry)).sort()).toEqual([
      "cache: api-cache",
      "indexedDB atlas/ledger: current",
      "localStorage: atlas.source",
    ]);
    expect(found.values.join("\n")).toContain(goldenEvents()[0]?.id);
  });
});
