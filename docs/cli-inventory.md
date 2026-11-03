# Inventario de la consola (03/11)

Documento de trabajo para decidir qué órdenes de `apps/cli` se quedan. Decisión del dueño: la web es la aplicación principal; la consola es de mantenimiento, sobre todo para que Claude resuelva cosas. Cuando se cierre la retirada, este documento se borra y queda solo [`cli.md`](cli.md).

Órdenes tomadas de `apps/cli/src/registry.ts`. «Web» = pantalla y fichero de `apps/web/src` que enseña lo mismo.

## Se quedan

| Orden | Uso | Categoría |
|---|---|---|
| `account add\|update\|list`, `asset add\|update\|list`, `settings set\|show` | catálogo y configuración | alta o corrección |
| `add …`, `add … --draft`, `draft list\|confirm\|discard` | registrar hechos y borradores | alta o corrección |
| `ca …` | eventos corporativos | alta o corrección |
| `order place\|cancel\|note`, `transfer request\|update` | seguimiento de órdenes y traspasos | alta o corrección |
| `thesis open\|close` | abrir y cerrar tesis | alta o corrección |
| `edit`, `delete` | rectificar (anulación + corregido) | alta o corrección |
| `filed` | registrar lo presentado | alta o corrección |
| `fx update\|status\|correct`, `prices update\|status\|symbols\|purge` | tipos del BCE y cierres diarios | alta o corrección |
| `check [--deep]` | integridad del libro | verificación |
| `compact`, `backup`, `rehearse`, `lock show\|break` | migrar, copiar, ensayar la restauración, cerrojo | copias y restauración |
| `export` | libro entero en jsonl/csv | exportar |
| `remote login\|logout\|status\|upload` | carpeta de nube | acceso remoto |
| `admin …` | administración de la nube | administración |
| `synth` | libro sintético | libro sintético |

## Consultas y simulaciones (candidatas a salir)

| Orden | Qué da | Dónde lo enseña la web | Veredicto propuesto |
|---|---|---|---|
| `networth` | patrimonio desglosado núcleo + cubo + efectivo | Resumen, `routes/resumen/NetWorthBlock.tsx`, `view-models/networth.ts` | sale |
| `weights` | pesos, objetivos, desviaciones | Cartera, `routes/cartera/WeightsCard.tsx` | sale |
| `contribute` | reparto de la aportación | Cartera, `routes/cartera/ContributionCard.tsx` | sale |
| `rebalance` | traspasos y ventas propuestos | Cartera, `routes/cartera/RebalanceCard.tsx` | sale |
| `transfer simulate` | pesos antes y después de un traspaso | Cartera, `routes/cartera/TransferSimulator.tsx` | sale |
| `costs` | comisiones, TER, coste anual | Cartera, `routes/cartera/CostsCard.tsx` | sale |
| `bucket` | posiciones, tesis frente al índice, estadísticas, avisos | Cubo, `routes/cubo/index.tsx` (`PositionsCard`, `ThesesCard`, `StatsCard`) | sale |
| `thesis list` | tesis con resultado frente al índice | Cubo, `routes/cubo/ThesesCard.tsx` | sale |
| `tax <año>` (texto y `--boxes`; `--json` se queda) | base del ahorro, casillas, criterios | Fiscal, `routes/fiscal/` (`BaseCard`, `BoxesCard`, `CriteriaCards`, `LossesCard`) | sale |
| `gains <año>` | ganancias realizadas por operación | Fiscal, `routes/fiscal/BaseCard.tsx` (filas de `view-models/fiscal/year.ts`) | sale |
| `income <año>` | dividendos e intereses del ejercicio | Fiscal, mismas filas (`incomeRow` en `view-models/fiscal/year.ts`) | sale |
| `m720`, `m721` | bienes en el extranjero a 31/12 | Fiscal, `routes/fiscal/InformativeCard.tsx` | sale |
| `valuations` | última valoración por cuenta y activo | Movimientos, valoraciones agrupadas (`view-models/movement-entries.ts`) | sale (ver nota 1) |
| `cash` | efectivo por cuenta y divisa | Resumen, bloque de efectivo de `NetWorthBlock.tsx`; Cartera, `PlatformsBlock.tsx` | sale (ver nota 2) |
| `positions` | posición física por cuenta y activo | Cartera y Cubo muestran posiciones valoradas, no la posición física cruda por cuenta | **se queda** (ver nota 2) |

## Lo que la web no enseña con la misma información

Por la regla «ninguna información se pierde», esto se queda o se decide antes de quitar:

1. **`lots`** — lotes fiscales (FIFO global por activo, fecha y coste en EUR). La web no tiene vista de lotes; `tax --lots` (linaje de lotes por operación) tampoco tiene equivalente en `routes/fiscal/`. Propuesta: **`lots` se queda**, y `tax --lots` se queda con ella (diagnóstico de una cifra fiscal). `tax` sin `--lots` sale.
2. **`positions`, `cash`** — la web enseña posiciones y efectivo valorados y agrupados para leer, no el desglose crudo por cuenta y activo que sirve para diagnosticar. Propuesta: `positions` se queda; `cash` sale solo si el efectivo por cuenta y divisa de Resumen basta (lo hace: `CashLine`), lo confirmo al retirarla.
3. **`order list`, `transfer pending`, `thesis show <id>`** — la web los enseña como avisos (`view-models/attention.ts`, con enlace a Movimientos filtrado por tipo) y como fila de tesis, no la ficha (hipótesis, plazo, operaciones). Propuesta: `order list`, `transfer pending` y `thesis show` **se quedan** salvo que digas que la lista de Movimientos basta.
4. **Salida de diagnóstico en JSON.** `export` da el libro crudo; no da proyecciones. Con `positions`, `lots`, `check` y `tax --lots` en `--json` (ya existe), Claude diagnostica sin web. No hace falta una orden nueva.

Nota sobre `valuations` (1): la web enseña las valoraciones como movimientos, no la «última foto por cuenta y activo» que usa el Modelo 720; el 720 ya sale en Fiscal. Propuesta: sale.

## Qué saldría, en el peor y el mejor caso

- Sale (15): `networth`, `weights`, `contribute`, `rebalance`, `transfer simulate`, `costs`, `bucket`, `thesis list`, `tax` (texto y `--boxes`), `gains`, `income`, `m720`, `m721`, `valuations`, `cash`.
- Se queda: `tax --json`, `lots`, `tax --lots`, `positions`, `order list`, `transfer pending`, `thesis show`.

## Orden propuesto de la retirada

1. Cartera: `weights`, `contribute`, `rebalance`, `transfer simulate`, `costs`, `networth`.
2. Cubo: `bucket`, `thesis list`.
3. Fiscal: `tax`, `gains`, `income`, `m720`, `m721`.
4. `valuations`, `cash`, y el código compartido que quede huérfano (`output/`, `query.ts`, `portfolio.ts`, `tracking.ts` en lo que corresponda).

En cada grupo: fuera pruebas, dorados y documentación; el dominio no se toca; los mensajes del catálogo que el dominio aún pueda lanzar se quedan. `CLAUDE.md` y `cli.md` pasan a decir que la web es la superficie principal y la consola la de mantenimiento.
