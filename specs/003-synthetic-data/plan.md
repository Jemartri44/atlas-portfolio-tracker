# Plan de implementación: Datos sintéticos, compactación y verificación profunda (`003-synthetic-data`)

**Rama**: `feature/003-synthetic-data` | **Fecha**: 2026-08-30 | **Spec**: [spec.md](spec.md)

**Entrada**: `specs/003-synthetic-data/spec.md`, `docs/prompts/003-synthetic-data.md` §3 y §6, `docs/data-schema.md` §1, §2, §5, §7, ADR-0006 y ADR-0007.

## Resumen

Cierra la Fase 1 por el lado de la supervivencia del libro sin tocar la semántica de ningún evento. Cinco piezas de dominio puro (`snapshotOf`, `generateLedger` con PRNG y reloj sintéticos, `LedgerSchema` inyectable, `compactLedger`, `deepCheck` + `dangling_reference`), una ampliación del puerto `LedgerStore` (`lines`, `replace`, `schema`) implementada en los dos adaptadores, cuatro comandos de CLI (`synth`, `compact`, `check --deep`, `backup`), tres fixtures (`synthetic-v1.jsonl`, su `.snapshot.json`, `legacy-v1-for-test-schema.jsonl`) y dos ajustes de tooling (`tsBuildInfoFile`, `clean`).

Principio de diseño: **todo lo que compara proyecciones pasa por `snapshotOf`** (golden file, `compact`, `check --deep`), así hay una sola definición de "misma proyección". Y **todo lo que reescribe el libro pasa por `replace`**, que archiva antes de escribir.

Nada fiscal ni estructural se decide aquí. La única contradicción del prompt (avisos vacíos frente a activo en dos cuentas) está en `questions.md` Q1 con el supuesto A1.

## Contexto técnico

**Lenguaje/Versión**: TypeScript 7.0.2 sobre Node 22 (`.nvmrc`), ESM, `tsconfig` estricto heredado (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `NodeNext`).

**Dependencias**: ninguna nueva. El PRNG (una docena de líneas, `mulberry32`) y el reloj sintético se escriben a mano en el dominio. `fast-check` (ya instalado) para las propiedades sobre semillas.

**Almacenamiento**: `FileLedgerStore` (fichero local + directorio `archive/` junto al libro) y `MemoryLedgerStore` (mapa de archivos). `schema_version` sigue en 1; el esquema v2 solo existe en tests.

**Tests**: `vitest` + `fast-check`; 100 % de líneas, ramas, funciones y sentencias en `packages/domain/src` (incluido `synth/`); test de arquitectura ampliado con la regla "nada del dominio importa de `synth/`"; contrato del `LedgerStore` ampliado con `replace` y `lines`.

**Plataforma**: Node 22 local (CLI). El dominio sigue isomorfo (sin `node:` en `src`).

**Tipo de proyecto**: ampliación del monorepo de librerías + CLI.

**Objetivos de rendimiento**: `generateLedger` en decenas de milisegundos; la propiedad "todo prefijo proyecta" sobre ~150 eventos × 20 semillas debe caber en unos segundos (medida en la tarea correspondiente; si no cabe, prefijos por bloque para las semillas aleatorias y exhaustivo para la semilla 1, spec A14).

**Restricciones**: `docs/` intocable; `domain/src` sin imports externos; numéricos como cadenas; sin dependencias nuevas; Biome limpio; commits atómicos; fixtures sintéticas.

**Escala/alcance**: 1 función de instantánea, 1 generador (~150 eventos por libro, 23 tipos de evento), 1 caso de uso, 1 comprobación profunda con 5 códigos, 1 código nuevo de `integrity`, 3 operaciones de puerto, 4 comandos de CLI, 3 fixtures, 2 ajustes de tooling.

## Comprobación de la constitución

| Principio | Cómo lo cumple este plan | Estado |
|---|---|---|
| I. Libro = fuente de verdad | `snapshotOf` es una vista derivada, nunca se persiste (el `.snapshot.json` es una fixture de test, no un dato); `compact` conserva todos los eventos (anulados incluidos) y archiva los bytes originales antes; `backup` copia bytes, no proyecciones | ✅ |
| II. Lotes como proyección; fiscalidad del libro | Ningún cálculo nuevo; el generador produce eventos y la proyección existente los interpreta; `compact` aborta si la proyección cambia | ✅ |
| III. Compartimentación | El escenario sintético respeta libro por cuenta y activo; las tesis cubren toda compra del cubo; `snapshotOf` no mezcla nada, solo lista | ✅ |
| IV. Configurable | `settings_changed` completo en el libro sintético; nada del generador se convierte en configuración real | ✅ |
| V. Fallo seguro | `compact` es no-op o aborta ante cualquier duda; `replace` nunca sobrescribe un archivo; `check --deep` señala lo que no se reproduce; `backup` verifica la copia | ✅ |
| VI. 20 años | Cero dependencias; el archivo es una copia byte a byte legible sin la app; el esquema inyectable prueba la migración antes de necesitarla; `clean` deja el árbol reconstruible | ✅ |
| VII. Tests primero | Golden file + propiedad sobre semillas + prefijos; contrato del puerto; un test por código de hallazgo; casos límite del prompt §3.8; 100 % en `domain` | ✅ |
| Restricciones técnicas | TypeScript; fixtures sintéticas (ids `acc_*`/`ast_*`, ISIN `XX…`, importes redondos); nada personal | ✅ |
| Flujo de desarrollo | Worktree `../atlas-portfolio-tracker-003`, rama `feature/003-synthetic-data` desde `origin/develop` (fb9023c, PR #17); hooks activados; PR a `develop` | ✅ |

Sin violaciones que justificar. Re-evaluado tras el diseño (Fase 1): sin cambios.

## Estructura del proyecto

### Documentación (esta feature)

```text
specs/003-synthetic-data/
├── spec.md              # Especificación
├── plan.md              # Este fichero
├── research.md          # Fase 0: Beancount (validation.py, example.py) y decisiones de detalle
├── data-model.md        # Fase 1: instantánea, esquema, resultado de compact, hallazgos, esqueleto del escenario
├── quickstart.md        # Fase 1: guía de verificación de extremo a extremo
├── contracts/
│   ├── domain.md        # Funciones puras, puerto ampliado, errores
│   └── cli.md           # Comandos, flags, salida, códigos
├── questions.md         # Q1 y notas de lectura
├── checklists/requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Código fuente (ficheros nuevos o modificados)

```text
packages/domain/src/
├── errors.ts                       # M: ArchiveExistsError, CompactRejectedError
├── schema/
│   ├── migrations/index.ts         # M: LedgerSchema, CURRENT_LEDGER_SCHEMA, migrate(line, schema); sustituye MigrationChain/MIGRATIONS
│   ├── line.ts                     # M: parseLine(text), decodeLine(text, schema?), canonicalLine(record)
│   └── validate.ts                 # M: validateShape(raw, schema?) (solo el envoltorio mira schema.version)
├── ports/ledger-store.ts           # M: LoadedLedger.lines, LedgerStore.replace, LedgerStore.schema
├── projections/
│   ├── snapshot.ts                 # N: snapshotOf(state) → Snapshot, sortKeysDeep, snapshotDiff(a, b) → claves
│   ├── integrity.ts                # M: dangling_reference (reference_etf_id)
│   └── deep-check.ts               # N: deepCheck(lines, events, state, schema?)
├── usecases/
│   ├── project-ledger.ts           # M: ProjectedLedger.lines
│   └── compact.ts                  # N: compactLedger(deps, options)
├── synth/
│   ├── random.ts                   # N: Prng (mulberry32), seededRandom(seed): RandomSource
│   ├── clock.ts                    # N: SyntheticClock (Clock que avanza desde 2026-09-01)
│   ├── builder.ts                  # N: ScenarioBuilder: completeDraft + ids + proyección para leer posiciones
│   ├── scenario.ts                 # N: generateLedger({ seed }): esqueleto fijo, detalles por semilla
│   ├── summary.ts                  # N: summarizeLedger(events): eventos por tipo, cuentas, activos, ejercicios
│   └── index.ts                    # N: exports + SYNTHETIC_EXPECTED_WARNINGS
└── index.ts                        # M: exporta todo lo anterior

packages/domain/test/
├── memory-store.ts                 # M: TestStore con líneas, schema, replace y archivos
├── schema/test-schema.ts           # N: TEST_SCHEMA_V2 (note → notes)
├── schema/{migrations,line,validate}.test.ts   # M: nombres nuevos; decode/validate con esquema inyectado
├── schema/legacy-fixture.test.ts   # N: fixture legacy con esquema real y de prueba (lee de tests/fixtures)
├── projections/snapshot.test.ts    # N
├── projections/deep-check.test.ts  # N: un test por código
├── projections/integrity.test.ts   # N: dangling_reference
├── usecases/compact.test.ts        # N: libro mezclado, no-op, inválido, etag, archivo existente, vacío
├── synth/generator.test.ts         # N: golden (i)(ii), contenido mínimo, prefijos de la semilla 1
├── synth/properties.test.ts        # N: fast-check sobre semillas; compact conserva snapshot
└── tsconfig.test.json (packages/domain/)  # M: types ["node"] para leer fixtures (spec A13, nota en questions.md)

packages/adapters/
├── src/ledger-store/file.ts        # M: schema, lines, replace con archive/
├── src/ledger-store/memory.ts      # M: schema, lines, replace con mapa de archivos
├── test/ledger-store.contract.ts   # M: lines, replace, etag viejo, archivo existente
├── test/file.test.ts               # M: archive/ en disco, fsync, esquema inyectado, línea v3 rechazada
└── test/memory.test.ts             # M: archivos consultables

apps/cli/
├── src/commands/synth.ts           # N: atlas synth --out --seed
├── src/commands/compact.ts         # N: atlas compact [--yes]
├── src/commands/backup.ts          # N: atlas backup --to
├── src/commands/query.ts           # M: check --deep
├── src/output/messages.ts          # M: códigos nuevos
├── src/main.ts                     # M: comandos y USAGE
└── test/commands/{synth,compact,backup,query}.test.ts, test/e2e.test.ts   # M/N

tests/
├── architecture.test.ts            # M: nada de domain/src fuera de synth/ importa de synth/
├── fixtures/ledger/synthetic-v1.jsonl, synthetic-v1.snapshot.json, legacy-v1-for-test-schema.jsonl   # N
└── tsconfig.json                   # M: tsBuildInfoFile

package.json (raíz: script clean), packages/*/tsconfig*.json, apps/cli/tsconfig*.json (tsBuildInfoFile), README.md
```

**Decisión de estructura**: sin paquetes nuevos. `synth/` vive en el dominio (decisión (a) del prompt) con dependencia en un solo sentido. Los tests que leen fixtures del disco se quedan en `packages/domain/test` activando los tipos de Node solo en el `tsconfig` de test (el de `src` sigue con `types: []`, y el test de arquitectura sigue vigilando `src`).

## Diseño (resumen; detalle en `data-model.md` y `contracts/`)

### Esquema inyectable (`schema/migrations/index.ts`, `line.ts`, `validate.ts`)

```ts
export type Migration = (line: UnknownRecord) => UnknownRecord;
export interface LedgerSchema { readonly version: number; readonly migrations: ReadonlyMap<number, Migration> }
export const CURRENT_LEDGER_SCHEMA: LedgerSchema = { version: CURRENT_SCHEMA_VERSION, migrations: new Map() };
export const migrate = (line, schema = CURRENT_LEDGER_SCHEMA) => …   // misma lógica que hoy: rechaza > version, falla si falta un paso
export const parseLine = (text): UnknownRecord                     // JSON válido y objeto; errores invalid_json / invalid_line
export const decodeLine = (text, schema = CURRENT_LEDGER_SCHEMA): DecodedLine
export const canonicalLine = (record: UnknownRecord): string        // claves del envoltorio primero, resto en su orden, JSON.stringify
export const encodeLine = (event) => canonicalLine(event)
export const validateShape = (raw, schema = CURRENT_LEDGER_SCHEMA)  // checkEnvelope: raw.schema_version === schema.version
```

`MigrationChain`/`MIGRATIONS` desaparecen (spec A12); `CURRENT_SCHEMA_VERSION` y `RESERVED_EVENT_TYPES` no cambian. `TEST_SCHEMA_V2` (solo en tests): `{ version: 2, migrations: Map([[1, rename note → notes]]) }`.

### Puerto (`ports/ledger-store.ts`)

```ts
export interface LoadedLedger { events; etag; lines: readonly string[] }
export interface LedgerStore {
  readonly schema: LedgerSchema;                                   // el que usa para decodificar
  load(): Promise<LoadedLedger>;
  append(events, etag): Promise<{ etag }>;
  replace(events, etag, archiveName): Promise<{ etag }>;           // archiva bytes originales con archiveName; ConflictError; ArchiveExistsError
}
```

`FileLedgerStore(path, schema?)`: `replace` lee bytes, compara etag, `mkdir -p archive/`, abre `archive/<archiveName>` con `wx` (EEXIST → `ArchiveExistsError`), escribe bytes, `fsync`, cierra; después temporal + `rename` como `append`. `MemoryLedgerStore.{empty,fromEvents,fromLines}(…, schema?)`, `archives: ReadonlyMap<string, string>` para los tests.

### Instantánea (`projections/snapshot.ts`)

`snapshotOf(state): Snapshot` construye un objeto plano (forma en `data-model.md` §1) y lo pasa por `sortKeysDeep`; `Money`/`Quantity`/`Decimal` → `toString()`; sin `message` en avisos e inválidos (recomendación (1)). `snapshotDiff(a, b): string[]` devuelve las claves de primer nivel cuyo `JSON.stringify` difiere (para `projection_changed` y `projection_not_reproducible`). Excluye posiciones de fichero, `days_open` y cualquier `at`.

### Generador (`synth/`)

- `Prng` (`mulberry32`): `uint32()`, `int(min, max)`, `decimal(min, max, scale)` como cadena, `pick(list)`, y `fill(target: Uint8Array)` que es la implementación de `RandomSource`. Un único PRNG alimenta los ULID y los valores del escenario; el orden de consumo es fijo.
- `SyntheticClock`: `at(date)` devuelve `max(<date>T18:00:00Z, anterior + 1 s)`; `now()` devuelve el último instante. Los `recorded_at` son monótonos en orden de fichero y coherentes con las fechas de negocio, salvo en los registros "tardíos" del escenario, donde el reloj sigue avanzando (eso es lo que se quiere).
- `ScenarioBuilder`: `record(draft, businessDate)` = `clock.at(date)` + `completeDraft({ clock, random }, draft, ulid.next())` (valida la forma) + `push`; `state()` proyecta lo acumulado (para leer posiciones y calcular picos, cantidades de venta "todo" y valoraciones); `expectWarning(code)` acumula los avisos deliberados.
- `generateLedger({ seed })` ejecuta el esqueleto de `data-model.md` §6: catálogo y configuración, bucle mensual 2026-09 → 2028-12 con `order_placed` → `buy` (D+2, `amount`, sin `unit_price`), y bloques fijos en meses fijos (traspasos encadenados, custodia, contrasplit en dos cuentas, split, escisión, fusión, exclusión, fusión de fondos, cambio de clase, venta con pérdida + registro tardío, venta 30/12 → 02/01, corrección de ejercicio anterior, tesis, valoraciones, orden y solicitud pendientes). La semilla fija importes, NAVs, precios, tipos de cambio y el día del mes (1-5) de cada bloque; las cantidades que deben dejar picos se eligen entre valores que garantizan el resto.
- `summarizeLedger(events)`: eventos por tipo, cuentas, activos, ejercicios (por fecha de negocio); lo imprime `atlas synth`.
- `SYNTHETIC_EXPECTED_WARNINGS = ["same_asset_two_accounts"]` (Q1/A1).

### `compact` (`usecases/compact.ts`)

```ts
planCompact({ store, clock }): Promise<CompactPlan>            // recomendación (2) del usuario: sin callback
compactLedger({ store, clock }, plan: CompactPlan): Promise<CompactResult>
```
`planCompact`: (1) `load()` → `events`, `etag`, `lines`; versiones por línea con `parseLine`; (2) `projectLedger(events, { collectErrors: true })`; si `invalid.length > 0` → `CompactRejectedError("invalid_events", …)`; (3) devuelve `{ etag, lines, versions, targetVersion: store.schema.version, outdated, archiveName: ledger-<todayInMadrid(clock)>-v<min>.jsonl }`.

`compactLedger(deps, plan)`: (1) `load()` de nuevo; `etag !== plan.etag` → `ConflictError`; (2) `plan.outdated === 0` → `{ status: "nothing_to_compact", … }` (también libro vacío); (3) `text = events.map(encodeLine)`; `again = text.map(l => decodeLine(l, store.schema).event)`; `snapshotDiff(snapshotOf(before), snapshotOf(projectLedger(again)))` no vacío → `CompactRejectedError("projection_changed", { keys })`; (4) `store.replace(events, etag, name)`; ante `ArchiveExistsError`, `name = base-2`, `-3`… hasta `-99`; después propaga; (5) `{ status: "compacted", archiveName, linesBefore, linesAfter, versions, targetVersion, etag }`.

### Verificación profunda (`projections/deep-check.ts`, `integrity.ts`)

`deepCheck(lines, events, state, schema = CURRENT_LEDGER_SCHEMA)` sobre las líneas crudas: `parseLine` de cada una → `duplicate_id` (ids repetidos, con posiciones), `non_canonical_line` (`canonicalLine(record) !== line`), `outdated_lines` (recuento por versión `< schema.version`, un solo aviso), `unknown_field` (campo de primer nivel fuera de `knownFieldsOf(type)`, aviso; recomendación (4)); sobre los eventos → `fingerprint_mismatch` (`fingerprintOf(event) !== event.fingerprint` cuando el tipo lleva huella); y, si no hay ids duplicados, `projection_not_reproducible` (`decodeLine` de cada línea con `schema`, `projectLedger` con `collectErrors` y `settings: state.fiscalSettings`, `snapshotDiff` no vacío).

Tabla "referencia → dónde se comprueba" (FR-014):

| Referencia | Evento | Dónde se comprueba hoy | Código | Esta feature |
|---|---|---|---|---|
| `reverses_id` | `reversal` | proyección, pasada 0 | `reversal_target_missing`, `reversal_of_reversal`, `already_reversed` | nada |
| `corrects_id` | cualquiera | proyección, pasada 0 (todos los eventos, anulados incluidos) | `dangling_correction` (→ `state.invalid` → `integrity`) | nada (no duplicar) |
| `order_id` | `buy`, `sell`, `order_updated` | proyección, pasada B | `unknown_order`, `order_closed`, `order_mismatch` | nada |
| `request_id` | `transfer`, `transfer_request_updated` | proyección, pasada B | `unknown_request`, `request_closed`, `request_mismatch` | nada |
| `thesis_id` | `buy`, `sell`, `thesis_closed` | proyección, pasadas A' y B | `unknown_thesis`, `thesis_mismatch`, `thesis_not_open`, `thesis_not_allowed` | nada |
| `account_id`, `asset_id`, `from_*`, `to_*`, `per_account[].account_id`, `to_asset_id` | operaciones y efectos | proyección (`requireAccount`, `requireAsset`) | `unknown_account`, `unknown_asset` | nada |
| `reference_etf_id` | `asset_created`, `asset_updated` | **nadie** | — | `integrity` → `dangling_reference` (error) |
| `id` duplicado | envoltorio | proyección, pasada 0 (lanza incluso con `collectErrors`) | `duplicate_id` | `deepCheck` sobre líneas; la CLI captura la excepción (A9) |

`integrity` añade `dangling_reference` recorriendo `state.assets`. Comprobaciones de Beancount que aplican y **no** están en §3.5 (anotadas en `research.md`, no implementadas): operación sobre cuenta o activo con `active = false`; `valuation.quantity` distinta de la posición física en su fecha; dos `valuation` del mismo par el mismo día.

### CLI

- `synth`: `--out` obligatorio, `--seed` entero ≥ 0 (por defecto 1); rechaza si `--out` existe (`path_exists`); genera; `integrity` + `deepCheck` sobre lo generado como guardarraíl (nunca escribe un libro con hallazgos); `FileLedgerStore(out).append(events, etag vacío)`; imprime `summarizeLedger`.
- `compact`: `planCompact(ctx.deps)` → imprime líneas por versión y nombre de archivo → `confirm()` de `shared.ts` (`--yes`) → `compactLedger(ctx.deps, plan)`; imprime el resultado; los rechazos son `DomainError` → código 1 vía `report()`; `--json`.
- `check --deep`: `loadAndProject(collectErrors)` en `try`; si lanza `ProjectionError` `duplicate_id` → hallazgo único y código 1; si no, `integrity(state)` + `deepCheck(lines, events, state, ctx.deps.store.schema)`; misma tabla; `--json` con `findings`, `deep`, `warnings`.
- `backup`: `--to` obligatorio; `mkdir -p`; destino `<dir>/ledger-<todayInMadrid>.jsonl`; `copyFile(…, COPYFILE_EXCL)` (existe → `path_exists`); recarga ambos con `FileLedgerStore`; `etag` o líneas distintas → `backup_mismatch` (código 1); imprime ruta, líneas, `etag`.

### Tooling

`tsBuildInfoFile` en los 7 `tsconfig` de compilación/test (`dist/tsconfig.tsbuildinfo`, `dist-test/tsconfig.test.tsbuildinfo`, `tests/dist/tsconfig.tsbuildinfo`); script raíz `clean`: `rm -rf packages/*/dist packages/*/dist-test packages/*/coverage apps/*/dist apps/*/dist-test tests/dist coverage`; README.

## Seguimiento de complejidad

Sin violaciones de la constitución que justificar.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Q1: el escenario obligatorio provoca `same_asset_two_accounts` | Avisos declarados por el generador (A1); si el usuario prefiere otra lectura, cambia una línea del test y del escenario |
| Propiedad de prefijos demasiado lenta con 20 semillas | Medir en la tarea; exhaustivo para la semilla 1 y por bloques para el resto si hace falta (A14) |
| Determinismo roto por `Date.now`, orden de `Map`, o `toISOString` | Todo instante sale del reloj sintético; los mapas se recorren en orden de inserción (fijo) y la instantánea ordena claves; test de reproducción byte a byte en CI |
| Cobertura 100 % en `synth/` con ramas dependientes de la semilla | Las ramas del escenario no dependen de la semilla (esqueleto fijo); las del PRNG se cubren con tests unitarios de rangos |
| `compact` escribe algo sin archivar | El adaptador archiva y hace `fsync` antes de tocar el libro; contrato del puerto lo verifica con el archivo existente y con el etag viejo |
| `non_canonical_line` dispara en líneas antiguas correctas | Canonicidad sobre el registro tal cual está escrito, sin migrar (A8) |
| Cambiar `MigrationChain` rompe tests de la 001 | Se adaptan los nombres; los casos (versión futura, paso faltante, cadena de dos pasos) se conservan |
| Tipos de Node en los tests del dominio abren la puerta a `node:` en `src` | `src/tsconfig.json` sigue con `types: []` y el test de arquitectura vigila los imports de `src` |
