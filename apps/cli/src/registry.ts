// The commands of the console: for each, what runs it, how many words it reads and whether it looks
// at the mode of the folder. One table, so that adding a command is one entry here and its line in
// the usage text.

import { UsageError } from "./args.js";
import { addCommand } from "./commands/add.js";
import { adminCommand } from "./commands/admin/index.js";
import { backupCommand } from "./commands/backup.js";
import { bucketCommand, netWorthCommand } from "./commands/bucket.js";
import { accountCommand, assetCommand, settingsCommand } from "./commands/catalogue.js";
import { compactCommand } from "./commands/compact.js";
import { corporateActionCommand } from "./commands/corporate-actions.js";
import { draftCommand } from "./commands/draft.js";
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
import { rebalanceCommand } from "./commands/rebalance.js";
import { deleteCommand, editCommand } from "./commands/rectify.js";
import { remoteCommand } from "./commands/remote.js";
import { synthCommand } from "./commands/synth.js";
import { taxCommand } from "./commands/tax.js";
import { thesisCommand } from "./commands/thesis.js";
import { orderCommand, transferCommand } from "./commands/tracking.js";
import { type Command, CommandFailure, EXIT } from "./context.js";

/** `atlas sync` is gone (ADR-0035): there is no queue and no path between a local ledger and the cloud. */
const syncRetiredCommand: Command = async () => {
  throw new CommandFailure(EXIT.usage, "command_retired", [
    "Error: `atlas sync` se ha retirado (ADR-0035): el libro de la nube es la única fuente de verdad y no hay cola ni sincronización. Para empezar en la nube: `atlas remote login` en una carpeta nueva y `atlas remote upload --from <ledger.jsonl>` sobre una nube vacía. Para bajar una copia: `atlas backup --to <directorio>`.",
  ]);
};

interface CommandSpec {
  readonly run: Command;
  /**
   * How many words the command reads, its own name included, per subcommand where it has them. A
   * word more is refused, never ignored: a boolean flag followed by a word leaves that word
   * loose, and a command that ignored it would record the opposite of what was written. An
   * unknown subcommand is left to the command, which says its own usage.
   */
  readonly arity: number | Readonly<Record<string, number>>;
  /**
   * Whether the folder is resolved as a cloud folder or a local one before the command runs
   * (ADR-0035, §4). Not for those that neither read nor write the ledger of the folder.
   */
  readonly looksAtMode?: (positionals: readonly string[]) => boolean;
}

const blind = () => false;

export const COMMANDS: Readonly<Record<string, CommandSpec>> = {
  account: { run: accountCommand, arity: { add: 2, update: 3, list: 2 } },
  asset: { run: assetCommand, arity: { add: 2, update: 3, list: 2 } },
  settings: { run: settingsCommand, arity: { set: 2, show: 2 } },
  add: { run: addCommand, arity: 2 },
  order: { run: orderCommand, arity: { place: 2, cancel: 3, note: 3, list: 2 } },
  transfer: { run: transferCommand, arity: { request: 2, update: 3, pending: 2, simulate: 2 } },
  transfers: { run: transferCommand, arity: { request: 2, update: 3, pending: 2, simulate: 2 } },
  ca: { run: corporateActionCommand, arity: 2 },
  thesis: { run: thesisCommand, arity: { open: 2, close: 3, show: 3, list: 2 } },
  valuations: { run: valuationsCommand, arity: 1 },
  edit: { run: editCommand, arity: 2 },
  delete: { run: deleteCommand, arity: 2 },
  positions: { run: positionsCommand, arity: 1 },
  networth: { run: netWorthCommand, arity: 1 },
  bucket: { run: bucketCommand, arity: 1 },
  weights: { run: weightsCommand, arity: 1 },
  contribute: { run: contributeCommand, arity: 1 },
  rebalance: { run: rebalanceCommand, arity: 1 },
  costs: { run: costsCommand, arity: 1 },
  lots: { run: lotsCommand, arity: 2 },
  cash: { run: cashCommand, arity: 1 },
  gains: { run: gainsCommand, arity: 2 },
  income: { run: incomeCommand, arity: 2 },
  tax: { run: taxCommand, arity: 2 },
  filed: { run: filedCommand, arity: 3 },
  m720: { run: m720Command, arity: 2 },
  m721: { run: m721Command, arity: 2 },
  check: { run: checkCommand, arity: 1 },
  export: { run: exportCommand, arity: 1 },
  synth: { run: synthCommand, arity: 1, looksAtMode: blind },
  compact: { run: compactCommand, arity: 1 },
  backup: { run: backupCommand, arity: 1 },
  lock: { run: lockCommand, arity: { show: 2, break: 2 }, looksAtMode: blind },
  fx: { run: fxCommand, arity: { update: 2, status: 2, correct: 2 } },
  draft: { run: draftCommand, arity: { list: 2, confirm: 3, discard: 3 } },
  prices: { run: pricesCommand, arity: { update: 2, status: 2, symbols: 4, purge: 3 } },
  remote: {
    run: remoteCommand,
    arity: { login: 2, logout: 2, status: 2, upload: 2 },
    looksAtMode: (positionals) => positionals[1] === "upload",
  },
  admin: {
    run: adminCommand,
    // `secrets` is not here on purpose: its arguments are never quoted back (they may be a value).
    arity: {
      devices: 2,
      "revoke-all-tokens": 2,
      "forget-device": 3,
      compact: 2,
      restore: 2,
      prices: 3,
    },
    looksAtMode: blind,
  },
  sync: {
    // Retired (ADR-0035): any words reach the command, which says where to go.
    run: syncRetiredCommand,
    arity: 99,
  },
};

/** Refuses the first word a command does not read. */
export const assertArity = (positionals: readonly string[]): void => {
  const [name, sub] = positionals as [string, string | undefined];
  const arity = COMMANDS[name]?.arity;
  const most = typeof arity === "number" ? arity : sub === undefined ? undefined : arity?.[sub];
  const extra = most === undefined ? undefined : positionals[most];
  if (extra !== undefined) {
    throw new UsageError(
      `sobra el argumento «${extra}»: «atlas ${positionals.slice(0, most).join(" ")}» no lo espera`,
    );
  }
};
