// The narrow interface of SSM Parameter Store the API needs (feature 015,
// §7 P3). The allow list, the client of Google and the session key are
// **read-only** for the API (ADR-0028, note on row 7). E2 adds the records of
// the console tokens: created **without overwriting** and overwritten **only
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
   * `PutParameter` of a `SecureString` **without `Overwrite`**, with its tags
   * (block 0 of E2, §18.1 and §18.2): `exists` on `ParameterAlreadyExists`. A
   * `TooManyUpdates` is a transient failure (`DependencyUnavailable`).
   */
  putNew(
    name: string,
    value: string,
    tags: Readonly<Record<string, string>>,
  ): Promise<"created" | "exists">;
  /** `PutParameter` with `Overwrite`: only to revoke. */
  overwrite(name: string, value: string): Promise<void>;
  /** `GetParametersByPath`, not recursive, decrypted, every page. */
  listByPath(path: string): Promise<readonly ParameterEntry[]>;
}
