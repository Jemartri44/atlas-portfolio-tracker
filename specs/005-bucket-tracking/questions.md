# Preguntas abiertas — feature 005-bucket-tracking

Dudas encontradas al leer la documentación y el código que el prompt me prohíbe resolver por mi cuenta (§1: "no la resuelvas tú"; §2 bis: `docs/` intocable, nada fiscal ni estructural se decide aquí). Cada una lleva el supuesto provisional con el que se trabajó y, debajo, **la respuesta del usuario del 2026-09-18**: todas están cerradas.

---

## Q1 — ¿Qué es el "valor latente" de la fórmula del resultado frente al índice?

**Contexto.** El prompt §3.3 define:

> `result_vs_index_eur` = resultado de la tesis − resultado del índice = `(result_eur + valor_latente) − (benchmark_equivalent_eur − invested_eur)`, donde `valor_latente` es **el valor actual de la posición viva** de la tesis (cero si está cerrada y sin posición).

Con esa lectura literal, una tesis **abierta** que rinde exactamente lo mismo que el índice no da cero. Ejemplo: se invierten 100 € (`invested_eur = 100`), no se ha vendido nada (`result_eur = 0`), y tanto el activo como el índice suben un 10 %, así que la posición vale 110 € y `benchmark_equivalent_eur = 110`. La fórmula literal da `(0 + 110) − (110 − 100) = 100`, es decir, la tesis parecería haber batido al índice en 100 €, que es justo lo invertido.

El propio prompt exige en §3.9 dos propiedades que **contradicen** esa lectura:

- "`result_vs_index_eur` es cero cuando el activo y el índice tienen exactamente el mismo rendimiento en el periodo";
- "el P&L latente más el resultado realizado de una tesis es igual a (valor actual + cobros) − coste".

Las dos se cumplen si `valor_latente` es la **plusvalía latente** (`valor actual − coste de la posición viva`): `(0 + 10) − (110 − 100) = 0`. Para una tesis **cerrada sin posición**, las dos lecturas coinciden (el término es cero), así que la diferencia solo afecta a las tesis abiertas.

**Opciones.**
- **(a) Literal**: `valor_latente` = valor de mercado de la posición viva. Ventaja: es lo que dice el prompt. Inconveniente: rompe las dos propiedades de §3.9 y hace que toda tesis abierta parezca batir al índice por su importe invertido.
- **(b) Plusvalía latente** (`valor − coste`) **(supuesto provisional)**: las dos propiedades se cumplen, el caso cerrado no cambia, y la cifra significa lo que su nombre promete ("resultado de la tesis frente al resultado del índice").

**Supuesto provisional: (b).** Spec A1, FR-011, Historia 3, escenarios 2 y 3.

**Respuesta del usuario (2026-09-18): (b), y el prompt estaba mal.** `docs/prompts/005-bucket-tracking.md` §3.3 se ha corregido dejando escrito el error en vez de borrarlo: manda la **plusvalía latente** (valor de la posición viva menos su coste).

---

## Q2 — El precio del índice, ¿en euros o en su divisa?

**Contexto.** `P(d)` sale de `manualPrices`, que ofrece el valor unitario en la divisa de la `valuation` (`unit_value`) y en euros (`unit_value_eur = unit_value / fx_rate`). El prompt no dice cuál. El cociente `P(d_fin)/P(d_i)` es adimensional, así que con un índice en euros —el caso normal, el fondo global del núcleo— las dos opciones dan exactamente lo mismo. Solo difieren si el índice cotiza en divisa: en euros, el rendimiento incluye el efecto del tipo de cambio; en divisa, lo excluye.

**Opciones.**
- **(a) En euros (`unit_value_eur`) (supuesto provisional)**: los costes de las compras están en euros, el resultado de la tesis está en euros, y el inversor es de euros: la alternativa realista era comprar el índice con esos mismos euros y soportar la divisa.
- **(b) En la divisa del índice**: mide el rendimiento "puro" del índice, sin divisa, pero entonces la comparación mezcla un resultado con divisa (la tesis) y otro sin ella (el índice).

**Supuesto provisional: (a).** Spec A2.

**Respuesta del usuario (2026-09-18): (a).** El usuario habría invertido euros en el índice, así que el rendimiento comparable es el suyo, efecto divisa incluido.

---

## Q3 — ¿El aviso de recompra cubre también la mitad "hacia atrás" de la ventana?

**Contexto.** La regla (art. 33.5 LIRPF, `business-rules.md` §5.4) mira la ventana **anterior o posterior** a la venta con pérdida: recomprar dos meses **antes** de vender con pérdida también difiere la pérdida. El prompt §3.6, en cambio, describe solo una dirección: "al registrar un `buy` de un activo que se vendió con pérdida dentro de la ventana". Esa dirección es la única que se puede avisar **en el momento de registrar la compra**, porque la venta futura todavía no existe; la otra mitad solo se puede avisar al registrar la **venta**, mirando las compras previas.

**Opciones.**
- **(a) Solo la compra posterior a la venta (supuesto provisional)**: literal al prompt §3.6. La mitad simétrica la detecta el motor fiscal de la Fase 5, que es quien calcula el diferimiento y ya tiene que recorrer las dos mitades de la ventana.
- **(b) Avisar también al registrar una venta con pérdida** que tenga compras del mismo activo en la ventana anterior. Ventaja: el usuario ve el efecto en el momento de venderlo, que es cuando todavía puede esperar. Inconveniente: en el núcleo, con aportación mensual, **toda** venta con pérdida dispararía el aviso; y el prompt §4 deja "cualquier cálculo fiscal" para la Fase 5.

**Supuesto provisional: (a).** Spec A6, FR-026.

**Respuesta del usuario (2026-09-18): (b), cambia el supuesto.** Avisan **las dos direcciones**, con códigos distintos: `wash_sale_window_repurchase` (compra posterior a una venta con pérdida) y `wash_sale_window_prior_buy` (venta con pérdida con compras en la ventana anterior), cada uno con el evento, la cantidad y el día límite de la ventana en sus detalles. Sigue siendo solo el aviso: cuantificar el diferimiento es Fase 5. Recogido en el prompt §3.6, spec A6, FR-026 y FR-026 bis.

---

## Q4 — `atlas thesis list`: ¿`--at` o `--date`?

**Contexto.** `thesis list` acepta hoy `--at YYYY-MM-DD` y **no** proyecta con `asOf`: calcula los días abierta con esa fecha pero lee las posiciones del final del libro, que es exactamente el defecto que cierra ADR-0016. Todas las demás vistas usan `--date`, lo validan como fecha y lo propagan como `asOf`. El prompt §3.7 pide `atlas thesis show <id> [--date]`, de modo que dejar `--at` en `list` deja dos nombres para lo mismo en el mismo subcomando.

**Opciones.**
- **(a) `--date` sustituye a `--at` (supuesto provisional)**, y `--at` pasa a dar un error de uso que remite al nuevo. Es lo que se hizo en la 004 con `--wash-sale-window-days` (Q3 de aquella feature) y no hay ningún libro ni guion real que dependa del flag.
- **(b) Mantener `--at` como alias**: nadie tiene que cambiar nada, pero la CLI acumula dos nombres para el mismo concepto.

**Supuesto provisional: (a).** Spec A9, FR-032.

**Respuesta del usuario (2026-09-18): el supuesto.** `--date` sustituye a `--at`, que pasa a dar error de uso.

---

## Q5 — El aviso de significancia, ¿sobre las tesis cerradas o sobre las ventas?

**Contexto.** El prompt §3.4 pide "número de tesis cerradas y número de operaciones de venta, con el **aviso de significancia** por debajo de 100 operaciones", y la decisión (d) dice que "el número de ventas se informa **aparte** para la significancia estadística". No queda claro cuál de los dos contadores dispara el aviso. Las estadísticas (tasa de acierto, medias, esperanza) se calculan sobre **tesis cerradas**, así que el tamaño de muestra que las respalda es ese; el número de ventas es otra cosa (una tesis puede cerrarse con varias ventas, o con ninguna).

**Opciones.**
- **(a) Un aviso que se emite mientras el número de tesis cerradas sea menor de 100, con ambos contadores en su detalle (supuesto provisional)**: el aviso habla de la muestra que sostiene las estadísticas que se están mostrando.
- **(b) Dos avisos, uno por contador.** Ruido: en la práctica ambos estarán por debajo de 100 durante años.
- **(c) Disparar por el número de ventas.** Es lo que dice la especificación §6.2 ("número de operaciones"), pero no es la muestra de las medias.

**Supuesto provisional: (a).** Spec FR-015, Historia 5, escenario 1.

**Respuesta del usuario (2026-09-18): el supuesto.** Un solo aviso mientras haya menos de 100 tesis cerradas, con los dos contadores en el detalle.

---

## Q6 — ¿Se excluye también la tesis que hereda sus lotes de un canje?

**Contexto.** La regla nueva de §3.4 (decisión (k)) excluye de las medias "la tesis cuyas ventas hayan consumido lotes creados por compras de otra tesis". En el libro sintético hay un caso que encaja pero que no es el que motivó el hallazgo: `th_beta_new` se abre **por un canje** (la fusión convierte `ast_beta` en `ast_beta_new`), **no tiene ninguna compra enlazada** y su única venta consume lotes que descienden, por linaje, de las compras de `th_beta`. Su `invested_eur` es **cero** y su `result_eur` es la pérdida entera: es un resultado real, pero no es *suyo* en el sentido de la métrica, y además haría que su comparación con el índice diera "el índice habría hecho cero con cero euros".

**Opciones.**
- **(a) Excluirla, como cualquier otra contaminada (supuesto provisional)**: es literal a la decisión (k) y evita dos números falsos (un resultado sobre inversión cero y una comparación con el índice de un sumatorio vacío). Consecuencia visible: el libro sintético reportará exclusiones, que es justo lo que la vista debe saber explicar.
- **(b) Tratar el par (`th_beta`, `th_beta_new`) como una sola operación económica** y medirlo junto. Es más fiel a la realidad, pero exige una noción de "cadena de tesis" que no existe en el esquema y que nadie ha pedido.

**Supuesto provisional: (a).** Spec A17, FR-016 bis; una tesis sin compras enlazadas queda además sin comparación con el índice ("sin dato", no cero).

**Respuesta del usuario (2026-09-18): el supuesto.** `th_beta_new` se excluye, y una tesis sin compras enlazadas se queda sin comparación con el índice: un sumatorio vacío es "sin dato", nunca cero.

---

## Q7 — La regla de parada, ¿sobre el aporte bruto o sobre el neto?

**Contexto.** El prompt revisado cambia **explícitamente** el aporte del aviso `bucket_contribution_exceeded` a **bruto** (sin restar retiradas), con el razonamiento de la regla 19. El segundo aviso de la misma regla 17, `bucket_stop_loss_reached`, dice "por encima de `bucket_stop_loss_pct` **del aporte acumulado**" sin precisar cuál, y la nota de traspaso dice que "las reglas 17 y 18 se miden sobre la aportación bruta".

**Opciones.**
- **(a) Bruto también en el denominador de la pérdida (supuesto provisional)**: coherente con el resto de la regla 17 y más conservador (un denominador mayor hace que el aviso salte más tarde... o más pronto, según el signo — en realidad hace que el porcentaje de pérdida sea **menor**, así que avisa **más tarde**; se asume porque es la lectura literal de la nota).
- **(b) Neto**: mide la pérdida contra el dinero que sigue dentro. Avisaría antes tras una retirada.

**Supuesto provisional: (a)**, con las dos cifras (bruto y neto) siempre a la vista para que el usuario juzgue. Spec A7, FR-021.

**Respuesta del usuario (2026-09-18): el supuesto.** La regla de parada mide sobre el **bruto** también en el denominador, con las dos cifras a la vista.

---

## Contradicciones entre el prompt y el estado real del código

No bloquean; se resuelven a favor del documento más reciente y se anotan aquí para que la dirección las conozca.

1. **El escenario sintético tiene cuatro tesis, no tres.** *(Aceptada; el prompt §3.8 ya lo dice.)* El prompt §3.8 dice "el escenario actual tiene tres tesis (dos cerradas, una abierta)". En `synth/scenario.ts` hay **cuatro**: `th_alpha` (cerrada con ganancia), `th_beta` (cerrada en la fusión, **sin ninguna venta**, resultado exactamente cero), `th_beta_new` (cerrada con pérdida) y `th_gamma` (abierta, con dos compras). Es decir, **tres cerradas** y una abierta. El objetivo de "al menos seis tesis cerradas" se alcanza añadiendo cuatro nuevas, no cinco. La tesis de resultado cero es además un caso límite valioso para la tasa de acierto y se conserva.
2. **Los avisos de la ventana cambian el *golden* aunque no se toque el escenario.** *(Aceptada: se declara en el commit de regeneración.)* El escenario ya contiene el caso "pérdida en fondo seguida de aportación mensual dentro del año" (caso límite obligatorio de la constitución VII): en cuanto el aviso exista, cada compra mensual de `ast_world` dentro del año siguiente a la venta con pérdida emitirá `wash_sale_window_repurchase`. Son avisos de **proyección** (van a `state.warnings`, como `thesis_size_exceeded`), así que entran en la instantánea del *golden* y en `SYNTHETIC_EXPECTED_WARNINGS`. Se declarará explícitamente en el commit de regeneración; no es una regresión, es la detección que faltaba.
3. **El patrimonio necesita guardar un dato nuevo al proyectar.** *(Aceptada.)* El prompt §3.1 pide convertir el efectivo "con el `fx_rate` de la última operación que lo movió", y hoy la proyección guarda el saldo (`state.cash`) pero **no** el tipo con el que se movió. Hay que memorizar el último tipo por (cuenta, divisa) al aplicar cada evento de efectivo. No cambia la instantánea (`snapshotOf` es una lista explícita de campos) ni el *golden*, y no es un cambio de esquema del fichero.
4. **`docs/specification.md` §5.1 no listaba `bucket_benchmark_asset_id`.** *(Resuelta por la dirección: ya lo lista.)* Sí lo lista `docs/business-rules.md` §7 (con la regla 16) y el prompt §3.0 lo fija. Como `docs/` es intocable en esta feature, se implementa según `business-rules.md` y se anota el hueco aquí.
5. **Un comentario del código se queda obsoleto.** *(Aceptada: se corrige al tocar el fichero.)* La cabecera de `projections/gains.ts` dice "the wash-sale rule is left to the tax engine (feature 005)". La feature 005 implementa **solo el aviso**; el motor (diferimiento, linaje, liberación) es de la **Fase 5**. Se corrige el comentario a "phase 5" al tocar el fichero; no cambia comportamiento.
6. **`atlas costs` anuncia esta feature.** *(Aceptada: se corrige al tocar el fichero.)* Su salida dice "la métrica de la regla 14 llega en la Fase 3". Se cumple ahora: la tabla del cubo gana el capital operado y el porcentaje, y la métrica completa vive en `atlas bucket`. La leyenda se actualiza.
7. **El bloque 0 obliga a tocar el generador para que el *golden* NO cambie.** *(Aceptada.)* `synth/scenario.ts` construye su configuración con `{...DEFAULT_SETTINGS, …}`; en cuanto `DEFAULT_SETTINGS` gane `etf`, las tres líneas `settings_changed` del libro sintético cambiarían de contenido y el *golden* con ellas, justo lo que la decisión (i) prohíbe. La solución es que el escenario **declare sus mapas explícitamente** con los seis tipos que ya escribe (spec A15). El efecto secundario es bueno: el *golden* pasa a ser la prueba de regresión de los mapas parciales.
8. **El nombre `manualPrices` se conserva.** `docs/data-schema.md` §7 lo documenta como proyección, y `docs/` es intocable en esta feature. La puerta única de §3.0 ter se implementa **dentro** de `prices.ts` (una función por activo más la forma agregada que ya existe), de modo que el nombre documentado sigue siendo cierto y solo ese fichero mira `state.valuations`. Si la dirección prefiere renombrarlo (`assetPrice`, `priceAt`), es un cambio de documento y de nombre público, no de comportamiento.
9. **`valuations()` seguirá leyendo `state.valuations`.** Es la vista de valoraciones registradas (Modelo 720), no una lectura de precio: enumera eventos, no resuelve el precio de un activo a una fecha. El test de la puerta única exceptúa ese fichero y lo dice por escrito.

---

## Notas de lectura (no bloquean)

- **"Σ coste de sus `buy`" incluye la comisión de compra.** Es lo que `data-schema.md` §8.1 llama coste de adquisición y lo que ya significa `invested_eur` en una tesis. Usar otra base daría dos cifras de "invertido" distintas en dos vistas contiguas (spec A11).
- **El coste medio del cubo sale de los lotes abiertos del activo**, que son globales (ADR-0009). La regla 21 impide que un activo esté en los dos libros, así que en el cubo coincide con la cuenta; si un día hubiera dos cuentas del cubo con el mismo activo (permitido con aviso), el coste unitario medio se aplica a la cantidad de cada fila (spec A3).
- **El aviso de peso (regla 18) no se emite con el patrimonio parcial.** Un porcentaje calculado sobre un total incompleto es precisamente el "total parcial con aspecto de completo" que prohíbe la constitución V.
- **La regla de parada no divide entre cero.** Si el aporte acumulado es cero, la pérdida acumulada no se expresa como porcentaje y el aviso no se evalúa.
- **`bucket_benchmark_asset_id` puede ser un activo del núcleo.** No rompe la compartimentación: el índice no entra en ningún total del cubo ni el cubo en ningún peso del núcleo; es solo una serie de precios de referencia (prompt §3.0).
- **Los avisos de consulta no llevan `event_id` de un evento real** salvo cuando nacen de uno (como ya ocurre en `coreWeights`, que rellena el id del `settings_changed` vigente o lo deja vacío).
- **"Último tipo conocido de esa divisa" se lee en sentido amplio**: cualquier evento de la pasada B que declare un par divisa/tipo lo registra, no solo los que mueven efectivo. Una compra en dólares da tipo al efectivo en dólares; restringirlo a los movimientos de caja dejaría sin convertir saldos para los que el libro sí tiene un tipo reciente.
- **Cuando el evento que aporta el tipo no lleva `fx_rate_date`** (los cuatro que solo lo ganan como opcional en el bloque 0, y las líneas ya escritas), la fecha mostrada es la **fecha de negocio** del evento y la fila lo dice. No se inventa una fecha de publicación del BCE.
- **El bloque 0 no añade un activo `etf` al libro sintético.** Añadirlo cambiaría el *golden* sin necesidad; el tipo nuevo se cubre con tests unitarios (validación, fecha fiscal y ventana por defecto).
- **`fx_rate_date` en las valoraciones del escenario** entra con la regeneración del §3.8, no con el bloque 0: se escribirá en las valoraciones en divisa (donde el tipo no es trivialmente `1`), y esa diferencia se declara en el mensaje del commit de regeneración junto a las demás.
- **El aviso de ejercicio movido es una función pura del dominio**, no lógica de la CLI: recibe los eventos y las dos configuraciones y devuelve los ejercicios afectados con sus dos cifras. La CLI solo pregunta. Así se cubre con tests de dominio al 100 % y la web de la Ronda 7 lo reutiliza.

---

## Notas de implementación (2026-09-18, tras `/speckit-implement`)

Decisiones de detalle que no cambian documentos pero conviene que la dirección conozca.

1. **La plusvalía latente de una tesis está acotada por lo que la cuenta tiene.** Empezó siendo la posición de la pareja (cuenta, activo) —y una tesis cerrada se apuntaba las acciones de la siguiente—, luego "lo comprado menos lo vendido" —y una tesis cuyo activo canjeó un evento corporativo seguía apuntándose acciones que ya no existen—. Manda el **mínimo de las dos**: lo que compró y no ha vendido, y nunca más de lo que la cuenta tiene. Lo descubrió el `quickstart` a mano: `th_beta`, cerrada al canjearse su activo, salía con latente "sin dato".
2. **El bloque nuevo del escenario se graba en orden de fecha ascendente.** Una tesis se fecha por el `recorded_at` de su apertura (`data-schema.md` §6.4) y el reloj del subflujo solo avanza, así que grabar fuera de orden dejaba las nueve tesis estampadas el mismo día y con cero días abierta. También lo encontró el `quickstart`.
3. **`atlas check` traducía los avisos... o no.** Era el único sitio que imprimía el `message` del dominio (en inglés) en vez de traducir por `code`. Corregido: es justo el comando que lista **todos** los avisos del libro.
4. **`bucketStats` recibe los eventos**, como `costSummary` desde la 004: las comisiones por operación y los depósitos no se acumulan en la proyección, porque hacerlo cambiaría `snapshotOf` y el *golden*.
5. **La contaminación se detecta desde los lotes, no desde las ganancias.** Cada lote lleva sus `consumptions`, así que basta recorrer los lotes del libro y mirar cuáles consumió una venta de la tesis; subir por `source_lot_id` hasta la raíz dice quién los compró. Evita dos ramas defensivas que no eran alcanzables.
6. **El tipo de cambio de una divisa no se toma del futuro.** `netWorth` ignora un tipo posterior a la fecha consultada, como `priceAt` ignora una valoración posterior: con `asOf` no puede pasar, pero si pasara, la respuesta honesta es "no había tipo entonces", no una conversión con el de mañana.
7. **El aviso de la vista previa de `atlas add buy|sell` es *best effort*.** Proyecta el candidato para enseñar el aviso de recompra **antes** de confirmar; si esa proyección falla, no imprime nada y deja que `recordEvent` lance su propio error, que es mejor. Una vista previa nunca debe empeorar el error que viene después.
8. **La CLI rechaza un tipo de activo que el enumerado no tiene** en `--fiscal-date-rule` y `--wash-sale-window`. El libro tolera un mapa parcial (ADR-0018) y por eso mismo un `stcok=trade_date` mal tecleado se escribiría y se ignoraría para siempre. La tolerancia es del fichero; lo que el usuario teclea se comprueba.
9. **El `ManualPrice` de la 004 pasa a llamarse `PriceLookup`** y gana `origin`. El nombre del tipo no está en ningún documento; el de la proyección (`manualPrices`) sí, y se conserva.

## Desviaciones del `quickstart` (ejecutado a mano sobre el *golden* regenerado)

1. **`atlas bucket` y `atlas networth` salen siempre parciales sobre el libro sintético.** El escenario contiene a propósito un activo **excluido de cotización** (`ast_alpha_spin`, `delisting`, "posición sin precio, requiere marcado manual") y el cubo conserva 2 títulos suyos. Es el fallo seguro funcionando —el total se marca parcial y dice qué falta—, pero tiene una consecuencia que conviene conocer: **el aviso de la regla 18 no se puede evaluar** mientras exista esa posición sin precio, porque el peso saldría de un total incompleto. En un libro real el usuario registraría una `valuation` (aunque sea a cero) del valor excluido. Si la dirección prefiere otra cosa, es una decisión de producto, no de implementación.
2. **Con valoraciones semestrales del índice, dos tesis cortas dan `equiv. índice = invertido`.** Cuando la compra y la venta caen entre las mismas dos valoraciones, `P(d_fin) = P(d_i)` y el índice "no se movió" según el libro. Es correcto y reproducible, pero si se quisiera más resolución habría que valorar el índice más a menudo (el prompt admitía anual o semestral).
3. **`atlas thesis show` etiqueta la posición como "de la pareja"**, no "viva": es la posición de (cuenta, activo), que puede incluir títulos de otra tesis. La plusvalía latente sí es solo la suya (nota 1).

---

## Notas de la revisión (2026-09-18, tras la doble revisión de la dirección)

Criterios que fija la dirección al revisar la feature, y lo que queda anotado sin corregir. Los tres primeros son **decisiones de producto**: se implementan aquí y la dirección los llevará al documento que corresponda.

### C1 — Las tesis se cortan por su fecha administrativa

Una tesis es un **documento administrativo**, no un hecho de negocio: no tiene fecha de operación, se proyecta en orden de fichero (feature 002) y su fecha sale del `recorded_at` de su apertura (`data-schema.md` §6.4). La pasada A es completa por diseño (ADR-0016), así que sin un corte propio una vista de junio listaba las tesis de diciembre. A una fecha `d`:

- una tesis **existe** si `opened_at ≤ d`; las posteriores no aparecen en ninguna vista, ni en listas, ni en posiciones, ni en estadísticas;
- está **cerrada** si tiene cierre y `closed_at ≤ d`; si su cierre es posterior a `d`, a esa fecha estaba **abierta**, y su `closed_at`, su `closing_notes` y su evento de cierre no se muestran;
- `days_open` se cuenta hasta el cierre o hasta `d`, y nunca es negativo.

Aplicado en `theses()`, `openThesisOn`, `bucketPositions`, `bucketTheses`, `bucketStats`, `thesis list`, `thesis show` y `bucket`. Se documentará en `data-schema.md` §7.

### C2 — El día cero pertenece a las dos mitades de la ventana de recompra

Una compra con la **misma fecha fiscal** que la venta con pérdida está dentro de la ventana (art. 33.5 LIRPF no descuenta el día de la operación). Para no avisar dos veces del mismo hecho manda la posición en el fichero, que es también el orden en que la pasada B aplica los eventos: si la compra está antes de la venta es `wash_sale_window_prior_buy`; si está después, `wash_sale_window_repurchase`. Sigue siendo solo el aviso; el diferimiento es Fase 5.

### C3 — En `atlas networth`, el total mostrado es la suma de lo mostrado

La vista de patrimonio tiene por mandato estar siempre desglosada (constitución III), así que quien suma la columna tiene que obtener la línea de abajo: los subtotales y el TOTAL del texto son la **suma de las cifras impresas**, redondeadas al céntimo. El valor exacto sin redondear sigue estando en `--json`. Sobre el *golden* la diferencia era de un céntimo (22 326,67 impresos frente a 22 326,68 del subtotal exacto).

### Anotado sin corregir

1. **`fx-rates.ts:40` usa un `as` estructural.** `pairsOf` convierte el evento a un objeto con todos los campos de divisa posibles (`currency`, `fx_rate_sold`, `effects`…) para leerlos sin un `switch` por tipo. Es correcto hoy y sobrevive a un campo nuevo sin tocarse, pero también sobreviviría a un campo **renombrado**: el compilador no lo vería. La alternativa es un `switch` exhaustivo por tipo de evento, que sí se rompería al renombrar. No se cambia sin decisión de la dirección porque es una elección de estilo con coste real en líneas.
2. **Hay símbolos exportados que nadie usa fuera del dominio.** El `index.ts` publica tipos y funciones que hoy solo consume el propio dominio o los tests (`BenchmarkGap`, `ExcludedThesis`, `DrawdownPoint`, `ControlGap`…). No molesta, pero la superficie pública crece por feature y nadie la poda; conviene revisarla antes de la web de la Ronda 7, que será su primer consumidor real.
3. **Los tests de `--json` validan el sobre, no el contenido.** Varios comprueban `invalid_count` y que `data` existe, y no que los campos sean los que la web va a leer. Los de esta revisión ya afirman campos concretos (`weight_pct_unavailable`, `theses[].days_open`, `core.total_eur`); el resto sigue pendiente.
4. **La regla "una vista nunca calcula lo fiscal" no se puede comprobar transitivamente hoy.** `costs.ts` y `bucket-stats.ts` importan `businessDateOf` e `isOperationEvent` de `project-ledger.ts`, que alcanza todo el motor FIFO, así que el cierre transitivo de una vista contiene `lots.ts` y `fiscal-date.ts`. El test de arquitectura comprueba transitivamente la dirección que sí es cierta y es la de la constitución II (**la ruta fiscal nunca alcanza `prices.ts`**, con los dos conjuntos deducidos del grafo). Para hacer transitiva también la dirección contraria habría que sacar esos dos ayudantes a su propio módulo; es un refactor de la 005 que la dirección no ha pedido.
