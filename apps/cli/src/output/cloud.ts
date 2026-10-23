// The sentences of a cloud folder (ADR-0035, §4): what the
// console says when the cloud cannot be reached, when its session cannot be
// used, and when a write was cut. Each tells the truth about what **was** and
// **was not** read or recorded: the user decides what to do from it.

import type { CloudSessionError } from "../folder-mode.js";
import { text } from "./format.js";

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

export const describeOffline = (code: string): string =>
  `Error (${code}): ${describeRemoteFailure(code)} ${DID_NOTHING}`;

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

/**
 * The failures of the remote one by one (`docs/api.md` §7), each
 * with its own sentence: none holds a line back, and each asks for something
 * different.
 */
export const describeRemoteFailure = (code: unknown): string => {
  switch (code) {
    case "unauthenticated":
      return "la nube pide iniciar sesión.";
    case "credentials_ambiguous":
      return "la petición llevaba dos credenciales a la vez; es un fallo de la aplicación.";
    case "session_invalid":
      return "la sesión ha caducado: vuelve a iniciar sesión.";
    case "device_token_invalid":
      return "el token de este dispositivo no vale: vuelve a iniciar sesión desde la consola.";
    case "device_token_revoked":
      return "el token de este dispositivo está revocado: vuelve a iniciar sesión desde la consola.";
    case "device_token_expired":
      return "el token de este dispositivo ha caducado: vuelve a iniciar sesión desde la consola.";
    case "not_allowed":
      return "esa cuenta de Google no está en la lista permitida.";
    case "forbidden_for_credential":
      return "esta credencial no puede usar esa ruta; es un fallo de la aplicación.";
    case "origin_rejected":
      return "la petición no venía de la propia aplicación.";
    case "body_invalid":
      return "la nube no ha entendido la forma de la petición; es un fallo de la aplicación.";
    case "body_not_json":
      return "la petición no era JSON; es un fallo de la aplicación.";
    case "precondition_required":
      return "la petición no decía sobre qué versión de la nube escribía; es un fallo de la aplicación.";
    case "precondition_failed":
      return "otro dispositivo ha escrito en la nube a la vez.";
    case "init_rejected":
      return "la nube no ha aceptado el libro para empezar.";
    case "not_found":
      return "la ruta de la nube no existe; es un fallo de la aplicación.";
    case "internal":
      return "la nube ha tenido un fallo interno y no ha escrito nada.";
    case "device_forgotten":
      return "este dispositivo fue olvidado en la nube: vuelve a iniciar sesión con «atlas remote login».";
    case "remote_unavailable":
      return "la nube no está disponible ahora mismo (un fallo pasajero): inténtalo de nuevo en unos minutos.";
    case "draft_changed":
      return "el borrador ya no está como se leyó (se cerró o se está confirmando en otro sitio); no se ha escrito nada.";
    case "draft_exists":
      return "ya hay un borrador con ese identificador en la nube; no se ha guardado nada.";
    case "append_too_many_units":
      return "la operación tiene demasiadas partes indivisibles para una sola escritura; no se ha escrito nada.";
    case "body_too_large":
      return "la petición era demasiado grande para la nube; no se ha escrito nada.";
    case "transport_rejected":
      return "la petición la ha rechazado la red antes de llegar a la nube (CloudFront o el cortafuegos).";
    case "network_failed":
      return "no hay conexión con la nube.";
    default:
      return `la nube ha respondido ${text(code)}.`;
  }
};
