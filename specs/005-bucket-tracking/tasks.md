---

description: "Lista de tareas de la feature 005-bucket-tracking"
---

# Tareas: Seguimiento del cubo especulativo y patrimonio total (`005-bucket-tracking`)

**Entrada**: documentos de diseño de `specs/005-bucket-tracking/`

**Prerrequisitos**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/domain.md`, `contracts/cli.md`, `quickstart.md`

**Tests**: obligatorios. La constitución VII exige 100 % de líneas y ramas en `packages/domain` (bloqueante en CI) y tests de propiedades donde un error cuesta dinero. Cada tarea de implementación lleva sus tests en el **mismo commit**, y `npm run lint` tiene que estar verde **antes de cada commit**, no solo al final.

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: se puede hacer en paralelo (ficheros distintos, sin dependencias pendientes)
- **[USn]**: historia de `spec.md` a la que pertenece
- Rutas relativas a la raíz del worktree `../atlas-portfolio-tracker-005`

## Convenciones de ruta

- Dominio: `packages/domain/src/…`, tests en `packages/domain/test/…`
- CLI: `apps/cli/src/…`, tests en `apps/cli/test/…`
- Fixtures compartidas: `tests/fixtures/ledger/`

---

## Fase 1: Preparación

**Propósito**: entorno listo y artefactos de Spec Kit congelados antes de tocar código.

- [x] T001 Worktree `../atlas-portfolio-tracker-005` y rama `feature/005-bucket-tracking` desde `origin/develop`, con `core.hooksPath=.githooks`, `nvm use` y `npm ci` (hecho)
- [x] T002 `git merge origin/develop` con el prompt revisado tras el tercer *challenge* y ADR-0018 (solo `docs/`, sin conflictos)
- [x] T003 Base verde de partida verificada: `npm run lint`, `npm run typecheck` y `npm test`
- [x] T004 Commit de los artefactos de Spec Kit en `specs/005-bucket-tracking/` con `docs(spec): add 005-bucket-tracking specification and plan` (visto bueno del usuario el 2026-09-18, con las respuestas a Q1-Q7)

---

## Fase 2: Historia 10 — Bloque 0 del tercer *challenge* (P1, ADR-0018) 🎯 va primero

**Objetivo**: que añadir un tipo de activo deje de ser un cambio rompedor, y que el tipo de cambio de una valoración sea reproducible.

**Prueba independiente**: una línea `settings_changed` sin `etf` sigue siendo válida y su lectura devuelve el valor por defecto; el *golden* **no cambia**.

**⚠️ Crítico**: el orden dentro de la fase importa. **T005 y T006 (mapas parciales y valores por defecto) van antes que T007 (`etf`)**: al revés, habría un commit intermedio en el que toda `settings_changed` ya escrita sería inválida, que es justo el fallo que ADR-0018 cierra.

- [ ] T005 [US10] Mapas parciales en `packages/domain/src/settings/settings.ts`: `Partial<Record<AssetType, …>>` en `fiscal_date_rule`, `wash_sale_window` y `wash_sale_window_days`, constantes `DEFAULT_FISCAL_DATE_RULE` y `DEFAULT_WASH_SALE_WINDOW`, `validateSettings` tolerante a la ausencia y estricta con el valor presente, `normalizeSettings` sobre mapas parciales. Tests en `packages/domain/test/settings/settings.test.ts` (mapa vacío, mapa parcial, valor inválido presente, convivencia con la forma antigua)
- [ ] T006 [US10] Resolución del valor por defecto **en el punto de uso**: `fiscalDateOf` en `packages/domain/src/settings/fiscal-date.ts` y la lectura de la ventana; `settingsAt` completa los mapas al leer sin tocar `state.fiscalSettings` ni `state.settingsHistory`. Tests: tipo ausente ⇒ valor por defecto (no `value_date` por descarte), instantánea sin cambios
- [ ] T007 [US10] `"etf"` en `ASSET_TYPES` (`packages/domain/src/schema/events.ts`) y en los valores por defecto; tests de alta de un activo `etf`, su fecha fiscal y su ventana
- [ ] T008 [US10] Mapas explícitos en `packages/domain/src/synth/scenario.ts` (`settingsWith` deja de heredar los de `DEFAULT_SETTINGS`), para que el *golden* no cambie (plan D2)
- [ ] T009 [P] [US10] `fx_rate_date?` en `valuation`, `cash_deposit`, `cash_withdrawal` y `standalone_fee`: tipos en `events.ts`, reglas y `FX_DATE_FIELDS` en `packages/domain/src/schema/validate.ts`, flag `--fx-rate-date` en `apps/cli/src/commands/add.ts`. Tests: con fecha válida acepta, en sábado rechaza, sin campo acepta
- [ ] T010 [US10] **Comprobación de compatibilidad**: `npm test` verde **sin regenerar el *golden***; si `synthetic-v1.jsonl` o su instantánea cambian, se para y se investiga (decisión (i))

**Punto de control**: el esquema tolera un tipo de activo nuevo y el libro sigue siendo el mismo.

---

## Fase 3: Historia 11 — La puerta única de precios (P1, decisión (j))

**Objetivo**: un solo sitio decide qué precio tiene un activo en una fecha.

**Prueba independiente**: los tests de la Fase 2 (pesos, aportación, costes, simulador) pasan **sin tocarlos**; un test falla si otro módulo lee `state.valuations` para resolver un precio.

- [ ] T011 [US11] `priceAt(state, assetId, date, settings, external?)` y `ExternalPrices` en `packages/domain/src/projections/prices.ts`, con `origin` en el resultado y la precedencia **manual por delante de automático** escrita en su documentación; `manualPrices` pasa a construirse sobre ella. Tests: origen `manual`, precedencia con una fuente externa de juguete, ausencia ⇒ `undefined`
- [ ] T012 [US11] `weights.ts`, `contribution.ts`, `simulate-transfer.ts` y `costs.ts` piden el precio a la puerta; sus tests pasan sin modificarse
- [ ] T013 [P] [US11] Test de la puerta única en `tests/architecture.test.ts`: ningún fichero de `packages/domain/src` distinto de `prices.ts` y `valuations.ts` menciona `state.valuations` (la excepción, escrita en el propio test)

**Punto de control**: la Fase 4 podrá añadir precios automáticos tocando un solo fichero.

---

## Fase 4: Historia 9 (primera mitad) — El subflujo de PRNG del generador (P3 pero **bloqueante**)

**Objetivo**: que añadir eventos al escenario deje de rebarajar el libro entero.

**Prueba independiente**: un test graba un bloque en un subflujo y comprueba que las líneas anteriores son idénticas byte a byte.

**⚠️ Crítico**: va **antes** de tocar el escenario (prompt §3.8).

- [ ] T014 [US9] `deriveSeed(seed, label)` en `packages/domain/src/synth/random.ts` (FNV-1a del *label* mezclado con la semilla). Tests: determinista, distinto por *label*
- [ ] T015 [US9] `stream(label)` y `stateAsOf(date)` en `packages/domain/src/synth/builder.ts`: `Prng`, generador de ULID y reloj propios, grabando en el mismo array de eventos (plan D12). Tests en `packages/domain/test/synth/builder.test.ts`
- [ ] T016 [US9] **Test del mecanismo**: grabar un bloque en un subflujo sobre un escenario de juguete y exigir que los eventos previos conserven id, `recorded_at` y campos, byte a byte

**Punto de control**: el escenario ya se puede ampliar sin destruir el diff.

---

## Fase 5: Fundamentos de las proyecciones (bloqueantes)

**Propósito**: lo que las historias 2, 3, 4 y 7 necesitan. Ninguna empieza antes.

- [ ] T017 [P] [US4] `fxRates` (último tipo conocido por divisa) en `packages/domain/src/projections/state.ts` y su registro en `operations.ts`, `primitives.ts` y el resto de eventos con par divisa/tipo; **no** entra en `snapshotOf`. Tests: último gana, `fx_rate_date` cuando está y fecha de negocio cuando no, instantánea sin cambios
- [ ] T018 [P] [US3] Tramos de tesis (`ThesisLeg`) en `state.ts` y `theses.ts` (`linkBuy`/`linkSell` guardan fecha fiscal, cantidad, importe y comisión); `snapshotOf` sigue serializando solo los ids. Tests: instantánea del *golden* sin cambios, tramos completos
- [ ] T019 [P] [US7] `addMonths` y `addYears` con fin de mes en `packages/domain/src/dates/civil-date.ts`. Tests: 31-01 + 1 mes, 29-02 + 1 año, cambios de año, valores negativos no admitidos

**Punto de control**: fundamentos listos.

---

## Fase 6: Historia 2 — Posiciones abiertas del cubo (P1)

**Objetivo**: ver cada posición viva con su P&L latente y su condición de invalidación.

**Prueba independiente**: `bucketPositions` sobre el libro sintético lista las posiciones del cubo; sin precio, la fila sigue y el P&L queda sin dato.

- [ ] T020 [US2] `bucketPositions` en `packages/domain/src/projections/bucket.ts`: coste medio desde los lotes abiertos (`state.lots`, nunca `lots.ts`), precio por la puerta, valor, P&L latente en EUR y %, tesis abierta con días, plazo y invalidación
- [ ] T021 [US2] Casos límite en `packages/domain/test/projections/bucket.test.ts`: sin precio (fila presente, P&L sin dato, `missing_prices`, parcial), precio caducado, posición sin tesis, activo del núcleo excluido, fecha pasada con `asOf`, dos cuentas del cubo con el mismo activo

**Punto de control**: la vista de posiciones existe en el dominio.

---

## Fase 7: Historia 4 — Patrimonio total (P1)

**Objetivo**: el patrimonio siempre desglosado, con el efectivo convertido y fechado.

**Prueba independiente**: `atlas networth --date D` imprime los tres bloques y el total; con una divisa sin tipo, sale "sin convertir" y el total parcial.

- [ ] T022 [US4] `netWorth` en `packages/domain/src/projections/networth.ts`: núcleo (`coreWeights`), cubo (`bucketPositions`) y efectivo por cuenta y divisa con tipo, fecha, antigüedad y `stale`; parcialidad y listas de lo que falta
- [ ] T023 [US4] Tests en `packages/domain/test/projections/networth.test.ts`: divisa sin tipo, tipo caducado, activo sin precio, cubo vacío, saldo cero, fecha pasada, y que los tres bloques existan siempre
- [ ] T024 [US4] `atlas networth [--date] [--json]` en `apps/cli/src/commands/bucket.ts` + registro en `main.ts` y `USAGE`; tests en `apps/cli/test/commands/networth.test.ts`

**Punto de control**: la regla 18 ya tiene denominador.

---

## Fase 8: Historia 1 — Índice de referencia configurable (P1)

**Objetivo**: poder nombrar el índice y que su ausencia sea visible.

**Prueba independiente**: `atlas settings set --bucket-benchmark-asset ast_world` lo escribe; sin él, las comparaciones salen "sin dato".

- [ ] T025 [P] [US1] `bucket_benchmark_asset_id?` en `Settings` y su validación de forma (cadena no vacía); tests en `settings.test.ts`
- [ ] T026 [P] [US1] `--bucket-benchmark-asset` en `atlas settings set` (`apps/cli/src/commands/catalogue.ts`); test en `apps/cli/test/commands/settings.test.ts`

---

## Fase 9: Historia 3 — Tesis frente al índice (P1, regla 16)

**Objetivo**: la métrica que da sentido al cubo.

**Prueba independiente**: con índice valorado, cada tesis muestra su equivalente y su resultado frente al índice; sin un precio, las dos cifras desaparecen y se dice cuál falta.

- [ ] T027 [US3] `bucketTheses` en `packages/domain/src/projections/bucket.ts`: P&L latente de la posición viva, `benchmark_equivalent_eur`, `result_vs_index_eur` y `missing_benchmark[]` con su motivo
- [ ] T028 [US3] Casos límite: sin índice configurado, índice inexistente, índice sin valoraciones, compra anterior a la primera valoración, tesis sin compras enlazadas, tesis abierta sin precio del activo, tesis cerrada con posición viva
- [ ] T029 [P] [US3] Propiedades en `packages/domain/test/properties/bucket.test.ts`: `result_vs_index_eur` = 0 con rendimientos idénticos; P&L latente + resultado realizado = (valor + cobros) − coste

**Punto de control**: la regla 16 está implementada y probada.

---

## Fase 10: Historia 5 — Estadísticas de operativa (P2)

**Objetivo**: saber si esto se le da bien, sin promediar números contaminados.

**Prueba independiente**: `bucketStats` sobre el libro sintético devuelve las métricas y las exclusiones; sobre un cubo vacío, nada de divisiones por cero.

- [ ] T030 [US5] `bucketStats` en `packages/domain/src/projections/bucket-stats.ts`: contadores, tasa de acierto, medias, esperanza, comisiones sobre capital operado, máxima caída con pico y valle, agregado frente al índice
- [ ] T031 [US5] Detección de **tesis contaminadas** subiendo por `source_lot_id` hasta la raíz del lote (plan D8); exclusión de las medias y lista de excluidas con su motivo
- [ ] T032 [US5] Casos límite: cubo sin operaciones, una sola tesis cerrada, todas con pérdida (ganancia media sin dato), tesis con resultado cero, capital operado cero, máxima caída sin ventas
- [ ] T033 [P] [US5] Propiedades: máxima caída ≥ 0 y = 0 sin pérdidas; tasa de acierto en `[0,1]`; esperanza = media ponderada de ganancia y pérdida

---

## Fase 11: Historia 6 — Reglas de control (P2, reglas 17 y 18)

**Objetivo**: avisar antes de que el cubo crezca más de lo previsto, sin bloquear nada.

**Prueba independiente**: con los tres umbrales configurados, los avisos salen; sin ellos, no sale ninguno.

- [ ] T034 [US6] Controles en `bucket-stats.ts`: aporte **bruto** y neto, presupuesto previsto, pérdida acumulada, peso sobre el patrimonio, y los cuatro avisos en la estructura devuelta (nunca en `state.warnings`)
- [ ] T035 [US6] Casos límite: umbral ausente, umbral exactamente en el límite, aporte cero, patrimonio parcial (peso sin dato, sin aviso), retirada que no devuelve margen
- [ ] T036 [P] [US6] Test de que `state.warnings` del libro sintético no contiene ningún código `bucket_*` (garantía G11)

---

## Fase 12: Historia 7 — Aviso de recompra (P1, regla de los dos meses)

**Objetivo**: avisar de la recompra que difiere una pérdida, en los dos libros.

**Prueba independiente**: recompra el último día de la ventana avisa; al día siguiente, no.

- [ ] T037 [US7] `washSaleWindowOf` y `washSaleWindowEnd` en `packages/domain/src/settings/wash-sale.ts`; tests de las tres formas (`2m`, `1y`, `<n>d`) y del fin de mes
- [ ] T038 [US7] Los **dos** avisos en `packages/domain/src/projections/wash-sale.ts`: `wash_sale_window_repurchase` desde `applyBuy` (con `sale_event_id`, cantidad, pérdida y `window_end`) y `wash_sale_window_prior_buy` desde `applySell` cuando la venta tiene pérdida (con `buy_event_id`, cantidad y `window_start`); corrección del comentario obsoleto de `gains.ts` ("feature 005" → "Fase 5")
- [ ] T039 [US7] Casos límite en las dos direcciones: último día y el siguiente hacia delante, primer día y el anterior hacia atrás, fondo (un año) y acción (dos meses), 31 de enero más un mes, año bisiesto, venta con ganancia (no avisa), operación en el núcleo y en el cubo
- [ ] T040 [US7] Traducción al español de los dos avisos en `apps/cli/src/output/messages.ts` y comprobación de que sale en `atlas check` y en la vista previa de `atlas add buy`

---

## Fase 13: Historia 12 — Aviso de ejercicio movido (P2, §3.5 bis)

**Objetivo**: que un cambio de configuración no mueva una Renta pasada en silencio.

**Prueba independiente**: cambiar `fiscal_date_rule` del tipo de un activo con una venta del 30/12 lista el ejercicio afectado con las dos cifras.

- [ ] T041 [US12] `movedFiscalYears(events, current, next, currentYear)` en `packages/domain/src/projections/settings-impact.ts`; tests: ejercicio que se mueve, ejercicio en curso (no se lista), cambio inocuo (lista vacía)
- [ ] T042 [US12] Integración en `atlas settings set` junto al aviso de umbral silenciado, con confirmación y `--yes`; tests en `apps/cli/test/commands/settings.test.ts`

---

## Fase 14: Historia 8 — La vista del cubo en la CLI (P2)

**Objetivo**: verlo todo en un comando.

**Prueba independiente**: `atlas bucket --json` devuelve las cuatro secciones con `invalid_count`; `atlas thesis show th_alpha` imprime la ficha.

- [ ] T043 [US8] `atlas bucket [--date] [--json]` en `apps/cli/src/commands/bucket.ts`, con las comisiones sobre capital operado **destacadas** y el aviso de parada arriba
- [ ] T044 [US8] `atlas thesis show <id> [--date]` en `apps/cli/src/commands/thesis.ts`; `thesis list` con columnas nuevas, `--date` (y `--at` como error de uso que remite al nuevo) y proyección con `asOf`
- [ ] T045 [P] [US8] Aviso destacado de la regla de parada en `atlas add buy` sobre cuenta del cubo (`apps/cli/src/commands/add.ts`)
- [ ] T046 [P] [US8] Traducciones de los avisos nuevos en `apps/cli/src/output/messages.ts` (todos en español, por `code`) y actualización de `USAGE` y del texto de `atlas costs` que anunciaba esta feature
- [ ] T047 [US8] Tests de CLI: modo degradado, `--json` con sobre, `--date` inválida (error de uso), `thesis show` con id inexistente, libro sin ninguna posición del cubo

---

## Fase 15: Historia 9 (segunda mitad) — Escenario ampliado y *golden* regenerado (P3)

**Objetivo**: un libro sintético que ejercite todo lo anterior, con un diff revisable.

**Prueba independiente**: `atlas synth --seed 1` reproduce el *golden* byte a byte y `atlas check --deep` está limpio.

- [ ] T048 [US9] `bucket_benchmark_asset_id: "ast_world"` en `settingsWith` y valoraciones semestrales del índice desde antes del primer evento del cubo, grabadas en un subflujo con `stateAsOf` para la cantidad
- [ ] T049 [US9] Activos `ast_delta` y `ast_epsilon` (cubo, EUR), sus depósitos, cuatro tesis cerradas nuevas (una con dos compras en fechas distintas; dos con pérdida), una tesis abierta nueva y la **recompra dentro de la ventana** tras la venta con pérdida — todo en subflujos
- [ ] T050 [US9] `fx_rate_date` en las valoraciones en divisa del escenario
- [ ] T051 [US9] `SYNTHETIC_EXPECTED_WARNINGS` gana `wash_sale_window_repurchase`; invariantes y tests del generador actualizados (número de activos, fechas de valoración, tesis por estado)
- [ ] T052 [US9] Script de comparación en el *scratchpad*: agrupa por tipo de evento las diferencias entre el *golden* anterior y el nuevo; se ejecuta **antes** de congelar
- [ ] T053 [US9] Regenerar `tests/fixtures/ledger/synthetic-v1.jsonl` y `synthetic-v1.snapshot.json` con la CLI compilada, en **commit propio** cuyo mensaje enumere **todas** las diferencias verificadas (líneas añadidas, `bucket_benchmark_asset_id` en las tres configuraciones, `fx_rate_date` en las valoraciones en divisa, avisos de recompra en la instantánea)

**Punto de control**: batería verde y *golden* congelado de nuevo.

---

## Fase 16: Pulido y cierre

- [ ] T054 [P] Test de arquitectura ampliado en `tests/architecture.test.ts`: informativos sin importar módulos fiscales y fiscales sin importar precios ni proyecciones del cubo (incluidos `operations.ts` y `theses.ts`)
- [ ] T055 [P] Exports nuevos en `packages/domain/src/index.ts`, sin publicar fontanería interna (lección de la 004)
- [ ] T056 [P] Sección breve de la Fase 3 en `README.md` con el ejemplo `thesis open` → `add buy` → `bucket`
- [ ] T057 Ejecutar `quickstart.md` a mano con el binario compilado sobre el *golden* regenerado y anotar las desviaciones en `questions.md`
- [ ] T058 `npm run clean && npm run build`, `lint`, `typecheck`, `test:coverage` (100 % en `packages/domain`) y `atlas check --deep` limpio
- [ ] T059 PR a `develop` con la plantilla y la checklist de la constitución rellena con honestidad. **No fusionar**: la dirección revisa y fusiona

---

## Dependencias y orden de ejecución

- **Fase 1** → **Fase 2 (bloque 0)** → **Fase 3 (puerta de precios)** → **Fase 4 (subflujo PRNG)**: las cuatro son secuenciales y bloquean todo lo demás. El bloque 0 va primero porque toca `Settings`; la puerta de precios, antes de añadir consumidores; el subflujo, antes de tocar el escenario.
- **Fase 5** (fundamentos) bloquea las historias 2, 3, 4 y 7.
- **Fase 6 (US2)** → **Fase 7 (US4)**: `netWorth` usa `bucketPositions` para el bloque del cubo.
- **Fase 8 (US1)** → **Fase 9 (US3)**: sin el parámetro no hay comparación que probar.
- **Fase 9 (US3)** → **Fase 10 (US5)** → **Fase 11 (US6)**: las estadísticas agregan el resultado frente al índice y los controles usan la pérdida latente y el patrimonio.
- **Fase 12 (US7)** y **Fase 13 (US12)** son independientes entre sí y de las anteriores, salvo por la aritmética de calendario (T019).
- **Fase 14 (CLI)** depende de todas las proyecciones.
- **Fase 15** va al final: el escenario ejercita lo ya implementado y el *golden* se congela una sola vez.

### Paralelismo posible

- T009 con T005-T008 (ficheros distintos).
- T017, T018 y T019 entre sí.
- T025 y T026 entre sí.
- T029, T033, T036, T045, T046, T054, T055 y T056 con lo que haya alrededor.

## Notas

- **Commits atómicos**, Conventional Commits en inglés, una línea de asunto; el hook valida. `npm run lint` verde **antes de cada commit**.
- Ningún commit de código antes del visto bueno del usuario sobre `spec.md` y `plan.md` (T004).
- Los mensajes del dominio van en **inglés**; la CLI los traduce por su `code`.
- Toda vista con `--date` proyecta con `asOf` (ADR-0016): es el defecto que la revisión de la 004 corrigió y esta feature multiplica.
- Si algo del prompt choca con el código, va a `questions.md`; no se toca `docs/`.
