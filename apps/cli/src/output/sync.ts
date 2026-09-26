// The sentences of `atlas sync …` that are the console's own (feature 015,
// E3): which remote a folder syncs with and which session it may use (plan
// §7; §7 P16; §7.1 bis, B2), each code with its own sentence. The codes of the
// sync itself — stops, refusals, holds — are the domain's and are said by
// `messages.ts`, the same in both interfaces.

import type { EntryChoice } from "@atlas/domain/access";

type Refused = Extract<EntryChoice, { refused: string }>;

export const describeEntryRefusal = (
  refused: Refused,
  context: { readonly origin?: string; readonly device?: string },
): string => {
  switch (refused.refused) {
    case "sync_not_configured":
      return "esta carpeta no está sincronizada: empieza con «atlas sync init --origin <https://…>» o «atlas sync join --from-remote|--with-own-lines --origin <https://…>».";
    case "sync_remote_unknown":
      return "esta carpeta está sincronizada pero no dice con qué remoto (le falta sync/remote.json: es de una versión anterior). Nunca se deduce: asóciala tú con «atlas sync join --from-remote --origin <https://…>» o «atlas sync join --with-own-lines --origin <https://…>», iniciando antes sesión desde esta carpeta.";
    case "sync_credential_missing":
      return `no hay token guardado del dispositivo de esta carpeta${context.device === undefined ? "" : ` (${context.device}`}${context.origin === undefined ? "" : ` en ${context.origin})`}: «atlas remote login» se lo vuelve a dar.`;
    case "sync_already_configured":
      return `esta carpeta ya se sincroniza${context.origin === undefined ? "" : ` con ${context.origin}`}: no se inicializa ni se une otra vez. Para volver tras desactivarla, únete con «atlas sync join».`;
    case "sync_remote_mismatch":
      return `esta carpeta está a medio empezar${context.origin === undefined ? "" : ` con ${context.origin}`}${context.device === undefined ? "" : ` como el dispositivo ${context.device}`} (sync/remote.json): solo se termina con ese remoto y ese dispositivo.`;
    case "sync_origin_missing":
      return "falta --origin: di con qué nube empiezas (https://…). Nunca se deduce.";
    case "credentials_no_entry_for_folder":
      return `no hay ninguna sesión iniciada desde esta carpeta${context.origin === undefined ? "" : ` para ${context.origin}`}: inicia sesión aquí con «atlas remote login --origin <https://…>». La sesión de otra carpeta no vale: dos carpetas con un mismo dispositivo publicarían su estado por turnos.`;
    case "credentials_several_for_folder":
      return `hay varias sesiones de esta carpeta (${refused.devices.join(", ")}): elige una con --device <id>.`;
  }
};

/** What an initialisation found in the remote when it is not empty nor this ledger. */
export const INIT_REMOTE_NOT_EMPTY =
  "la nube ya tiene un libro que no es este: no se inicializa encima. Únete a ella con «atlas sync join --from-remote» (este libro queda archivado y lo que la nube no tiene, retenido) o con «atlas sync join --with-own-lines» (tus líneas se suben como pendientes).";
