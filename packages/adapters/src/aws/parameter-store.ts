// The narrow interface of SSM Parameter Store the API needs. The allow list, the client of Google and the session key are
// **read-only** for the API (ADR-0028, note on row 7). The records of
// the console tokens are written too: created **without overwriting** and overwritten **only
// to revoke** (ADR-0033, point 9). There is never a delete nor a label: an
// implementation that offered them would be a way to bring a revoked token
// back (architecture test, T26).

export interface ParameterEntry {
  readonly name: string;
  readonly value: string;
}

export interface ParameterStore {
  /** The value, decrypted; `undefined` when the parameter does not exist. Never with a selector. */
  get(name: string): Promise<string | undefined>;
  /**
   * `PutParameter` of a `SecureString` **without `Overwrite`**, with its tags: `exists` on `ParameterAlreadyExists`. A
   * `TooManyUpdates` is a transient failure (`DependencyUnavailable`).
   */
  putNew(
    name: string,
    value: string,
    tags: Readonly<Record<string, string>>,
  ): Promise<"created" | "exists">;
  /** Like `get`, with the version SSM holds: the base of a detected concurrent overwrite. */
  getVersioned(
    name: string,
  ): Promise<{ readonly value: string; readonly version: number } | undefined>;
  /**
   * `PutParameter` with `Overwrite`: only to revoke. Answers the new version,
   * which is the previous one plus one unless another write came in between.
   */
  overwrite(name: string, value: string): Promise<number>;
  /** `GetParametersByPath`, not recursive, decrypted, every page. */
  listByPath(path: string): Promise<readonly ParameterEntry[]>;
}
