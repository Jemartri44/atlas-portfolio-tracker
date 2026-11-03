import type { Entry } from "./voice.js";

const SIGN_IN_AGAIN = "Vuelve a iniciar sesión desde la consola.";

/**
 * The failures of the remote (`docs/api.md` §7), one sentence each. A test holds the keys level
 * with the closed list of `REMOTE_FAILURE_CODES`.
 */
export const REMOTE_FAILURES: Record<string, Entry> = {
  unauthenticated: () => "la nube pide iniciar sesión.",
  credentials_ambiguous: () =>
    "la petición llevaba dos credenciales a la vez; es un fallo de la aplicación.",
  session_invalid: () => "la sesión ha caducado: vuelve a iniciar sesión.",
  device_token_invalid: {
    say: () => "la credencial de este dispositivo no vale.",
    cli: () => SIGN_IN_AGAIN,
  },
  device_token_revoked: {
    say: () => "la credencial de este dispositivo está revocada.",
    cli: () => SIGN_IN_AGAIN,
  },
  device_token_expired: {
    say: () => "la credencial de este dispositivo ha caducado.",
    cli: () => SIGN_IN_AGAIN,
  },
  not_allowed: () => "esa cuenta de Google no está en la lista permitida.",
  forbidden_for_credential: () =>
    "esta credencial no puede usar esa ruta; es un fallo de la aplicación.",
  origin_rejected: () => "la petición no venía de la propia aplicación.",
  body_invalid: () =>
    "la nube no ha entendido la forma de la petición; es un fallo de la aplicación.",
  body_not_json: () => "la petición no era JSON; es un fallo de la aplicación.",
  precondition_required: () =>
    "la petición no decía sobre qué versión de la nube escribía; es un fallo de la aplicación.",
  precondition_failed: () => "otro dispositivo ha escrito en la nube a la vez.",
  init_rejected: () => "la nube no ha aceptado tus datos para empezar.",
  not_found: () => "la ruta de la nube no existe; es un fallo de la aplicación.",
  internal: () => "la nube ha tenido un fallo interno y no ha escrito nada.",
  device_forgotten: {
    say: () => "este dispositivo fue olvidado en la nube.",
    cli: () => "Vuelve a iniciar sesión con «atlas remote login».",
    web: () => "Vuelve a iniciar sesión y recibirá uno nuevo.",
  },
  remote_unavailable: () =>
    "la nube no está disponible ahora mismo (un fallo pasajero): inténtalo de nuevo en unos minutos.",
  draft_changed: () =>
    "el borrador ya no está como se leyó (se cerró o se está confirmando en otro sitio); no se ha escrito nada.",
  draft_exists: () =>
    "ya hay un borrador con ese identificador en la nube; no se ha guardado nada.",
  too_many_drafts: () =>
    "hay demasiados borradores sin cerrar en la nube; cierra o descarta alguno antes de guardar otro.",
  append_too_many_units: () =>
    "la operación tiene demasiadas partes indivisibles para una sola escritura; no se ha escrito nada.",
  body_too_large: () => "la petición era demasiado grande para la nube; no se ha escrito nada.",
  transport_rejected: {
    say: () => "la red ha rechazado la petición antes de llegar a la nube.",
    cli: () => "Puede ser CloudFront o el cortafuegos.",
  },
  network_failed: () => "no hay conexión con la nube.",
};
