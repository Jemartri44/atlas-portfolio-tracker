// What the daily job of the ECB does first with `reference/ecb/` in the
// bucket (feature 016, E2; plan §7.1). S3 has no `rename` and no lock, so an
// activation is a sequence of conditional writes — the history in force to
// `previous/`, the new file, and the manifest last — and a cut can leave the
// file in force already replaced under the old manifest. A reader never uses
// it: its bytes do not match the SHA-256 of the manifest (`EcbHistoryDamaged`).
// The next run **undoes** it when `previous/` holds exactly what the manifest
// records, and says the history damaged otherwise, writing nothing.

import type { ActiveHistory } from "./ecb-manifest.js";

export type EcbRecovery =
  | { readonly kind: "none" }
  | { readonly kind: "undo"; readonly file: ActiveHistory["file"] }
  | { readonly kind: "damaged" };

export const ecbRecovery = (input: {
  /** What the manifest records as in force; nothing when there is no manifest. */
  readonly active: ActiveHistory | undefined;
  /** The SHA-256 of the file in force as it is; nothing when it is missing. */
  readonly fileSha256: string | undefined;
  /** The SHA-256 of `previous/<file>`; nothing when it is missing. */
  readonly previousSha256: string | undefined;
}): EcbRecovery => {
  if (input.active === undefined || input.fileSha256 === input.active.sha256) {
    return { kind: "none" };
  }
  return input.previousSha256 === input.active.sha256
    ? { kind: "undo", file: input.active.file }
    : { kind: "damaged" };
};
