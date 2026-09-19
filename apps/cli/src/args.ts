// Hand-written argument parser (no dependencies): positionals, `--flag value`,
// `--flag=value`, boolean flags (no value or followed by another flag) and `--`
// to stop flag parsing.

export type FlagValue = string | true;
export type Flags = Map<string, FlagValue>;

export interface ParsedArgs {
  positionals: string[];
  flags: Flags;
}

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

/**
 * The flags that never take a value. Without this list a boolean flag followed
 * by a word swallowed it as its value: `atlas --json tax 2027` read `tax` as the
 * value of `--json` and answered «comando desconocido: 2027», and
 * `atlas --yes asset add` answered «--yes no admite valor» — in exactly the
 * order the usage line suggests (verifier of feature 009). Every `booleanFlag`
 * of the CLI has to be here; `test/args.test.ts` reads the sources to check it.
 */
export const BOOLEAN_FLAGS: ReadonlySet<string> = new Set([
  // Global.
  "yes",
  "confirm-duplicate",
  "accept-invalid",
  "json",
  // Of a command.
  "all",
  "closed",
  "deep",
  "history",
  "inactive",
  "lots",
  "neutrality-regime",
  "no-neutrality-regime",
  "not-transferable",
  "transferable",
]);

export const parseArgs = (
  argv: readonly string[],
  booleans: ReadonlySet<string> = BOOLEAN_FLAGS,
): ParsedArgs => {
  const positionals: string[] = [];
  const flags: Flags = new Map();
  let onlyPositionals = false;
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i] as string;
    if (onlyPositionals || !token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    if (token === "--") {
      onlyPositionals = true;
      continue;
    }
    const body = token.slice(2);
    if (body.length === 0 || body.startsWith("-")) {
      throw new UsageError(`opción no válida: ${token}`);
    }
    const equals = body.indexOf("=");
    if (equals >= 0) {
      flags.set(body.slice(0, equals), body.slice(equals + 1));
      continue;
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--") || booleans.has(body)) {
      flags.set(body, true);
      continue;
    }
    flags.set(body, next);
    i += 1;
  }
  return { positionals, flags };
};

export const stringFlag = (flags: Flags, name: string): string | undefined => {
  const value = flags.get(name);
  if (value === undefined) {
    return undefined;
  }
  if (value === true) {
    throw new UsageError(`--${name} necesita un valor`);
  }
  return value;
};

export const requireFlag = (flags: Flags, name: string): string => {
  const value = stringFlag(flags, name);
  if (value === undefined) {
    throw new UsageError(`falta --${name}`);
  }
  return value;
};

export const booleanFlag = (flags: Flags, name: string): boolean => {
  const value = flags.get(name);
  if (value === undefined) {
    return false;
  }
  if (value !== true) {
    throw new UsageError(`--${name} no admite valor`);
  }
  return true;
};

/** Rejects flags outside the allowed set (typos never silently drop a field). */
export const assertKnownFlags = (flags: Flags, allowed: readonly string[]): void => {
  for (const name of flags.keys()) {
    if (!allowed.includes(name)) {
      throw new UsageError(`opción desconocida: --${name}`);
    }
  }
};
