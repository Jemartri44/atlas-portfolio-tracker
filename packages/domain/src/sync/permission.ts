// A refusal as a value and as an error (ADR-0026, Part A; ADR-0032), for the
// interfaces that stop an order with it. What each order refuses is decided by
// whoever owns the order; this is only the shape.

import { DomainError } from "../errors.js";

export interface Refusal {
  readonly code: string;
  readonly details: Readonly<Record<string, unknown>>;
}

/** A refusal as an error, for the interfaces that stop an order with it. The code is the refusal's. */
export class RefusedError extends DomainError {
  constructor(refusal: Refusal) {
    super(refusal.code, `refused: ${refusal.code}`, { ...refusal.details });
  }
}
