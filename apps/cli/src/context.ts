import type { LedgerEvent, UseCaseDeps, Warning } from "@atlas/domain";
import type { Flags } from "./args.js";

export interface Io {
  out(text: string): void;
  err(text: string): void;
  /** Resolves undefined when there is no interactive terminal to ask. */
  confirm(question: string): Promise<boolean | undefined>;
}

export interface Context {
  deps: UseCaseDeps;
  io: Io;
  ledgerPath: string;
  yes: boolean;
  confirmDuplicate: boolean;
  json: boolean;
}

export type Command = (ctx: Context, positionals: string[], flags: Flags) => Promise<number>;

export const GLOBAL_FLAGS = ["ledger", "yes", "confirm-duplicate", "json"] as const;

export const EXIT = {
  ok: 0,
  domain: 1,
  conflict: 2,
  duplicate: 3,
  noTty: 4,
  schemaTooNew: 5,
  usage: 64,
} as const;

/** Raised when a confirmation is needed but stdin is not interactive and --yes was not given. */
export class ConfirmationRequired extends Error {
  constructor() {
    super("hace falta confirmar y no hay terminal interactiva: añade --yes");
    this.name = "ConfirmationRequired";
  }
}

export const describeWarnings = (warnings: readonly Warning[]): string[] =>
  warnings.map((warning) => `Aviso (${warning.code}): ${warning.message}`);

export const summarize = (event: LedgerEvent): string => `${event.type} ${event.id}`;
