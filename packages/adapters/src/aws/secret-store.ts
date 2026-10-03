// What `atlas admin secrets` needs from SSM and the API must not have (feature
// 017, E4; ADR-0034, row 21): to know that a parameter exists **without
// decrypting it** (answer P-3), to create it with its tags and to rotate it.
// The value goes in and never comes back: there is no `get` here. Only the
// administration reaches this door (`@atlas/adapters/aws-admin`).

export type SecretKind = "String" | "SecureString";

export interface SecretStore {
  /**
   * `GetParameter` with `WithDecryption=false`: the parameter is there or it is
   * not. The answer carries no value, so none can reach a screen or a log.
   */
  exists(name: string): Promise<boolean>;
  /**
   * `PutParameter` **without `Overwrite`**, with its tags (SSM refuses tags with
   * `Overwrite`): `exists` when the name is taken, and nothing is written then.
   */
  create(
    name: string,
    value: string,
    kind: SecretKind,
    tags: Readonly<Record<string, string>>,
  ): Promise<"created" | "exists">;
  /**
   * `PutParameter` with `Overwrite`, then `AddTagsToResource` so that the tags
   * are there whoever created the parameter first.
   */
  rotate(
    name: string,
    value: string,
    kind: SecretKind,
    tags: Readonly<Record<string, string>>,
  ): Promise<void>;
}
