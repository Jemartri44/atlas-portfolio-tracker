// The narrow interface of SSM Parameter Store the Lambdas need: **read only**. The allow list, the
// client of Google, the session key, the keys of the prices and the mail parameters are written by
// the script of secrets or by Terraform, never by a Lambda (ADR-0028, note on row 7; ADR-0034). No
// write, delete or label is offered (an architecture test pins it).

export interface ParameterStore {
  /** The value, decrypted; `undefined` when the parameter does not exist. Never with a selector. */
  get(name: string): Promise<string | undefined>;
}
