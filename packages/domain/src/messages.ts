// The one catalogue of Spanish messages, as a **separate entry point** of the domain: the barrel is
// the module the browser downloads at boot, and the sentences are only needed when something is
// said. Imported from here, `@atlas/domain/messages`; the barrel never exports it.

export { CONSOLE_ONLY } from "./messages/console-only.js";
export { RAW_LINE_BREAK_FIX } from "./messages/errors-remote.js";
export {
  type Details,
  type Entry,
  ERRORS,
  FINDINGS,
  type FindingEntry,
  fxMissingReason,
  type Kind,
  REMOTE_FAILURES,
  render,
  type Say,
  type Surface,
  say,
  type Voice,
  WARNINGS,
  windowText,
  year,
} from "./messages/index.js";
