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
import { accountCommand, assetCommand, settingsCommand } from "./commands/catalogue.js";
import { compactCommand } from "./commands/compact.js";
import { corporateActionCommand } from "./commands/corporate-actions.js";
import { exportCommand } from "./commands/export.js";
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
import { thesisCommand } from "./commands/thesis.js";
import { orderCommand, transferCommand } from "./commands/tracking.js";
import { type Command, ConfirmationRequired, type Context, EXIT, type Io } from "./context.js";
import { describeDependants, describeDuplicate, describeError } from "./output/messages.js";

const COMMANDS: Record<string, Command> = {
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
  lots: lotsCommand,
  cash: cashCommand,
  gains: gainsCommand,
  income: incomeCommand,
  check: checkCommand,
  export: exportCommand,
  synth: synthCommand,
  compact: compactCommand,
  backup: backupCommand,
};

export const USAGE = `uso: atlas [--ledger <ruta>] [--yes] [--confirm-duplicate] [--json] <comando> …

comandos:
  account add|update|list        asset add|update|list        settings set|show
  add buy|sell|transfer|dividend|interest|fx|cash-in|cash-out|fee|valuation
  order place|cancel|note|list   transfer request|update|pending
  ca split|reverse-split|merger|spin-off|fund-merger|share-class-change|fund-liquidation|delisting|raw
  thesis open|close|list [--closed]   add buy|sell … --thesis <id>
  edit <id> --reason …           delete <id> --reason …
  positions  lots [activo]  cash  gains <año>  income <año>  valuations [--date]  check [--deep]
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
    const ledgerPath = stringFlag(flags, "ledger") ?? "./ledger.jsonl";
    const ctx: Context = {
      deps: compose(ledgerPath),
      io,
      ledgerPath,
      yes: booleanFlag(flags, "yes"),
      confirmDuplicate: booleanFlag(flags, "confirm-duplicate"),
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
