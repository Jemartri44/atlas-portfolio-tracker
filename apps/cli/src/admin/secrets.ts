// The parameters of SSM `atlas admin secrets` creates and rotates (feature 017,
// E4; ADR-0034, row 21; `docs/api.md` §9; `specs/016-scheduled-jobs/contracts/
// ssm-and-config.md` §1): every `SecureString` of `/atlas/<env>/` except the
// records of the device tokens (the API writes those), and the `String` of the
// client of Google. **Never `mail/recipient` nor `mail/amounts`**: those are
// Terraform's (ADR-0034, row 12). The pure part: names, kinds, how each value
// is checked. Nothing here reads or prints a value.

import type { SecretKind } from "@atlas/adapters/aws";
import { DomainError } from "@atlas/domain";
import { parseAllowList } from "@atlas/domain/access";

export type SecretSource = "typed" | "allow-list" | "generated";

export interface SecretSpec {
  /** Under `/atlas/<env>/`. */
  readonly path: string;
  readonly kind: SecretKind;
  readonly source: SecretSource;
  /** The environment that never carries it (ADR-0034, row 2: `dev` has no key of the user). */
  readonly never?: string;
  /** What the prompt calls it. */
  readonly label: string;
}

/** In the order they are asked. */
export const SECRETS: readonly SecretSpec[] = [
  {
    path: "auth/allow-list",
    kind: "SecureString",
    source: "allow-list",
    label: "la lista permitida",
  },
  {
    path: "auth/google-client-id",
    kind: "String",
    source: "typed",
    label: "el identificador del cliente de Google",
  },
  {
    path: "auth/google-client-secret",
    kind: "SecureString",
    source: "typed",
    label: "el secreto del cliente de Google",
  },
  {
    path: "auth/session-key",
    kind: "SecureString",
    source: "generated",
    label: "la clave de sesión",
  },
  {
    path: "prices/eodhd-key",
    kind: "SecureString",
    source: "typed",
    never: "dev",
    label: "la clave de EODHD",
  },
  {
    path: "prices/alpha-vantage-key",
    kind: "SecureString",
    source: "typed",
    never: "dev",
    label: "la clave de Alpha Vantage",
  },
];

/** The tags of every parameter this order writes (ADR-0034, row 3). */
export const tagsOf = (environment: string): Readonly<Record<string, string>> => ({
  project: "atlas",
  env: environment,
  managed_by: "atlas-admin-secrets",
});

/** The key of a source and the client of Google: printable ASCII, no space (as the price function reads them). */
const TOKEN = /^[\x21-\x7e]{1,256}$/;

/** The address the allow list compares, as `ssm-and-config.md` §1 says the recipient is: ASCII, one `@`, no space. */
const EMAIL = /^[\x21-\x7e]{1,254}$/;

/** A refusal that names the parameter and never the value. */
export const invalid = (path: string, reason: string): DomainError =>
  new DomainError("admin_secret_invalid", "a value is not valid", { parameter: path, reason });

/** A client id, a client secret or a key of a source. */
export const checkedToken = (path: string, value: string): string => {
  if (!TOKEN.test(value)) {
    throw invalid(path, "token");
  }
  return value;
};

/** The allow list of `docs/api.md` §9, built from the entries typed and read back by the reader of the API. */
export const allowListOf = (
  path: string,
  entries: readonly { readonly sub: string; readonly email: string }[],
): string => {
  if (entries.length === 0) {
    throw invalid(path, "empty");
  }
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!EMAIL.test(entry.email) || entry.email.split("@").length !== 2) {
      throw invalid(path, "email");
    }
    if (seen.has(entry.sub)) {
      throw invalid(path, "duplicate_sub");
    }
    seen.add(entry.sub);
  }
  const text = JSON.stringify({ allow_list_format: 1, entries });
  try {
    parseAllowList(text);
  } catch {
    // The reader of the API does not accept it: a `sub` of no shape. Never its text.
    throw invalid(path, "sub");
  }
  return text;
};

/** 32 random bytes, base64url, without padding: 43 characters (`docs/api.md` §9). */
export const sessionKeyOf = (random: (target: Uint8Array) => void): string => {
  const bytes = new Uint8Array(32);
  random(bytes);
  return Buffer.from(bytes).toString("base64url");
};
