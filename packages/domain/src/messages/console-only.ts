// Errors only the console can meet: administration and backup commands, the local price files. Console wording only; the web has no text for them.

import type { Entry } from "./voice.js";

export const CONSOLE_ONLY: Record<string, Entry> = {
  // --- Administration ------------------------------------------------------
  admin_config_missing: (d, v) =>
    `No existe ${v.text(d.path)}: escríbelo con la región, el bucket de datos y el prefijo de SSM de cada entorno (runbook «Restaurar el libro», apartado «Lo que necesitas»).`,
  admin_config_unreadable: (d, v) =>
    `${v.text(d.path)} no se puede leer: tiene que llevar admin_format 1 y, por entorno, solo region, data_bucket y ssm_prefix.`,
  admin_environment_unknown: (d, v) =>
    `${v.text(d.path)} no tiene el entorno ${v.text(d.environment)}.`,
  admin_remote_unavailable: () =>
    "AWS no responde ahora (el bucket de datos o SSM): no se ha escrito nada que no se diga. Repite dentro de un rato.",
  admin_aws_refused: (d, v) =>
    `AWS ha rechazado la orden (${v.text(d.name)}): la consola usa una sesión ya abierta del rol de administración del entorno, con MFA («aws sso login», o «aws configure export-credentials» tras el código), como dice el runbook «Restaurar el libro».`,
  admin_secret_invalid: (d, v) =>
    `El valor de ${v.text(d.parameter)} no vale (${v.text(d.reason)}): no se ha escrito. No se enseña el valor.`,
  admin_secret_tags_missing: (d, v) =>
    `${v.text(d.parameter)}: el valor SÍ se ha cambiado, pero no se han podido escribir las etiquetas (project, env, managed_by). Repite la orden para ese parámetro (sobrescribirlo vuelve a etiquetarlo) o etiquétalo a mano; los parámetros siguientes no se han tocado.`,
  admin_secret_write_failed: (d, v) =>
    `No se ha podido escribir ${v.text(d.parameter)}. Comprueba qué parámetros quedaron con «atlas admin secrets» otra vez: salta los que ya están si no se escribe nada.`,
  restore_source_missing: (d, v) => `No se encuentra la copia ${v.text(d.from)}.`,
  restore_candidate_invalid: (d, v) =>
    `La copia no pasa la comprobación (eventos inválidos: ${v.text(d.invalid)}; errores de la verificación a fondo: ${v.text(d.findings)}): no se ha tocado la nube.`,
  // --- Prompts --------------------------------------------------------------
  prompt_interrupted: () => "Interrumpido: no se ha escrito nada de lo que quedaba por preguntar.",
  // --- Backups, exports and paths ------------------------------------------
  ledger_missing: (d, v) => `No hay libro en ${v.text(d.path)}: nada que copiar.`,
  dump_unreadable: () =>
    "El volcado no se puede leer como un libro de Atlas (no es UTF-8 o alguna línea no es válida). No se enseña su contenido.",
  dump_empty: () => "El volcado no tiene ningún evento: una copia vacía no prueba nada.",
  backup_mismatch: (d, v) =>
    `La copia ${v.text(d.path)} no coincide con el libro (etag o número de líneas): bórrala y repite.`,
  path_exists: (d, v) => `La ruta ${v.text(d.path)} ya existe: no se sobrescribe nada.`,
  not_a_directory: (d, v) =>
    `La ruta ${v.text(d.path)} existe y no es una carpeta: indica la carpeta donde dejar la copia.`,
  export_over_ledger: (d, v) =>
    `La ruta ${v.text(d.path)} es el propio libro: la exportación nunca lo sustituye. Elige otra ruta.`,
  export_in_ledger_folder: (d, v) =>
    `La ruta ${v.text(d.path)} es un fichero de la carpeta del libro: la exportación nunca lo sustituye. Elige otra ruta.`,
  synthetic_invalid: (d, v) =>
    `El libro generado no supera la verificación (${v.text(d.invalid)}, ${v.text(d.findings)}): es un error del generador.`,
  // --- Prices pushed to the cloud -------------------------------------------
  symbols_push_missing: () =>
    "No hay prices/symbols.json en la carpeta: declara antes los símbolos con «atlas prices symbols set».",
  symbols_push_misstored: (d, v) =>
    `No se sube: prices/symbols.json aún tiene cierres guardados en otra divisa (${v.text(d.assets)}). Púrgalos antes en local con «atlas prices purge».`,
  symbols_push_remote_newer: (d, v) =>
    `No se sube: el prices/symbols.json de la nube es de una versión más nueva de la aplicación (formato ${v.text(d.format)}), y esta consola no lo sobrescribe. Actualiza la aplicación.`,
  symbols_push_conflict: () =>
    "El prices/symbols.json de la nube ha cambiado mientras se comparaba: no se ha escrito nada. Repite la orden para ver la diferencia nueva.",
};
