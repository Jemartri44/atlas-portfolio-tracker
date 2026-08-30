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
export class CompactRejectedError extends DomainError {
  constructor(code: "invalid_events" | "projection_changed", details: Record<string, unknown>) {
    super(
      code,
      code === "invalid_events"
        ? "the ledger has invalid events; rectify them before compacting"
        : "the rewritten ledger projects differently; nothing was written",
      details,
    );
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

/** Reversing or correcting an event would invalidate later events. */
export class DependentEventsError extends DomainError {
  readonly affected: readonly AffectedEvent[];

  constructor(targetId: string, affected: readonly AffectedEvent[]) {
    super("dependent_events", `event ${targetId} is consumed by later events; rectify them first`, {
      target_id: targetId,
      affected,
    });
    this.affected = affected;
  }
}

/** The event type is reserved for a later feature and cannot be projected yet. */
export class UnsupportedEventError extends ProjectionError {
  constructor(type: string, eventId: string) {
    super("unsupported_event", eventId, `event type ${type} is not supported yet`, { type });
  }
}
