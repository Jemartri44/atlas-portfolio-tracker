---

description: "Lista de tareas de la feature 004-monthly-contribution"
---

# Tareas: Aportación mensual, pesos del núcleo y correcciones del segundo *challenge* (`004-monthly-contribution`)

**Entrada**: documentos de diseño de `specs/004-monthly-contribution/`

**Prerrequisitos**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/domain.md`, `contracts/cli.md`, `quickstart.md`

**Tests**: obligatorios. La constitución VII exige 100 % de líneas y ramas en `packages/domain` (bloqueante en CI) y tests de propiedades para el reparto de la aportación (prioridad 4). Cada tarea de implementación lleva sus tests en el mismo commit.

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: se puede hacer en paralelo (ficheros distintos, sin dependencias pendientes)
- **[USn]**: historia de `spec.md` a la que pertenece
- Rutas relativas a la raíz del worktree `../atlas-portfolio-tracker-004`

## Convenciones de ruta

- Dominio: `packages/domain/src/…`, tests en `packages/domain/test/…`
- CLI: `apps/cli/src/…`, tests en `apps/cli/test/…`
- Fixtures compartidas: `tests/fixtures/ledger/`

---

## Fase 1: Preparación

**Propósito**: dejar el entorno y las utilidades transversales listas.

- [x] T001 Worktree `../atlas-portfolio-tracker-004` y rama `feature/004-monthly-contribution` desde `origin/develop`, con `core.hooksPath=.githooks`, `nvm use` y `npm ci` (hecho)
- [x] T002 Base verde de partida verificada: `lint`, `typecheck` y `test` (361 tests) (hecho)
- [x] T003 Fusionar `origin/develop` en la rama cuando la PR #22 esté fusionada (enmienda del prompt con las respuestas a Q1-Q3; solo documentos)
- [x] T004 Commit de los artefactos de Spec Kit en `specs/004-monthly-contribution/` con `docs(spec): add 004-monthly-contribution specification and plan`

---

## Fase 2: Fundamentos (bloqueantes)

**Propósito**: lo que todas las historias necesitan. Ninguna historia empieza antes de terminar esta fase.

**⚠️ Crítico**: T006 cambia `DEFAULT_SETTINGS`, que atraviesa todos los libros de test.

- [x] T005 [P] Añadir `isWeekend`, `daysBetween` y mover `addDays` desde `synth/calendar.ts` a `packages/domain/src/dates/civil-date.ts`, con sus tests en `packages/domain/test/dates/civil-date.test.ts` (años bisiestos, cambios de mes y de año, sábado y domingo, diferencia negativa) y ajuste de `synth/calendar.ts` para reexportar desde `dates/`
- [x] T006 `WashSaleWindow`, `wash_sale_window` y `normalizeSettings` en `packages/domain/src/settings/settings.ts`: validación del formato `2m|1y|<n>d`, aceptación de la forma antigua `wash_sale_window_days` como equivalente, precedencia de la nueva, `DEFAULT_SETTINGS` con `"2m"`/`"1y"`, y `target_weights` con valores no negativos. Tests en `packages/domain/test/settings/settings.test.ts` (las dos formas, conviviendo, ninguna, formato inválido, peso negativo, suma distinta de 100, idempotencia de `normalizeSettings`)
- [x] T007 Normalizar la configuración al proyectar en `packages/domain/src/projections/settings-at.ts` (`applySettingsChanged` guarda el `Settings` normalizado; la línea no se toca), con test en `packages/domain/test/projections/settings-at.test.ts`
- [x] T008 [P] Extraer `newlyInvalid(current, candidate)` de `checkCandidate` a `packages/domain/src/usecases/invalid-events.ts` y hacer que `rectify.ts` la use, sin cambiar su comportamiento observable (los tests de `rectify.test.ts` pasan sin tocarlos)
- [x] T009 [P] Helpers de consulta en `apps/cli/src/commands/shared.ts`: `loadForQuery(ctx)` (proyección con `collectErrors`), `degradedHeader(state)` e `insideGitWorktree(path)`; `render` acepta el estado para la cabecera y para `invalid_count`. Tests en `apps/cli/test/commands/shared.test.ts`

**Punto de control**: fundamentos listos; empiezan las historias.

---

## Fase 3: Historia 5 — Un libro que no admite datos imposibles (P2, bloque 0)

**Objetivo**: cerrar los cuatro huecos de validación del *challenge*.

**Prueba independiente**: cada regla tiene su caso de rechazo y su caso de aceptación en `validate.test.ts`.

- [x] T010 [US5] Tablas `FX_PAIRS` y `FX_DATE_FIELDS` y las comprobaciones `eur_fx_rate_not_one` y `fx_rate_date_weekend` en `packages/domain/src/schema/validate.ts`, aplicadas también a los efectos `forced_sale` y `grant` dentro de `checkEffects`
- [x] T011 [P] [US5] Test de cobertura de las tablas en `packages/domain/test/schema/validate.test.ts`: recorrer `RULES` y exigir que todo campo que empiece por `fx_rate` esté declarado en una de las dos tablas
- [x] T012 [P] [US5] Tests de las dos reglas en `packages/domain/test/schema/validate.test.ts`: EUR con `"1"` (acepta), con `"1.0000"` y con `"1.08"` (rechaza); `fx_exchange` con sus dos pares; sábado y domingo (rechaza), viernes y lunes (aceptan); efectos `forced_sale` y `grant`
- [x] T013 [US5] Quitar `fee` de las reglas de `transfer` y añadir el rechazo explícito `transfer_fee_not_allowed` con el mensaje que remite a `standalone_fee`, en `packages/domain/src/schema/validate.ts`; quitar `--fee` de `atlas add transfer` en `apps/cli/src/commands/add.ts` con el mismo mensaje. Tests en `validate.test.ts` y `apps/cli/test/commands/add.test.ts`
- [x] T014 [P] [US5] `source_country?` en `DividendEvent` (`packages/domain/src/schema/events.ts`), en sus reglas de `validate.ts` y como `--source-country` en `apps/cli/src/commands/add.ts`. Tests: `"US"` acepta, `"usa"` y `"Us"` rechazan, ausencia acepta; el campo llega al libro desde la CLI

**Punto de control**: el libro rechaza los cuatro datos imposibles. El *golden* actual todavía los viola: lo arregla la Fase 4.

---

## Fase 4: Historia 8 — El libro sintético al día (P3)

**Objetivo**: que el generador cumpla el bloque 0 y alimente la Fase 2; *golden* regenerado y congelado.

**Depende de**: Fase 3 (las validaciones nuevas) y T006 (la forma nueva de la ventana).

**Prueba independiente**: `atlas synth --seed 1` reproduce el *golden* byte a byte y `atlas check --deep` está limpio.

- [x] T015 [US8] `fx_rate_date` siempre en día laborable en `packages/domain/src/synth/scenario.ts`: helper que desplaza al viernes anterior la fecha de tipo de cambio cuando cae en fin de semana, aplicado a todas las fechas de tipo de cambio del escenario (compras, ventas, dividendos, intereses, `fx_exchange`, efectos corporativos)
- [x] T016 [US8] `settingsWith` en `packages/domain/src/synth/scenario.ts` con la forma nueva: `wash_sale_window`, `target_weights` por `asset_id` de activos `core` sumando exactamente 100, y `stale_price_days`, `deviation_threshold_pp`, `satellite_min_weight_pct`, `bucket_pct_of_contribution` y `monthly_contribution_eur` con valores que hacen calculables `weights` y `contribute`
- [x] T017 [P] [US8] `source_country` en el `dividend` en USD y ningún `fee` en los `transfer` del escenario, en `packages/domain/src/synth/scenario.ts`
- [x] T018 [US8] Invariantes nuevos del generador en `packages/domain/test/synth/properties.test.ts`: para cualquier semilla, ningún `fx_rate_date` en fin de semana, ningún evento en EUR con `fx_rate ≠ "1"`, `target_weights` por `asset_id` sumando 100, y `weights`/`contribute`/`costs` calculables a la fecha de la última valoración
- [x] T019 [US8] Regenerar `tests/fixtures/ledger/synthetic-v1.jsonl` y `synthetic-v1.snapshot.json` con la CLI compilada, **verificando antes** que las únicas diferencias frente al anterior son las declaradas (fechas laborables, `settings` nuevos, `source_country`, `transfer` sin `fee`), en **commit propio** con la justificación en el mensaje

**Punto de control**: batería verde de nuevo; el *golden* vuelve a estar congelado.

---

## Fase 5: Historia 3 — Consultar un libro degradado sin quedarse ciego (P1, bloque 0)

**Objetivo**: ninguna consulta se queda muda por un evento inválido; todas avisan.

**Prueba independiente**: con un evento inválido en el libro, `atlas positions` responde con cabecera y `atlas add buy` sigue rechazando.

- [x] T020 [US3] Pasar los comandos de solo lectura de `apps/cli/src/commands/query.ts` (`positions`, `lots`, `cash`, `gains`, `income`, `valuations`) a `loadForQuery` y a la cabecera de degradación
- [x] T021 [P] [US3] Ídem en `apps/cli/src/commands/catalogue.ts` (`account list`, `asset list`, `settings show`), `thesis.ts` (`thesis list`), `tracking.ts` (`order list`, `transfer pending`)
- [x] T022 [P] [US3] Ídem en `apps/cli/src/commands/export.ts`, con la cabecera al canal de error (A9)
- [x] T023 [US3] Tests en `apps/cli/test/commands/degraded.test.ts`: libro con un evento inválido ⇒ cada consulta responde, con cabecera en texto y `invalid_count` en `--json`; libro sano ⇒ sin cabecera y `invalid_count` 0; `export --format jsonl` no mezcla el aviso con los datos
- [x] T024 [US3] Test de exhaustividad en `apps/cli/test/commands/degraded.test.ts`: recorrer la tabla `COMMANDS` de `main.ts` y comprobar que todo comando de solo lectura pasa por `loadForQuery` (research §3)

**Punto de control**: el libro degradado se puede leer y, por tanto, reparar.

---

## Fase 6: Historia 4 — Cambiar la configuración sabiendo qué rompe y qué silencia (P1, bloque 0)

**Objetivo**: `settings_changed` es la única escritura admitida sobre un libro que queda con inválidos, y un umbral nunca silencia un aviso a espaldas del usuario.

**Prueba independiente**: `settings set --fiscal-date-rule fund=trade_date` se rechaza listando los eventos afectados; con `--accept-invalid` se escribe.

- [x] T025 [US4] `options.acceptInvalid` en `packages/domain/src/usecases/record-event.ts` usando `newlyInvalid` (T008): rechazo `accept_invalid_not_allowed` fuera de `settings_changed`; para el resto de eventos, rechazo si la proyección del candidato tiene algún inválido (mismo comportamiento observable que hoy); `RecordResult.newlyInvalid`
- [x] T026 [US4] `DependentEventsError` con `code` parametrizable (`dependent_events` | `newly_invalid_events`) en `packages/domain/src/errors.ts` y el mensaje correspondiente en `apps/cli/src/output/messages.ts`
- [x] T027 [P] [US4] Tests en `packages/domain/test/usecases/record-event.test.ts`: `settings_changed` que invalida el pasado sin el flag (rechazo con lista) y con él (escribe y devuelve `newlyInvalid`); libro ya degradado + `settings_changed` inocuo (acepta sin flag); libro ya degradado + mutación normal (rechaza); `acceptInvalid` en un `buy` (rechaza)
- [x] T028 [US4] `--accept-invalid`, `--target-weights` y `--wash-sale-window` en `atlas settings set` (`apps/cli/src/commands/catalogue.ts`), y `--wash-sale-window-days` retirado con error de uso que remite al nuevo
- [x] T029 [US4] Aviso de umbral silenciado en `atlas settings set`: evaluar los avisos de `coreWeights` con la configuración anterior y con la nueva, listar los que desaparecen y pedir confirmación (`--yes` la satisface); si faltan precios, decirlo y continuar. *Depende de T032 (`coreWeights`)*
- [x] T030 [P] [US4] Tests en `apps/cli/test/commands/settings.test.ts` de los cuatro flags, del rechazo con y sin `--accept-invalid` y del aviso silenciado (con precios y sin ellos)

**Punto de control**: la corrección del asesor fiscal se puede aplicar con un `settings_changed`, como promete ADR-0013.

---

## Fase 7: Historia 1 — Ver cómo está repartido el núcleo (P1)

**Objetivo**: `atlas weights` con precios manuales, antigüedad, desviaciones y avisos.

**Prueba independiente**: sobre el *golden*, `atlas weights --date <fecha con precios>` imprime la tabla completa; borrando una `valuation`, la fila pasa a "sin precio" y los pesos desaparecen.

- [x] T031 [US1] `manualPrices` en `packages/domain/src/projections/prices.ts` (última `valuation` por activo con `date ≤` la pedida, desempate por posición, `unit_value_eur` a 10 decimales, `age_days`, `stale`), con tests en `packages/domain/test/projections/prices.test.ts` (varias cuentas, empate de fecha, precio del futuro, sin `stale_price_days`, activo sin valoración)
- [x] T032 [US1] `coreWeights` en `packages/domain/src/projections/weights.ts`: universo de filas (posición > 0 o peso > 0), valor, pesos, desviaciones, subtotales por clase, `partial`, `missing_prices`, `stale_prices` y los cinco avisos
- [x] T033 [P] [US1] Tests de `coreWeights` en `packages/domain/test/projections/weights.test.ts`: fila sin posición con objetivo (valor cero, sin precio, sin parcialidad); activo con posición sin precio (parcial, pesos vacíos en todas las filas); activo del cubo ausente; `unknown_target_weight`; `asset_without_target`; desviación exactamente en el umbral (no avisa); satélite exactamente en el mínimo y a cero (no avisa); sin parámetros de umbral (no evalúa)
- [x] T034 [P] [US1] Propiedad en `packages/domain/test/properties/prices.test.ts`: barajar el orden de fichero de valoraciones de fechas distintas no cambia `manualPrices`; con fechas iguales manda la posición
- [x] T035 [US1] Comando `atlas weights` en `apps/cli/src/commands/portfolio.ts` (tabla, subtotales, marca `⚠`, avisos al pie, `--date`, `--json`, cabecera degradada) y registro en `main.ts` con su línea de `USAGE`
- [x] T036 [P] [US1] Tests del comando en `apps/cli/test/commands/portfolio.test.ts` (salida tabular, `--json`, fecha por defecto, libro vacío)

**Punto de control**: la pregunta "¿cómo está repartida la cartera?" tiene respuesta.

---

## Fase 8: Historia 2 — Repartir la aportación del mes (P1) 🎯 MVP de la Fase 2

**Objetivo**: `atlas contribute` con el reparto exacto al céntimo.

**Prueba independiente**: la suma de las asignaciones es exactamente el importe del núcleo y nada se escribe.

- [x] T037 [US2] `contributionPlan` en `packages/domain/src/projections/contribution.ts`: presupuesto del cubo, importe del núcleo, objetivo, déficit, las dos ramas de reparto, redondeo half-up una vez por activo, derrame del residuo (A6) y comprobación interna de los dos invariantes
- [x] T038 [US2] Rechazos de `contributionPlan` (`missing_target_weights`, `missing_bucket_pct`, `invalid_amount`, `missing_manual_prices` solo para activos con posición) y origen del importe (`--amount` o `monthly_contribution_eur`)
- [x] T039 [P] [US2] Casos límite en `packages/domain/test/projections/contribution.test.ts`: déficit cero (todo por pesos); un solo activo con déficit; aportación menor que un céntimo por activo; residuo de redondeo; activo con peso `"0"` y posición viva; activo con objetivo y sin posición; cubo al 0 % y al 100 %; `--amount 0`
- [x] T040 [P] [US2] Propiedades en `packages/domain/test/properties/contribution.test.ts` (`fast-check`): G4 (suma exacta), G5 (no negativas), G6 (nadie por encima del objetivo con `Σgap ≥ core`) y G7 (la desviación máxima no crece al aplicar la propuesta)
- [x] T041 [US2] Comando `atlas contribute` en `apps/cli/src/commands/portfolio.ts` (desglose, tabla, pesos resultantes, avisos, mensaje de que no se ha registrado nada) y registro en `main.ts`
- [x] T042 [P] [US2] Tests del comando en `apps/cli/test/commands/portfolio.test.ts`, incluido que el `etag` del libro no cambia (G9) y los mensajes de los cinco rechazos

**Punto de control**: el ciclo mensual funciona de punta a punta.

---

## Fase 9: Historia 6 — Simular un traspaso antes de darlo (P2)

- [x] T043 [US6] `simulateTransfer` en `packages/domain/src/projections/simulate-transfer.ts` (validaciones, `moved_eur`, `before`/`after`), con tests en `packages/domain/test/projections/simulate-transfer.test.ts` (activo no `core`, no `transferable`, mismo activo, inexistente, sin precio, cantidad mayor que la posición, `--all`)
- [x] T044 [US6] Subcomando `atlas transfer simulate` en `apps/cli/src/commands/tracking.ts` con la nota fiscal y `--json`, con tests en `apps/cli/test/commands/tracking.test.ts`

---

## Fase 10: Historia 7 — Cuánto cuesta la cartera (P2)

- [x] T045 [US7] `costSummary` en `packages/domain/src/projections/costs.ts`: comisiones por activo del núcleo (`buy`, `sell` y efectos `forced_sale`), porcentaje sobre lo invertido, TER, coste anual, agregado ponderado con marca de parcialidad, y totales por cuenta del cubo en su propia estructura
- [x] T046 [P] [US7] Tests en `packages/domain/test/projections/costs.test.ts`: comisión de un evento anulado que no cuenta; activo sin compras (porcentaje vacío); activo sin TER; agregado parcial; comisión de un `forced_sale`; ninguna fila ni total que mezcle libros
- [x] T047 [US7] Comando `atlas costs` en `apps/cli/src/commands/portfolio.ts` con las dos tablas separadas, con tests en `apps/cli/test/commands/portfolio.test.ts`

---

## Fase 11: Historia 9 — No escribir copias dentro del repositorio (P3, bloque 0)

- [x] T048 [US9] Confirmación en `atlas backup` (`apps/cli/src/commands/backup.ts`) y en `atlas export --out` (`apps/cli/src/commands/export.ts`) cuando `insideGitWorktree` encuentra un repositorio, con `--yes` como salida
- [x] T049 [P] [US9] Tests en `apps/cli/test/commands/backup.test.ts` y `export.test.ts`: destino dentro de un repo (pregunta), con `--yes` (escribe), respuesta negativa (no escribe), destino fuera (no pregunta), sin terminal y sin `--yes` (rechaza)

---

## Fase 12: Cierre

- [x] T050 [P] Exportar en `packages/domain/src/index.ts` los tipos y funciones nuevos (`ManualPrice`, `CoreWeights`, `ContributionPlan`, `TransferSimulation`, `CostSummary`, las cinco proyecciones, `normalizeSettings`, `newlyInvalid`, `isWeekend`, `daysBetween`, `addDays`)
- [x] T051 Test de arquitectura en `packages/domain/test/projections/architecture.test.ts` (G1): los módulos nuevos no importan `lots.ts`, `gains.ts`, `income.ts` ni `fiscal-date.ts`, y ningún módulo fiscal importa `prices.ts`
- [x] T052 Cobertura al 100 % de líneas y ramas en `packages/domain` (`npm run test:coverage`), cerrando las ramas que falten con casos de negocio reales
- [x] T053 [P] Sección de la Fase 2 en `README.md` con el ejemplo `weights` → `contribute` → `order place`
- [x] T054 Ejecutar `quickstart.md` a mano con el binario compilado y anotar el resultado y cualquier desviación en `questions.md`
- [x] T055 Notas de implementación en `specs/004-monthly-contribution/questions.md` (decisiones de detalle tomadas al implementar)
- [x] T056 `lint`, `typecheck`, `test:coverage` y `build` verdes; PR a `develop` con la plantilla y la checklist de la constitución rellena con honestidad

---

## Dependencias y orden de ejecución

### Entre fases

- **Fase 1 (preparación)** → sin dependencias. T003 espera a que la PR #22 se fusione.
- **Fase 2 (fundamentos)** → bloquea todo lo demás. T006 toca `DEFAULT_SETTINGS`, que atraviesa la batería entera.
- **Fase 3 (US5, validaciones)** → deja el *golden* actual inválido; la Fase 4 lo arregla **inmediatamente después**. Las dos van seguidas y sin dejar la batería roja entre commits de grupo.
- **Fase 4 (US8, generador y *golden*)** → depende de la 2 y la 3.
- **Fases 5 y 6 (US3 y US4)** → dependen de la 2; la 6 (T029) depende además de T032 (Fase 7), así que T029 se hace al llegar a la 7 o se deja para el final de la 6 tras adelantar T032.
- **Fases 7 a 11** → dependen de la 2; entre ellas son independientes salvo que la 8, la 9 y la 10 usan `manualPrices` y `coreWeights` de la 7.
- **Fase 12 (cierre)** → al final.

### Dentro de cada historia

Dominio antes que CLI; tests en el mismo commit que el código que cubren (la cobertura es bloqueante, no se acumula deuda).

### Oportunidades de paralelismo

- T005 y T008 y T009 (ficheros distintos, sin dependencias entre sí)
- T011, T012 y T014 dentro de la Fase 3
- T033 y T034 dentro de la Fase 7; T039 y T040 dentro de la Fase 8
- Las fases 9, 10 y 11 entre sí, una vez terminada la 7

---

## Estrategia de implementación

**Bloque 0 primero, como manda el prompt.** Fases 2 a 6 y 11 son el bloque 0 completo; a partir de ahí el libro ya está endurecido y el *golden* congelado de nuevo, y las historias de la Fase 2 se construyen sobre terreno firme.

**MVP de la Fase 2**: fases 7 y 8 (`weights` + `contribute`). Con eso el usuario ya tiene el ciclo mensual; el simulador, los costes y la copia protegida son incrementos.

**Commits**: atómicos, Conventional Commits en inglés, una línea de asunto. El *golden* regenerado (T019) va en un commit propio con su justificación, como exige el prompt §3.7.

---

## Desviaciones respecto al plan

- **T018** se partió: los invariantes de validación (fin de semana, EUR a `"1"`, pesos por `asset_id`) viven en `packages/domain/test/synth/invariants.ts` y corren para toda semilla y para el *golden*; la comprobación de que `weights`/`contribute`/`costs` son calculables se ejerce en el `quickstart.md` y en los tests de la CLI sobre el fichero regenerado, no como propiedad por semilla (proyectar las cinco proyecciones para veinte semillas no aporta sobre lo que ya cubren los tests unitarios y multiplicaría el tiempo de la batería).
- **T019** se completó en dos commits, no en uno: ver la nota 13 de `questions.md`.
- **T029** se hizo junto con T028 y T030, ya con `coreWeights` disponible (fase 7 adelantada a la 6 para ese punto).
- Se añadió, fuera de la lista: `lastWorkingDay` en `dates/civil-date.ts` (nota 7), la traducción al español de los códigos de error nuevos en `apps/cli/src/output/messages.ts`, y la inclusión en `atlas costs` de los activos que se tienen sin haber operado (nota 5).
