// What the console says about the lock of the ledger folder (ADR-0026, Part B;
// feature 012). Who holds it, since when, whether it looks abandoned, and the
// two ways out: wait, or break it knowing what that means.

import type { FolderLockInfo } from "@atlas/adapters";
import { madridDateOf } from "@atlas/domain";

const MINUTE = 60_000;

/** «24/09/2026 a las 03:10», in Europe/Madrid. */
const when = (instant: string): string => {
  const date = madridDateOf(instant);
  const time = new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(instant));
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year} a las ${time}`;
};

const who = (info: FolderLockInfo): string => {
  const holder = info.holder === "cli" ? "otra orden de la consola" : `«${info.holder}»`;
  const process =
    info.pid === undefined
      ? ""
      : ` (proceso ${info.pid}${info.host === undefined ? "" : ` en ${info.host}`})`;
  return `${holder}${process}`;
};

/** The lock described in one paragraph; `now` and the stale threshold decide the last sentence. */
export const describeLock = (
  info: FolderLockInfo | undefined,
  now: Date,
  staleMinutes: number,
): string => {
  if (info === undefined) {
    return "La carpeta del libro tiene un cerrojo que no dice de quién es (el fichero ledger.lock no se entiende).";
  }
  const minutes = Math.floor((now.getTime() - Date.parse(info.since)) / MINUTE);
  const age = Number.isNaN(minutes)
    ? ""
    : ` (hace ${minutes < 1 ? "menos de un minuto" : `${minutes} min`})`;
  const stale =
    minutes >= staleMinutes
      ? ` Lleva más de ${staleMinutes} minutos: probablemente quedó abandonado, pero compruébalo antes de romperlo.`
      : "";
  return `La carpeta del libro está bloqueada por ${who(info)} desde el ${when(info.since)}${age}.${stale}`;
};

/** The remedy, always the same two options, and the honest limit of the second. */
export const LOCK_REMEDY =
  "Espera a que termine y repite. Si sabes que ese proceso ya no existe, rompe el cerrojo con `atlas lock break`: si su dueño siguiera vivo, romperlo reduce el riesgo de que escriban los dos, pero no lo elimina.";

export const LOCK_LOST =
  "Alguien rompió el cerrojo de la carpeta mientras se escribía: no se ha escrito nada. Comprueba que no haya otra orden de la consola escribiendo y repite.";
