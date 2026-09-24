// The keys of the sources of prices (decision P1; ADR-0031, second
// amendment): `~/.config/atlas/secrets.json`, or
// `$XDG_CONFIG_HOME/atlas/secrets.json`, **outside the folder of the ledger**,
// with permissions `600`. Only the console reads it; the web never does, and it
// enters no backup, export or sync. **The application never writes it**: the
// user does.
//
// Every way a key could leak through here is closed (§6.4 (e) of prompt 013):
// a file that does not parse says so **without its content** — not the text,
// not the `SyntaxError` of `JSON.parse`, which quotes it —; an error names the
// key, never its value; and the console refuses to run when the folder of the
// configuration and the folder of the ledger are one inside the other.

import { promises as fs } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { QuoteSource } from "@atlas/domain/quotes";

export type SecretsErrorCode =
  | "secrets_unreadable"
  | "secrets_unknown_key"
  | "secrets_invalid_value"
  | "secrets_too_open"
  | "secrets_inside_ledger_folder";

/** Never carries a value: only the code, the path and, at most, the name of a key. */
export class SecretsError extends Error {
  constructor(
    readonly code: SecretsErrorCode,
    readonly path: string,
    readonly key?: string,
  ) {
    super(`${code}: ${path}${key === undefined ? "" : ` (${key})`}`);
    this.name = "SecretsError";
  }
}

export type Keys = Partial<Record<QuoteSource, string>>;

const KEYS: readonly string[] = ["eodhd", "alpha_vantage"];

/** Where the keys live, by the rules of XDG. */
export const secretsPath = (env: NodeJS.ProcessEnv, home: string): string =>
  join(
    env.XDG_CONFIG_HOME !== undefined && isAbsolute(env.XDG_CONFIG_HOME)
      ? env.XDG_CONFIG_HOME
      : join(home, ".config"),
    "atlas",
    "secrets.json",
  );

/** The real path of `path`, or of its nearest existing parent with the rest appended. */
const realOf = async (path: string): Promise<string> => {
  try {
    return await fs.realpath(path);
  } catch {
    const parent = dirname(path);
    return parent === path ? path : join(await realOf(parent), relative(parent, path));
  }
};

const inside = (child: string, parent: string): boolean => {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};

/**
 * The keys, or an empty set when there is no file (no keys: no automatic
 * prices, and that is not an error). Throws `SecretsError` for everything
 * else, and first of all when the two folders are one inside the other.
 */
export const readSecrets = async (path: string, ledgerFolder: string): Promise<Keys> => {
  const config = await realOf(resolve(dirname(path)));
  const ledger = await realOf(resolve(ledgerFolder));
  if (inside(config, ledger) || inside(ledger, config)) {
    throw new SecretsError("secrets_inside_ledger_folder", path);
  }
  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(path);
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") {
      return {};
    }
    throw new SecretsError("secrets_unreadable", path);
  }
  // POSIX only: Windows has no such bits, and the console says so apart.
  if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
    throw new SecretsError("secrets_too_open", path);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readFile(path, "utf8"));
  } catch {
    // Neither the text nor the SyntaxError, which quotes it.
    throw new SecretsError("secrets_unreadable", path);
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new SecretsError("secrets_unreadable", path);
  }
  const keys: Keys = {};
  for (const [name, value] of Object.entries(raw)) {
    if (!KEYS.includes(name)) {
      throw new SecretsError("secrets_unknown_key", path, name);
    }
    if (typeof value !== "string" || value.trim() === "") {
      throw new SecretsError("secrets_invalid_value", path, name);
    }
    keys[name as QuoteSource] = value;
  }
  return keys;
};
