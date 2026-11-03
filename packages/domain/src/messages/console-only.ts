// Errors only the console can meet: administration, sign-in, cloud-folder and backup commands, the
// local price files. Console wording only; the web has no text for them.

import type { Entry } from "./voice.js";

export const CONSOLE_ONLY: Record<string, Entry> = {
  // --- Devices and administration ---------------------------------------
  forget_device_missing: () =>
    "Ese dispositivo no existe en sync/devices/: los enseña «atlas admin devices».",
  forget_device_unreadable: () =>
    "El objeto de ese dispositivo no se puede leer: no se ha tocado. Revísalo a mano en sync/devices/.",
  forget_contention: () =>
    "El objeto del dispositivo ha cambiado tres veces mientras se olvidaba: repite la orden.",
  admin_config_missing: (d, v) =>
    `No existe ${v.text(d.path)}: escríbelo con la región, el bucket de datos y el prefijo de SSM de cada entorno (runbook «Revocar todos los tokens»).`,
  admin_config_unreadable: (d, v) =>
    `${v.text(d.path)} no se puede leer: tiene que llevar admin_format 1 y, por entorno, solo region, data_bucket y ssm_prefix.`,
  admin_environment_unknown: (d, v) =>
    `${v.text(d.path)} no tiene el entorno ${v.text(d.environment)}.`,
  admin_remote_unavailable: () =>
    "AWS no responde ahora (el bucket de datos o SSM): no se ha escrito nada que no se diga. Repite dentro de un rato.",
  admin_aws_refused: (d, v) =>
    `AWS ha rechazado la orden (${v.text(d.name)}): la consola usa una sesión ya abierta del rol de administración del entorno, con MFA («aws sso login», o «aws configure export-credentials» tras el código), como dice el procedimiento «Revocar todos los tokens».`,
  admin_secret_invalid: (d, v) =>
    `El valor de ${v.text(d.parameter)} no vale (${v.text(d.reason)}): no se ha escrito. No se enseña el valor.`,
  admin_secret_tags_missing: (d, v) =>
    `${v.text(d.parameter)}: el valor SÍ se ha cambiado, pero no se han podido escribir las etiquetas (project, env, managed_by). Repite la orden para ese parámetro (sobrescribirlo vuelve a etiquetarlo) o etiquétalo a mano; los parámetros siguientes no se han tocado.`,
  admin_secret_write_failed: (d, v) =>
    `No se ha podido escribir ${v.text(d.parameter)}. Comprueba qué parámetros quedaron con «atlas admin secrets» otra vez: salta los que ya están si no se escribe nada.`,
  restore_source_missing: (d, v) => `No se encuentra la copia ${v.text(d.from)}.`,
  restore_candidate_invalid: (d, v) =>
    `La copia no pasa la comprobación (eventos inválidos: ${v.text(d.invalid)}; errores de la verificación a fondo: ${v.text(d.findings)}): no se ha tocado la nube.`,
  // --- Sign-in ------------------------------------------------------------
  login_timeout: () =>
    "El inicio de sesión no ha vuelto a tiempo: no se ha guardado ninguna sesión. Repite «atlas remote login» y completa el paso del navegador, o usa --manual.",
  login_interrupted: () => "Se ha cancelado el inicio de sesión: no se ha guardado ninguna sesión.",
  login_no_code: () =>
    "No ha llegado el código de la página (la entrada se cerró antes de recibirlo): no se ha guardado ninguna sesión. Repite «atlas remote login --manual» desde una terminal.",
  prompt_interrupted: () => "Interrumpido: no se ha escrito nada de lo que quedaba por preguntar.",
  // --- Cloud folders and the first upload ---------------------------------
  folder_mode_ambiguous: (d, v) =>
    `Esta carpeta tiene a la vez un libro local (${v.text(d.ledger)}) y la identidad de una nube (sync/remote.json, ${v.text(d.origin)}): no se sabe cuál es la verdad y no se ha leído ni escrito nada. Una carpeta es de nube (sync/remote.json y sin ledger.jsonl) o local (ledger.jsonl y sin sync/remote.json), nunca las dos. Si su libro es el de la nube: guarda una copia de ledger.jsonl fuera de la carpeta, comprueba con «atlas backup --to <directorio>» que la nube la tiene, y quita ledger.jsonl de aquí. Si es local: quita sync/remote.json (y el resto de sync/). Nada se sincroniza entre los dos.`,
  compact_cloud_folder: () =>
    "Esta carpeta es de nube: no tiene libro que compactar aquí. Compactar el libro de la nube es «atlas admin compact --env <entorno>», con el rol de administración (ADR-0032).",
  ledger_in_cloud_folder: (d, v) =>
    `No se escribe un ledger.jsonl en una carpeta de nube (${v.text(d.path)}, nube ${v.text(d.origin)}): sería la carpeta ambigua de ADR-0035, que la consola se niega a abrir. Escríbelo en otra carpeta o con otro nombre.`,
  upload_needs_cloud_folder: () =>
    "La subida inicial se hace desde una carpeta de nube: inicia sesión en una carpeta sin libro con «atlas remote login --origin <https://…>» y repite «atlas remote upload --from <ledger.jsonl>» desde ella.",
  upload_cloud_not_empty: (d, v) =>
    `La nube ya tiene un libro (${v.num(typeof d.cloud_lines === "number" ? d.cloud_lines : 0)} líneas) que no es este: la subida inicial nunca escribe encima. Para sustituirlo está «atlas admin restore --from <copia> --env <entorno>» (ADR-0032), que compara por identificador y pide confirmar.`,
  upload_source_missing: (d, v) => `No existe el fichero ${v.text(d.path)}.`,
  upload_source_not_utf8: (d, v) =>
    `El fichero ${v.text(d.path)} no es UTF-8: no es un libro de Atlas.`,
  // --- Backups, exports and paths ------------------------------------------
  ledger_missing: (d, v) => `No hay libro en ${v.text(d.path)}: nada que copiar.`,
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
  invalid_cloud_pull: (d, v) =>
    `prices/_cloud.json, lo que la carpeta guarda de su última descarga de la nube, no se entiende (${v.text(d.field)}): bórralo y vuelve a ejecutar «atlas prices update», que lo rehace sin tocar ningún cierre.`,
  symbols_push_missing: () =>
    "No hay prices/symbols.json en la carpeta: declara antes los símbolos con «atlas prices symbols set».",
  symbols_push_misstored: (d, v) =>
    `No se sube: prices/symbols.json aún tiene cierres guardados en otra divisa (${v.text(d.assets)}). Púrgalos antes en local con «atlas prices purge».`,
  symbols_push_remote_newer: (d, v) =>
    `No se sube: el prices/symbols.json de la nube es de una versión más nueva de la aplicación (formato ${v.text(d.format)}), y esta consola no lo sobrescribe. Actualiza la aplicación.`,
  symbols_push_conflict: () =>
    "El prices/symbols.json de la nube ha cambiado mientras se comparaba: no se ha escrito nada. Repite la orden para ver la diferencia nueva.",
};
