# Esquema de datos

Referencia viva del formato del libro mayor y de las proyecciones. Decisiones de fondo en ADR-0002, ADR-0003, ADR-0005 y ADR-0006. Prosa en español; identificadores en inglés tal como aparecen en el fichero y en el código.

> **Estado:** secciones 1-5 cerradas (Ronda 2). Las secciones 6-8 (semántica de cada evento, proyecciones, FIFO) se completan en la Ronda 4.

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

*Pendiente — Ronda 4.* Para cada `type`: campos obligatorios y opcionales, validaciones, efecto sobre las proyecciones, ejemplo JSON completo.

## 7. Proyecciones

*Pendiente — Ronda 4.* `accounts`, `assets`, `settings_at(date)`, `lots`, `positions`, `cash_balances`, `theses`, y las derivadas fiscales.

## 8. FIFO y reglas fiscales aplicadas

*Pendiente — Ronda 4.* Valores homogéneos, orden de lotes con la misma fecha, comisiones en la base, traspaso parcial, regla de los dos meses, transformación de lotes por cada `kind` de evento corporativo con ejemplo numérico.
