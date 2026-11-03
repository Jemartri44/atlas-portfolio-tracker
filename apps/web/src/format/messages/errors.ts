// Domain error codes in Spanish for the web: the sentences are the one catalogue of messages
// (`@atlas/domain/messages`); this file only hands them the web's voice. An unknown code falls back
// to the domain's own message, with its figures masked, so a new error is never swallowed.

import type { DomainError } from "@atlas/domain";
import { REMOTE_FAILURES, render, say } from "@atlas/domain/messages";
import { maskFigures, type Prose } from "../privacy.js";
import { webVoice } from "./voice.js";

/** The sentence of a failure of the remote (`docs/api.md` §7), in the web's voice. */
export const remoteFailure = (code: string): string | undefined => {
  const entry = REMOTE_FAILURES[code];
  return entry === undefined ? undefined : render(entry, {}, webVoice({ privacy: false }), "");
};

/**
 * Spanish text of a domain error; an unknown code falls back to its own message, with its figures
 * masked because nothing here can tell which of them is an amount. With no catalogue every
 * identifier prints as itself (`NO_NAMES`).
 */
export const describeError = (error: DomainError, prose: Prose): string =>
  say("error", error.code, error.details, webVoice(prose), error.message) ??
  maskFigures(error.message, prose.privacy);
