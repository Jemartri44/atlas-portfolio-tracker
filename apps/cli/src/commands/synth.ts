// atlas synth --out <ruta> [--seed <n>]: writes a deterministic synthetic ledger
// to a new file, after verifying it the way `check --deep` would.

import { FileLedgerStore } from "@atlas/adapters";
import {
  DomainError,
  encodeLine,
  generateLedger,
  integrity,
  type LedgerSummary,
  projectLedger,
  summarizeLedger,
} from "@atlas/domain";
import { deepCheck } from "@atlas/domain/tools";
import { assertKnownFlags, type Flags, requireFlag, stringFlag, UsageError } from "../args.js";
import { type Context, GLOBAL_FLAGS } from "../context.js";
import { pathExists } from "../fs.js";
import { table } from "../output/table.js";
import { render } from "./shared.js";

/** The generator seeds a 32-bit state: anything larger would be silently folded. */
const MAX_SEED = 2 ** 32 - 1;

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
  const seed = /^\d{1,10}$/.test(seedText) ? Number(seedText) : Number.NaN;
  if (!(seed <= MAX_SEED)) {
    throw new UsageError(`--seed debe ser un entero entre 0 y ${MAX_SEED}`);
  }
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
