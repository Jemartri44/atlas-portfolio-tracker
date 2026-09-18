# Modelo de datos — feature 005-bucket-tracking

Formas de las estructuras nuevas. **Ninguna se almacena**: todas son proyecciones puras recalculadas en cada carga (constitución I). Los importes son `Money`/`Decimal` (ADR-0005); en `--json` salen como cadenas decimales. Un campo **ausente** significa "sin dato" y nunca se sustituye por cero (constitución V).

## 1. Cambios en el esquema (bloque 0, ADR-0018)

```ts
export const ASSET_TYPES = ["fund", "etf", "etc", "etp", "stock", "crypto", "money_market"] as const;
```

| Evento | Campo nuevo |
|---|---|
| `valuation` | `fx_rate_date?` (fecha del tipo BCE aplicado; validada como el resto: fecha válida, nunca fin de semana) |
| `cash_deposit` | `fx_rate_date?` |
| `cash_withdrawal` | `fx_rate_date?` |
| `standalone_fee` | `fx_rate_date?` |

Los cuatro son **compatibles**: campo opcional, sin `schema_version` nueva ni migración.

## 2. Cambios en `Settings`

```ts
export interface Settings {
  /** Mapa PARCIAL: un tipo ausente toma su valor por defecto documentado (ADR-0018). */
  fiscal_date_rule: Partial<Record<AssetType, FiscalDateRule>>;
  /** Mapa PARCIAL, igual. */
  wash_sale_window: Partial<Record<AssetType, WashSaleWindow>>;
  /** Forma antigua, también parcial; equivale a `<n>d` (ADR-0014). */
  wash_sale_window_days?: Partial<Record<AssetType, number>>;
  /** Índice de referencia del cubo (regla 16). Cualquier libro; solo sirve de referencia. */
  bucket_benchmark_asset_id?: string;
  … (el resto, sin cambios)
}

export const DEFAULT_FISCAL_DATE_RULE: Record<AssetType, FiscalDateRule>;   // etf → trade_date
export const DEFAULT_WASH_SALE_WINDOW: Record<AssetType, WashSaleWindow>;   // etf → "2m"
```

- `validateSettings` acepta mapas parciales y sigue rechazando un valor presente inválido.
- El valor por defecto se resuelve **en el punto de uso** (`fiscalDateOf`, `washSaleWindowOf`) y en `settingsAt` al leer. `state.fiscalSettings` y `state.settingsHistory` conservan lo que dice la línea, así que la instantánea no cambia.

## 3. El precio de un activo (puerta única, §3.0 ter)

```ts
export interface PriceLookup {
  asset_id: AssetId;
  /** Qué fuente ganó. El manual gana SIEMPRE al automático (decisión (j)). Hoy siempre "manual". */
  origin: "manual" | "external";
  /** La `valuation` de la que sale, si el origen es manual. */
  event_id?: Ulid;
  date: CivilDate;          // fecha del precio
  unit_value: Decimal;      // en `currency`, tal cual se registró
  currency: Currency;
  fx_rate: Decimal;         // tipo BCE tal cual (ADR-0013)
  unit_value_eur: Money;    // unit_value / fx_rate, 10 decimales
  age_days: number;         // días entre `date` y la fecha pedida (>= 0)
  stale: boolean;           // age_days > stale_price_days; false si el parámetro no está
}

priceAt(state, assetId, date, settings, external?): PriceLookup | undefined
manualPrices(state, date, settings, external?): Map<AssetId, PriceLookup>
```

`ManualPrice` pasa a ser un alias de `PriceLookup` para no romper a quien lo importa. Un activo sin precio **no aparece**: la ausencia es el dato.

## 4. Tipos de cambio conocidos (en el estado)

```ts
interface KnownFxRate { rate: Decimal; date: CivilDate; event_id: Ulid }
// LedgerState
fxRates: Map<Currency, KnownFxRate>;   // último por divisa, en orden cronológico de proyección
```

`date` es el `fx_rate_date` del evento cuando lo trae y, si no, su fecha de negocio. **No entra en `snapshotOf`.**

## 5. `NetWorth` (§3.1)

```ts
export interface CashLine {
  account_id: AccountId;
  currency: Currency;
  balance: Money;            // importe original
  fx_rate?: Decimal;         // último conocido de esa divisa; ausente en EUR y cuando no hay ninguno
  fx_rate_date?: CivilDate;
  fx_age_days?: number;
  fx_stale?: boolean;
  value_eur?: Money;         // balance / fx_rate; ausente = "sin convertir"
}

export interface BookBlock {
  rows: { account_id?: AccountId; asset_id?: AssetId; value_eur?: Money }[];
  total_eur: Money;          // suma de lo que sí tiene valor
  partial: boolean;
  missing_prices: AssetId[];
}

export interface NetWorth {
  date: CivilDate;
  core: BookBlock & { by_class: ClassSubtotal[] };
  bucket: BookBlock;
  cash: { rows: CashLine[]; total_eur: Money; partial: boolean; missing_rates: Currency[] };
  total_eur: Money;
  partial: boolean;
  stale: { assets: AssetId[]; currencies: Currency[] };
  warnings: Warning[];
}
```

Los tres bloques se devuelven **siempre**, aunque valgan cero. No existe ninguna función que devuelva solo `total_eur`.

## 6. `BucketPosition` (§3.2)

```ts
export interface BucketPosition {
  account_id: AccountId;
  asset_id: AssetId;
  quantity: Quantity;
  unit_cost_eur?: Money;     // coste medio de los lotes abiertos del activo
  cost_eur?: Money;          // unit_cost × quantity
  price?: PriceLookup;       // ausente = "sin precio"
  value_eur?: Money;
  unrealized_eur?: Money;    // value − cost
  unrealized_pct?: Decimal;  // sobre el coste; ausente si el coste es cero
  thesis_id?: string;        // tesis ABIERTA de ese par (cuenta, activo)
  days_open?: number;
  expected_horizon_days?: number;
  horizon_exceeded?: boolean;
  invalidation?: string;
}

export interface BucketPositions {
  date: CivilDate;
  rows: BucketPosition[];
  total_value_eur: Money;
  total_cost_eur: Money;
  partial: boolean;
  missing_prices: AssetId[];
  stale_prices: AssetId[];
  warnings: Warning[];
}
```

## 7. `BucketThesisView` (§3.3)

```ts
export interface ThesisLeg {          // sustituye a los ids sueltos en Thesis.buys / .sells
  event_id: Ulid;
  fiscal_date: CivilDate;
  quantity: Quantity;
  amount_eur: Money;                  // coste (buy) o valor de transmisión (sell), fee incluido/descontado
  fee_eur: Money;
  gain_eur?: Money;                   // solo en las ventas
}

export interface BucketThesisView extends ThesisView {
  unrealized_eur?: Money;             // plusvalía latente de su posición viva (A1)
  benchmark_asset_id?: AssetId;
  benchmark_equivalent_eur?: Money;   // Σ coste_i × P(d_fin)/P(d_i)
  result_vs_index_eur?: Money;        // (result + latente) − (equivalente − invertido)
  /** Por qué no hay comparación: activo y fecha que faltan, o el motivo. */
  missing_benchmark: { reason: "no_benchmark" | "unknown_asset" | "no_price" | "no_linked_buys"; asset_id?: AssetId; date?: CivilDate }[];
}
```

## 8. `BucketStats` y controles (§3.4 y §3.5)

```ts
export interface DrawdownPoint { date: CivilDate; cumulative_eur: Money }

export interface BucketStats {
  date: CivilDate;
  closed_theses: number;
  sell_operations: number;
  /** Cerradas excluidas de las medias por resultado contaminado (decisión (k)). */
  excluded: { thesis_id: string; reason: "foreign_lots" }[];
  hit_rate?: Decimal;          // [0, 1]; ausente sin muestra
  average_win_eur?: Money;     // ausente si no hay ninguna positiva
  average_loss_eur?: Money;    // ausente si no hay ninguna negativa
  expectancy_eur?: Money;      // media de todas las medidas
  fees_eur: Money;
  traded_capital_eur: Money;   // Σ coste de los buy del cubo (comisión incluida)
  fees_pct?: Decimal;          // ausente si el capital operado es cero
  max_drawdown_eur: Money;     // >= 0
  drawdown_peak?: DrawdownPoint;
  drawdown_valley?: DrawdownPoint;
  vs_index_total_eur?: Money;
  vs_index_missing: number;
  warnings: Warning[];         // incluye el aviso de significancia
}

export interface BucketControls {
  contribution_gross_eur: Money;    // Σ cash_deposit de las cuentas del cubo
  contribution_net_eur: Money;      // menos las retiradas, informativo
  budget_eur?: Money;               // pct × aportación mensual × meses; ausente si falta un parámetro
  realized_eur: Money;
  unrealized_eur?: Money;
  loss_pct?: Decimal;               // sobre el aporte bruto; ausente si el aporte es cero
  weight_pct?: Decimal;             // sobre el patrimonio total; ausente si es parcial
  warnings: Warning[];
}
```

## 9. Impacto de un cambio de configuración (§3.5 bis)

```ts
export interface FiscalYearImpact { year: number; before: Money; after: Money }

movedFiscalYears(events, current, next, currentYear): FiscalYearImpact[]
```

Solo ejercicios **anteriores** a `currentYear` cuyo total de ganancias realizadas cambie.

## 10. Códigos de aviso nuevos

| Código | Dónde vive | Cuándo |
|---|---|---|
| `missing_benchmark_asset` | consulta (`bucketTheses`) | no hay `bucket_benchmark_asset_id` |
| `unknown_benchmark_asset` | consulta | el `asset_id` configurado no está en el catálogo |
| `missing_benchmark_price` | consulta | falta `P(d)` para alguna fecha necesaria |
| `partial_bucket_total` | consulta (`bucketPositions`) | alguna posición del cubo sin precio |
| `partial_net_worth` | consulta (`netWorth`) | falta un precio o un tipo de cambio |
| `stale_fx_rate` | consulta (`netWorth`) | el tipo usado supera `stale_price_days` |
| `bucket_sample_too_small` | consulta (`bucketStats`) | menos de 100 tesis cerradas (Q5) |
| `bucket_contaminated_theses` | consulta (`bucketStats`) | hay tesis excluidas por lotes ajenos |
| `bucket_contribution_exceeded` | consulta (controles) | aporte **bruto** por encima del tope |
| `bucket_contribution_near_limit` | consulta (controles) | aporte bruto por encima del 80 % del tope |
| `bucket_stop_loss_reached` | consulta (controles) | pérdida acumulada por encima del porcentaje |
| `bucket_weight_exceeded` | consulta (controles) | peso del cubo por encima del tope |
| `wash_sale_window_repurchase` | **proyección** (`state.warnings`) | compra dentro de la ventana posterior a una venta con pérdida |
| `wash_sale_window_prior_buy` | **proyección** (`state.warnings`) | venta con pérdida con compras del mismo activo en la ventana anterior (Q3) |

Todos se escriben en **inglés** en el dominio y la CLI los traduce por su `code` (`describeWarning`).
