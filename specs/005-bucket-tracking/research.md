# Investigación y decisiones de diseño — feature 005-bucket-tracking

Lo que hubo que decidir al planificar, con las alternativas descartadas y su porqué. Las decisiones que **no** me correspondía tomar están en `questions.md` con su supuesto provisional.

## R1. El equivalente en índice vive en un módulo nuevo, no dentro de `theses()`

El prompt §3.3 deja elegir: ampliar `theses()` o envolverla. **Se envuelve** (`bucketTheses` en `projections/bucket.ts`) por una razón de arquitectura, no de gusto: `theses.ts` lo usa la **pasada B del proyector** (`linkBuy`, `linkSell`, `requireOpenThesis` se llaman desde `operations.ts`), de modo que si `theses.ts` importara `prices.ts`, el camino que crea lotes y ganancias pasaría a depender, aunque fuera transitivamente, de los precios. La constitución II lo prohíbe y el test de arquitectura lo fijaría con un `operations.ts → theses.ts → prices.ts` que nadie querría explicar.

Alternativa descartada: pasar el mapa de precios como parámetro opcional a `theses()`. Funciona, pero convierte una proyección del libro en una proyección que a veces sabe de precios; la separación deja de ser mecánica y el test deja de poder comprobarla.

## R2. El coste de una posición del cubo sale de los lotes abiertos, leídos del estado

`bucketPositions` necesita el coste para el P&L latente. Los lotes son la única fuente exacta (el coste incluye comisiones y sobrevive a traspasos y canjes). Como `lots.ts` está en la lista de módulos fiscales que los informativos no pueden importar, `bucket.ts` **lee `state.lots` directamente**, igual que `weights.ts` lee `state.positions` desde la 004. Es un acceso de lectura a la proyección, no una reimplementación del FIFO.

Alternativa descartada: guardar un coste medio por posición en la proyección. Añade estado derivado que habría que mantener en cinco sitios (compra, venta, traspaso, `convert`, `carve_out`) y cambia `snapshotOf`.

## R3. Las compras y ventas de una tesis pasan a ser tramos

`benchmark_equivalent_eur` necesita, por cada compra enlazada, **su coste en euros y su fecha fiscal**. Hoy `Thesis.buys` es una lista de ids, y recuperar coste y fecha desde el id exigiría volver a recorrer los eventos crudos en una proyección que solo recibe el estado.

Se cambian `buys` y `sells` a tramos (`{ event_id, fiscal_date, quantity, amount_eur, fee_eur }`), que `linkBuy`/`linkSell` ya tienen delante en el momento de enlazar. `snapshotOf.thesisOf` serializa `legs.map(l => l.event_id)`, de modo que la instantánea es **idéntica** y el *golden* no se entera. La salida `--json` de `thesis list` sí cambia de forma (más información por tesis), y eso se documenta en el contrato de la CLI.

## R4. El tipo de cambio del efectivo se guarda por divisa, no por cuenta

El prompt revisado dice "el último tipo conocido de **esa divisa** en el libro". Guardarlo por (cuenta, divisa) habría dejado sin convertir saldos de cuentas que nunca operaron en esa divisa aunque el libro tuviera un tipo reciente de la semana pasada. Se guarda por divisa y lo alimenta **cualquier** evento que declare un par divisa/tipo, no solo los que mueven efectivo: una compra en dólares es tan buena fuente del tipo como un depósito en dólares.

La rama "sin tipo conocido" sigue siendo alcanzable de verdad —la comisión de un `fx_exchange` puede pagarse en una tercera divisa—, así que el caso límite de la spec no es artificial.

## R5. La antigüedad del tipo usa `stale_price_days`

No hay un parámetro propio para los tipos de cambio y la constitución IV prohíbe inventar constantes. `stale_price_days` es el umbral de "dato viejo" que ya existe y el prompt lo nombra explícitamente para este caso. Si algún día conviene separarlos, será un parámetro nuevo en `Settings`, no una constante en el código.

## R6. El aviso de recompra es un aviso de proyección, no de consulta

Todos los avisos **nuevos** del cubo (§3.5) viven en la estructura devuelta por la consulta, porque el libro es válido y el *golden* no debe cambiar por ellos (decisión (h)). El de recompra es distinto: nace de **un evento concreto** (la compra) y tiene que aparecer en la vista previa de `atlas add buy` **antes de confirmar** y en `atlas check`. Los dos sitios ya leen `state.warnings` y filtran por `event_id`, así que emitirlo ahí es cero código nuevo en la CLI y coherente con `thesis_size_exceeded`, que funciona igual.

El precio es que el *golden* gana avisos, porque el escenario ya contenía el caso. Se declara en el commit de regeneración; tapar la detección para no tocar el *golden* sería exactamente el defecto que el prompt llama "el peor posible".

## R7. La ventana se cuenta hacia delante desde la venta, con el último día incluido

`washSaleWindowEnd(fiscalDate, window)` devuelve la fecha del aniversario (dos meses, un año o `n` días), con el día inexistente llevado al último del mes. Una compra **en** esa fecha avisa; al día siguiente, no. Es el valor por defecto documentado en `docs/fiscal-questions.md` #14, pendiente de confirmar con el asesor; al ser solo un aviso, equivocarse en un día no tiene coste fiscal, y el motor de la Fase 5 heredará la función y su respuesta definitiva.

## R8. La contaminación se detecta subiendo por el linaje del lote

`gain.by_lot[].lot_id` → lote → `source_lot_id` hasta la raíz → `source_event_id`. Si la raíz no es una compra de la propia tesis, la tesis está contaminada. Subir por el linaje (y no quedarse en el `source_event_id` inmediato) es lo que distingue "vendí lotes que compró otra tesis" de "vendí lotes que un canje transformó", y el prompt nombra el linaje expresamente.

Alternativa descartada: comparar cantidades (vendido frente a comprado por la tesis). Falla en cuanto hay un `split` o un `carve_out` de por medio, que cambian la cantidad sin cambiar el dueño económico.

## R9. La puerta de precios recibe un dato, no un puerto

El parámetro opcional de §3.0 ter es una **consulta síncrona sobre precios ya cargados** (`ExternalPrices.at(assetId, date)`), no el puerto `PriceSource` de ADR-0007. El dominio no puede hacer E/S ni devolver promesas: quien lea `prices/<asset_id>.jsonl` en la Fase 4 será un adaptador, y le pasará a la proyección un objeto ya resuelto. Así la puerta queda preparada sin que el dominio adquiera una dependencia asíncrona que tendría que propagarse a las seis proyecciones.

## R10. El subflujo del generador necesita tres cosas, no una

El prompt pide "un `Prng` derivado de la semilla con otra constante". Con eso solo no basta: los bytes aleatorios de cada ULID salen **del mismo flujo** que los importes, y el `recorded_at` sale de un reloj compartido que avanza un segundo por evento cuando dos caen el mismo día. Un bloque intercalado con su propio `Prng` seguiría desplazando ids y `recorded_at` de sus vecinos. El subflujo lleva por tanto **`Prng` + generador de ULID + reloj** propios, y los bloques nuevos se graban al final del fichero con sus fechas de negocio reales (registrar tarde es normal, `docs/data-schema.md` §7.1).

El mecanismo se prueba **antes** de usarlo: un test graba un bloque en un subflujo y exige que las líneas anteriores sean idénticas byte a byte.

## R11. Los activos nuevos del escenario son del cubo y en euros

Las tesis nuevas operan activos **nuevos**: así ninguna de las operaciones añadidas consume lotes de `ast_alpha`, `ast_beta` o `ast_gamma` y ni los lotes ni las ganancias existentes cambian. En euros, porque los dólares exigirían `fx_exchange` y más ruido en el diff, y porque tener alguna acción en euros en el cubo es más realista que tenerlas todas en dólares.

## R12. Qué NO se hace, aunque estaba a mano

- **No** se añade un activo `etf` al libro sintético: cambiaría el *golden* sin necesidad. El tipo nuevo se cubre con tests unitarios.
- **No** se renombra `manualPrices`, aunque la puerta única invite a ello: el nombre está en `docs/data-schema.md` §7 y `docs/` es intocable en esta feature.
- **No** se toca `valuations()`, que seguirá leyendo `state.valuations`: enumera valoraciones registradas (Modelo 720), no resuelve el precio de un activo a una fecha.
- **No** se implementa nada del diferimiento de la regla de recompra, ni estructuras "preparadas" para él (prompt §3.6, explícito).
- **No** se calcula IRR, volatilidad ni curva de valor: necesitan serie temporal de precios (Fase 4) y están fuera de §3.
