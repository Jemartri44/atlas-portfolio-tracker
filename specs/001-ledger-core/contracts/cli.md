# Contrato de la CLI `atlas`

Ejecutable `atlas` (`apps/cli`), sin dependencias. Global: `--ledger <ruta>` (por defecto `./ledger.jsonl`), `--yes` (omite la confirmación), `--confirm-duplicate`, `--json` (salida en JSON en vez de tabla, para scripts). Los flags aceptan `--k v` y `--k=v`. Mensajes en español; nombres de flags y campos en inglés (`snake_case` del esquema → `kebab-case` en flags).

## Códigos de salida

| Código | Significado |
|---|---|
| 0 | OK |
| 1 | Error de validación o de proyección (mensaje con el `code` y el evento afectado) |
| 2 | Conflicto de escritura (`etag`); repetir el comando |
| 3 | Huella repetida sin `--confirm-duplicate` |
| 4 | Confirmación necesaria sin TTY y sin `--yes` |
| 5 | Libro con `schema_version` más nueva que esta CLI |
| 64 | Uso incorrecto (comando o flags desconocidos, falta un flag obligatorio) |

## Comandos

### Catálogo y configuración

| Comando | Flags | Efecto |
|---|---|---|
| `atlas account add` | `--id --name --platform --book core\|bucket --base-currency --country [--inactive]` | `account_created` |
| `atlas account update <id>` | los mismos, opcionales; copia el resto del estado actual | `account_updated` (estado completo) |
| `atlas account list` | | tabla: id, name, platform, book, base_currency, country, active |
| `atlas asset add` | `--id --type --book --name --currency --transferable\|--not-transferable [--asset-class --isin --ticker --ter --reference-etf --inactive]` | `asset_created` |
| `atlas asset update <id>` | los mismos, opcionales | `asset_updated` |
| `atlas asset list` | | tabla + `identifier_history` con `--history` |
| `atlas settings set` | `--fiscal-date-rule <type>=<trade_date\|value_date>,…` `--wash-sale-window-days <type>=<n>,…` y `--<param> <valor>` para el resto de §7 | `settings_changed` con el objeto completo (fusiona sobre el vigente) |
| `atlas settings show [--at YYYY-MM-DD]` | | configuración vigente (por defecto hoy) y su origen (`default` o `id` del evento) |

### Operaciones (`atlas add …`)

Todos: `--account --trade-date --value-date --currency --fx-rate --fx-rate-date [--fee 0] [--broker-ref] [--source manual] [--notes]`. Muestran el evento y piden confirmación.

| Comando | Flags propios |
|---|---|
| `atlas add buy` | `--asset --quantity [--unit-price] [--amount] [--order <id>]` (al menos uno de `unit-price`/`amount`; `unit-price` obligatorio si falta `amount`) |
| `atlas add sell` | como `buy` + `[--withholding]` |
| `atlas add transfer` | `--from-account --from-asset --quantity-out --value-date-out --to-account --to-asset --quantity-in --value-date-in [--nav-out --nav-in] [--fee] [--request <id>]` |
| `atlas add dividend` | `--asset --value-date --gross --withholding-origin 0 --withholding-spain 0 [--per-unit]` |
| `atlas add interest` | `--value-date --gross --withholding-spain 0` |
| `atlas add fx` | `--value-date --sold-amount --sold-currency --bought-amount --bought-currency --fee 0 --fee-currency --fx-rate-sold --fx-rate-bought --fx-rate-date` |
| `atlas add cash-in` / `cash-out` | `--value-date --amount --currency --fx-rate` |
| `atlas add fee` | `--value-date --amount --currency --fx-rate --description` |
| `atlas add valuation` | `--asset --date --quantity --unit-value --currency --fx-rate --source` |

### Seguimiento

| Comando | Flags |
|---|---|
| `atlas order place` | `--account --asset --side buy\|sell (--amount \| --quantity) --requested-date [--notes]` |
| `atlas order cancel <order_id>` | `--date [--notes]` (`order_updated`, `stage = cancelled`) |
| `atlas order note <order_id>` | `--date --notes` |
| `atlas order list [--all]` | pendientes (por defecto) con días abiertas |
| `atlas transfer request` | `--from-account --from-asset --to-account --to-asset (--quantity-out \| --amount-eur) --requested-date [--notes]` |
| `atlas transfer update <request_id>` | `--stage redeemed\|subscribed\|cancelled --date [--nav-out --quantity-out --notes]` |
| `atlas transfer pending` / `atlas transfers pending` | solicitudes abiertas con etapa y días |

### Rectificación

| Comando | Flags | Efecto |
|---|---|---|
| `atlas edit <id>` | `--reason` + cualquier flag del comando `add` correspondiente para sobrescribir campos | `reversal` + evento corregido con `corrects_id`; avisa si el ejercicio es anterior; muestra ambos y confirma |
| `atlas delete <id>` | `--reason` | `reversal`; mismo aviso |

Si hay eventos dependientes: código 1 y tabla con `id`, `type`, `fecha` y motivo de cada afectado.

### Consultas

| Comando | Salida |
|---|---|
| `atlas positions [--account] [--asset]` | cuenta, activo, cantidad |
| `atlas lots [asset] [--closed]` | lote, fecha adquisición, cantidad restante / original, coste EUR restante, origen (`event_id`, `source_lot_id`) |
| `atlas cash [--account]` | cuenta, divisa, saldo |
| `atlas gains <year>` | por operación: fecha fiscal, activo, cuenta, transmisión EUR, coste EUR, ganancia EUR (redondeada); total del ejercicio; con `--lots` desglose por lote |
| `atlas income <year>` | dividendos e intereses: brutos, retenciones, neto, en divisa y EUR |
| `atlas check` | hallazgos de `integrity`; código 1 si hay `error`, 0 si solo `warning` |
| `atlas export --format jsonl\|csv [--out <ruta>]` | JSONL: copia byte a byte del libro; CSV: una fila por evento con la unión de columnas, numéricos como texto, a stdout o fichero |

## Confirmación

Antes de escribir, la CLI imprime el evento (tabla clave/valor, campos en el orden del esquema) y pregunta `¿Registrar? [s/N]`. `--yes` omite la pregunta pero **no** los avisos (huella repetida → código 3 salvo `--confirm-duplicate`; ejercicio anterior → se imprime igualmente).
