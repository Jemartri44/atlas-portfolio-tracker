# Modelo de datos: `020-visual-refresh`

**Nada de esto toca el libro.** Ni un tipo de evento, ni un campo, ni `schema_version`, ni un campo de `Settings`. Son **valores derivados** que el dominio calcula a partir del libro y de `Settings`, y formas de presentación que calcula la web. Todo es propuesta hasta el visto bueno de la dirección; lo que decide la dirección va marcado **[decide]**.

## 1. Dominio, en el barril (quinta necesidad, §0 punto 1 del encargo)

### `hasForeignAccountsAt(events, date, settings): boolean` (E2)

- **Dónde**: `packages/domain/src/projections/foreign-accounts.ts`, fuera de `informative/` (que está en `LAZY_ONLY`); exportada por `index.ts`.
- **Qué dice**: si alguna cuenta del catálogo, **tal como estaba en `date`**, tiene un país distinto de `settings.tax_residence`.
- **«Tal como estaba»**: la misma regla que `accountsAt` (`informative/holdings.ts:69`): un `account_created` o `account_updated` cuenta desde el día en que **se registró** (`madridDateOf(recorded_at) <= date`), porque el catálogo no tiene fecha de negocio (ADR-0016, S6/Q6 de la 010). La última versión de cada cuenta hasta esa fecha manda. Activas y dadas de baja cuentan igual, como en `fiscalAttention`, para que el predicado sea **un superconjunto** de lo que puede producir un aviso del 720/721 con la residencia `ES`.
- **Sin `tax_residence`**: vuelve a la regla que hoy aplica el motor, «alguna cuenta con país distinto de `ES`», **dentro de esta función**, nunca en la web (Q3, respondida el 2026-09-27). Con su test y su mutante (11 ter).
- **Sin cuentas**: `false`.
- **No lee `Date`**: la fecha entra como argumento.
- **Coste**: se mide con un prototipo antes del commit (estimación: +60 a +90 bytes gzip en el arranque).

### `inRentaSeason(settings, date): boolean` (E2, propuesta Q5)

- La regla `inSeason` de `informative/attention.ts`, movida a `settings/settings.ts` junto a `rentaSeasonOf` y exportada por el barril, para que el Resumen coloque *Declaración* en la primera pintada. `fiscalAttention` pasa a usarla. Compara el `MM-DD` de la fecha consultada con la campaña, ambos extremos incluidos.

### `NEAR_LIMIT_PCT` (E3)

- Hoy `const NEAR_LIMIT_PCT = Decimal.parse("80")` sin exportar (`projections/bucket-stats.ts:38`). Pasa a `export const`, y `index.ts` lo exporta. El valor y su comentario («no configurable a propósito») no cambian.
- **Coste**: unos bytes del nombre en la tabla de exportaciones del trozo del dominio; se mide.

## 2. Dominio, cambio de regla (E2)

### `fiscalAttention(...).prominent`

- **Antes**: `season || todo.length > 0 || state.invalid.length > 0`.
- **Después**: `season`. Todo lo demás de `FiscalAttention` (`todo`, `unfiled_years`, `invalid_events`, `season`) **no cambia**: cambia dónde se dice, no que se diga.
- `inSeason` sigue comparando `MM-DD` de la fecha consultada con `rentaSeasonOf(settings)`, ambos extremos incluidos. La fecha es civil (`CivilDate`), que la web ya calcula en Europe/Madrid (`ledger/state.ts:202`).

## 3. Dominio, puertas perezosas nuevas

**[decide] los nombres** (§7.2 (e) del encargo). Propuesta:

- **`@atlas/domain/charts`** (`packages/domain/src/charts.ts`): las series y los indicadores de las pantallas perezosas (lo aportado, el cubo en porcentaje por fecha, los porcentajes de las tesis y de los medidores del cubo). Con el patrón de `@atlas/domain/tools`: una regla de `tests/architecture.test.ts` que impide que el barril la exporte o que otro módulo del dominio la importe, y su entrada en `LAZY_ONLY` **desde su primer commit**.
- **El calendario, en `@atlas/domain/fiscal`**, en `packages/domain/src/informative/calendar.ts` (la carpeta ya está en `LAZY_ONLY`) y exportado por `fiscal.ts`.
- **`netWorthSeries` y `bucketIndexSeries` no se mudan** por defecto: mudarlos libera arranque, que hoy sobra, y cuesta total (la fontanería de un trozo más), que es lo que falta. Se mide en E4 y se propone solo si el arranque se aprieta (plan §6).

### `contributedSeries(events, options): ContributedSeries` (E4, M3)

```
ContributedPoint  { date: CivilDate; contributed_eur: Money }      // nunca ausente
ContributedSeries { from; to; points: ContributedPoint[];
                    uncovered_buys: boolean }                      // [decide] plan §5, caso 6
```

- Las **mismas fechas** que `netWorthSeries` con las mismas opciones (el test lo exige punto a punto), para que los paneles compartan el eje.
- Definición: plan §5, caso a caso, **como propuesta** para `business-rules.md`.

### `bucketIndexPctSeries(events, options): BucketIndexPctSeries` (E4, M7)

```
BucketIndexPctPoint { date; result_pct?: Decimal; benchmark_pct?: Decimal; vs_index_pct?: Decimal;
                      missing: BenchmarkGap[]; idle: number }
```

- Consume `bucketIndexSeries` punto a punto (no recalcula la regla 16) y divide por **lo aportado al cubo a esa fecha**, el mismo denominador que `bucketStats.vs_index_pct` (`contribution_gross_eur`, `bucket-stats.ts:345`), calculado con la misma función de flujos (`cashFlowsOf`, que pasa a exportarse del módulo, no del barril) cortada en la fecha.
- Ausente (los tres porcentajes) si el punto no tiene comparación, o si lo aportado a esa fecha es cero.
- **Invariante probado**: en la última fecha, `vs_index_pct` es exactamente el `vs_index_pct` de `bucketStats` a esa fecha.

### `thesisVsIndexPct(thesis): { thesis_pct?, index_pct?, vs_index_pp? }` (E3, M1 y M10) **[decide] plan §4.4**

- Sobre una fila de `bucketTheses`: `thesis_pct = (result + latente) / invertido × 100`, `index_pct = (equivalente − invertido) / invertido × 100`, `vs_index_pp = thesis_pct − index_pct` = `result_vs_index / invertido × 100`. Ausentes si falta la comparación o lo invertido es cero. El denominador es el de la regla 16 («ese mismo importe»).

### `bucketGauges(controls, settings): BucketGauges` (E3, M1 y M10) **[decide] plan §4.4**

```
BucketGauges { contribution_pct_of_cap?: Decimal;   // bruto / tope × 100, como el aviso de bucket-stats.ts:392
               near_limit_pct: Decimal;             // NEAR_LIMIT_PCT
               result_pct?: Decimal;                // (realizado + latente) / bruto × 100, con signo (= −loss_pct)
               stop_loss_pct?: Decimal;             // Settings.bucket_stop_loss_pct
               weight_pct?: Decimal;                // controls.weight_pct
               max_weight_pct?: Decimal }           // Settings.bucket_max_weight_pct
```

- **Invariante probado** (propiedad, `fast-check`, que ya es dependencia de desarrollo): el relleno del primer medidor pasa de la marca **si y solo si** el dominio emite `bucket_contribution_near_limit`. Así la fórmula repetida no puede derivar de la del aviso.

### `fiscalCalendar(events, today): FiscalCalendar` (E4, M12)

```
CalendarDate  { date: CivilDate;
                kind: "wash_sale_end" | "filing_deadline" | "year_end_valuation" | "season_start" | "season_end";
                year?: number; model?: "720" | "721" | "renta";
                sources: string[] }          // ids de lo que la origina (evento de venta, activo); nunca un importe
FiscalCalendar { year: number; season: { start: CivilDate; end: CivilDate };
                 dates: CalendarDate[];      // ordenadas; incluye las que caen fuera de `year`
                 unknown_deadlines: { model; year }[] }   // ejercicios sin dato normativo: se dice, no se supone
```

- **Ventanas**: una por cada venta con pérdida cuya ventana **posterior** siga abierta en `today`, con `washSaleWindowEnd(fiscal_date, washSaleWindowOf(settings, asset_type))`. No se recalcula nada.
- **Plazos**: de una tabla normativa por modelo y ejercicio en `informative/deadlines.ts`, con su fuente (R5). Forma de la tabla: **Q4**.
- **Valoración**: `yearEnd(year)` del ejercicio en curso.
- **Campaña**: `rentaSeasonOf(settings)` del año de `today`.
- **Qué año enseña**: **[decide] plan §4.6**.

### Tabla normativa de plazos (`informative/deadlines.ts`)

```
FilingDeadline { model: "720" | "721"; year: number; deadline: CivilDate;
                 verified: boolean;          // false si el 31/03 cae en fin de semana: sin fuente primaria para el día efectivo
                 source: { norm: string; article: string; url: string; checked: CivilDate } }
```

## 4. Web, modelos de vista (presentación, funciones puras con su test)

- **`view-models/attention.ts`**: saca `export_overdue` de la lista a un campo aparte (`dataLoss`), añade el aviso del 720/721 y el de inválidos fiscal, y la fila reservada (`reserveFiscal: boolean`), que cuenta entre los cuatro visibles.
- **`view-models/summary-order.ts`** (nuevo): el orden de las tarjetas del Resumen por la campaña (móvil y monitor).
- **`view-models/movements.ts`**: `groupByMonth(rows)` y `groupValuations(rows)` (hoy el agrupamiento por día vive en `MovementList.tsx`, en el componente; se muda al modelo de vista).
- **`components/chart/ranges.ts`**: `"ESTE_ANO"` en lugar de `"1M"`, con la fecha consultada como argumento.
- **`view-models/series.ts`**: `gapRule(x, values, range)` (la regla del hueco del cubo, `>` la mitad) y la serie de lo aportado en la tabla equivalente.
- **`view-models/core/contribution.ts`**: el porcentaje de cada tipo de activo sobre la parte de la cartera, con `Decimal`.
- **Tablas con privacidad**: una forma de `DataTable` (`maskedMerge`), no un segundo camino para decidir qué se oculta.
