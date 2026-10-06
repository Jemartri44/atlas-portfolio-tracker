// The sentences of a cloud folder (ADR-0035, §4; feature 024): what the
// console says when the cloud cannot be reached, when its session cannot be
// used, and when a write was cut. Each tells the truth about what **was** and
// **was not** read or recorded: the user decides what to do from it.

import type { CloudSessionError } from "../folder-mode.js";
import { describeRemoteFailure } from "./messages.js";

/** Codes of the cloud that say «this credential does not work»: the way out is to sign in again. */
export const SESSION_CODES: ReadonlySet<string> = new Set([
  "unauthenticated",
  "session_invalid",
  "device_token_invalid",
  "device_token_revoked",
  "device_token_expired",
  "device_forgotten",
  "not_allowed",
]);

/** Codes that say «the cloud was not reached or did not answer»: nothing was read. */
export const OFFLINE_CODES: ReadonlySet<string> = new Set([
  "network_failed",
  "transport_rejected",
  "remote_unavailable",
]);

const DID_NOTHING = "No se ha leído ni registrado nada.";

/** What the earlier writes of the same order change in «nothing was recorded». */
const earlier = (appended: number): string =>
  appended === 0
    ? DID_NOTHING
    : `Antes del fallo la nube ya había aceptado ${appended === 1 ? "una escritura" : `${appended} escrituras`} de esta orden: comprueba el libro antes de repetirla.`;

export const describeOffline = (code: string, appended: number): string =>
  `Error (${code}): ${describeRemoteFailure(code)} ${earlier(appended)}`;

export const describeSession = (code: string): string =>
  `Error (${code}): ${describeRemoteFailure(code)} ${DID_NOTHING} Inicia sesión con «atlas remote login».`;

export const describeCloudSession = (error: CloudSessionError): string =>
  error.code === "session_missing"
    ? `Error (session_missing): esta carpeta es de nube (${error.details.origin}, dispositivo ${error.details.device_id}) y no hay sesión guardada de ese dispositivo. ${DID_NOTHING} Inicia sesión con «atlas remote login».`
    : `Error (session_expired): el token de esta carpeta caducó el ${error.details.expires_at?.slice(0, 10)}. ${DID_NOTHING} Renuévalo con «atlas remote login».`;

export const describeRemoteOther = (code: string): string =>
  `Error (${code}): ${describeRemoteFailure(code)}`;

export const UNKNOWN_OUTCOME =
  "La conexión se cortó al guardar y no se sabe si la operación quedó registrada. Cuando vuelva la conexión, mira el libro (atlas export) antes de repetirla; si la repites y ya estaba, la huella repetida te avisará.";
