// `prices/` on the disk (feature 013, block 3), under the lock of the folder,
// and the file of the keys outside it.

import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  acquireFolderLock,
  LedgerLockedError,
  LOCK_FILE,
  LockLostError,
} from "../src/ledger-store/folder-lock.js";
import { FilePriceStore } from "../src/prices/file-store.js";
import { readSecrets, SecretsError, secretsPath } from "../src/prices/secrets.js";

const KEY = "TEST-KEY-013";
let root: string;
let ledger: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "atlas-013-"));
  ledger = join(root, "ledger");
  await mkdir(ledger);
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("FilePriceStore", () => {
  it("reads nothing when there is nothing, and writes each file under prices/", async () => {
    const store = new FilePriceStore(ledger);
    expect(await store.config()).toBeUndefined();
    expect(await store.closes("ast_a")).toBeUndefined();
    await store.transact(async (tx) => {
      await tx.appendCloses("ast_a", ['{"a":1}']);
      await tx.appendCloses("ast_a", ['{"a":2}', '{"a":3}']);
      await tx.writeStatus("{}\n");
      await tx.writeSymbols("{ }\n");
      expect(await tx.closes("ast_a")).toBe('{"a":1}\n{"a":2}\n{"a":3}\n');
    });
    expect(await store.status()).toBe("{}\n");
    expect(await store.symbols()).toBe("{ }\n");
    expect((await readdir(join(ledger, "prices"))).sort()).toEqual([
      "_status.json",
      "ast_a.jsonl",
      "symbols.json",
    ]);
    // The lock is released, and no temporary is left.
    expect(await readdir(ledger)).toEqual(["prices"]);
  });

  it("appends after a file that lacks its final newline without touching its bytes", async () => {
    await mkdir(join(ledger, "prices"));
    await writeFile(join(ledger, "prices", "ast_a.jsonl"), '{"a":1}');
    await new FilePriceStore(ledger).transact((tx) => tx.appendCloses("ast_a", ['{"a":2}']));
    expect(await readFile(join(ledger, "prices", "ast_a.jsonl"), "utf8")).toBe(
      '{"a":1}\n{"a":2}\n',
    );
  });

  it("writes under the lock of the folder, and waits a moment for it", async () => {
    const held = await acquireFolderLock(ledger);
    const store = new FilePriceStore(ledger, { lockAttempts: 3, lockWaitMs: 5 });
    await expect(store.transact(async () => 1)).rejects.toBeInstanceOf(LedgerLockedError);
    const waiting = new FilePriceStore(ledger, { lockAttempts: 50, lockWaitMs: 5 }).transact(
      async (tx) => {
        await tx.writeStatus("x");
        return "done";
      },
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    await held.release();
    expect(await waiting).toBe("done");
  });

  it("never renames over a lock that is no longer its own", async () => {
    const store = new FilePriceStore(ledger);
    await expect(
      store.transact(async (tx) => {
        await rm(join(ledger, LOCK_FILE));
        await writeFile(join(ledger, LOCK_FILE), '{"token":"someone else"}');
        await tx.writeStatus("mine");
      }),
    ).rejects.toBeInstanceOf(LockLostError);
    expect(await store.status()).toBeUndefined();
    expect(await readdir(join(ledger, "prices"))).toEqual([]);
  });

  it("keeps an asset id that could not name a file inside prices/, encoded", async () => {
    const store = new FilePriceStore(ledger);
    for (const id of ["../ledger", "a/b", ".hidden", "..", "x y"]) {
      await store.transact((tx) => tx.appendCloses(id, ["{}"]));
      expect(await store.closes(id)).toBe("{}\n");
    }
    expect((await readdir(join(ledger, "prices"))).sort()).toEqual(
      ["%2E..jsonl", "%2E.%2Fledger.jsonl", "%2Ehidden.jsonl", "a%2Fb.jsonl", "x%20y.jsonl"].sort(),
    );
    expect((await readdir(ledger)).sort()).toEqual(["prices"]);
  });

  it("gives up at once on any other error", async () => {
    const store = new FilePriceStore(ledger);
    await expect(
      store.transact(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});

describe("the file of the keys", () => {
  const config = () => join(root, "config", "atlas");
  const write = async (text: string, mode = 0o600) => {
    await mkdir(config(), { recursive: true });
    const path = join(config(), "secrets.json");
    await writeFile(path, text);
    await chmod(path, mode);
    return path;
  };

  it("lives in XDG_CONFIG_HOME when it is set, else in ~/.config", () => {
    expect(secretsPath({ XDG_CONFIG_HOME: "/x/cfg" }, "/home/u")).toBe("/x/cfg/atlas/secrets.json");
    expect(secretsPath({}, "/home/u")).toBe("/home/u/.config/atlas/secrets.json");
    expect(secretsPath({ XDG_CONFIG_HOME: "relative" }, "/home/u")).toBe(
      "/home/u/.config/atlas/secrets.json",
    );
  });

  it("without a file there are no keys, and that is not an error", async () => {
    expect(await readSecrets(join(config(), "secrets.json"), ledger)).toEqual({});
  });

  it("reads the keys of the two sources", async () => {
    const path = await write(JSON.stringify({ eodhd: KEY, alpha_vantage: "OTHER" }));
    expect(await readSecrets(path, ledger)).toEqual({ eodhd: KEY, alpha_vantage: "OTHER" });
  });

  /** Every error, whatever it is: never the content and never a value. */
  const refused = async (path: string, code: string, key?: string) => {
    const error = (await readSecrets(path, ledger).catch((caught) => caught)) as SecretsError;
    expect(error).toBeInstanceOf(SecretsError);
    expect(error.code).toBe(code);
    expect(error.key).toBe(key);
    expect(`${error.message} ${JSON.stringify(error)} ${String(error.stack)}`).not.toContain(KEY);
    // Not even a piece of it: Node's SyntaxError quotes a cut of the text,
    // "TEST-KEY-0", which a search for the whole key would not see.
    expect(error.message).toBe(`${code}: ${path}${key === undefined ? "" : ` (${key})`}`);
  };

  it("says a file that does not parse without its content, not even the SyntaxError", async () => {
    await refused(await write(`{"eodhd": "${KEY}",`), "secrets_unreadable");
    // The SyntaxError of Node quotes the text it could not read: a key without quotes.
    await refused(await write(`{"eodhd": ${KEY}}`), "secrets_unreadable");
    await refused(await write(`["${KEY}"]`), "secrets_unreadable");
  });

  it("names a key it does not know, or a value it cannot use, never the value", async () => {
    await refused(
      await write(JSON.stringify({ coingecko: KEY })),
      "secrets_unknown_key",
      "coingecko",
    );
    await refused(
      await write(JSON.stringify({ eodhd: 7, x: KEY })),
      "secrets_invalid_value",
      "eodhd",
    );
    await refused(
      await write(JSON.stringify({ alpha_vantage: " " })),
      "secrets_invalid_value",
      "alpha_vantage",
    );
  });

  it("refuses a file readable by the group or by others", async () => {
    await refused(await write(JSON.stringify({ eodhd: KEY }), 0o640), "secrets_too_open");
    await refused(await write(JSON.stringify({ eodhd: KEY }), 0o604), "secrets_too_open");
  });

  it("refuses when the folder of the keys is inside the folder of the ledger, or the other way round", async () => {
    await refused(join(ledger, "cfg", "secrets.json"), "secrets_inside_ledger_folder");
    await refused(join(ledger, "secrets.json"), "secrets_inside_ledger_folder");
    await refused(join(root, "secrets.json"), "secrets_inside_ledger_folder");
  });

  it("says a file it cannot even look at as unreadable", async () => {
    await mkdir(join(config(), "secrets.json"), { recursive: true });
    await chmod(config(), 0o000);
    try {
      await refused(join(config(), "secrets.json"), "secrets_unreadable");
    } finally {
      await chmod(config(), 0o700);
    }
  });
});

describe("two consoles downloading at once, on the disk", () => {
  it("never spend more than the budget between them, and write each close once", async () => {
    const { DEFAULT_SETTINGS, Quantity } = await import("@atlas/domain");
    const { updatePrices, parseStatus } = await import("@atlas/domain/quotes");
    const ids = ["ast_a", "ast_b", "ast_c"];
    // Just what the plan of the day reads: three core positions.
    const state = {
      accounts: new Map([["acc", { book: "core" }]]),
      assets: new Map(ids.map((id) => [id, {}])),
      positions: new Map(ids.map((id) => [`acc|${id}`, Quantity.parse("1")])),
    } as never;
    await mkdir(join(ledger, "prices"));
    await writeFile(
      join(ledger, "prices", "config.json"),
      '{"daily_calls":{"eodhd":2,"alpha_vantage":0}}',
    );
    await writeFile(
      join(ledger, "prices", "symbols.json"),
      JSON.stringify({
        symbols_format: 1,
        assets: Object.fromEntries(
          ids.map((id) => [id, { currency: "EUR", eodhd: `${id}.XETRA`, confirmed_at: "x" }]),
        ),
      }),
    );
    let calls = 0;
    const source = {
      name: "eodhd" as const,
      dailyCloses: async () => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { ok: true as const, value: [{ date: "2027-01-05", close: "10" }] };
      },
      currencyOf: async () => ({ ok: true as const, value: undefined }),
    };
    const run = () =>
      updatePrices({
        state,
        settings: DEFAULT_SETTINGS,
        today: "2027-01-06",
        now: () => new Date("2027-01-06T08:00:00.000Z"),
        store: new FilePriceStore(ledger, { lockWaitMs: 2 }),
        sources: { eodhd: source },
      });
    await Promise.all([run(), run()]);
    expect(calls).toBe(2);
    const status = parseStatus(await readFile(join(ledger, "prices", "_status.json"), "utf8"));
    expect(status.sources.eodhd?.calls_at).toHaveLength(2);
  });
});
