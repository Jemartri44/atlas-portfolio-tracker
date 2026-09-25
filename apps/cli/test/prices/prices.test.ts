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

describe("atlas prices symbols with a currency per source (fix of 013)", () => {
  it("declares London in pounds at EODHD and in pence at Alpha Vantage without asking, and says both", async () => {
    const f = await folder(ledger());
    f.eodhd = new ScriptedSource(
      "eodhd",
      () => ({ ok: true, value: [] }),
      () => ({ ok: true, value: "GBP" }),
    );
    f.alpha = new ScriptedSource(
      "alpha_vantage",
      () => ({ ok: true, value: [] }),
      () => ({ ok: true, value: "GBX" }),
    );
    const result = await f.atlas(
      "prices",
      "symbols",
      "set",
      "etf_b",
      "--eodhd",
      "TSCO.LSE",
      "--eodhd-currency",
      "GBP",
      "--alpha-vantage",
      "TSCO.LON",
      "--alpha-vantage-currency",
      "GBX",
    );
    expect(result.code).toBe(0);
    expect(result.text).not.toContain("confírmalo");
    const file = JSON.parse(await readFile(join(f.dir, "prices", "symbols.json"), "utf8"));
    expect(file.symbols_format).toBe(2);
    expect(file.assets.etf_b.currencies).toEqual({ eodhd: "GBP", alpha_vantage: "GBX" });
    const listed = await f.atlas("prices", "symbols", "etf_b");
    expect(listed.text).toMatch(/etf_b\s+TSCO\.LSE \(GBP\)\s+TSCO\.LON \(GBX\)/);
    // Declared again the same way: still nothing to confirm — no loop.
    const again = await f.atlas(
      "prices",
      "symbols",
      "set",
      "etf_b",
      "--eodhd",
      "TSCO.LSE",
      "--eodhd-currency",
      "GBP",
      "--alpha-vantage",
      "TSCO.LON",
      "--alpha-vantage-currency",
      "GBX",
    );
    expect(again.code).toBe(0);
    expect(again.text).not.toContain("confírmalo");
  });

  it("uses --currency for every source that has no currency of its own, and refuses a source without any", async () => {
    const f = await folder(ledger());
    expect(
      (
        await f.atlas(
          "prices",
          "symbols",
          "set",
          "etf_b",
          "--eodhd",
          "B.XETRA",
          "--currency",
          "EUR",
        )
      ).code,
    ).toBe(0);
    const file = JSON.parse(await readFile(join(f.dir, "prices", "symbols.json"), "utf8"));
    expect(file.assets.etf_b.currencies).toEqual({ eodhd: "EUR" });
    const missing = await f.atlas(
      "prices",
      "symbols",
      "set",
      "etf_b",
      "--eodhd",
      "B.XETRA",
      "--alpha-vantage",
      "B.DEX",
      "--alpha-vantage-currency",
      "EUR",
    );
    expect(missing.code).toBe(64);
    expect(missing.text).toContain("EODHD");
  });

  it("keeps reading a symbols.json of feature 013, with one currency per asset", async () => {
    const f = await folder(ledger());
    await mkdir(join(f.dir, "prices"), { recursive: true });
    await writeFile(
      join(f.dir, "prices", "symbols.json"),
      JSON.stringify({
        symbols_format: 1,
        assets: {
          fund_a: {
            currency: "EUR",
            eodhd: "A.EUFUND",
            confirmed_at: "x",
            currency_check: { eodhd: { at: "x" } },
          },
        },
      }),
    );
    f.eodhd = new ScriptedSource("eodhd", () => ({
      ok: true,
      value: [{ date: "2027-06-08", close: "112" }],
    }));
    expect((await f.atlas("prices", "update")).code).toBe(0);
    expect(await readFile(join(f.dir, "prices", "fund_a.jsonl"), "utf8")).toContain(
      '"currency":"EUR"',
    );
    expect((await f.atlas("prices", "symbols")).text).toMatch(/fund_a\s+A\.EUFUND \(EUR\)/);
  });
});

describe("review of PR #80 in the console", () => {
  it("refuses a currency of a source without its symbol, and a set without any symbol", async () => {
    const f = await folder(ledger());
    const loose = await f.atlas(
      "prices",
      "symbols",
      "set",
      "etf_b",
      "--eodhd",
      "B.XETRA",
      "--currency",
      "EUR",
      "--alpha-vantage-currency",
      "GBX",
    );
    expect(loose.code).toBe(64);
    expect(loose.text).toContain("--alpha-vantage-currency sin --alpha-vantage");
    const looseEodhd = await f.atlas(
      "prices",
      "symbols",
      "set",
      "etf_b",
      "--alpha-vantage",
      "B.DEX",
      "--currency",
      "EUR",
      "--eodhd-currency",
      "GBP",
    );
    expect(looseEodhd.code).toBe(64);
    expect(looseEodhd.text).toContain("--eodhd-currency sin --eodhd");
    const empty = await f.atlas("prices", "symbols", "set", "etf_b", "--currency", "EUR");
    expect(empty.code).toBe(64);
    expect(empty.text).toContain("ningún símbolo");
    await expect(readFile(join(f.dir, "prices", "symbols.json"), "utf8")).rejects.toThrow();
  });

  it("never lets --currency override the currency of a source that brings its own", async () => {
    const f = await folder(ledger());
    const result = await f.atlas(
      "prices",
      "symbols",
      "set",
      "etf_b",
      "--eodhd",
      "TSCO.LSE",
      "--alpha-vantage",
      "TSCO.LON",
      "--currency",
      "GBP",
      "--alpha-vantage-currency",
      "GBX",
    );
    expect(result.code).toBe(0);
    const file = JSON.parse(await readFile(join(f.dir, "prices", "symbols.json"), "utf8"));
    expect(file.assets.etf_b.currencies).toEqual({ eodhd: "GBP", alpha_vantage: "GBX" });
  });

  it("leaves out, says and purges the closes stored in the wrong currency", async () => {
    const f = await folder(ledger());
    await symbols(f.dir, {});
    await writeFile(
      join(f.dir, "prices", "symbols.json"),
      JSON.stringify({
        symbols_format: 2,
        assets: {
          etf_b: {
            eodhd: "TSCO.LSE",
            alpha_vantage: "TSCO.LON",
            currencies: { eodhd: "GBP", alpha_vantage: "GBX" },
            confirmed_at: "x",
            currency_check: { eodhd: { at: "x" }, alpha_vantage: { at: "x" } },
          },
        },
      }),
    );
    const wrong = `${JSON.stringify({ schema_version: 1, date: "2027-06-08", close: "1000", currency: "GBP", source: "alpha_vantage", fetched_at: "2027-06-09T06:00:00.000Z" })}\n`;
    await writeFile(join(f.dir, "prices", "etf_b.jsonl"), wrong);
    const weights = await f.atlas("weights", "--date", "2027-06-09");
    expect(weights.err).toContain(
      "etf_b: 1 cierre de Alpha Vantage está guardado en una divisa que no es la declarada para esa fuente (GBX)",
    );
    expect(weights.text).not.toMatch(/etf_b\s+equity\s+10\s+1000/);
    const status = await f.atlas("prices", "status");
    expect(status.text).toContain("atlas prices purge etf_b --source alpha_vantage");
    const refused = await f.atlas("prices", "purge", "etf_b", "--source", "alpha_vantage");
    expect(refused.code).toBe(4);
    const purged = await f.atlas("prices", "purge", "etf_b", "--source", "alpha_vantage", "--yes");
    expect(purged.code).toBe(0);
    expect(purged.text).toContain("1 cierre");
    expect(await readFile(join(f.dir, "prices", "etf_b.jsonl"), "utf8")).toBe("");
    expect((await f.atlas("prices", "purge", "etf_b", "--source", "yahoo", "--yes")).code).toBe(64);
    expect((await f.atlas("prices", "purge", "fund_a", "--source", "eodhd", "--yes")).code).toBe(1);
  });
});

describe("second pass of PR #80 in the console", () => {
  const line = (close: string, currency: string, source: string) =>
    `${JSON.stringify({ schema_version: 1, date: "2027-06-08", close, currency, source, fetched_at: "2027-06-09T06:00:00.000Z" })}\n`;
  const legacy = (currency: string, over: Record<string, string>) =>
    JSON.stringify({
      symbols_format: 1,
      assets: {
        etf_b: {
          currency,
          eodhd: "TSCO.LSE",
          alpha_vantage: "TSCO.LON",
          confirmed_at: "x",
          currency_check: { eodhd: { at: "x" }, alpha_vantage: { at: "x" } },
          currency_confirmed_over: over,
        },
      },
    });

  for (const [currency, over, source, close, name] of [
    ["GBP", { alpha_vantage: "GBX" }, "alpha_vantage", "1000", "Alpha Vantage"],
    ["GBX", { eodhd: "GBP" }, "eodhd", "10", "EODHD"],
  ] as const) {
    it(`leaves out the closes 013 stored as ${currency} over the ${over[source as keyof typeof over]} of ${name}, before and after an update`, async () => {
      const f = await folder(ledger());
      await symbols(f.dir, {});
      await writeFile(join(f.dir, "prices", "symbols.json"), legacy(currency, over));
      await writeFile(join(f.dir, "prices", "etf_b.jsonl"), line(close, currency, source));
      const said = `etf_b: 1 cierre de ${name} se guardó en ${currency}, pero esa fuente dijo otra divisa`;
      const weights = await f.atlas("weights", "--date", "2027-06-09");
      expect(weights.err).toContain(said);
      expect(weights.text).not.toMatch(new RegExp(`etf_b\\s+equity\\s+10\\s+${close}\\b`));
      await f.atlas("prices", "update");
      expect((await f.atlas("weights", "--date", "2027-06-09")).err).toContain(said);
      expect((await f.atlas("prices", "status")).text).toContain(
        `atlas prices purge etf_b --source ${source}`,
      );
    });
  }

  for (const [what, text, reason] of [
    ["that does not read", "{", "no se entiende"],
    ["of a newer format", '{"symbols_format":3,"assets":{}}', "versión más nueva"],
  ] as const) {
    it(`a symbols.json ${what} degrades the views to the manual prices, and says why`, async () => {
      const f = await folder(ledger());
      await symbols(f.dir, {});
      await writeFile(join(f.dir, "prices", "symbols.json"), text);
      await writeFile(join(f.dir, "prices", "etf_b.jsonl"), line("10", "GBP", "eodhd"));
      const weights = await f.atlas("weights", "--date", "2027-06-09");
      expect(weights.code).toBe(0);
      expect(weights.err).toContain(reason);
      expect(weights.err).toContain("no se usan precios automáticos");
      // The commands that need it still refuse it: they would write it.
      expect((await f.atlas("prices", "update")).code).not.toBe(0);
    });
  }
});

describe("third pass of PR #80 in the console", () => {
  const line = (date: string, close: string, currency: string, source: string) =>
    `${JSON.stringify({ schema_version: 1, date, close, currency, source, fetched_at: "2027-06-09T06:00:00.000Z" })}\n`;
  const pending = JSON.stringify({
    symbols_format: 2,
    assets: {
      etf_b: {
        eodhd: "TSCO.LSE",
        alpha_vantage: "TSCO.LON",
        currencies: { eodhd: "GBP", alpha_vantage: "GBP" },
        confirmed_at: "x",
        misstored: { alpha_vantage: "GBP" },
      },
    },
  });
  const said = "atlas prices purge etf_b --source alpha_vantage";

  it("refuses to declare the asset again without the source with closes stored wrong", async () => {
    const f = await folder(ledger());
    await symbols(f.dir, {});
    await writeFile(join(f.dir, "prices", "symbols.json"), pending);
    await writeFile(
      join(f.dir, "prices", "etf_b.jsonl"),
      line("2027-06-08", "1000", "GBP", "alpha_vantage"),
    );
    const set = await f.atlas(
      "prices",
      "symbols",
      "set",
      "etf_b",
      "--eodhd",
      "TSCO.LSE",
      "--currency",
      "GBP",
    );
    expect(set.code).not.toBe(0);
    expect(`${set.text}${set.err}`).toContain(said);
    // Refused before spending a call.
    expect(f.eodhd.calls).toEqual([]);
    expect(await readFile(join(f.dir, "prices", "symbols.json"), "utf8")).toBe(pending);
    expect((await f.atlas("weights", "--date", "2027-06-09")).err).toContain(
      "etf_b: 1 cierre de Alpha Vantage",
    );
  });

  it("refuses to remove the asset while it has them", async () => {
    const f = await folder(ledger());
    await symbols(f.dir, {});
    await writeFile(join(f.dir, "prices", "symbols.json"), pending);
    await writeFile(
      join(f.dir, "prices", "etf_b.jsonl"),
      line("2027-06-08", "1000", "GBP", "alpha_vantage"),
    );
    const removed = await f.atlas("prices", "symbols", "remove", "etf_b", "--yes");
    expect(removed.code).not.toBe(0);
    expect(`${removed.text}${removed.err}`).toContain(said);
    expect(await readFile(join(f.dir, "prices", "symbols.json"), "utf8")).toBe(pending);
  });

  it("promises to ask the days again once, and says the ones no source served as a hole", async () => {
    const f = await folder(ledger());
    await symbols(f.dir, {});
    await writeFile(
      join(f.dir, "prices", "symbols.json"),
      JSON.stringify({
        symbols_format: 2,
        assets: {
          etf_b: {
            eodhd: "TSCO.LSE",
            alpha_vantage: "TSCO.LON",
            currencies: { eodhd: "GBP", alpha_vantage: "GBX" },
            confirmed_at: "x",
            currency_check: { eodhd: { at: "x" }, alpha_vantage: { at: "x" } },
          },
        },
      }),
    );
    await writeFile(
      join(f.dir, "prices", "etf_b.jsonl"),
      line("2027-06-04", "1000", "GBP", "alpha_vantage") + line("2027-06-08", "10", "GBP", "eodhd"),
    );
    const purged = await f.atlas("prices", "purge", "etf_b", "--source", "alpha_vantage", "--yes");
    expect(purged.text).toContain("vuelve a pedir esos días una vez");
    expect(purged.text).toContain("hueco");
    f.eodhd = new ScriptedSource("eodhd", () => ({
      ok: true,
      value: [{ date: "2027-06-08", close: "10" }],
    }));
    await f.atlas("prices", "update");
    const status = await f.atlas("prices", "status");
    expect(status.text).toContain(
      "etf_b: 1 día quitado de Alpha Vantage (2027-06-04) se pidió otra vez y ninguna fuente lo sirvió: queda como hueco",
    );
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
      currencies: { eodhd: "GBX", alpha_vantage: "GBX" },
      currency_confirmed_over: { eodhd: "GBP" },
    });
    const listed = await f.atlas("prices", "symbols");
    expect(listed.text).toMatch(/etf_b\s+ETFB.LSE \(GBX\)\s+ETFB.LON \(GBX\)\s+EODHD dice GBP/);
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
    expect(
      (await f.atlas("prices", "symbols", "set", "nope", "--eodhd", "X", "--currency", "EUR")).text,
    ).toContain("no está en el catálogo");
    expect((await f.atlas("prices", "symbols", "set", "etf_b", "--eodhd", "X")).text).toContain(
      "falta la divisa de EODHD",
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
