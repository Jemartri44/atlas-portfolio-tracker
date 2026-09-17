# Modelo de datos — feature 004-monthly-contribution

Formas de las estructuras nuevas. **Ninguna se almacena**: todas son proyecciones puras recalculadas en cada carga (constitución I). Los importes son `Money`/`Decimal` (ADR-0005); en `--json` salen como cadenas decimales.

## 1. Cambios en `Settings` (bloque 0, ADR-0014)

```ts
export type WashSaleWindow = "2m" | "1y" | `${number}d`;   // ^(2m|1y|[1-9][0-9]*d)$

export interface Settings {
  fiscal_date_rule: Record<AssetType, FiscalDateRule>;
  /** Ventana de recompra por tipo de activo, contada de fecha a fecha (ADR-0014). */
  wash_sale_window: Record<AssetType, WashSaleWindow>;
  /** Forma antigua, aceptada al cargar; equivale a `<n>d`. Nunca la escribe la CLI (A8). */
  wash_sale_window_days?: Record<AssetType, number>;
  target_weights?: Record<AssetId, DecimalString>;   // valores >= 0, suman exactamente 100
  … (el resto, sin cambios)
}
```

- `DEFAULT_SETTINGS.wash_sale_window`: `stock`, `etc`, `etp` → `"2m"`; `fund`, `money_market`, `crypto` → `"1y"`.
- `validateSettings` exige que **una** de las dos formas cubra los seis `asset_type`. Con las dos presentes, manda la nueva (A7).
- `normalizeSettings(raw)`: devuelve un `Settings` con `wash_sale_window` siempre completo. Se aplica al **proyectar** (`applySettingsChanged`), nunca reescribiendo la línea.
- Ningún consumidor en esta feature: la ventana la usa el motor fiscal de la Fase 5.

## 2. `ManualPrice` (§3.1)

```ts
export interface ManualPrice {
  asset_id: AssetId;
  event_id: Ulid;            // la `valuation` de la que sale
  date: CivilDate;           // fecha de esa valoración
  unit_value: Decimal;       // en `currency`, tal cual se registró
  currency: Currency;
  fx_rate: Decimal;          // tipo BCE tal cual (ADR-0013)
  unit_value_eur: Money;     // unit_value / fx_rate, 10 decimales
  age_days: number;          // días entre `date` y la fecha pedida (>= 0)
  stale: boolean;            // age_days > stale_price_days; false si el parámetro no está
}

manualPrices(state: LedgerState, date: CivilDate, settings: Settings): Map<AssetId, ManualPrice>
```

Selección: la `valuation` de mayor `date` con `date <= ` la pedida, de cualquier cuenta; a igualdad de fecha, la última en orden de fichero (decisión (b)). Un activo sin ninguna candidata no aparece en el mapa: **la ausencia es el dato**, nunca un cero.

## 3. `CoreWeights` (§3.2)

```ts
export interface CoreWeightRow {
  asset_id: AssetId;
  asset_class: AssetClass;
  quantity: Quantity;            // agregada entre cuentas del núcleo
  price?: ManualPrice;           // ausente = "sin precio"
  value_eur?: Money;             // quantity × unit_value_eur; "0" exacto si quantity = 0
  target_pct: Decimal;           // 0 si el activo no está en target_weights
  weight_pct?: Decimal;          // vacío si el total es parcial
  deviation_pp?: Decimal;        // weight_pct − target_pct; vacío si el total es parcial
}

export interface ClassSubtotal {
  asset_class: AssetClass;
  value_eur?: Money;
  weight_pct?: Decimal;
  target_pct: Decimal;           // suma de los objetivos de sus activos
  deviation_pp?: Decimal;
}

export interface CoreWeights {
  date: CivilDate;
  rows: CoreWeightRow[];         // orden: por clase (equity, fixed_income, gold, crypto) y por asset_id
  by_class: ClassSubtotal[];
  total_eur: Money;              // suma de lo que sí tiene valor
  partial: boolean;              // hay algún activo CON POSICIÓN sin precio
  missing_prices: AssetId[];     // solo activos con posición (A2)
  stale_prices: AssetId[];
  warnings: Warning[];
}
```

Universo de filas: activos `core` del catálogo con `quantity > 0` **o** con `target_weights[asset_id] > 0` (A2). Una fila sin posición vale `0` sin precio y no hace `partial`. Si `partial`, `weight_pct` y `deviation_pp` quedan vacíos en filas y subtotales.

**Códigos de aviso**: `unknown_target_weight` (clave de `target_weights` que no es activo `core` del catálogo), `asset_without_target` (activo `core` con posición sin peso), `deviation_above_threshold` (`|deviation_pp| > deviation_threshold_pp`), `satellite_below_minimum` (`gold` o `crypto` con `0 < weight_pct < satellite_min_weight_pct`), `partial_core_total` (hay precios ausentes; explica por qué no hay pesos). Los tres que dependen de un parámetro no se evalúan sin él; los dos que dependen de los pesos no se evalúan si `partial`.

## 4. `ContributionPlan` (§3.3)

```ts
export interface ContributionRow {
  asset_id: AssetId;
  asset_class: AssetClass;
  value_eur: Money;              // valor actual
  target_eur: Money;             // w_i/100 × (V + core)
  gap_eur: Money;                // max(0, target − value)
  allocation_eur: Money;         // redondeada a céntimos, >= 0
  value_after_eur: Money;        // value + allocation
  weight_after_pct: Decimal;     // sobre V + core
}

export interface ContributionPlan {
  date: CivilDate;
  amount_eur: Money;             // aportación total
  amount_origin: "flag" | "settings";
  bucket_budget_eur: Money;      // round2(amount × pct / 100); NO se asigna
  core_amount_eur: Money;        // amount − bucket
  core_value_eur: Money;         // V
  rows: ContributionRow[];
  /** true cuando Σgap < core y hubo sobrante repartido por pesos objetivo. */
  surplus_distributed: boolean;
  warnings: Warning[];           // los mismos de coreWeights
}

contributionPlan(state, { amount, date, settings }): ContributionPlan
```

**Invariantes comprobados dentro de la función** (no solo en los tests): `Σ allocation_eur === core_amount_eur` exactamente, y `allocation_eur >= 0` para toda fila.

**Rechazos** (`ValidationError`): `missing_target_weights`, `missing_bucket_pct`, `invalid_amount` (ausente, no decimal, cero o negativo), `missing_manual_prices` (`{ assets: AssetId[], date }`, solo activos con posición).

## 5. `TransferSimulation` (§3.4)

```ts
export interface TransferSimulation {
  date: CivilDate;
  from_asset_id: AssetId;
  to_asset_id: AssetId;
  quantity: Quantity;
  moved_eur: Money;              // quantity × unit_value_eur(from)
  before: CoreWeights;
  after: CoreWeights;
  /** Constante informativa: un traspaso entre fondos no es hecho imponible (business-rules.md §5.2). */
  taxable: false;
}
```

**Rechazos**: `unknown_asset`, `not_core_asset`, `not_transferable`, `same_asset`, `missing_manual_prices`, `insufficient_position`. No construye ningún evento ni pasa por `recordEvent`: `after` se calcula moviendo el importe entre dos filas del mismo cálculo.

## 6. `CostSummary` (§3.5)

```ts
export interface CoreCostRow {
  asset_id: AssetId;
  asset_class: AssetClass;
  fees_eur: Money;               // Σ fee/fx_rate de buy, sell y forced_sale (Q2)
  invested_eur: Money;           // Σ coste de adquisición de sus compras
  fees_pct?: Decimal;            // fees/invested × 100; vacío sin compras
  ter?: Decimal;                 // asset.ter
  value_eur?: Money;             // solo con precio
  annual_cost_eur?: Money;       // ter/100 × value_eur
}

export interface CoreCostTotals {
  fees_eur: Money;
  invested_eur: Money;
  value_eur: Money;              // parte con precio
  weighted_ter?: Decimal;        // ponderado por valor sobre la parte con precio
  annual_cost_eur?: Money;
  partial: boolean;              // falta el precio de algún activo con posición
}

export interface BucketCostRow { account_id: AccountId; fees_eur: Money; }

export interface CostSummary {
  date: CivilDate;
  core: { rows: CoreCostRow[]; totals: CoreCostTotals };
  bucket: { rows: BucketCostRow[] };   // total por cuenta, nada más (Fase 3 amplía)
}
```

`core` y `bucket` son dos estructuras hermanas sin ningún campo compartido ni ningún total común: la compartimentación se hace imposible de romper por accidente (constitución III).

## 7. Cambios en tipos existentes

| Tipo | Cambio |
|---|---|
| `RecordOptions` | `+ acceptInvalid?: boolean` (solo `settings_changed`) |
| `RecordResult` | `+ newlyInvalid: AffectedEvent[]` (vacío salvo con `acceptInvalid`) |
| `DividendEvent` | `+ source_country?: string` (ISO 3166-1 alfa-2) |
| `TransferEvent` | `− fee?` (rechazo explícito `transfer_fee_not_allowed`) |
| `ProjectedLedger` | sin cambios; el modo degradado se pide con `ProjectOptions.collectErrors`, que ya existe |

## 8. Códigos de error nuevos

`eur_fx_rate_not_one`, `fx_rate_date_weekend`, `transfer_fee_not_allowed`, `accept_invalid_not_allowed`, `invalid_wash_sale_window`, `negative_target_weight`, `missing_target_weights`, `missing_bucket_pct`, `invalid_amount`, `missing_manual_prices`, `not_core_asset`, `not_transferable`, `same_asset`, `unknown_asset`.

Los de rechazo de `settings_changed` que invalida el pasado reutilizan `DependentEventsError` con `code = "newly_invalid_events"`.
