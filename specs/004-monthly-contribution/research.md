# Investigación — feature 004-monthly-contribution

Decisiones de diseño tomadas al planificar, con la alternativa descartada. Nada de aquí cambia un documento de `docs/`; lo que sí lo cambiaría está en `questions.md`.

## 1. Comparación con Ghostfolio y Portfolio Performance (prompt §2.3)

Resumen y tablas en `plan.md`, sección *Investigación previa*. Fuentes leídas: el [manual de rebalanceo](https://help.portfolio-performance.info/en/getting-started/rebalancing/) y la [referencia de taxonomías](https://help.portfolio-performance.info/en/reference/view/taxonomies/using-taxonomies/) de Portfolio Performance, y el [repositorio](https://github.com/ghostfolio/ghostfolio) y la [regla de riesgo por clase de activo](https://github.com/ghostfolio/ghostfolio/pull/4128) de Ghostfolio. No se ha leído ni copiado código de ninguno de los dos.

Conclusión operativa: las tres cosas que ellos hacen y nosotros no (proponer ventas, traducir a número de títulos, varias taxonomías con reparto parcial) están **descartadas por reglas del plan**, no por falta de tiempo; conviene que quede escrito para que una revisión futura no las reintroduzca por parecerse a lo que hace todo el mundo.

## 2. Dónde vive el precio manual

**Decisión: proyección `manualPrices` sobre las `valuation` existentes** (decisión (b) del prompt).

- Descartado *evento nuevo `price`*: duplicaría `valuation`, obligaría a migrar el esquema y a decidir qué manda cuando los dos existen. El Nivel 2 de precios (`prices/<asset_id>.jsonl`, `data-schema.md` §1) llega en la Fase 4 y **no** es un evento del libro, así que tampoco se prepara nada aquí.
- Consecuencia aceptada: una `valuation` es a la vez foto para el Modelo 720 y precio informativo. Su `quantity` no interviene en el precio; solo `unit_value` y `fx_rate`. Una valoración registrada en una sola cuenta da precio al activo en todas.
- `valuations(date)` (la proyección de la 003) sigue devolviendo la última por **(cuenta, activo)**, porque el Modelo 720 se declara por cuenta; `manualPrices(date)` devuelve la última por **activo**. Son dos preguntas distintas sobre los mismos eventos y conviven sin tocarse.

## 3. Cómo se comparte el modo degradado entre 17 comandos

**Decisión: un helper único en `apps/cli/src/commands/shared.ts`** (`loadForQuery` + `render` con el estado), no un flag por comando.

- Descartado *repetir `{ collectErrors: true }` en cada comando*: 17 sitios donde olvidarse, y ningún test lo detectaría salvo escribiéndolo 17 veces.
- Descartado *que el dominio decida*: `loadAndProject` ya tiene `ProjectOptions`; el modo degradado es una política de presentación de la CLI (y mañana de la API y de la web), no del dominio. El dominio se limita a saber recolectar errores, que ya sabía.
- Un test de la CLI recorre la tabla de comandos de `main.ts` y comprueba que los de solo lectura pasan por el helper. Es la única forma barata de que un comando futuro no se olvide.

## 4. Comparación de conjuntos de inválidos: reutilizar `checkCandidate`

**Decisión: extraer de `rectify.ts` la parte "qué eventos pasan a ser inválidos" a una función compartida** y usarla desde `recordEvent`.

- ADR-0015 dice literalmente "espejo de `reverseEvent` con los dependientes". Tener dos implementaciones de la misma comparación es la forma segura de que diverjan.
- `DependentEventsError` ya transporta `affected[{id, type, error}]` y la CLI ya sabe imprimirla (`describeDependants`): no hace falta un error nuevo, solo un mensaje que hable de "eventos que pasan a ser inválidos" en vez de "eventos que lo consumían. La distinción la da el `code`.

## 5. Pares divisa/tipo declarativos en la validación

**Decisión: una tabla `FX_PAIRS` y otra `FX_DATE_FIELDS` por tipo de evento**, en vez de una comprobación escrita a mano dentro de cada regla de consistencia.

- Hay ocho tipos de evento con par divisa/tipo y dos efectos más; a mano son diez sitios donde olvidarse, y `fx_exchange` tiene **dos** pares.
- La tabla es además la documentación ejecutable de dónde hay tipos de cambio, que es justo lo que un lector futuro necesita para la Fase 5 (proyección de diferencias de cambio).
- Un test recorre `RULES` y comprueba que **todo** campo cuyo nombre empiece por `fx_rate` está cubierto por una de las dos tablas: así, un evento nuevo con tipo de cambio no puede colarse sin validación.

## 6. Aritmética de fecha civil

**Decisión: `isWeekend` y `daysBetween` en `packages/domain/src/dates/civil-date.ts`**, calculadas sobre la fecha civil sin zona horaria.

- `civil-date.ts` ya tiene `isLeapYear`, `daysInMonth` y `yearOf`: es su sitio. `synth/calendar.ts` tiene un `addDays` que usa `Date.parse` con `T00:00:00.000Z`; se mueve a `dates/` y `synth` lo importa de allí, para no tener dos aritméticas de calendario en el dominio.
- Una fecha civil no tiene hora ni zona: `Date.UTC(y, m-1, d)` es exacto para el día de la semana y para la diferencia en días, sin riesgo de desplazamiento por horario de verano.
- Descartado *usar `Intl`*: innecesario y más caro; `madrid.ts` ya lo usa donde sí hace falta (convertir un instante a fecha de Madrid).

## 7. Redondeo del reparto: por qué el residuo no puede ir "y ya está"

El prompt fija "residuo al activo de mayor déficit". Con importes normales basta. Con un núcleo de tres céntimos y cinco activos, redondear al alza cinco veces produce un residuo negativo mayor que la asignación del activo elegido, y el ajuste dejaría un importe **negativo**: la propiedad "ninguna asignación es negativa" fallaría.

**Decisión (A6): derrame ordenado.** El residuo se aplica al activo de mayor déficit; si no cabe (dejaría la asignación por debajo de cero), se le quita solo lo que tiene y el resto pasa al siguiente por déficit, y así hasta agotarlo. Como `Σ raw_i = core` exactamente y cada `alloc_i` dista de `raw_i` menos de un céntimo, el residuo siempre cabe en el conjunto. La función comprueba sus dos invariantes antes de devolver.

- Descartado *el método del mayor resto* (repartir el residuo céntimo a céntimo por parte fraccionaria): reparte mejor, pero contradice la letra del prompt ("el residuo se ajusta en el activo de mayor déficit") y no aporta nada a esta escala.

## 8. Avisos de consulta frente a avisos del libro

**Decisión: los avisos de `coreWeights` viajan en su propia estructura, no en `state.warnings`.**

- `state.warnings` describe el **libro** (un activo en dos cuentas, una venta sin tesis…) y lo consume `atlas check`. Una desviación por encima del umbral no es un defecto del libro: es información de gestión que depende de la fecha y de la configuración con la que se consulta. Mezclarlas haría que `atlas check` gritara por una cartera perfectamente sana.
- Se reutiliza el tipo `Warning` (código, mensaje, detalles) por uniformidad de presentación; `event_id` queda con el id del `settings_changed` vigente cuando el aviso nace de un umbral, y vacío cuando no procede.
