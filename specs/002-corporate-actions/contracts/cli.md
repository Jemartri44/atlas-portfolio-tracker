# Contrato de la CLI `atlas` — ampliación de la 002

Global, códigos de salida y confirmación: como en `specs/001-ledger-core/contracts/cli.md`. Flags nuevos aceptan `--k v` y `--k=v`. Mensajes en español.

## Eventos corporativos (`atlas ca <kind> …`)

Todos: `--asset <asset_id> --effective-date YYYY-MM-DD --source-document <clave o URL> [--notes …]` más los globales. `--ratio` acepta un decimal (`4`, `0.25`) o una fracción `nuevas/antiguas` (`4/3`, `1/3`), que se guarda tal cual. Flujo: construir el evento → mostrar el evento completo (tabla clave/valor, `effects` en JSON) → mostrar la **tabla antes/después** (posiciones por cuenta y lotes abiertos de los activos afectados, y las ganancias que generaría) → recordar que el documento fuente se copia a mano → confirmar → `recordEvent`. Avisos del dominio se imprimen tras registrar.

| Comando | Flags propios | `effects` generados |
|---|---|---|
| `atlas ca split` | `--ratio` | `scale(ratio)` |
| `atlas ca reverse-split` | `--ratio [--cash-per-share <precio> --currency --fx-rate --fx-rate-date] [--fees cuenta=importe,…]` | `scale(ratio)`; con `--cash-per-share`, `forced_sale` de la fracción sobrante por cuenta (`posición × ratio − ⌊posición × ratio⌋`), solo cuentas con fracción > 0; sin fracciones, sin `forced_sale` (y aviso si se dio `--cash-per-share`) |
| `atlas ca merger` | `--to-asset --ratio [--cash-per-share … --fees …]` | `convert(to, ratio)`; con `--cash-per-share`, `forced_sale` de los picos **del activo nuevo** (después del `convert`). El componente en efectivo por acción antigua no lo genera el asistente (`questions.md` Q1): se registra con `raw` |
| `atlas ca spin-off` | `--to-asset --ratio --cost-share [--cash-per-share … --fees …]` | `carve_out(to, ratio, cost_share)`; con `--cash-per-share`, `forced_sale` de los picos del escindido |
| `atlas ca fund-merger` | `--to-asset --ratio` | `convert(to, ratio)` |
| `atlas ca share-class-change` | `--to-asset --ratio` | `convert(to, ratio)` |
| `atlas ca fund-liquidation` | `--unit-price --currency --fx-rate --fx-rate-date [--fees …]` | `forced_sale` con `"all"` en todas las cuentas con posición |
| `atlas ca delisting` | — | `effects: []`; recuerda que `active = false` es `atlas asset update <id> --inactive` |
| `atlas ca raw` | `--kind <kind> --effects-json <ruta o cadena JSON>` | los `effects[]` del usuario tal cual; se validan (forma y tabla) antes de mostrar la vista previa; inválidos → código 1 |

Comprobaciones previas del asistente (código 1 con mensaje): el activo existe; `--to-asset` existe (si no: "da de alta el activo con `atlas asset add --id <to> …` antes"); tras un `convert` que deja el origen a cero: "el activo `<id>` queda sin posición; si ya no existe, márcalo con `atlas asset update <id> --inactive`" (solo mensaje).

`--fees cuenta=importe,…` asigna `fee` a las entradas de `per_account` de la `forced_sale` generada; una cuenta que no participa en la venta es error de uso (64).

### Tabla antes/después

```
Posiciones
cuenta    activo    antes   después
acc_a     ast_old   10      2
acc_b     ast_old   7       1

Lotes abiertos
lote        activo   adquisición  cantidad antes  cantidad después  coste EUR antes  coste EUR después
<id>#0      ast_old  2027-01-10   10              2                 1000             800
…

Ganancias generadas
cuenta  cantidad  transmisión EUR  coste EUR  ganancia EUR
acc_a   0.5       200              200        0
```

Solo aparecen los activos afectados (el del evento y los de los efectos). Con `--json`, el mismo contenido como objeto `{event, before, after, gains}`.

## Tesis

| Comando | Flags | Efecto |
|---|---|---|
| `atlas thesis open` | `--id --account --asset --hypothesis --horizon-days <entero> --invalidation --planned-size <EUR>` | `thesis_opened` |
| `atlas thesis close <thesis_id>` | `--notes` | `thesis_closed`; imprime el aviso de posición viva si lo hay |
| `atlas thesis list [--closed] [--at YYYY-MM-DD]` | | tabla: tesis, cuenta, activo, estado, apertura, cierre, días, invertido EUR, resultado EUR, comisiones EUR, posición, tamaño previsto, plazo; por defecto solo abiertas |
| `atlas add buy … --thesis <id>` | | `buy.thesis_id` (obligatorio en cuentas del cubo: el dominio lo exige) |
| `atlas add sell … --thesis <id>` | | `sell.thesis_id` (opcional; sin él, aviso) |

## Valoraciones

| Comando | Salida |
|---|---|
| `atlas valuations [--date YYYY-MM-DD]` | cuenta, activo, fecha, cantidad, valor unitario, divisa, tipo de cambio, valor EUR; por defecto a hoy en `Europe/Madrid` |

## Consultas existentes ampliadas

- `atlas lots`: columna `origen` = `buy` | `transfer` | `corporate_action:<kind>` | `grant`… (tipo del evento origen y, para `corporate_action`, su `kind`); la columna `source_lot_id` se mantiene.
- `atlas gains <año>`: columna `origen` = `sell` | `corporate_action:<kind>`.
- `atlas edit <id>` sobre `corporate_action`, `thesis_opened` o `thesis_closed`: código 64 con "usa `atlas delete <id>` y regístralo de nuevo". `atlas delete` sin cambios.
- `atlas check`: incluye los avisos de tesis.

## Mensajes nuevos (`output/messages.ts`)

Un texto en español por cada código de `data-model.md` §7; `thesis_required` pasa a citar la regla 15 ("las compras en el cubo exigen `--thesis <id>` de una tesis abierta anterior").
