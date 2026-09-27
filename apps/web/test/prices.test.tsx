// @vitest-environment happy-dom
//
// The automatic prices in the web (feature 013, block 5): read from the folder
// the console writes or imported by hand, never downloaded and never written
// in the folder; shown with their origin, the approximation marked, the quote
// without an ECB rate said; and on the phone, the truth: no automatic prices
// until the cloud exists.

import { Decimal, Money } from "@atlas/domain";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeIdbFactory } from "../../../packages/adapters/test/fake-idb.js";
import { Price, PriceDetail } from "../src/components/Price.jsx";
import { loadWebHistory, reloadWebHistory } from "../src/ecb/history.js";
import { externalOf, forgetPrices, importPriceFiles, loadWebQuotes } from "../src/prices/quotes.js";
import Ajustes from "../src/routes/ajustes/index.jsx";
import Cartera from "../src/routes/cartera/index.jsx";
import { settle, show, text, until, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

/**
 * The folder the browser remembers. A real handle is serialisable and lives in
 * IndexedDB; the double is not, so the one function that hands it over is
 * replaced — everything else of the module, `readFolderText` included, is the
 * real one.
 */
const linked = vi.hoisted(() => ({ folder: undefined as FileSystemDirectoryHandle | undefined }));
vi.mock("@atlas/adapters/folder", async (original) => ({
  ...(await original<typeof import("@atlas/adapters/folder")>()),
  rememberedFolder: async () => linked.folder,
}));
const rememberFolder = async (folder: FileSystemDirectoryHandle): Promise<void> => {
  linked.folder = folder;
};

const holder = globalThis as { indexedDB?: unknown };
const before = holder.indexedDB;
beforeEach(async () => {
  holder.indexedDB = new FakeIdbFactory();
  linked.folder = undefined;
  await reloadWebHistory();
});
afterAll(() => {
  holder.indexedDB = before;
});

const line = (date: string, close: string, currency = "EUR") =>
  `${JSON.stringify({ schema_version: 1, date, close, currency, source: "eodhd", fetched_at: "2029-06-30T06:00:00.000Z" })}\n`;

/** A folder as the File System Access API hands it over: read only, from a map of paths. */
const fakeFolder = (files: Record<string, string>, permission = "granted") => {
  const notFound = () => new DOMException("not found", "NotFoundError");
  const dir = (prefix: string): unknown => ({
    kind: "directory",
    queryPermission: async () => permission,
    getDirectoryHandle: async (name: string) => {
      const path = `${prefix}${name}/`;
      if (!Object.keys(files).some((key) => key.startsWith(path))) {
        throw notFound();
      }
      return dir(path);
    },
    getFileHandle: async (name: string) => {
      const content = files[`${prefix}${name}`];
      if (content === undefined) {
        throw notFound();
      }
      return { getFile: async () => ({ text: async () => content }) };
    },
  });
  return dir("") as FileSystemDirectoryHandle;
};

describe("importing prices by hand", () => {
  it("reads each file before keeping anything, and keeps the format of prices/", async () => {
    const refused = await importPriceFiles([
      { name: "ast_world.jsonl", text: line("2029-06-29", "999") },
      { name: "ast_bonds.jsonl", text: '{"schema_version":2}\n' },
    ]);
    expect(refused).toEqual({
      kind: "refused",
      file: "ast_bonds.jsonl",
      code: "price_file_newer_version",
    });
    expect((await loadWebQuotes(["ast_world"])).closes.size).toBe(0);
    expect(await importPriceFiles([{ name: "notes.txt", text: "x" }])).toMatchObject({
      kind: "refused",
      code: "not_a_price_file",
    });
    const imported = await importPriceFiles([
      { name: "ast_world.jsonl", text: line("2029-06-29", "999") },
    ]);
    expect(imported).toEqual({ kind: "imported", assets: ["ast_world"], ignored: [] });
    const quotes = await loadWebQuotes(["ast_world", "ast_bonds"]);
    expect(quotes.origin).toBe("imported");
    expect(quotes.closes.get("ast_world")?.[0]?.close).toBe("999");
  });

  it("feeds the gate: the weights of Cartera show the close, with its source", async () => {
    await importPriceFiles([{ name: "ast_world.jsonl", text: line("2029-06-29", "999") }]);
    const host = await show("/cartera", Cartera);
    await settle(20);
    expect(text(host)).toContain("EODHD");
  });
});

describe("the other files of prices/ and deleting what was imported", () => {
  it("leaves the status aside with a note instead of refusing the import", async () => {
    const outcome = await importPriceFiles([
      { name: "ast_world.jsonl", text: line("2029-06-29", "999") },
      { name: "_status.json", text: "{}" },
    ]);
    expect(outcome).toEqual({ kind: "imported", assets: ["ast_world"], ignored: ["_status.json"] });
  });

  it("deletes the prices imported by hand, and nothing else", async () => {
    await importPriceFiles([{ name: "ast_world.jsonl", text: line("2029-06-29", "999") }]);
    expect((await loadWebQuotes(["ast_world"])).origin).toBe("imported");
    await forgetPrices();
    expect((await loadWebQuotes(["ast_world"])).closes.size).toBe(0);
  });

  it("offers to delete them in Ajustes only when there are imported prices", async () => {
    await importPriceFiles([{ name: "ast_world.jsonl", text: line("2029-06-29", "999") }]);
    const host = await show("/ajustes", Ajustes);
    const forget = () =>
      [...host.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("Borrar los precios importados"),
      );
    // The condition, not a time (review of PR #96, N4): it failed under load.
    await until(() => forget() !== undefined, "the button to delete the imported prices");
    forget()?.click();
    await until(
      () => text(host).includes("Precios importados borrados de este navegador"),
      "the notice that they were deleted",
    );
    expect(text(host)).toContain("Precios importados borrados de este navegador");
    expect(text(host)).toContain("Sin precios automáticos en este dispositivo");
  });
});

describe("reading prices from the folder the console writes", () => {
  it("reads prices/ of the assets of the ledger, and says a lost permission", async () => {
    await rememberFolder(fakeFolder({ "prices/ast_world.jsonl": line("2029-06-29", "120") }));
    await reloadWebHistory();
    const quotes = await loadWebQuotes(["ast_world", "ast_bonds"]);
    expect(quotes.origin).toBe("folder");
    expect([...quotes.closes.keys()]).toEqual(["ast_world"]);
    await rememberFolder(fakeFolder({}, "prompt"));
    await reloadWebHistory();
    expect((await loadWebQuotes(["ast_world"])).problem).toBe("permission");
  });

  it("says a file that does not read, and leaves that asset without an automatic price", async () => {
    await rememberFolder(fakeFolder({ "prices/ast_world.jsonl": "nope\n" }));
    await reloadWebHistory();
    const quotes = await loadWebQuotes(["ast_world"]);
    expect(quotes.unreadable).toEqual([
      { asset_id: "ast_world", code: "price_line_invalid", line: 1 },
    ]);
    expect(quotes.closes.size).toBe(0);
    expect(externalOf(quotes, {} as never)).toBeUndefined();
  });
});

describe("closes stored in the wrong currency (review of PR #80)", () => {
  it("are left out of the figures in euros of the web, and said", async () => {
    const symbols = JSON.stringify({
      symbols_format: 2,
      assets: {
        ast_world: {
          eodhd: "W.LSE",
          currencies: { eodhd: "GBX" },
          confirmed_at: "x",
        },
      },
    });
    await rememberFolder(
      fakeFolder({
        "prices/ast_world.jsonl": line("2029-06-29", "1000", "GBP"),
        "prices/symbols.json": symbols,
      }),
    );
    await reloadWebHistory();
    const quotes = await loadWebQuotes(["ast_world"]);
    expect(quotes.closes.get("ast_world")).toEqual([]);
    expect(quotes.mismatched).toMatchObject([{ asset_id: "ast_world", source: "eodhd", count: 1 }]);
  });
});

describe("second pass of PR #80 in the web: the correspondence beside the prices", () => {
  // The store of this browser outlives a test: what one imports, the next reads.
  beforeEach(() => forgetPrices());
  afterEach(() => forgetPrices());
  const pence = JSON.stringify({
    symbols_format: 2,
    assets: { ast_world: { eodhd: "W.LSE", currencies: { eodhd: "GBX" }, confirmed_at: "x" } },
  });

  it("takes symbols.json in an import and leaves out what it says is stored wrong", async () => {
    const outcome = await importPriceFiles([
      { name: "ast_world.jsonl", text: line("2029-06-29", "1000", "GBP") },
      { name: "symbols.json", text: pence },
    ]);
    expect(outcome).toEqual({ kind: "imported", assets: ["ast_world"], ignored: [] });
    const quotes = await loadWebQuotes(["ast_world"]);
    expect(quotes.closes.get("ast_world")).toEqual([]);
    expect(quotes.mismatched).toMatchObject([{ asset_id: "ast_world", count: 1 }]);
    expect(quotes.symbols).toBeUndefined();
    // Prices imported later without it keep the correspondence imported before.
    await importPriceFiles([{ name: "ast_world.jsonl", text: line("2029-06-29", "1000", "GBP") }]);
    expect((await loadWebQuotes(["ast_world"])).closes.get("ast_world")).toEqual([]);
  });

  it("refuses an import whose symbols.json does not read, whole", async () => {
    expect(
      await importPriceFiles([
        { name: "ast_world.jsonl", text: line("2029-06-29", "999") },
        { name: "symbols.json", text: "{" },
      ]),
    ).toEqual({ kind: "refused", file: "symbols.json", code: "invalid_symbols_file" });
    expect((await loadWebQuotes(["ast_world"])).closes.size).toBe(0);
  });

  it("says it cannot check the currency of prices imported without symbols.json", async () => {
    await importPriceFiles([{ name: "ast_world.jsonl", text: line("2029-06-29", "999") }]);
    expect((await loadWebQuotes(["ast_world"])).symbols).toEqual({ problem: "missing" });
    const host = await show("/cartera", Cartera);
    await settle(20);
    expect(text(host)).toContain("no se puede comprobar la divisa");
  });

  it("says a symbols.json of the folder that does not read, and uses no automatic price", async () => {
    await rememberFolder(
      fakeFolder({
        "prices/ast_world.jsonl": line("2029-06-29", "999"),
        "prices/symbols.json": "{",
      }),
    );
    await reloadWebHistory();
    const quotes = await loadWebQuotes(["ast_world"]);
    expect(quotes.closes.size).toBe(0);
    expect(quotes.symbols).toEqual({ problem: "unreadable", code: "invalid_symbols_file" });
    const host = await show("/cartera", Cartera);
    await settle(20);
    expect(text(host)).toContain("prices/symbols.json no se entiende");
  });
});

describe("a local configuration that does not read (§6.4 (d))", () => {
  it("is said with the key it does not understand, never as a browser that keeps no data", async () => {
    await rememberFolder(fakeFolder({ "atlas.config.json": '{"ecb_stale_days": 3}' }));
    const history = await reloadWebHistory();
    expect(history.problem).toBe("config");
    expect(history.configField).toBe("ecb_stale_days");
    expect((await loadWebHistory()).problem).not.toBe("storage");
  });
});

describe("a price on the screen", () => {
  it("marks an approximation, a quote without its value in euros, and says its origin", async () => {
    const price = {
      unitValue: Money.of(Decimal.parse("220"), "EUR"),
      priceDate: "2029-06-29",
      ageDays: 2,
      stale: false,
      priceOrigin: "EODHD",
      approximate: true,
      eurMissing: "el BCE no publica esa divisa",
    };
    const host = document.createElement("div");
    document.body.append(host);
    const { render } = await import("solid-js/web");
    const dispose = render(
      () => (
        <>
          <Price price={price} />
          <PriceDetail price={price} />
        </>
      ),
      host,
    );
    const shown = text(host);
    expect(shown).toContain("aproximado");
    expect(shown).toContain("sin valor en euros");
    expect(shown).toContain("EODHD");
    expect(shown).toContain("falta su valor en euros (el BCE no publica esa divisa)");
    dispose();
  });
});

describe("Ajustes with prices imported", () => {
  it("says where they come from and how many assets have one", async () => {
    await importPriceFiles([{ name: "ast_world.jsonl", text: line("2029-06-29", "999") }]);
    const host = await show("/ajustes", Ajustes);
    await settle(30);
    expect(text(host)).toContain(
      "Importados a mano en este navegador: un activo, con cierres hasta el",
    );
  });
});

describe("Ajustes on a device without folders (the phone)", () => {
  it("says there are no automatic prices until the cloud exists, and offers the import", async () => {
    const host = await show("/ajustes", Ajustes);
    await settle(20);
    const shown = text(host);
    expect(shown).toContain("Precios automáticos");
    expect(shown).toContain(
      "En el teléfono no hay precios automáticos hasta que exista la sincronización con la nube",
    );
    expect(shown).toContain("Importar precios");
    expect(shown).toContain("un activo dado de alta solo en esta web no tiene precio automático");
    expect(shown).not.toMatch(/próximamente|sincroniza para verlos/i);
  });
});

describe("the calculator of the contribution in the web", () => {
  it("says the note of the domain when a weight rests on an approximation, and adds nothing of its own", async () => {
    const { contributionView } = await import("../src/view-models/core/contribution.js");
    const note = {
      code: "weights_use_approximation",
      event_id: "",
      message: "x",
      details: { assets: ["ast_world"] },
    };
    const plan = {
      date: "2029-06-30",
      amount_eur: Money.of(Decimal.parse("100"), "EUR"),
      amount_origin: "flag",
      bucket_budget_eur: Money.of(Decimal.parse("10"), "EUR"),
      core_amount_eur: Money.of(Decimal.parse("90"), "EUR"),
      core_value_eur: Money.of(Decimal.parse("90"), "EUR"),
      surplus_distributed: false,
      rows: [],
      warnings: [note],
    } as never;
    expect(contributionView(plan).approximation).toBe(note);
    expect(
      contributionView({ ...(plan as object), warnings: [] } as never).approximation,
    ).toBeUndefined();
  });
});
