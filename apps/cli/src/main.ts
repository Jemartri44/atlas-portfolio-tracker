#!/usr/bin/env node
// atlas — command-line interface over a local ledger.jsonl (specs/001-ledger-core/contracts/cli.md).

import { createInterface } from "node:readline/promises";
import {
  EcbDownloadFailed,
  EcbHistoryDamaged,
  ExactJsonUnsupported,
  FileLedgerStore,
  LedgerLockedError,
  LockLostError,
  readLocalConfig,
  SecretsError,
  sweepOrphanTemporaries,
  systemClock,
  webCryptoRandom,
} from "@atlas/adapters";
import {
  ConflictError,
  DependentEventsError,
  DomainError,
  DuplicateFingerprintError,
  SchemaTooNewError,
  type UseCaseDeps,
} from "@atlas/domain";
import type { FxRateSource } from "@atlas/domain/ecb";
import { booleanFlag, parseArgs, stringFlag, UsageError } from "./args.js";
import { addCommand } from "./commands/add.js";
import { backupCommand } from "./commands/backup.js";
import { bucketCommand, netWorthCommand } from "./commands/bucket.js";
import { accountCommand, assetCommand, settingsCommand } from "./commands/catalogue.js";
import { compactCommand } from "./commands/compact.js";
import { corporateActionCommand } from "./commands/corporate-actions.js";
import { draftCommand, pendingDraftsNote } from "./commands/draft.js";
import { exportCommand } from "./commands/export.js";
import { filedCommand } from "./commands/filed.js";
import { fxCommand } from "./commands/fx.js";
import { m720Command, m721Command } from "./commands/informative.js";
import { lockCommand } from "./commands/lock.js";
import { contributeCommand, costsCommand, weightsCommand } from "./commands/portfolio.js";
import { pricesCommand } from "./commands/prices.js";
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
import { describeLock, LOCK_LOST, remedyFor } from "./output/lock.js";
import { describeDependants, describeDuplicate, describeError } from "./output/messages.js";
import { describeSecretsError } from "./output/prices.js";
import type { PriceEnvironment } from "./prices/load.js";

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
  filed: filedCommand,
  m720: m720Command,
  m721: m721Command,
  check: checkCommand,
  export: exportCommand,
  synth: synthCommand,
  compact: compactCommand,
  backup: backupCommand,
  lock: lockCommand,
  fx: fxCommand,
  draft: draftCommand,
  prices: pricesCommand,
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
  filed: 3,
  m720: 2,
  m721: 2,
  check: 1,
  export: 1,
  synth: 1,
  compact: 1,
  backup: 1,
  lock: { show: 2, break: 2 },
  fx: { update: 2, status: 2, correct: 2 },
  prices: { update: 2, status: 2, symbols: 4, purge: 3 },
  draft: { list: 2, confirm: 3, discard: 3 },
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

export const USAGE = `uso: atlas [--ledger <ruta>] [--yes] [--confirm-duplicate] [--confirm-fx-rate] [--accept-invalid] [--json] <comando> …

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
  filed <renta|720|721> <año> [--set <clave>=<importe>]… [--receipt …] [--filed-at …]
  weights [--date]   contribute [--amount <eur>] [--date]   costs [--date]
  networth [--date]   bucket [--date]
  transfer simulate --from-asset <id> --to-asset <id> (--quantity <n> | --all) [--date]
  export --format jsonl|csv [--out <ruta>]
  synth --out <ruta> [--seed <n>]   backup --to <directorio>
  compact [--yes] [--accept-unverified <id>]…   la renuncia a comprobar la huella de esa presentación queda registrada
  lock show|break                el cerrojo de la carpeta del libro: quién lo tiene, y romperlo a petición
  fx update|status               el histórico oficial del BCE junto al libro: descargarlo y ver cuál está en vigor
  prices update|status           los cierres diarios junto al libro (prices/): descargarlos y ver cada fuente y su cupo
  prices purge <activo> --source S  quita los cierres guardados en una divisa que su fuente no declara; sus días se vuelven a pedir una vez
  prices symbols [set|remove] <activo> [--eodhd S] [--alpha-vantage S] --currency C [--eodhd-currency C] [--alpha-vantage-currency C] [--accept-currency]
  fx correct [--reason …]        corrige los tipos que no son los de su fecha fiscal (tras cambiar fiscal_date_rule)
  add … --draft                  guarda como borrador una operación cuyo tipo del BCE aún no se ha publicado
  draft list|confirm <id>|discard <id>   los borradores: no cuentan en ninguna cifra hasta registrarlos`;

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
  /** The source of the ECB history; replaced in tests, which never touch the network. */
  fxSource?: () => FxRateSource,
  /** The sources of prices and the file of the keys; replaced in tests. */
  prices?: PriceEnvironment,
): Promise<number> => {
  let remind: string | undefined;
  const code = await dispatch(argv, io, compose, fxSource, prices, (path) => {
    remind = path;
  });
  // Said after every command, whatever it did, failures included: a draft
  // nobody remembers is an operation that never reaches the ledger.
  if (remind !== undefined) {
    const note = await pendingDraftsNote(remind);
    if (note !== undefined) {
      io.err(note);
    }
  }
  return code;
};

const dispatch = async (
  argv: readonly string[],
  io: Io,
  compose: (ledgerPath: string) => UseCaseDeps,
  fxSource: (() => FxRateSource) | undefined,
  prices: PriceEnvironment | undefined,
  /** Where the reminder of pending drafts looks, once a command is going to run. */
  remindAt: (ledgerPath: string) => void,
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
      confirmFxRate: booleanFlag(flags, "confirm-fx-rate"),
      acceptInvalid: booleanFlag(flags, "accept-invalid"),
      json: booleanFlag(flags, "json"),
      ...(fxSource === undefined ? {} : { fxSource }),
      ...(prices === undefined ? {} : { prices }),
    };
    if (name !== "draft") {
      remindAt(ledgerPath);
    }
    await sweepTemporaries(io, ledgerPath);
    return await command(ctx, positionals, flags);
  } catch (error) {
    if (error instanceof LedgerLockedError) {
      return reportLocked(io, error);
    }
    if (error instanceof EcbDownloadFailed) {
      io.err(
        `Error: no se ha podido descargar el histórico del BCE. El ZIP: ${error.zip}. La API: ${error.api}. No se ha tocado el histórico que había.`,
      );
      return EXIT.domain;
    }
    if (error instanceof EcbHistoryDamaged) {
      io.err(
        `Error: reference/ecb/${error.file} no es el archivo que registra su manifiesto: alguien lo ha cambiado. No se ha usado; bórralo junto con reference/ecb/manifest.json y descárgalo otra vez con \`atlas fx update\`.`,
      );
      return EXIT.domain;
    }
    return report(io, error);
  }
};

/**
 * The temporaries of a write killed before its rename, removed at the start of
 * every command — only when nobody holds the lock (review of PR #75). Best
 * effort: a folder that cannot be swept must not stop the command.
 */
const sweepTemporaries = async (io: Io, ledgerPath: string): Promise<void> => {
  try {
    const removed = await sweepOrphanTemporaries(ledgerPath);
    if (removed.length > 0) {
      io.err(
        `Se ${removed.length === 1 ? "ha quitado un fichero temporal" : `han quitado ${removed.length} ficheros temporales`} de una escritura interrumpida (${removed.join(", ")}): el libro no se había tocado.`,
      );
    }
  } catch {
    // Nothing to say: the next write writes its own temporary anyway.
  }
};

/** The lock of the folder is held: who, since when, and the two ways out. */
const reportLocked = async (io: Io, error: LedgerLockedError): Promise<number> => {
  const { lock_stale_minutes } = await readLocalConfig(error.folder).catch(() => ({
    lock_stale_minutes: undefined,
  }));
  io.err(
    `Error: ${describeLock(error.info, new Date(), lock_stale_minutes ?? Number.POSITIVE_INFINITY)}`,
  );
  io.err(remedyFor(error.info));
  return EXIT.locked;
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
  // The refusal of `--accept-invalid` on a synced folder (V7) is not a list of
  // dependants to rectify: it has its own sentence.
  if (error instanceof DependentEventsError && error.code !== "accept_invalid_while_synced") {
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
  if (error instanceof SecretsError) {
    io.err(`Error: ${describeSecretsError(error)}`);
    return EXIT.domain;
  }
  if (error instanceof ExactJsonUnsupported) {
    io.err(
      "Error: esta versión de Node no deja leer el texto exacto de un número JSON, y un cierre nunca se lee como número de coma flotante. Usa Node 22 o posterior (.nvmrc).",
    );
    return EXIT.domain;
  }
  if (error instanceof LockLostError) {
    io.err(`Error: ${LOCK_LOST}`);
    return EXIT.locked;
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
