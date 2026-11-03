// The commands of the console: for each, what runs it and how many words it reads. One table, so that adding a command is one entry here and its line in
// the usage text.

import { UsageError } from "./args.js";
import { addCommand } from "./commands/add.js";
import { adminCommand } from "./commands/admin/index.js";
import { backupCommand } from "./commands/backup.js";
import { accountCommand, assetCommand, settingsCommand } from "./commands/catalogue.js";
import { compactCommand } from "./commands/compact.js";
import { corporateActionCommand } from "./commands/corporate-actions.js";
import { draftCommand } from "./commands/draft.js";
import { exportCommand } from "./commands/export.js";
import { filedCommand } from "./commands/filed.js";
import { fxCommand } from "./commands/fx.js";
import { m720Command, m721Command } from "./commands/informative.js";
import { lockCommand } from "./commands/lock.js";
import { pricesCommand } from "./commands/prices.js";
import { checkCommand, lotsCommand, positionsCommand } from "./commands/query.js";
import { deleteCommand, editCommand } from "./commands/rectify.js";
import { synthCommand } from "./commands/synth.js";
import { taxCommand } from "./commands/tax.js";
import { thesisCommand } from "./commands/thesis.js";
import { orderCommand, transferCommand } from "./commands/tracking.js";
import type { Command } from "./context.js";

interface CommandSpec {
  readonly run: Command;
  /**
   * How many words the command reads, its own name included, per subcommand where it has them. A
   * word more is refused, never ignored: a boolean flag followed by a word leaves that word
   * loose, and a command that ignored it would record the opposite of what was written. An
   * unknown subcommand is left to the command, which says its own usage.
   */
  readonly arity: number | Readonly<Record<string, number>>;
}

export const COMMANDS: Readonly<Record<string, CommandSpec>> = {
  account: { run: accountCommand, arity: { add: 2, update: 3, list: 2 } },
  asset: { run: assetCommand, arity: { add: 2, update: 3, list: 2 } },
  settings: { run: settingsCommand, arity: { set: 2, show: 2 } },
  add: { run: addCommand, arity: 2 },
  order: { run: orderCommand, arity: { place: 2, cancel: 3, note: 3, list: 2 } },
  transfer: { run: transferCommand, arity: { request: 2, update: 3, pending: 2 } },
  ca: { run: corporateActionCommand, arity: 2 },
  thesis: { run: thesisCommand, arity: { open: 2, close: 3, show: 3 } },
  edit: { run: editCommand, arity: 2 },
  delete: { run: deleteCommand, arity: 2 },
  positions: { run: positionsCommand, arity: 1 },
  lots: { run: lotsCommand, arity: 2 },
  tax: { run: taxCommand, arity: 2 },
  filed: { run: filedCommand, arity: 3 },
  m720: { run: m720Command, arity: 2 },
  m721: { run: m721Command, arity: 2 },
  check: { run: checkCommand, arity: 1 },
  export: { run: exportCommand, arity: 1 },
  synth: { run: synthCommand, arity: 1 },
  compact: { run: compactCommand, arity: 1 },
  backup: { run: backupCommand, arity: 1 },
  lock: { run: lockCommand, arity: { show: 2, break: 2 } },
  fx: { run: fxCommand, arity: { update: 2, status: 2, correct: 2 } },
  draft: { run: draftCommand, arity: { list: 2, confirm: 3, discard: 3 } },
  prices: { run: pricesCommand, arity: { update: 2, status: 2, symbols: 4, purge: 3 } },
  admin: {
    run: adminCommand,
    // `secrets` is not here on purpose: its arguments are never quoted back (they may be a value).
    arity: { pull: 2, compact: 2, restore: 2, prices: 3 },
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
