// What a failed order says: the sentence on stderr and, with `--json`, the one object on stdout
// (`{"status": "error", "code", "exit_code", "message"}`), so a script reads the failure the way it
// reads every other answer. Nothing here decides *whether* an order failed: it names what a thrown
// error was, once.

import {
  EcbDownloadFailed,
  EcbHistoryDamaged,
  ExactJsonUnsupported,
  LedgerLockedError,
  LockLostError,
  readLocalConfig,
  SecretsError,
} from "@atlas/adapters";
import {
  ConflictError,
  DependentEventsError,
  DomainError,
  DuplicateFingerprintError,
  SchemaTooNewError,
  WriteOutcomeUnknownError,
} from "@atlas/domain";
import { RemoteError } from "@atlas/domain/sync";
import { UsageError } from "./args.js";
import { CommandFailure, ConfirmationRequired, EXIT, type Io } from "./context.js";
import { type CloudLedgerStore, CloudSessionError } from "./folder-mode.js";
import {
  describeCloudSession,
  describeOffline,
  describeRemoteOther,
  describeSession,
  OFFLINE_CODES,
  SESSION_CODES,
  UNKNOWN_OUTCOME,
} from "./output/cloud.js";
import { describeLock, LOCK_LOST, remedyFor } from "./output/lock.js";
import { describeDependants, describeDuplicate, describeError } from "./output/messages.js";
import { describeSecretsError } from "./output/prices.js";
import { describeCredentialsError } from "./output/remote.js";
import { CredentialsError } from "./remote/credentials-file.js";
import { USAGE } from "./usage.js";

/** An order that did not do what was asked: the exit code, a stable code and the lines for stderr. */
interface Failure {
  readonly exit: number;
  readonly code: string;
  readonly lines: readonly string[];
  /** The usage text follows on stderr; it is not part of the sentence in JSON. */
  readonly usage?: true;
  /** The stack of an error nobody expected: for stderr, never in the object a script reads. */
  readonly trace?: string;
}

/** The connection broke after the write was sent and a reload found it recorded. */
interface Recovered {
  readonly recovered: true;
}

const failure = (exit: number, code: string, ...lines: string[]): Failure => ({
  exit,
  code,
  lines,
});

/** The lock of the folder is held: who, since when, and the two ways out. */
const lockedFailure = async (error: LedgerLockedError): Promise<Failure> => {
  const { lock_stale_minutes } = await readLocalConfig(error.folder).catch(() => ({
    lock_stale_minutes: undefined,
  }));
  return failure(
    EXIT.locked,
    "ledger_locked",
    `Error: ${describeLock(error.info, new Date(), lock_stale_minutes ?? Number.POSITIVE_INFINITY)}`,
    remedyFor(error.info),
  );
};

/**
 * A write was sent and the connection broke: the ids were fixed before sending,
 * so one reload says whether it was recorded (`ApiLedgerStore.findOutcome`).
 */
const unknownOutcome = async (
  cloud: CloudLedgerStore,
  error: WriteOutcomeUnknownError,
): Promise<Failure | Recovered> => {
  try {
    const found = await cloud.findOutcome(error.ids);
    if (found.outcome === "written") {
      return { recovered: true };
    }
    if (found.outcome === "partial") {
      return failure(
        EXIT.domain,
        "partial_write",
        "Error (partial_write): la conexión se cortó y la operación quedó escrita solo en parte. Ejecuta `atlas check` y rectifícala.",
      );
    }
    return failure(
      EXIT.offline,
      "write_not_recorded",
      "La conexión se cortó al guardar, pero se ha comprobado: la operación NO quedó registrada. Repite la orden.",
    );
  } catch (again) {
    if (again instanceof RemoteError || again instanceof CloudSessionError) {
      return failure(
        EXIT.outcomeUnknown,
        "write_outcome_unknown",
        `Error (write_outcome_unknown): ${UNKNOWN_OUTCOME}`,
      );
    }
    throw again;
  }
};

/** What went wrong talking to the cloud of a cloud folder, said as it is, with its own exit code. */
const cloudFailure = (error: unknown): Failure | undefined => {
  if (error instanceof CloudSessionError) {
    return failure(EXIT.session, error.code, describeCloudSession(error));
  }
  if (error instanceof RemoteError && SESSION_CODES.has(error.code)) {
    return failure(EXIT.session, error.code, describeSession(error.code));
  }
  if (error instanceof RemoteError && OFFLINE_CODES.has(error.code)) {
    return failure(EXIT.offline, error.code, describeOffline(error.code));
  }
  if (error instanceof RemoteError) {
    return failure(EXIT.domain, error.code, describeRemoteOther(error.code));
  }
  return undefined;
};

const SYSTEM_CODE = /^E[A-Z0-9]+$/;

const SYSTEM_REASON: Readonly<Record<string, string>> = {
  ENOENT: "no existe, o falta una carpeta de la ruta",
  EACCES: "no hay permiso",
  EPERM: "no hay permiso",
  EISDIR: "es un directorio",
  ENOTDIR: "una parte de la ruta no es un directorio",
  EEXIST: "ya existe",
  ENOSPC: "no queda espacio en el disco",
  EROFS: "el disco es de solo lectura",
};

/** The path of a temporary a write was making is the path of the file it was making it for. */
const TEMPORARY = /\.tmp-\d+-\d+$/;

/** A refusal of the file system (a path that is not there, a folder nobody may write): said, not a stack. */
const systemFailure = (error: Error & { code: string; path?: string }): Failure =>
  failure(
    EXIT.domain,
    error.code,
    `Error (${error.code}): ${
      error.path === undefined ? "una ruta que la orden usa" : error.path.replace(TEMPORARY, "")
    }: ${SYSTEM_REASON[error.code] ?? "el sistema de ficheros lo ha rechazado"}.`,
  );

const isSystemError = (error: unknown): error is Error & { code: string; path?: string } =>
  error instanceof Error &&
  typeof (error as { code?: unknown }).code === "string" &&
  SYSTEM_CODE.test((error as unknown as { code: string }).code);

/** The failure a thrown error stands for; an error nobody expected is reported, never rethrown. */
const failureOf = async (
  error: unknown,
  cloud: CloudLedgerStore | undefined,
): Promise<Failure | Recovered> => {
  if (error instanceof CommandFailure) {
    return failure(error.exit, error.code, ...error.lines);
  }
  if (error instanceof LedgerLockedError) {
    return lockedFailure(error);
  }
  if (error instanceof WriteOutcomeUnknownError && cloud !== undefined) {
    return unknownOutcome(cloud, error);
  }
  const fromCloud = cloudFailure(error);
  if (fromCloud !== undefined) {
    return fromCloud;
  }
  if (error instanceof UsageError) {
    return { ...failure(EXIT.usage, "usage", `Error de uso: ${error.message}`), usage: true };
  }
  if (error instanceof ConfirmationRequired) {
    return failure(EXIT.noTty, "confirmation_required", `Error: ${error.message}`);
  }
  if (error instanceof DuplicateFingerprintError) {
    return failure(EXIT.duplicate, error.code, describeDuplicate(error));
  }
  // The refusal of `--accept-invalid` on a cloud folder is not a list of dependants to rectify:
  // it has its own sentence.
  if (error instanceof DependentEventsError && error.code !== "accept_invalid_while_synced") {
    return failure(EXIT.domain, error.code, describeDependants(error, cloud === undefined));
  }
  if (error instanceof ConflictError) {
    return failure(EXIT.conflict, error.code, describeError(error));
  }
  if (error instanceof SchemaTooNewError) {
    return failure(EXIT.schemaTooNew, error.code, describeError(error));
  }
  if (error instanceof DomainError) {
    return failure(EXIT.domain, error.code, `Error (${error.code}): ${describeError(error)}`);
  }
  if (error instanceof CredentialsError) {
    return failure(
      EXIT.domain,
      error.code,
      `Error (${error.code}): ${describeCredentialsError(error.code)}`,
    );
  }
  if (error instanceof SecretsError) {
    return failure(EXIT.domain, "secrets_unusable", `Error: ${describeSecretsError(error)}`);
  }
  if (error instanceof EcbDownloadFailed) {
    return failure(
      EXIT.domain,
      "ecb_download_failed",
      `Error: no se ha podido descargar el histórico del BCE. El ZIP: ${error.zip}. La API: ${error.api}. No se ha tocado el histórico que había.`,
    );
  }
  if (error instanceof EcbHistoryDamaged) {
    return failure(
      EXIT.domain,
      "ecb_history_damaged",
      `Error: reference/ecb/${error.file} no es el archivo que registra su manifiesto: alguien lo ha cambiado. No se ha usado; bórralo junto con reference/ecb/manifest.json y descárgalo otra vez con \`atlas fx update\`.`,
    );
  }
  if (error instanceof ExactJsonUnsupported) {
    return failure(
      EXIT.domain,
      "exact_json_unsupported",
      "Error: esta versión de Node no deja leer el texto exacto de un número JSON, y un cierre nunca se lee como número de coma flotante. Usa Node 22 o posterior (.nvmrc).",
    );
  }
  if (error instanceof LockLostError) {
    return failure(EXIT.locked, "lock_lost", `Error: ${LOCK_LOST}`);
  }
  if (isSystemError(error)) {
    return systemFailure(error);
  }
  const unexpected = error instanceof Error ? error : new Error(String(error));
  return {
    ...failure(
      EXIT.domain,
      "unexpected",
      `Error inesperado (${unexpected.name}): ${unexpected.message}`,
    ),
    ...(unexpected.stack === undefined ? {} : { trace: unexpected.stack }),
  };
};

/** The sentence without the «Error (code): » that the object already carries as `code`. */
const sentence = (lines: readonly string[]): string =>
  lines
    .map((line, index) =>
      index === 0 ? line.replace(/^Error(?: de uso)?(?: \([^)]*\))?: /, "") : line,
    )
    .join("\n");

/**
 * Says what a thrown error was and returns the exit code. With `--json` and nothing yet on stdout,
 * the failure is the one object stdout carries; an order that already printed its own result keeps
 * it (a source that failed after the report, a repetition that finds the write recorded).
 */
export const reportError = async (
  io: Io,
  error: unknown,
  options: {
    readonly json: boolean;
    readonly wroteStdout: () => boolean;
    readonly cloud?: CloudLedgerStore;
  },
): Promise<number> => {
  const reported = await failureOf(error, options.cloud);
  if ("recovered" in reported) {
    if (options.json) {
      if (!options.wroteStdout()) {
        io.out(JSON.stringify({ status: "recorded", after_connection_loss: true }, null, 2));
      }
    } else {
      io.out("La conexión se cortó al guardar, pero la operación SÍ quedó registrada en la nube.");
    }
    return EXIT.ok;
  }
  for (const line of reported.lines) {
    io.err(line);
  }
  if (reported.usage === true) {
    io.err(USAGE);
  }
  if (reported.trace !== undefined) {
    io.err(reported.trace);
  }
  if (options.json && !options.wroteStdout()) {
    io.out(
      JSON.stringify(
        {
          status: "error",
          code: reported.code,
          exit_code: reported.exit,
          message: sentence(reported.lines),
        },
        null,
        2,
      ),
    );
  }
  return reported.exit;
};
