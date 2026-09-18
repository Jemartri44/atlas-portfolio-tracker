# Especificación de la feature: Motor fiscal (`009-tax-engine`)

**Rama**: `feature/009-tax-engine`

**Creada**: 2026-09-18

**Estado**: **Aprobada por la dirección el 2026-09-18.** Los supuestos A1–A16 quedan confirmados (respuestas en [`questions.md`](questions.md)). Criterios nuevos numerados por la dirección: **#18–#21** (reglas finas de la recompra, A1), **#22** (orden de la compensación, A2) y **#23** (gastos de administración y depósito, A4). Añadido tras la respuesta a N6: FR-038.

**Entrada**: `docs/prompts/009-tax-engine.md`; ADR-0020 (lo declarado), ADR-0021 (las previsiones), ADR-0022 (la configuración se registra entera), ADR-0013/0014 (fecha fiscal, ventana, linaje), ADR-0009/0010/0011 (FIFO, traspasos, primitivas), ADR-0005 (decimal), ADR-0015/0016 (proyección degradada, `asOf`); `docs/fiscal-questions.md` (los diecisiete criterios, incluido el **17**, posterior al prompt).

---

## Resumen

El libro ya sabe consumir lotes, calcular la ganancia de cada transmisión y recoger dividendos e intereses. **No sabe hacer una declaración.** Le faltan cuatro cosas, y las cuatro son las que cuestan dinero:

1. **La regla de recompra, calculada.** Hoy solo avisa. Aquí se decide qué pérdida queda diferida, qué lotes la llevan, cómo viaja por traspasos y canjes y en qué ejercicio se libera.
2. **La integración y compensación de la base del ahorro** (art. 49 LIRPF): ganancias con pérdidas, el cruce del 25 % con los rendimientos del capital mobiliario en los dos sentidos, y el arrastre a cuatro ejercicios, **compensando siempre el máximo posible**.
3. **La honestidad de cada cifra**: de qué criterio depende, con qué certeza, cuánto dinero hay en juego si el criterio está mal y en qué dirección.
4. **Una salida terminada por consola**, `atlas tax <año>`, con el detalle por operación desarmable hasta los eventos y en `--json`.

Cuatro reglas gobiernan la feature entera:

- **R1 — Base, no cuota.** El motor calcula la base del ahorro y lo que la compone. No calcula la cuota, no aplica tramos, no finge ver el resto de la declaración (decisión (a)).
- **R2 — Ningún precio.** Ninguna cifra del IRPF lee un precio de mercado. Se demuestra borrándolos todos y comprobando que la salida es **idéntica byte a byte** (constitución II, decisión (f)).
- **R3 — Todo se desarma y todo dice de qué depende.** Cada total se abre en sus operaciones, cada operación en sus lotes, cada lote en su linaje hasta la adquisición original; y cada cifra lleva sus criterios (decisiones (b) y (c)).
- **R4 — Los valores por defecto no cambian nada de lo que ya existe.** La instantánea del libro sintético no se mueve un byte; `gains`, `income` y `lots` dan lo mismo que en `develop`. El motor **añade** cifras (lo diferido, lo compensado), no altera las que había (decisión (g)).

Y una consecuencia que conviene tener presente desde el principio: **una cifra de un ejercicio puede depender de hechos del ejercicio siguiente.** Una venta con pérdida en diciembre se difiere si se recompra en enero. El motor lo calcula así, y marca como **provisional** toda pérdida cuya ventana siga abierta en la fecha de consulta.

---

## Escenarios de usuario y pruebas *(obligatorio)*

### Historia 1 — La base del ahorro de un ejercicio, como total fiscal y desarmable (Prioridad: P1)

En mayo, el usuario prepara la Renta del año anterior. Tiene fondos en MyInvestor, un ETC de oro y acciones del cubo en IBKR, un dividendo en dólares y los intereses de la cuenta remunerada. Quiere saber **qué base del ahorro le sale**, compuesta de qué, y poder comprobar cada número contra sus extractos.

**Por qué esta prioridad**: es la razón de ser de la Fase 5 y de buena parte del proyecto.

**Prueba independiente**: sobre el ejercicio calculado a mano (plan §6), el motor da **las mismas cifras al céntimo, operación por operación**, y los totales cuadran con la suma de sus partes.

**Escenarios de aceptación**:

1. **Dado** un ejercicio con transmisiones de los dos libros, **cuando** se pide su salida fiscal, **entonces** las agrega en un único **total fiscal**, etiquetado como tal, sin subtotales por libro (constitución III, excepción 1). El libro de cada línea figura solo como procedencia.
2. **Dado** cualquier total de la salida, **cuando** se abre, **entonces** muestra las operaciones que lo componen; cada transmisión muestra sus lotes consumidos; cada lote, su linaje (`source_lot_id`) hasta el evento de adquisición original, con su fecha, su importe en divisa, su tipo del BCE y la fecha del tipo.
3. **Dado** una transmisión en divisa, **cuando** se muestra, **entonces** lleva el importe original, la divisa, el `fx_rate` tal como lo publica el BCE y su `fx_rate_date`, además del importe en euros (ADR-0013). Nunca solo el euro.
4. **Dado** un ETC con `income_category.etc = movable_capital`, **cuando** se calcula el ejercicio, **entonces** sus transmisiones salen de las ganancias patrimoniales y entran en los rendimientos del capital mobiliario (art. 25.2), y compensan como tales. **Sin tocar la configuración, todo sigue siendo ganancia patrimonial.**
5. **Dado** un ejercicio con saldo negativo de ganancias patrimoniales y saldo positivo de rendimientos, **cuando** se compensa, **entonces** se compensa hasta el 25 % del saldo positivo, y el resto queda pendiente con su ejercicio de origen.
6. **Dado** pérdidas pendientes de varios ejercicios anteriores, **cuando** se calcula un ejercicio, **entonces** se compensan **en la cuantía máxima** que permita ese ejercicio, las más antiguas primero, con el límite del 25 % **conjunto** para todo lo que cruza de categoría (A2).
7. **Dado** una pérdida de hace cuatro ejercicios que este no puede absorber, **cuando** se cierra el cálculo, **entonces** la salida dice que **caduca** y cuánto se pierde. Nunca desaparece en silencio.
8. **Dado** unas retenciones practicadas (reembolsos de fondos, ventas forzosas, dividendos, intereses), **cuando** se calcula el ejercicio, **entonces** se informan como retenciones a cuenta, cada una con su evento, diciendo que se restan de una cuota que el motor no calcula.

---

### Historia 2 — La regla de recompra, calculada y no solo avisada (Prioridad: P1)

El usuario reembolsa con pérdida un fondo al que sigue aportando cada mes. La ley no le deja computar esa pérdida mientras conserve las participaciones compradas dentro del año anterior o posterior. Hoy la aplicación le avisa; no sabe decirle **cuánto** se difiere, **dónde queda** y **cuándo vuelve**.

**Por qué esta prioridad**: con aportación mensual a un fondo, **cualquier** reembolso con pérdida de ese fondo activa la regla. Es el caso normal del núcleo, no una rareza.

**Prueba independiente**: una venta con pérdida de 40 participaciones y una recompra de 20 dentro de la ventana difieren exactamente la mitad de la pérdida; esa mitad aparece asociada al lote recomprado, viaja con él a través de un traspaso, y se libera en el ejercicio y por el importe proporcional a lo que se transmite del lote descendiente.

**Escenarios de aceptación**:

1. **Dado** una transmisión con pérdida y adquisiciones del mismo activo dentro de la ventana, **cuando** se calcula, **entonces** se difiere la parte `min(unidades recompradas disponibles, unidades vendidas) / unidades vendidas` de la pérdida, y se asocia a los lotes recomprados, los más cercanos en fecha primero (`data-schema.md` §8.4).
2. **Dado** una recompra **exactamente** en el último día de la ventana (antes o después), **cuando** se calcula, **entonces** difiere. **Dado** una el día siguiente al último, **entonces** no difiere. Los cuatro bordes tienen test propio.
3. **Dado** un lote que lleva una pérdida diferida y se traspasa, se canjea (`convert`) o se escinde (`carve_out`), **cuando** se calcula, **entonces** el diferimiento pasa a los lotes descendientes (en la escisión, repartido por `cost_share`) y se libera cuando **estos** se transmiten (criterio #15, en disputa).
4. **Dado** un lote que lleva una pérdida diferida y se transmite parcialmente, **cuando** se calcula, **entonces** se libera la parte proporcional a la cantidad transmitida, en el ejercicio de esa transmisión.
5. **Dado** una pérdida cuya ventana posterior termina después de la fecha de consulta, **cuando** se calcula, **entonces** la cifra se marca **provisional** con la fecha en que deja de serlo.
6. **Dado** un traspaso entrante dentro de la ventana, **cuando** `wash_sale_transfer_counts` es `true` (valor por defecto), **entonces** cuenta como adquisición y difiere; con `false`, no.
7. **Dado** las adquisiciones que la propia venta con pérdida consume, o que ya no se conservan, **cuando** se calcula, **entonces** no cuentan como recompra (A1, **Q1**).
8. **Dado** una recompra que cae en la ventana de dos ventas con pérdida, **cuando** se calcula, **entonces** cada unidad recomprada difiere como mucho una unidad vendida, empezando por la venta más antigua (A1, **Q1**).
9. **Dado** una pérdida diferida pendiente a 31/12, **cuando** se pide la salida del ejercicio, **entonces** figura con su transmisión de origen, su importe y los lotes que la llevan.

---

### Historia 3 — Cada cifra dice de qué criterio depende, y cuánto hay en juego (Prioridad: P1)

El usuario no tiene asesor fiscal. Seis criterios están en disputa y varios más tienen certeza media o baja. Quiere saber **dónde pisa firme y dónde no**, y el día que tenga un asesor, darle **solo lo dudoso**.

**Por qué esta prioridad**: es obligatorio (decisión (b)) y es lo que distingue a este motor de uno cualquiera. Una cifra bajo un criterio discutido no puede presentarse igual que una bajo el art. 35.

**Prueba independiente**: en el ejercicio a mano, la venta de acciones en dólares declara depender del criterio #4 con su diferencia calculada por el método alternativo; la permuta con comisión declara el #17 con la comisión como dinero en juego y dirección **agresiva**; el ETC declara la cuestión de su categoría de renta con la base recalculada como rendimiento del capital mobiliario.

**Escenarios de aceptación**:

1. **Dado** cualquier cifra de la salida, **cuando** se muestra, **entonces** lleva la lista de criterios aplicados (`docs/fiscal-questions.md`), cada uno con su certeza.
2. **Dado** un ejercicio en el que alguna cifra depende de un criterio **dudoso** (en disputa, certeza media o baja, o un criterio nuevo sin clasificar), **cuando** se pide la salida, **entonces** hay un apartado propio con: el criterio, su certeza, las cifras que dependen de él, el **dinero en juego** y la **dirección** (si el criterio está mal, ¿se declara de más o de menos?).
3. **Dado** un criterio que es configuración (ventana, traspaso como adquisición, fecha fiscal, categoría de renta), **cuando** se calcula su dinero en juego, **entonces** es la **diferencia real** de la base con la lectura alternativa, recalculada desde el libro (A8).
4. **Dado** un criterio que no es configuración (#4 diferencias de cambio del efectivo, #7/#13 régimen de neutralidad, #8 forks, #15 linaje), **cuando** se calcula su dinero en juego, **entonces** es la **exposición** —el importe de las cifras que toca— o una diferencia calculada si el libro la permite (el #4 del método de cálculo sí la permite), y se dice cuál de las dos es.
5. **Dado** una permuta con comisión, **cuando** se calcula, **entonces** su ganancia declara el criterio **#17** (certeza media, **agresivo en el momento**) y aparece en el apartado de dudosos con la comisión en euros como dinero en juego.
6. **Dado** un `corporate_action` con `neutrality_regime: false` cuyos efectos conservan fecha y coste (`convert`, `carve_out`), **cuando** se calcula, **entonces** avisa de la contradicción: el libro dice que no hay régimen y la operación se registró como si lo hubiera.
7. **Dado** un cambio de configuración registrado, **cuando** se pide la salida, **entonces** dice **en qué se diferencia** del cálculo con la configuración anterior: qué operaciones cambian de ejercicio, de categoría o de diferimiento, y cómo se mueve la base (A15).
8. **Dado** una configuración cuyos valores no están todos en el libro (líneas escritas antes de que existiera un parámetro), **cuando** se calcula, **entonces** la salida dice qué valores ha tomado **del código** y no del libro (ADR-0022: esos son los que cambiarían si cambiara un valor por defecto).

---

### Historia 4 — Lo que el motor se niega a hacer, dicho claramente (Prioridad: P2)

**Por qué esta prioridad**: un número aproximado presentado con aplomo es peor que ningún número.

**Escenarios de aceptación**:

1. **Dado** cualquier salida, **cuando** se muestra, **entonces** dice que es la **base**, no la cuota ni lo que se paga, y por qué (no ve el resto de la declaración).
2. **Dado** un dividendo extranjero con retención en origen, **cuando** se calcula la deducción por doble imposición, **entonces** da el primer límite (impuesto satisfecho limitado al tipo del convenio) si lo conoce, dice explícitamente que **el segundo (tipo medio efectivo) no es calculable** y por qué, y que el exceso no deducible **se pierde** sin arrastre (A5).
3. **Dado** un dividendo sin `source_country`, o de un país sin tipo de convenio conocido, **cuando** se calcula la deducción, **entonces** no la calcula para ese dividendo y dice por qué. Nunca deduce el total retenido sin límite (sería agresivo).
4. **Dado** cambios de divisa en cuentas multidivisa, **cuando** se calcula el ejercicio, **entonces** la salida dice que **las diferencias de cambio del efectivo no se calculan** (criterio #4, en disputa; faltan los lotes de divisa) y lista los eventos del ejercicio que las generarían (A6).
5. **Dado** un `grant` con `income_eur`, **cuando** se calcula el ejercicio, **entonces** no lo integra (criterio #8 vigente: nada se declara en la recepción) y lo lleva al apartado de dudosos como exposición (A7).
6. **Dado** un libro con eventos inválidos, **cuando** se pide la salida fiscal, **entonces** se niega, con el número de eventos inválidos y la indicación de `atlas check` (A11).

---

### Historia 5 — `atlas tax <año>`, terminado (Prioridad: P2)

**Escenarios de aceptación**:

1. **Dado** `atlas tax 2028`, **cuando** se ejecuta, **entonces** imprime por apartados: ganancias y pérdidas patrimoniales por operación, rendimientos del capital mobiliario, regla de recompra (diferidas, liberadas, pendientes), compensación paso a paso, partidas pendientes por ejercicio de origen con su caducidad, base del ahorro resultante, retenciones, doble imposición, criterios dudosos, lo que no se calcula y las diferencias con la configuración anterior.
2. **Dado** `atlas tax 2028 --lots`, **entonces** añade por operación los lotes consumidos y su linaje.
3. **Dado** `atlas tax 2028 --json`, **entonces** emite el informe completo, importes como cadenas decimales (exactos y redondeados), sin perder un campo del texto.
4. **Dado** cualquier cifra de la consola, **entonces** sale calculada del dominio: la CLI solo formatea (decisión (h) de la 006 y §2 bis del prompt).

---

### Historia 6 — Poder fiarse (Prioridad: P1)

**Escenarios de aceptación**:

1. **Dado** el libro sintético, el del ejercicio a mano y libros aleatorios, **cuando** se borran **todos** los precios —las `valuation`, el `unit_price` informativo donde hay `amount`, los `nav_*` de los traspasos, el `per_unit` de los dividendos—, **entonces** el informe fiscal de cada ejercicio es **idéntico byte a byte**. Y al revés: añadir valoraciones aleatorias tampoco lo mueve.
2. **Dado** el grafo de imports del dominio, **cuando** se comprueba, **entonces** nada que alcance el motor fiscal alcanza `prices.ts`, y el motor no lee ni `state.valuations` ni `state.fxRates` (los tipos se leen de cada operación).
3. **Dado** `develop` y esta rama, **cuando** se proyecta el libro sintético, **entonces** su instantánea es **idéntica byte a byte**, y `gains`, `income` y `lots` dan la misma salida.
4. **Dado** la configuración por defecto, **cuando** se calcula cualquier ejercicio, **entonces** toda transmisión es ganancia patrimonial y su resultado propio es el `gain_eur_rounded` que ya calcula `realizedGains`.
5. **Dado** el ejercicio calculado a mano, **cuando** se ejecuta el motor, **entonces** coincide al céntimo, operación por operación, y el cálculo a mano está escrito y **comprometido en git antes** que el código del motor.

---

### Casos límite

Los obligatorios del prompt y de la constitución VII, cada uno con test propio y con ese nombre:

- **Varios lotes con la misma fecha**: FIFO por posición en el fichero; en el reparto del diferimiento entre lotes recomprados empatados en distancia, también.
- **Fracciones**: cantidades de seis decimales en compra, venta, traspaso y diferimiento; el diferimiento se reparte exacto y el último lote recibe el resto.
- **Contrasplit con pico en efectivo, en dos cuentas**: el pico es una transmisión por cuenta, con su ganancia y, si pierde, con su regla de recompra.
- **Recompra exactamente en el límite de la ventana, por los dos lados**: `d − W` y `d + W` difieren; `d − W − 1` y `d + W + 1`, no. Para `"2m"` y `"1y"`, incluido el fin de mes (31-03 − 1 mes = 28/29-02).
- **Traspaso parcial**: solo el lote consumido lleva su parte de diferimiento al destino.
- **Traspaso que conserva antigüedad a través de tres saltos** (A → B → C → D): la venta de D consume lotes con la fecha y el coste de la compra de A, y el linaje muestra los tres saltos.
- **Pérdida diferida cuyos lotes se traspasan antes de liberarse**: viaja y se libera al vender el destino.
- **Un ejercicio en el que una pérdida caduca**: pérdida de 2027, sin ganancias hasta 2032; la salida de 2031 dice que caduca y cuánto.
- **Venta el 30/12 con liquidación el 02/01**: una acción cae en el ejercicio del 30/12; un fondo, en el del 02/01.
- **Pérdida en fondo seguida de aportación mensual dentro del año**: se difiere, y la aportación lleva el diferimiento.
- **Pérdida liberada que convierte en pérdida una transmisión con ganancia propia**: la regla se vuelve a aplicar al total (A1, **Q1**).
- **Venta forzosa con pérdida dentro de una fusión** (componente en efectivo): transmisión con su regla, y marcada con el criterio #13.
- **Split entre la venta con pérdida y la recompra**: las unidades no son comparables; el motor lo dice en vez de comparar cantidades heterogéneas (A12).
- **Ejercicio anterior a 2018**: el motor lo rechaza; aplica el régimen de compensación vigente desde 2018 (A13).

---

## Requisitos

### Bloque 0 — Lo que hay que arreglar antes

- **FR-001**: Un `corporate_action` que falla y se revierte DEBE deshacer también las adquisiciones anotadas para la regla de recompra y la renta en especie anotada. **Hoy no lo hace** (defecto vivo, verificado: `questions.md` **Q14**). El motor fiscal lee las adquisiciones, así que un fantasma ahí se convertiría en un diferimiento fantasma.
- **FR-002**: Un valor inválido de `income_category` DEBE rechazarse con **código propio** (`invalid_income_category`), traducido en la CLI y en la web. Encargo de la dirección; ver **Q13** sobre `fiscal_date_rule`, que **tampoco** tiene código propio.

### Bloque 1 — La regla de recompra

- **FR-010**: La proyección DEBE registrar, sin alterar ninguna cifra ni la instantánea, un **diario de lotes**: cada apertura, consumo (con la cantidad previa y si es transmisión, traspaso o canje), escisión y reescalado, en el orden en que el único motor de lotes los aplica. No decide nada: es el registro de lo que el FIFO ya hizo.
- **FR-011**: El motor fiscal DEBE calcular, recorriendo ese diario, para cada transmisión: su resultado propio, el diferimiento que **libera** (de lotes consumidos que lo llevaban) y el que **genera** (si el total es pérdida y hay adquisiciones en la ventana), con los lotes que lo llevan.
- **FR-012**: Es transmisión, a efectos de la regla, un `sell`, cada cuenta de un `forced_sale` y la pata entregada de un `swap`. Es adquisición lo que ya anota el sistema: `buy`, `grant` con coste, `transfer` entrante si `wash_sale_transfer_counts`, y la pata recibida de un `swap`.
- **FR-013**: La ventana es `wash_sale_window[asset_type]`, de fecha a fecha, extremos incluidos (ADR-0014), resuelta con `washSaleWindowOf`.
- **FR-014**: El diferimiento DEBE viajar con los lotes: al consumo parcial se libera o se traslada la parte proporcional a la cantidad; en un `transfer` o `convert` pasa a los lotes descendientes; en un `carve_out` se reparte por `cost_share`; en un `scale` se queda en el lote.
- **FR-015**: Lo liberado DEBE imputarse al ejercicio de la transmisión que lo libera y a la **categoría de renta de la pérdida original**.
- **FR-016**: Toda pérdida cuya ventana posterior termine después de la fecha de consulta DEBE marcarse **provisional**, con esa fecha.
- **FR-017**: Las reglas finas del reparto (qué adquisiciones siguen disponibles, cada unidad una vez, pérdida neta por operación, reaplicación sobre lo liberado) son las de A1, pendientes de **Q1**.

### Bloque 2 — El ejercicio

- **FR-020**: Cada transmisión DEBE clasificarse con `incomeCategoryOf(settings, asset_type)`: `capital_gain` → ganancias y pérdidas patrimoniales (art. 33); `movable_capital` → rendimientos del capital mobiliario por transmisión (art. 25.2). Por defecto, todas `capital_gain`.
- **FR-021**: Los rendimientos del capital mobiliario DEBEN incluir dividendos e intereses **brutos** en euros (el tipo de cada evento, su fecha y el original), las transmisiones del art. 25.2 y —si **Q5** lo confirma— la deducción de gastos de administración y depósito (`fee_kind` `custody` o `administration`, art. 26.1.a).
- **FR-022**: La cifra de cada operación DEBE redondearse **una vez**, half-up a céntimos, sobre `resultado propio + liberado − diferido`, exacto (ADR-0005, criterio #6). Sin diferimiento ni liberación es exactamente el `gain_eur_rounded` de hoy.
- **FR-023**: La compensación DEBE seguir el art. 49 LIRPF en dos fases (A2, **Q2**): (1) integrar cada categoría y cruzar el saldo negativo del ejercicio con el positivo de la otra hasta el 25 %; (2) compensar lo pendiente de ejercicios anteriores, primero contra la misma categoría sin límite y después contra la otra con **el 25 % conjunto** con la fase 1; los ejercicios más antiguos primero.
- **FR-024**: Lo no compensado DEBE quedar pendiente **por ejercicio de origen y categoría**, y caducar al cierre del cuarto ejercicio siguiente. La salida del ejercicio en que caduca lo dice, con importe.
- **FR-025**: El arrastre DEBE calcularse encadenando los ejercicios desde el primero con cifras fiscales, y DEBE aceptar un **ancla**: para un ejercicio con lo declarado conocido, lo pendiente sale de lo declarado y no del cálculo, y la salida muestra la diferencia (ADR-0020; el evento que lo registra es la feature siguiente, **Q9**).
- **FR-026**: Las retenciones a cuenta DEBEN informarse por evento: `sell.withholding`, `forced_sale.per_account[].withholding`, `withholding_spain` de dividendos e intereses. En euros al tipo de su evento, redondeadas por operación.
- **FR-027**: La deducción por doble imposición DEBE calcular por dividendo el primer límite —impuesto en origen limitado al tipo del convenio— **solo si conoce ese tipo** (**Q4**), y decir que el segundo no es calculable.
- **FR-028**: El motor DEBE rechazar un ejercicio anterior a 2018 o un libro con cifras fiscales anteriores a 2018 (A13).

### Bloque 3 — Criterios, procedencia y diferencias

- **FR-030**: El dominio DEBE tener un catálogo de criterios fiscales (identificador de `docs/fiscal-questions.md`, certeza, dirección del riesgo), y un test DEBE fallar si el catálogo y la tabla del documento dejan de coincidir.
- **FR-031**: Cada cifra de la salida DEBE llevar los criterios aplicados. Como mínimo: #1 fecha fiscal, #2 ventana (y su variante cripto), #2b traspaso como adquisición cuando interviene, #3 comisiones, #4 método en divisa cuando la operación no es en euros, #5 cuando `fx_rate_date` precede a la fecha fiscal, #6 redondeo, #7 cuando el linaje pasa por un `carve_out`, #8 cuando pasa por un `grant` de coste cero de un `crypto_fork`, #10 en la compensación, #13 en la pata en efectivo de un canje, #14 ventana de fecha a fecha, #15 cuando lo liberado o lo pendiente ha viajado, #16 en la doble imposición, #17 en la permuta con comisión, y la **categoría de renta** de ETC y ETP.
- **FR-032**: La salida DEBE incluir el apartado de **criterios dudosos**: por cada criterio dudoso que toque el ejercicio, las cifras afectadas, el dinero en juego (diferencia recalculada o exposición, diciendo cuál) y la dirección del riesgo (A8, **Q8**).
- **FR-033**: Para los criterios que son configuración, el dinero en juego DEBE ser la diferencia de la base del ahorro y de lo pendiente al recalcular **desde el libro** con la lectura alternativa.
- **FR-034**: La salida DEBE decir en qué se diferencia del cálculo con la configuración anterior al último `settings_changed` (A15).
- **FR-035**: La salida DEBE listar qué valores de configuración salen del código y no del libro (ADR-0022).
- **FR-036**: La salida DEBE decir, siempre: que es la base y no la cuota; qué falta de la doble imposición; que las diferencias de cambio del efectivo no se calculan; qué renta en especie está registrada y no integrada; y avisar de toda contradicción `neutrality_regime: false` + efectos que conservan coste.
- **FR-037**: *(Solo si **Q12** lo confirma.)* El aviso de un cambio de configuración (`movedFiscalYears`) DEBE comparar también la base del ahorro calculada por el motor, no solo las ganancias realizadas: después de esta feature, cambiar la ventana, el traspaso como adquisición o la categoría de renta mueve la base sin mover ninguna ganancia, y el aviso callaría.

- **FR-038**: El aviso `wash_sale_window_prior_buy` DEBE dejar de nombrar las compras que no difieren según el #18 (las que la propia venta consume o que ya no se conservan): la CLI y el motor no pueden contar historias distintas. Se hace al final, en commit propio, y **solo puede moverse la lista de avisos** de la instantánea. En el mismo commit (añadido de la dirección tras una revisión de la web): los dos avisos de recompra **nombran la compra** (fecha y cantidad) además de la venta, dicen **el ejercicio con número** («no será computable en 2027», no «este ejercicio») y **no llevan identificadores internos** (la venta se nombra por su fecha y su activo), en las dos interfaces.

### Bloque 4 — La consola

- **FR-040**: `atlas tax <año> [--lots] [--json]`, con los apartados de la Historia 5.
- **FR-041**: Todo código de aviso o error nuevo DEBE traducirse en la CLI (`apps/cli/src/output/messages.ts`) y en la web (`apps/web/src/format/messages/`), con todo importe dentro de la frase de la web pasando por `f.money` / `f.quantity`.

### Requisitos transversales

- **FR-050**: Ninguna función del motor fiscal DEBE recibir ni alcanzar un precio (`prices.ts`, `state.valuations`, `state.fxRates`, fuentes externas). Lo único con forma de precio que lee es la **contraprestación de la propia operación**: `amount`/`unit_price` de compras y ventas, `unit_price` de una venta forzosa, `market_value_*` de una permuta (art. 37.1.h) y `unit_cost` de un `grant`; son hechos del libro, no cotizaciones.
- **FR-051**: Ninguna regla fiscal fuera de `packages/domain`. La CLI y la web muestran.
- **FR-052**: Nada nuevo en la instantánea: el diario de lotes y el informe fiscal no se serializan en `snapshotOf`.
- **FR-053**: Ninguna dependencia nueva; `docs/` intacto.

### Entidades clave

- **Informe fiscal del ejercicio** (`TaxYearReport`): año, etiqueta de total fiscal, configuración aplicada y su origen, apartados de ganancias, rendimientos, recompra, compensación, pendientes, base, retenciones, doble imposición, criterios dudosos, notas y diferencias.
- **Línea de transmisión**: evento, tipo de evento, cuenta, libro (procedencia), activo, tipo de activo, categoría de renta, fecha fiscal, cantidad, transmisión (original, divisa, tipo, fecha del tipo, euros), coste por lote con linaje, resultado propio, liberado (de qué transmisiones), diferido (a qué lotes), computable exacto y redondeado, provisionalidad, criterios.
- **Diferimiento**: transmisión de origen, importe, unidades, adquisiciones que lo causan, lotes portadores, liberaciones (transmisión, ejercicio, importe) y resto pendiente.
- **Paso de compensación**: fase, qué compensa con qué, importe, límite aplicado.
- **Partida pendiente**: ejercicio de origen, categoría, importe inicial, aplicado por ejercicio, restante, ejercicio de caducidad, y si viene de lo declarado o de lo calculado.
- **Criterio fiscal**: identificador del documento, certeza, dirección del riesgo.
- **Exposición a un criterio dudoso**: criterio, cifras afectadas, dinero en juego, si es diferencia o exposición, dirección.
- **Nota**: código traducible, detalles, eventos.
- **Ancla de lo declarado**: ejercicio y pendientes por ejercicio de origen y categoría (la forma exacta la fija **Q9**).

---

## Criterios de éxito *(obligatorio)*

- **SC-001**: El ejercicio calculado a mano (plan §6) y el motor coinciden **al céntimo, operación por operación y en cada total**; el cálculo a mano está en `questions.md` y en la historia de git **antes** que el código que lo calcula.
- **SC-002**: Borrar todos los precios deja el informe fiscal de todos los ejercicios **idéntico byte a byte**, en el libro sintético, en el del ejercicio a mano y en al menos 200 libros aleatorios.
- **SC-003**: `synthetic-v1.snapshot.json` sin regenerar y verde; los tests y e2e existentes de `gains`, `income`, `lots` y `check`, sin tocar y verdes.
- **SC-004**: Cada caso límite de la lista tiene un test cuyo nombre lo dice.
- **SC-005**: `packages/domain` al **100 %** de líneas y ramas; `lint`, `typecheck`, `test:coverage` y `build` en verde; el test de arquitectura ve el motor dentro del camino fiscal.
- **SC-006**: Toda cifra del informe en `--json` lleva `criteria`, y toda cifra que depende de un criterio dudoso aparece en el apartado de dudosos con importe y dirección.
- **SC-007**: El catálogo de criterios y la tabla de `docs/fiscal-questions.md` coinciden, comprobado por test.

---

## Supuestos

Cada uno está preguntado en `questions.md`; **si no hay respuesta, se implementa así**.

- **A1** *(Q1)*: reglas finas de la recompra. (a) Una adquisición anterior solo cuenta por las unidades que **siguen** en el patrimonio tras la venta con pérdida (no las que esa misma venta consume ni las ya transmitidas); (b) cada unidad adquirida difiere como mucho una unidad vendida, y las pérdidas se atienden por orden cronológico; (c) la unidad de la regla es la **operación** (su resultado neto, como ya hacen los avisos y el redondeo); (d) lo liberado se suma al resultado de la operación que lo libera y la regla se aplica al total.
- **A2** *(Q2)*: compensación en dos fases, como el manual práctico de la AEAT, con el 25 % conjunto y los ejercicios más antiguos primero.
- **A3** *(Q3)*: el 25 %, los cuatro ejercicios y el año 2018 entran como **configuración con valor por defecto** (`Settings`), no como constantes (constitución IV).
- **A4** *(Q5)*: sí se deducen de los rendimientos del capital mobiliario las comisiones sueltas marcadas `custody` o `administration`; nada más, y ninguna por defecto (`fee_kind` ausente es `other`).
- **A5** *(Q4)*: los tipos de convenio entran como configuración opcional por país, sin valores por defecto; sin tipo, no hay deducción calculada para ese país.
- **A6** *(Q6)*: las diferencias de cambio del efectivo quedan fuera; el método de cálculo de la ganancia en divisa (#4) sí se cuantifica por la vía alternativa donde el libro lo permite.
- **A7** *(Q7)*: la renta en especie de un `grant` no se integra; va a dudosos como exposición.
- **A8** *(Q8)*: son dudosos los criterios en disputa, de certeza media o baja, los nuevos sin clasificar y la categoría de renta de ETC/ETP.
- **A9** *(Q9)*: el ancla entra ya como parámetro del motor; el evento, en la 010.
- **A10** *(Q10)*: no se aplican los tramos del ahorro en esta feature.
- **A11** *(Q11)*: con eventos inválidos, la salida fiscal se niega.
- **A12**: un `scale` entre la venta con pérdida y una adquisición de su ventana se señala con una nota y no se comparan cantidades heterogéneas.
- **A13**: se aplica el régimen vigente desde 2018; un ejercicio anterior se rechaza.
- **A14** *(Q15)*: el criterio #2 no se clasifica por mercado (no hay lista de mercados de la UE en el sistema): toda pérdida de un valor cotizado con ventana `"2m"` lo declara, mostrando `market` o «desconocido».
- **A15**: «el cálculo anterior» es el de la configuración vigente antes del último `settings_changed` (o los valores por defecto si solo hay uno).
- **A16**: la configuración aplicada a cualquier ejercicio es la vigente hoy, que reinterpreta el pasado (ADR-0015); cerrar ejercicios declarados es de la 010.

---

## Fuera de alcance

- El evento `tax_return_filed` y la salida por casillas (feature siguiente). Sí entra el **ancla** como parámetro (FR-025).
- Los Modelos 720 y 721, y cualquier valoración a 31/12.
- La pantalla fiscal de la web. En `apps/web` solo se tocan los catálogos de mensajes.
- Resolver cualquier criterio en disputa.
- La cuota, los tramos, el mínimo personal y familiar, la base general.
- Los lotes de divisa y las diferencias de cambio del efectivo (A6).
- Cualquier cosa de AWS; cualquier ADR aceptado.
