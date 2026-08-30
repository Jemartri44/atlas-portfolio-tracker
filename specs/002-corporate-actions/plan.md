# Plan de implementación: Eventos corporativos y tesis del cubo (`002-corporate-actions`)

**Rama**: `feature/002-corporate-actions` | **Fecha**: 2026-08-30 | **Spec**: [spec.md](spec.md)

**Entrada**: `spec.md`, `docs/prompts/002-corporate-actions.md` §3 y §6, ADR 0003, 0005, 0009, 0011, 0012, 0013, `docs/data-schema.md` §6.2, §6.4, §6.5, §7, §8.5, el código de `specs/001-ledger-core/` (`lots.ts`, `operations.ts`, `project-ledger.ts`, `validate.ts`, `envelope.ts`), `docs/dependencies.md`.

## Resumen

Tres bloques sobre el dominio de la 001, sin tocar el esquema ni añadir dependencias. (1) **Eventos corporativos**: tipos e interfaces de `corporate_action` y sus cinco efectos; validación de forma de los efectos anidados; una **tabla de composición como datos** (`KIND_RULES`) que la proyección consulta para aceptar o rechazar la secuencia; cinco funciones puras de primitiva (`applyScale`, `applyConvert`, `applyCarveOut`, `applyForcedSale`, `applyGrant`) que reutilizan `consume`, `openLot`, `recordGain`, `adjustPosition` y `adjustCash`; y una rama nueva en la pasada B con `effective_date` como fecha de negocio. (2) **Tesis**: proyección en la pasada A (tras el catálogo, en orden de fichero), validación de `buy`/`sell` del cubo contra la ventana "abierta antes en el fichero", acumuladores por tesis y la consulta `theses(state, at)`. (3) **`valuations(state, date)`** sobre `state.valuations`. La CLI añade `ca <kind>` con asistentes y tabla antes/después (proyectando el libro con el evento candidato antes de escribir), `thesis`, `valuations`, `--thesis` en `add` y la columna de origen en `lots`/`gains`. `RESERVED_EVENT_TYPES` queda vacío.

Nada fiscal ni estructural se decide aquí. La única duda de fondo (componente en efectivo de una fusión) está en `questions.md` Q1 con el supuesto provisional A1 del spec, encapsulado en el asistente `merger` de la CLI (el dominio no cambia sea cual sea la respuesta).

## Contexto técnico

**Lenguaje/Versión**: TypeScript 7.0.2 sobre Node 22 (`.nvmrc`), ESM, `tsconfig` estricto heredado de la 001 (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `NodeNext`).

**Dependencias**: ninguna nueva. `big.js` vendorizada; desarrollo: `typescript`, `@biomejs/biome`, `vitest`, `@vitest/coverage-v8`, `fast-check`, `@types/node`, ya instaladas.

**Almacenamiento**: sin cambios (`FileLedgerStore`, `MemoryLedgerStore`). `schema_version` sigue en 1: los tres tipos ya estaban reservados en el envoltorio; no hay migración.

**Tests**: `vitest` + `fast-check`; 100 % de líneas, ramas, funciones y sentencias en `packages/domain/src` (umbral existente); test de arquitectura existente.

**Plataforma**: Node 22 local (CLI). El dominio sigue isomorfo.

**Tipo de proyecto**: ampliación del monorepo de librerías + CLI.

**Objetivos de rendimiento**: irrelevantes a esta escala; la tabla antes/después proyecta el libro dos veces (con y sin el candidato), milisegundos.

**Restricciones**: `docs/` intocable; `domain` sin imports externos; numéricos como cadenas; no duplicar el FIFO; tabla de composición como datos; Biome limpio; commits atómicos.

**Escala/alcance**: 3 tipos de evento, 5 primitivas, 13 `kind`, 3 proyecciones nuevas (`theses`, `valuations`, más la aplicación de `corporate_action`), ~12 subcomandos de CLI.

## Comprobación de la constitución

| Principio | Cómo lo cumple este plan | Estado |
|---|---|---|
| I. Libro = fuente de verdad | Los efectos de un `corporate_action` son una proyección; nada derivado se persiste; `source_document` obligatorio; la CLI muestra evento y tabla antes/después y confirma | ✅ |
| II. Lotes como proyección; fiscalidad del libro | `convert`/`carve_out` conservan `acquisition_date` y coste (también tras un traspaso); `forced_sale` reutiliza el FIFO global y `recordGain`; `grant` con coste dado; ningún precio de mercado entra en el cálculo; `reversal` de un evento consumido se rechaza | ✅ |
| III. Compartimentación | Tesis solo en cuentas y activos `bucket`; `buy` en `bucket` exige tesis abierta anterior en el fichero; los activos destino de un efecto han de ser del mismo libro | ✅ |
| IV. Configurable | Ningún criterio fiscal en código: `cost_share`, coste del `grant`, precio de la `forced_sale` y `acquisition_date` son entradas; la tabla de composición es datos | ✅ |
| V. Fallo seguro | Efecto inválido → rechazo del evento completo; `valuations` nunca estima; avisos (no rechazos) donde el prompt lo fija | ✅ |
| VI. 20 años | Cero dependencias nuevas; el `kind` documenta para las personas y las cinco primitivas para el código: un `kind` nuevo es una fila | ✅ |
| VII. Tests primero | Cada fila de §8.5 con su test numérico; casos límite del prompt §3.7 con test propio; propiedades con `fast-check`; 100 % en `domain` | ✅ |
| Restricciones técnicas | TypeScript; fixtures sintéticas (ids `acc_*`, `ast_*`, importes redondos) | ✅ |
| Flujo de desarrollo | Worktree `../atlas-portfolio-tracker-002`, rama `feature/002-corporate-actions` desde `origin/develop` tras la PR #13; hooks activados; PR a `develop` | ✅ |

Sin violaciones que justificar. Re-evaluado tras el diseño (Fase 1): sin cambios.

## Estructura del proyecto

### Documentación (esta feature)

```text
specs/002-corporate-actions/
├── spec.md              # Especificación
├── plan.md              # Este fichero
├── research.md          # Fase 0: comparación con Portfolio Performance y decisiones de detalle
├── data-model.md        # Fase 1: tipos, validaciones, estado proyectado, tabla de composición
├── quickstart.md        # Fase 1: guía de verificación de extremo a extremo
├── contracts/
│   ├── domain.md        # Funciones puras nuevas, errores y avisos
│   └── cli.md           # Comandos, flags, salida
├── questions.md         # Q1 (fusión con efectivo) e incoherencias menores
├── checklists/requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Código fuente (ficheros nuevos o modificados)

```text
packages/domain/src/
├── schema/
│   ├── envelope.ts                 # M: los tres tipos pasan a SUPPORTED_EVENT_TYPES; RESERVED_EVENT_TYPES = []
│   ├── events.ts                   # M: CorporateActionEvent, Effect (5 interfaces), ThesisOpenedEvent, ThesisClosedEvent, sell.thesis_id?
│   ├── validate.ts                 # M: reglas de forma de los tres tipos; validación anidada de effects[] y per_account[]
│   └── fingerprint.ts              # M: tupla de corporate_action
├── projections/
│   ├── kind-rules.ts               # N: KIND_RULES (datos) + checkEffectsAgainstKind
│   ├── primitives.ts               # N: applyScale, applyConvert, applyCarveOut, applyForcedSale, applyGrant
│   ├── corporate-actions.ts        # N: applyCorporateAction (resuelve activos, valida la tabla, aplica en orden)
│   ├── theses.ts                   # N: applyThesisOpened/Closed, requireOpenThesis, linkBuy/linkSell, theses(state, at), thesisWarnings
│   ├── valuations.ts               # N: valuations(state, date)
│   ├── lots.ts                     # M: ids de lote únicos por evento en todo el libro (state.lotCounts)
│   ├── operations.ts               # M: applyBuy/applySell con tesis (position), retirada del rechazo provisional
│   ├── project-ledger.ts           # M: pasada A' (tesis), rama corporate_action, businessDateOf, recordUsage, avisos finales
│   └── state.ts                    # M: theses, lotCounts, tipos Thesis
├── usecases/record-event.ts        # sin cambios (completeDraft ya exportado); index.ts lo re-exporta para la CLI
└── index.ts                        # M: exporta lo nuevo

packages/domain/test/
├── ledger-builder.ts               # M: corporateAction(), thesisOpened(), thesisClosed()
├── samples.ts                      # M: muestras de los tres tipos
├── schema/{validate,fingerprint,envelope}.test.ts   # M
├── projections/kind-rules.test.ts  # N
├── projections/primitives.test.ts  # N: una describe por primitiva
├── projections/corporate-actions.test.ts  # N: 13 filas de §8.5 + casos límite del prompt §3.7
├── projections/theses.test.ts      # N
├── projections/valuations.test.ts  # N
├── properties/corporate-actions.test.ts  # N: propiedades del prompt §3.7
└── usecases/rectify.test.ts        # M: reversal de corporate_action con lotes vendidos

apps/cli/src/
├── main.ts                         # M: comandos ca, thesis, valuations; USAGE
├── commands/corporate-actions.ts   # N: asistentes por kind, raw, tabla antes/después
├── commands/thesis.ts              # N: open | close | list
├── commands/query.ts               # M: valuations; columna origen en lots y gains
├── commands/add.ts                 # M: --thesis en buy y sell
├── commands/rectify.ts             # M: edit rechaza corporate_action y tesis
├── commands/shared.ts              # M: previewCandidate (proyección con el candidato)
└── output/messages.ts              # M: mensajes de los códigos nuevos

apps/cli/test/commands/{corporate-actions,thesis}.test.ts   # N
apps/cli/test/commands/{query,add,rectify}.test.ts          # M
apps/cli/test/harness.ts            # M: seed con cuenta y activo del cubo
README.md                           # M: sección de eventos corporativos y tesis
```

**Decisión de estructura**: la de ADR-0007 y la 001. Las primitivas van en un módulo propio (`primitives.ts`) para que cada una sea una función pura testeable con propiedades; `corporate-actions.ts` solo orquesta (resuelve activos por defecto, consulta `KIND_RULES`, aplica en orden). La tabla vive en `kind-rules.ts` como constante exportada.

## Diseño (resumen; detalle en `data-model.md` y `contracts/`)

### Eventos y validación

- `SUPPORTED_EVENT_TYPES` incorpora `corporate_action`, `thesis_opened`, `thesis_closed`; `RESERVED_EVENT_TYPES` queda `[]` y `isReservedEventType` sigue existiendo (siempre `false`) para que la 003 pueda reservar tipos sin tocar el cargador ni la proyección.
- `validate.ts`: `checkFields` se generaliza para validar registros anidados con una etiqueta (`effects[1].per_account[0]`); reglas por `op` en `EFFECT_RULES`; `quantity` de `forced_sale.per_account` admite `"all"` o decimal positivo; `cost_share` en `[0, 1]`; `expected_horizon_days` con una regla nueva `positive_integer`; `effects` de `delisting` puede ser `[]` (la forma no conoce el `kind`; la tabla sí).
- `fingerprint.ts`: `corporate_action` → `["", "", "", asset_id, "corporate_action", effective_date, kind, "", ""]`.

### Tabla de composición (`kind-rules.ts`)

```ts
type Target = "event" | "previous";          // sobre qué activo actúa el paso
interface Step { op: EffectOp; asset: Target }
type KindRule =
  | { sequences: readonly (readonly Step[])[]; liquidation?: true }   // secuencias admitidas, exactas
  | { anyOf: readonly EffectOp[] };                                     // issuer_restructuring
export const KIND_RULES: Record<CorporateActionKind, KindRule>;
export const checkEffectsAgainstKind(kind, effects, eventAssetId): void   // lanza effects_not_allowed_for_kind
```

Una secuencia encaja si tiene la misma longitud, los mismos `op` en orden y cada paso actúa sobre el activo que su `Target` exige (`event` = el del evento; `previous` = `to_asset_id`/`asset_id` del paso anterior). `liquidation` añade la comprobación de cobertura ("all" en exactamente las cuentas con posición), que necesita el estado y se hace en `corporate-actions.ts`. Filas exactas en `data-model.md` §3.

### Primitivas (`primitives.ts`)

Cada función recibe `(state, effect resuelto, contexto {eventId, position, effectiveDate})`, valida y muta, como los `apply*` de `operations.ts`:

- `applyScale`: exige lotes abiertos; `lot.quantity = lot.quantity × ratio` y `original_quantity` intacta; por cuenta con posición, `adjustPosition(q × ratio − q)`.
- `applyConvert`: exige lotes abiertos y destino válido; `consume(state, from, openQuantity, eventId)` devuelve las rebanadas en FIFO (cierra todos los lotes con consumición del evento); por rebanada `openLot(to, {quantity × ratio, cost, acquisition_date, position: slice.position, source_lot_id})`; por cuenta con posición, `−q` en origen y `+q × ratio` en destino; aviso `same_asset_two_accounts`.
- `applyCarveOut`: por lote abierto del origen, `share = cost × cost_share`; `lot.cost_eur −= share`; `openLot(to, {quantity × ratio, share, fecha, position: lot.position, source_lot_id: lot.id})`; por cuenta, `+q × ratio` en destino.
- `applyForcedSale`: por entrada de `per_account` (cuentas únicas): `quantity = "all" ? positionOf : parse`; `requireAvailable` (mismo error que `sell`); proceeds = `quantity × unit_price − fee` en `currency`; `adjustCash`, `adjustPosition(−q)`, `consume`, `recordGain({fiscal_date: effectiveDate, account_id})`; avisos `currency_mismatch`, `fx_rate_date_after_fiscal_date`.
- `applyGrant`: por entrada: cuenta válida, `openLot({cost: q × unit_cost / fx_rate, acquisition_date, position: contexto.position})`, `adjustPosition(+q)`; no toca efectivo.

Lotes creados por `convert`/`carve_out` llevan la posición del evento origen del lote consumido (criterio del `001-review-fixes` punto 4); los de `grant`, la del `corporate_action`.

### Orquestación (`corporate-actions.ts`)

`applyCorporateAction(state, event, position)`: `requireAsset(event.asset_id)`; resuelve `asset_id` por defecto en cada efecto; `checkEffectsAgainstKind`; si la regla es de liquidación, comprueba cobertura; aplica los efectos en orden. Cualquier error aborta el evento entero (la proyección en modo `collectErrors` lo anota y sigue; el caso de uso lo rechaza sin escribir).

### Proyección (`project-ledger.ts`)

- `recordUsage`: `corporate_action` marca el activo del evento, los de los efectos y las cuentas de `per_account`; las tesis marcan su cuenta y activo (para que anular un `asset_created` referenciado se rechace).
- Pasada A: catálogo y configuración en orden de fichero (como hoy); después **pasada A'**: `thesis_opened`/`thesis_closed` en orden de fichero (`applyThesisOpened` valida libro `bucket`, unicidad e "una abierta por par"; `applyThesisClosed` exige abierta).
- Pasada B: `corporate_action` con fecha de negocio `effective_date`; `buy`/`sell` reciben `position` y consultan `requireOpenThesis(state, thesisId, account, asset, logicalPosition)` cuando la cuenta es `bucket` (`logicalPosition` = posición del `corrects_id` si existe, si no la propia; supuesto A6). `sell` sin `thesis_id` en `bucket` → aviso.
- Tras la pasada B: `thesisWarnings(state)` añade `thesis_closed_with_position` (supuesto A7).

### Tesis (`theses.ts`)

Estado por tesis (`data-model.md` §4) con acumuladores exactos (`invested_eur`, `fees_eur`, `result_eur`, cantidades). `linkBuy` suma coste y comisión y avisa `thesis_size_exceeded` cuando el acumulado supera `planned_size_eur`; `linkSell` suma `gain_eur` y comisión. `theses(state, at)` devuelve la vista con `result_eur_rounded`, `position` (física del par) y `days_open` (`daysBetween` de `pending.ts`).

### Valoraciones (`valuations.ts`)

`valuations(state, date)`: recorre `state.valuations` (ya en orden de pasada B, es decir `(date, posición)`), se queda con la última por par con `date ≤` la pedida y calcula `value_eur = quantity × unit_value / fx_rate`.

### Identificadores de lote (`lots.ts`)

`openLot` numera `<event_id>#<n>` con `n` contado por evento en todo el libro (`state.lotCounts`), no por activo: un `issuer_restructuring` puede crear lotes en dos activos con el mismo evento. Los libros de la 001 producen los mismos ids que antes.

### CLI

- `commands/corporate-actions.ts`: un constructor de borrador por asistente (`split`, `reverse-split`, `merger`, `spin-off`, `fund-merger`, `share-class-change`, `fund-liquidation`, `delisting`, `raw`); `reverse-split`/`merger`/`spin-off` con `--cash-per-share` calculan los picos por cuenta a partir de `physicalPositions` del estado proyectado con el resto de efectos aplicados (para `merger`/`spin-off`, sobre el activo nuevo tras el `convert`/`carve_out`); `--fees cuenta=importe,…` reparte comisiones. Antes de confirmar: `previewCandidate` completa el borrador con `completeDraft` (envoltorio provisional), proyecta `[...events, candidato]` y muestra la tabla antes/después de posiciones y lotes de los activos afectados y las ganancias generadas; luego `recordEvent` como siempre. Mensajes: recordatorio de copiar el documento; propuesta de `asset add` si falta el destino; propuesta de `asset update --inactive` tras un `convert` total.
- `commands/thesis.ts`: `open` (flags → `thesis_opened`), `close <id> --notes`, `list [--closed] [--at]` con tabla de métricas.
- `query.ts`: `valuations [--date]`; en `lots` y `gains`, columna `origen` = tipo del evento origen y, si es `corporate_action`, su `kind` (se resuelve con `state.positionOf` sobre la lista de eventos cargada).
- `add.ts`: flag `thesis` en `buy` y `sell`; `rectify.ts`: `editableFlags` rechaza los tres tipos con el mensaje del spec.

## Seguimiento de complejidad

Sin violaciones de la constitución que justificar.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Q1 (fusión con efectivo) se resuelve de otra forma | El dominio no cambia con (a); la decisión vive en el asistente `merger` de la CLI y en `raw`. Si se elige (b), es una primitiva nueva con ADR: fuera de esta feature |
| Semántica de "antes en el fichero" con rectificaciones | Encapsulada en `logicalPositionOf(state, event, position)` (supuesto A6); un test cubre corregir una compra tras cerrar su tesis |
| 100 % de ramas con validación anidada | Reglas como datos (`EFFECT_RULES`) y un test por regla; sin ramas defensivas inalcanzables |
| Duplicar lógica de `sell` en `forced_sale` | `applyForcedSale` comparte `requireAvailable`, `consume`, `recordGain`, `adjustCash`; la propiedad "`forced_sale` = `sell`" lo verifica |
| Tabla antes/después engañosa | Se calcula proyectando el libro real con el candidato (misma función que el caso de uso), no simulando aparte |
