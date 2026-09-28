// Feature 016, E2, block 3 (R24; §8.1 P18, amended in §8.2 M4 and M5):
// `atlas admin prices push` against the double of S3 the API runs on. Only
// `prices/symbols.json`; no local state; the difference on screen; the name of
// the environment typed; never `--yes`; 4 without a terminal; and the write on
// the ETag of the read that showed the difference. Never AWS.

import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DomainError } from "@atlas/domain";
import { serializeSymbols } from "@atlas/domain/quotes";
import { describe, expect, it } from "vitest";
import { CONFIG, setup } from "../../../api/test/harness.js";
import type { AdminAccess } from "../../src/admin/environment.js";
import { EXIT } from "../../src/context.js";
import { harness, seed } from "../harness.js";

type Api = ReturnType<typeof setup>;

const KEY = "prices/symbols.json";
const AT = "2026-09-01T00:00:00.000Z";

const adminOf = (api: Api): AdminAccess => ({
  clientsFor: async (environment) => {
    if (environment !== "test") {
      throw new DomainError("admin_environment_unknown", "unknown", {
        environment,
        path: "admin.json",
      });
    }
    return { objects: api.s3, parameters: api.ssm, ssmPrefix: CONFIG.ssmPrefix };
  },
});

const entry = (symbol: string, extra: object = {}) => ({
  eodhd: symbol,
  currencies: { eodhd: "EUR" },
  confirmed_at: AT,
  ...extra,
});

const symbols = (assets: Record<string, object>): string =>
  serializeSymbols({ symbols_format: 2, assets } as never);

/** A folder with its own `prices/`: `symbols.json` (unless `undefined`) and a `config.json`. */
const folderWith = async (local: string | undefined): Promise<string> => {
  const folder = await mkdtemp(join(tmpdir(), "atlas-push-"));
  await mkdir(join(folder, "prices"));
  if (local !== undefined) {
    await writeFile(join(folder, "prices", "symbols.json"), local);
  }
  await writeFile(join(folder, "prices", "config.json"), '{"config_format":1}\n');
  return folder;
};

/** The console of the administrator in `folder`; `typed: null` is no terminal at all. */
const consoleIn = (api: Api, folder: string, typed: string | null = "test") =>
  harness({
    events: seed(),
    admin: adminOf(api),
    ledgerPath: join(folder, "ledger.jsonl"),
    ...(typed === null ? {} : { confirm: true, typed }),
  });

const push = ["admin", "prices", "push", "--env", "test"];

/** What the bucket holds, key by key, with its ETag: to see that nothing was written. */
const snapshot = (api: Api) => api.s3.keys().map((key) => [key, api.s3.etagOf(key)]);

describe("atlas admin prices push (016, E2, block 3)", () => {
  it("uploads the local bytes on If-None-Match when the cloud has none, and nothing else", async () => {
    const api = setup();
    const local = symbols({ ast_a: entry("A.XETRA") });
    const folder = await folderWith(local);
    const before = await readdir(folder, { recursive: true });
    const c = consoleIn(api, folder);
    expect(await c.exec(push)).toBe(EXIT.ok);
    expect(c.text()).toContain("La nube no tiene ningún prices/symbols.json.");
    expect(c.text()).toContain("añadido ast_a");
    expect(c.text()).toContain("Escribe «test» para seguir");
    expect(api.s3.text(KEY)).toBe(local);
    expect(api.s3.conditions.filter((condition) => condition.key.startsWith("prices/"))).toEqual([
      { key: KEY, ifNoneMatch: "*" },
    ]);
    // Never the budget of the console, and no state left behind here.
    expect(api.s3.keys().filter((key) => key.startsWith("prices/"))).toEqual([KEY]);
    expect(await readdir(folder, { recursive: true })).toEqual(before);
  });

  it("shows the difference with the remote and writes on the ETag of that read", async () => {
    const api = setup();
    api.s3.seed(KEY, symbols({ ast_gone: entry("G.XETRA"), ast_moved: entry("M.XETRA") }));
    const read = api.s3.etagOf(KEY) as string;
    const local = symbols({ ast_moved: entry("M.LSE"), ast_new: entry("N.XETRA") });
    const c = consoleIn(api, await folderWith(local));
    expect(await c.exec(push)).toBe(EXIT.ok);
    expect(c.text()).toContain("Diferencia con el prices/symbols.json de la nube:");
    expect(c.text()).toContain("quitado ast_gone");
    expect(c.text()).toContain("cambiado ast_moved (eodhd)");
    expect(c.text()).toContain("añadido ast_new");
    // What it replaces, to recover it from the versions of the bucket (review of PR #106, N5).
    expect(c.text()).toContain(`ETag ${read}`);
    expect(c.text()).toMatch(/versión version-\d+/);
    expect(api.s3.text(KEY)).toBe(local);
    expect(api.s3.conditions.filter((condition) => condition.key === KEY)).toEqual([
      { key: KEY, ifMatch: read },
    ]);
  });

  it("says when only the form of the file changes", async () => {
    const api = setup();
    const local = symbols({ ast_a: entry("A.XETRA") });
    api.s3.seed(KEY, `${local}\n`);
    const c = consoleIn(api, await folderWith(local));
    expect(await c.exec(push)).toBe(EXIT.ok);
    expect(c.text()).toContain("ningún activo cambia: solo la forma del fichero");
    expect(api.s3.text(KEY)).toBe(local);
  });

  it("replaces a remote it cannot read, saying so", async () => {
    const api = setup();
    api.s3.seedBytes(KEY, Uint8Array.from([0xff, 0xfe]));
    const local = symbols({ ast_a: entry("A.XETRA") });
    const c = consoleIn(api, await folderWith(local));
    expect(await c.exec(push)).toBe(EXIT.ok);
    expect(c.text()).toContain("no se puede leer: se sustituye entero");
    expect(api.s3.text(KEY)).toBe(local);
  });

  it("uploads nothing, and asks nothing, when the cloud already has these bytes", async () => {
    const api = setup();
    const local = symbols({ ast_a: entry("A.XETRA") });
    api.s3.seed(KEY, local);
    const before = snapshot(api);
    const c = consoleIn(api, await folderWith(local));
    expect(await c.exec(push)).toBe(EXIT.ok);
    expect(c.text()).toContain("ya tiene este prices/symbols.json");
    expect(c.text()).not.toContain("Escribe");
    expect(snapshot(api)).toEqual(before);
  });

  it("refuses --yes before reading anything, and writes nothing", async () => {
    const api = setup();
    const c = consoleIn(api, await folderWith(symbols({ ast_a: entry("A.XETRA") })));
    expect(await c.exec([...push, "--yes"])).toBe(EXIT.usage);
    expect(c.text()).toContain("--yes no vale en «atlas admin prices push»");
    expect(api.s3.keys()).not.toContain(KEY);
    expect(api.s3.calls.filter((call) => call.includes("prices/"))).toEqual([]);
  });

  it("stops with 4 without a terminal to ask, and writes nothing", async () => {
    const api = setup();
    const c = consoleIn(api, await folderWith(symbols({ ast_a: entry("A.XETRA") })), null);
    expect(await c.exec(push)).toBe(EXIT.noTty);
    expect(api.s3.keys()).not.toContain(KEY);
  });

  it("cancels when what is typed is not the name of the environment", async () => {
    const api = setup();
    const c = consoleIn(api, await folderWith(symbols({ ast_a: entry("A.XETRA") })), "s");
    expect(await c.exec(push)).toBe(EXIT.ok);
    expect(c.text()).toContain("Cancelado: no se ha tocado nada.");
    expect(api.s3.keys()).not.toContain(KEY);
  });

  it.each([
    [
      "a file with closes misstored",
      symbols({ ast_a: entry("A.LSE", { misstored: { eodhd: "GBP" } }) }),
      "symbols_push_misstored",
    ],
    ["no file", undefined, "symbols_push_missing"],
    ["a file it cannot read", "{", "invalid_symbols_file"],
    [
      "a file of a newer format",
      JSON.stringify({ symbols_format: 3, assets: {} }),
      "symbols_file_newer_version",
    ],
  ])("refuses %s, asking nothing and writing nothing", async (_case, local, code) => {
    const api = setup();
    const c = consoleIn(api, await folderWith(local));
    expect(await c.exec(push)).toBe(EXIT.domain);
    expect(c.text()).toContain(code);
    expect(c.text()).not.toContain("Escribe");
    expect(api.s3.keys()).not.toContain(KEY);
  });

  it("refuses a top-level key the file does not have, never showing its value (review of PR #106, B1)", async () => {
    const api = setup();
    const remote = symbols({ ast_a: entry("A.XETRA") });
    api.s3.seed(KEY, remote);
    const local = JSON.stringify({
      ...JSON.parse(remote),
      eodhd_api_key: "sentinel-secret-of-the-push",
    });
    const c = consoleIn(api, await folderWith(local));
    expect(await c.exec(push)).toBe(EXIT.domain);
    expect(c.text()).toContain("symbols_file_unknown_key");
    expect(c.text()).toContain("eodhd_api_key");
    expect(c.text()).not.toContain("sentinel-secret-of-the-push");
    expect(c.text()).not.toContain("Escribe");
    expect(api.s3.text(KEY)).toBe(remote);
  });

  it("refuses a local file that repeats a key, never showing the value (review of PR #106, R2-B1)", async () => {
    const api = setup();
    const remote = symbols({ ast_a: entry("A.XETRA") });
    api.s3.seed(KEY, remote);
    const local = `{"symbols_format":2,"assets":{"LEAK":{"note":"sentinel-secret-of-the-push"}},"assets":${JSON.stringify(JSON.parse(remote).assets)}}`;
    const c = consoleIn(api, await folderWith(local));
    expect(await c.exec(push)).toBe(EXIT.domain);
    expect(c.text()).toContain("json_key_repeated");
    expect(c.text()).toContain("assets");
    expect(c.text()).not.toContain("sentinel-secret-of-the-push");
    expect(c.text()).not.toContain("Escribe");
    expect(api.s3.text(KEY)).toBe(remote);
  });

  it("refuses a local file that is not UTF-8", async () => {
    const api = setup();
    const folder = await folderWith(undefined);
    await writeFile(join(folder, "prices", "symbols.json"), Uint8Array.from([0xff]));
    const c = consoleIn(api, folder);
    expect(await c.exec(push)).toBe(EXIT.domain);
    expect(c.text()).toContain("invalid_symbols_file");
  });

  it("refuses to rewrite a remote of a newer format", async () => {
    const api = setup();
    const newer = JSON.stringify({ symbols_format: 3, assets: {} });
    api.s3.seed(KEY, newer);
    const c = consoleIn(api, await folderWith(symbols({ ast_a: entry("A.XETRA") })));
    expect(await c.exec(push)).toBe(EXIT.domain);
    expect(c.text()).toContain("symbols_push_remote_newer");
    expect(api.s3.text(KEY)).toBe(newer);
  });

  it("writes nothing when the remote changes between the read and the write, and never retries", async () => {
    const api = setup();
    api.s3.seed(KEY, symbols({ ast_a: entry("A.XETRA") }));
    const theirs = symbols({ ast_theirs: entry("T.XETRA") });
    api.s3.beforePut = (key) => {
      if (key === KEY) {
        api.s3.seed(KEY, theirs);
      }
    };
    const c = consoleIn(api, await folderWith(symbols({ ast_b: entry("B.XETRA") })));
    expect(await c.exec(push)).toBe(EXIT.domain);
    expect(c.text()).toContain("symbols_push_conflict");
    expect(api.s3.text(KEY)).toBe(theirs);
    expect(api.s3.conditions.filter((condition) => condition.key === KEY)).toHaveLength(1);
  });

  it("writes on the read that showed the difference, never on a later one (mutant 13 bis)", async () => {
    const api = setup();
    api.s3.seed(KEY, symbols({ ast_a: entry("A.XETRA") }));
    const theirs = symbols({ ast_theirs: entry("T.XETRA") });
    // Another writer right after the read, while the difference is on screen.
    const get = api.s3.get.bind(api.s3);
    let reads = 0;
    api.s3.get = async (key) => {
      const read = await get(key);
      if (key === KEY && ++reads === 1) {
        api.s3.seed(KEY, theirs);
      }
      return read;
    };
    const c = consoleIn(api, await folderWith(symbols({ ast_b: entry("B.XETRA") })));
    expect(await c.exec(push)).toBe(EXIT.domain);
    expect(c.text()).toContain("symbols_push_conflict");
    expect(api.s3.text(KEY)).toBe(theirs);
  });

  it("writes nothing when another writer creates the object first", async () => {
    const api = setup();
    const theirs = symbols({ ast_theirs: entry("T.XETRA") });
    api.s3.beforePut = (key) => {
      if (key === KEY) {
        api.s3.seed(KEY, theirs);
      }
    };
    const c = consoleIn(api, await folderWith(symbols({ ast_b: entry("B.XETRA") })));
    expect(await c.exec(push)).toBe(EXIT.domain);
    expect(c.text()).toContain("symbols_push_conflict");
    expect(api.s3.text(KEY)).toBe(theirs);
  });

  it("is only «push», with no word more", async () => {
    const api = setup();
    const c = consoleIn(api, await folderWith(symbols({ ast_a: entry("A.XETRA") })));
    expect(await c.exec(["admin", "prices", "--env", "test"])).toBe(EXIT.usage);
    expect(await c.exec(["admin", "prices", "pull", "--env", "test"])).toBe(EXIT.usage);
    expect(await c.exec(["admin", "prices", "push", "more", "--env", "test"])).toBe(EXIT.usage);
    expect(api.s3.keys()).not.toContain(KEY);
  });
});
