// The failures of the API that mean «there is no usable session» (`docs/api.md`
// §7), each with the reason the screen says. Shared by the boot and by the
// writes, so a session that ends while a form is open is told apart from a
// network that failed.

import { RemoteError } from "@atlas/domain/sync";
import type { SignedOutReason } from "./state.js";

export const SIGNED_OUT: Readonly<Record<string, SignedOutReason>> = {
  unauthenticated: "signed_out",
  session_invalid: "expired",
  not_allowed: "not_allowed",
  device_forgotten: "forgotten",
};

/** The reason a failure says the session is gone, or `undefined` if it is anything else. */
export const signedOutReason = (error: unknown): SignedOutReason | undefined =>
  error instanceof RemoteError ? SIGNED_OUT[error.code] : undefined;
