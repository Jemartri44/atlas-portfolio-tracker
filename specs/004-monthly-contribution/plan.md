# Plan de implementación: Aportación mensual, pesos del núcleo y correcciones del segundo *challenge* (`004-monthly-contribution`)

**Rama**: `feature/004-monthly-contribution` | **Fecha**: 2026-08-31 | **Spec**: [spec.md](./spec.md)

**Entrada**: `specs/004-monthly-contribution/spec.md` y `docs/prompts/004-monthly-contribution.md`.

## Resumen

Cinco proyecciones puras nuevas en `packages/domain` (`manualPrices`, `coreWeights`, `contributionPlan`, `transferSimulation`, `costSummary`), cuatro comandos nuevos de CLI (`weights`, `contribute`, `costs`, `transfer simulate`) y siete correcciones acotadas del bloque 0 que tocan `settings.ts`, `validate.ts`, `record-event.ts`, la CLI y el generador sintético. Cero dependencias nuevas, cero cambios de esquema fuera de los que `docs/data-schema.md` ya describe, cero decisiones fiscales.

El orden de trabajo es el del prompt: **bloque 0 primero** (el resto se apoya en él: `wash_sale_window` cambia `DEFAULT_SETTINGS` y por tanto todos los libros de test; las validaciones de `fx_rate` obligan a regenerar el *golden*; el modo degradado es el patrón que usan los comandos nuevos), después las proyecciones de la Fase 2 de abajo arriba (`manualPrices` → `coreWeights` → `contributionPlan` / `transferSimulation` / `costSummary`), después la CLI, y al final el generador y el *golden* regenerado en su commit propio.

## Contexto técnico

**Lenguaje/versión**: TypeScript 7.0.2 sobre Node 22 (`.nvmrc`), ESM, `tsconfig` estricto (ADR-0007).

**Dependencias**: ninguna nueva (`docs/dependencies.md` es lista cerrada). `packages/domain` sigue sin dependencias npm en runtime; la aritmética decimal es `big.js` vendorizada (ADR-0005).

**Almacenamiento**: el mismo `ledger.jsonl` (ADR-0002/0006). Esta feature **no añade ningún tipo de evento** ni ningún campo obligatorio; los únicos cambios de forma son los del bloque 0, ya escritos en `docs/data-schema.md`.

**Tests**: Vitest + fast-check. `packages/domain` al 100 % de líneas y ramas (bloqueante en CI).

**Plataforma**: CLI local sobre fichero (`apps/cli`). Sin API ni web (Fase 4 / Ronda 7).

**Tipo de proyecto**: monorepo npm workspaces con arquitectura hexagonal; el dominio no importa nada.

**Rendimiento**: irrelevante a esta escala (libro entero en memoria, unos miles de eventos). El único coste nuevo apreciable es que `recordEvent` de un `settings_changed` proyecta el libro **dos veces** (antes y después) para comparar conjuntos de inválidos, como ya hace `reverseEvent`.

**Restricciones**: compartimentación estricta (`core` y `bucket` nunca en la misma fila ni en el mismo total); ningún precio manual puede alcanzar un cálculo fiscal; nunca interpolar un precio ausente; `docs/` intocable.

**Escala**: 5 proyecciones, 4 comandos, ~7 correcciones puntuales, 1 regeneración del *golden*.

## Verificación contra la constitución

*Puerta previa. Se vuelve a comprobar al terminar el diseño.*

| Principio | Cómo lo cumple esta feature |
|---|---|
| **I — El libro es la fuente de verdad** | Todo lo que esta feature muestra es derivado y recomputable: los precios salen de las `valuation` del libro, los pesos de las posiciones proyectadas y las comisiones de los eventos. No se almacena ningún agregado. `contributionPlan` **no escribe**. |
| **II — Lotes y fiscalidad solo desde el libro** | Ninguna de las cinco proyecciones nuevas toca lotes, ganancias ni fechas fiscales. `manualPrices` está marcado como informativo y ninguna función de `gains.ts`, `lots.ts` o `income.ts` lo importa; un test de arquitectura lo fija (T-ARCH). |
| **III — Compartimentación estricta** | `coreWeights`, `contributionPlan` y `transferSimulation` filtran por `book === "core"` como primera operación. `costSummary` devuelve dos estructuras separadas y ninguna función suma entre ellas; la CLI las imprime en tablas distintas. El presupuesto del cubo se muestra aparte y **no se asigna**. |
| **IV — Nada codificado que deba ser configurable** | Umbrales (`deviation_threshold_pp`, `satellite_min_weight_pct`, `stale_price_days`), pesos objetivo, porcentaje del cubo y aportación mensual salen de `Settings`; sin el parámetro, el aviso no se evalúa (nunca un valor por defecto inventado). El aviso de umbral silenciado (§3.6 del prompt) es exactamente la exigencia de este principio. |
| **V — Fallo seguro, nunca silencio** | Precio ausente ⇒ fila "sin precio" y total parcial, o rechazo con la lista; nunca un número que parece completo. Precio viejo ⇒ marca de antigüedad, nunca interpolación. Libro degradado ⇒ cabecera de aviso en toda consulta, nunca una respuesta que finge normalidad. |
| **VI — Supervivencia a 20 años** | Cero dependencias nuevas; aritmética decimal exacta; todo el código nuevo es dominio puro con las mismas primitivas de `money/`. |
| **VII — Tests donde un error cuesta dinero** | El reparto de la aportación es la prioridad 4 de la constitución: se cubre con propiedades (`fast-check`) además de los casos límite obligatorios. Cobertura 100 % en el dominio. |

**Sin violaciones que justificar.** La sección *Complexity Tracking* queda vacía.

## Investigación previa (prompt §2.3): qué cubren Ghostfolio y Portfolio Performance y nuestro §3 no

Lectura de la documentación pública de ambos (sin copiar código ni diseño).

**Portfolio Performance — vista de rebalanceo por taxonomías** ([manual](https://help.portfolio-performance.info/en/getting-started/rebalancing/), [taxonomías](https://help.portfolio-performance.info/en/reference/view/taxonomies/using-taxonomies/)): el usuario define una *Allocation* (porcentaje objetivo) por categoría de una taxonomía arbitraria (regiones, sectores, clases…), y cada valor lleva un *Weight* que permite repartir un mismo título entre varias categorías (un fondo global "70 % Norteamérica / 30 % Europa"). La vista muestra *Actual Value*, *Target Value* (= valor total × porcentaje objetivo) y *Delta*, y añade dos columnas de acción: **Rebalance (Amount)** y **Rebalance (Shares)**, con signo, es decir, propone **también ventas** y traduce el importe a **número de títulos**. Las asignaciones de una categoría deben sumar 100 % y hay realce de color cuando no suman.

**Ghostfolio** ([repositorio](https://github.com/ghostfolio/ghostfolio), [regla de riesgo por clase de activo](https://github.com/ghostfolio/ghostfolio/pull/4128)): vistas de asignación por clase de activo, sector, región y cuenta, y un módulo de "X-ray" de **reglas estáticas con umbrales configurables** (riesgo de concentración por clase de activo, por cuenta, colchón de emergencia, comisiones) que marcan la cartera en verde o rojo. Los precios llegan de proveedores de datos de mercado.

| Lo que ellos cubren y nuestro §3 no | Por qué queda fuera |
|---|---|
| Rebalanceo **en número de títulos** (PP: *Rebalance (Shares)*) | El núcleo se suscribe **por importe**, no por participaciones (ADR-0012: `amount` es la base de coste). Traducir a participaciones exigiría un VL que solo se conoce a D+1. Para ETC/ETP tendría sentido; se anota como candidato de la Ronda 7 (web). |
| Propuesta de **ventas** para rebalancear (delta negativo) | Regla 2 y regla 3: el rebalanceo por defecto es con dinero nuevo, y la venta es una decisión **anual** del usuario. La app avisa del umbral pero no propone la venta (prompt, decisión (d)). La regla 4 (orden de venta en retiradas) es funcionalidad futura. |
| **Varias taxonomías** y reparto parcial de un valor entre categorías (PP: *Weight*) | El núcleo tiene una sola taxonomía (`asset_class`) y un activo pertenece a exactamente una clase (`data-schema.md` §6.1). Repartir un fondo global entre regiones es un análisis de exposición, no de gestión, y sería otra feature. |
| **Precios automáticos** e histórico de valor | Fase 4 (Nivel 2 de precios, `PriceSource`); hasta entonces, `valuation` manual y marca de antigüedad. |
| Reglas de riesgo tipo X-ray (concentración por cuenta, colchón de emergencia) | El colchón bancario está fuera de alcance (ADR-0004) y la concentración por cuenta no es una regla del plan del usuario. Las dos reglas que sí lo son (3 y 6b) están en §3.2. |

| Lo que nuestro §3 cubre y ellos no |
|---|
| Reparto **exacto al céntimo** con redondeo half-up una vez por activo y suma garantizada al importe del núcleo (aritmética decimal, ADR-0005). PP muestra deltas; no garantiza un reparto que cuadre. |
| El **cubo como presupuesto** excluido de los pesos objetivo, con compartimentación estricta en todas las vistas. |
| **Fallo seguro ante un precio ausente**: ninguno de los dos distingue "sin precio" de "valor cero"; ambos muestran el último dato disponible sin marcar su antigüedad como parte del cálculo. |
| Umbral **mínimo de satélite** (regla 6b: 0 % o al menos el mínimo), que no es un umbral de desviación sino de significancia. |
| Aviso al **silenciar una alerta activa** cambiando un umbral (constitución IV). |
| Recordatorio de que el **traspaso entre fondos no es hecho imponible** integrado en el simulador. |

## Estructura del proyecto

### Documentación de la feature

```text
specs/004-monthly-contribution/
├── plan.md              # Este fichero
├── spec.md
├── questions.md         # Q1-Q3 y notas de lectura
├── research.md          # Investigación (§ anterior, ampliada) y decisiones de diseño
├── data-model.md        # Formas de las cinco proyecciones nuevas y de Settings
├── quickstart.md        # Recorrido manual: weights → contribute → order place
├── contracts/
│   ├── domain.md        # Firmas y contrato de las proyecciones nuevas
│   └── cli.md           # Comandos, flags, salidas y códigos de salida nuevos
├── checklists/requirements.md
└── tasks.md             # Lo genera /speckit-tasks
```

### Código

```text
packages/domain/src/
├── settings/settings.ts            # + wash_sale_window, normalización de la forma antigua, target_weights >= 0
├── schema/validate.ts              # + eur_fx_rate_not_one, fx_rate_date_weekend, dividend.source_country, transfer sin fee
├── dates/civil-date.ts             # + isWeekend (aritmética de calendario, ya hay isLeapYear/daysInMonth)
├── projections/
│   ├── prices.ts                   # NUEVO manualPrices
│   ├── weights.ts                  # NUEVO coreWeights + avisos de umbral
│   ├── contribution.ts             # NUEVO contributionPlan
│   ├── simulate-transfer.ts        # NUEVO transferSimulation
│   ├── costs.ts                    # NUEVO costSummary
│   └── settings-at.ts              # normaliza wash_sale_window al proyectar
├── usecases/record-event.ts        # + options.acceptInvalid (solo settings_changed)
├── synth/scenario.ts               # settings nuevos, fx_rate_date laborable, source_country, sin fee en transfer
└── index.ts                        # exports

apps/cli/src/
├── commands/portfolio.ts           # NUEVO weights · contribute · costs
├── commands/tracking.ts            # + transfer simulate
├── commands/catalogue.ts           # settings set: --target-weights, --wash-sale-window, --accept-invalid, avisos silenciados
├── commands/add.ts                 # dividend --source-country; transfer pierde --fee
├── commands/query.ts               # consultas degradadas
├── commands/shared.ts              # helper de proyección degradada + cabecera; helper de "destino dentro de un repo git"
├── commands/backup.ts, export.ts   # confirmación de destino dentro de un árbol git
└── main.ts                         # registro de comandos y USAGE
```

**Decisión de estructura**: se mantiene la de ADR-0007. Todas las reglas de negocio nuevas viven en `packages/domain` como funciones puras `(state, …) → resultado`; `apps/cli` solo compone, formatea y pregunta. Ni una sola decisión de negocio en la CLI, para que la web de la Ronda 7 la reutilice tal cual.

## Diseño

### D1. Bloque 0.1 — `wash_sale_window` (ADR-0014)

```ts
export type WashSaleWindow = "2m" | "1y" | `${number}d`;   // validada con expresión regular ^(2m|1y|[1-9][0-9]*d)$
export interface Settings {
  wash_sale_window: Record<AssetType, WashSaleWindow>;
  /** Forma antigua aceptada al cargar; equivale a `<n>d` (ADR-0014). */
  wash_sale_window_days?: Record<AssetType, number>;
  …
}
```

- `validateSettings` exige **una** de las dos formas completa para los seis `asset_type` (nueva o antigua) y rechaza si no hay ninguna. Si vienen las dos, manda la nueva (A7) y la antigua se conserva en la línea sin efecto.
- `normalizeSettings(settings)` (nueva, en `settings.ts`) devuelve un `Settings` con `wash_sale_window` siempre presente; se aplica **al proyectar** (`applySettingsChanged`) y en `DEFAULT_SETTINGS`, nunca reescribiendo la línea (§5 del esquema: el fichero no se reescribe por una migración; esto ni siquiera es una migración, es una lectura tolerante).
- `DEFAULT_SETTINGS.wash_sale_window`: `"2m"` para `stock`, `etc`, `etp`; `"1y"` para `fund`, `money_market`, `crypto`.
- **Ningún motor consume el valor**: la ventana de fecha a fecha es de la Fase 5. Solo se guarda y se valida.
- `validateSettings` gana además la comprobación de que cada `target_weights[assetId]` es **no negativo** (FR-012); la suma exacta a 100 ya estaba.

### D2. Bloque 0.2 — consultas degradadas (ADR-0015)

Un único punto de entrada en la CLI, para que ningún comando se olvide:

```ts
// apps/cli/src/commands/shared.ts
export const loadForQuery = async (ctx: Context): Promise<ProjectedLedger> =>
  loadAndProject(ctx.deps, { collectErrors: true });

/** Cabecera de aviso; vacía si no hay inválidos. Se emite antes de la tabla. */
export const degradedHeader = (state: LedgerState): string | undefined => …;
```

`render(ctx, data, text)` pasa a `render(ctx, data, text, state?)`: con `--json`, añade `invalid_count` al objeto raíz; en texto, antepone la cabecera. Para `export`, la cabecera va a `ctx.io.err` (A9). Los 17 comandos de solo lectura pasan por ahí. Las mutaciones siguen usando `loadAndProject(ctx.deps)` en modo estricto.

### D3. Bloque 0.3 — `settings_changed` con `acceptInvalid` (ADR-0015)

En `record-event.ts`, reutilizando la mecánica de `checkCandidate` de `rectify.ts` (extraída a una función compartida `newlyInvalid(current, candidate)` en `usecases/`):

```ts
export interface RecordOptions {
  confirmDuplicate?: boolean;
  /** Solo admitido para settings_changed (ADR-0015). */
  acceptInvalid?: boolean;
}
```

1. Si `acceptInvalid` viene con un evento que no es `settings_changed` → `ValidationError("accept_invalid_not_allowed")`.
2. Se proyectan con `collectErrors` el libro actual y el candidato; el conjunto **nuevo** de inválidos = inválidos del candidato − inválidos del actual (mismo criterio que `reverseEvent`).
3. Si el propio evento nuevo es inválido → se lanza su error, siempre (ni `acceptInvalid` lo salva).
4. Si hay otros nuevos inválidos y no hay `acceptInvalid` → `DependentEventsError` (se reutiliza; ya lleva `affected[]` con id, tipo y motivo, y la CLI ya sabe imprimirla).
5. Con `acceptInvalid`, se escribe y `RecordResult` gana `newlyInvalid: AffectedEvent[]` para que la CLI informe.

`recordEvent` pasa a proyectar con `collectErrors` (necesita ver la lista completa, no abortar en el primero), pero **el criterio de rechazo no se relaja para nadie**:

- Para cualquier evento que **no** sea `settings_changed`: si la proyección del candidato tiene **algún** evento inválido —nuevo o preexistente—, se lanza el error del primero en orden de fichero. Es exactamente lo que ocurre hoy con la proyección estricta ("las demás mutaciones siguen exigiendo un libro válido", ADR-0015), con el mismo código de error y el mismo mensaje.
- Solo `settings_changed` distingue preexistentes de nuevos, que es lo que el ADR le concede.

Se cubre con test: mutación normal sobre un libro ya degradado ⇒ rechazo con el código del evento roto.

### D4. Bloque 0.4 — validaciones de `fx_rate` (`data-schema.md` §4)

En `validate.ts`, dos reglas nuevas declarativas, para no repetirlas evento a evento:

```ts
/** Pares (divisa, tipo) que un tipo de evento o un efecto declara. */
const FX_PAIRS: Partial<Record<SupportedEventType, readonly [string, string][]>> = {
  buy: [["currency", "fx_rate"]], …,
  fx_exchange: [["sold_currency", "fx_rate_sold"], ["bought_currency", "fx_rate_bought"]],
};
const FX_DATE_FIELDS: … = { buy: ["fx_rate_date"], … };
```

- `eur_fx_rate_not_one`: si el campo de divisa vale `"EUR"`, el de tipo debe ser la cadena `"1"` exacta.
- `fx_rate_date_weekend`: `isWeekend(date)` nueva en `dates/civil-date.ts`, calculada con la fórmula de Zeller o con `Date.UTC` sobre la fecha civil (sin zona horaria: una fecha civil no tiene hora). Se aplica a todo campo de fecha de tipo de cambio, incluidos los de los efectos `forced_sale` y `grant`.
- Los efectos reutilizan las mismas dos comprobaciones dentro de `checkEffects`.

### D5. Bloque 0.5-0.7 — `transfer` sin `fee`, `dividend.source_country`, destino dentro de un repo

- `transfer`: se borra `fee: opt("decimal")` de sus reglas; como `validateShape` no rechaza campos desconocidos, se añade un rechazo **explícito** (`transfer_fee_not_allowed`) con el mensaje que remite a `standalone_fee` — si no, un `fee` viejo se ignoraría en silencio, que es justo lo que el hallazgo 6 quería evitar. `deepCheck` ya avisa `unknown_field`, pero eso es una verificación trimestral, no un rechazo al registrar. El flag `--fee` sale de `atlas add transfer`.
- `dividend`: `source_country: opt("country")` (la regla `country` ya existe y es `^[A-Z]{2}$`); flag `--source-country`.
- `insideGitWorktree(path)` en `apps/cli/src/commands/shared.ts`: sube desde el directorio de destino resolviendo `.git` (fichero o directorio) hasta la raíz; devuelve la ruta del repositorio encontrado o `undefined`. `backup` y `export --out` piden confirmación (`confirm(ctx, …)`, que ya respeta `--yes` y lanza `ConfirmationRequired` sin terminal).

### D6. `manualPrices` (§3.1)

```ts
export interface ManualPrice {
  asset_id: AssetId; event_id: Ulid; date: CivilDate;
  unit_value: Decimal; currency: Currency; fx_rate: Decimal;
  unit_value_eur: Money;      // unit_value / fx_rate, 10 decimales
  age_days: number; stale: boolean;
}
export const manualPrices = (state, date, settings) => Map<AssetId, ManualPrice>;
```

`state.valuations` ya está en orden `(fecha, posición en fichero)` porque la pasada B las ordena así, de modo que recorrer y quedarse con la última con `date ≤` la pedida **por activo** (no por cuenta, a diferencia de `valuations()`) da exactamente la regla de la decisión (b). `age_days` = días entre la fecha del precio y la pedida (aritmética de fecha civil, ya existe `addDays` en `synth/calendar.ts`; se mueve a `dates/civil-date.ts` como `daysBetween`, que es donde le corresponde y donde el dominio ya la tiene disponible sin tocar `synth`).

### D7. `coreWeights` (§3.2)

```ts
export interface CoreWeightRow {
  asset_id; asset_class; quantity; price?: ManualPrice;
  value_eur?: Money; weight_pct?: Decimal; target_pct: Decimal; deviation_pp?: Decimal;
}
export interface CoreWeights {
  rows: CoreWeightRow[]; by_class: ClassSubtotal[]; total_eur: Money;
  partial: boolean; missing_prices: AssetId[]; warnings: Warning[];
}
```

- Universo de filas: activos `core` del catálogo con posición agregada > 0 **o** con `target_weights[asset_id] > 0` (A2, Q1 resuelta).
- Una fila **con posición y sin precio** entra en `missing_prices`. Una fila **sin posición** vale cero sin precio y **no** entra: `quantity = 0`, `value_eur = 0`, `price = undefined`, y no hay dato ausente que ocultar.
- `partial = missing_prices.length > 0`. Si `partial`, `weight_pct` y `deviation_pp` quedan `undefined` en **todas** las filas y en los subtotales, y `total_eur` es la suma de lo que sí tiene precio, etiquetada como parcial.
- Avisos: `unknown_target_weight`, `asset_without_target`, `deviation_above_threshold` (estricto: `|desv| > umbral`), `satellite_below_minimum` (`0 < peso < mínimo`, solo `gold` y `crypto`). Los dos últimos no se evalúan si falta su parámetro o si `partial`.
- Los avisos se devuelven en la estructura, **no** se empujan a `state.warnings`: son avisos de consulta, no del libro (el libro es válido). `Warning.event_id` se rellena con el id del `settings_changed` vigente, o queda vacío cuando el aviso no nace de un evento; la CLI los imprime al pie.

### D8. `contributionPlan` (§3.3, decisión (d))

Aritmética exacta con `Decimal`/`Money`, redondeo solo al final:

1. `bucket = round2(amount × pct / 100)`; `core = amount − bucket`.
2. `V = Σ value_i` (activos con precio); `target_i = w_i/100 × (V + core)`; `gap_i = max(0, target_i − value_i)`.
3. `Σgap ≥ core` → `raw_i = core × gap_i / Σgap`. `Σgap < core` → `raw_i = gap_i + (core − Σgap) × w_i / 100`.
4. `alloc_i = round2(raw_i)` (half-up, una vez por activo). `residuo = core − Σ alloc_i`.
5. El residuo se aplica al activo de mayor `gap_i` (empate: mayor `w_i`, después `asset_id`); si el residuo es negativo y dejaría esa asignación por debajo de cero, se le resta solo lo que tiene y se pasa al siguiente (A6). Invariante final comprobado en la propia función: `Σ alloc_i === core` y `alloc_i ≥ 0`.

Rechazos (`ValidationError` con código): `missing_target_weights`, `missing_bucket_pct`, `invalid_amount`, `missing_manual_prices` (con `assets[]` y la fecha; solo activos **con posición**, A2). El caso `Σgap = 0` cae en la rama del sobrante (paso 3, segunda fórmula) sin división por cero; el caso `core = 0` devuelve todas las asignaciones a cero.

### D9. `transferSimulation` (§3.4) y `costSummary` (§3.5)

- **Simulación**: valida (`core`, `transferable`, distintos, existen, hay precio de los dos, cantidad ≤ posición), calcula `moved_eur = quantity × unit_value_eur(from)` y devuelve `before`/`after` como dos `CoreWeights` calculados con los mismos valores salvo el traslado del importe. Es una consulta pura: no construye ningún evento ni pasa por `recordEvent`.
- **Costes**: recorre los eventos no anulados. Por activo `core`: `fees_eur = Σ fee/fx_rate` de `buy`, `sell` y de los efectos `forced_sale` de sus `corporate_action` (Q2 resuelta); `invested_eur = Σ` coste de sus compras; `fees_pct = fees/invested` (vacío si no hay compras); `ter`, `annual_cost_eur = ter/100 × valor` solo con precio. Agregado: TER medio ponderado por valor sobre la parte con precio, marcado parcial si falta alguno. Cubo: `Map<AccountId, Money>` con las comisiones de sus `buy`, `sell` y `forced_sale`, en su propia estructura.

### D10. CLI

Cuatro comandos nuevos (`weights`, `contribute`, `costs`, y `transfer simulate` como subcomando del ya existente `transfer`), todos de solo lectura, todos con `--date`, `--json` y la cabecera degradada. `atlas settings set` gana `--target-weights` (pares `asset_id=peso`, con el `parseAssignments` que ya existe), `--wash-sale-window` (pares `asset_type=2m|1y|<n>d`), `--accept-invalid`, y el chequeo de avisos silenciados antes de confirmar. `USAGE` y `README` se actualizan.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| El residuo del redondeo produce una asignación negativa en carteras diminutas | Regla explícita de derrame (A6) y propiedad `fast-check` que la ejercita con importes de céntimos |
| `recordEvent` pasando a `collectErrors` cambia el mensaje de error de mutaciones normales | Los tests existentes de `record-event.test.ts` y `add.test.ts` fijan los códigos actuales; se ejecutan sin tocarlos y se ajusta el código, no el test, si cambia algo |
| Regenerar el *golden* oculta una regresión de proyección | El commit de regeneración es **solo** el fichero y su instantánea, con el mensaje justificándolo; antes se comprueba que la única diferencia esperada viene de los cambios declarados (fechas laborables, settings nuevos, `source_country`) |
| El 100 % de cobertura empuja a tests artificiales | Cada rama nueva tiene un caso de negocio real detrás (los 15 casos límite obligatorios del prompt §3.8 cubren la mayoría) |

## Complexity Tracking

Sin violaciones de la constitución que justificar.
