// The one catalogue of messages: `code → sentence`, for the console and the web (ADR-0007: the
// domain is the only package both import). The domain speaks English by contract; this is a
// presentation table, behind its own door (`@atlas/domain/messages`) so the boot of the web never
// downloads it.
//
// Three tables, because a code is only unique within its kind: the same word names an error and a
// warning (`currency_mismatch`, `transfer_not_resident`).

import { CONSOLE_ONLY } from "./console-only.js";
import { CATALOGUE_ERRORS } from "./errors-catalogue.js";
import { ERRORS_CORPORATE } from "./errors-corporate.js";
import { ERRORS_LEDGER } from "./errors-ledger.js";
import { ERRORS_OPERATIONS } from "./errors-operations.js";
import { ERRORS_REMOTE } from "./errors-remote.js";
import { ERRORS_SETTINGS } from "./errors-settings.js";
import { FINDINGS } from "./findings.js";
import { REMOTE_FAILURES } from "./remote-failures.js";
import { type Details, type Entry, render, type Voice } from "./voice.js";
import { WARNINGS_OPERATIONS } from "./warnings-operations.js";
import { WARNINGS_TAX } from "./warnings-tax.js";
import { WARNINGS_WEIGHTS } from "./warnings-weights.js";

export { FINDINGS, type FindingEntry } from "./findings.js";
export { REMOTE_FAILURES } from "./remote-failures.js";
export { type Details, type Entry, render, type Say, type Surface, type Voice } from "./voice.js";
export { fxMissingReason, windowText, year } from "./words.js";

export type Kind = "error" | "warning";

/** The errors of the domain, the API and the adapters, by code. */
export const ERRORS: Readonly<Record<string, Entry>> = {
  ...CATALOGUE_ERRORS,
  ...ERRORS_CORPORATE,
  ...ERRORS_OPERATIONS,
  ...ERRORS_SETTINGS,
  ...ERRORS_LEDGER,
  ...ERRORS_REMOTE,
  ...CONSOLE_ONLY,
};

/** The projection warnings, by code. */
export const WARNINGS: Readonly<Record<string, Entry>> = {
  ...WARNINGS_WEIGHTS,
  ...WARNINGS_OPERATIONS,
  ...WARNINGS_TAX,
};

/**
 * The Spanish sentence of a code for a surface, or `undefined` when the catalogue does not know
 * it: the caller falls back to the message of the domain, so a new code is never swallowed.
 */
export const say = (
  kind: Kind,
  code: string,
  details: Details,
  voice: Voice,
  message: string,
): string | undefined => {
  const entry = (kind === "error" ? ERRORS : WARNINGS)[code];
  return entry === undefined ? undefined : render(entry, details, voice, message);
};
