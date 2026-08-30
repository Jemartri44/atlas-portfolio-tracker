# Plan de implementación: Libro mayor — núcleo y CLI (`001-ledger-core`)

**Rama**: `feature/001-ledger-core` | **Fecha**: 2026-08-30 | **Spec**: [spec.md](spec.md)

**Entrada**: `spec.md`, `docs/prompts/001-ledger-core.md` §3, ADR 0001, 0003, 0005-0010, 0012, 0013, `docs/data-schema.md`, `docs/dependencies.md`.

## Resumen

Construir el esqueleto del monorepo y tres paquetes: `@atlas/domain` (dinero exacto, tipos de evento, validación, proyecciones, FIFO, casos de uso y puertos; cero imports externos), `@atlas/adapters` (`LedgerStore` en memoria y en fichero JSONL con escritura atómica, `Clock` de sistema) y `@atlas/cli` (`atlas`, parseo de argumentos a mano, tablas de texto, mensajes en español). Todo lo derivado se recalcula en una proyección pura `projectLedger(events)`: catálogo y configuración en orden del fichero, operaciones y seguimiento en **orden cronológico** `(fecha de negocio, posición)`; `reverseEvent`/`correctEvent` re-proyectan sin la pareja y rechazan listando los eventos que dejan de ser válidos. No hay decisiones fiscales nuevas: las tres dudas de `questions.md` (Q1-Q3) las resolvió el usuario y se implementan tal cual, cada una encapsulada en una función.

## Contexto técnico

**Lenguaje/Versión**: TypeScript 5.x sobre Node 22 (`.nvmrc`), ESM, `tsconfig` con `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `module`/`moduleResolution: NodeNext` (imports con extensión `.js`).

**Dependencias**: solo las de `docs/dependencies.md`. Runtime: `big.js` 7.0.1 **vendorizada** en `packages/domain/vendor/` (no es dependencia npm). Desarrollo (raíz): `typescript`, `@biomejs/biome`, `vitest`, `@vitest/coverage-v8`, `fast-check`, `@types/node`. `esbuild` y `vite` no se instalan todavía (no hay Lambda ni web). Ninguna dependencia en `apps/cli`.

**Almacenamiento**: fichero local `ledger.jsonl` (adaptador de fichero) y memoria (tests). S3 fuera de alcance.

**Tests**: `vitest` con cobertura v8; `fast-check` para propiedades. Umbral 100 % líneas/ramas/funciones/sentencias **solo** en `packages/domain/src`. Test de arquitectura: recorre `packages/domain/src` y falla ante cualquier `import`/`export from` que no sea relativo (o que apunte fuera de `src/` y `vendor/`) o que use `node:`.

**Plataforma**: Node 22 en local (CLI). El dominio es isomorfo (sin `node:*`, sin `fs`, sin `crypto` de Node): SHA-256 y ULID escritos a mano; zona horaria `Europe/Madrid` con `Intl.DateTimeFormat` (biblioteca estándar, disponible en Node y navegador).

**Tipo de proyecto**: monorepo de librerías + CLI.

**Objetivos de rendimiento**: irrelevantes a esta escala (miles de líneas, < 2 MB); la proyección completa debe tardar milisegundos, sin caché.

**Restricciones**: `domain` sin imports externos (test de arquitectura); numéricos como cadenas; sin `number` en importes; `append` nunca re-serializa; cargador rechaza `schema_version` futura; Biome limpio; commits atómicos validados por hook.

**Escala/alcance**: 19 tipos de evento, 11 proyecciones, 3 casos de uso, ~25 subcomandos de CLI.

## Comprobación de la constitución

| Principio | Cómo lo cumple este plan | Estado |
|---|---|---|
| I. Libro = fuente de verdad | Nada derivado se persiste; `projectLedger` recalcula todo en cada carga; la CLI muestra y confirma antes de escribir | ✅ |
| II. Lotes como proyección; fiscalidad del libro | `FiscalLot` solo existe en memoria; FIFO global por activo; `transfer` hereda fecha y coste; `fx_rate` BCE tal cual y `eur = amount / fx_rate`; `fiscal_date` derivada; rectificación de eventos consumidos rechazada | ✅ |
| III. Compartimentación | Validación `asset.book == account.book`; un `asset_id` en un solo libro; `buy` en `bucket` rechazado hasta la 002 (Q2) | ✅ |
| IV. Configurable | `fiscal_date_rule` y `wash_sale_window_days` en `Settings` con valores por defecto documentados y marcados "verificar"; ningún tipo impositivo en código | ✅ |
| V. Fallo seguro | Proyección lanza ante estado inválido; huella repetida = aviso con confirmación; sin fuentes de precios | ✅ |
| VI. 20 años | Cero deps en runtime; JSONL legible; `export` a JSONL/CSV; `big.js` vendorizada con hash y procedimiento de actualización | ✅ |
| VII. Tests primero | Casos límite obligatorios listados en `spec.md` con test propio; propiedades con `fast-check`; 100 % cobertura en `domain` bloqueante en CI | ✅ |
| Restricciones técnicas | TypeScript en todo; nada personal en fixtures (ids `acc_test`, ISINs inventados `XX0000000001`, importes redondos) | ✅ |
| Flujo de desarrollo | Rama `feature/001-ledger-core` desde `origin/develop`; hooks activados; Conventional Commits; PR a `develop` con plantilla | ✅ |

Sin violaciones que justificar. Re-evaluado tras el diseño (Fase 1): sin cambios.

## Estructura del proyecto

### Documentación (esta feature)

```text
specs/001-ledger-core/
├── spec.md              # Especificación
├── plan.md              # Este fichero
├── research.md          # Fase 0: decisiones de detalle y comparación con Beancount / Ghostfolio
├── data-model.md        # Fase 1: entidades, eventos, validaciones, estado proyectado
├── quickstart.md        # Fase 1: guía de verificación de extremo a extremo
├── contracts/
│   ├── ports.md         # Puertos, casos de uso, formato de línea
│   └── cli.md           # Comandos, flags, salida, códigos de salida
├── questions.md         # Dudas para el usuario (Q1-Q3 + incoherencias menores)
├── checklists/requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Código fuente (raíz del repositorio)

```text
.nvmrc                          # 22
package.json                    # workspaces, scripts raíz: lint, format, typecheck, test, test:coverage, build
package-lock.json
tsconfig.base.json              # opciones estrictas compartidas
tsconfig.json                   # referencias a los tres paquetes (tsc -b)
biome.json
vitest.config.ts                # proyectos por paquete; alias @atlas/* → src; cobertura solo domain
.github/workflows/ci.yml        # npm ci, lint, typecheck, test:coverage, audit, build

packages/domain/                # @atlas/domain — sin "dependencies"
├── package.json
├── tsconfig.json
├── vendor/
│   ├── big.js                  # 7.0.1, MIT, tal cual
│   ├── big.d.ts                # tipado mínimo propio
│   └── VENDOR.md               # origen, versión, SHA-256, licencia, procedimiento de actualización
├── src/
│   ├── index.ts                # API pública del paquete
│   ├── errors.ts               # DomainError, ValidationError, ProjectionError, ConflictError…
│   ├── money/                  # decimal.ts, money.ts, quantity.ts, price.ts, fx-rate.ts
│   ├── ids/                    # ulid.ts (monótono en proceso), sha256.ts (puro)
│   ├── dates/                  # civil-date.ts (YYYY-MM-DD), madrid.ts (recorded_at → fecha Europe/Madrid)
│   ├── schema/                 # envelope.ts, events.ts (tipos por type), validate.ts, fingerprint.ts,
│   │                           # line.ts (encode/decode), migrations/index.ts (migrate(line))
│   ├── settings/               # settings.ts (tipo + defaults), fiscal-date.ts
│   ├── projections/            # state.ts (LedgerState), project-ledger.ts (catálogo en orden de fichero, operaciones cronológicas),
│   │                           # catalogue.ts, settings-at.ts, positions.ts, cash.ts, pending.ts,
│   │                           # lots.ts (FIFO), gains.ts, income.ts, integrity.ts
│   ├── ports/                  # ledger-store.ts, clock.ts
│   └── usecases/               # record-event.ts, reverse-event.ts, correct-event.ts, project-ledger.ts
└── test/                       # espejo de src + architecture.test.ts + properties/ + fixtures/

packages/adapters/              # @atlas/adapters — depende de @atlas/domain
├── package.json, tsconfig.json
├── src/
│   ├── index.ts
│   ├── ledger-store/memory.ts, file.ts     # FileLedgerStore: etag = sha256 del contenido, append atómico
│   └── clock/system.ts
└── test/                       # contrato compartido ledger-store.contract.ts para ambos + tests de fichero

apps/cli/                       # @atlas/cli — depende de ambos, sin deps npm
├── package.json (bin: atlas → dist/src/main.js), tsconfig.json
├── src/
│   ├── main.ts                 # entrada; resuelve --ledger, compone store + clock, despacha
│   ├── args.ts                 # parser propio: posicionales + --flag valor + booleanos
│   ├── output/table.ts, output/messages.ts (español)
│   ├── confirm.ts              # readline; --yes
│   └── commands/               # account.ts, asset.ts, settings.ts, add.ts, order.ts, transfer.ts,
│                               # edit.ts, delete.ts, query.ts (positions, lots, cash, gains, income, check), export.ts
└── test/                       # tests de comandos con MemoryLedgerStore y salida capturada + 1 e2e con fichero temporal

tests/fixtures/ledger/          # libros sintéticos .jsonl (v1 válido, línea futura, sin \n final, vacío)
README.md                       # arranque en local y ejemplo de uso
```

**Decisión de estructura**: la fijada por ADR-0007 (`packages/domain`, `packages/adapters`, `apps/cli`); `apps/api`, `apps/web` e `infra/` no se crean. Los tests viven junto a cada paquete (`test/`), las fixtures de libros compartidas en `tests/fixtures/ledger/` (regla 7 de `CLAUDE.md`).

## Diseño (resumen; detalle en `data-model.md` y `contracts/`)

### Dinero (ADR-0005)

- `Decimal`: envoltorio inmutable sobre `Big` con `add/sub/mul/div/cmp/neg/isZero/isNegative/toString`. `Big.DP = 10`, `Big.RM = 1` (half-up) **solo** afectan a la división; suma, resta y producto son exactos. `parse()` acepta únicamente cadenas `^-?\d+(\.\d+)?$` (sin exponente, sin separadores, sin espacios); un `number` lanza.
- `Money = {amount: Decimal, currency}`; `add/sub` exigen misma divisa; `Quantity` adimensional; `Price = Money` por unidad; `FxRate = {rate, currency, date}` con `toEur(money)` = `money / rate` (10 decimales, ADR-0005 "derivados con 10 decimales"); rechaza si `money.currency !== rate.currency`; para EUR `rate = "1"`.
- `roundToCents()` half-up explícito, idempotente, solo se invoca en `realizedGains`/`investmentIncome` (salida) y en la CLI (presentación).

### Eventos y validación (`data-schema.md` §2-§6)

- `LedgerEvent = Envelope & (BuyEvent | SellEvent | … | ReversalEvent)` discriminado por `type`; `KNOWN_TYPES` incluye ya `corporate_action`, `thesis_opened`, `thesis_closed` como "reservados" (el cargador los conserva y la proyección los rechaza con mensaje claro hasta la 002) para que añadirlos no rompa el envoltorio.
- Dos capas: `validateShape(raw)` (campos, tipos, cadenas decimales, fechas, divisas; sin contexto) y validación **contextual** dentro de `projectLedger` (referencias, libros, `transferable`, posición suficiente, `reversal` de `reversal`, `thesis_id`).
- `fingerprint`: `sha256:` + hex del tuple canónico de §4 unido con `|`; el caso de uso lo calcula si el borrador no lo trae.
- `decodeLine(text)` valida el envoltorio, rechaza `schema_version > CURRENT` (`SchemaTooNewError`), aplica `migrate` y devuelve `{event, raw}`; `encodeLine(event)` serializa en una línea con claves en orden fijo. El adaptador de fichero conserva `raw` para nunca re-serializar.

### Proyección cronológica (`projections/project-ledger.ts`)

`projectLedger(events, options?) → LedgerState`:

1. **Pasada 0 (rectificación)**: índice `id → posición`, conjunto de `reverses_id`; valida que cada `reversal` apunta a un evento existente que no es `reversal` y que no está ya anulado. Las parejas anuladas se excluyen de todo lo que sigue.
2. **Pasada A (catálogo y configuración), en orden del fichero**: `account_*`, `asset_*`, `settings_changed`. Al terminar se resuelve `fiscalSettings = options.settings ?? último settings_changed ?? DEFAULT_SETTINGS` (Q3-a, encapsulado en `resolveFiscalSettings`). El catálogo no lleva fecha de negocio: crear hoy una cuenta y registrar operaciones de años anteriores es el caso normal al arrancar.
3. **Pasada B (operaciones y seguimiento), en orden cronológico**: `orderForProjection(events)` ordena de forma estable por `(fecha de negocio, posición en el fichero)` (Q1-b). Fecha de negocio (`data-schema.md` §7.1; en los eventos sin `trade_date` su `fiscal_date` es su única fecha): `fiscal_date` en `buy`/`sell` (derivada con `asset.type` y `fiscalSettings`), `value_date_out` en `transfer`, `value_date` en `dividend`/`interest`/`fx_exchange`/`cash_*`/`standalone_fee`, `date` en `valuation`/`order_updated`/`transfer_request_updated`, `requested_date` en `order_placed`/`transfer_requested`. La posición en el fichero desempata (también entre lotes de la misma fecha). Aplica cada evento sobre `positions`, `cash`, `lots` {open, closed}, `gains`, `income`, `orders`, `transferRequests`, `warnings`. Cualquier invariante roto lanza `ProjectionError {eventId, code, message}`; el `eventId` puede ser el de un evento posterior en fecha al recién registrado.
4. Modo `collectErrors`: en vez de lanzar, salta el evento, lo anota en `state.invalid[]` y continúa; lo usan `reverseEvent`/`correctEvent` para listar **todos** los afectados.
5. `settingsAt(date)` es una consulta sobre `settingsHistory` (`recorded_at` → fecha Madrid ≤ `date`).
6. Proyecciones con parámetro (`realizedGains(year)`, `investmentIncome(year)`, `integrity`) son funciones puras sobre `LedgerState`.

**FIFO** (`lots.ts`): por `asset_id`, lista de lotes abiertos ordenada por `(acquisition_date, posición del evento origen)`; `consume(assetId, qty, at)` parte el último lote si hace falta, devuelve `{lotId, quantity, costEur}` por lote y lanza si no hay cantidad suficiente. `buy` crea lote (`cost_eur = ((amount ?? q×p) + fee) / fx_rate`); `sell` consume y genera `RealizedGain` por lote con `proceeds_eur` proporcional; `transfer` fiscal consume y crea lotes destino con misma `acquisition_date`, coste heredado y `source_lot_id`; `transfer` de custodia no toca lotes.

### Casos de uso (`usecases/`)

Reciben los puertos por parámetro (`{store, clock}`), nunca los importan:

- `recordEvent(deps, draft, {confirmDuplicate?})`: `load` → proyecta lo existente → completa envoltorio (`ulid(clock)`, `recorded_at`, `schema_version`, `fingerprint`) → `validateShape` → `projectLedger([...events, event])` (lanza si inválido) → huella repetida sin confirmación → `DuplicateFingerprintError` (no escribe) → `append([event], etag)`. Devuelve `{event, warnings}` (p. ej. "activo en dos cuentas del mismo libro", "divisa del evento distinta de la del activo").
- `reverseEvent(deps, targetId, reason)`: proyecta sin la pareja en modo `collectErrors`; si hay inválidos → `DependentEventsError {affected[]}`; si no → `append([reversal])`. Devuelve también `priorYear` cuando la fecha de negocio del anulado es de un ejercicio anterior a `clock.now()`.
- `correctEvent(deps, targetId, replacementDraft, reason)`: como el anterior, con `[reversal, replacement{corrects_id}]` en un solo `append`.
- `projectLedger(deps)`: `load` + proyección; lo usan todas las consultas de la CLI.

### Adaptadores

- `MemoryLedgerStore`: array de `{event, raw}` + `etag` incremental; `append` con `etag` distinto → `ConflictError`.
- `FileLedgerStore(path)`: `load` lee el fichero (o lo trata como vacío si no existe), separa por `\n` (tolerando ausencia de `\n` final), `decodeLine` por línea (falla ante versión futura **antes** de devolver nada), `etag = sha256(bytes)`. `append`: relee bytes, compara hash con `etag` (→ `ConflictError`), escribe `bytes + (bytes sin '\n' final ? '\n' : '') + líneas nuevas` a `<path>.tmp-<ulid>`, `fsync`, `rename` sobre el destino. Los bytes previos se copian tal cual.
- `SystemClock`: `now()` → `Date`.

### CLI

Parser propio (`args.ts`): posicionales + `--flag valor` + booleanos (`--yes`, `--confirm-duplicate`). Cada comando construye un borrador, lo imprime como tabla clave/valor, pide confirmación (salvo `--yes`) y llama al caso de uso; errores del dominio → mensaje en español y código de salida 1; conflicto → 2; duplicado sin confirmar → 3. Detalle en `contracts/cli.md`.

## Seguimiento de complejidad

Sin violaciones de la constitución que justificar.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Cambio futuro de criterio en Q1-Q3 | Cada decisión está encapsulada: Q1 en `orderForProjection` (clave `(fecha de negocio, posición)`), Q2 en una validación de `buy`, Q3 en `resolveFiscalSettings` |
| 100 % de ramas en `domain` con `exactOptionalPropertyTypes` | Tests unitarios por módulo desde el principio; sin ramas defensivas inalcanzables (se prefieren tipos a `if`s) |
| SHA-256 y ULID propios con error sutil | Vectores de prueba conocidos (`sha256("")`, `sha256("abc")`, Crockford base32 de timestamps conocidos) y propiedad de monotonía |
| `big.js` 7.0.1 tipado a mano | `big.d.ts` cubre solo lo que usa `Decimal`; test de contrato de `Decimal` contra valores conocidos |
| `Intl` en `Europe/Madrid` con cambio de hora | Tests con instantes a ambos lados del cambio (marzo/octubre) y a las 22:00/23:00 UTC |
