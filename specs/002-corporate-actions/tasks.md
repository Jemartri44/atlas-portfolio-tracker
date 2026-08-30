# Tareas: Eventos corporativos y tesis del cubo (`002-corporate-actions`)

**Entrada**: `specs/002-corporate-actions/` (`spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, `questions.md`)

**Tests**: obligatorios (constitución VII): cada tarea de código lleva sus tests en la misma tarea; `packages/domain` al 100 % de cobertura antes de cada commit.

**Commits**: un commit por tarea, Conventional Commits en inglés, una línea. Antes de cada commit: `npm run lint && npm run typecheck && npm run test:coverage`.

**Organización**: por historia de usuario (`spec.md`), tras una fase común de esquema. Orden global: esquema → tabla y primitivas → proyección → tesis → valoraciones → CLI → README.

## Formato: `[ID] [P?] [Historia?] Descripción con ruta`

- **[P]**: paralelizable (ficheros distintos, sin dependencia de tareas incompletas)
- **[US1..US4]**: historia de `spec.md` a la que sirve

## Fase 1: Esquema (bloqueante para todas las historias)

- [X] T001 Tipos de los tres eventos y de los cinco efectos en `packages/domain/src/schema/events.ts` (`CORPORATE_ACTION_KINDS`, `EFFECT_OPS`, `CorporateActionEvent`, `Effect` y sus cinco interfaces, `ThesisOpenedEvent`, `ThesisClosedEvent`, `sell.thesis_id?`), `packages/domain/src/schema/envelope.ts` (los tres tipos a `SUPPORTED_EVENT_TYPES`; `RESERVED_EVENT_TYPES = []` conservando `isReservedEventType`) y muestras en `packages/domain/test/samples.ts`; ajustar `packages/domain/test/schema/envelope.test.ts` y los tests que usaban un tipo reservado (`validate`, `project-ledger`, `integrity`, `line`) a un tipo inventado — commit `feat(domain): add corporate action and thesis event types` (incluye T003: la muestra con huella lo exige)
- [X] T002 Validación de forma en `packages/domain/src/schema/validate.ts`: reglas `positive_integer` y `unit_interval`; `checkFields` con etiqueta para registros anidados; `EFFECT_RULES` por `op` y `PER_ACCOUNT` (`quantity` `"all"` o decimal > 0); reglas de `corporate_action`, `thesis_opened`, `thesis_closed`; tests en `packages/domain/test/schema/validate.test.ts` (un caso válido por tipo y por `op`, un inválido por regla: `kind` desconocido, `source_document` vacío, `effects` no array, `op` desconocido, `ratio` 0, `ratio` `"4/0"`, `"1.5/2"` y `"a/b"` (rechazados) frente a `"4/3"` (aceptado), `cost_share` 1.5, `per_account` vacío, `quantity` `"some"`, `fee` negativo, `unit_price` negativo, `expected_horizon_days` `"90"` y `0`, `planned_size_eur` `0`) — commit `feat(domain): validate corporate action effects and theses`
- [X] T003 [P] Huella de `corporate_action` en `packages/domain/src/schema/fingerprint.ts` con test en `packages/domain/test/schema/fingerprint.test.ts` (determinista; cambia con `kind` y `effective_date`; tesis sin huella) — commit `feat(domain): fingerprint corporate actions`
- [X] T004 [P] Constructores en `packages/domain/test/ledger-builder.ts` (`corporateAction()`, `thesisOpened()`, `thesisClosed()`, `sell` con `thesis_id`) y activo/cuenta extra del cubo en `catalogue()` si hace falta — commit `test(domain): build corporate actions and theses in the ledger builder`

**Punto de control**: `validateShape` acepta los tres tipos; `RESERVED_EVENT_TYPES` vacío; proyección todavía los rechaza (rama pendiente) — los tests de proyección que dependan de ello se ajustan en T008.

## Fase 2: Historia 1 — Eventos corporativos (P1) 🎯 MVP

**Objetivo**: `corporate_action` proyectado con las cinco primitivas y la tabla de composición; cada fila de §8.5 con su test numérico.

**Prueba independiente**: `packages/domain/test/projections/corporate-actions.test.ts` con las trece filas.

- [ ] T005 [US1] Tabla de composición `packages/domain/src/projections/kind-rules.ts` (`KIND_RULES`, `checkEffectsAgainstKind`, tipos `KindRule`/`Step`/`Target`) con tests `packages/domain/test/projections/kind-rules.test.ts`: cada fila acepta sus secuencias, rechaza una secuencia ajena, `delisting` rechaza efectos, `issuer_restructuring` rechaza vacío y `scale`, restricción de activo (`forced_sale` de `merger` sobre un tercer activo se rechaza; tras `convert` debe ser el nuevo) — commit `feat(domain): add corporate action composition table`
- [ ] T006 [US1] Ids de lote únicos por evento en `packages/domain/src/projections/lots.ts` (`state.lotCounts` en `state.ts`) con test en `packages/domain/test/projections/lots.test.ts` (dos activos, mismo evento → `#0` y `#1`; los ids de la 001 no cambian) — commit `refactor(domain): number lots per event across assets`
- [ ] T007 [US1] `Ratio` y `scaleQuantities` en `packages/domain/src/money/ratio.ts` (decimal o fracción de enteros; `apply` exacto o a 10 decimales; total una vez y resto al último) con tests `packages/domain/test/money/ratio.test.ts`: `30 × "4/3" = 40` exacto, `10 × "1/3" = 3.3333333333`, dos cantidades `[10, 7] × "1/3"` suman exactamente `17 × 1/3` redondeado con el resto en la última, `"4/0"` rechazado, propiedad de conservación de la suma — commit `feat(domain): add Ratio with exact remainder scaling`
- [ ] T008 [US1] Primitivas `packages/domain/src/projections/primitives.ts` (`applyScale`, `applyConvert`, `applyCarveOut`, `applyForcedSale`, `applyGrant`, `EffectContext`, reutilizando `consume`, `openLot`, `recordGain`, `adjustPosition`, `adjustCash`, `requireAvailable` extraído de `operations.ts`) con tests unitarios `packages/domain/test/projections/primitives.test.ts` por primitiva: lotes intactos en id/fecha/coste tras `scale`; `convert` cierra origen con consumición del evento y hereda posición de desempate y `source_lot_id`; `carve_out` suma exacta; `forced_sale` `"all"`, cuenta repetida, cuenta de otro libro, `quantity` > posición, comisión por cuenta, ganancia cero; `grant` a coste 0 sin tocar efectivo; `no_open_lots`, `same_asset`; `scale` con `"1/3"` sobre dos lotes y dos cuentas (resto al último lote y a la última cuenta, Σ lotes = Σ posiciones) — commit `feat(domain): add the five lot primitives`
- [ ] T009 [US1] Orquestación `packages/domain/src/projections/corporate-actions.ts` (`applyCorporateAction`: resolver `asset_id`, tabla, cobertura de liquidación, aplicar en orden) y rama en `packages/domain/src/projections/project-ledger.ts` (`businessDateOf` → `effective_date`, `recordUsage`, `applyOperation`, tipo `OperationEvent`); tests `packages/domain/test/projections/corporate-actions.test.ts` con las **trece filas de §8.5** (10 títulos, 1.000 €, 2027-01-10, resultado a céntimo) y los casos límite del prompt §3.7: contrasplit con picos en dos cuentas (10 y 7, 1:4), fusión con `forced_sale` + `convert` (secuencia de `raw`), escisión con picos, fusión de fondos 1,7, `fund_liquidation` en dos cuentas, `issuer_liquidation` a cero, `crypto_fork` a coste cero y venta posterior, `convert` sobre lotes de traspaso (fecha original dos veces), evento registrado tarde antes de ventas, `effects: []` en `split`, `forced_sale` que no cubre todas las cuentas en `fund_liquidation`, activo destino inexistente — commit `feat(domain): project corporate actions`
- [ ] T010 [US1] Propiedades `packages/domain/test/properties/corporate-actions.test.ts` (generador de eventos corporativos válidos sobre `ledgers.ts`): conservación de coste en `scale`/`convert`, reparto exacto de `carve_out`, `forced_sale` = `sell`, `scale(r)`·`scale(1/r)` identidad con `r ∈ {2,4,5,8,10}` e inversos, Σ lotes = Σ posiciones e `integrity` limpio, idempotencia de la proyección — commit `test(domain): corporate action invariants as properties`
- [ ] T011 [US1] Rectificación: en `packages/domain/test/usecases/rectify.test.ts`, `reversal` de un `corporate_action` cuyos lotes resultantes ya se vendieron (rechazo con lista) y `reversal` limpio de uno sin dependientes; `correctEvent` de un `corporate_action` (funciona a nivel de dominio; la CLI lo restringe) — commit `test(domain): cover reversal of corporate actions`

**Punto de control**: `integrity` limpio en un libro con eventos corporativos; cobertura 100 %.

## Fase 3: Historia 2 — Tesis del cubo (P1)

**Objetivo**: `thesis_opened`/`thesis_closed` en la pasada A', `buy`/`sell` del cubo validados, `theses(state, at)`.

**Prueba independiente**: `packages/domain/test/projections/theses.test.ts`.

- [ ] T012 [US2] Estado y aplicación de tesis en `packages/domain/src/projections/state.ts` (`Thesis`, `ThesisView`, `state.theses`) y `packages/domain/src/projections/theses.ts` (`applyThesisOpened`, `applyThesisClosed`, `requireOpenThesis`, `linkBuy`, `linkSell`, `thesisWarnings`, `theses`), con `daysBetween` reutilizado; tests `packages/domain/test/projections/theses.test.ts` (cuenta o activo fuera del cubo, `thesis_id` repetido, segunda abierta sobre el par, cerrar inexistente o cerrada, métricas: invertido, resultado exacto y redondeado, comisiones, posición, `days_open` con fechas Madrid) — commit `feat(domain): project bucket theses`
- [ ] T013 [US2] Integrar en `packages/domain/src/projections/project-ledger.ts` (pasada A' tras el catálogo; `thesisWarnings` al final; `recordUsage` de tesis) y `packages/domain/src/projections/operations.ts` (`applyBuy` exige tesis abierta anterior en el fichero en cuentas `bucket`, `applySell(state, event, position)` con `thesis_id?` y aviso `sell_without_thesis`, `logicalPositionOf` con `corrects_id`); tests en `packages/domain/test/projections/theses.test.ts` y `project-ledger.test.ts`: `buy` sin tesis, con tesis cerrada, de otro activo, de otra cuenta, inexistente, tesis posterior en el fichero (rechazos); `sell` con y sin tesis; `thesis_size_exceeded`; `thesis_closed_with_position` y su desaparición con una tesis nueva; `thesis_opened` antes que su `asset_created` en el fichero (válido); corrección de un `buy` tras cerrar su tesis (válido por `corrects_id`); eliminar el test de la 001 "buy en bucket rechazado por feature 002" — commit `feat(domain): require an open thesis for bucket buys and link sells`
- [ ] T014 [US2] Ampliar `packages/domain/test/properties/ledgers.ts` con una cuenta y un activo del cubo y tesis válidas para que las propiedades de la 001 (`projection.test.ts`, `correction.test.ts`) cubran también el cubo — commit `test(domain): cover the bucket in projection properties`

## Fase 4: Historia 4 — Valoraciones (P3, pequeña; va antes que la CLI porque la CLI la usa)

- [ ] T015 [P] [US4] `packages/domain/src/projections/valuations.ts` (`valuations(state, date)`, `ValuationAt`) con tests `packages/domain/test/projections/valuations.test.ts` (última por par, par sin foto anterior ausente, dos fotos el mismo día → posición en el fichero, `value_eur` a 10 decimales con `fx_rate` ≠ 1) — commit `feat(domain): add valuations(date) projection`
- [ ] T016 Exportar lo nuevo desde `packages/domain/src/index.ts` (tipos, `KIND_RULES`, `checkEffectsAgainstKind`, `theses`, `valuations`, `completeDraft`) y comprobar el test de arquitectura — commit `feat(domain): export corporate actions, theses and valuations`

## Fase 5: Historia 3 — CLI (P2)

**Objetivo**: `atlas ca <kind>`, `atlas thesis`, `atlas valuations`, `--thesis`, columna de origen, `edit` restringido.

**Prueba independiente**: `quickstart.md` escenarios 1-4.

- [ ] T017 [US3] Vista previa con candidato en `apps/cli/src/commands/shared.ts` (`previewCandidate`: `completeDraft` + `projectLedger([...events, candidato])` → `{before, after, gains}` de los activos afectados; tablas de `contracts/cli.md`) y helper `originOf(events, state, sourceEventId)` para la columna de origen — commit `feat(cli): preview a candidate event against the projected ledger`
- [ ] T018 [US3] `apps/cli/src/commands/corporate-actions.ts` (`split`, `reverse-split`, `merger`, `spin-off`, `fund-merger`, `share-class-change`, `fund-liquidation`, `delisting`, `raw`; cálculo de picos por cuenta proyectando el efecto principal; `--fees`; comprobación de activo destino con propuesta de `asset add`; propuesta de `asset update --inactive`; recordatorio del documento) y registro en `apps/cli/src/main.ts` (`ca`, `USAGE`); mensajes nuevos en `apps/cli/src/output/messages.ts`; tests `apps/cli/test/commands/corporate-actions.test.ts`: un test por asistente con el evento generado y la tabla antes/después (contrasplit con 10 y 7 en dos cuentas → `{acc_a: 0.5}`, `{acc_b: 0.75}`), `raw` con efectos inválidos → 1, destino inexistente → 1 con propuesta, `--fees` de cuenta ajena → 64, `--json` — commit `feat(cli): add corporate action wizards`
- [ ] T019 [US3] `apps/cli/src/commands/thesis.ts` (`open`, `close`, `list [--closed] [--at]`), `--thesis` en `apps/cli/src/commands/add.ts` (buy y sell), registro en `main.ts`; `apps/cli/test/harness.ts` con cuenta y activo del cubo en `seed()`; tests `apps/cli/test/commands/thesis.test.ts` (flujo abrir → comprar → vender → cerrar → listar; compra sin tesis → 1 con la regla 15; cierre con posición viva imprime el aviso) — commit `feat(cli): add thesis commands and --thesis on buy and sell`
- [ ] T020 [US3] `valuations` y columna `origen` en `apps/cli/src/commands/query.ts` (`lots`, `gains`), `edit` restringido en `apps/cli/src/commands/rectify.ts`; tests en `apps/cli/test/commands/query.test.ts` (origen `corporate_action:split` en lotes y `corporate_action:reverse_split` en ganancias; `valuations --date`) y `rectify.test.ts` (`edit` de un `corporate_action` → 64; `delete` de uno con dependientes → 1 con lista) — commit `feat(cli): show corporate action origins, valuations and restrict edit`
- [ ] T021 [US3] Extender `apps/cli/test/e2e.test.ts` con los escenarios 1 y 3 de `quickstart.md` sobre un fichero temporal — commit `test(cli): add corporate action and thesis end-to-end scenario`

## Fase 6: Cierre

- [ ] T022 Revisar cobertura (`npm run test:coverage` al 100 % en `domain`), `lint`, `typecheck`, `build`; commit solo si hay cambios
- [ ] T023 [P] README: sección "Eventos corporativos y tesis" con un ejemplo inventado (un split y una tesis) y los comandos nuevos en la lista de la CLI — commit `docs: document corporate actions and theses in the README`
- [ ] T024 [P] `specs/002-corporate-actions/questions.md`: notas de implementación y dudas nuevas; `checklists/requirements.md` con el estado final
- [ ] T025 Ejecutar `quickstart.md` a mano sobre `demo.jsonl` (sin comprometerlo) y anotar desviaciones en `questions.md`
- [ ] T026 Abrir la PR `feature/002-corporate-actions` → `develop` con `.github/pull_request_template.md`, checklist honesta, descripción en inglés; esperar CI. **No fusionar.**

## Dependencias

- Fase 1 → US1 → US2 → US4 → US3 → Cierre. T003 y T004 en paralelo tras T001; T015 en paralelo con T012-T014 (ficheros distintos); T023 y T024 en paralelo.
- T008 (primitivas) depende de T006 (ids de lote) y T007 (`Ratio`); de T005 solo en la orquestación (T009).
- La CLI (Fase 5) depende de T016 (exports).

## Estrategia

1. **MVP** = Fase 1 + US1: el libro ya cuadra con el bróker tras cualquier evento corporativo, sin CLI (se registra con `raw` en la Fase 5 o con el builder en tests).
2. US2 desbloquea el cubo; US4 es una tarde; US3 hace usable todo desde la terminal.
3. Cada tarea termina con `lint`, `typecheck` y `test:coverage` en verde y su commit; nunca se acumulan cambios entre tareas.
