// A ledger folder on the disk for the tests of the prices (feature 013), with
// a file of keys **outside** it, a fixed clock, and sources that are doubles:
// no test touches the network, and every key is the sentinel.

import { chmod, mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileLedgerStore, type Keys } from "@atlas/adapters";
import type { CivilDate } from "@atlas/domain";
import { encodeLine, type LedgerEvent, type UseCaseDeps } from "@atlas/domain";
import type { DailyClose, PriceSource, QuoteSource, SourceResult } from "@atlas/domain/quotes";
import type { Io } from "../../src/context.js";
import { run } from "../../src/main.js";

export const KEY = "TEST-KEY-013";

export type Script = (symbol: string, from: CivilDate, to: CivilDate) => SourceResult<DailyClose[]>;

export class ScriptedSource implements PriceSource {
  readonly calls: string[] = [];
  constructor(
    readonly name: QuoteSource,
    private readonly script: Script,
    private readonly currency: (symbol: string) => SourceResult<string | undefined> = () => ({
      ok: true,
      value: undefined,
    }),
  ) {}
  async dailyCloses(symbol: string, from: CivilDate, to: CivilDate) {
    this.calls.push(symbol);
    return this.script(symbol, from, to);
  }
  async currencyOf(symbol: string) {
    this.calls.push(`currency:${symbol}`);
    return this.currency(symbol);
  }
}

export interface Folder {
  readonly dir: string;
  readonly ledger: string;
  readonly secrets: string;
  readonly keysSeen: Keys[];
  eodhd: ScriptedSource;
  alpha: ScriptedSource;
  instant: string;
  /** The ledger of the folder with the fixed clock, for a test that calls `run` itself. */
  compose: (path: string) => UseCaseDeps;
  atlas(...argv: string[]): Promise<{ code: number; out: string; err: string; text: string }>;
  /** Every file written in the folder, with its content, to look for the key. */
  written(): Promise<Map<string, string>>;
}

export const folder = async (
  events: readonly LedgerEvent[],
  /** `null`: no file of keys at all. */
  keys: Record<string, string> | null = { eodhd: KEY, alpha_vantage: KEY },
): Promise<Folder> => {
  const root = await mkdtemp(join(tmpdir(), "atlas-prices-013-"));
  const dir = join(root, "ledger");
  const config = join(root, "config", "atlas");
  await mkdir(dir, { recursive: true });
  await mkdir(config, { recursive: true });
  const ledger = join(dir, "ledger.jsonl");
  await writeFile(ledger, events.map((event) => `${encodeLine(event)}\n`).join(""));
  const secrets = join(config, "secrets.json");
  if (keys !== null) {
    await writeFile(secrets, JSON.stringify(keys));
    await chmod(secrets, 0o600);
  }
  const keysSeen: Keys[] = [];
  const state: Folder = {
    dir,
    ledger,
    secrets,
    keysSeen,
    eodhd: new ScriptedSource("eodhd", () => ({ ok: true, value: [] })),
    alpha: new ScriptedSource("alpha_vantage", () => ({ ok: true, value: [] })),
    instant: "2027-06-09T08:00:00.000Z",
    compose: (path) => ({
      store: new FileLedgerStore(path),
      clock: { now: () => new Date(state.instant) },
      random: (target) => target.fill(7),
    }),
    atlas: async (...argv) => {
      const out: string[] = [];
      const err: string[] = [];
      const io: Io = {
        out: (text) => out.push(text),
        err: (text) => err.push(text),
        confirm: async () => undefined,
      };
      const code = await run(["--ledger", ledger, ...argv], io, state.compose, undefined, {
        secretsPath: secrets,
        sources: (given) => {
          keysSeen.push(given);
          return {
            ...(given.eodhd === undefined ? {} : { eodhd: state.eodhd }),
            ...(given.alpha_vantage === undefined ? {} : { alpha_vantage: state.alpha }),
          };
        },
      });
      return { code, out: out.join("\n"), err: err.join("\n"), text: [...out, ...err].join("\n") };
    },
    written: async () => {
      const files = new Map<string, string>();
      const walk = async (path: string): Promise<void> => {
        for (const entry of await readdir(path, { withFileTypes: true })) {
          const full = join(path, entry.name);
          if (entry.isDirectory()) {
            await walk(full);
          } else {
            files.set(full, await readFile(full, "utf8"));
          }
        }
      };
      await walk(dir);
      return files;
    },
  };
  return state;
};

/** What a leak looks like: the key, whole or cut (Node's SyntaxError cuts it). */
export const leaks = (text: string): boolean => text.includes(KEY.slice(0, 8));
