#!/usr/bin/env node
// atlas — command-line interface over a local ledger.jsonl (specs/001-ledger-core/contracts/cli.md).

import { createInterface } from "node:readline/promises";
import { FileLedgerStore, systemClock, webCryptoRandom } from "@atlas/adapters";
import {
  ConflictError,
  DependentEventsError,
  DomainError,
  DuplicateFingerprintError,
  SchemaTooNewError,
  type UseCaseDeps,
} from "@atlas/domain";
import { booleanFlag, parseArgs, stringFlag, UsageError } from "./args.js";
import { addCommand } from "./commands/add.js";
import { backupCommand } from "./commands/backup.js";
import { bucketCommand, netWorthCommand } from "./commands/bucket.js";
import { accountCommand, assetCommand, settingsCommand } from "./commands/catalogue.js";
import { compactCommand } from "./commands/compact.js";
import { corporateActionCommand } from "./commands/corporate-actions.js";
import { exportCommand } from "./commands/export.js";
import { m720Command, m721Command } from "./commands/informative.js";
import { contributeCommand, costsCommand, weightsCommand } from "./commands/portfolio.js";
import {
  cashCommand,
  checkCommand,
  gainsCommand,
  incomeCommand,
  lotsCommand,
  positionsCommand,
  valuationsCommand,
} from "./commands/query.js";
import { deleteCommand, editCommand } from "./commands/rectify.js";
import { synthCommand } from "./commands/synth.js";
import { taxCommand } from "./commands/tax.js";
import { thesisCommand } from "./commands/thesis.js";
import { orderCommand, transferCommand } from "./commands/tracking.js";
import { type Command, ConfirmationRequired, type Context, EXIT, type Io } from "./context.js";
import { describeDependants, describeDuplicate, describeError } from "./output/messages.js";

export const COMMANDS: Record<string, Command> = {
  account: accountCommand,
  asset: assetCommand,
  settings: settingsCommand,
  add: addCommand,
  order: orderCommand,
  transfer: transferCommand,
  transfers: transferCommand,
  ca: corporateActionCommand,
  thesis: thesisCommand,
  valuations: valuationsCommand,
  edit: editCommand,
  delete: deleteCommand,
  positions: positionsCommand,
  networth: netWorthCommand,
  bucket: bucketCommand,
  weights: weightsCommand,
  contribute: contributeCommand,
  costs: costsCommand,
  lots: lotsCommand,
  cash: cashCommand,
  gains: gainsCommand,
  income: incomeCommand,
  tax: taxCommand,
  m720: m720Command,
  m721: m721Command,
  check: checkCommand,
  export: exportCommand,
  synth: synthCommand,
  compact: compactCommand,
  backup: backupCommand,
};

/**
 * How many words each command reads, its own name included, per subcommand
 * where it has them. A word more is refused, never ignored: a boolean flag
 * followed by a word leaves that word loose, and a command that ignored it
 * would record the opposite of what was written (verifier of feature 009).
 * An unknown subcommand is left to the command, which says its own usage.
 */
export const ARITY: Readonly<Record<string, number | Readonly<Record<string, number>>>> = {
  account: { add: 2, update: 3, list: 2 },
  asset: { add: 2, update: 3, list: 2 },
  settings: { set: 2, show: 2 },
  add: 2,
  order: { place: 2, cancel: 3, note: 3, list: 2 },
  transfer: { request: 2, update: 3, pending: 2, simulate: 2 },
  transfers: { request: 2, update: 3, pending: 2, simulate: 2 },
  ca: 2,
  thesis: { open: 2, close: 3, show: 3, list: 2 },
  valuations: 1,
  edit: 2,
  delete: 2,
  positions: 1,
  networth: 1,
  bucket: 1,
  weights: 1,
  contribute: 1,
  costs: 1,
  lots: 2,
  cash: 1,
  gains: 2,
  income: 2,
  tax: 2,
  m720: 2,
  m721: 2,
  check: 1,
  export: 1,
  synth: 1,
  compact: 1,
  backup: 1,
};

/** Refuses the first word a command does not read. */
const assertArity = (positionals: readonly string[]): void => {
  const [name, sub] = positionals as [string, string | undefined];
  const arity = ARITY[name];
  const most = typeof arity === "number" ? arity : sub === undefined ? undefined : arity?.[sub];
  const extra = most === undefined ? undefined : positionals[most];
  if (extra !== undefined) {
    throw new UsageError(
      `sobra el argumento «${extra}»: «atlas ${positionals.slice(0, most).join(" ")}» no lo espera`,
    );
  }
};

export const USAGE = `uso: atlas [--ledger <ruta>] [--yes] [--confirm-duplicate] [--accept-invalid] [--json] <comando> …

comandos:
  account add|update|list        asset add|update|list        settings set|show
  add buy|sell|transfer|dividend|interest|fx|cash-in|cash-out|fee|valuation
  order place|cancel|note|list [--all] [--date]     transfer request|update|pending [--date]
  ca split|reverse-split|merger|spin-off|fund-merger|share-class-change|fund-liquidation|delisting|raw
  thesis open|close <id>|show <id>|list [--closed] [--date]   add buy|sell … --thesis <id>
  edit <id> --reason …           delete <id> --reason …
  positions  lots [activo]  cash  gains <año>  income <año>  valuations [--date]  check [--deep]
  tax <año> [--lots] [--boxes]   base del ahorro: total fiscal de núcleo y cubo, no la cuota
  m720 <año>   m721 <año>        bienes en el extranjero a 31/12 y si hay que presentar
  weights [--date]   contribute [--amount <eur>] [--date]   costs [--date]
  networth [--date]   bucket [--date]
  transfer simulate --from-asset <id> --to-asset <id> (--quantity <n> | --all) [--date]
  export --format jsonl|csv [--out <ruta>]
  synth --out <ruta> [--seed <n>]   compact [--yes]   backup --to <directorio>`;

export const composeDeps = (ledgerPath: string): UseCaseDeps => ({
  store: new FileLedgerStore(ledgerPath),
  clock: systemClock,
  random: webCryptoRandom,
});

export const terminalIo = (): Io => ({
  out: (text) => process.stdout.write(`${text}\n`),
  err: (text) => process.stderr.write(`${text}\n`),
  confirm: async (question) => {
    if (!process.stdin.isTTY) {
      return undefined;
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answer = (await rl.question(question)).trim().toLowerCase();
      return answer === "s" || answer === "si" || answer === "sí" || answer === "y";
    } finally {
      rl.close();
    }
  },
});

/** Runs one invocation and returns the exit code. `compose` is replaced in tests. */
export const run = async (
  argv: readonly string[],
  io: Io,
  compose: (ledgerPath: string) => UseCaseDeps = composeDeps,
): Promise<number> => {
  try {
    const { positionals, flags } = parseArgs(argv);
    const name = positionals[0];
    if (name === undefined || name === "help") {
      io.out(USAGE);
      return name === undefined ? EXIT.usage : EXIT.ok;
    }
    const command = COMMANDS[name];
    if (command === undefined) {
      throw new UsageError(`comando desconocido: ${name}`);
    }
    assertArity(positionals);
    const ledgerPath = stringFlag(flags, "ledger") ?? "./ledger.jsonl";
    const ctx: Context = {
      deps: compose(ledgerPath),
      io,
      ledgerPath,
      yes: booleanFlag(flags, "yes"),
      confirmDuplicate: booleanFlag(flags, "confirm-duplicate"),
      acceptInvalid: booleanFlag(flags, "accept-invalid"),
      json: booleanFlag(flags, "json"),
    };
    return await command(ctx, positionals, flags);
  } catch (error) {
    return report(io, error);
  }
};

const report = (io: Io, error: unknown): number => {
  if (error instanceof UsageError) {
    io.err(`Error de uso: ${error.message}`);
    io.err(USAGE);
    return EXIT.usage;
  }
  if (error instanceof ConfirmationRequired) {
    io.err(`Error: ${error.message}`);
    return EXIT.noTty;
  }
  if (error instanceof DuplicateFingerprintError) {
    io.err(describeDuplicate(error));
    return EXIT.duplicate;
  }
  if (error instanceof DependentEventsError) {
    io.err(describeDependants(error));
    return EXIT.domain;
  }
  if (error instanceof ConflictError) {
    io.err(describeError(error));
    return EXIT.conflict;
  }
  if (error instanceof SchemaTooNewError) {
    io.err(describeError(error));
    return EXIT.schemaTooNew;
  }
  if (error instanceof DomainError) {
    io.err(`Error (${error.code}): ${describeError(error)}`);
    return EXIT.domain;
  }
  throw error;
};

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  run(process.argv.slice(2), terminalIo()).then((code) => {
    process.exitCode = code;
  });
}
