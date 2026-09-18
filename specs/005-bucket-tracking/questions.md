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
