# Plan de implementación: Seguimiento del cubo especulativo y patrimonio total (`005-bucket-tracking`)

**Rama**: `feature/005-bucket-tracking` | **Fecha**: 2026-09-18 | **Spec**: [spec.md](./spec.md)

**Entrada**: `specs/005-bucket-tracking/spec.md` y `docs/prompts/005-bucket-tracking.md` (versión posterior al tercer *challenge*, fusionada en `develop` el 2026-09-18).

## Resumen

Cuatro proyecciones puras nuevas en `packages/domain` (`netWorth`, `bucketPositions`, `bucketTheses`, `bucketStats` con sus reglas de control), un aviso de proyección nuevo (`wash_sale_window_repurchase`) con la aritmética de calendario que la Fase 5 reutilizará, tres comandos de CLI (`bucket`, `networth`, `thesis show`), y **dos bloques previos que no son funcionalidad sino cimientos**: el bloque 0 del tercer *challenge* (ADR-0018) y la puerta única de precios. Cero dependencias nuevas, cero cambios incompatibles de esquema, cero decisiones fiscales.

El orden de trabajo es el del prompt y no es negociable:

1. **Bloque 0** (§3.0 bis): `asset_type` gana `etf`, los mapas de `Settings` por tipo de activo se vuelven parciales y cuatro eventos ganan `fx_rate_date?`. Va primero porque todo lo demás se apoya en `Settings`, y porque hecho tarde obligaría a una versión de esquema. **No debe cambiar el *golden***; el plan explica cómo se consigue (D2).
2. **Puerta única de precios** (§3.0 ter): antes de añadir tres consumidores más, se centraliza la lectura en `prices.ts` con el parámetro de fuente externa que usará la Fase 4.
3. **Subflujo de PRNG del generador** (§3.8): **antes** de tocar el escenario, para que el diff del *golden* sea revisable. Es requisito, no mejora.
4. Proyecciones, de abajo arriba: tipos de cambio por divisa en la proyección → `netWorth` → `bucketPositions` → `bucketTheses` → `bucketStats` + controles → aviso de recompra → aviso de ejercicio movido.
5. CLI, escenario ampliado y *golden* regenerado en su commit propio.

## Contexto técnico

**Lenguaje/versión**: TypeScript 7.0.2 sobre Node 22 (`.nvmrc`), ESM, `tsconfig` estricto (ADR-0007).

**Dependencias**: ninguna nueva (`docs/dependencies.md` es lista cerrada). `packages/domain` sigue sin dependencias npm en runtime; la aritmética decimal es `big.js` vendorizada (ADR-0005).

**Almacenamiento**: el mismo `ledger.jsonl` (ADR-0002/0006). Esta feature **no añade ningún tipo de evento** y sus tres cambios de forma son **compatibles** (ADR-0018): un valor nuevo en un enumerado, una validación relajada y un campo opcional. `schema_version` sigue en 1 y no hay migración.

**Tests**: Vitest + fast-check. `packages/domain` al 100 % de líneas y ramas (bloqueante en CI).

**Plataforma**: CLI local sobre fichero (`apps/cli`). Sin API ni web (Fase 4 / Ronda 7).

**Tipo de proyecto**: monorepo npm workspaces con arquitectura hexagonal; el dominio no importa nada.

**Rendimiento**: irrelevante a esta escala. Lo único nuevo que cuesta es que `atlas settings set` proyecta el libro **dos veces más** (configuración vieja y nueva) para comparar las ganancias por ejercicio; es lineal y en memoria, y solo en el camino de escritura de la configuración.

**Restricciones**: compartimentación estricta, con la **única** excepción escrita del patrimonio total (constitución III, excepción 2); ningún precio puede alcanzar un cálculo fiscal; nunca interpolar ni sustituir por cero; `docs/` intocable.

**Escala**: 2 bloques de cimientos, 4 proyecciones, 1 aviso de proyección, 1 aviso de configuración, 3 comandos, 1 ampliación del generador, 1 regeneración del *golden*.

## Verificación contra la constitución

*Puerta previa. Se vuelve a comprobar al terminar el diseño.*

| Principio | Cómo lo cumple esta feature |
|---|---|
| **I — El libro es la fuente de verdad** | Todo lo que se muestra es derivado y recomputable: precios de las `valuation`, cantidades de las posiciones, resultados de las ganancias, aportes de los movimientos de efectivo. Nada se almacena. La precedencia de precios (manual por delante de automático, decisión (j)) es este principio escrito en código. |
| **II — Lotes y fiscalidad solo desde el libro** | Ninguna proyección nueva toca lotes, ganancias ni fechas fiscales: las **lee**. El test de arquitectura se amplía para que `lots.ts`, `gains.ts`, `income.ts`, `operations.ts` y `theses.ts` no puedan importar precios ni proyecciones del cubo; por eso `bucketTheses` **envuelve** a `theses()` en vez de ampliarla (la pasada B del proyector usa `theses.ts`, que no puede aprender lo que es un precio). |
| **III — Compartimentación estricta** | `bucketPositions`, `bucketTheses` y `bucketStats` filtran por `book === "bucket"` como primera operación. `netWorth` es la excepción 2, **siempre desglosada**, sin un solo número agregado sin descomponer, y su único consumidor es el aviso de la regla 18. |
| **IV — Nada codificado que deba ser configurable** | Umbrales del cubo, índice de referencia, `stale_price_days` y ventanas de recompra salen de `Settings`; sin el parámetro, el aviso **no se evalúa**. Los únicos números fijos son el 80 % del "aviso al acercarse", que el prompt declara explícitamente no configurable, y las 100 operaciones de la significancia, que vienen de la especificación §6.2. |
| **V — Fallo seguro, nunca silencio** | Precio ausente ⇒ "sin precio" y total parcial; precio del índice ausente ⇒ los **dos** campos sin dato; tipo de cambio ausente ⇒ línea sin convertir y total parcial; tipo viejo ⇒ marcado caducado, nunca disfrazado de actual; resultado contaminado ⇒ **excluido y contado**, nunca promediado (decisión (k)). |
| **VI — Supervivencia a 20 años** | Cero dependencias nuevas. Los dos bloques de cimientos existen precisamente para esto: ADR-0018 evita que añadir un tipo de activo rompa el libro, y la puerta única de precios evita reabrir seis proyecciones en la Fase 4. |
| **VII — Tests donde un error cuesta dinero** | La ventana de recompra es la prioridad 3 de la constitución: se cubre con sus casos límite de calendario (fin de mes, bisiesto, último día y el siguiente). Propiedades `fast-check` para el resultado frente al índice, la máxima caída, la tasa de acierto y la esperanza. Cobertura 100 % en el dominio. |

**Sin violaciones que justificar.** La sección *Complexity Tracking* queda vacía.

## Investigación previa (prompt §2.3): qué cubren Portfolio Performance y Ghostfolio y nuestro §3 no

Lectura de documentación pública, del repositorio y de los foros oficiales. Sin copiar código ni diseño.

**Portfolio Performance — vista *Trades*** ([manual](https://help.portfolio-performance.info/en/reference/view/reports/performance/trades/), [rendimiento ponderado por dinero](https://help.portfolio-performance.info/en/concepts/performance/money-weighted/), [dashboard](https://help.portfolio-performance.info/en/reference/view/reports/performance/dashboard/)). Es la referencia más cercana a lo que hacemos. Una *trade* nace de una compra y se cierra con cada venta siguiendo **FIFO**; por defecto agrupa varias compras del mismo valor en una sola operación abierta, con opción de separarlas. Columnas: fecha de inicio y de fin, número de transacciones, títulos, *entry value* y *exit value* (comisiones e impuestos incluidos), P/L y P/L bruto, **holding period en días**, **IRR por operación** (entre las fechas de entrada y salida, sin poder aplicar un periodo de informe) y *Return* simple = exit/entry − 1. El *dashboard* añade "Number of trades with profit/loss", "Average holding period", "Portfolio Turnover Rate", **Maximum Drawdown**, "Max Drawdown Duration", volatilidad, semidesviación y Sharpe, todo **a nivel de cartera o de valor**, nunca de operación. Su ratio de comisiones es "Portfolio Fee Rate" = comisiones / (plusvalías realizadas y latentes + rendimientos): **comisiones sobre ganancias, no sobre capital operado**. El *benchmark* se añade como un valor más con precios históricos y se dibuja en el gráfico de la cartera ([cómo](https://help.portfolio-performance.info/en/how-to/benchmarking/)); en el [foro oficial](https://forum.portfolio-performance.info/t/performance-eines-wertpapieres-seit-kauf-im-vergleich-mit-benchmark/21517) la respuesta a "comparar un valor desde la compra contra un índice" es **replicar a mano las transacciones del índice con las mismas fechas e importes**: la comparación automática no existe.

**Ghostfolio** ([repositorio](https://github.com/ghostfolio/ghostfolio), [reglas X-ray](https://github.com/ghostfolio/ghostfolio/tree/main/apps/api/src/models/rules), [regla de comisiones](https://github.com/ghostfolio/ghostfolio/blob/main/apps/api/src/models/rules/fees/fee-ratio-total-investment-volume.ts), [interfaz de benchmark](https://github.com/ghostfolio/ghostfolio/blob/main/libs/common/src/lib/interfaces/benchmark.interface.ts)). Trabaja **por posición**, no por operación: precio medio, fecha de la primera actividad, número de actividades, rendimiento bruto y neto con y sin efecto divisa, dividendos, comisiones y ROAI por periodos. Su análisis "X-ray" son ~16 reglas estáticas de riesgo con umbrales configurables (concentración por cuenta, por clase de activo, por divisa, por región, fondo de emergencia, liquidez) y **una** de comisiones: `fees / totalInvestmentVolume`, umbral por defecto del 1 %, que sí es comisiones sobre volumen invertido pero **de toda la cartera**. El *benchmark* es una serie de precios superpuesta al gráfico ("Compare with…") más indicadores de "cambio desde máximo histórico". Comprobado sobre el fichero de cadenas de su interfaz: **cero** coincidencias de "drawdown", "win rate", "expectancy", "holding period", "volatilit" o "sharpe". *(Su web pública de funcionalidades no es legible por herramientas automáticas —es una SPA—, así que todo lo anterior sale del repositorio y de sus issues.)*

| Lo que ellos cubren y nuestro §3 no | Por qué queda fuera |
|---|---|
| **IRR por operación** y *return* anualizado (PP) | Nuestra unidad de decisión es la **tesis**, no la operación FIFO, y la comparación que el plan exige es contra el índice, no una tasa interna. Un IRR por tesis con aportaciones en varias fechas es un candidato razonable para la web (Ronda 7), no para esta feature. |
| **Holding period medio y rotación de cartera** (PP) | Los días abierta por tesis sí están (§3.2); las medias agregadas por plazo son explícitamente fuera de alcance (§4: rendimiento por plazo, por tamaño o por tipo de hipótesis). |
| **Volatilidad, Sharpe, semidesviación y drawdown de la curva de valor** (PP) | Exigen serie temporal de valor, que exige precios diarios: Fase 4 y Ronda 7. Nuestra máxima caída se calcula **solo desde el libro** (decisión (e)) y por eso es exacta hoy. |
| **Reglas de riesgo tipo X-ray por región, divisa o liquidez** (Ghostfolio) | No son reglas del plan del usuario. Las suyas (3, 6b, 17, 18) están implementadas o lo estarán. |
| **Agrupación automática de varias compras en una operación** (PP) | Nosotros la damos explícita: la tesis agrupa las compras que el usuario decidió que van juntas, escrita **antes** de comprar (regla 15). |

| Lo que nuestro §3 cubre y ellos no |
|---|
| **Equivalente en índice por tesis**: el mismo dinero, en las mismas fechas, puesto en el índice, con fórmula reproducible a mano. En PP hay que replicarlo transacción a transacción; en Ghostfolio no existe. |
| **Tasa de acierto, esperanza matemática y exclusión de resultados contaminados** por el FIFO global: ninguna de las dos tiene siquiera el concepto. |
| **Comisiones sobre capital operado** (regla 14). PP las mide sobre las ganancias y Ghostfolio sobre el volumen de toda la cartera; ninguna sobre el capital operado del libro especulativo, que es donde las comisiones deciden el resultado. |
| **Compartimentación estricta de dos libros** con una única excepción escrita. En PP hay filtros opcionales por cuenta; en Ghostfolio, etiquetas: nada impide mezclar. |
| **Fallo seguro ante precio ausente.** Ghostfolio propone explícitamente [caer al precio de la operación](https://github.com/ghostfolio/ghostfolio/issues/5099) cuando no hay dato de mercado; PP no documenta el caso. Nosotros decimos "sin dato" y marcamos el total como parcial. |
| **Aviso de la regla de recompra española**, y antigüedad marcada de cada precio **y de cada tipo de cambio**. Ninguna de las dos lo tiene. |

## Estructura del proyecto

### Documentación de la feature

```text
specs/005-bucket-tracking/
├── plan.md              # Este fichero
├── spec.md
├── questions.md         # Q1-Q7, contradicciones y notas de lectura
├── research.md          # Decisiones de diseño con sus alternativas
├── data-model.md        # Formas de las proyecciones nuevas y de los cambios en Settings
├── quickstart.md        # Recorrido manual: thesis open → add buy → bucket → networth
├── contracts/
│   ├── domain.md        # Firmas y garantías de las proyecciones nuevas
│   └── cli.md           # Comandos, flags, salidas y códigos de salida nuevos
├── checklists/requirements.md
└── tasks.md             # Lo genera /speckit-tasks
```

### Código

```text
packages/domain/src/
├── schema/events.ts                # + "etf" en ASSET_TYPES; + fx_rate_date? en 4 eventos
├── schema/validate.ts              # mapas parciales; fx_rate_date? en FX_DATE_FIELDS
├── settings/settings.ts            # Partial<Record<AssetType,…>>, defaults por tipo, bucket_benchmark_asset_id
├── settings/fiscal-date.ts         # resuelve el valor por defecto del mapa parcial
├── settings/wash-sale.ts           # NUEVO: lectura de la ventana y último día, de fecha a fecha
├── dates/civil-date.ts             # + addMonths / addYears con fin de mes
├── projections/prices.ts           # PUERTA ÚNICA: priceAt(activo, fecha, …, external?) + manualPrices
├── projections/state.ts            # + fxRates: último tipo conocido por divisa
├── projections/operations.ts       # registra el tipo por divisa; dispara el aviso de recompra
├── projections/wash-sale.ts        # NUEVO: aviso wash_sale_window_repurchase
├── projections/networth.ts         # NUEVO: netWorth
├── projections/bucket.ts           # NUEVO: bucketPositions + bucketTheses
├── projections/bucket-stats.ts     # NUEVO: bucketStats + reglas de control
├── projections/settings-impact.ts  # NUEVO: ejercicios cuyas ganancias mueve un cambio
├── synth/random.ts                 # + derivación de subflujos desde la semilla
├── synth/builder.ts                # + stream(label) y stateAsOf(date)
├── synth/scenario.ts               # mapas explícitos, índice valorado, tesis nuevas, recompra
└── index.ts                        # exports

apps/cli/src/
├── commands/bucket.ts              # NUEVO: atlas bucket · atlas networth
├── commands/thesis.ts              # + show; list con --date y columnas nuevas
├── commands/catalogue.ts           # settings set: --bucket-benchmark-asset y aviso de ejercicio movido
├── commands/add.ts                 # --fx-rate-date en valuation/cash-in/cash-out/fee; aviso destacado en buy
├── output/messages.ts              # traducción al español de los avisos nuevos
└── main.ts                         # registro de comandos y USAGE

tests/architecture.test.ts          # + puerta única de precios y módulos fiscales sin precios
```

**Decisión de estructura**: se mantiene la de ADR-0007. Toda regla de negocio vive en `packages/domain` como función pura `(state, …) → resultado`; `apps/cli` compone, formatea y pregunta. Ni una decisión de negocio en la CLI, para que la web de la Ronda 7 la reutilice tal cual.

## Diseño

### D1. Bloque 0.1 — `asset_type` gana `etf` y los mapas se vuelven parciales (ADR-0018)

```ts
export const ASSET_TYPES = ["fund", "etf", "etc", "etp", "stock", "crypto", "money_market"] as const;

export interface Settings {
  fiscal_date_rule: Partial<Record<AssetType, FiscalDateRule>>;
  wash_sale_window: Partial<Record<AssetType, WashSaleWindow>>;
  wash_sale_window_days?: Partial<Record<AssetType, number>>;
  …
}

export const DEFAULT_FISCAL_DATE_RULE: Record<AssetType, FiscalDateRule> = { …, etf: "trade_date" };
export const DEFAULT_WASH_SALE_WINDOW: Record<AssetType, WashSaleWindow> = { …, etf: "2m" };
```

- `validateSettings` deja de exigir que los mapas cubran los siete tipos; sigue exigiendo que **lo que hay** sea válido (`trade_date`/`value_date`, `"2m"`/`"1y"`/`"<n>d"`, entero positivo en la forma antigua). Relajar una validación es compatible (ADR-0018).
- **Dónde se resuelve el valor por defecto**: en el **punto de uso**. `fiscalDateOf(dates, assetType, settings)` pasa a `settings.fiscal_date_rule[assetType] ?? DEFAULT_FISCAL_DATE_RULE[assetType]`, y la lectura de la ventana hace lo propio. Es la línea que evita el fallo silencioso: hoy un tipo ausente daría `undefined !== "trade_date"` y la fecha fiscal caería en `value_date` sin que nadie se entere.
- `settingsAt` completa los mapas al leer (para `atlas settings show` y para el patch de `settings set`), pero **`state.fiscalSettings` y `state.settingsHistory` conservan lo que dice la línea**: la instantánea no cambia (A14), igual que se decidió con `normalizeSettings` en la 004.
- `normalizeSettings` sigue resolviendo la forma antigua, ahora sobre mapas parciales.

### D2. Bloque 0.2 — cómo se consigue que el *golden* no cambie

`synth/scenario.ts` construye su configuración con `{...DEFAULT_SETTINGS, …}`. En cuanto `DEFAULT_SETTINGS` gane `etf`, las tres líneas `settings_changed` del libro sintético cambiarían y el *golden* con ellas — justo lo que la decisión (i) prohíbe. Solución: **el escenario declara sus mapas explícitamente**, con los mismos seis tipos y en el mismo orden que escribe hoy (A15). Beneficio colateral: el *golden* pasa a ser la prueba de regresión de los mapas parciales, porque es una configuración escrita antes de que `etf` existiera.

La comprobación es mecánica y va en la tarea: al terminar el bloque 0, `npm test` pasa **sin regenerar nada**. Si el *golden* cambia, se para y se investiga.

### D3. Bloque 0.3 — `fx_rate_date?` en cuatro eventos

`valuation`, `cash_deposit`, `cash_withdrawal` y `standalone_fee` lo ganan como `opt("date")`, entran en `FX_DATE_FIELDS` (rechazo de fin de semana, bloque 0 de la 004) y en los flags de `atlas add valuation|cash-in|cash-out|fee`. Campo opcional = cambio compatible; el generador **no** lo escribe todavía (lo hará en la ampliación del escenario, y esa diferencia se declara en el commit de regeneración).

### D4. La puerta única de precios (§3.0 ter, decisión (j))

```ts
/** Consulta de precios ya cargados en memoria. NO es el puerto PriceSource de ADR-0007: el dominio no hace E/S. */
export interface ExternalPrices {
  at(assetId: AssetId, date: CivilDate): ExternalQuote | undefined;
}

export interface PriceLookup {
  origin: "manual" | "external";   // hoy siempre "manual"
  unit_value: Decimal; currency: Currency; fx_rate: Decimal; unit_value_eur: Money;
  date: CivilDate; age_days: number; stale: boolean; event_id?: Ulid;
}

/**
 * La única puerta de precios del sistema. Precedencia: el precio manual
 * (`valuation`) gana SIEMPRE al automático — el manual es una decisión del
 * usuario y el automático una conveniencia (constitución I, decisión (j)).
 */
export const priceAt = (state, assetId, date, settings, external?): PriceLookup | undefined;

/** Forma agregada para las vistas que recorren muchos activos; misma precedencia, una pasada. */
export const manualPrices = (state, date, settings, external?): Map<AssetId, PriceLookup>;
```

- El nombre documentado `manualPrices` se conserva (`docs/data-schema.md` §7 es intocable); la puerta nueva vive en el mismo fichero (nota 8 de `questions.md`).
- `weights.ts`, `contribution.ts`, `simulate-transfer.ts` y `costs.ts` pasan a pedir el precio aquí; ninguno cambia de comportamiento y sus tests pasan sin tocarse.
- Un test recorre `packages/domain/src` y falla si algún fichero distinto de `prices.ts` y `valuations.ts` menciona `state.valuations` (el segundo enumera valoraciones para el Modelo 720, no resuelve precios; la excepción queda escrita en el propio test).

### D5. Tipos de cambio por divisa en la proyección (§3.1)

`LedgerState` gana `fxRates: Map<Currency, { rate: Decimal; date: CivilDate; event_id: Ulid }>`. Cada evento de la pasada B que declare un par divisa/tipo lo registra (compras, ventas, dividendos, intereses, `fx_exchange` con sus dos lados, movimientos de efectivo, valoraciones y los efectos `forced_sale`/`grant`); el último en orden cronológico gana. `date` es `fx_rate_date` cuando el evento lo trae y, si no, su fecha de negocio, y la fila lo dice (A10).

**No entra en `snapshotOf`**, que es una lista explícita de campos: el *golden* no cambia (mismo criterio que la 004 con las comisiones).

### D6. `netWorth` (§3.1)

```ts
netWorth(state, date, settings, external?): NetWorth
```

Tres bloques, siempre presentes aunque valgan cero:

- **núcleo**: reutiliza `coreWeights` (total, subtotales por clase, parcialidad, precios que faltan);
- **cubo**: las filas de `bucketPositions` agregadas (cuenta, activo, valor);
- **efectivo**: una fila por (cuenta, divisa) con saldo distinto de cero; EUR va a EUR; el resto se convierte con `state.fxRates` (`eur = importe / rate`), mostrando tipo, fecha, antigüedad y marca `stale`; sin tipo, `eur_value` ausente, la divisa entra en `missing_rates` y el total se marca parcial.

`partial = núcleo parcial || cubo parcial || hay divisas sin tipo`. El total es la suma de lo que sí tiene valor, **etiquetado como parcial** cuando lo es. No existe ninguna función que devuelva solo el total.

### D7. `bucketPositions` y `bucketTheses` (§3.2 y §3.3)

En `projections/bucket.ts`, que importa `positions`, `prices` y `theses` (solo para leer la vista) y lee `state.lots` directamente — nunca `lots.ts`, `gains.ts` ni `income.ts` (D14).

- **Coste medio**: `unit_cost = Σ cost_eur de los lotes abiertos del activo / Σ quantity de esos lotes`; coste de la fila = `unit_cost × cantidad de la fila` (A3).
- **P&L latente** = `valor − coste`; el porcentaje, sobre el coste, ausente si el coste es cero.
- **Tesis abierta** del par (cuenta, activo), con `days_open`, `expected_horizon_days`, `horizon_exceeded` e `invalidation`.
- **`bucketTheses`** envuelve `theses(state, date)` y añade, por tesis: el P&L latente de su posición viva (mismo cálculo que arriba), `benchmark_equivalent_eur`, `result_vs_index_eur` y `missing_benchmark_prices[]`.
  - `P(d)` = `priceAt(benchmark, d)` en **euros** (A2); `d_fin` = fecha fiscal de la última venta enlazada si está cerrada, o la fecha consultada.
  - Sin índice configurado → `missing_benchmark_asset`; índice que no existe → `unknown_benchmark_asset`; sin `P(d)` para alguna fecha → `missing_benchmark_price` con activo y fecha. En los tres casos **los dos campos quedan `undefined`** y nunca se estima.
  - Una tesis **sin compras enlazadas** no tiene comparación: el sumatorio vacío es "sin dato", no cero (Q6).
  - Para esto, `Thesis` guarda sus compras y ventas como **tramos** (`{ event_id, fiscal_date, quantity, amount_eur, fee_eur }`) en vez de solo ids; `snapshotOf` sigue serializando únicamente los ids, así que la instantánea no cambia.

### D8. `bucketStats` y las reglas de control (§3.4 y §3.5)

En `projections/bucket-stats.ts`. Recibe `state`, `events` (para comisiones y aportes, como `costSummary` desde la 004), la fecha y la configuración.

- **Contaminación** (decisión (k)): por cada venta de la tesis, sus `by_lot` → lote → se sube por `source_lot_id` hasta la raíz → `source_event_id`. Si la raíz no es una compra enlazada a esa misma tesis, la tesis se marca `foreign_lots` y **queda fuera** de tasa de acierto, medias y esperanza; se devuelve `excluded: [{ thesis_id, reason }]`.
- **Medias**: sobre las cerradas no excluidas; ganancia media y pérdida media **ausentes** si no hay ninguna de ese signo; esperanza = media de todas (incluidas las de resultado cero).
- **Comisiones sobre capital operado**: `Σ fee/fx_rate de los buy y sell del cubo` y `Σ coste de sus buy` (comisión incluida, A11), con su porcentaje; denominador cero ⇒ porcentaje sin dato.
- **Máxima caída**: ventas del cubo ordenadas por (`fiscal_date`, posición en el fichero), acumulando `gain_eur`; la mayor caída desde un máximo previo, con las fechas de pico y valle; sin ventas, cero y sin fechas.
- **Controles**: aporte **bruto** (Σ `cash_deposit` de las cuentas del cubo) y **neto** (menos las retiradas), pérdida acumulada (realizada + latente), peso sobre `netWorth` y presupuesto previsto. Los avisos (`bucket_contribution_exceeded`, `bucket_contribution_near_limit`, `bucket_stop_loss_reached`, `bucket_weight_exceeded`) viajan en la estructura devuelta, **no** en `state.warnings` (decisión (h)). Umbral ausente ⇒ no se evalúa; denominador cero ⇒ no se evalúa; patrimonio parcial ⇒ el peso queda sin dato y no se avisa.

### D9. Aviso de recompra (§3.6)

- `dates/civil-date.ts`: `addMonths(date, n)` y `addYears(date, n)` con el día inexistente llevado al último del mes (31-01 + 1 mes = 28-02, o 29-02 en bisiesto).
- `settings/wash-sale.ts`: `washSaleWindowOf(settings, assetType)` (con su valor por defecto, D1) y `washSaleWindowEnd(fiscalDate, window)` → último día **inclusive** (A5).
- `projections/wash-sale.ts`, **las dos direcciones** (Q3):
  - al aplicar un `buy`, recorre `state.gains` (en la pasada B solo contiene lo anterior en el tiempo) buscando ventas del **mismo** `asset_id` con `gain_eur` negativa cuya ventana alcance la fecha fiscal de la compra, y emite `wash_sale_window_repurchase` por cada una, con `sale_event_id`, cantidad, pérdida y `window_end`;
  - al aplicar un `sell` **con pérdida**, recorre las compras anteriores del mismo activo —los lotes abiertos y cerrados del activo llevan su `source_event_id` y su `acquisition_date`— y emite `wash_sale_window_prior_buy` por cada una con fecha fiscal en `[d − W, d)`, con `buy_event_id`, cantidad y `window_start`.
  Los dos son avisos de **proyección** (`state.warnings`), como `thesis_size_exceeded`: así salen en `atlas check` y en la vista previa de `atlas add buy|sell` sin código adicional.
- **Consecuencia declarada**: el libro sintético ya contiene el caso "pérdida en fondo seguida de aportaciones mensuales dentro del año" (y su venta con pérdida tiene compras anteriores dentro del año), así que el *golden* ganará avisos de las dos direcciones y `SYNTHETIC_EXPECTED_WARNINGS` el código nuevo (nota 2 de `questions.md`).
- **Nada más**: ni diferimiento, ni reparto, ni asociación a lotes (decisión (g)).

### D10. Aviso de ejercicio movido (§3.5 bis)

`projections/settings-impact.ts`:

```ts
movedFiscalYears(events, current, next, currentYear): { year: number; before: Money; after: Money }[]
```

Proyecta el mismo libro dos veces (`ProjectOptions.settings`), suma `gain_eur_rounded` por ejercicio y devuelve los **anteriores a `currentYear`** cuyo total difiere. La CLI lo imprime y pide confirmación junto al aviso de umbral silenciado que ya existe; `--yes` la satisface y **nunca bloquea**.

### D11. CLI (§3.7)

- `atlas bucket [--date] [--json]`: cuatro secciones (posiciones, tesis, estadísticas con las comisiones destacadas, avisos). En texto, el aviso de parada va **destacado** arriba.
- `atlas networth [--date] [--json]`: tres bloques y el total, con las marcas de parcialidad y de caducidad.
- `atlas thesis show <id> [--date]`: ficha con `keyValue` más las tablas de compras y ventas.
- `atlas thesis list`: columnas nuevas y `--date` (con `--at` dando error de uso que remite al nuevo, A9/Q4); proyecta con `asOf`.
- `atlas add buy` sobre cuenta del cubo: tras la vista previa, el aviso de parada destacado si procede.
- Todos de solo lectura, con `loadForQuery(ctx, date)`, cabecera degradada y sobre `{ invalid_count, data }`.

### D12. Subflujo de PRNG del generador (§3.8) — **antes de tocar el escenario**

```ts
// synth/random.ts
export const deriveSeed = (seed: number, label: string): number;   // FNV-1a del label mezclado con la semilla

// synth/builder.ts
/** Un subflujo: su propio Prng, su propio generador de ULID y su propio reloj. Lo que graba aquí no desplaza
 *  ni un byte de lo que el flujo principal ya grabó. */
stream(label: string): ScenarioStream;
/** Proyección de lo grabado hasta ahora, cortada a una fecha (ADR-0016): para leer cantidades de entonces. */
stateAsOf(date: CivilDate): LedgerState;
```

El subflujo necesita **las tres cosas**: el `Prng` propio para los importes, el generador de ULID propio (los bytes aleatorios del id salen del mismo flujo) y un reloj propio (el compartido avanza "un segundo por evento" y un evento intercalado desplazaría el `recorded_at` de sus vecinos del mismo día). Los bloques nuevos se graban **al final del fichero** con fechas de negocio anteriores —registrar tarde es normal y no altera el resultado, `docs/data-schema.md` §7.1—, de modo que el diff del *golden* son líneas añadidas.

**Prueba del mecanismo antes de usarlo**: un test graba un bloque en un subflujo y comprueba que los eventos previos conservan id, `recorded_at` y campos, byte a byte.

### D13. Escenario ampliado y regeneración (§3.8)

Sobre activos **nuevos** del cubo, en euros (evita el baile de divisas y, sobre todo, no toca los lotes ni las ganancias de los activos existentes):

- `settingsWith` gana `bucket_benchmark_asset_id: "ast_world"` (los tres umbrales ya estaban);
- valoraciones **semestrales** de `ast_world` desde antes del primer evento del cubo, con la cantidad leída con `stateAsOf(fecha)`;
- dos activos nuevos (`ast_delta`, `ast_epsilon`), sus depósitos y **cuatro tesis cerradas nuevas** —una con dos compras en fechas distintas y ganancia, dos con pérdida, una con ganancia— más **una abierta**;
- la **recompra dentro de la ventana** tras la venta con pérdida de `ast_delta` (acción, dos meses), que abre la segunda tesis abierta;
- `fx_rate_date` en las valoraciones en divisa.

Resultado: **siete tesis cerradas** (tres existentes + cuatro nuevas) y **dos abiertas**, como pide §3.8. El *golden* se regenera **una sola vez**, en commit propio, tras comparar el fichero antiguo y el nuevo con un script del *scratchpad* que agrupa las diferencias por tipo de evento; el mensaje del commit las enumera todas: líneas añadidas del bloque nuevo, `bucket_benchmark_asset_id` en las tres configuraciones, `fx_rate_date` en las valoraciones en divisa y los avisos `wash_sale_window_repurchase` en la instantánea.

### D14. Arquitectura y tests

- El test de arquitectura amplía sus dos listas: **informativos** (`prices`, `weights`, `contribution`, `simulate-transfer`, `costs`, `networth`, `bucket`, `bucket-stats`) no importan `lots`, `gains`, `income`, `corporate-actions`, `primitives` ni `fiscal-date`; **fiscales** (esos cinco más `operations` y `theses`) no importan `prices` ni las proyecciones del cubo. Por eso la comparación con el índice vive en `bucket.ts` y no dentro de `theses.ts`.
- Propiedades (`fast-check`): `result_vs_index_eur` = 0 con rendimientos idénticos; máxima caída ≥ 0 y = 0 sin pérdidas; tasa de acierto en `[0,1]`; esperanza = media ponderada de ganancia y pérdida; P&L latente + resultado realizado = (valor + cobros) − coste.
- Casos límite obligatorios del prompt §3.9, uno a uno, más los de calendario de la ventana.
- `quickstart.md` se ejecuta a mano con el binario compilado sobre el *golden* regenerado y las desviaciones se anotan en `questions.md`.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| El bloque 0 cambia el *golden* sin que nadie lo note | D2: el escenario declara sus mapas; la tarea del bloque 0 termina con `npm test` verde **sin regenerar**. Si cambia, se para y se investiga (decisión (i)) |
| La regeneración del *golden* tapa una regresión de proyección | Subflujo de PRNG primero (D12), script de comparación por tipo de evento y enumeración completa en el mensaje del commit |
| El aviso de recompra llena el *golden* de ruido | Es un aviso por compra dentro de la ventana y el escenario tiene un caso real de manual: se declara y se cuenta en el commit; `atlas check` los lista como avisos, no como errores |
| `Thesis` gana tramos y cambia la instantánea | `snapshotOf` serializa solo los ids de compras y ventas, como hoy; hay test de que la instantánea del *golden* no cambia por este motivo |
| La exclusión por contaminación deja las estadísticas casi vacías | Las tesis nuevas se diseñan **limpias** (activo propio, una tesis por activo a la vez), de modo que la muestra siga siendo útil y la exclusión se vea en uno o dos casos, que es justo lo que hay que enseñar |
| El 100 % de cobertura empuja a tests artificiales | Cada rama nueva tiene un caso de negocio detrás; las ramas "imposibles" (divisa sin tipo, activo sin lotes) se alcanzan con casos reales documentados en `questions.md` |

## Complexity Tracking

Sin violaciones de la constitución que justificar.
