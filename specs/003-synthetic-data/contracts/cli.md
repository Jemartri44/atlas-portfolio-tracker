# Contrato de la CLI — feature 003-synthetic-data

Mensajes en español con identificadores en inglés. Flags globales: `--ledger`, `--yes`, `--confirm-duplicate`, `--json`. Códigos de salida como en la 001 (`0` OK · `1` dominio · `2` conflicto · `4` sin terminal · `5` esquema más nuevo · `64` uso).

## `atlas synth --out <ruta> [--seed <n>]`

- `--out` obligatorio; `--seed` entero ≥ 0, por defecto `1`.
- Rechaza si `<ruta>` existe (`path_exists`, código 1) antes de generar nada.
- Genera, verifica (`integrity` + `deepCheck` limpios; si no, `synthetic_invalid`, código 1, no escribe), escribe con `FileLedgerStore(<ruta>).append` y muestra:

```text
Libro sintético escrito en demo.jsonl (semilla 1): 148 eventos, 4 cuentas, 15 activos, ejercicios 2026-2028.
tipo                       eventos
account_created            4
asset_created              15
…
```

- `--json`: `{ path, seed, summary }`.

## `atlas compact [--yes]`

```text
Líneas por schema_version: v1: 120 · v2: 3 (versión destino: 2)
El original se archivará como archive/ledger-2028-01-15-v1.jsonl (con sufijo -2, -3… si ya existe).
¿Compactar? [s/N]
Compactado: 123 líneas → 123 líneas en schema_version 2. Original archivado en archive/ledger-2028-01-15-v1.jsonl.
```

- Sin líneas antiguas: `Nada que compactar: las 123 líneas están en schema_version 1.` (código 0, no pregunta).
- Cancelado: `Cancelado.` (código 0).
- Rechazos (código 1): `invalid_events` (tabla de eventos inválidos), `projection_changed` (claves), `conflict` (código 2), `archive_exists` tras agotar sufijos.
- `--json`: el `CompactResult`.

## `atlas check [--deep]`

- Sin `--deep`: como hoy.
- `--deep`: misma tabla (`nivel`, `código`, `mensaje`, `eventos`) con los hallazgos de `integrity`, los de `deepCheck` y los avisos de la proyección; `Libro íntegro: sin hallazgos.` si no hay nada; código 1 si algún hallazgo es `error`.
- Ids duplicados: una única fila `error duplicate_id …` y código 1 (la proyección no puede continuar).
- `--json`: `{ findings, deep, warnings }` (`deep` vacío sin `--deep`).

## `atlas backup --to <directorio>`

- `--to` obligatorio; crea el directorio si no existe.
- Destino `<directorio>/ledger-<YYYY-MM-DD>.jsonl` (hoy en `Europe/Madrid`); si existe → `path_exists` (código 1) sin tocar nada.
- Copia los bytes, recarga la copia y el original con `FileLedgerStore`, compara `etag` y número de líneas; si difieren → `backup_mismatch` (código 1).

```text
Copia verificada: /backups/ledger-2028-01-15.jsonl (123 líneas, etag 3f9c…).
```

- `--json`: `{ path, lines, etag }`.

## Mensajes nuevos (`messages.ts`)

`archive_exists`, `invalid_events`, `projection_changed`, `path_exists`, `backup_mismatch`, `synthetic_invalid`.

## `USAGE`

Añade `synth --out <ruta> [--seed <n>]`, `compact [--yes]`, `check [--deep]`, `backup --to <directorio>`.
