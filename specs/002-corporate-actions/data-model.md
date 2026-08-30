# Modelo de datos (Fase 1) — `002-corporate-actions`

Concreción, para el código, de `docs/data-schema.md` §6.2, §6.4, §6.5, §7 y §8.5. No añade campos al fichero: fija tipos TypeScript, validaciones y estado proyectado. Ante cualquier diferencia manda `docs/data-schema.md` (salvo lo anotado en `questions.md`).

## 1. Eventos nuevos (`schema/events.ts`)

```ts
export const CORPORATE_ACTION_KINDS = ["split", "reverse_split", "stock_dividend", "merger", "spin_off",
  "fund_merger", "share_class_change", "fund_liquidation", "issuer_liquidation", "delisting",
  "crypto_fork", "token_migration", "issuer_restructuring"] as const;
export const EFFECT_OPS = ["scale", "convert", "carve_out", "forced_sale", "grant"] as const;

interface EffectBase { asset_id?: AssetId }                       // por defecto, el del evento
interface ScaleEffect     extends EffectBase { op: "scale"; ratio: DecimalString }
interface ConvertEffect   extends EffectBase { op: "convert"; to_asset_id: AssetId; ratio: DecimalString }
interface CarveOutEffect  extends EffectBase { op: "carve_out"; to_asset_id: AssetId; ratio: DecimalString; cost_share: DecimalString }
interface ForcedSaleEffect extends EffectBase {
  op: "forced_sale";
  per_account: { account_id: AccountId; quantity: DecimalString | "all"; fee?: DecimalString }[];
  unit_price: DecimalString; currency: Currency; fx_rate: DecimalString; fx_rate_date: CivilDate;
}
interface GrantEffect extends EffectBase {
  op: "grant";
  per_account: { account_id: AccountId; quantity: DecimalString }[];
  unit_cost: DecimalString; currency: Currency; fx_rate: DecimalString; fx_rate_date: CivilDate; acquisition_date: CivilDate;
}
type Effect = ScaleEffect | ConvertEffect | CarveOutEffect | ForcedSaleEffect | GrantEffect;

interface CorporateActionEvent extends Envelope {
  type: "corporate_action"; kind: CorporateActionKind; asset_id: AssetId; effective_date: CivilDate;
  source_document: string; effects: Effect[]; notes?: string; fingerprint: string;
}
interface ThesisOpenedEvent extends Envelope {
  type: "thesis_opened"; thesis_id: string; account_id: AccountId; asset_id: AssetId; hypothesis: string;
  expected_horizon_days: number; invalidation: string; planned_size_eur: DecimalString;
}
interface ThesisClosedEvent extends Envelope { type: "thesis_closed"; thesis_id: string; closing_notes: string }
// SellEvent gana thesis_id?: string (BuyEvent ya lo tenía)
```

`SUPPORTED_EVENT_TYPES` incorpora los tres; `RESERVED_EVENT_TYPES = []` (el tipo `ReservedEventType` pasa a `never`; `isReservedEventType` devuelve siempre `false`).

## 2. Validación de forma (`schema/validate.ts`)

| `type` / `op` | Campos y reglas |
|---|---|
| `corporate_action` | `kind` ∈ `CORPORATE_ACTION_KINDS`; `asset_id` cadena no vacía; `effective_date` fecha; `source_document` cadena no vacía; `effects` array (puede ser vacío; la tabla decide); `notes?`; `fingerprint` |
| efecto común | `op` ∈ `EFFECT_OPS`; `asset_id?` cadena no vacía |
| `scale` | `ratio`: decimal > 0 **o** fracción `n/d` de enteros > 0 (regla `ratio`; `"4/3"`, `"1/3"`) |
| `convert` | `to_asset_id` no vacío; `ratio` (regla `ratio`) |
| `carve_out` | `to_asset_id`; `ratio` (regla `ratio`); `cost_share` decimal en `[0, 1]` (regla `unit_interval`) |
| `forced_sale` | `per_account` array no vacío de `{account_id, quantity: "all" \| decimal > 0, fee?: decimal ≥ 0}`; `unit_price` ≥ 0; `currency`; `fx_rate` > 0; `fx_rate_date` |
| `grant` | `per_account` array no vacío de `{account_id, quantity > 0}`; `unit_cost` ≥ 0; `currency`; `fx_rate` > 0; `fx_rate_date`; `acquisition_date` |
| `thesis_opened` | `thesis_id`, `account_id`, `asset_id`, `hypothesis`, `invalidation` no vacías; `expected_horizon_days` entero JSON > 0 (regla `positive_integer`); `planned_size_eur` > 0 |
| `thesis_closed` | `thesis_id`, `closing_notes` no vacías |
| `sell` | + `thesis_id?` |

Errores: `missing_field` / `invalid_field` con `field` cualificado (`effects[1].per_account[0].quantity`). Numéricos como `number` → `invalid_field` (ADR-0005), salvo `expected_horizon_days`.

Huella: `corporate_action` → `sha256:` de `["", "", "", asset_id, "corporate_action", effective_date, kind, "", ""].join("|")`. Tesis: sin huella.

## 3. Tabla de composición (`projections/kind-rules.ts`)

`E` = activo del evento; `P` = destino del paso anterior (`to_asset_id` de `convert`/`carve_out`, `asset_id` resuelto de `grant`).

| `kind` | Secuencias admitidas (op@activo) | Extra |
|---|---|---|
| `split` | `scale@E` | |
| `reverse_split` | `scale@E` · `scale@E, forced_sale@E` | |
| `stock_dividend` | `scale@E` · `grant@*` · `grant@*, forced_sale@P` | `grant@*`: el activo del `grant` es libre (derechos o el mismo) |
| `merger` | `convert@E` · `forced_sale@E, convert@E` · `convert@E, forced_sale@P` | |
| `spin_off` | `carve_out@E` · `carve_out@E, forced_sale@P` | |
| `fund_merger` | `convert@E` | |
| `share_class_change` | `convert@E` | |
| `fund_liquidation` | `forced_sale@E` | `liquidation`: `"all"` en exactamente las cuentas con posición > 0 |
| `issuer_liquidation` | `forced_sale@E` | `liquidation` |
| `delisting` | *(vacía)* | |
| `crypto_fork` | `grant@*` | |
| `token_migration` | `convert@E` | |
| `issuer_restructuring` | cualquier secuencia **no vacía** de `convert` y `forced_sale`, activos libres | |

Rechazo: `ProjectionError("effects_not_allowed_for_kind", {kind, effects: ops, allowed})`. Cobertura de liquidación incumplida: `ProjectionError("liquidation_must_cover_all_accounts", {missing, extra})`.

## 4. Estado proyectado (`projections/state.ts`)

Campos nuevos de `LedgerState`:

```ts
theses: Map<string, Thesis>;          // por thesis_id, en orden de fichero
lotCounts: Map<Ulid, number>;         // lotes creados por evento (ids únicos en todo el libro)
```

```ts
interface Thesis {
  thesis_id: string; account_id: AccountId; asset_id: AssetId;
  hypothesis: string; expected_horizon_days: number; invalidation: string; planned_size_eur: Money;
  status: "open" | "closed";
  opened_event_id: Ulid; opened_position: number; opened_at: CivilDate;      // recorded_at en Europe/Madrid
  closed_event_id?: Ulid; closed_position?: number; closed_at?: CivilDate; closing_notes?: string;
  buys: Ulid[]; sells: Ulid[];
  quantity_bought: Quantity; quantity_sold: Quantity;
  invested_eur: Money;   // Σ cost_eur de los buy (con comisión)
  fees_eur: Money;       // Σ fee / fx_rate de buy y sell enlazados
  result_eur: Money;     // Σ gain_eur exacto de los sell enlazados
}
interface ThesisView extends Thesis { result_eur_rounded: Money; position: Quantity; days_open: number }
interface ValuationAt { account_id; asset_id; date; quantity: Quantity; unit_value: Decimal; currency; fx_rate: Decimal; value_eur: Money; event_id: Ulid }
```

`FiscalLot`, `RealizedGain` no cambian de forma: un lote de `convert`/`carve_out` lleva `source_event_id` = id del `corporate_action` y `source_lot_id`; una ganancia de `forced_sale` lleva `event_id` = id del `corporate_action`, `account_id` de la entrada y `fiscal_date = effective_date`.

## 5. Validación contextual y efectos (proyección)

### 5.0 Escalado de cantidades (`money/ratio.ts`)

`Ratio.parse("4" | "0.25" | "4/3")` → `{numerator, denominator}` (decimal: denominador 1). `ratio.apply(q)` = `q × n / d` (exacto si `d = 1` o si la división no deja resto; si no, 10 decimales half-up). `scaleQuantities(quantities, ratio)`: `total = ratio.apply(Σ quantities)`; cada elemento `ratio.apply(q)` salvo el **último**, que recibe `total − Σ anteriores`. Se aplica a la lista de lotes abiertos (orden FIFO) y a la lista de cuentas con posición (orden de fichero de su primera aparición). Con ratio decimal el resto es siempre cero.

### 5.1 `corporate_action` (pasada B, fecha de negocio `effective_date`)

1. `requireAsset(event.asset_id)`; para cada efecto, `asset = effect.asset_id ?? event.asset_id`, `requireAsset`.
2. `checkEffectsAgainstKind(kind, effects resueltos, event.asset_id)`.
3. Si la regla es `liquidation`: el conjunto de `per_account.account_id` debe ser igual al de cuentas con posición > 0 del activo y toda `quantity` debe ser `"all"`.
4. Aplicar en orden:

| Primitiva | Validación | Lotes | Posiciones | Efectivo | Ganancia |
|---|---|---|---|---|---|
| `scale` | lotes abiertos > 0 (`no_open_lots`) | `scaleQuantities(lotes)`; coste, fecha e id intactos | `scaleQuantities(cuentas con posición)` | — | — |
| `convert` | lotes abiertos; destino existe, mismo libro, ≠ origen (`same_asset`) | `consume(all)` cierra el origen; por rebanada `openLot(to, scaleQuantities(rebanadas)[i], cost, fecha, position: origen, source_lot_id)` | `−q` origen, `+scaleQuantities(cuentas)[i]` destino, por cuenta | — | — |
| `carve_out` | lotes abiertos; destino como `convert` | por lote: `share = cost × cost_share`; `lot.cost −= share`; `openLot(to, scaleQuantities(lotes)[i], share, fecha, position: lot.position, source_lot_id: lot.id)` | `+scaleQuantities(cuentas)[i]` destino | — | — |
| `forced_sale` | cuentas únicas, existentes, mismo libro; `quantity` (o posición si `"all"`) ≤ posición y ≤ lotes (`requireAvailable`) | `consume(q)` | `−q` | `+ q × unit_price − fee` en `currency` | `recordGain({fiscal_date: effective_date, proceeds_eur: (q × unit_price − fee) / fx_rate})` |
| `grant` | cuentas existentes, mismo libro | `openLot({q, cost: q × unit_cost / fx_rate, acquisition_date, position: evento})` | `+q` | — | — |

Avisos: `currency_mismatch`, `fx_rate_date_after_fiscal_date` (con `effective_date`) en `forced_sale` y `grant`; `same_asset_two_accounts` en `convert`, `carve_out` y `grant`.

### 5.2 Tesis (pasada A', orden de fichero)

| Evento | Validación | Efecto |
|---|---|---|
| `thesis_opened` | cuenta existe y es `bucket`; activo existe y es `bucket`; `thesis_id` nuevo (`duplicate_thesis`); ninguna tesis abierta sobre (`account_id`, `asset_id`) (`thesis_already_open`) | crea `Thesis` con `status: open`, `opened_position`, `opened_at = madridDateOf(recorded_at)` |
| `thesis_closed` | tesis existe (`unknown_thesis`) y está abierta (`thesis_already_closed`) | `status: closed`, `closed_*` |

### 5.3 `buy` / `sell` en cuenta `bucket` (pasada B)

`logicalPosition = corrects_id !== undefined ? positionOf(corrects_id) : position`.

- `buy`: `thesis_id` obligatorio (`thesis_required`); tesis existe (`unknown_thesis`); misma cuenta y activo (`thesis_mismatch`); `opened_position < logicalPosition` y (`closed_position` ausente o `> logicalPosition`) (`thesis_not_open`). Efecto: `buys.push`, `quantity_bought += q`, `invested_eur += cost_eur`, `fees_eur += fee / fx_rate`; si `invested_eur > planned_size_eur` → aviso `thesis_size_exceeded`.
- `sell`: con `thesis_id`, misma validación; efecto: `sells.push`, `quantity_sold += q`, `result_eur += gain_eur`, `fees_eur += fee / fx_rate`. Sin `thesis_id` → aviso `sell_without_thesis`.

Tras la pasada B: para cada tesis `closed` con `positionOf(account, asset) > 0` y sin otra tesis `open` sobre el mismo par → aviso `thesis_closed_with_position` (evento: el `thesis_closed`).

### 5.4 Uso de referencias (`recordUsage`)

`corporate_action`: activo del evento, activos de los efectos (incluidos `to_asset_id`) y cuentas de `per_account`. `thesis_opened`: su cuenta y activo. Así `reverseEvent` de un `asset_created`/`account_created` referenciado sigue rechazándose.

## 6. Consultas

- `theses(state, at: CivilDate): ThesisView[]` — todas, en orden de fichero; `position = positionOf(account, asset)`; `days_open = daysBetween(opened_at, closed_at ?? at)`.
- `valuations(state, date: CivilDate): ValuationAt[]` — última `valuation` por par con `date ≤ date` (empate: posición en el fichero, que es el orden de `state.valuations`); `value_eur = quantity × unit_value / fx_rate`.
- `corporateActionOf(events, lot | gain)` no existe en el dominio: la CLI resuelve el origen con `state.positionOf`.

## 7. Errores y avisos nuevos

| Código | Tipo | Cuándo |
|---|---|---|
| `effects_not_allowed_for_kind` | error | secuencia no admitida por la tabla |
| `liquidation_must_cover_all_accounts` | error | `fund_liquidation`/`issuer_liquidation` sin `"all"` en exactamente las cuentas con posición |
| `no_open_lots` | error | `scale`/`convert`/`carve_out` sin lotes abiertos |
| `same_asset` | error | `to_asset_id` igual al origen |
| `duplicate_account_in_effect` | error | cuenta repetida en `per_account` |
| `unknown_asset`, `unknown_account`, `book_mismatch`, `insufficient_position`, `insufficient_lots` | error | reutilizados de la 001 |
| `thesis_required`, `unknown_thesis`, `thesis_mismatch`, `thesis_not_open`, `duplicate_thesis`, `thesis_already_open`, `thesis_already_closed` | error | tesis |
| `not_bucket` | error | `thesis_opened` con cuenta o activo fuera del cubo |
| `sell_without_thesis`, `thesis_size_exceeded`, `thesis_closed_with_position` | aviso | tesis |
