// LedgerStore over the API (ADR-0035, E1; `docs/api.md` §5.8): the cloud
// ledger as the single source of truth. No queue, no copy on the device: the
// store only remembers the last load **in memory** to judge a write, and every
// write goes to the API as one unit with `If-Match`.
//
// - `load()` downloads the whole ledger (`GET /api/ledger`; the etag is the
//   SHA-256 of the bytes, checked by `httpRemote`).
// - `append(events, etag)` encodes each event and sends one `POST`. The
//   declarations of the request are **deduced** here, never passed in:
//   `has_correction` and `chain_continues` from the shape of the batch (the
//   same units the sync used, `unitsOf`/`entriesOf`) and `confirm_duplicate`
//   for every line whose fingerprint repeats a live event, the rule of the
//   initialisation (§5.5). It is correct because the use case already refused
//   without confirmation and `If-Match` makes the API judge the same bytes.
// - `412` is a `ConflictError`: the caller reloads and asks to confirm again.
//   Never a retry, never a merge.
// - A refusal inside a `200` is `RemoteRejectedError` (nothing held back,
//   nothing retried). A cut after sending is `WriteOutcomeUnknownError`:
//   the ids were fixed before sending, and `findOutcome` looks for them in the
//   reloaded ledger. Retrying with the same ids is safe: the API refuses a
//   repeated id (`duplicate_id`).
// - `replace`, `appendLines` and `replaceLines` are refused: the web never
//   compacts or restores (administration goes through the admin routes).
//
// Everything the API answers is `no-store`; the fetch of `httpRemote` also
// says so, and nothing is logged here.

import {
  ConflictError,
  CURRENT_LEDGER_SCHEMA,
  DomainError,
  decodeLines,
  duplicatesOf,
  encodeLine,
  type LedgerEvent,
  type LedgerSchema,
  type LedgerStore,
  type LoadedLedger,
  RemoteRejectedError,
  WriteOutcomeUnknownError,
} from "@atlas/domain";
import {
  type AppendEntry,
  entriesOf,
  evaluateUnit,
  linesOfText,
  RemoteError,
  type RemoteLedger,
  unitsOf,
} from "@atlas/domain/sync";

/** What a reload says about a write whose answer never arrived. */
export interface WriteOutcome {
  /** `written`: every id is in the ledger. `not_written`: none is. `partial`: some (should not happen). */
  readonly outcome: "written" | "not_written" | "partial";
  readonly ledger: LoadedLedger;
}

const notSupported = (operation: string): DomainError =>
  new DomainError(
    "operation_not_supported",
    `the API ledger store does not support ${operation}: administration goes through the admin routes`,
    { operation },
  );

/** Codes of a failure after which the write may have happened. */
const UNKNOWN_CODES = new Set(["network_failed", "transport_rejected"]);

const mayHaveWritten = (error: RemoteError): boolean =>
  UNKNOWN_CODES.has(error.code) || (error.status !== undefined && error.status >= 500);

export class ApiLedgerStore implements LedgerStore {
  private loaded: { etag: string; events: readonly LedgerEvent[] } | undefined;

  constructor(
    private readonly remote: RemoteLedger,
    readonly schema: LedgerSchema = CURRENT_LEDGER_SCHEMA,
  ) {}

  async load(): Promise<LoadedLedger> {
    const snapshot = await this.remote.read();
    const lines = linesOfText(snapshot.text);
    const events = decodeLines(lines, this.schema);
    this.loaded = { etag: snapshot.etag, events };
    return { events, etag: snapshot.etag, lines };
  }

  async append(events: readonly LedgerEvent[], etag: string): Promise<{ etag: string }> {
    if (events.length === 0) {
      return { etag };
    }
    const base = await this.baseFor(etag);
    const entries = this.entriesFor(events, base);
    let result: Awaited<ReturnType<RemoteLedger["append"]>>;
    try {
      result = await this.remote.append(entries, etag);
    } catch (error) {
      if (error instanceof RemoteError) {
        if (error.code === "precondition_failed") {
          throw new ConflictError();
        }
        if (mayHaveWritten(error)) {
          throw new WriteOutcomeUnknownError(events.map((event) => event.id));
        }
      }
      throw error;
    }
    this.loaded = undefined;
    if (result.accepted === entries.length && result.rejected === undefined) {
      return { etag: result.etag };
    }
    // Refused (nothing written), or written only in part (an internal failure
    // by ADR-0035: the caller reloads and says what stayed in).
    throw new RemoteRejectedError(result.rejected?.code ?? "partial_write", result.accepted, {
      ...(result.rejected === undefined
        ? {}
        : { index: result.rejected.index, ...result.rejected.details }),
    });
  }

  /**
   * After `WriteOutcomeUnknownError`, once there is a connection: reloads and
   * looks for the ids of the write. If they are in, the operation was
   * recorded; if not, nothing was written and the same data can be retried.
   */
  async findOutcome(ids: readonly string[]): Promise<WriteOutcome> {
    const ledger = await this.load();
    const present = new Set(ledger.events.map((event) => event.id));
    const found = ids.filter((id) => present.has(id)).length;
    const outcome = found === 0 ? "not_written" : found === ids.length ? "written" : "partial";
    return { outcome, ledger };
  }

  replace(): Promise<{ etag: string }> {
    return Promise.reject(notSupported("replace"));
  }

  appendLines(): Promise<{ etag: string }> {
    return Promise.reject(notSupported("appendLines"));
  }

  replaceLines(): Promise<{ etag: string }> {
    return Promise.reject(notSupported("replaceLines"));
  }

  /** The events the write is judged against: the last load if it is that etag, else a fresh one. */
  private async baseFor(etag: string): Promise<readonly LedgerEvent[]> {
    if (this.loaded?.etag === etag) {
      return this.loaded.events;
    }
    const fresh = await this.load();
    if (fresh.etag !== etag) {
      throw new ConflictError();
    }
    return fresh.events;
  }

  /**
   * The entries of the request, with the API's own rule for the duplicates
   * (`judgeUnit`, `docs/api.md` §5.2 row 7): per unit, the fingerprints of the
   * ledger **plus the whole unit** (later members included), and a line is
   * confirmed when its fingerprint is repeated there. Units go in order, each on
   * top of the previous ones. A unit the domain refuses is sent without
   * confirmations: the API refuses it first, for the same reason.
   */
  private entriesFor(events: readonly LedgerEvent[], base: readonly LedgerEvent[]): AppendEntry[] {
    const lines = events.map(encodeLine);
    let before = base;
    return unitsOf(lines, events).flatMap((unit) => {
      const checked = evaluateUnit(before, unit.events);
      before = [...before, ...unit.events];
      const repeated = unit.events.map(
        (event) => checked.ok && duplicatesOf(checked.state.fingerprints, event).length > 0,
      );
      return entriesOf(unit, (index) => repeated[index] === true);
    });
  }
}
