# Modelo de datos — feature 003-synthetic-data

Identificadores en inglés como en el código. Nada de esto se persiste salvo las fixtures (§6).

## 1. `Snapshot` (instantánea canónica)

Objeto JSON con **claves ordenadas recursivamente** (`sortKeysDeep`); los arrays conservan su orden. `Money`, `Quantity`, `Decimal` → `toString()`. Nada que dependa del momento de ejecución ni de posiciones de fichero.

```text
Snapshot {
  accounts:          Account[]            // ordenadas por account_id; campos + history (ids)
  assets:            Asset[]              // ordenados por asset_id; campos + identifier_history
  settings_history:  { event_id, recorded_at, madrid_date, settings }[]
  fiscal_settings:   Settings
  positions:         { account_id, asset_id, quantity }[]        // no nulas, orden de state.positions (inserción)
  cash:              { account_id, currency, balance }[]         // no nulas, orden de inserción
  lots:              { [asset_id]: { open: Lot[], closed: Lot[] } }   // Lot sin `position`
  gains:             Gain[]               // orden de state.gains; by_lot incluido; gain_eur y gain_eur_rounded
  income:            Income[]             // orden de state.income
  valuations:        { event_id, account_id, asset_id, date, quantity, unit_value, currency, fx_rate, source }[]
  orders:            Order[]              // todas, con stage, closed_by, closed_on; orden de inserción
  transfer_requests: Request[]            // todas, con stage, updates, closed_by
  theses:            ThesisSnapshot[]     // sin opened_position/closed_position; con result_eur_rounded; sin days_open
  warnings:          { code, event_id, details }[]          // sin message (la redacción no forma parte de la proyección)
  invalid:           { event_id, type, code }[]
}
```

`Lot`: `id`, `asset_id`, `acquisition_date`, `original_quantity`, `quantity`, `cost_eur`, `original_cost_eur`, `source_event_id`, `source_lot_id?`, `closed`, `consumptions[{event_id, quantity, cost_eur}]`.

`snapshotDiff(a, b): string[]` — claves de primer nivel cuyo `JSON.stringify` difiere.

## 2. `LedgerSchema`

```text
Migration    = (line: UnknownRecord) => UnknownRecord          // v → v+1, pura; el llamador estampa schema_version
LedgerSchema = { version: number; migrations: ReadonlyMap<number, Migration> }   // migrations.get(v) = paso v → v+1
CURRENT_LEDGER_SCHEMA = { version: 1, migrations: Map() }
TEST_SCHEMA_V2 (solo tests) = { version: 2, migrations: Map([[1, line => line.note !== undefined ? { ...sin note, notes: line.note } : line]]) }
```

Reglas: `migrate` rechaza `schema_version` no entero o < 1 (`invalid_envelope`), `> version` (`schema_too_new`), paso ausente (`missing_migration`); `validateShape` exige `schema_version === schema.version` tras migrar.

## 3. Puerto ampliado

```text
LoadedLedger { events: LedgerEvent[]; etag: string; lines: string[] }   // lines: crudas, sin "\n", orden de fichero
LedgerStore  { schema: LedgerSchema; load(); append(events, etag); replace(events, etag, archiveName) }
```

`replace`: (1) etag actual ≠ `etag` → `ConflictError`, nada escrito; (2) archivo `archiveName` ya existe → `ArchiveExistsError` (`archive_exists`, `{ archive_name }`), nada escrito; (3) archiva los bytes actuales tal cual; (4) escribe `events.map(encodeLine).join("\n") + "\n"` (vacío si no hay eventos); (5) devuelve el etag nuevo. Fichero: `archive/` junto al libro. Memoria: `archives: Map<name, text>`.

## 4. `compact`

```text
CompactPlan   { etag: string; lines: number; versions: { version: number; lines: number }[]; targetVersion: number; outdated: number; archiveName: string }
CompactResult =
  | { status: "nothing_to_compact"; lines; versions; targetVersion }
  | { status: "compacted"; archiveName; linesBefore; linesAfter; versions; targetVersion; etag }
CompactRejectedError (DomainError) — code "invalid_events" { affected: {id, type, error}[] } | "projection_changed" { keys: string[] }
```

`archiveName` base = `ledger-<YYYY-MM-DD>-v<n>.jsonl` con `n = min(versions)`; colisiones → `-2` … `-99`.

## 5. Hallazgos (`IntegrityFinding`, reutilizado)

| Origen | Código | Severidad | `event_ids` | Mensaje (inglés) |
|---|---|---|---|---|
| `integrity` | `dangling_reference` | error | `[]` | `asset X references unknown reference_etf_id Y` |
| `deepCheck` | `duplicate_id` | error | `[id]` | `id … appears N times (lines i, j)` |
| `deepCheck` | `fingerprint_mismatch` | error | `[id]` | `stored fingerprint … does not match the event fields` |
| `deepCheck` | `non_canonical_line` | warning | `[id]` | `line N is not in canonical form` |
| `deepCheck` | `outdated_lines` | warning | `[]` | `N lines below schema_version V (v1: a, v2: b); run atlas compact` |
| `deepCheck` | `unknown_field` | warning | `[id]` | `line N carries fields the type does not define: …` |
| `deepCheck` | `projection_not_reproducible` | error | `[]` | `re-reading the text projects differently: keys …` |

## 6. Esqueleto del escenario sintético (`generateLedger`)

Fecha inicial `2026-09-01`; reloj sintético desde `2026-09-01T18:00:00Z`; ejercicios 2026, 2027, 2028. Lo aleatorio por semilla: importes (múltiplos de 50 €), NAVs y precios (2 decimales, dentro de rangos), tipos de cambio USD (1,05-1,15, 4 decimales), cantidades enteras de acciones (elegidas entre valores que garantizan picos), día del mes `d ∈ [1, 5]` de cada bloque.

### Catálogo

| Id | Tipo | Libro | Notas |
|---|---|---|---|
| `acc_mi` | cuenta | core | MyInvestor, ES, EUR |
| `acc_ibkr` | cuenta | core | IBKR, IE, EUR |
| `acc_ibkr2` | cuenta | core | IBKR (segunda), IE, EUR (spec A2) |
| `acc_bucket` | cuenta | bucket | IBKR, IE, EUR |
| `ast_world` | `fund` equity, XX0000000001 | core | traspasable; cambia de ISIN en 2027-09 (`asset_updated`) |
| `ast_smallcap` | `fund` equity | core | destino del primer traspaso; absorbido por `ast_smallcap_b` (`fund_merger` 1.7) |
| `ast_bonds` | `fund` fixed_income | core | destino del segundo traspaso; cambia de clase a `ast_bonds_i` |
| `ast_smallcap_b`, `ast_bonds_i` | `fund` | core | creados antes de su evento corporativo |
| `ast_mm` | `money_market` fixed_income | core | compra inicial y venta parcial con retención |
| `ast_gold` | `etc` gold, USD | core | compra en `acc_ibkr` tras `fx_exchange`; custodia parcial a `acc_ibkr2`; `reverse_split` 1/4 con picos en ambas |
| `ast_btc` | `etp` crypto, EUR | core | compra en `acc_ibkr` |
| `ast_alpha`, `ast_beta`, `ast_gamma` | `stock`, USD | bucket | tickers inventados |
| `ast_alpha_spin` | `stock` | bucket | escisión de `ast_alpha` (carve_out 1/4, cost_share 0.2) con picos; `delisting` + `active=false` |
| `ast_beta_new` | `stock` | bucket | fusión de `ast_beta` (convert 1/3) con picos |

### Línea temporal (mes `m` desde 2026-09; "d" = día aleatorio 1-5)

| m | Fecha | Bloque |
|---|---|---|
| 0 | 2026-09 | `settings_changed` completo; 4 `account_created`; `asset_created` de todos los activos iniciales; `thesis_opened` th_alpha; `cash_deposit` en las cuatro cuentas; `fx_exchange` EUR→USD en `acc_ibkr` y en `acc_bucket`; `buy` `ast_gold` (USD), `buy` `ast_btc`, `buy` `ast_mm` (amount); `buy` `ast_alpha` con tesis |
| cada mes | d, d+2 | `order_placed` (`acc_mi`, `ast_world`, amount) → `buy` con `order_id`, `amount`, sin `unit_price`, `value_date = d+2`; cada 3 meses lo mismo para `ast_bonds` (desde m=18, `ast_bonds_i`) |
| 1 | 2026-10 | `thesis_opened` th_beta; `buy` `ast_beta`; `interest` `acc_mi` con retención |
| 2 | 2026-11 | `dividend` `ast_alpha` USD con retención en origen y en España |
| 3 | 2026-12 | `standalone_fee` `acc_ibkr`; `valuation` 31/12 en `acc_ibkr` y `acc_bucket` (cantidad = posición proyectada) |
| 4 | 2027-01 | `transfer_requested` `ast_world` → `ast_smallcap` (parcial) → `transfer_request_updated` redeemed → `transfer` con `request_id` |
| 6 | 2027-03 | `sell` `ast_world` parcial **con pérdida** (NAV = 0,9 × mínimo visto); después, **registro tardío**: `buy` `ast_world` con `value_date` en 2027-02 (unit_price, sin orden); las aportaciones mensuales siguen |
| 7 | 2027-04 | `dividend` `ast_alpha` con `withholding_spain` "mal tecleada" (se corrige en m=16) |
| 8 | 2027-05 | `transfer` de custodia `ast_gold` `acc_ibkr` → `acc_ibkr2` (parcial; aviso `same_asset_two_accounts` esperado) |
| 9 | 2027-06 | `corporate_action` `reverse_split` `ast_gold`: `scale` 1/4 + `forced_sale` de los picos en `acc_ibkr` y `acc_ibkr2` (fracciones leídas de la proyección) |
| 10 | 2027-07 | `order_placed` → `order_updated` cancelled (ese mes no hay compra de `ast_world`); `thesis_opened` th_gamma; `buy` `ast_gamma` |
| 11 | 2027-08 | `transfer_requested` `ast_smallcap` → `ast_bonds` (parcial) → redeemed → subscribed → `transfer` |
| 12 | 2027-09 | `settings_changed` (pesos objetivo nuevos); `cash_deposit` anual; `asset_updated` `ast_world` (ISIN nuevo) |
| 13 | 2027-10 | `asset_created` `ast_alpha_spin`; `corporate_action` `spin_off`: `carve_out` 1/4, `cost_share` 0.2 + `forced_sale` picos sobre `ast_alpha_spin` |
| 14 | 2027-11 | `corporate_action` `split` `ast_gamma` (`scale` 2); `asset_created` `ast_beta_new`; `merger` `ast_beta`: `convert` 1/3 + `forced_sale` picos sobre `ast_beta_new`; `thesis_closed` th_beta; `thesis_opened` th_beta_new |
| 15 | 2027-12 | `sell` `ast_alpha` todo con ganancia, `trade_date` 2027-12-30, `value_date` 2028-01-02, con tesis; `thesis_closed` th_alpha; `valuation` 31/12/2027 (`acc_ibkr`, `acc_ibkr2`, `acc_bucket`) |
| 16 | 2028-01 | `reversal` del dividendo de m=7 + `dividend` corregido con `corrects_id` (mismo `value_date` de 2027); `corporate_action` `delisting` `ast_alpha_spin` (`effects: []`) + `asset_updated` `active=false`; `sell` `ast_beta_new` todo con pérdida y tesis th_beta_new; `thesis_closed` th_beta_new |
| 17 | 2028-02 | `asset_created` `ast_smallcap_b`; `corporate_action` `fund_merger` `ast_smallcap` → `ast_smallcap_b` (`convert` 1.7) |
| 18 | 2028-03 | `asset_created` `ast_bonds_i`; `corporate_action` `share_class_change` `ast_bonds` → `ast_bonds_i` (`convert` 1) |
| 19 | 2028-04 | `interest`; `cash_withdrawal` `acc_mi` |
| 20 | 2028-05 | `sell` `ast_mm` parcial con `withholding` |
| 21 | 2028-06 | `standalone_fee` |
| 24 | 2028-09 | `cash_deposit` anual; `buy` `ast_gamma` (tesis abierta, posición viva al final) |
| 26 | 2028-11 | `transfer_requested` `ast_world` → `ast_smallcap_b` (**pendiente al final**) |
| 27 | 2028-12 | `order_placed` `ast_world` (**pendiente al final**, sin `buy`); `valuation` 31/12/2028 |

Invariantes que el esqueleto garantiza por construcción: toda venta cabe en la posición de su cuenta en su fecha (cantidades derivadas de la proyección); toda compra del cubo lleva una tesis abierta antes en el fichero; los picos existen (cantidades elegidas con resto); el prefijo sin la compra tardía sigue válido (la venta de m=6 consume lotes de las aportaciones anteriores); el efectivo se mantiene ≥ 0 por diseño (depósitos dimensionados), aunque no es un invariante verificado.

## 7. Fixtures

| Fichero | Contenido | Uso |
|---|---|---|
| `tests/fixtures/ledger/synthetic-v1.jsonl` | `generateLedger({ seed: 1 })` tal cual lo escribe `atlas synth` | Golden file (congelado tras la fusión) |
| `tests/fixtures/ledger/synthetic-v1.snapshot.json` | `JSON.stringify(snapshotOf(projectLedger(events)), null, 2) + "\n"` | Golden file de la proyección |
| `tests/fixtures/ledger/legacy-v1-for-test-schema.jsonl` | 3-4 líneas v1 (`account_created`, `cash_deposit` con `note`, `buy` con `note`) | Esquema de prueba v2 en dominio y adaptadores |
