// atlas synth --out <ruta> [--seed <n>]: writes a deterministic synthetic ledger
// to a new file, after verifying it the way `check --deep` would.

import { access } from "node:fs/promises";
import { FileLedgerStore } from "@atlas/adapters";
import {
  DomainError,
  deepCheck,
  encodeLine,
  generateLedger,
  integrity,
  type LedgerSummary,
  projectLedger,
  summarizeLedger,
} from "@atlas/domain";
import { assertKnownFlags, type Flags, requireFlag, stringFlag, UsageError } from "../args.js";
import { type Context, GLOBAL_FLAGS } from "../context.js";
import { table } from "../output/table.js";
import { render } from "./shared.js";

export const pathExists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const describe = (path: string, seed: number, summary: LedgerSummary): string =>
  [
    `Libro sintético escrito en ${path} (semilla ${seed}): ${summary.events} eventos, ${summary.accounts.length} cuentas, ${summary.assets.length} activos, ejercicios ${summary.years.join(", ")}.`,
    table(
      ["tipo", "eventos"],
      Object.entries(summary.by_type).map(([type, count]) => [type, String(count)]),
    ),
  ].join("\n");

export const synthCommand = async (
  ctx: Context,
  _positionals: string[],
  flags: Flags,
): Promise<number> => {
  assertKnownFlags(flags, ["out", "seed", ...GLOBAL_FLAGS]);
  const out = requireFlag(flags, "out");
  const seedText = stringFlag(flags, "seed") ?? "1";
  if (!/^\d+$/.test(seedText)) {
    throw new UsageError("--seed debe ser un entero no negativo");
  }
  const seed = Number(seedText);
  if (await pathExists(out)) {
    throw new DomainError("path_exists", `${out} already exists`, { path: out });
  }
  const events = generateLedger({ seed });
  const state = projectLedger(events, { collectErrors: true });
  const lines = events.map(encodeLine);
  const errors = [...integrity(state), ...deepCheck(lines, events, state)].filter(
    (finding) => finding.severity === "error",
  );
  if (state.invalid.length > 0 || errors.length > 0) {
    throw new DomainError("synthetic_invalid", "the generated ledger does not verify", {
      invalid: state.invalid.map((entry) => entry.error.code),
      findings: errors.map((finding) => finding.code),
    });
  }
  const store = new FileLedgerStore(out);
  const { etag } = await store.load();
  await store.append(events, etag);
  const summary = summarizeLedger(events);
  render(ctx, { path: out, seed, summary }, describe(out, seed, summary));
  return 0;
};
