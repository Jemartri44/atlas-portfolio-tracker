// atlas prices update | status | symbols (feature 013, block 4), over real
// folders, with doubles of the sources: no test touches the network.

import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AlphaVantagePriceSource, EodhdPriceSource } from "@atlas/adapters";
import { describe, expect, it } from "vitest";
import { CLI_SETTINGS, Events } from "../events.js";
import { folder, KEY, leaks, ScriptedSource } from "./folder.js";

/** A core fund and ETF held, and one sold, valued by hand in May. */
const ledger = () => {
  const b = new Events();
  b.settings({
    ...CLI_SETTINGS,
    target_weights: { fund_a: "50", etf_b: "50" },
    bucket_pct_of_contribution: "10",
  });
  b.account("acc_es");
  b.asset("fund_a", "fund");
  b.asset("etf_b", "etf");
  b.asset("etf_gone", "etf");
  b.deposit("acc_es", "2027-01-04", "10000");
  b.buy("acc_es", "fund_a", "2027-01-05", "10", "100");
  b.buy("acc_es", "etf_b", "2027-01-05", "10", "100");
  b.buy("acc_es", "etf_gone", "2027-01-05", "1", "100");
  b.sell("acc_es", "etf_gone", "2027-02-05", "1", "100");
  b.valuation("acc_es", "fund_a", "2027-05-31", "10", "110");
  b.valuation("acc_es", "etf_b", "2027-05-31", "10", "105");
  return b.build();
};

const symbols = async (dir: string, assets: Record<string, Record<string, unknown>>) => {
  await mkdir(join(dir, "prices"), { recursive: true });
  await writeFile(
    join(dir, "prices", "symbols.json"),
    JSON.stringify({
      symbols_format: 1,
      assets: Object.fromEntries(
        Object.entries(assets).map(([id, entry]) => [
          id,
          {
            confirmed_at: "2027-01-01T00:00:00.000Z",
            // Contrasted with its sources unless the test says otherwise.
            currency_check: Object.fromEntries(
              ["eodhd", "alpha_vantage"]
                .filter((source) => entry[source] !== undefined)
                .map((source) => [source, { at: "2027-01-01T00:00:00.000Z" }]),
            ),
            ...entry,
          },
        ]),
      ),
    }),
  );
};

describe("atlas prices update", () => {
  it("without keys calls nobody, says so, and is not an error", async () => {
    const f = await folder(ledger(), null);
    const result = await f.atlas("prices", "update");
    expect(result.code).toBe(0);
    expect(result.text).toContain("No hay claves de fuentes de precios configuradas");
    expect(result.text).toContain("La entrada manual");
    expect(f.eodhd.calls).toEqual([]);
  });

  it("downloads the held assets, says what it did, and never writes in the ledger", async () => {
    const f = await folder(ledger());
    await symbols(f.dir, {
      fund_a: { currency: "EUR", eodhd: "XX0000000013.EUFUND" },
      etf_b: { currency: "EUR", eodhd: "ETFB.XETRA", alpha_vantage: "ETFB.DEX" },
      etf_gone: { currency: "EUR", eodhd: "GONE.XETRA" },
    });
    f.eodhd = new ScriptedSource("eodhd", (symbol) =>
      symbol === "ETFB.XETRA"
        ? { ok: false, kind: "unavailable" }
        : { ok: true, value: [{ date: "2027-06-08", close: "112.5" }] },
    );
    f.alpha = new ScriptedSource("alpha_vantage", () => ({
      ok: true,
      value: [{ date: "2027-06-08", close: "107" }],
    }));
    const before = await readFile(f.ledger, "utf8");
    const result = await f.atlas("prices", "update");
    expect(result.code).toBe(0);
    expect(f.eodhd.calls).toEqual(["ETFB.XETRA", "XX0000000013.EUFUND"]);
    expect(f.alpha.calls).toEqual(["ETFB.DEX"]);
    expect(result.text).toMatch(
      /etf_b\s+núcleo\s+actualizado\s+Alpha Vantage\s+1\s+EODHD: no responde/,
    );
    expect(result.text).toContain("Cupo que queda hoy: EODHD 18, Alpha Vantage 24.");
    expect(await readFile(f.ledger, "utf8")).toBe(before);
    expect(await readFile(join(f.dir, "prices", "fund_a.jsonl"), "utf8")).toContain(
      '"close":"112.5"',
    );
    // Twice in a row: nothing is spent on what is up to date.
    const again = await f.atlas("prices", "update");
    expect(again.text).toContain("Cupo que queda hoy: EODHD 18, Alpha Vantage 24.");
    expect(f.eodhd.calls).toHaveLength(2);
    // --json carries the same report.
    const json = JSON.parse((await f.atlas("prices", "update", "--json")).out);
    expect(json.assets.map((a: { outcome: string }) => a.outcome)).toEqual([
      "up_to_date",
      "up_to_date",
    ]);
  });

  it("exits with its own code when a source reaches the threshold of consecutive failures", async () => {
    const f = await folder(ledger());
    await symbols(f.dir, {
      fund_a: { currency: "EUR", eodhd: "A" },
      etf_b: { currency: "EUR", eodhd: "B" },
    });
    await writeFile(join(f.dir, "prices", "config.json"), '{"failure_threshold":1}');
    f.eodhd = new ScriptedSource("eodhd", () => ({ ok: false, kind: "blocked" }));
    const result = await f.atlas("prices", "update");
    expect(result.code).toBe(7);
    expect(result.text).toContain("EODHD lleva demasiados fallos seguidos");
    expect(result.text).toContain("ha rechazado la clave");
  });

  it("refuses to use a file of keys that others can read, and says the chmod", async () => {
    const f = await folder(ledger());
    await chmod(f.secrets, 0o644);
    const result = await f.atlas("prices", "update");
    expect(result.code).toBe(1);
    expect(result.text).toContain(`chmod 600 ${f.secrets}`);
    expect(f.keysSeen).toEqual([{}]);
    // Everything else goes on.
    expect((await f.atlas("positions")).code).toBe(0);
  });

  it("refuses when the file of the keys is inside the folder of the ledger", async () => {
    const f = await folder(ledger());
    const inside = { ...f };
    const moved = join(f.dir, "cfg", "secrets.json");
    await mkdir(join(f.dir, "cfg"));
    await writeFile(moved, JSON.stringify({ eodhd: KEY }));
    await chmod(moved, 0o600);
    // The environment points at a file of keys inside the ledger's folder.
    const { run } = await import("../../src/main.js");
    const lines: string[] = [];
    const code = await run(
      ["--ledger", f.ledger, "prices", "update"],
      { out: (t) => lines.push(t), err: (t) => lines.push(t), confirm: async () => undefined },
      f.compose,
      undefined,
      { secretsPath: moved },
    );
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("uno dentro del otro");
    expect(leaks(lines.join("\n"))).toBe(false);
    expect(inside.eodhd.calls).toEqual([]);
  });
});

describe("the key never comes out, with the real adapters and a fetch that fails loudly", () => {
  it("in no output, no file of the folder and no status", async () => {
    const f = await folder(ledger());
    await symbols(f.dir, {
      fund_a: { currency: "EUR", eodhd: "A.EUFUND" },
      etf_b: { currency: "EUR", eodhd: "B.XETRA", alpha_vantage: "B.DEX" },
    });
    const { run } = await import("../../src/main.js");
    const texts: string[] = [];
    const io = {
      out: (t: string) => texts.push(t),
      err: (t: string) => texts.push(t),
      confirm: async () => undefined,
    };
    const loud = async (url: string): Promise<Response> => {
      throw new TypeError(`fetch failed for ${url}`);
    };
    const refusing = async (url: string): Promise<Response> =>
      new Response(`bad key in ${url}`, { status: 401 });
    for (const fetchUrl of [loud, refusing]) {
      const code = await run(["--ledger", f.ledger, "prices", "update"], io, f.compose, undefined, {
        secretsPath: f.secrets,
        sources: (keys) => ({
          eodhd: new EodhdPriceSource(keys.eodhd as string, fetchUrl),
          alpha_vantage: new AlphaVantagePriceSource(keys.alpha_vantage as string, fetchUrl),
        }),
      });
      expect([0, 7]).toContain(code);
    }
    expect(texts.join("\n")).toContain("no responde");
    expect(texts.join("\n")).toContain("ha rechazado la clave");
    expect(leaks(texts.join("\n"))).toBe(false);
    for (const [path, content] of await f.written()) {
      expect({ path, leak: leaks(content) }).toEqual({ path, leak: false });
    }
    // The status says kinds, never an address.
    const status = await readFile(join(f.dir, "prices", "_status.json"), "utf8");
    expect(status).not.toMatch(/https?:|eodhd\.com|alphavantage/);
  });
});

describe("a Node that cannot read a JSON number by its text (D-Q1)", () => {
  it("stops with its own message, spends no call and writes nothing", async () => {
    const f = await folder(ledger());
    await symbols(f.dir, { fund_a: { currency: "EUR", eodhd: "A.EUFUND" } });
    const { run } = await import("../../src/main.js");
    const lines: string[] = [];
    const io = {
      out: (t: string) => lines.push(t),
      err: (t: string) => lines.push(t),
      confirm: async () => undefined,
    };
    const old = ((text: string, reviver: (key: string, value: unknown) => unknown) =>
      JSON.parse(text, (key, value) => reviver(key, value))) as never;
    const code = await run(["--ledger", f.ledger, "prices", "update"], io, f.compose, undefined, {
      secretsPath: f.secrets,
      sources: (keys) => ({
        eodhd: new EodhdPriceSource(keys.eodhd as string, async () => new Response("[]"), old),
      }),
    });
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("no deja leer el texto exacto de un número JSON");
    await expect(readFile(join(f.dir, "prices", "_status.json"), "utf8")).rejects.toThrow();
  });
});

describe("atlas prices symbols", () => {
  it("declares a correspondence, confirmed against the source, and never assumes the currency", async () => {
    const f = await folder(ledger());
    f.eodhd = new ScriptedSource(
      "eodhd",
      () => ({ ok: true, value: [] }),
      () => ({ ok: true, value: "GBP" }),
    );
    // A disagreement is shown, and nothing is written without an explicit yes.
    const refused = await f.atlas(
      "prices",
      "symbols",
      "set",
      "etf_b",
      "--currency",
      "GBX",
      "--eodhd",
      "ETFB.LSE",
    );
    expect(refused.code).not.toBe(0);
    expect(refused.text).toContain("EODHD dice que ETFB.LSE cotiza en GBP, y has declarado GBX");
    await expect(readFile(join(f.dir, "prices", "symbols.json"), "utf8")).rejects.toThrow();
    const accepted = await f.atlas(
      "prices",
      "symbols",
      "set",
      "etf_b",
      "--currency",
      "GBX",
      "--eodhd",
      "ETFB.LSE",
      "--alpha-vantage",
      "ETFB.LON",
      "--accept-currency",
    );
    expect(accepted.code).toBe(0);
    expect(accepted.text).toContain("Símbolos de etf_b guardados");
    const file = JSON.parse(await readFile(join(f.dir, "prices", "symbols.json"), "utf8"));
    expect(file.assets.etf_b).toMatchObject({
      currency: "GBX",
      currency_confirmed_over: { eodhd: "GBP" },
    });
    const listed = await f.atlas("prices", "symbols");
    expect(listed.text).toMatch(/etf_b\s+GBX\s+ETFB.LSE\s+ETFB.LON\s+EODHD dice GBP/);
    expect((await f.atlas("prices", "symbols", "etf_b")).code).toBe(0);
    expect((await f.atlas("prices", "symbols", "fund_a")).text).toContain(
      "no tiene símbolos declarados",
    );
    expect((await f.atlas("prices", "symbols", "remove", "etf_b")).text).toContain(
      "Quitados los símbolos de etf_b",
    );
    expect((await f.atlas("prices", "symbols", "remove", "etf_b")).text).toContain(
      "no tenía símbolos",
    );
  });

  it("refuses an asset outside the catalogue, a missing currency, and saves nothing when the source fails", async () => {
    const f = await folder(ledger());
    expect((await f.atlas("prices", "symbols", "set", "nope", "--currency", "EUR")).text).toContain(
      "no está en el catálogo",
    );
    expect((await f.atlas("prices", "symbols", "set", "etf_b", "--eodhd", "X")).text).toContain(
      "falta --currency",
    );
    f.eodhd = new ScriptedSource(
      "eodhd",
      () => ({ ok: true, value: [] }),
      () => ({ ok: false, kind: "unavailable" }),
    );
    const failed = await f.atlas(
      "prices",
      "symbols",
      "set",
      "etf_b",
      "--currency",
      "EUR",
      "--eodhd",
      "X",
    );
    expect(failed.code).toBe(1);
    expect(failed.text).toContain("no se ha guardado nada");
  });

  it("says what it could not confirm for lack of a key", async () => {
    const f = await folder(ledger(), { eodhd: KEY });
    const result = await f.atlas(
      "prices",
      "symbols",
      "set",
      "etf_b",
      "--currency",
      "EUR",
      "--alpha-vantage",
      "B.DEX",
    );
    expect(result.code).toBe(0);
    expect(result.text).toContain("Sin contrastar con Alpha Vantage");
    expect((await f.atlas("prices", "symbols", "etf_b")).text).toContain(
      "Alpha Vantage: sin contrastar",
    );
  });

  it("refuses a usage it does not know", async () => {
    const f = await folder(ledger());
    expect((await f.atlas("prices", "nope")).code).toBe(64);
    expect((await f.atlas("prices", "symbols", "set")).code).toBe(64);
    expect((await f.atlas("prices", "symbols", "remove")).code).toBe(64);
  });
});

describe("atlas prices status", () => {
  it("says each source with what it spent, and the age of the last close of each asset", async () => {
    const f = await folder(ledger());
    await symbols(f.dir, { fund_a: { currency: "EUR", eodhd: "A" } });
    f.eodhd = new ScriptedSource("eodhd", () => ({
      ok: true,
      value: [{ date: "2027-06-04", close: "111" }],
    }));
    await f.atlas("prices", "update");
    const result = await f.atlas("prices", "status");
    expect(result.code).toBe(0);
    expect(result.text).toMatch(/EODHD\s+1\s+20\s+19\s+0/);
    expect(result.text).toMatch(/fund_a\s+2027-06-04\s+EODHD\s+5/);
    expect(result.text).toMatch(/etf_b\s+sin cierres/);
  });
});
