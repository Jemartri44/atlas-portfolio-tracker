// What the card of the ECB says of a download from the cloud (feature 016,
// E3, block 2): by outcome, and only what the user has to know. When the card
// opens by itself, «nothing new» is not said; when the user asked, it is.

import type { CloudOutcome } from "../../ecb/cloud.js";
import { formatDate } from "../../format/date.js";

export interface Said {
  readonly tone: "info" | "danger" | "caution";
  readonly text: string;
}

export const cloudSaid = (outcome: CloudOutcome, asked: boolean): Said | undefined => {
  switch (outcome.kind) {
    case "saved":
      return {
        tone: "info",
        text: `Histórico bajado de la nube: publica hasta el ${formatDate(outcome.latest)}.`,
      };
    case "up_to_date":
      return asked
        ? { tone: "info", text: "El histórico de la nube es el mismo que ya tienes." }
        : undefined;
    case "none":
      return asked
        ? { tone: "info", text: "La nube todavía no tiene histórico del BCE." }
        : undefined;
    case "damaged":
      return {
        tone: "danger",
        text: "El histórico de la nube no es el archivo que registra su manifiesto: no se usa, y sigue el que tenías.",
      };
    case "rejected":
      return {
        tone: "caution",
        text: `El histórico de la nube cambia ${outcome.total} ${outcome.total === 1 ? "tipo ya publicado" : "tipos ya publicados"} del que tienes: no se ha usado, y sigue el anterior. O el BCE ha corregido un tipo o algo está mal. Si se ha restaurado una versión buena en la nube, borra la copia de este navegador y vuelve a bajarla.`,
      };
    default:
      return {
        tone: "caution",
        text: `No se ha podido bajar el histórico de la nube (${outcome.code}): sigue el que tenías.`,
      };
  }
};
