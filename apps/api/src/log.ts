// The log of the API (`docs/specification.md` §11.7; `docs/api.md` §1):
// structured JSON with the `request_id`, the level and **the code of the
// result**, and nothing else. Never a token, a hash, a secret, an e-mail, a
// `sub`, a session id, a code, a verifier, a line of the ledger, an amount or
// an account — and never the message of a foreign error (`JSON.parse`, the
// SDK, `fetch`): those copy what they were given (N3). The fields are a closed
// list; a value that is not one of ours does not get in.

export interface LogEntry {
  readonly level: "INFO" | "WARN" | "ERROR";
  readonly request_id: string;
  readonly method: string;
  /** The route matched, or `unmatched`: never the raw path, which carries whatever was sent. */
  readonly route: string;
  readonly status: number;
  readonly code?: string;
  /** One of our own short reasons (`signature`, `missing`, `throttling`…). */
  readonly reason?: string;
  readonly dependency?: string;
  /** The class of an unexpected error — its name, never its message. */
  readonly error_name?: string;
}

const SAFE = /^[A-Za-z0-9_./-]{1,64}$/;

export const logLine = (entry: LogEntry): string =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(entry).filter(
        ([, value]) => typeof value === "number" || (typeof value === "string" && SAFE.test(value)),
      ),
    ),
  );
