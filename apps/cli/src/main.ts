#!/usr/bin/env node
// atlas — command-line interface over a local ledger.jsonl.

import { createInterface } from "node:readline/promises";
import {
  FileLedgerStore,
  sweepOrphanTemporaries,
  systemClock,
  webCryptoRandom,
} from "@atlas/adapters";
import type { UseCaseDeps } from "@atlas/domain";
import type { FxRateSource } from "@atlas/domain/ecb";
import type { AdminAccess } from "./admin/environment.js";
import { booleanFlag, parseArgs, stringFlag, UsageError } from "./args.js";
import { addCommand } from "./commands/add.js";
import { adminCommand } from "./commands/admin.js";
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
import { remoteCommand } from "./commands/remote.js";
import { synthCommand } from "./commands/synth.js";
import { taxCommand } from "./commands/tax.js";
import { thesisCommand } from "./commands/thesis.js";
import { orderCommand, transferCommand } from "./commands/tracking.js";
import {
  type Command,
  CommandFailure,
  type Context,
  EXIT,
  type Io,
  type PromptOptions,
} from "./context.js";
import {
  CloudLedgerStore,
  type FolderMode,
  looksAtMode,
  resolveFolderMode,
} from "./folder-mode.js";
import { askWithoutEcho } from "./output/secret-prompt.js";
import type { PriceEnvironment } from "./prices/load.js";
import type { RemoteEnvironment } from "./remote/environment.js";
import { reportError } from "./report.js";
import { assertArity, USAGE } from "./usage.js";

/** `atlas sync` is gone (ADR-0035): there is no queue and no path between a local ledger and the cloud. */
const syncRetiredCommand: Command = async () => {
  throw new CommandFailure(EXIT.usage, "command_retired", [
    "Error: `atlas sync` se ha retirado (ADR-0035): el libro de la nube es la única fuente de verdad y no hay cola ni sincronización. Para empezar en la nube: `atlas remote login` en una carpeta nueva y `atlas remote upload --from <ledger.jsonl>` sobre una nube vacía. Para bajar una copia: `atlas backup --to <directorio>`.",
  ]);
};

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
  remote: remoteCommand,
  admin: adminCommand,
  sync: syncRetiredCommand,
};

const composeDeps = (ledgerPath: string): UseCaseDeps => ({
  store: new FileLedgerStore(ledgerPath),
  clock: systemClock,
  random: webCryptoRandom,
});

const promptOutput = (options: PromptOptions | undefined) =>
  options?.aside === true ? process.stderr : process.stdout;

export const terminalIo = (): Io => ({
  out: (text) => process.stdout.write(`${text}\n`),
  err: (text) => process.stderr.write(`${text}\n`),
  confirm: async (question, options) => {
    if (!process.stdin.isTTY) {
      return undefined;
    }
    const rl = createInterface({ input: process.stdin, output: promptOutput(options) });
    try {
      const answer = (await rl.question(question)).trim().toLowerCase();
      return answer === "s" || answer === "si" || answer === "sí" || answer === "y";
    } finally {
      rl.close();
    }
  },
  ask: async (question, options) => {
    if (!process.stdin.isTTY) {
      return undefined;
    }
    const rl = createInterface({ input: process.stdin, output: promptOutput(options) });
    try {
      return (await rl.question(question)).trim();
    } finally {
      rl.close();
    }
  },
  askSecret: (question) =>
    askWithoutEcho(question, { input: process.stdin, output: process.stdout }),
});

/** What the tests replace: everything else is the real thing. */
export interface RunOverrides {
  readonly compose?: (ledgerPath: string) => UseCaseDeps;
  /** The source of the ECB history; tests never touch the network. */
  readonly fxSource?: (() => FxRateSource) | undefined;
  /** The sources of prices and the file of the keys. */
  readonly prices?: PriceEnvironment | undefined;
  /** The network, the credentials and the browser of `atlas remote`. */
  readonly remote?: RemoteEnvironment | undefined;
  /** The clients of the administration; tests never reach AWS. */
  readonly admin?: AdminAccess | undefined;
}

/** What `dispatch` leaves for `run` to use after a failure. */
interface Invocation {
  /** Where the reminder of pending drafts looks, once a command is going to run. */
  remindAt?: string;
  cloud?: CloudLedgerStore;
}

/** `--json` anywhere before a `--`: known even when the arguments do not parse. */
const wantsJson = (argv: readonly string[]): boolean => {
  const end = argv.indexOf("--");
  return (end < 0 ? argv : argv.slice(0, end)).some(
    (word) => word === "--json" || word.startsWith("--json="),
  );
};

/** Runs one invocation and returns the exit code. */
export const run = async (
  argv: readonly string[],
  io: Io,
  overrides: RunOverrides = {},
): Promise<number> => {
  let wroteStdout = false;
  const watched: Io = {
    ...io,
    out: (text) => {
      wroteStdout = true;
      io.out(text);
    },
  };
  const invocation: Invocation = {};
  let code: number;
  try {
    code = await dispatch(argv, watched, overrides, invocation);
  } catch (error) {
    code = await reportError(watched, error, {
      json: wantsJson(argv),
      wroteStdout: () => wroteStdout,
      ...(invocation.cloud === undefined ? {} : { cloud: invocation.cloud }),
    });
  }
  // Said after every command, whatever it did, failures included: a draft
  // nobody remembers is an operation that never reaches the ledger.
  if (invocation.remindAt !== undefined) {
    const note = await pendingDraftsNote(invocation.remindAt);
    if (note !== undefined) {
      io.err(note);
    }
  }
  return code;
};

const dispatch = async (
  argv: readonly string[],
  io: Io,
  { compose = composeDeps, fxSource, prices, remote, admin }: RunOverrides,
  invocation: Invocation,
): Promise<number> => {
  const { positionals, flags } = parseArgs(argv);
  const name = positionals[0];
  // `--help` and `-h` ask for the usage line wherever they stand: that is not a usage error.
  const asked = name === "help" || name === "-h" || flags.has("help");
  if (name === undefined || asked) {
    const json = booleanFlag(flags, "json");
    if (name === undefined && !asked && json) {
      throw new UsageError("falta la orden");
    }
    io.out(json ? JSON.stringify({ usage: USAGE }, null, 2) : USAGE);
    return name === undefined && !asked ? EXIT.usage : EXIT.ok;
  }
  const command = COMMANDS[name];
  if (command === undefined) {
    throw new UsageError(`comando desconocido: ${name}`);
  }
  assertArity(positionals);
  const ledgerPath = stringFlag(flags, "ledger") ?? "./ledger.jsonl";
  // Cloud folder or local folder, before anything reads or writes the ledger
  // (ADR-0035, §4): both at once is refused here.
  const mode: FolderMode = looksAtMode(positionals)
    ? await resolveFolderMode(ledgerPath)
    : { kind: "local" };
  const base = compose(ledgerPath);
  const ctx: Context = {
    deps:
      mode.kind === "cloud"
        ? { ...base, store: new CloudLedgerStore(() => ctx, mode.remote, base.store.schema) }
        : base,
    io,
    ledgerPath,
    mode,
    yes: booleanFlag(flags, "yes"),
    confirmDuplicate: booleanFlag(flags, "confirm-duplicate"),
    confirmFxRate: booleanFlag(flags, "confirm-fx-rate"),
    acceptInvalid: booleanFlag(flags, "accept-invalid"),
    json: booleanFlag(flags, "json"),
    ...(fxSource === undefined ? {} : { fxSource }),
    ...(prices === undefined ? {} : { prices }),
    ...(remote === undefined ? {} : { remote }),
    ...(admin === undefined ? {} : { admin }),
  };
  if (ctx.deps.store instanceof CloudLedgerStore) {
    invocation.cloud = ctx.deps.store;
  }
  // The reminder reads the folder's own `drafts/`: a cloud folder has none (its drafts are in
  // the cloud, `atlas draft list`), and the reminder would cost a request on every command.
  if (name !== "draft" && mode.kind === "local") {
    invocation.remindAt = ledgerPath;
  }
  await sweepTemporaries(io, ledgerPath);
  return await command(ctx, positionals, flags);
};

/**
 * The temporaries of a write killed before its rename, removed at the start of
 * every command — only when nobody holds the lock. Best
 * effort: a folder that cannot be swept must not stop the command.
 */
const sweepTemporaries = async (io: Io, ledgerPath: string): Promise<void> => {
  try {
    const removed = await sweepOrphanTemporaries(ledgerPath);
    // Said as it is: a temporary of the ledger means the
    // ledger was not replaced; one of `sync/` means a sync was cut, and the
    // ledger may have been rewritten already — the next sync recognises it.
    const ledger = removed.filter((name) => !name.startsWith("sync"));
    const sync = removed.filter((name) => name.startsWith("sync"));
    if (ledger.length > 0) {
      io.err(
        `Se ${ledger.length === 1 ? "ha quitado un fichero temporal" : `han quitado ${ledger.length} ficheros temporales`} de una escritura interrumpida (${ledger.join(", ")}): el libro no se había tocado.`,
      );
    }
    if (sync.length > 0) {
      io.err(
        `Se ${sync.length === 1 ? "ha quitado un fichero temporal" : `han quitado ${sync.length} ficheros temporales`} de una sincronización interrumpida (${sync.join(", ")}): el libro pudo quedar ya reescrito, y la próxima sincronización lo reconoce sin perder nada.`,
      );
    }
  } catch {
    // Nothing to say: the next write writes its own temporary anyway.
  }
};

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  run(process.argv.slice(2), terminalIo()).then((code) => {
    process.exitCode = code;
  });
}
