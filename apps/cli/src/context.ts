import type { LedgerEvent, UseCaseDeps, Warning } from "@atlas/domain";
import type { FxRateSource } from "@atlas/domain/ecb";
import type { AdminAccess } from "./admin/environment.js";
import type { Flags } from "./args.js";
import type { FolderMode } from "./folder-mode.js";
import { describeWarning } from "./output/messages.js";
import type { PriceEnvironment } from "./prices/load.js";
import type { RemoteEnvironment } from "./remote/environment.js";

export interface Io {
  out(text: string): void;
  err(text: string): void;
  /** Resolves undefined when there is no interactive terminal to ask. */
  confirm(question: string): Promise<boolean | undefined>;
  /**
   * A line typed by the user, for the confirmations that ask for a word and
   * not a yes (`atlas admin`: the name of the environment). Undefined, or
   * absent, when there is no interactive terminal to ask.
   */
  ask?(question: string): Promise<string | undefined>;
  /**
   * A line typed **with no echo** (`atlas admin secrets`): never shown, never
   * kept. Undefined, or absent, when there is no interactive terminal.
   */
  askSecret?(question: string): Promise<string | undefined>;
}

export interface Context {
  deps: UseCaseDeps;
  io: Io;
  ledgerPath: string;
  /** Cloud folder or local folder (ADR-0035, §4): decided once, before the order runs. */
  mode: FolderMode;
  yes: boolean;
  confirmDuplicate: boolean;
  acceptInvalid: boolean;
  json: boolean;
  /** `--confirm-fx-rate`: the explicit yes to a typed rate that is not the official one. */
  confirmFxRate?: boolean;
  /** The source of the ECB history (`atlas fx update`); the ECB itself when absent. */
  fxSource?: () => FxRateSource;
  /** The sources of prices and where the keys are; replaced in tests, which never touch the network. */
  prices?: PriceEnvironment;
  /** The network, the credentials and the browser of `atlas remote`; the system's when absent. */
  remote?: RemoteEnvironment;
  /**
   * The clients of the administration (`atlas admin`, `atlas backup
   * --from-bucket`), with the role of administration; the system's — the
   * standard chain of the SDK — when absent. Replaced in tests, which never
   * reach AWS.
   */
  admin?: AdminAccess;
}

export type Command = (ctx: Context, positionals: string[], flags: Flags) => Promise<number>;

export const GLOBAL_FLAGS = [
  "ledger",
  "yes",
  "confirm-duplicate",
  "confirm-fx-rate",
  "accept-invalid",
  "json",
] as const;

export const EXIT = {
  ok: 0,
  domain: 1,
  conflict: 2,
  duplicate: 3,
  noTty: 4,
  schemaTooNew: 5,
  locked: 6,
  /** `atlas prices update`: a source reached the threshold of consecutive failures (ADR-0031). */
  sourcesFailing: 7,
  /** A cloud folder and no answer from the cloud: nothing was read or recorded (ADR-0035, §4). */
  offline: 8,
  /** A write was sent and the connection broke: it is not known whether it was recorded. */
  outcomeUnknown: 9,
  /** The session of a cloud folder is missing, expired or refused: `atlas remote login`. */
  session: 10,
  usage: 64,
} as const;

/** Raised when a confirmation is needed but stdin is not interactive and --yes was not given. */
export class ConfirmationRequired extends Error {
  constructor(message = "hace falta confirmar y no hay terminal interactiva: añade --yes") {
    super(message);
    this.name = "ConfirmationRequired";
  }
}

export const describeWarnings = (warnings: readonly Warning[]): string[] =>
  warnings.map((warning) => `Aviso (${warning.code}): ${describeWarning(warning)}`);

export const summarize = (event: LedgerEvent): string => `${event.type} ${event.id}`;
