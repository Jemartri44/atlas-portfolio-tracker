# Tareas: `012-ecb-reference-rates`

Orden del encargo (§3). Cada tarea, un commit atómico en verde (`lint`, tests del paquete tocado). «Rojo» = el test se ha visto fallar antes del arreglo, y se anota en `questions.md` §9.

## Bloque 0 — Lo que va antes de la primera operación real

### Paso 1a — La consola: cerrojo de la carpeta

- [ ] T001 `packages/adapters/src/ledger-store/folder-lock.ts`: `acquireFolderLock`, `readFolderLock`, `breakFolderLock`, `LedgerLockedError`, `LockLostError`; creación con `"wx"`, contenido JSON, suelta solo si el testigo es propio.
- [ ] T002 `FileLedgerStore`: `append` y `replace` bajo el cerrojo (tomar → comparar → temporal → comprobar pertenencia → renombrar → soltar en `finally`); gancho de pruebas `beforeCommit`.
- [ ] T003 Tests: concurrencia (50 rondas, exactamente uno gana), cerrojo ajeno viejo no se rompe, romper a petición, pertenencia perdida aborta, fallo a mitad suelta, cerrojo tomado durante el renombrado.
- [ ] T004 `atlas.config.json` (lectura, valores por defecto documentados: `lock_stale_minutes` 10, `ecb_stale_currency_days` 30) en `@atlas/adapters` (lado Node).
- [ ] T005 Consola: `atlas lock show|break`, mensaje de cerrojo tomado (quién, desde cuándo, caducado o no, reducción de riesgo), `EXIT.locked`.

### Paso 1b — La web: IndexedDB en una transacción y la carpeta solo para leer

- [ ] T006 Doble de IndexedDB para pruebas (`fake-idb.ts`) con sus propios tests (serialización, confirmación automática, petición sobre transacción inactiva).
- [ ] T007 `LedgerBlob` = `read` + `update(etag, produce, archive?)`; `BlobLedgerStore` sobre ella; `BrowserLedgerBlob` con una sola transacción; `exportText(when)`; `replaceText` sin heredar la fecha; tests de contrato y de concurrencia.
- [ ] T008 `DirectoryLedgerBlob` → `FolderReader` de solo lectura; test de arquitectura que prohíbe las primitivas de escritura en el navegador.
- [ ] T009 Web: el libro siempre en el navegador; carpeta enlazada; importar de la carpeta; confirmación al sustituir un libro; sesión antigua en modo carpeta.

### Paso 2 — Una sola corrección viva

- [ ] T010 `second_live_correction` en la pasada 0, en orden de fichero; test del caso de §3 con la anulación de C1 antes y después de C2; predicción de dorados escrita antes; dos traducciones.
- [ ] T011 Mutante: `correctEvent` en dos escrituras con un doble que falla en la segunda.

### Paso 3 — `broker_settled_eur`

- [ ] T012 Esquema: tipo, `knownFieldsOf`, validación (bordes de §6 (n)), fuera de `tupleOf` con test; códigos traducidos.
- [ ] T013 Test de arquitectura de lista cerrada (tres formas de lectura).
- [ ] T014 Consola `--broker-settled-eur` y formulario de la web (solo si la divisa no es el euro); detalle del movimiento en las dos.
- [ ] T015 Medida del arranque trozo a trozo; subida del techo en su propio commit si hace falta.

## Bloque 1 — Núcleo puro del BCE

- [ ] T016 Lector del CSV del ZIP y del CSV de la API (filas `H` = ausencia); histórico sintético en `tests/fixtures/ecb/`.
- [ ] T017 Resolución con desenlaces cerrados; comparación numérica; euro `"1"`.
- [ ] T018 Actualización sin pisar el pasado.
- [ ] T019 Calendario TARGET y comprobación cruzada por años del libro.
- [ ] T020 Comentario de `lastWorkingDay`.

## Bloque 2 — Descarga desde la consola

- [ ] T021 Puerto `FxRateSource`; lector de ZIP con `node:zlib`; adaptador del BCE (ZIP, API de respaldo) fuera de las subrutas de la web.
- [ ] T022 `atlas fx update` bajo el cerrojo, escritura atómica, procedencia, fallo seguro.

## Bloque 3 — Proponer el tipo al registrar

- [ ] T023 Dominio: propuesta y decisión de confirmar.
- [ ] T024 Consola: propuesta en `atlas add` y `--confirm-fx-rate`.
- [ ] T025 Web: histórico de la carpeta enlazada o importado; propuesta y paso de confirmación en carga diferida; fecha oculta desde la fecha fiscal.

## Bloque 4 — Comprobar y anotar

- [ ] T026 Guardián de `FX_FIELDS` por pareja y dimensión de los efectos.
- [ ] T027 Hallazgos del BCE en `deepCheck`, «sin contrastar» como dato del dominio.
- [ ] T028 Nota del informe fiscal (con dependencia por lotes) y de `fx_rate_date_after_fiscal_date`.
- [ ] T029 Consola (catálogo de los códigos del BCE, `check`) y web (Verificación); escáner de mensajes extendido.

## Bloque 5 — Borradores

- [ ] T030 Validación propia del borrador; `drafts/` en la consola bajo el cerrojo; almacén en IndexedDB (`DB_VERSION` 2 y arreglo de `onblocked`).
- [ ] T031 Contador en el marco (diferido), lista y confirmación; consola.

## Bloque 6 — Cambio de `fiscal_date_rule`

- [ ] T032 Aviso antes de confirmar (dominio, consola, web).
- [ ] T033 Cadena de corrección propuesta, escrita de una vez.
- [ ] T034 Nota del informe; criterio `25` en el catálogo y las dos tablas, en el mismo commit.

## Cierre

- [ ] T035 Revisión por mutación (los 26 de §5 más los de D4).
- [ ] T036 Verificación en el navegador con capturas en `~/atlas-private/capturas/`.
- [ ] T037 `questions.md` al día; PR a `develop`.
