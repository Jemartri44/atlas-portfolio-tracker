# Esquema de datos

Referencia viva del formato del libro mayor y de las proyecciones. Decisiones de fondo en ADR-0002, ADR-0003, ADR-0005 y ADR-0006. Prosa en español; identificadores en inglés tal como aparecen en el fichero y en el código.

> **Estado:** secciones 1-5 cerradas (Ronda 2); 6-8 cerradas (Ronda 4a) salvo los eventos corporativos (§6.5, §8.5), que se completan en la Ronda 4b.

## 1. Distribución del bucket

| Prefijo | Contenido | Retención |
|---|---|---|
| `ledger/ledger.jsonl` | El libro: un evento por línea, append-only | Para siempre. Versiones no vigentes de S3: 365 días |
| `archive/ledger-<YYYY-MM-DD>-v<n>.jsonl` | Fichero anterior a cada compactación, sin tocar | Para siempre |
| `reference/ecb/eurofxref-hist.csv` | Histórico oficial del BCE, íntegro, refrescado a diario | Se sobrescribe |
| `prices/<asset_id>.jsonl` | Precios informativos (Nivel 2), una línea por fecha y fuente | Para siempre |
| `documents/<event_id>/<fichero>` | Fuente documental de eventos corporativos (PDF, HTML) | Para siempre |
| `imports/<source>/<YYYY-MM-DD>-<hash>.<ext>` | Extractos importados, tal cual llegaron | Para siempre |
| `backups/<YYYY-MM>/ledger.jsonl`, `positions.json` | Copia mensual del libro y de la proyección de posiciones valorada | Para siempre |

Un solo bucket privado por entorno (`dev`, `prod`), cifrado por defecto, versionado activado, sin acceso público.

## 2. Envoltorio de cada línea

```json
{"schema_version": 1, "id": "01J6...", "recorded_at": "2026-09-01T18:22:05Z", "type": "buy", ...}
```

| Campo | Tipo | Regla |
|---|---|---|
| `schema_version` | entero | Versión del esquema con la que se escribió la línea. Ver §5 |
| `id` | ULID | Único y monótono. **El orden de `id` es el orden canónico del libro** |
| `recorded_at` | ISO 8601 UTC | Momento en que se registró (no la fecha de la operación) |
| `type` | cadena | Tipo de evento. Ver §3 |
| resto | según `type` | Campos del evento |

Reglas transversales:

- Una línea = un objeto JSON en una sola línea, UTF-8, terminada en `\n`. Sin líneas vacías.
- **Numéricos como cadenas decimales** (`"123.4567"`): punto decimal, sin exponente, sin separadores, signo opcional. Un `number` en un campo monetario o de cantidad es error de validación (ADR-0005).
- Fechas de negocio (`trade_date`, `value_date`, `acquisition_date`) como `YYYY-MM-DD` sin zona horaria.
- Nombres de campo en `snake_case`.
- Las líneas nunca se modifican ni se borran. Una rectificación son líneas nuevas (`reversal` + evento correcto).

## 3. Tipos de evento

| Familia | `type` | Descripción breve |
|---|---|---|
| Catálogo | `account_created`, `account_updated` | Alta y cambios de una cuenta |
| Catálogo | `asset_created`, `asset_updated` | Alta y cambios de un activo (ISIN, ticker, TER, ETF de referencia…) |
| Configuración | `settings_changed` | Configuración completa resultante tras el cambio |
| Operación | `buy`, `sell` | Compra y venta |
| Operación | `transfer` | Traspaso entre fondos (origen y destino en un solo evento) |
| Operación | `dividend` | Dividendo: bruto, retención en origen, retención en España |
| Operación | `corporate_action` | Evento corporativo con subtipo `kind` (ver `business-rules.md` §6) |
| Operación | `cash_deposit`, `cash_withdrawal` | Movimientos de efectivo de una cuenta |
| Operación | `standalone_fee` | Comisión no ligada a una operación (custodia, conectividad…) |
| Operación | `valuation` | Foto manual de valoración (p. ej. 31/12 para el Modelo 720) |
| Rectificación | `reversal` | Anula un evento anterior (`reverses_id`); opcionalmente el evento correcto lo referencia con `corrects_id` |
| Cubo | `thesis_opened`, `thesis_closed` | Tesis del cubo especulativo |

La forma exacta de cada evento (campos obligatorios, validaciones, ejemplo) se define en §6.

## 4. Campos comunes de las operaciones

| Campo | Tipo | Notas |
|---|---|---|
| `account_id` | id | Cuenta donde ocurre |
| `asset_id` | id | Activo (no en movimientos de efectivo) |
| `trade_date` | fecha | Fecha de orden |
| `value_date` | fecha | Fecha valor; la que manda para tipo de cambio y fiscalidad |
| `quantity` | decimal | Cantidad (participaciones, acciones, unidades) |
| `unit_price` | decimal | Precio unitario en `currency` |
| `currency` | ISO 4217 | Divisa del precio y la comisión |
| `fx_rate` | decimal | Tipo BCE de `value_date` (EUR por unidad de `currency`); `"1"` si EUR |
| `fee` | decimal | Comisión en `currency` |
| `fingerprint` | cadena | Huella de importación para idempotencia (ver §6) |
| `source` | cadena | `manual`, `ibkr_flex`, `myinvestor_csv`… |
| `notes` | cadena | Libre |

## 5. Versionado y migraciones

- `schema_version` empieza en `1`. Cada cambio incompatible del formato de cualquier evento incrementa la versión global.
- Al cargar, cada línea pasa por la cadena `migrate(v) → v+1` hasta la versión actual, en memoria. Las funciones de migración son puras, viven en `packages/domain/schema/migrations/` y tienen como fixtures líneas reales de la versión antigua.
- El fichero **nunca** se reescribe por una migración.
- `compact` (comando de CLI, acción deliberada): reescribe el libro entero a la versión actual y archiva el original en `archive/`. Se ejecuta cuando la cadena de migraciones pendientes molesta, no de forma automática.

## 6. Semántica de cada evento

Todos llevan el envoltorio de §2. Los ejemplos omiten `schema_version`, `id` y `recorded_at`. Campos marcados `?` son opcionales. Numéricos siempre como cadenas.

### 6.1 Catálogo

Los eventos `*_updated` llevan el **estado completo resultante** (no un diff), igual que `settings_changed`: más bytes, mucha más legibilidad.

**`account_created` / `account_updated`**
`account_id`, `name`, `platform`, `book` (`core` | `bucket`), `base_currency`, `country` (ISO 3166-1, para el Modelo 720), `active`

**`asset_created` / `asset_updated`**
`asset_id`, `type` (`fund` | `etc` | `etp` | `stock` | `crypto` | `money_market`), `book`, `asset_class?` (solo `core`: `equity` | `fixed_income` | `gold` | `crypto`), `isin?`, `ticker?`, `name`, `currency`, `ter?`, `transferable`, `reference_etf_id?`, `active`

Validación (ADR-0009): un `asset_id` no puede existir en los dos libros. Un cambio puro de identificador (mismo producto) es `asset_updated`; cualquier otro cambio es activo nuevo + `corporate_action` (ver §6.5).

**`settings_changed`**
`settings`: objeto completo con todos los parámetros de `business-rules.md` §7. La proyección `settingsAt(date)` devuelve el último `settings_changed` con `recorded_at ≤ date`.

### 6.2 Operaciones

**`buy`**
Comunes (§4) + `thesis_id?` (obligatorio si la cuenta es del libro `bucket`; debe existir un `thesis_opened` previo con ese id).

```json
{"type":"buy","account_id":"acc_ibkr","asset_id":"ast_xau","trade_date":"2026-09-01","value_date":"2026-09-03","quantity":"12","unit_price":"215.30","currency":"USD","fx_rate":"0.9211","fee":"1.50","source":"manual","fingerprint":"sha256:…"}
```

Efecto: crea un lote con `acquisition_date = value_date`, `cost_eur = (quantity × unit_price + fee) × fx_rate`.

**`sell`**
Comunes + `withholding?` (retención a cuenta practicada, en `currency`).

Efecto: consume lotes FIFO del `asset_id` en todas las cuentas (§8.1); valor de transmisión `(quantity × unit_price − fee) × fx_rate`; genera ganancia o pérdida por lote consumido; comprueba la regla de los dos meses (§8.4). Rechaza si la cantidad supera la posición física de la cuenta.

**`transfer`** (ADR-0010)
`request_id?`, `from_account_id`, `from_asset_id`, `quantity_out`, `nav_out`, `value_date_out`, `to_account_id`, `to_asset_id`, `quantity_in`, `nav_in`, `value_date_in`, `fee?`, `fingerprint`

Ambos activos deben ser `transferable`. Efecto: consume `quantity_out` de lotes origen en FIFO; por cada lote consumido crea un lote destino con la **misma `acquisition_date`** y el **mismo coste total** (repartiendo `quantity_in` en proporción a la cantidad consumida de cada lote); `unit_cost_eur` destino = coste heredado / cantidad recibida. No genera ganancia ni pérdida.

**`transfer_requested`** (sin efecto sobre lotes)
`from_account_id`, `from_asset_id`, `to_account_id`, `to_asset_id`, `quantity_out?` o `amount_eur?`, `requested_date`, `notes?`

**`transfer_request_updated`** (sin efecto sobre lotes)
`request_id` (= `id` del `transfer_requested`), `stage` (`redeemed` | `subscribed` | `cancelled`), `date`, `nav_out?`, `quantity_out?`, `notes?`

**`dividend`**
`account_id`, `asset_id`, `value_date`, `gross`, `withholding_origin`, `withholding_spain`, `currency`, `fx_rate`, `per_unit?`, `fingerprint`

Efecto: no toca lotes; suma al efectivo de la cuenta el neto; alimenta rendimientos del capital mobiliario y deducción por doble imposición.

**`cash_deposit` / `cash_withdrawal`**
`account_id`, `value_date`, `amount`, `currency`, `fx_rate`, `notes?`, `fingerprint`

**`standalone_fee`**
`account_id`, `value_date`, `amount`, `currency`, `fx_rate`, `description`, `fingerprint`. No afecta a la base fiscal de ningún lote.

**`valuation`**
`account_id`, `asset_id`, `date`, `quantity`, `unit_value`, `currency`, `fx_rate`, `source`. Foto manual de Nivel 1 (p. ej. 31/12 para el Modelo 720). No toca lotes.

**`corporate_action`**
*Pendiente — Ronda 4b.* `kind`, `effective_date`, `source_document`, `effects[]`, `notes`.

### 6.3 Rectificación (ADR-0003)

**`reversal`**
`reverses_id`, `reason`. Anula el evento referenciado a todos los efectos; la proyección ignora ambos. Un `reversal` de un `reversal` está prohibido (se registra de nuevo el evento original).

Cualquier evento puede llevar `corrects_id` apuntando al evento que sustituye. La CLI y la web implementan *Editar* como `reversal` + evento nuevo con `corrects_id`, y *Eliminar* como `reversal` solo. Si el evento rectificado tiene `value_date` en un ejercicio anterior al actual, la app avisa de que afecta a una declaración ya presentada.

### 6.4 Cubo

**`thesis_opened`**
`thesis_id`, `account_id`, `asset_id`, `hypothesis`, `expected_horizon_days`, `invalidation`, `planned_size_eur`

**`thesis_closed`**
`thesis_id`, `closing_notes`. El resultado (`result_eur`, `result_vs_index`) es derivado.

### 6.5 Eventos corporativos

*Pendiente — Ronda 4b.*

## 7. Proyecciones

Todas son funciones puras `project(events) → estado`, ignoran parejas anuladas por `reversal`, y se recalculan en cada carga.

| Proyección | Devuelve | Notas |
|---|---|---|
| `accounts` | Cuentas con su estado actual | Último `account_*` por `account_id` |
| `assets` | Activos con su estado actual e historial de identificadores | Último `asset_*` por `asset_id`; los anteriores forman `identifier_history` |
| `settingsAt(date)` | Configuración vigente | Último `settings_changed` anterior o igual a `date` |
| `physicalPositions` | Cantidad por (`account_id`, `asset_id`) | Suma de compras, ventas, traspasos y efectos corporativos **por cuenta**. Es lo que se concilia |
| `fiscalLots` | Lotes abiertos y cerrados por `asset_id` (globales) | Resultado del FIFO de §8 |
| `cashBalances` | Efectivo por cuenta y divisa | ADR-0004 |
| `pendingTransfers` | Solicitudes de traspaso sin `transfer` final | ADR-0010 |
| `theses` | Tesis abiertas y cerradas con métricas | Requiere precios para P&L latente |
| `realizedGains(year)` | Ganancias y pérdidas por operación y lote, con diferimientos | Motor fiscal |
| `deferredLosses` | Pérdidas pendientes por regla de los dos meses, asociadas a lotes | §8.4 |
| `investmentIncome(year)` | Dividendos y retenciones | §6.2 |
| `valuations(date)` | Valoraciones registradas | Modelo 720 |
| `integrity` | Comprobaciones: posiciones físicas ≥ 0, lotes fiscales = suma física por activo, huellas únicas | Verificación trimestral |

## 8. FIFO y reglas fiscales aplicadas

### 8.1 Algoritmo FIFO (ADR-0009)

Para cada `asset_id`, los lotes abiertos se ordenan por (`acquisition_date`, `id`). Una transmisión de cantidad `q` consume lotes en ese orden, partiendo el último si hace falta. La cuenta donde ocurre la transmisión no influye en qué lotes se consumen; sí influye en `physicalPositions`.

Coste de adquisición de un lote: `(quantity × unit_price + fee) × fx_rate`, en EUR, exacto. Valor de transmisión: `(quantity × unit_price − fee) × fx_rate`. Ganancia por lote consumido = valor de transmisión proporcional − coste del lote proporcional. Se suma por operación y se redondea a céntimos una vez (ADR-0005).

### 8.2 Lotes procedentes de traspaso

Conservan `acquisition_date` y coste total heredados. Un traspaso parcial consume lotes origen en FIFO. `source_lot_id` enlaza cada lote destino con su origen para trazabilidad.

### 8.3 Valores homogéneos tras un canje

Tras un `convert` (fusión, cambio de clase…), los lotes pasan al activo nuevo con su fecha y coste, y el FIFO continúa dentro del activo nuevo.

### 8.4 Regla de los dos meses

Para cada venta con pérdida de un activo, se buscan adquisiciones del mismo `asset_id` en `[value_date − 2 meses, value_date + 2 meses]`. La pérdida se difiere en la proporción `min(cantidad recomprada, cantidad vendida) / cantidad vendida`, se asocia a los lotes recomprados (los más cercanos en fecha primero) y se libera, como pérdida computable, en el ejercicio en que esos lotes se transmitan. La app avisa en el momento de registrar la recompra. *Verificar con asesor* el plazo para valores no cotizados.

### 8.5 Transformaciones por evento corporativo

*Pendiente — Ronda 4b.* Una tabla por `kind` con ejemplo numérico.
