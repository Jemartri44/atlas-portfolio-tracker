# Especificación — 028 Reparto por plataforma y rebalanceo

Estado: **diseño, pendiente de visto bueno** (no hay código). Parte de lo que pidió la dueña el 2026-10-26 y aprobó el mismo día: reparto del mes por plataforma, prioridad cuando el dinero no llega y un botón «Rebalancear». Las dudas abiertas están en `questions.md`.

## Qué y por qué

Hoy Atlas dice **a qué activo** va la aportación del mes (`contributionPlan`, regla 2), reparte **proporcionalmente al déficit** y no dice nada de plataformas ni de cómo corregir una desviación grande cuando las aportaciones no bastan. Mover dinero entre activos que no son fondos tributa y paga comisiones, así que la pregunta de la dueña es de fondo: **qué hacer en cada plataforma y cuánto cuesta**. Esta feature añade tres cosas, sin escribir nada en el libro (las órdenes se dan a mano y se registran como siempre):

1. **Reparto del mes por plataforma**: cuánto ingresar en cada cuenta y qué comprar en ella.
2. **Prioridad cuando el dinero no llega**: primero al activo más lejos de su peso, hasta igualarlo con el siguiente, y así sucesivamente.
3. **Botón «Rebalancear»**: propone cómo acercarse a los pesos objetivo, por este orden: dinero nuevo (si lo hay), traspasos entre fondos (sin impuestos, §5.2), ventas solo si hace falta (con el impuesto aproximado y las comisiones delante). Nunca toca el cubo.

No hay cambios de esquema del libro, ni campos nuevos en `Settings`, ni rutas nuevas en la API: la web y la consola calculan sobre el libro que ya leen, con el dominio.

## Cómo se ve

**Web, Cartera.**

- La tarjeta «¿Dónde va el dinero este mes?» conserva su tabla por activo y gana un bloque **Por plataforma**: una fila por cuenta con *comprar* (suma de sus órdenes), *efectivo que ya tiene* (ADR-0004), **ingresar** (lo que falta, nunca negativo) y, debajo, sus órdenes: activo, importe, unidades enteras aproximadas (lo que ya enseña la tarjeta) y comisión estimada con su origen («como tu última compra de este activo, 12/09»). Un activo sin cuenta sale en un bloque **Sin plataforma** con la nota de qué hace falta.
- Una frase fija dice, cuando el dinero no cubre todo, **cuánto falta**: «Con este importe, X queda a N puntos de su peso. Solo con aportaciones y a este ritmo, igualarlo exigiría M € más».
- Una tarjeta nueva, junto al simulador de traspaso: **Rebalancear**. Un campo opcional («dinero nuevo para el núcleo») y el botón *Calcular*. Resultado: el diagnóstico (cada activo, su desviación, cuáles superan el umbral), y la lista de **pasos numerados**, en dos grupos: *Sin impuestos* (compras con dinero nuevo, traspasos) y *Con impuestos — decides tú* (ventas). Cada paso lleva importe, plataforma, comisión estimada con su porcentaje sobre la operación, y los pesos y la desviación máxima **si te quedas en ese paso**. Las ventas llevan además el impuesto aproximado y los lotes FIFO que consumen. Al final, el **efectivo que se mueve entre plataformas** (quién envía a quién). Siempre la nota: es una propuesta, nada se ha registrado.

**Consola.** `atlas contribute --amount N` añade la sección por plataforma (y los mismos campos en `--json`). Comando nuevo, de solo lectura: `atlas rebalance [--amount N] [--date D]`, con la misma información en texto y en JSON. Ninguno escribe.

## Reparto del mes (cambia la regla 2)

Se mantiene todo lo que ya hace `contributionPlan`: el presupuesto del cubo se separa primero y nunca se reparte; los objetivos se calculan sobre el valor del núcleo **tras** la aportación (`after = V + core`); el déficit de un activo es `max(0, objetivo − valor)`; redondeo a céntimos con el residuo asignado como hoy; cualquier activo con precio ausente rechaza el cálculo (constitución V). Lo único que cambia es **cómo se reparte `core` entre los déficits**: en lugar de proporcional, **por nivel de agua**.

1. Se ordenan los activos por déficit, de mayor a menor (como todos comparten `after`, es el mismo orden que por puntos de peso bajo el objetivo).
2. Todo el dinero va primero al de mayor déficit hasta que su déficit restante iguala al del siguiente; entonces se reparte a partes iguales entre los dos hasta igualar al tercero; y así. Un activo por encima de su objetivo no recibe nada.
3. Si el dinero cubre todos los déficits, cada activo llega a su objetivo y el sobrante se reparte por pesos objetivo, como hoy (solo ocurre si parte del plan apunta a activos fuera de la tabla).

**Ejemplo (inventado).** Núcleo de 10.000 €: fondo de renta variable A (MyInvestor) 5.800 € con objetivo 55 %, fondo de renta fija B (MyInvestor) 3.500 € con 30 %, ETC de oro G (IBKR) 700 € con 15 %. Aportación de 1.000 € con 10 % para el cubo: 100 € al cubo, **900 € al núcleo**; `after` = 10.900 €.

| Activo | Objetivo € | Déficit | Reparto de hoy (proporcional) | Reparto nuevo (por nivel) |
|---|---|---|---|---|
| A | 5.995 | 195 | 155,31 | **80,00** |
| B | 3.270 | 0 (por encima) | 0 | 0 |
| G | 1.635 | 935 | 744,69 | **820,00** |

El oro, el más lejos de su peso, recibe primero 740 € (hasta quedar con el mismo déficit que A, 195 €); los 160 € restantes se reparten a partes iguales, 80 € cada uno. Tras el reparto, A y G quedan con el mismo déficit (115 €) y B sigue por encima. En el reparto proporcional de hoy, A recibía más de lo que su lejanía justifica.

**Por plataforma, mismo ejemplo.** Suponiendo 20 € de efectivo en MyInvestor y 0 en IBKR, y una comisión de 3,00 € en IBKR (la de su última compra de G): MyInvestor, comprar 80, tiene 20, **ingresar 60**; IBKR, comprar 820 (+ 3,00 de comisión), **ingresar 823**. Las comisiones van **aparte** del importe del mes (ver `questions.md`, 2).

**Si no llega.** Aquí no llegó: A y G siguen por debajo. La tarjeta dice cuánto falta para igualarlo solo con aportaciones: es `max(valor_i / (objetivo_i/100)) − V` (en el ejemplo, 11.667 − 10.000 = 1.667 €, es decir 767 € más que los 900 de este mes), sin suponer que los precios se muevan. No es una previsión: es la aritmética de hoy y se rotula así.

## Rebalancear

Parte del núcleo (nunca el cubo; la regla 21 impide que un activo esté en los dos libros). Sin libro de órdenes ni escritura.

**Disparador (regla 3).** Solo propone algo si, tras aplicar el dinero nuevo del paso 1, algún activo está a más de `deviation_threshold_pp` de su objetivo. Si ninguno lo está, dice «ningún activo supera el umbral» y propone nada. El umbral lo configura la dueña; no se inventa otro. La «revisión anual» de la regla 3 sigue siendo una recomendación: el botón se puede pulsar cuando se quiera (la regla 7 anulada prohíbe restricciones de diseño por frecuencia) y el texto lo recuerda.

**Orden de los pasos.** Lo barato y sin impuestos primero:

1. **Dinero nuevo** (si se ha escrito): el mismo reparto por nivel de agua del apartado anterior. Compras, sin impuestos.
2. **Traspasos entre fondos** (§5.2, ya existe `simulateTransfer`): del fondo que sobra al fondo que falta, solo entre activos `transferable`. Conservan fecha y coste, no tributan, no se modelan como venta más compra. Orígenes y destinos, de mayor a menor lejanía, con el mismo nivel de agua para el destino. Importe: `min(exceso de fondos, déficit de fondos)`.
3. **Ventas**, solo de lo que sigue por encima de su objetivo tras los traspasos, y solo si hay dónde colocar el dinero: oro o cripto por encima (no traspasables), o fondos por encima cuando lo que falta no es un fondo (el dinero debe pasar por una venta y una compra). Se vende primero lo más lejos de su peso, como manda la regla 4 («lo que esté por encima, nunca proporcionalmente de todo»). El importe de cada venta lo limita lo que las compras pueden absorber.

Cada venta se acompaña de su compra (con el efectivo que deja) y los dos extremos llevan comisión.

**Ejemplo (inventado).** Núcleo de 10.000 €, objetivos 55 / 30 / 15 y umbral de 5 puntos: A (renta variable, MyInvestor) 6.600 € (66 %), B (renta fija, MyInvestor) 2.900 € (29 %), G (oro, IBKR) 500 € (5 %). A está 11 puntos por encima y G 10 por debajo: el disparador salta.

| Paso | Qué | Importe | Impuesto | Comisión | Tras el paso |
|---|---|---|---|---|---|
| 1 | Traspaso A → B (sin impuestos) | 100 € | 0 | 0 | A 65 %, B 30 %, G 5 %; desviación máxima 10 pts |
| 2 | Vender A (MyInvestor) y comprar G (IBKR) | 1.000 € | ≈ 63 € | 0 € + 3,00 € | A 55 %, B 30 %, G 15 %; desviación máxima 0 |

La venta de 1.000 € de A consume FIFO el lote más antiguo (compra 02/2022, coste 2.000 €, vale 3.000 €): parte vendida con coste 666,67 y ganancia 333,33 €, a un 19 % ≈ 63 €. Si la dueña se queda en el paso 1, no paga impuestos y sigue 10 puntos desviada; la tarjeta muestra las dos situaciones y dice cuánto aportar para corregir sin vender («1.818 €, unos dos meses a 900 € al mes sin cambios de precio»). **Decide ella dónde parar.** Efectivo entre plataformas: MyInvestor envía 1.000 € a IBKR.

## Impuesto aproximado de una venta

Es lo que se enseña antes de decidir, y se calcula con el **motor fiscal tal como esté** (la investigación fiscal en curso puede cambiar criterios; esto no los toca ni los duplica):

- Se proyecta una **copia del libro en memoria** con la venta hipotética añadida al final y se compara el ejercicio con y sin ella. Así salen solos el FIFO entre cuentas, las compensaciones, la regla de recompra y el diferimiento. Nada se escribe: la copia se descarta.
- El motor da la **base del ahorro**, no la cuota. Los tramos (`savings_tax_brackets`, ya en `Settings` y hoy solo validados y mostrados) se aplican a esa base en las dos versiones y el impuesto de la venta es la **diferencia**: marginal, porque los tramos son progresivos.
- Se valora al precio informativo vigente. Es una estimación que se rotula como tal («estimación; no es la liquidación»), nunca se guarda ni alimenta ninguna salida fiscal: la regla de que ningún cálculo fiscal depende de precios sigue intacta, porque el libro real no se toca.
- El importe se redondea una sola vez, al mostrarlo.

## Casos difíciles

- **Dinero insuficiente.** Funciona el nivel de agua: se corrige lo más lejano primero, hasta donde llegue, y la tarjeta dice cuánto falta (ver arriba). Nunca se vende para completar una aportación: la aportación propone y no vende (regla 2).
- **Activo sin precio.** Igual que hoy: el cálculo se rechaza nombrando los activos (`missing_manual_prices`), con el remedio «Registrar una valoración». Nunca se estima en silencio. Un activo con objetivo, sin posición y sin precio entra con valor cero y se le asigna importe en euros, pero no unidades. Un precio viejo (`stale_price_days`) se muestra con su edad.
- **Plataforma sin cuenta.** La plataforma de un activo es la cuenta (activa, del núcleo) donde tiene posición; con varias, la de mayor posición. Un activo con objetivo y sin posición no tiene cuenta: sale en «Sin plataforma» y la dueña elige una de las cuentas activas del núcleo en la pantalla (no se guarda). Una cuenta inactiva no recibe órdenes. Una venta mayor que la posición de una cuenta se parte en las cuentas que la tengan, de mayor a menor posición, aunque el FIFO fiscal sea entre cuentas (ADR-0009).
- **Cuenta en otra divisa.** Los importes salen en euros; el cambio de divisa de la cuenta no se calcula y la pantalla lo dice.
- **Comisión que no compensa.** La comisión estimada es la **real de la dueña**: la de la última operación equivalente del libro (mismo activo y cuenta; si no la hay, el mismo tipo de activo en la cuenta; si tampoco, **desconocida**, nunca cero, y la operación lo avisa). No se inventa ningún mínimo: cada paso enseña la comisión y su porcentaje sobre el importe, y el resumen señala la operación en que ese porcentaje es mayor. Si se quiere un aviso con umbral propio, ver `questions.md`, 3.
- **Venta con pérdida y regla de recompra.** El impuesto estimado sale 0 y la tarjeta dice la pérdida y qué ocurre con ella: si hay compras del mismo valor homogéneo en la ventana anterior (`wash_sale_window`: dos meses en fondos y cotizados) el motor ya difiere la pérdida y se enseña el importe diferido; y se avisa de **hasta cuándo no recomprar** (fin de la ventana posterior), sobre todo si ese fondo recibe aportación mensual. Las compras de la propia propuesta no recompran lo vendido.
- **Venta de un activo con lotes de traspaso.** Se usan los lotes tal cual (fecha y coste heredados); no se inventa nada.
- **Nada que hacer.** Sin umbral superado, sin déficit o con un solo activo, la respuesta es una frase, no una tabla vacía.
- **Cubo.** No aparece en ningún paso ni en ningún peso. El presupuesto del cubo se muestra aparte como hoy.

## Reglas de negocio que cambian

- **Regla 2** (`docs/business-rules.md`): el reparto deja de ser proporcional al déficit y pasa a ser por nivel de agua («primero al activo más lejos de su peso, hasta igualarlo con el siguiente»), con la frase de la dueña del 2026-10-26 y la salida por plataforma. Es el único cambio de una regla escrita y por eso espera el visto bueno de la dirección.
- **Regla 3**: se añade que el botón es lo que propone ventas y que las ventas solo aparecen si se supera el umbral; la revisión anual sigue siendo recomendación.
- **Regla 4**: se añade que el orden de las ventas del rebalanceo es el suyo (lo que esté por encima, de lo más lejano a lo menos). La **retirada de dinero** como función propia queda fuera de esta feature y reutilizará ese mismo orden.
- `docs/specification.md` §6.1 y §6.1.1: se añaden la salida por plataforma y el rebalanceo. Los tests que fijan el reparto proporcional se rehacen; el resto no cambia.

## Fuera de alcance

Registrar o enviar órdenes. Retiradas (regla 4 como función). Guardar el reparto o el rebalanceo propuesto. Cambio de divisa de las cuentas. Un esquema de comisiones configurable en `Settings` (ver `questions.md`, 1). El correo mensual solo cambia en que sus cifras salen del reparto nuevo.

## Pruebas (por orden de daño)

El reparto del mes es la prioridad 4 de la constitución, así que el dominio mantiene el 100 % de líneas y ramas:

- Invariantes del reparto: suma exacta al importe del núcleo, nada negativo, déficits iguales entre los activos financiados, un activo por encima no recibe, el dinero suficiente lleva a todos al objetivo, el residuo de céntimos no cambia el orden.
- Casos límite: dos activos con el mismo déficit, un solo activo con déficit, aportación mínima de un céntimo, objetivo cero, activo sin posición, activo en dos cuentas.
- Rebalanceo: el disparador, el orden traspasos → ventas, el límite por lo que las compras absorben, conservación del dinero entre venta y compra, el cubo ausente, la venta con pérdida con y sin recompra en ventana, comisión desconocida, el impuesto marginal contra los tramos (también con ganancias ya realizadas ese año), y que la copia en memoria no modifica el libro.
- Contrato: la web y la consola enseñan las mismas cifras que el dominio y no recalculan nada.
