// @vitest-environment happy-dom
//
// What is left **on the device** after a session of the cloud mode (ADR-0035, §3 and §6). The
// ledger is not: no IndexedDB database is even opened, no `localStorage` key names it, no cache
// entry holds a response of the API. Prices and the ECB history are read from the API into memory.
// Only the three preferences of the interface may remain. The walker below lists everything that is
// on the device, and a control proves it would see a ledger if one were there.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
} from "vitest";
import { forgetWebHistory, loadWebHistory } from "../../src/ecb/history.js";
import { bootCloud } from "../../src/ledger/cloud.js";
import { store } from "../../src/ledger/state.js";
import { forgetPrices, loadWebQuotes } from "../../src/prices/quotes.js";
import Ajustes from "../../src/routes/ajustes/index.jsx";
import { SessionCard } from "../../src/routes/ajustes/SessionCard.jsx";
import Movimientos from "../../src/routes/movimientos/index.jsx";
import Borradores from "../../src/routes/registrar/borradores.jsx";
import RegistrarForm from "../../src/routes/registrar/form.jsx";
import { setLetterKeys, setPrivacy, setTheme } from "../../src/shell/preferences.js";
import { serveReference } from "../helpers/cloud-reference.js";
import { goldenEvents, goldenText } from "../helpers/golden.js";
import { choose, press, settle, show, showInShell, text, type, until } from "../helpers/render.jsx";
import { apiAt, sameOrigin, signedIn } from "./api-support.js";

const holder = globalThis as { indexedDB?: unknown; caches?: unknown };
const before = { indexedDB: holder.indexedDB, caches: holder.caches };
let cachesOpened: string[];
let databasesOpened: string[];

beforeAll(() => {
  // IndexedDB as a recorder: opening any database is a finding of this test.
  holder.indexedDB = {
    open: (name: string) => {
      databasesOpened.push(name);
      throw new Error("the application must not open a database");
    },
  };
});
beforeEach(() => {
  databasesOpened = [];
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
  for (const name of databasesOpened) {
    entries.push(`indexedDB: ${name}`);
  }
  for (const name of cachesOpened) {
    entries.push(`cache: ${name}`);
  }
  return { entries, values };
};

/** The three preferences of the interface: nothing else may remain. */
const ALLOWED = new Set([
  "localStorage: atlas.privacy",
  "localStorage: atlas.theme",
  "localStorage: atlas.letters",
]);

const session = async () => {
  const api = apiAt();
  api.s3.seed("ledger/ledger.jsonl", goldenText());
  const { cookie } = await signedIn(api);
  return sameOrigin(api, () => cookie);
};

describe("what stays on the device after a session of the cloud", () => {
  it("leaves nothing at all when no preference was changed", async () => {
    const request = await session();
    await bootCloud(request);
    await until(() => store.load().phase === "ready", "the ledger");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onDevice().entries).toEqual([]);
  });

  it("is only the three interface preferences, with the prices and the ECB read into memory", async () => {
    const request = await session();
    const host = await showInShell("/", { "*": () => <p>{store.snapshot()?.events.length}</p> });
    await bootCloud(request);
    await until(() => text(host).includes("200"), "the ledger on the screen");

    // What a session does: preferences, and the reference data read from the API.
    setPrivacy(false);
    setTheme("dark");
    setLetterKeys(false);
    const restoreCloud = serveReference({
      ecb: { csv: "Date,USD\n2026-10-01,1.1\n", source: "api" },
      prices: {
        ast_gold:
          '{"schema_version":1,"date":"2026-10-01","close":"100","currency":"EUR","source":"eodhd","fetched_at":"2026-10-01T06:00:00.000Z"}\n',
      },
    });
    try {
      forgetWebHistory();
      forgetPrices();
      await loadWebHistory();
      expect((await loadWebQuotes(["ast_gold"])).closes.size).toBe(1);
    } finally {
      restoreCloud();
    }

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
    // The ECB history is read from the API, in memory: that is what lets a draft be offered.
    const restoreCloud = serveReference({
      ecb: {
        csv: readFileSync(
          join(
            dirname(fileURLToPath(import.meta.url)),
            "../../../../tests/fixtures/ecb/eurofxref-hist.csv",
          ),
          "utf8",
        ),
      },
    });
    forgetWebHistory();
    onTestFinished(restoreCloud);
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
    expect(cachesOpened).toEqual([]);
  });

  it("forgets the prices and the ECB history read into memory when the session is closed, and only then", async () => {
    // Only the answers the card asks for: a close that is refused, then one that works, and a
    // signed-out session for the boot that follows. No ledger is needed to prove what is forgotten.
    const closing = (logout: number): typeof fetch =>
      (async (input: string | URL | Request) =>
        String(input).endsWith("/api/auth/logout")
          ? new Response(null, { status: logout })
          : new Response(JSON.stringify({ error: { code: "unauthenticated", details: {} } }), {
              status: 401,
            })) as typeof fetch;
    const prices = {
      ast_gold:
        '{"schema_version":1,"date":"2026-10-01","close":"100","currency":"EUR","source":"eodhd","fetched_at":"2026-10-01T06:00:00.000Z"}\n',
    };
    const restoreCloud = serveReference({ prices });
    onTestFinished(restoreCloud);
    forgetPrices();
    expect((await loadWebQuotes(["ast_gold"])).closes.size).toBe(1);
    // The cloud now has nothing: a read that still finds the close is one held in memory.
    restoreCloud();
    onTestFinished(serveReference({}));
    const refused = await show("/ajustes", () => <SessionCard request={closing(500)} />);
    await press(refused, "Cerrar sesión");
    expect((await loadWebQuotes(["ast_gold"])).closes.size).toBe(1);
    document.body.innerHTML = "";
    const closed = await show("/ajustes", () => <SessionCard request={closing(204)} />);
    await press(closed, "Cerrar sesión");
    await expect.poll(async () => (await loadWebQuotes(["ast_gold"])).closes.size).toBe(0);
  });

  it("control: the walker would see a ledger, a remembered source, a database or a cache entry", async () => {
    databasesOpened.push("atlas");
    window.localStorage.setItem("atlas.source", "browser");
    window.localStorage.setItem("atlas.ledger", goldenText());
    cachesOpened.push("api-cache");
    const found = onDevice();
    expect(found.entries.filter((entry) => !ALLOWED.has(entry)).sort()).toEqual([
      "cache: api-cache",
      "indexedDB: atlas",
      "localStorage: atlas.ledger",
      "localStorage: atlas.source",
    ]);
    expect(found.values.join("\n")).toContain(goldenEvents()[0]?.id);
  });
});
