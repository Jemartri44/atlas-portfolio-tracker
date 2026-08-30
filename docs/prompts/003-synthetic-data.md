# Prompt 003 — Feature `003-synthetic-data`

> Copia este texto íntegro al asistente implementador, o indícale que lea `docs/prompts/003-synthetic-data.md` en el repositorio. Parte de `develop` con las features 001 y 002 fusionadas (PRs #10, #12 y #15).

---

Eres el asistente implementador del proyecto **Atlas Portfolio Tracker** (`~/projects/atlas-portfolio-tracker`). Vas a construir la tercera feature de código, la que cierra la Fase 1 por el lado de la **supervivencia del libro**: un generador de libros sintéticos que sirva de *golden file* a todas las features siguientes, el comando `compact` con archivo del original, una migración de esquema de prueba que ejercite el cargador de verdad, la comprobación de integridad completa (`atlas check --deep`), la copia local del libro (`atlas backup`) y dos ajustes de tooling. No hay semántica fiscal nueva: todo lo que el libro significa ya está decidido en las features 001 y 002; tu trabajo es hacerlo reproducible, verificable y migrable.

## 1. Lee antes de hacer nada, en este orden

1. `CLAUDE.md` entero, en especial *Working on a feature*, *Code architecture*, *Domain traps* (8 y 10) y *Language*.
2. `.specify/memory/constitution.md` (I, VI y VII son las que más pesan aquí).
3. `docs/adr/README.md` y los ADRs 0003, 0005, 0006 (el central de esta feature: versión por línea, migración en memoria, `compact` con archivo), 0007 (puertos; `LedgerStore` gana una operación en esta feature), 0009, 0010, 0011, 0012 y 0013.
4. `docs/data-schema.md` completo, con lupa en §1 (prefijo `archive/`), §2 (envoltorio, orden canónico), §5 (versionado, contrato del cargador y del `append`, `compact`) y §7 (proyecciones e `integrity`). El generador debe producir **todos** los tipos de evento de §3 con la forma de §6.
5. `docs/business-rules.md` §5.2-§5.4 y §6; `docs/fiscal-questions.md` (para no fijar nada que esté pendiente del asesor).
6. `specs/001-ledger-core/` y `specs/002-corporate-actions/` enteros: en particular `questions.md` de ambas (notas de implementación) y `research.md` de la 002 §1 (seguimientos que **no** entran aquí). Y `specs/001-ledger-core/data-model.md` §3.2, que listaba `dangling_reference` como comprobación de `integrity` y no llegó a implementarse.
7. En el código: `packages/domain/src/schema/{line,envelope,validate}.ts` y `schema/migrations/index.ts`; `projections/{project-ledger,state,integrity}.ts`; `usecases/{record-event,rectify,project-ledger}.ts`; `packages/adapters/src/ledger-store/{file,memory}.ts`; `apps/cli/src/commands/query.ts` (`checkCommand`) y `export.ts`; los ayudantes de test `packages/domain/test/{ledger-builder,samples,arbitraries}.ts` y `apps/cli/test/harness.ts`; las fixtures de `tests/fixtures/ledger/`.
8. `docs/dependencies.md`.

Si encuentras una contradicción o una ambigüedad que te impida seguir, **no la resuelvas tú**: anótala en `specs/003-synthetic-data/questions.md` y avisa al usuario. Nada fiscal ni estructural se decide en esta feature.

## 2. Flujo de trabajo

1. Worktree separado, rama desde `develop` **actualizado**:
   ```bash
   cd ~/projects/atlas-portfolio-tracker && git fetch origin && git worktree add ../atlas-portfolio-tracker-003 -b feature/003-synthetic-data origin/develop
   cd ../atlas-portfolio-tracker-003 && git config core.hooksPath .githooks && nvm use && npm ci
   ```
2. Spec Kit: `/speckit-specify` con el alcance de la sección 3 → `/speckit-clarify` si hace falta → `/speckit-plan` → `/speckit-tasks`. Artefactos en `specs/003-synthetic-data/`, en español con identificadores en inglés. **Enseña `spec.md` y `plan.md` al usuario y espera su visto bueno antes de escribir código.**
3. Al planificar, lee cómo Beancount comprueba la coherencia de un libro (`beancount/ops/validation.py`: qué invariantes verifica y cuáles son errores frente a avisos) y cómo genera datos de ejemplo (`beancount/scripts/example.py`: cómo hace determinista la generación y qué eventos raros incluye). Anota en `plan.md` qué comprobaciones suyas aplican a nuestro esquema y no están en §3.5. No copies código.
4. `/speckit-implement` por tareas, commits atómicos, Conventional Commits en inglés (el hook los valida).
5. PR a `develop` con la plantilla, checklist rellena con honestidad. No fusiones.

## 2 bis. Reglas de operación

Las de `CLAUDE.md` § *Working on a feature* y las de `docs/prompts/001-ledger-core.md` §2 bis, vigentes íntegras. Lo que más importa aquí:

- Solo trabajas en `feature/003-synthetic-data`. Nunca push a `develop`/`main`, nunca `--force`, nunca reescribas historial.
- No puedes tocar `docs/`, los ADRs, la constitución, `.githooks/`, `.claude/`, ni lo que ya existe en `.github/`. Los cambios de documentos que esta feature necesita (§6) ya están en `develop`. Si crees que falta alguno, es una pregunta en `questions.md`.
- No añadas dependencias: `docs/dependencies.md` es la lista cerrada. El generador aleatorio determinista se escribe a mano en el dominio (un PRNG de 32 bits de una docena de líneas); nada de paquetes de *faker*.
- Cobertura 100 % de líneas y ramas en `packages/domain`, bloqueante. Biome limpio antes de cada commit.
- **Privacidad**: la fixture y todo lo que genere `atlas synth` es sintético: ids `acc_*`/`ast_*`, ISIN `XX…`, nombres inventados, importes redondos. Ningún dato real, ni por parecido.
- Código, identificadores, commits, ficheros: inglés. Specs y mensajes de la CLI: español con identificadores en inglés.

## 3. Alcance

### 3.1 Instantánea canónica de la proyección (`snapshotOf`)

Función pura `snapshotOf(state) → objeto JSON-serializable` en `packages/domain/src/projections/snapshot.ts`: todo lo que exponen las proyecciones públicas (cuentas, activos con `identifier_history`, posiciones físicas, lotes abiertos y cerrados por activo con `id`, `acquisition_date`, cantidades, costes, `source_lot_id` y consumiciones, ganancias por ejercicio con `gain_eur_rounded`, rendimientos, efectivo por cuenta y divisa, órdenes y traspasos pendientes, tesis, valoraciones, avisos e inválidos), con **claves ordenadas**, `Money`/`Quantity`/`FxRate` como cadenas y sin nada que dependa del momento de ejecución. Dos estados iguales dan el mismo texto (`JSON.stringify` estable). Es la pieza que usan §3.2 (fichero esperado), §3.3 (comprobación de `compact`) y §3.5 (`--deep`).

### 3.2 Generador de libros sintéticos y *golden file*

- Módulo `packages/domain/src/synth/` (decisión (a) de §6): `generateLedger({ seed }) → LedgerEvent[]` y un PRNG determinista propio (`seededRandom(seed)` que implementa el puerto `RandomSource`, más un reloj sintético que avanza desde una fecha fija). Con la misma semilla, la salida es **idéntica byte a byte** (ids ULID, `recorded_at`, huellas incluidas). El resto del dominio **no** importa nada de `synth/` (amplía el test de arquitectura).
- El escenario es un **esqueleto fijo** que garantiza los eventos raros; la semilla varía solo detalles (importes, cantidades, precios, desplazamientos de fecha) dentro de rangos plausibles. Cubre unos tres ejercicios desde `2026-09-01` y contiene, como mínimo:
  - Catálogo: al menos cuatro cuentas (dos `core` en MyInvestor y en IBKR, una segunda `core` en otra plataforma para tener el mismo activo en dos cuentas, una `bucket`), activos de todos los `asset_type` (`fund` ×3 al menos, `money_market`, `etc` en USD, `etp`, `stock` ×3 en el cubo), más los activos que crean los eventos corporativos; `asset_updated` con cambio de identificador (historial) y con `active=false` tras el `delisting`.
  - `settings_changed` inicial completo y al menos uno posterior (cambio de pesos objetivo).
  - Aportación mensual a fondos con el patrón de ADR-0012: `order_placed` → `buy` con `amount` y sin `unit_price` a D+2; órdenes cerradas y **una pendiente** al final; una cancelada.
  - Traspaso **parcial encadenado** (A→B parcial y después B→C parcial: lotes con `source_lot_id` en cadena y fecha original), con `transfer_requested`/`transfer_request_updated` cerrados por el `transfer` y **una solicitud pendiente** al final; traspaso de custodia del ETC entre las dos cuentas `core` de IBKR.
  - `fund_merger` con ratio no entero sobre un fondo que tiene lotes traspasados (la fecha original se conserva dos veces); `share_class_change`.
  - `reverse_split` con picos en **dos cuentas**; `split`; `spin_off` con picos; `merger` con picos; `delisting`.
  - `fx_exchange` EUR→USD antes de la compra del ETC; `dividend` en USD con retención en origen y en España; `interest` con retención; `standalone_fee`; `cash_deposit`/`cash_withdrawal`.
  - Venta con **pérdida en un fondo seguida de aportación mensual** dentro del año (dato para la Fase 5) y **venta el 30/12 con liquidación el 02/01** de una acción del cubo (ejercicio por `trade_date`).
  - Tesis: dos cerradas (una con ganancia, otra con pérdida) con sus `buy`/`sell` enlazados, y una abierta con posición viva.
  - **Registro tardío**: una compra con `recorded_at` posterior a una venta de fecha fiscal más reciente, que la venta debe consumir (proyección cronológica). **Corrección de un ejercicio anterior**: `reversal` + evento con `corrects_id` registrados en el ejercicio siguiente al del evento corregido.
  - `valuation` a 31/12 de cada ejercicio para las cuentas extranjeras.
- Invariantes del libro generado, para **cualquier** semilla: cada prefijo del fichero proyecta sin errores (es decir, se podría haber registrado evento a evento con `recordEvent`), `integrity` sin hallazgos y `state.warnings` vacío, Σ lotes abiertos = Σ posiciones físicas por activo, proyectar dos veces da el mismo `snapshotOf`.
- CLI: `atlas synth --out <ruta> [--seed <n>]` (semilla por defecto `1`). Escribe con `FileLedgerStore.append` sobre un fichero **inexistente**; si la ruta existe, rechaza. Imprime un resumen (eventos por tipo, cuentas, activos, ejercicios).
- ***Golden file***: `tests/fixtures/ledger/synthetic-v1.jsonl` = `generateLedger({ seed: 1 })` tal cual lo escribe la CLI, y `tests/fixtures/ledger/synthetic-v1.snapshot.json` = `snapshotOf` de su proyección. Tests: (i) el generador con semilla 1 reproduce la fixture byte a byte; (ii) la proyección de la fixture coincide con el snapshot; (iii) propiedad sobre semillas (`fast-check`, al menos veinte) con los invariantes de arriba. Política (decisión (i)): una vez fusionada, la fixture **se congela**; si el generador cambia, se regenera en un commit propio con justificación, y cuando llegue `schema_version = 2` esta fixture se queda como fixture de migración y nace `synthetic-v2.jsonl`.

### 3.3 `compact` (data-schema §5, ADR-0006)

- Puerto (decisión (b)): `LedgerStore` gana `replace(events, etag, archiveName) → { etag }`: sustituye el contenido completo por `events` serializados con `encodeLine`, **solo** tras haber guardado los bytes originales, tal cual, con el nombre `archiveName`. `FileLedgerStore` escribe el archivo en el directorio `archive/` junto al fichero del libro (crea el directorio), hace `fsync`, y después escribe el nuevo contenido con temporal + `rename`, como `append`. Si el archivo ya existe, error; nunca se sobrescribe un archivo. Conflicto de `etag` → `ConflictError`. `MemoryLedgerStore` guarda los archivos en un mapa consultable por los tests. El contrato del puerto (`ledger-store.contract.ts`) cubre la operación nueva.
- Caso de uso `compactLedger(deps) → CompactResult` en `domain/usecases/compact.ts`: carga (las líneas llegan ya migradas en memoria), proyecta en modo `collectErrors` y **rechaza** si hay eventos inválidos; calcula `archiveName` (decisión (c)); si ninguna línea está por debajo de `CURRENT_SCHEMA_VERSION`, no escribe nada y lo dice (`nothing_to_compact`); si no, serializa, vuelve a decodificar el texto resultante, proyecta y compara `snapshotOf` antes y después: si difieren, **aborta sin escribir** (`projection_changed`, con las claves que difieren). Devuelve archivo, líneas antes y después, versiones encontradas y versión destino.
- CLI: `atlas compact [--yes]`: muestra cuántas líneas hay por `schema_version`, el nombre del archivo y pide confirmación; al terminar imprime el resultado. Código 1 en rechazo.
- Tests: libro mezclado (líneas v1 legítimas y líneas antiguas del esquema de prueba de §3.4) → tras `compact`, todas las líneas a la versión actual, archivo byte a byte igual al original, `snapshotOf` idéntico; segundo `compact` es no-op; `compact` con un evento inválido rechaza y no toca el fichero; `etag` viejo rechaza; el archivo nunca se sobrescribe. Propiedad: para cualquier libro sintético, `compact` conserva el snapshot.

### 3.4 Migración de prueba v1→v2 (solo en tests)

- Hoy `decodeLine` usa `MIGRATIONS` y `validateShape` exige `schema_version === CURRENT_SCHEMA_VERSION`, así que una cadena inyectada no puede llegar al cargador. Decisión (e): un único objeto **`LedgerSchema = { version, migrations }`** (valor por defecto `CURRENT_LEDGER_SCHEMA`, `version = 1`, cadena vacía) que reciben opcionalmente `decodeLine`, la comprobación del envoltorio en `validateShape`, los dos `LedgerStore` (constructor) y, a través del `store`, `compactLedger`. `CURRENT_SCHEMA_VERSION` **no cambia**; el mecanismo `RESERVED_EVENT_TYPES` se conserva tal cual.
- Esquema de prueba `TEST_SCHEMA_V2` en los tests del dominio: `version = 2` con un paso `1 → 2` que transforma algo visible y reversible; por ejemplo, renombrar un campo `note` (nombre antiguo ficticio) a `notes`. Fixture `tests/fixtures/ledger/legacy-v1-for-test-schema.jsonl` con líneas v1 que llevan ese campo antiguo (compartida por dominio y adaptadores).
- Tests: cargar la fixture con el esquema real y con el de prueba (según cómo trate `validateShape` los campos desconocidos, la primera carga rechaza o ignora `note`: documenta cuál en `questions.md`); `append` sobre un libro cargado con el esquema de prueba escribe la línea nueva con `schema_version: 2` y **no** re-serializa las antiguas (prefijo byte a byte); un fichero con una línea `schema_version: 3` se rechaza con el esquema de prueba; `migrate` con paso faltante falla ruidosamente; `compact` con el esquema de prueba deja todo en v2 (§3.3). Los tests actuales de `migrations.test.ts` y `reserved-types.test.ts` siguen pasando.

### 3.5 `integrity` completa y `atlas check --deep`

- Puerto: `LoadedLedger` gana `lines: readonly string[]` (las líneas crudas, sin salto final, en orden de fichero). Los dos adaptadores las devuelven.
- `integrity(state)` (sin cambios de firma) añade `dangling_reference` (error) para las referencias que hoy no se comprueban en la proyección: como mínimo `corrects_id` que no apunta a un evento del libro o apunta a uno que no está anulado. Antes de añadir cada comprobación, verifica si la proyección ya la rechaza (`unknown_order`, `unknown_request`, tesis, `reverses_id`…); no dupliques: anota en `plan.md` la tabla "referencia → dónde se comprueba".
- `deepCheck(lines, events, state) → IntegrityFinding[]` en `projections/deep-check.ts`, sobre las líneas crudas (decisión (f)): `duplicate_id` (error), `fingerprint_mismatch` (error: la huella almacenada no coincide con `fingerprintOf(event)`; detecta líneas editadas a mano), `non_canonical_line` (aviso: `encodeLine(decode(line)) !== line`, escrita por otro cliente o a mano), `outdated_lines` (aviso: hay líneas por debajo de `CURRENT_SCHEMA_VERSION`, con recuento por versión; sugiere `compact`), `projection_not_reproducible` (error: volver a decodificar el texto y proyectar da otro `snapshotOf`).
- CLI: `atlas check` sigue como está; `atlas check --deep` añade `deepCheck` y muestra todo en la misma tabla; código 1 si hay algún error. `--json` incluye ambos bloques.
- Tests: uno por código con una fixture o una línea manipulada; `--deep` sobre `synthetic-v1.jsonl` limpio; `--deep` tras `compact` de un libro mezclado sin `outdated_lines`.

### 3.6 `atlas backup`

`atlas backup --to <directorio>`: copia los bytes del libro a `<directorio>/ledger-<YYYY-MM-DD>.jsonl` (fecha de hoy en `Europe/Madrid`; rechaza si el destino existe), vuelve a cargar la copia con un segundo `FileLedgerStore`, comprueba que el `etag` coincide y que el número de líneas es el mismo, e imprime ruta, líneas y `etag`. Es una operación de fichero de la CLI (decisión (g)): no toca el puerto ni el dominio. Test de extremo a extremo con el harness.

### 3.7 Tooling (decisión (h))

- `tsBuildInfoFile` explícito en cada `tsconfig` de compilación y de test (`dist/tsconfig.tsbuildinfo`, `dist-test/tsconfig.test.tsbuildinfo`; `tests/tsconfig.json` idem dentro de su `dist/`), de modo que borrar `dist*/` deje `tsc -b` sin estado incremental (hoy los `.tsbuildinfo` quedan en la raíz de cada paquete y `tsc -b` falla con TS6305 al cambiar de rama).
- Script raíz `clean` (`rm -rf` de `dist`, `dist-test` y `coverage` de todos los paquetes) y su uso documentado en el README junto al arranque. Sin herramientas nuevas.

### 3.8 Tests (constitución VII)

Además de los listados por bloque: el test de arquitectura amplía la regla "nada importa de `synth/`"; contrato de `LedgerStore` para `replace` y `lines` en memoria y fichero; propiedad "para todo prefijo de un libro sintético la proyección es válida"; propiedad "`compact` conserva `snapshotOf`"; casos límite: `compact` de un libro vacío (no-op), `compact` con archivo ya existente (rechazo), `replace` con `etag` viejo, `synth --out` sobre fichero existente (rechazo), `backup` sobre destino existente (rechazo), `check --deep` con una línea editada a mano (huella) y con un `corrects_id` colgante.

## 4. Fuera de alcance (no lo hagas aunque parezca fácil)

Adaptador S3 y `archive/` en S3 (Ronda 8); `DocumentStore`; importadores (004, 005) y `broker_ref`/`source` en `corporate_action` (Ronda 6); precios y ajuste de cotizaciones tras un `scale` (Ronda 6); regla de recompra y todo el motor fiscal (Fase 5); API; web; Terraform; cualquier `schema_version = 2` real; cambios en la semántica de ningún evento; nuevas comprobaciones en `integrity` que necesiten precios o fuentes externas.

## 5. Criterios de terminado

- `lint`, `typecheck`, `test:coverage` (100 % en `packages/domain`), `build` y CI en verde; `npm run clean && npm run build` funciona desde cero.
- `tests/fixtures/ledger/synthetic-v1.jsonl` y su `.snapshot.json` en el repo, generados por la CLI, con `atlas check --deep` limpio.
- `docs/data-schema.md` sin cambios (si algo no encaja, es una pregunta).
- README: sección breve con `synth`, `compact`, `check --deep` y `backup`, y el script `clean`.
- `specs/003-synthetic-data/questions.md` con lo que hayas tenido que preguntar (o vacío, dicho explícitamente) y las notas de implementación.
- PR a `develop` con la checklist de la constitución.

## 6. Decisiones fijadas por este prompt

Ajustes de detalle que la dirección ha cerrado al escribir este prompt y que están reflejados en `docs/data-schema.md` y ADR-0007 en `develop`. Si el código que encuentras no coincide con ellos, manda el esquema.

- **(a) El generador vive en `packages/domain/src/synth/`**, exportado por `@atlas/domain`, con dependencia en un solo sentido (nada del dominio importa de `synth/`). Razón: es código puro, lo usan la CLI, los tests de todos los paquetes y, más adelante, la web (modo demo), y así queda bajo la cobertura del 100 %.
- **(b) `LedgerStore.replace(events, etag, archiveName)`** es la única forma de reescribir el libro; el adaptador archiva los bytes originales **antes** de reemplazar y nunca sobrescribe un archivo. Se registra en la tabla de puertos de ADR-0007.
- **(c) Nombre del archivo** `ledger-<YYYY-MM-DD>-v<n>.jsonl`: fecha del día de la compactación en `Europe/Madrid`, `n` = la **menor** `schema_version` presente en el fichero archivado; ante colisión, sufijo `-2`, `-3`… En el adaptador de fichero, `archive/` es un directorio junto al libro. (`data-schema.md` §1 y §5.)
- **(d) `compact` es no-op si no hay líneas antiguas y aborta si la proyección cambia** o hay eventos inválidos. Canonicalizar líneas escritas por otros clientes no es motivo para compactar.
- **(e) Esquema inyectable `LedgerSchema { version, migrations }`** con valor por defecto `CURRENT_LEDGER_SCHEMA`; el esquema v2 existe solo en tests. `CURRENT_SCHEMA_VERSION` sigue en 1.
- **(f) `LoadedLedger.lines`** expone las líneas crudas; `check --deep` = `integrity` + `deepCheck` con los códigos de §3.5. (`data-schema.md` §7.)
- **(g) `atlas backup`** es una copia local verificada, en la CLI, sin puerto nuevo; la copia fuera de AWS y la prueba anual de restauración se deciden en la Ronda 8 sobre este comando.
- **(h) Tooling**: `tsBuildInfoFile` dentro de `dist*/` y script raíz `clean`. Ninguna herramienta nueva.
- **(i) La fixture `synthetic-v1.jsonl` se congela** una vez fusionada; se regenera solo en un commit propio y justificado, y se conserva como fixture de migración cuando exista la v2.
