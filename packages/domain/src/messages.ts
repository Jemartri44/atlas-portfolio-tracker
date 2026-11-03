// The one catalogue of Spanish messages, as a **separate entry point** of the domain: the barrel is
// the module the browser downloads at boot, and the sentences are only needed when something is
// said. Imported from here, `@atlas/domain/messages`; the barrel never exports it.

export {
  type Details,
  type Entry,
  ERRORS,
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
