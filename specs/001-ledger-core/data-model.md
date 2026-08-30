# Modelo de datos (Fase 1) — `001-ledger-core`

Concreción, para el código, de `docs/data-schema.md` §2-§8. Este documento no añade campos al fichero: solo fija tipos TypeScript, validaciones y el estado proyectado. Ante cualquier diferencia manda `docs/data-schema.md`.

## 1. Tipos de valor (`money/`)

| Tipo | Contenido | Invariantes |
|---|---|---|
| `Decimal` | `Big` inmutable | `parse(s)` solo acepta `^-?\d+(\.\d+)?$`; `toString()` sin exponente; `div` a 10 decimales half-up; el resto exacto |
| `Money` | `amount: Decimal`, `currency: Currency` | `add/sub` exigen misma divisa (`CurrencyMismatchError`); `roundToCents()` half-up idempotente |
| `Quantity` | `Decimal` | Adimensional; nunca negativa en el estado proyectado |
| `Price` | `Money` por unidad | `times(q: Quantity) → Money` |
| `FxRate` | `rate: Decimal`, `currency`, `date: CivilDate` | `rate > 0`; `toEur(m: Money) → Money(EUR)` = `m / rate`; exige `m.currency === currency`; `EUR` ⇒ `rate = "1"` |
| `Currency` | cadena `^[A-Z]{3}$` | ISO 4217; sin lista cerrada (el BCE publica ~30) |
| `CivilDate` | cadena `YYYY-MM-DD` | Fecha válida del calendario gregoriano; comparación lexicográfica; `year()` |

## 2. Envoltorio y eventos (`schema/`)

```ts
interface Envelope { schema_version: 1; id: Ulid; recorded_at: IsoInstant; type: EventType; corrects_id?: Ulid }
```

`EventType` = los 19 soportados + reservados (`corporate_action`, `thesis_opened`, `thesis_closed`). `LedgerEvent` es la unión discriminada por `type`. Todo numérico es `DecimalString` (alias de `string` validado). Campos con `?` opcionales (`exactOptionalPropertyTypes`: ausentes, nunca `undefined`).

### 2.1 Catálogo y configuración

| `type` | Campos | Validación de forma | Validación contextual (en proyección) |
|---|---|---|---|
| `account_created` / `account_updated` | `account_id`, `name`, `platform`, `book: 'core'\|'bucket'`, `base_currency`, `country` (`^[A-Z]{2}$`), `active: boolean` | todos obligatorios | `created`: id nuevo; `updated`: id existente. Cambiar `book` cuando alguna operación (no anulada) referencia la cuenta → error |
| `asset_created` / `asset_updated` | `asset_id`, `type: 'fund'\|'etc'\|'etp'\|'stock'\|'crypto'\|'money_market'`, `book`, `asset_class?` (`equity\|fixed_income\|gold\|crypto`), `isin?`, `ticker?`, `name`, `currency`, `ter?` (decimal), `transferable: boolean`, `reference_etf_id?`, `active: boolean` | `asset_class` solo si `book = core` (obligatorio en `core`, prohibido en `bucket`) | `created`: id nuevo; `updated`: id existente y **mismo `book`** (ADR-0009: un activo no cambia de libro; un cambio así es activo nuevo). Cambio de `isin`/`ticker` alimenta `identifier_history` |
| `settings_changed` | `settings: Settings` | objeto completo; `fiscal_date_rule` y `wash_sale_window_days` con las 6 claves de `AssetType`; `target_weights` (si existe) suma 100 | — |

`Settings` (de `business-rules.md` §7): `fiscal_date_rule: Record<AssetType, 'trade_date'|'value_date'>`, `wash_sale_window_days: Record<AssetType, number>`, y opcionales `target_weights?: Record<asset_id, DecimalString>`, `deviation_threshold_pp?`, `satellite_min_weight_pct?`, `monthly_contribution_eur?`, `bucket_pct_of_contribution?`, `bucket_max_cumulative_contribution?`, `bucket_stop_loss_pct?`, `bucket_max_weight_pct?`, `stale_price_days?`, `model_720_alert_threshold_eur?`, `model_721_alert_threshold_eur?`, `savings_tax_brackets?`, `tax_residence?`, `notification_email?`, `job_frequencies?`, `transfer_max_days?`.

`DEFAULT_SETTINGS` (ADR-0013, *verificar con asesor*): `fiscal_date_rule = {stock, etc, etp, crypto → trade_date; fund, money_market → value_date}`; `wash_sale_window_days = {fund, money_market, crypto → 365; stock, etc, etp → 61}`.

### 2.2 Campos comunes de operación (`data-schema.md` §4)

`account_id`, `asset_id`, `trade_date`, `value_date`, `quantity`, `unit_price`, `amount?`, `currency`, `fx_rate`, `fx_rate_date`, `fee`, `broker_ref?`, `fingerprint`, `source`, `notes?`.

Forma: fechas válidas; `quantity > 0`; `unit_price ≥ 0`; `amount ≥ 0`; `fee ≥ 0`; `fx_rate > 0`; `value_date ≥ trade_date`; `fx_rate_date ≤ fiscal_date` no se valida en forma (depende del activo) sino como **aviso** en proyección. Contexto: `account_id` y `asset_id` existen y `asset.book === account.book`; `asset.currency` distinta de `currency` → aviso (no error: un ETC en USD puede cotizar en EUR en otra bolsa).

### 2.3 Operaciones

| `type` | Campos propios | Contexto / efecto |
|---|---|---|
| `buy` | comunes + `order_id?`, `thesis_id?` | `order_id` → `order_placed` abierto de la misma cuenta/activo/`side = buy`. Cuenta `bucket` → **rechazo** (Q2-a). Efecto: `+quantity` en posición física; `−((amount ?? q×p) + fee)` en efectivo `currency`; lote nuevo `{acquisition_date: fiscal_date, quantity, cost_eur: ((amount ?? q×p) + fee) / fx_rate}` |
| `sell` | comunes + `withholding?`, `order_id?` | `quantity ≤ posición física de la cuenta`; `order_id` → orden abierta `side = sell`. Efecto: `−quantity` física; `+((amount ?? q×p) − fee − (withholding ?? 0))` en efectivo; consume FIFO global; `RealizedGain` por lote |
| `transfer` | `request_id?`, `from_account_id`, `from_asset_id`, `quantity_out`, `nav_out?`, `value_date_out`, `to_account_id`, `to_asset_id`, `quantity_in`, `nav_in?`, `value_date_in`, `fee?`, `fingerprint`, `notes?` | **Fiscal** (`from_asset_id ≠ to_asset_id`): ambos `transferable`, mismo `book`, `nav_out`/`nav_in` obligatorios, `quantity_out ≤` posición física origen. Efecto: `−quantity_out` en (from_account, from_asset), `+quantity_in` en (to_account, to_asset); consume FIFO en `from_asset`; por lote consumido crea lote en `to_asset` con la misma `acquisition_date`, `cost_eur` heredado, `quantity = quantity_in × (consumida / quantity_out)`, `source_lot_id`. Sin ganancia. **Custodia** (`from_asset_id = to_asset_id`): cuentas distintas, sin `nav_*`, `quantity_in = quantity_out`; solo mueve posición física. `request_id` → cierra el `transfer_requested` |
| `dividend` | `account_id`, `asset_id`, `value_date`, `gross`, `withholding_origin`, `withholding_spain`, `currency`, `fx_rate`, `fx_rate_date`, `per_unit?`, `broker_ref?`, `fingerprint`, `notes?` | Efecto: `+ (gross − withholding_origin − withholding_spain)` en efectivo; `InvestmentIncome {kind: dividend}` |
| `interest` | `account_id`, `value_date`, `gross`, `withholding_spain`, `currency`, `fx_rate`, `fx_rate_date`, `broker_ref?`, `fingerprint`, `notes?` | `+ (gross − withholding_spain)` en efectivo; `InvestmentIncome {kind: interest}` |
| `fx_exchange` | `account_id`, `value_date`, `sold_amount`, `sold_currency`, `bought_amount`, `bought_currency`, `fee`, `fee_currency`, `fx_rate_sold`, `fx_rate_bought`, `fx_rate_date`, `broker_ref?`, `fingerprint`, `notes?` | `sold_currency ≠ bought_currency`. Efecto: `−sold_amount` (sold), `+bought_amount` (bought), `−fee` (fee_currency) |
| `cash_deposit` / `cash_withdrawal` | `account_id`, `value_date`, `amount`, `currency`, `fx_rate`, `notes?`, `fingerprint` | `±amount` en efectivo |
| `standalone_fee` | `account_id`, `value_date`, `amount`, `currency`, `fx_rate`, `description`, `fingerprint` | `−amount` en efectivo; no toca lotes |
| `valuation` | `account_id`, `asset_id`, `date`, `quantity`, `unit_value`, `currency`, `fx_rate`, `source` | Sin efecto en esta feature; se conserva y exporta |

### 2.4 Seguimiento (sin efecto sobre lotes ni efectivo)

| `type` | Campos | Contexto |
|---|---|---|
| `order_placed` | `account_id`, `asset_id`, `side: 'buy'\|'sell'`, `amount?` ⊕ `quantity?`, `requested_date`, `notes?` | cuenta y activo existen, mismo libro |
| `order_updated` | `order_id`, `stage: 'cancelled'\|'note'`, `date`, `notes?` | `order_id` → orden existente y abierta |
| `transfer_requested` | `from_account_id`, `from_asset_id`, `to_account_id`, `to_asset_id`, `quantity_out?` ⊕ `amount_eur?`, `requested_date`, `notes?` | cuentas y activos existen; si fiscal, ambos `transferable` |
| `transfer_request_updated` | `request_id`, `stage: 'redeemed'\|'subscribed'\|'cancelled'`, `date`, `nav_out?`, `quantity_out?`, `notes?` | `request_id` → solicitud existente y abierta |

### 2.5 Rectificación

| `type` | Campos | Contexto |
|---|---|---|
| `reversal` | `reverses_id`, `reason` (no vacío) | `reverses_id` existe, no es `reversal`, no está ya anulado. La proyección ignora ambos |

Cualquier evento admite `corrects_id` (envoltorio) apuntando a un evento anulado.

### 2.6 Huella (`fingerprint`)

`"sha256:" + hex(sha256(utf8(join("|", [source, broker_ref ?? "", account_id, asset_id ?? "", type, value_date, quantity ?? "", amount ?? unit_price ?? "", currency]))))`. En manual sin `broker_ref` el campo queda **vacío**, nunca el `id` propio: dos registros idénticos producen la misma huella y avisan (corrección del usuario a ADR-0012, 2026-08-30). Para `transfer`: `account_id = from_account_id`, `asset_id = from_asset_id`, `value_date = value_date_out`, `quantity = quantity_out`, importe `""`. Para `fx_exchange`: `asset_id = ""`, `quantity = sold_amount`, importe `bought_amount`, `currency = sold_currency`. Para `dividend`/`interest`: importe `gross`. El caso de uso la calcula si el borrador no la trae; si la trae (importación futura) se respeta.

## 3. Estado proyectado (`projections/state.ts`)

```ts
interface LedgerState {
  accounts: Map<AccountId, Account & { history: AccountEvent[] }>;
  assets: Map<AssetId, Asset & { identifier_history: { isin?: string; ticker?: string; until_event_id: Ulid }[] }>;
  settingsHistory: { recorded_at: IsoInstant; madridDate: CivilDate; settings: Settings }[];
  fiscalSettings: Settings;                              // Q3-a: resuelta al construir el estado
  positions: Map<`${AccountId}|${AssetId}`, Quantity>;   // physicalPositions
  cash: Map<`${AccountId}|${Currency}`, Money>;          // cashBalances
  lots: Map<AssetId, { open: FiscalLot[]; closed: FiscalLot[] }>;  // fiscalLots
  gains: RealizedGain[];
  income: InvestmentIncome[];
  orders: Map<Ulid, PendingOrder & { closed_by?: Ulid }>;
  transferRequests: Map<Ulid, PendingTransfer & { closed_by?: Ulid }>;
  reversed: Map<Ulid, Ulid>;                             // anulado → reversal
  warnings: Warning[];                                   // same_asset_two_accounts, currency_mismatch, fx_rate_date_after_fiscal_date
  invalid: { event: LedgerEvent; error: ProjectionError }[];  // solo en modo collectErrors
  fingerprints: Map<string, Ulid[]>;
}
```

| Entidad | Campos |
|---|---|
| `FiscalLot` | `id` (= `<event_id>#<n>`), `asset_id`, `acquisition_date`, `original_quantity`, `quantity` (restante), `cost_eur` (total restante, exacto), `source_event_id`, `source_lot_id?`, `closed: boolean`, `consumptions: { event_id, quantity, cost_eur }[]` |
| `RealizedGain` | `event_id`, `asset_id`, `account_id`, `fiscal_date`, `year`, `proceeds_eur` (exacto, operación), `cost_eur`, `gain_eur` (exacto), `gain_eur_rounded` (céntimos, una vez), `by_lot: { lot_id, quantity, proceeds_eur, cost_eur, gain_eur }[]` |
| `InvestmentIncome` | `event_id`, `kind: 'dividend'\|'interest'`, `account_id`, `asset_id?`, `fiscal_date` (= `value_date`), `year`, `gross`, `withholding_origin`, `withholding_spain`, `net` (en `currency`), `gross_eur`, `withholding_origin_eur`, `withholding_spain_eur`, `net_eur` (exactos) |
| `PendingOrder` | `order_id`, `account_id`, `asset_id`, `side`, `amount?`, `quantity?`, `requested_date`, `stage: 'open'\|'cancelled'\|'filled'`, `notes[]`, `days_open(at)` |
| `PendingTransfer` | `request_id`, `from_*`, `to_*`, `quantity_out?`, `amount_eur?`, `requested_date`, `stage: 'requested'\|'redeemed'\|'subscribed'\|'completed'\|'cancelled'`, `updates[]`, `days_open(at)` |
| `Warning` | `code`, `event_id`, `message` (español), `details?` |
| `IntegrityFinding` | `severity: 'error'\|'warning'`, `code`, `message`, `event_ids[]` |

### 3.1 Transiciones de estado

- **Orden**: `open` → `filled` (por `buy`/`sell` con `order_id`) | `cancelled` (por `order_updated.stage = cancelled`). `note` no cambia de estado. Cerrar dos veces → error.
- **Solicitud de traspaso**: `requested` → `redeemed` → `subscribed` → `completed` (por `transfer.request_id`); `cancelled` desde cualquier estado abierto. Las etapas pueden saltarse (p. ej. `requested` → `completed`). Actualizar una cerrada → error.
- **Lote**: abierto (`quantity > 0`) → cerrado (`quantity = 0`) cuando la última consumición lo agota; nunca vuelve a abrirse (una anulación re-proyecta desde cero).

### 3.2 Reglas de `integrity`

| Código | Severidad | Comprobación |
|---|---|---|
| `negative_position` | error | alguna posición física < 0 (imposible si la proyección no lanzó; se comprueba igualmente) |
| `lots_mismatch` | error | por activo: Σ lotes abiertos ≠ Σ posiciones físicas |
| `duplicate_fingerprint` | warning | huella con más de un evento no anulado |
| `dangling_reference` | error | `order_id`, `request_id`, `corrects_id` que no resuelven |
| `unsupported_event` | error | eventos de tipos reservados (002) presentes en el libro |

### 3.3 Orden de proyección (Q1-b; concreción de `data-schema.md` §7.1)

| Pasada | Eventos | Orden |
|---|---|---|
| 0 | `reversal` (y `corrects_id`) | Posición en el fichero; define las parejas excluidas |
| A | `account_*`, `asset_*`, `settings_changed` | Posición en el fichero |
| B | Operaciones y seguimiento | Estable por `(fecha de negocio, posición en el fichero)` |

Fecha de negocio por tipo: `buy`/`sell` → `fiscal_date`; `transfer` → `value_date_out`; `dividend`, `interest`, `fx_exchange`, `cash_deposit`, `cash_withdrawal`, `standalone_fee` → `value_date`; `valuation`, `order_updated`, `transfer_request_updated` → `date`; `order_placed`, `transfer_requested` → `requested_date`. Un `order_updated` o `transfer` que en fecha de negocio precede a su `order_placed`/`transfer_requested` → `ProjectionError`.

Registrar tarde es normal y no genera aviso: `recordEvent` proyecta el libro con el evento nuevo colocado cronológicamente y rechaza si cualquier invariante se rompe, posiblemente en un evento posterior en fecha (el error indica cuál).

## 4. Migraciones (`schema/migrations/`)

`CURRENT_SCHEMA_VERSION = 1`. `migrate(raw: unknown): RawLine` aplica en cadena `MIGRATIONS[v]` desde `raw.schema_version` hasta `CURRENT`; con v1 la cadena está vacía y la línea sale idéntica. `schema_version` ausente o no entero → `ValidationError`; `> CURRENT` → `SchemaTooNewError` (nunca se llega a `migrate`).
