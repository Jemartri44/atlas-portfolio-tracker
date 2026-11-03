import type { Entry } from "./voice.js";

/**
 * The failures of the remote (`docs/api.md` §7), one sentence each. A test holds the keys level
 * with the closed list of `REMOTE_FAILURE_CODES`.
 */
export const REMOTE_FAILURES: Record<string, Entry> = {
  unauthenticated: () => "la nube pide iniciar sesión.",
  session_invalid: () =>
    "la sesión ya no vale (ha caducado o se cerró en todos los dispositivos): vuelve a entrar.",
  not_allowed: () => "esa cuenta de Google no está en la lista permitida.",
  origin_rejected: () => "la petición no venía de la propia aplicación.",
  body_invalid: () =>
    "la nube no ha entendido la forma de la petición; es un fallo de la aplicación.",
  body_not_json: () => "la petición no era JSON; es un fallo de la aplicación.",
  precondition_required: () =>
    "la petición no decía sobre qué versión de la nube escribía; es un fallo de la aplicación.",
  precondition_failed: () => "otro dispositivo ha escrito en la nube a la vez.",
  not_found: () => "la ruta de la nube no existe; es un fallo de la aplicación.",
  internal: () => "la nube ha tenido un fallo interno y no ha escrito nada.",
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
