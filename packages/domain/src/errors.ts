// Error hierarchy of the domain. Messages are in English (technical); the CLI
// translates `code` into user-facing Spanish text.

export class DomainError extends Error {
  readonly code: string;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.details = details;
  }
}

/** A value or an event does not have the required shape. */
export class ValidationError extends DomainError {}

/** Two monetary amounts in different currencies were combined. */
export class CurrencyMismatchError extends DomainError {
  constructor(left: string, right: string) {
    super("currency_mismatch", `cannot operate ${left} with ${right}`, { left, right });
  }
}

/** An event breaks an invariant of the projected state. */
export class ProjectionError extends DomainError {
  readonly eventId: string;

  constructor(
    code: string,
    eventId: string,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(code, message, { ...details, event_id: eventId });
    this.eventId = eventId;
  }
}

/** The ledger was written by a newer schema than this code knows. */
export class SchemaTooNewError extends DomainError {
  constructor(found: number, supported: number) {
    super(
      "schema_too_new",
      `ledger line uses schema_version ${found}; this code supports up to ${supported}`,
      { found, supported },
    );
  }
}

/** The store changed since it was loaded (etag mismatch). */
export class ConflictError extends DomainError {
  constructor() {
    super("conflict", "the ledger changed since it was loaded; reload and retry");
  }
}

/** `replace` would overwrite an existing archive; archives are never overwritten. */
export class ArchiveExistsError extends DomainError {
  constructor(archiveName: string) {
    super("archive_exists", `archive ${archiveName} already exists; it is never overwritten`, {
      archive_name: archiveName,
    });
  }
}

/** `compact` refused to rewrite: invalid events in the ledger, or the rewritten text projects differently. */
const COMPACT_REFUSALS = {
  invalid_events: "the ledger has invalid events; rectify them before compacting",
  projection_changed: "the rewritten ledger projects differently; nothing was written",
  // Compacting seals the fingerprints of the filings again, and sealing what
  // does not hold would turn a broken record into a trusted one.
  filing_fingerprint_mismatch:
    "a filed return no longer matches the events before it; nothing was written",
  // Told apart from the one above because **only one of the two is an
  // accusation**: this one is a prefix that cannot be re-read at the version
  // the fingerprint declares, which is not an edit and no backup fixes.
  filing_fingerprint_unreadable:
    "the events before a filed return cannot be read at the version its fingerprint declares; nothing was written",
} as const;

export class CompactRejectedError extends DomainError {
  constructor(code: keyof typeof COMPACT_REFUSALS, details: Record<string, unknown>) {
    super(code, COMPACT_REFUSALS[code], details);
  }
}

/** A referenced event does not exist. */
export class NotFoundError extends DomainError {
  constructor(id: string) {
    super("not_found", `event ${id} does not exist`, { id });
  }
}

/** The fingerprint of the new event already exists and was not confirmed. */
export class DuplicateFingerprintError extends DomainError {
  readonly existing: readonly string[];

  constructor(fingerprint: string, existing: readonly string[]) {
    super("duplicate_fingerprint", `an event with the same fingerprint already exists`, {
      fingerprint,
      existing,
    });
    this.existing = existing;
  }
}

export interface AffectedEvent {
  readonly id: string;
  readonly type: string;
  readonly error: string;
}

/**
 * Writing an event would leave other events invalid: reversing or correcting
 * something later events consumed (`dependent_events`, ADR-0003), or a
 * `settings_changed` that reinterprets the past (`newly_invalid_events`,
 * ADR-0015). The second is the only one that can be accepted on purpose —
 * and not while the ledger is synced (`accept_invalid_while_synced`, feature
 * 014, V7), which shares the message of the second: the interfaces say it.
 */
/** The two refusals of a settings change that leaves events invalid (ADR-0015; V7 of feature 014). */
type SettingsRefusalCode = "newly_invalid_events" | "accept_invalid_while_synced";

export class DependentEventsError extends DomainError {
  readonly affected: readonly AffectedEvent[];

  constructor(
    targetId: string,
    affected: readonly AffectedEvent[],
    code: "dependent_events" | SettingsRefusalCode = "dependent_events",
  ) {
    super(
      code,
      code === "dependent_events"
        ? `event ${targetId} is consumed by later events; rectify them first`
        : `the new settings leave ${affected.length} recorded events invalid`,
      { target_id: targetId, affected },
    );
    this.affected = affected;
  }
}

/**
 * The ledger already carried invalid events before this mutation. Only a
 * `settings_changed` may be written over a degraded ledger (ADR-0015), and the
 * new event is not at fault: the offending one is named so its own error is
 * never read as an accusation against what is being recorded.
 */
export class InvalidLedgerError extends DomainError {
  constructor(offender: AffectedEvent, invalidCount: number) {
    super(
      "ledger_has_invalid_events",
      `the ledger already has ${invalidCount} invalid events; ${offender.type} ${offender.id} fails with: ${offender.error}`,
      {
        offending_id: offender.id,
        offending_type: offender.type,
        offending_error: offender.error,
        invalid_count: invalidCount,
      },
    );
  }
}

/** The event type is reserved for a later feature and cannot be projected yet. */
export class UnsupportedEventError extends ProjectionError {
  constructor(type: string, eventId: string) {
    super("unsupported_event", eventId, `event type ${type} is not supported yet`, { type });
  }
}
