// The narrow interface of SSM Parameter Store the API needs (feature 015,
// §7 P3). In E1 it only reads: the allow list, the client of Google and the
// session key are **read-only** for the API (ADR-0028, note on row 7). E2
// adds creating and revoking the records of the console tokens; there is
// never a delete nor a label (ADR-0033, point 9).

export interface ParameterStore {
  /** The value, decrypted; `undefined` when the parameter does not exist. Never with a selector. */
  get(name: string): Promise<string | undefined>;
}
