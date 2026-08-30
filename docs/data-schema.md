# Esquema de datos

Referencia viva del formato del libro mayor y de las proyecciones. Decisiones de fondo en ADR-0002, ADR-0003, ADR-0005 y ADR-0006. Prosa en español; identificadores en inglés tal como aparecen en el fichero y en el código.

> **Estado:** secciones 1-8 cerradas (Rondas 2 y 4, 2026-08-30) y revisadas tras el *challenge* externo del mismo día (ADR-0012, ADR-0013). Sigue siendo `schema_version = 1`: no existe código todavía. Cada cambio de formato posterior incrementa la versión (§5).

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
| `id` | ULID | Único. Es identidad, **no** orden: el orden canónico es la posición de la línea en el fichero |
| `recorded_at` | ISO 8601 UTC | Momento en que se registró (no la fecha de la operación) |
| `type` | cadena | Tipo de evento. Ver §3 |
| resto | según `type` | Campos del evento |

Reglas transversales:

- Una línea = un objeto JSON en una sola línea, UTF-8, terminada en `\n`. Sin líneas vacías.
- **Numéricos como cadenas decimales** (`"123.4567"`): punto decimal, sin exponente, sin separadores, signo opcional. Un `number` en un campo monetario o de cantidad es error de validación (ADR-0005).
- Fechas de negocio (`trade_date`, `value_date`, `acquisition_date`) como `YYYY-MM-DD` sin zona horaria.
- Nombres de campo en `snake_case`.
- Las líneas nunca se modifican ni se borran. Una rectificación son líneas nuevas (`reversal` + evento correcto).
- **El orden canónico es la posición en el fichero.** Dos dispositivos con relojes distintos pueden generar ULIDs desordenados; el fichero manda, también para el desempate FIFO de lotes con la misma fecha.

## 3. Tipos de evento

| Familia | `type` | Descripción breve |
|---|---|---|
| Catálogo | `account_created`, `account_updated` | Alta y cambios de una cuenta |
| Catálogo | `asset_created`, `asset_updated` | Alta y cambios de un activo (ISIN, ticker, TER, ETF de referencia…) |
| Configuración | `settings_changed` | Configuración completa resultante tras el cambio |
| Operación | `buy`, `sell` | Compra y venta |
| Operación | `transfer` | Traspaso entre fondos (origen y destino en un solo evento) o **traspaso de custodia** del mismo activo entre cuentas (ADR-0012) |
| Operación | `dividend` | Dividendo: bruto, retención en origen, retención en España |
| Operación | `corporate_action` | Evento corporativo con subtipo `kind` (ver `business-rules.md` §6) |
| Operación | `cash_deposit`, `cash_withdrawal` | Movimientos de efectivo de una cuenta |
| Operación | `fx_exchange` | Cambio de divisa dentro de una cuenta (vende una, compra otra) (ADR-0012) |
| Operación | `interest` | Interés de cuenta remunerada, bruto y retención (ADR-0012) |
| Operación | `standalone_fee` | Comisión no ligada a una operación (custodia, conectividad…) |
| Operación | `valuation` | Foto manual de valoración (p. ej. 31/12 para el Modelo 720) |
| Seguimiento | `order_placed`, `order_updated` | Orden de suscripción/compra o reembolso/venta dada y aún no ejecutada (ADR-0012). Sin efecto sobre lotes ni efectivo |
| Seguimiento | `transfer_requested`, `transfer_request_updated` | Traspaso en curso (ADR-0010). Sin efecto sobre lotes ni efectivo |
| Rectificación | `reversal` | Anula un evento anterior (`reverses_id`); opcionalmente el evento correcto lo referencia con `corrects_id` |
| Cubo | `thesis_opened`, `thesis_closed` | Tesis del cubo especulativo |

La forma exacta de cada evento (campos obligatorios, validaciones, ejemplo) se define en §6.

## 4. Campos comunes de las operaciones

| Campo | Tipo | Notas |
|---|---|---|
| `account_id` | id | Cuenta donde ocurre |
| `asset_id` | id | Activo (no en movimientos de efectivo) |
| `trade_date` | fecha | Fecha de contratación |
| `value_date` | fecha | Fecha valor / liquidación |
| *(derivada)* `fiscal_date` | fecha | La que manda para ejercicio, antigüedad, tipo de cambio y ventana de recompra. Se deriva por `asset.type` según `Settings.fiscal_date_rule` (ADR-0013); no se almacena |
| `quantity` | decimal | Cantidad (participaciones, acciones, unidades) |
| `unit_price` | decimal | Precio unitario en `currency`. Informativo si hay `amount` |
| `amount?` | decimal | Importe bruto liquidado en `currency` (sin comisión). Si está presente, **es la base de coste o de transmisión** (ADR-0012) |
| `currency` | ISO 4217 | Divisa del precio y la comisión |
| `fx_rate` | decimal | Tipo del BCE **tal cual lo publica**: unidades de `currency` por EUR, todos sus decimales; `"1"` si EUR. `eur = amount / fx_rate` (ADR-0013) |
| `fx_rate_date` | fecha | Fecha del tipo aplicado. Si `fiscal_date` no tiene publicación (fin de semana, festivo TARGET), el último anterior |
| `fee` | decimal | Comisión en `currency` |
| `broker_ref?` | cadena | Identificador del bróker (`tradeID` de IBKR, referencia de MyInvestor) |
| `fingerprint` | cadena | Huella de idempotencia: hash de (`source`, `broker_ref` si existe —si no, `id` propio en manual—, `account_id`, `asset_id`, `type`, `value_date`, `quantity`, `amount` o `unit_price`, `currency`). **Huella repetida = aviso con confirmación**, no rechazo (ADR-0012) |
| `source` | cadena | `manual`, `ibkr_flex`, `myinvestor_xlsx`… |
| `notes` | cadena | Libre |

## 5. Versionado y migraciones

- `schema_version` empieza en `1`. Cada cambio incompatible del formato de cualquier evento incrementa la versión global.
- Al cargar, cada línea pasa por la cadena `migrate(v) → v+1` hasta la versión actual, en memoria. Las funciones de migración son puras, viven en `packages/domain/schema/migrations/` y tienen como fixtures líneas reales de la versión antigua.
- El fichero **nunca** se reescribe por una migración.
- `compact` (comando de CLI, acción deliberada): reescribe el libro entero a la versión actual y archiva el original en `archive/`. Se ejecuta cuando la cadena de migraciones pendientes molesta, no de forma automática.

**Contrato del cargador y del `append` (hallazgo 10 del *challenge*):**
- El cargador **rechaza** el fichero si alguna línea tiene `schema_version` mayor que la que conoce el código. Un cliente antiguo (CLI vieja, PWA cacheada) nunca escribe sobre un libro más nuevo.
- `append` conserva **los bytes originales** del fichero y solo añade líneas al final; nunca re-serializa lo cargado. Solo `compact` reescribe.
- `settingsAt(date)` y cualquier comparación entre una fecha de negocio y `recorded_at` convierte `recorded_at` a fecha en `Europe/Madrid` y usa "hasta el fin de ese día".

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
Comunes (§4) + `order_id?` (cierra un `order_placed`) + `thesis_id?` (obligatorio si la cuenta es del libro `bucket`; debe existir un `thesis_opened` previo con ese id).

```json
{"type":"buy","account_id":"acc_ibkr","asset_id":"ast_xau","trade_date":"2026-09-01","value_date":"2026-09-03","quantity":"12","unit_price":"215.30","currency":"USD","fx_rate":"0.9211","fee":"1.50","source":"manual","fingerprint":"sha256:…"}
```

Efecto: crea un lote con `acquisition_date = fiscal_date`, `cost_eur = ((amount ?? quantity × unit_price) + fee) / fx_rate`.

**`sell`**
Comunes + `withholding?` (retención a cuenta practicada, en `currency`).

Admite `order_id?`. Efecto: consume lotes FIFO del `asset_id` en todas las cuentas (§8.1); valor de transmisión `((amount ?? quantity × unit_price) − fee) / fx_rate`; genera ganancia o pérdida por lote consumido; comprueba la regla de recompra (§8.4). Rechaza si la cantidad supera la posición física de la cuenta.

**`transfer`** (ADR-0010)
`request_id?`, `from_account_id`, `from_asset_id`, `quantity_out`, `nav_out`, `value_date_out`, `to_account_id`, `to_asset_id`, `quantity_in`, `nav_in`, `value_date_in`, `fee?`, `fingerprint`

**Dos modos:** (a) *traspaso fiscal* entre fondos distintos: ambos activos deben ser `transferable`; (b) *traspaso de custodia* (`from_asset_id == to_asset_id`, cuentas distintas): admitido para cualquier activo, sin `nav_*`, solo mueve `physicalPositions`; los lotes fiscales no cambian (ADR-0012). En el modo (a), efecto: consume `quantity_out` de lotes origen en FIFO; por cada lote consumido crea un lote destino con la **misma `acquisition_date`** y el **mismo coste total** (repartiendo `quantity_in` en proporción a la cantidad consumida de cada lote); `unit_cost_eur` destino = coste heredado / cantidad recibida. No genera ganancia ni pérdida.

**`transfer_requested`** (sin efecto sobre lotes)
`from_account_id`, `from_asset_id`, `to_account_id`, `to_asset_id`, `quantity_out?` o `amount_eur?`, `requested_date`, `notes?`

**`transfer_request_updated`** (sin efecto sobre lotes)
`request_id` (= `id` del `transfer_requested`), `stage` (`redeemed` | `subscribed` | `cancelled`), `date`, `nav_out?`, `quantity_out?`, `notes?`

**`order_placed`** (sin efecto sobre lotes ni efectivo, ADR-0012)
`account_id`, `asset_id`, `side` (`buy` | `sell`), `amount?` o `quantity?`, `requested_date`, `notes?`

**`order_updated`** (sin efecto)
`order_id` (= `id` del `order_placed`), `stage` (`cancelled` | `note`), `date`, `notes?`

Un `buy`/`sell` con `order_id` cierra la orden. Un `order_placed` sin cierre es una orden **pendiente** (`pendingOrders`).

**`fx_exchange`** (ADR-0012)
`account_id`, `value_date`, `sold_amount`, `sold_currency`, `bought_amount`, `bought_currency`, `fee`, `fee_currency`, `fx_rate_sold`, `fx_rate_bought`, `fx_rate_date`, `broker_ref?`, `fingerprint`

Efecto: resta `sold_amount` y suma `bought_amount` en `cashBalances` de la cuenta. Los tipos BCE de ambas divisas se guardan para la futura proyección de diferencias de cambio (Fase 5).

**`interest`** (ADR-0012)
`account_id`, `value_date`, `gross`, `withholding_spain`, `currency`, `fx_rate`, `fx_rate_date`, `broker_ref?`, `fingerprint`

Efecto: suma el neto al efectivo; alimenta `investmentIncome` (rendimiento del capital mobiliario con retención).

**`dividend`**
`account_id`, `asset_id`, `value_date`, `gross`, `withholding_origin`, `withholding_spain`, `currency`, `fx_rate`, `fx_rate_date`, `per_unit?`, `broker_ref?`, `fingerprint`

Efecto: no toca lotes; suma al efectivo de la cuenta el neto; alimenta rendimientos del capital mobiliario y deducción por doble imposición.

**`cash_deposit` / `cash_withdrawal`**
`account_id`, `value_date`, `amount`, `currency`, `fx_rate`, `notes?`, `fingerprint`

**`standalone_fee`**
`account_id`, `value_date`, `amount`, `currency`, `fx_rate`, `description`, `fingerprint`. No afecta a la base fiscal de ningún lote.

**`valuation`**
`account_id`, `asset_id`, `date`, `quantity`, `unit_value`, `currency`, `fx_rate`, `source`. Foto manual de Nivel 1 (p. ej. 31/12 para el Modelo 720). No toca lotes.

**`corporate_action`** (ADR-0011)
`kind`, `asset_id` (activo afectado), `effective_date`, `source_document` (clave en `documents/`), `effects[]` (primitivas, ver §6.5), `notes`, `fingerprint`

Afecta a los lotes del `asset_id` en **todas** las cuentas (los lotes fiscales son globales, ADR-0009); `forced_sale` reparte el efectivo entre cuentas en proporción a su posición física.

### 6.3 Rectificación (ADR-0003)

**`reversal`**
`reverses_id`, `reason`. Anula el evento referenciado a todos los efectos; la proyección ignora ambos. Un `reversal` de un `reversal` está prohibido (se registra de nuevo el evento original).

**Eventos ya consumidos (hallazgo 3 del *challenge*):** `reverseEvent` y `correctEvent` re-proyectan el libro completo sin la pareja y **rechazan** la operación si algún evento posterior deja de ser válido (una venta que consumía el lote anulado y se queda sin lotes, un `transfer` cuyos lotes destino ya se vendieron, un `account_updated` que cambia `book` con posiciones vivas, un `asset_created` con eventos que lo referencian…), listando los eventos afectados. Para anular algo consumido hay que rectificar primero lo que dependía de ello. La proyección ante un estado inválido **falla ruidosamente**; nunca produce cantidades negativas en silencio.

Cualquier evento puede llevar `corrects_id` apuntando al evento que sustituye. La CLI y la web implementan *Editar* como `reversal` + evento nuevo con `corrects_id`, y *Eliminar* como `reversal` solo. Si el evento rectificado tiene `value_date` en un ejercicio anterior al actual, la app avisa de que afecta a una declaración ya presentada.

### 6.4 Cubo

**`thesis_opened`**
`thesis_id`, `account_id`, `asset_id`, `hypothesis`, `expected_horizon_days`, `invalidation`, `planned_size_eur`

**`thesis_closed`**
`thesis_id`, `closing_notes`. El resultado (`result_eur`, `result_vs_index`) es derivado.

### 6.5 Eventos corporativos: primitivas

| Primitiva | Parámetros | Efecto |
|---|---|---|
| `scale` | `ratio` | `quantity × ratio` en cada lote; coste total y `acquisition_date` intactos |
| `convert` | `to_asset_id`, `ratio` | Cada lote pasa a `to_asset_id` con `quantity × ratio`; coste total y fecha intactos; `source_lot_id` enlaza |
| `carve_out` | `to_asset_id`, `ratio`, `cost_share` | Por cada lote crea otro en `to_asset_id` con `quantity × ratio`, coste `cost × cost_share` y la misma fecha; el lote origen queda con `cost × (1 − cost_share)` |
| `forced_sale` | `per_account[]` de `{account_id, quantity}` (o `"all"`), `unit_price`, `currency`, `fx_rate`, `fx_rate_date`, `fee?` | Como un `sell` FIFO por cada cuenta: hecho imponible. Los picos (contrasplit, liberadas, escisión) se liquidan **cuenta a cuenta**, como hace cada bróker (hallazgo 8) |
| `grant` | `per_account[]` de `{account_id, quantity}`, `asset_id`, `unit_cost`, `currency`, `fx_rate`, `acquisition_date` | Lotes nuevos por cuenta |

Ejemplo (fusión con pago parcial en efectivo: 1 acción nueva por cada 2 antiguas más 3 € por antigua):

```json
{"type":"corporate_action","kind":"merger","asset_id":"ast_old","effective_date":"2031-03-12","source_document":"documents/01J…/prospectus.pdf",
 "effects":[
   {"op":"forced_sale","quantity":"all","unit_price":"3","currency":"EUR","fx_rate":"1","note":"cash component"},
   {"op":"convert","to_asset_id":"ast_new","ratio":"0.5"}
 ],"notes":"Absorción de OLD por NEW. Componente en efectivo tributa; el canje conserva antigüedad."}
```

(En este ejemplo el `forced_sale` se expresa como venta del componente en efectivo por acción antigua; el asistente de la CLI lo genera a partir de "3 € por acción".)

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
| `pendingOrders` | Órdenes (`order_placed`) sin `buy`/`sell` que las cierre ni cancelación | ADR-0012 |
| `theses` | Tesis abiertas y cerradas con métricas | Requiere precios para P&L latente |
| `realizedGains(year)` | Ganancias y pérdidas por operación y lote, con diferimientos | Motor fiscal |
| `deferredLosses` | Pérdidas pendientes por regla de los dos meses, asociadas a lotes | §8.4 |
| `investmentIncome(year)` | Dividendos y retenciones | §6.2 |
| `valuations(date)` | Valoraciones registradas | Modelo 720 |
| `integrity` | Comprobaciones: posiciones físicas ≥ 0, lotes fiscales = suma física por activo, huellas únicas | Verificación trimestral |

## 8. FIFO y reglas fiscales aplicadas

### 8.1 Algoritmo FIFO (ADR-0009)

Para cada `asset_id`, los lotes abiertos se ordenan por (`acquisition_date`, `id`). Una transmisión de cantidad `q` consume lotes en ese orden, partiendo el último si hace falta. La cuenta donde ocurre la transmisión no influye en qué lotes se consumen; sí influye en `physicalPositions`.

Coste de adquisición de un lote: `((amount ?? quantity × unit_price) + fee) / fx_rate`, en EUR, exacto. Valor de transmisión: `((amount ?? quantity × unit_price) − fee) / fx_rate`. Fechas: `acquisition_date` y la fecha de transmisión son la `fiscal_date` de cada evento (ADR-0013). Ganancia por lote consumido = valor de transmisión proporcional − coste del lote proporcional. Se suma por operación y se redondea a céntimos una vez (ADR-0005).

### 8.2 Lotes procedentes de traspaso

Conservan `acquisition_date` y coste total heredados. Un traspaso parcial consume lotes origen en FIFO. `source_lot_id` enlaza cada lote destino con su origen para trazabilidad.

### 8.3 Valores homogéneos tras un canje

Tras un `convert` (fusión, cambio de clase…), los lotes pasan al activo nuevo con su fecha y coste, y el FIFO continúa dentro del activo nuevo.

### 8.4 Regla de recompra con pérdidas ("dos meses" / "un año")

Para cada transmisión con pérdida de un activo, se buscan adquisiciones del mismo `asset_id` en `[fiscal_date − W, fiscal_date + W]`, con `W = Settings.wash_sale_window_days[asset.type]` (por defecto 365 días para `fund`, `money_market` y `crypto`; 61 para `stock`, `etc`, `etp`; ADR-0013, *verificar*). Cuentan como adquisición `buy` y `grant` con coste; **no** cuentan un `transfer` entrante, `scale` ni `grant` con coste cero. La pérdida se difiere en la proporción `min(cantidad recomprada, cantidad vendida) / cantidad vendida`, se asocia a los lotes recomprados (los más cercanos en fecha primero) y se libera, como pérdida computable, en el ejercicio en que esos lotes se transmitan. La app avisa en el momento de registrar la recompra.

### 8.5 Transformaciones por evento corporativo

Tabla de composición admitida por `kind` (el evento se rechaza si sus `effects` no encajan) y ejemplo numérico sobre un lote de **10 títulos, coste total 1.000 €, adquirido el 2027-01-10**. *Criterios fiscales: verificar con asesor.*

| `kind` | `effects` admitidos | Ejemplo | Resultado |
|---|---|---|---|
| `split` | `scale` | 4:1 → `scale(4)` | 40 títulos, coste 1.000 €, fecha 2027-01-10. Sin hecho imponible |
| `reverse_split` | `scale` + `forced_sale?` | 1:4 con 10 títulos → `scale(0.25)` deja 2,5; `forced_sale(0.5 @ 400 €)` | 2 títulos, coste 800 €; la fracción vendida: transmisión 200 € − coste 200 € = 0 € (hecho imponible aunque sea cero) |
| `stock_dividend` | `scale` | 1 nueva por cada 10 → `scale(1.1)` | 11 títulos, coste 1.000 € repartido (90,91 €/título), fecha original. Sin hecho imponible (acciones liberadas). Si en vez de acciones se venden los derechos: `grant(rights, coste 0)` + `forced_sale`: ganancia = importe cobrado |
| `merger` | `convert` + `forced_sale?` | 1 nueva por 2 antiguas → `convert(NEW, 0.5)` | 5 títulos de NEW, coste 1.000 €, fecha 2027-01-10. El componente en efectivo, si lo hay, tributa vía `forced_sale` |
| `spin_off` | `carve_out` | 1 nueva por 4 antiguas, 20% del coste → `carve_out(SPIN, 0.25, 0.20)` | 10 títulos OLD coste 800 € + 2,5 títulos SPIN coste 200 €, ambos fecha 2027-01-10. `cost_share` sale de la proporción publicada por el emisor o de los valores de mercado del primer día (*verificar*) |
| `fund_merger` | `convert` | ratio = NAV_old / NAV_new = 1,7 → `convert(FUND_B, 1.7)` | 17 participaciones de B, coste 1.000 €, fecha original. Sin hecho imponible |
| `share_class_change` | `convert` | igual que `fund_merger` | Activo nuevo (otra clase, otro TER); lotes heredados |
| `fund_liquidation` | `forced_sale(all)` | NAV de liquidación 120 € → `forced_sale(all @ 120)` | Transmisión 1.200 € − coste 1.000 € = ganancia 200 €. Hecho imponible |
| `issuer_liquidation` | `forced_sale(all)` | Disolución con 0 € → `forced_sale(all @ 0)` | Pérdida 1.000 €, computable cuando la sociedad se disuelve (*verificar*; una mera exclusión de cotización no basta) |
| `delisting` | ninguno | — | Solo marca: `asset_updated` con `active=false`; la posición sigue sin precio (fallo seguro) |
| `crypto_fork` | `grant` | 10 unidades nuevas → `grant(FORK, 10, coste 0, fecha del fork)` | Lote de 10 con coste 0 €; al vender tributa todo (ADR: criterio conservador) |
| `token_migration` | `convert` | 1:100 → `convert(NEWTOKEN, 100)` | 1.000 unidades, coste 1.000 €, fecha original |
| `issuer_restructuring` | `convert` y/o `forced_sale` | según el folleto | Se compone como fusión o liquidación |

`identifier_change` y `cash_dividend` no son `corporate_action` (ver ADR-0011).
