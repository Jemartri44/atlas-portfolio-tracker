# ADR-0006 — Esquema del libro en S3

**Estado:** Aceptada (2026-08-30). Detalle vivo en `docs/data-schema.md`.

## Contexto

Con ADR-0002 (S3) y ADR-0003 (append-only) falta el contrato del fichero: reparto, envoltorio de cada línea, evolución del esquema, dónde viven configuración y catálogo, y qué se hace con los datos de referencia (tipos de cambio del BCE).

## Opciones consideradas

1. **Reparto:** un único `ledger.jsonl` frente a un fichero por año.
2. **Contenido:** un solo registro de eventos (operaciones + catálogo + configuración) frente a `ledger` + `catalog.json` + `settings.json`.
3. **Esquema:** versión por línea con migración al cargar y compactación explícita, frente a reescribir el fichero en cada cambio.
4. **BCE:** CSV oficial guardado íntegro en S3 frente a consulta bajo demanda.

## Decisión

1. **Un único `ledger/ledger.jsonl`**, una línea JSON por evento en orden de registro. Escritura: GET con ETag → añadir en memoria → `PutObject` con `If-Match`; reintento en conflicto. Versionado de S3 activado; las versiones no vigentes expiran a los 365 días (el historial real está dentro del fichero; las versiones solo protegen frente a corrupción).
2. **Un solo registro de eventos.** Además de las operaciones, el fichero contiene eventos de catálogo (`account_created`, `account_updated`, `asset_created`, `asset_updated`) y de configuración (`settings_changed`, con la configuración completa resultante). Cuentas, activos, lotes, posiciones, saldos y "configuración vigente en la fecha X" son proyecciones del mismo fichero.
3. **`schema_version` por línea.** El fichero puede mezclar versiones; al cargar, funciones puras `migrateVnToVn+1` elevan cada línea en memoria. Nunca se reescribe el fichero por una migración. Un comando explícito `compact` reescribe todo a la versión actual y archiva el original tal cual en `archive/ledger-<fecha>-v<n>.jsonl`.
4. **Histórico del BCE guardado íntegro**: un trabajo diario descarga `eurofxref-hist.csv` y lo guarda sin transformar en `reference/ecb/`. Es la fuente para proponer el tipo al registrar y para valoraciones a 31/12. Cada operación sigue guardando el tipo aplicado: el libro es autocontenido.

## Consecuencias

- Envoltorio de línea: `schema_version`, `id` (ULID, monótono; es el orden canónico), `recorded_at` (ISO 8601 UTC), `type`, campos del evento. Numéricos como cadenas (ADR-0005). `snake_case` en el fichero.
- Distribución del bucket: `ledger/`, `archive/`, `reference/ecb/`, `prices/<asset_id>.jsonl`, `documents/<event_id>/`, `imports/<source>/<fecha>.<ext>` (los extractos importados se conservan tal cual), `backups/YYYY-MM/` (copia mensual del libro y de la proyección de posiciones, retenida para siempre).
- La proyección no se cachea: se recalcula en cada carga.
- `docs/data-schema.md` es la referencia viva del esquema; se completa con la semántica de cada evento en la Ronda 4.
