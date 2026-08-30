# Prompt 001 — Feature `001-ledger-core`

> Copia este texto íntegro al asistente implementador, o indícale que lea `docs/prompts/001-ledger-core.md` en el repositorio.

---

Eres el asistente implementador del proyecto **Atlas Portfolio Tracker** (`~/projects/atlas-portfolio-tracker`). Vas a construir la primera feature de código: el núcleo del libro mayor y una CLI mínima. Las decisiones de arquitectura ya están tomadas y documentadas; tu trabajo es implementarlas con exactitud, no rediseñarlas.

## 1. Lee antes de hacer nada, en este orden

1. `CLAUDE.md` entero, en especial *Working on a feature*, *Code architecture*, *Domain traps* y *Language*.
2. `.specify/memory/constitution.md`.
3. `docs/adr/README.md` y los ADRs 0001, 0003, 0005, 0006, 0007, 0008, 0009, 0010, 0012, 0013.
4. `docs/data-schema.md` completo.
5. `docs/specification.md` §2, §3, §4, §5 y §11; `docs/business-rules.md` §1, §5.2, §5.3, §5.7, §5.10; `docs/fiscal-questions.md` (para saber qué valores son provisionales).
6. `docs/dependencies.md`.

Si encuentras una contradicción o una ambigüedad que te impida seguir, **no la resuelvas tú**: anótala en `specs/001-ledger-core/questions.md` y avisa al usuario. Nada fiscal ni estructural se decide en esta feature.

## 2. Flujo de trabajo

1. Rama `feature/001-ledger-core` desde `develop`. Ejecuta `git config core.hooksPath .githooks`.
2. Spec Kit: `/speckit-specify` con el alcance de la sección 3 → `/speckit-clarify` si hace falta → `/speckit-plan` → `/speckit-tasks`. Artefactos en `specs/001-ledger-core/` en español con identificadores en inglés. **Enseña `spec.md` y `plan.md` al usuario y espera su visto bueno antes de escribir código.**
3. Al planificar, dedica un rato a leer cómo Beancount modela lotes y coste (`beancount/core/inventory.py`, `position.py`) y cómo Ghostfolio modela actividades, y anota en `plan.md` cualquier caso que ellos cubran y nuestro esquema no. No copies código.
4. `/speckit-implement` por tareas, commits atómicos en Conventional Commits en inglés (el hook los valida).
5. PR a `develop` con la plantilla, checklist rellena con honestidad. No fusiones.

## 3. Alcance

### 3.1 Esqueleto del monorepo (ADR-0007, ADR-0008)

- npm workspaces: `packages/domain` (`@atlas/domain`), `packages/adapters` (`@atlas/adapters`), `apps/cli` (`@atlas/cli`). `apps/api`, `apps/web` e `infra/` **no** se crean todavía.
- `.nvmrc` con Node 22 (la máquina tiene Node 20 por nvm: indica al usuario `nvm install 22 && nvm use 22`). ESM. `tsconfig` base con `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`.
- Biome (`biome.json`), vitest con cobertura v8 (umbral 100% líneas y ramas **solo** en `packages/domain`), fast-check. Scripts raíz: `lint`, `format`, `typecheck`, `test`, `test:coverage`, `build`.
- `packages/domain/package.json` sin `dependencies`; un test de arquitectura que falla si `domain` importa algo fuera de sí mismo o de `vendor/`.
- CI en `.github/workflows/ci.yml`: en PR y en push a `develop`/`main`: `npm ci`, lint, typecheck, test con cobertura, `npm audit --audit-level=high`, build. Sin despliegue.
- `docs/dependencies.md` es la lista cerrada. Si necesitas algo más, para y pregunta.

### 3.2 Dinero (ADR-0005)

- Vendoriza `big.js` (última versión estable) en `packages/domain/vendor/big.js` + `big.d.ts` + `VENDOR.md` (origen, versión, hash SHA-256, licencia MIT, procedimiento de actualización).
- Módulo `money/`: `Decimal` (envoltorio mínimo sobre Big), `Money` (importe + divisa ISO 4217; rechaza operar entre divisas distintas), `Quantity`, `Price`, `FxRate` (con fecha y par; `convert(money) → Money`).
- Reglas: exacto por dentro; `roundToCents()` half-up explícito, solo se llama en salida; serialización `toString()` como cadena decimal sin exponente; `parse()` estricto que rechaza `number`.
- Tests de propiedades: asociatividad y conmutatividad de la suma, `a − a = 0`, `parse(toString(x)) = x`, redondeo idempotente, mezcla de divisas lanza.

### 3.3 Eventos y libro (ADR-0003, ADR-0006, data-schema §2-§6)

- Tipos TypeScript para el envoltorio y para **estos** eventos: `account_created/updated`, `asset_created/updated`, `settings_changed`, `buy`, `sell`, `transfer` (modos fiscal y de custodia), `order_placed`, `order_updated`, `transfer_requested`, `transfer_request_updated`, `dividend`, `interest`, `fx_exchange`, `cash_deposit`, `cash_withdrawal`, `standalone_fee`, `valuation`, `reversal`. (`corporate_action`, `thesis_*` quedan para la feature 002; deja el discriminador abierto para añadirlos sin romper nada.)
- `fx_rate` es el tipo del BCE tal cual (divisa por EUR) y la conversión es `eur = amount / fx_rate`; `amount` es la base de coste cuando está presente (ADR-0012, ADR-0013). `fiscal_date` se deriva por tipo de activo desde `Settings.fiscal_date_rule`.
- Validación de cada evento al escribir (campos obligatorios, numéricos como cadenas decimales, fechas `YYYY-MM-DD`, `reversal` de `reversal` prohibido, `transfer` fiscal solo entre activos `transferable` y traspaso de custodia solo con el mismo activo, un activo no puede existir en los dos libros — ADR-0009). `fingerprint` repetida es un **aviso con confirmación** (`--confirm-duplicate`), no un rechazo.
- `reverseEvent`/`correctEvent` re-proyectan sin la pareja y **rechazan** si algún evento posterior deja de ser válido, listando los afectados (data-schema §6.3). La proyección ante un estado inválido lanza; nunca cantidades negativas en silencio.
- ULID propio (~40 líneas, monótono dentro del proceso). `recorded_at` vía el puerto `Clock`.
- `schema_version = 1`; cadena de migraciones vacía pero con el mecanismo implementado (`migrate(line)`), y test de que una línea v1 pasa intacta.
- Puerto `LedgerStore` (`load() → {events, etag}`, `append(events, etag)` con conflicto explícito) y adaptadores **memoria** y **fichero local** (`ledger.jsonl`, escritura atómica vía fichero temporal + rename). Contrato obligatorio (data-schema §5): el cargador **rechaza** líneas con `schema_version` superior a la conocida; `append` conserva los bytes originales y solo añade; el orden canónico es la posición en el fichero. Tests: fichero con una línea "del futuro" falla al cargar; tras `append`, el prefijo del fichero es byte a byte el original. El adaptador S3 **no** entra en esta feature.
- Casos de uso en `domain/usecases`: `recordEvent`, `reverseEvent`, `correctEvent` (reversal + nuevo con `corrects_id`), `projectLedger`.

### 3.4 Proyecciones y FIFO (data-schema §7-§8, ADR-0009, ADR-0010)

- `accounts`, `assets` (con `identifier_history`), `settingsAt(date)` (comparación en `Europe/Madrid`, fin del día), `physicalPositions`, `cashBalances` (incluye `fx_exchange`, `interest`, `dividend`), `pendingTransfers`, `pendingOrders`, `fiscalLots`, `realizedGains(year)` por `fiscal_date` y **sin** la regla de recompra (queda para el motor fiscal), `investmentIncome(year)`, `integrity`.
- FIFO global por `asset_id` entre cuentas, orden `(acquisition_date, id)`; coste de adquisición y valor de transmisión con comisiones según §8.1; `transfer` hereda fecha y coste total (§8.2), parcial en FIFO.
- Tests de propiedades: suma de lotes abiertos = posición física agregada por activo; proyectar dos veces da lo mismo; `correctEvent` seguido de volver al valor original deja la proyección idéntica a no haber tocado nada; un `transfer` nunca genera ganancia.
- Casos límite obligatorios (constitución VII): varios lotes con la misma fecha, cantidades fraccionarias con muchos decimales, venta que parte un lote, traspaso parcial, traspaso de custodia (posición cambia de cuenta, lotes intactos), venta mayor que la posición (rechazo), anulación de una compra ya vendida (rechazo con lista), venta el 30/12 con liquidación el 02/01 (ejercicio según `fiscal_date_rule`), efectivo en divisa que cuadra tras `fx_exchange`.

### 3.5 CLI (ADR-0007)

`apps/cli`, ejecutable `atlas`, sobre el `LedgerStore` de fichero (`--ledger <ruta>`, por defecto `./ledger.jsonl`). Sin dependencias: parseo de argumentos a mano.

- `atlas account add|list`, `atlas asset add|list`, `atlas settings set|show`
- `atlas add buy|sell|transfer|dividend|interest|fx|cash-in|cash-out|fee|valuation …` (flags con los campos de data-schema §6, incluido `--amount`; muestra el evento antes de escribir y pide confirmación salvo `--yes`)
- `atlas order place|cancel|list` y `atlas transfer request|update|pending` (seguimiento, ADR-0010, ADR-0012); `atlas add buy --order <id>` cierra la orden
- `atlas edit <id>` y `atlas delete <id>` (implementan reversal + corrección; avisan si el `value_date` es de un ejercicio anterior)
- `atlas positions`, `atlas lots [asset]`, `atlas cash`, `atlas transfers pending`, `atlas gains <year>`, `atlas check` (integrity)
- `atlas export --format jsonl|csv`
- Salida en tablas de texto; mensajes al usuario en español; código e identificadores en inglés.

## 4. Fuera de alcance (no lo hagas aunque parezca fácil)

Eventos corporativos y primitivas de lote (feature 002); tesis del cubo (002); generador de datos sintéticos, `compact` y migraciones reales (003); importadores y parsers; adaptador S3; API; web; Terraform; regla de los dos meses; precios y tipos de cambio (solo se guarda el `fx_rate` que llega en el evento).

## 5. Criterios de terminado

- `npm run lint`, `typecheck`, `test:coverage` y `build` en verde; cobertura 100% en `packages/domain`; test de arquitectura en verde; CI en verde en la PR.
- `docs/data-schema.md` sin cambios (si crees que necesita uno, es una pregunta, no un cambio).
- README con arranque en local (`nvm use`, `npm ci`, `npm test`, ejemplo de uso de la CLI con datos inventados).
- PR a `develop` con la checklist de la constitución.
