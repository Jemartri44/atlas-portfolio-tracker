# Reglas de negocio y mecánica fiscal

Reglas de dominio que la aplicación implementa. La especificación técnica (`specification.md`) las referencia por número. Las referencias a "regla N del plan" o "P1/P2/P3" apuntan a `plan-financiero.md`, documento privado que no está en el repositorio.

> **Aviso.** Este documento describe la mecánica fiscal española tal como se entiende en agosto de 2026, para orientar el diseño del software. La normativa cambia y su interpretación corresponde a un asesor fiscal, no a este documento. Cualquier cifra o tipo debe verificarse en la AEAT antes de usarse en producción. El sistema debe permitir cambiar tipos y umbrales por configuración, no por despliegue.

---

## 1. Estructura de la cartera

### Dos libros compartimentados

| Libro (`book`) | Nombre | Contenido | Plataforma | Métrica principal |
|---|---|---|---|---|
| `core` | **Cartera principal / núcleo** | Cuatro clases de activo: renta variable, renta fija, oro y cripto | MyInvestor (fondos), IBKR (ETC/ETP) | Desviación frente a pesos objetivo |
| `bucket` | **Cubo especulativo** | Acciones al contado, operativa de días a semanas. Pequeña parte para especular, trastear y aprender | IBKR (cuenta separada) | Rendimiento frente al índice |

### Clases de activo del núcleo (`asset_class`)

| Clase | Nombre | Vehículo habitual | Traspasable |
|---|---|---|---|
| `equity` | Renta variable (RV) | Fondos indexados | Sí |
| `fixed_income` | Renta fija (RF) / monetario | Fondos indexados o monetarios | Sí |
| `gold` | Oro | ETC de oro físico | No |
| `crypto` | Cripto | ETP (o tenencia directa) | No |

Oro y cripto son **satélites**: posiciones pequeñas que deben comportarse distinto al resto (regla 6b).

### Bases de cálculo distintas

- **Núcleo:** los pesos objetivo se aplican **sobre el valor total del núcleo**, para las cuatro clases de activo. Recibe la aportación mensual menos el porcentaje reservado al cubo.
- **Cubo:** es un **presupuesto**, no una asignación. Recibe un porcentaje fijo y configurable de la **aportación mensual**, y nunca entra en el cálculo de pesos objetivo.

El cubo sí aparece en la vista de patrimonio total, con etiqueta propia. El patrimonio nunca se muestra como un único número sin descomponer.

---

## 2. Reglas de cartera

**Regla 1 — Base de los porcentajes.**
Los pesos objetivo se calculan sobre el valor total del núcleo, no sobre la aportación mensual. Única excepción: el cubo.

**Regla 2 — Rebalanceo con dinero nuevo.**
Cada mes la aportación se dirige a los activos por debajo de su peso objetivo. Es el mecanismo de rebalanceo por defecto.
→ Mecánica de la calculadora (feature 004): del importe del mes se separa primero el presupuesto del cubo (`bucket_pct_of_contribution`); el resto se reparte entre los activos del núcleo **proporcionalmente a su déficit** frente al objetivo calculado sobre el valor tras la aportación; si la aportación supera el déficit total, el sobrante se reparte por pesos objetivo. Redondeo a céntimos una vez por activo. La calculadora **propone y nunca vende ni escribe**: las órdenes se dan a mano y se registran como siempre.

**Regla 3 — Umbral de rebalanceo por venta.**
Solo se vende para rebalancear si un activo se desvía más de un umbral (inicialmente 5 puntos porcentuales) de su peso objetivo. Revisión anual, no más frecuente.
→ La app avisa al superarse el umbral. El valor es configurable (`deviation_threshold_pp`).

**Regla 4 — Orden de venta en retiradas.**
Al retirar dinero se vende lo que esté **por encima** de su peso objetivo, nunca proporcionalmente de todo.
- Bolsa caída → se vende renta fija u oro (están por encima en peso relativo).
- Bolsa disparada → se vende renta variable.
En ambos casos la retirada rebalancea sola.
→ La app calcula y propone el desglose de la venta.

**Regla 5 — Desriesgado solo con plan concreto.**
No se reduce el riesgo de forma preventiva. Cuando exista un objetivo con fecha y cifra, desde 2-3 años antes las aportaciones mensuales van a renta fija/monetario hasta cubrir el importe, sin frenar el resto de la cartera.
→ Funcionalidad futura, no de la primera versión.

**Regla 6 — No añadir sin quitar.**
No se incorpora un activo nuevo sin eliminar otro. El número de posiciones no es diversificación.

**Regla 6b — Umbral mínimo de satélite: 0% o al menos 10-12%.**
Un satélite (oro, cripto) debe comportarse distinto al resto **y** ser lo bastante grande para que eso se note. La contribución de un activo es `peso × movimiento`: al 7%, un activo que sube un 30% mientras la bolsa cae un 40% aporta solo +2,1 puntos. Por debajo del 10% se paga complejidad por un efecto que se pierde en el ruido.
→ La app avisa si un satélite cae por debajo del umbral. Configurable (`satellite_min_weight_pct`).

**Regla 6c — Desviarse del índice solo de forma estructural.**
Cualquier desviación respecto a la ponderación por capitalización debe ser una decisión permanente y documentada, nunca una apuesta sobre el momento del mercado.
→ Sin implicación técnica directa; documentada para el registro de decisiones.

---

## 3. Reglas de conducta

**Regla 7** — Frecuencia de consulta a discreción del usuario. *(Anulada respecto a versiones anteriores del plan: no se imponen restricciones de diseño basadas en esto.)*

**Regla 8** — No tomar decisiones por noticias.

**Regla 9** — Cuando suba el sueldo, sube la aportación antes que el nivel de vida.
→ La aportación mensual es configurable (`monthly_contribution_eur`).

**Regla 10** — Una caída fuerte en los primeros años es una rebaja, no un desastre: las aportaciones dominan sobre los rendimientos. Solo es un desastre si se vende.

**Regla 11** — La cartera mediocre mantenida 30 años bate a la óptima abandonada en dos. Ante la duda, simplificar.

**Regla 12** — El mayor activo son los ingresos futuros, no la cartera.

---

## 4. Reglas del cubo especulativo

**Regla 13 — Cuenta separada**, en entidad distinta al núcleo. Una liquidación forzosa solo puede alcanzar esa cuenta.

**Regla 14 — Pocas operaciones y grandes.** Con capital pequeño y comisiones fijas, las comisiones deciden el resultado antes que el criterio.
→ La app muestra las comisiones acumuladas como porcentaje del capital operado. Es probablemente la métrica más reveladora del panel.

**Regla 15 — Log de tesis obligatorio ANTES de abrir la posición.**
Campos: hipótesis, plazo esperado, condición de invalidación, tamaño previsto.
→ **El sistema no debe permitir registrar una compra en el cubo sin tesis asociada.** Es un requisito funcional, no una recomendación.

**Regla 16 — La referencia es el índice, no cero.**
Para cada operación cerrada se calcula qué habría rendido ese mismo importe invertido en el fondo global durante el mismo periodo. La pregunta no es "¿gané?" sino "¿gané más que la alternativa aburrida?".
→ Mecánica (feature 005): el índice es un activo configurable (`bucket_benchmark_asset_id`) cuyos precios salen de las `valuation` manuales, como cualquier otro precio (Nivel 1). El equivalente en índice de una tesis es `Σ coste_i × P(fecha de cierre) / P(fecha de la compra i)` sobre sus compras enlazadas, y el resultado frente al índice es el resultado de la tesis menos el del índice. Si falta cualquiera de esos precios, la comparación queda **sin dato**: nunca se estima (constitución V).

**Regla 17 — Regla de parada.** *(Pendiente de definir. Configurable.)*
Umbral de pérdida acumulada o tope de aportación total tras el cual se deja de financiar el cubo.
→ La app avisa al acercarse y bloquea de forma visible al superarse (`bucket_max_cumulative_contribution`, `bucket_stop_loss_pct`).

**Regla 18 — Regla de recogida.** *(Umbral pendiente de definir. Configurable.)*
Si el cubo supera un porcentaje de la cartera total, el exceso se traspasa al núcleo (`bucket_max_weight_pct`).
→ El denominador es el **patrimonio total** (núcleo valorado + cubo valorado + efectivo de las cuentas de inversión, ADR-0004), siempre mostrado desglosado. Es una de las dos excepciones acotadas a la compartimentación (constitución III): un control de presupuesto, no una métrica de cartera mezclada. Sin el umbral configurado, el aviso no se evalúa.

**Regla 19 — No reponer el cubo con dinero de las otras partes.**

**Regla 20 — Registro en el momento de operar**, no reconstruido a posteriori. Fecha, activo, cantidad, precio, comisión, divisa, tipo de cambio.

---

## 5. Mecánica fiscal española

La declaración es **por contribuyente, no por libro**: la base del ahorro, la compensación de pérdidas y los umbrales de los Modelos 720/721 agregan núcleo y cubo. Es la única excepción a la compartimentación (constitución III) y toda salida que la use se etiqueta como total fiscal.

### 5.1 Base del ahorro

Tipos vigentes según se entienden en agosto de 2026 (**verificar y mantener configurable**, `savings_tax_brackets`):

| Tramo de ganancia anual | Tipo |
|---|---|
| Hasta 6.000€ | 19% |
| 6.000 - 50.000€ | 21% |
| 50.000 - 200.000€ | 23% |
| 200.000 - 300.000€ | 27% |
| Más de 300.000€ | 30% |

Los tramos se aplican a la **ganancia realizada en el ejercicio**, no al patrimonio ni al importe retirado. Solo tributa la plusvalía, no el capital aportado.

### 5.2 Traspaso entre fondos — el caso crítico

Los fondos de inversión españoles y los UCITS comercializados en España admiten **traspaso** sin tributación. Afecta a las clases `equity` y `fixed_income` del núcleo.

**Efecto sobre el modelo de datos:**
- Se conservan la **fecha de adquisición original** y el **valor de adquisición original**.
- Los lotes del fondo destino **heredan** `acquisition_date` y `unit_cost_eur` de los lotes origen, enlazados por `source_lot_id`.
- **No genera ganancia ni pérdida patrimonial.** No aparece en la declaración.
- Un traspaso parcial consume lotes en orden FIFO.

**Modelarlo como venta seguida de compra rompe la fiscalidad de forma silenciosa durante años.** Es el error más caro posible en este sistema.

Los ETFs, ETCs y ETPs (oro, cripto y todo el cubo) **no** admiten traspaso: cada venta es hecho imponible.

### 5.3 FIFO

El método de imputación es **primera entrada, primera salida**, aplicado por producto homogéneo (mismo `asset_id`) **a través de todas las cuentas** (ADR-0009): una venta en una cuenta consume fiscalmente los lotes más antiguos del activo aunque estén en otra. Empates de fecha: la posición en el fichero del evento que abrió el lote; si ese evento es una corrección, la de **la raíz de su cadena**, porque corregir un dato de una compra no cambia cuándo ocurrió (ADR-0009, enmienda del 2026-09-24; `data-schema.md` §8.1).

**Regla 21 — El mismo activo no puede estar en `core` y en `bucket`.** Evita que una venta del cubo consuma lotes del núcleo. El sistema rechaza el alta. En dos cuentas del mismo libro se permite con aviso.

**Traspaso de custodia.** Mover un valor (mismo ISIN) de un depositario a otro no es transmisión: conserva fecha y coste. Se registra como `transfer` del mismo activo entre cuentas (ADR-0012).

**Comisiones en la base fiscal** (art. 35 LIRPF): la de compra se suma al coste de adquisición; la de venta se resta del valor de transmisión; las de **custodia, administración o conectividad no son deducibles** en la ganancia patrimonial, porque no son inherentes a la adquisición ni a la transmisión (`docs/fiscal-questions.md` #3, certeza alta). Se guardan aparte del precio.

No deducibles **de la ganancia patrimonial** no quiere decir no deducibles en absoluto: el art. 26.1.a) permite restar del rendimiento íntegro del capital mobiliario los gastos de **administración y depósito** de valores negociables (nunca la gestión discrecional de carteras). El motor fiscal resta por eso las comisiones sueltas marcadas `custody` o `administration` (`standalone_fee.fee_kind`, criterio #23); `connectivity`, `discretionary_management` y `other` no se restan, y una comisión sin marcar es `other`, así que **sin clasificar nada no cambia nada**. Clasificar cada comisión es del usuario, y marcar como custodia lo que no lo es es la lectura agresiva.

**Retención a cuenta en reembolsos de fondos:** el comercializador retiene sobre la plusvalía; se registra en la venta (`withholding`) para que cuadre la declaración.

Casos límite a cubrir en tests:
- Varios lotes con la misma fecha de adquisición
- Lotes procedentes de traspaso (mantienen la fecha original, no la del traspaso)
- Cantidades fraccionarias
- Venta que consume parcialmente un lote

### 5.4 Regla de recompra con pérdidas (dos meses / un año)

Si se vende con pérdidas y se recompra el **mismo valor homogéneo** dentro de la ventana anterior o posterior a la venta, la pérdida **no es computable** en ese ejercicio. Se difiere hasta que se transmitan los valores recomprados.

La ventana es de **dos meses** para valores admitidos a negociación (acciones, ETF, ETC, ETP **y participaciones de fondos** —y los monetarios, que en este catálogo son fondos—, que lo son por el art. 4.9 del RD 1082/2012 al difundir su valor liquidativo a diario; corregido el 2026-09-22, criterio #2, donde consta que esa cita **limita su alcance** «a los efectos de aquellas disposiciones que regulen regímenes específicos de inversión») y de **un año** para los no admitidos (art. 33.5 **f)** y **g)** LIRPF, **verificar**). **La cripto va al año por prudencia, no por la letra g)**: para las monedas virtuales no hay norma expresa que fije plazo, como dice el propio criterio #2. Se cuenta **de fecha a fecha** en meses y años naturales, no en un número fijo de días (61 días no son dos meses: pregunta #14). Con aportaciones mensuales a un fondo, cualquier reembolso con pérdida de ese fondo activa la regla. Parametrizada por tipo de activo (`wash_sale_window`, `"2m"`/`"1y"`/`"<n>d"`, ADR-0013 y `data-schema.md` §8.4).

**Qué cuenta como adquisición** (criterio fijado el 2026-09-18, `docs/fiscal-questions.md` #2b, certeza media): un **traspaso entrante sí cuenta**, porque es una adquisición de valores homogéneos aunque no haya tributado en origen; unas acciones liberadas (`scale`) y un `grant` con coste cero **no** cuentan, porque no hay desembolso. El criterio es configurable (`wash_sale_transfer_counts`, por defecto `true`): contar difiere la pérdida, que es la lectura prudente, y no contarla la deduce antes.

→ La app alerta al intentar registrar una recompra que active la regla, y **aplica el diferimiento completo** en el motor fiscal: la parte de la pérdida proporcional a la cantidad recomprada queda pendiente, asociada a los lotes recomprados, y se libera cuando estos se transmiten; si esos lotes se traspasan o se canjean antes (`transfer`, `convert`, `carve_out`), el diferimiento viaja con los lotes descendientes y se libera cuando estos se transmiten (pregunta #15, **verificar**). Es el error más común en operativa activa.

La ley no cierra cuatro cosas que el motor no puede dejar de decidir, y que van numeradas en `docs/fiscal-questions.md` con su certeza y la dirección de su riesgo: solo cuenta la recompra que **sigue en el patrimonio** tras la venta (#18); cada unidad recomprada difiere **una sola** unidad vendida, atendiendo las pérdidas por orden cronológico (#19); la regla mira el **resultado neto de la operación**, no lote a lote (#20); y lo que una transmisión libera se suma a su resultado y **vuelve a pasar** por la regla (#21). El detalle está en `data-schema.md` §8.4.

### 5.5 Compensación de pérdidas

- Las pérdidas patrimoniales compensan primero con ganancias patrimoniales del mismo ejercicio.
- El remanente compensa con rendimientos del capital mobiliario **hasta el 25 %** del saldo positivo de esos rendimientos (art. 49 LIRPF; porcentaje vigente **desde 2018**, tras el régimen transitorio del 10-15-20 % de 2015-2017; `docs/fiscal-questions.md` #10). **El cruce va en los dos sentidos**: un saldo negativo de rendimientos del capital mobiliario compensa el saldo positivo de ganancias patrimoniales con el mismo límite.
- Lo no compensado se arrastra hasta **4 ejercicios** siguientes.

**El orden, que decide qué caduca** (criterio #22, tomado del manual práctico de IRPF de la AEAT): **fase 1**, el ejercicio —cada categoría se integra por separado y el saldo negativo de una compensa el positivo de la otra hasta el límite—; **fase 2**, lo pendiente de ejercicios anteriores —primero contra el saldo positivo restante de **su misma categoría**, sin límite, y después contra el de la otra, donde el límite es **conjunto** con lo ya compensado en la fase 1—. Entre ejercicios pendientes, los **más antiguos primero**, que es lo que minimiza lo que caduca. El límite se redondea a céntimos half-up, como cualquier otra cifra (#6). El motor compensa siempre el máximo posible: no compensar no es una opción que se deje al usuario.

El porcentaje y los cuatro años son **configuración**, no constantes del código (`savings_offset_limit_pct` y `loss_carryforward_years`, §7): el primero ya fue 10, 15 y 20 entre 2015 y 2017.

**El arrastre se ancla en lo declarado** (ADR-0020). El motor recorre la cadena de ejercicios desde el primero que importa, y en cada uno en que consta una **Renta presentada** —solo `renta`, solo la vigente el día de la consulta, nunca un 720 ni un 721— sustituye lo pendiente que él había calculado por **lo que aquella declaración dio por pendiente**, y sigue la cadena desde ahí. Una Renta presentada de un ejercicio anterior a los datos del libro es la vía por la que entra lo que se arrastraba de antes de usar la aplicación. El informe lleva las dos cifras y su diferencia **de cada ejercicio en que ancló**, no solo del último: lo declarado manda, pero la cifra que el motor calculaba no se tira.

→ La app mantiene el saldo de pérdidas pendientes **por ejercicio de origen y por categoría**, con el último ejercicio en que se puede usar cada uno. Separarlos por categoría no es cosmético: un saldo negativo de ganancias patrimoniales y uno de rendimientos del capital mobiliario compensan de forma distinta, sin límite dentro de su categoría y con el límite en la otra.

### 5.6 Dividendos y rendimientos extranjeros

- Tributan como **rendimiento del capital mobiliario** en la base del ahorro.
- Si hubo retención en origen, corresponde la **deducción por doble imposición internacional**.
- La deducción tiene dos límites y el motor solo calcula el primero: el **tipo del convenio** con el país del pagador (`treaty_withholding_pct`, §7). Sin ese tipo configurado, o sin `source_country` en el dividendo, no se calcula nada y la salida dice por qué; deducir todo lo retenido sería justo el exceso que el convenio manda reclamar en origen. El segundo límite (el tipo medio efectivo del contribuyente) no es calculable desde el libro, porque el motor no ve la base general; la salida lo dice, y dice también que el exceso **se pierde**, sin arrastre en IRPF.
- Se registra: importe bruto, retención en origen, retención en España, divisa, tipo de cambio de la fecha y **país del pagador** (`source_country`): de su convenio dependen el tipo deducible y el límite de la deducción (pregunta #16).

### 5.7 Divisa

Toda operación en divisa distinta del euro requiere conversión al **tipo de cambio oficial del BCE de la fecha fiscal** (§5.10).

- Se almacena el tipo **tal cual lo publica el BCE** (unidades de divisa por EUR, todos los decimales) y la fecha del tipo aplicado; en días sin publicación, el último anterior (**verificar**). Conversión: `eur = importe / tipo` (ADR-0013).
- Se almacenan siempre importe original, divisa y tipo aplicado.
- Los cambios de divisa dentro de una cuenta se registran como `fx_exchange` con ambos importes y ambos tipos, para poder calcular diferencias de cambio cuando se confirme su tratamiento (ADR-0012).
- Nunca convertir y descartar el original.
- Las cuentas multidivisa pueden generar ganancias o pérdidas por diferencias de cambio con tratamiento propio (**verificar la doctrina aplicable**).

### 5.8 Obligaciones informativas

**Modelo 720** — declaración informativa (no se paga nada) si los bienes en el extranjero superan **50.000€ por categoría** (cuentas, valores, inmuebles).
- Aplica a IBKR y a cualquier entidad extranjera. **No aplica a MyInvestor** — pero no por ser entidad española: el criterio legal es dónde están **situados** los bienes, y un fondo luxemburgués está en el extranjero. Lo que salva el caso es que en cuenta ómnibus la titular formal es la comercializadora española, que informa por sus propios modelos. **Comprar un fondo extranjero en una plataforma extranjera cambiaría la respuesta.**
- Se repite si el valor sube más de 20.000€ sobre la última declaración presentada **o si se deja de ser titular** de un bien previamente declarado (extinción). Sin el segundo disparador, la aplicación diría "no hace falta declarar" en un año en que sí hace falta.

**Las dos cifras de una cuenta.** Una cuenta se juzga por el **saldo a 31/12** y por el **saldo medio del cuarto trimestre**, los dos, tanto para el umbral como para la subida de 20.000€ (criterio #11). El saldo medio es la media de los saldos al cierre de cada día natural entre el 1 de octubre —o el primer movimiento de la cuenta, si es posterior— y el 31 de diciembre, con una cuenta cancelada contando cero desde su cierre. Las dos cifras se convierten con el **último tipo del BCE que el libro conoce** para esa divisa, y la aplicación **lo marca** cuando no es el de fin de año. El día de referencia no es el 31/12 a secas sino el **último día hábil** hasta él inclusive, porque el BCE no publica en fin de semana. Dentro de la categoría, los saldos **negativos netean** con los positivos.

**Los valores van en un bloque único.** Valores, instituciones de inversión colectiva y seguros comparten un solo umbral (art. 42 ter.4.c), así que fondos, ETF, ETC, ETP y acciones se suman juntos, y **la clave con la que cada uno se rellene en el impreso no mueve el umbral**. Qué clave le corresponde a cada vehículo es una pregunta abierta de `docs/fiscal-questions.md`, no un criterio aplicado: la aplicación decide si hay que presentar, no rellena el modelo. **Ningún ETP va al 721**: es un valor.

De las tres categorías del modelo, la aplicación calcula **dos** —cuentas y valores—: en el libro no hay inmuebles.

**Modelo 721** — equivalente para los criptoactivos **custodiados por un tercero en el extranjero** por encima de 50.000€, con un umbral único **sobre el conjunto**, no por categorías como el 720. **La autocustodia queda fuera** (criterio #11). Existe desde el ejercicio **2023** (Orden HFP/886/2023), y un ejercicio anterior no tiene 721.
- **No aplica a un ETP**, que es un valor, no una tenencia de criptoactivos.
- La regla de los 20.000€ y la extinción **también se le aplican** (art. 42 quater.6), pero cuenta **solo el saldo a 31/12**, nunca la media.
- **La aplicación sobredeclara, a propósito y dicho.** El libro no distingue una cuenta de autocustodia de la de un custodio extranjero, así que cuenta **todo** lo que hay en una cuenta cuyo país no es España y emite una nota que lo dice: «se cuenta todo lo que hay en cuentas extranjeras; si alguna es de autocustodia, no entraría». Sobredeclarar en una declaración informativa es la dirección prudente, y un campo nuevo en la cuenta no se justifica mientras la cripto sea vía ETP.

**Nunca se dice «no obligado» con datos incompletos.** El veredicto solo puede ser «no obligado» con todos los bienes de la categoría valorados y ninguna valoración marcada; si falta algo, es «no se puede determinar», con lo que falta como acción. La excepción es que lo que sí se conoce ya supere el umbral: entonces obliga igual, y la salida nombra con qué valores marcados se decidió. Todas las comparaciones son **estrictamente mayores**: 50.000,00€ no obliga y 50.000,01€ sí.

**Y una categoría sin ningún bien registrado tampoco es «no obligado»: es «nada registrado».** Un libro en el que no se ha anotado nada del extranjero no es un libro que se calculó y salió por debajo del umbral, y decirle «no estás obligado» a quien no ha metido nada es exactamente la clase de afirmación que esta aplicación no hace.

El veredicto solo existe para un 31 de diciembre que ya ha pasado; del año en curso se enseña lo que hay el día de la consulta, dicho como tal.

→ La app avisa al acercarse a los umbrales, con margen configurable (§7).

### 5.10 Fecha fiscal por tipo de activo

La fecha que determina el ejercicio, la antigüedad del lote, el tipo de cambio y la ventana de recompra es la **fecha de contratación** para valores cotizados (acciones, ETF, ETC, ETP; una venta el 30/12 con liquidación el 02/01 es del ejercicio anterior) y la **fecha valor** del reembolso o suscripción para fondos (**verificar**). Parametrizada por tipo de activo (`fiscal_date_rule`, ADR-0013); el libro guarda siempre ambas fechas.

### 5.9 Residencia fiscal

- Se es residente si se pasan más de 183 días del año natural en España, o si está aquí el centro principal de intereses económicos.
- **España no fracciona el ejercicio**: se es residente o no residente para el año completo.
- Perder la residencia fiscal **elimina el derecho al traspaso**, que es la base de toda la arquitectura de vehículos.

→ La residencia fiscal es un campo de configuración (`tax_residence`), no una constante. Un cambio invalida las funciones de traspaso.

### 5.11 Las casillas de la Renta son datos por ejercicio

Lo que el motor calcula son **conceptos** —el interés del año, el valor de transmisión de una venta, lo que compensa una pérdida de 2023—, y un concepto no depende de ningún impreso. La **casilla** sí: la Agencia Tributaria renumera el Modelo 100 cada campaña (en 2025 los ETF estrenaron un apartado propio, 2224-2236, que en 2024 no existía). Por eso las casillas son **datos por ejercicio** y la tabla de un año **no se hereda nunca**: una casilla prestada es una cifra creíble y falsa que el usuario teclea en una declaración real.

- Un ejercicio sin tabla comprobada sale por conceptos y **sin ningún número**, y lo dice.
- Un concepto sin fila en la tabla de su año sale sin número, y lo dice.
- No hay respaldo ni «año más cercano»: la tabla de otro ejercicio no se consulta en ningún momento.

**Procedimiento para añadir un ejercicio.** No es copiar el anterior. Se espera a la orden del BOE que aprueba el impreso; se lee cada concepto **en el formulario de ese año**; se transcribe el rótulo palabra por palabra, con la URL de la imagen del anexo y la fecha en que se comprobó; y solo después se compara con el año anterior, como control. La tabla vive como dato, y ningún `if` sobre un ejercicio se escribe fuera de ella. Hoy está comprobado **2025**.

### 5.12 Lo presentado es un hecho, y cierra el ejercicio

La aplicación deja constancia de cada declaración **realmente presentada** —la Renta, el 720 y el 721— con su justificante, sus cifras y su fecha (ADR-0020). Lo presentado es **un hecho, no un cálculo**: se guarda tal como se declaró aunque el motor calcule hoy otra cosa, y al lado se guarda lo que la aplicación calculaba aquel día y la configuración con la que lo hizo, para poder distinguir después un cambio del motor de un cambio del libro.

- **Una complementaria sustituye, no anula.** Es otra presentación que nombra a la que reemplaza; la primera ocurrió y sigue constando. A una fecha dada, la vigente es la última presentada hasta ese día.
- **Un ejercicio con presentación vigente está cerrado** para ese modelo. Escribir en él no se prohíbe —hacerlo tarde puede ser legítimo, y a veces obligatorio—, pero **no debe hacerse en silencio**: la aplicación avisa antes de confirmar, diciendo qué declaración habría que mirar y cuánto se mueve. Avisa en los dos casos: cuando lo registrado cae por fecha dentro del ejercicio cerrado, y cuando mueve una cifra declarada aunque su propia fecha sea de otro año.
- **Cuando no se puede comparar, también avisa, y dice por qué.** Si el libro tiene eventos inválidos, la comparación entre las dos lecturas no se hace —una comparación aproximada sobre un libro roto sería peor que ninguna (ADR-0015)—; tampoco si una de las dos lecturas tendría que empezar antes del primer ejercicio que el motor calcula. En los dos casos el aviso sale igual, **nunca diciendo que no se mueve nada**, y nombra el motivo, porque el primero se arregla reparando el libro y el segundo no tiene arreglo. Hasta la feature 011 el primer caso, con un cambio fechado fuera del ejercicio, no avisaba de nada.
- **Un 720 o un 721 se avisa solo cuando la escritura puede afectarlo.** Sus cifras son valores a mercado y no se comparan con el motor de la Renta, así que el aviso dice que hay que mirarlo a mano. Sale cuando lo que se registra, se corrige o se anula tiene fecha de negocio anterior o igual al 31/12 de ese ejercicio, o cuando se cambia —o se anula un cambio de— la regla de fecha fiscal, que puede mover operaciones de un lado a otro del 31/12. Un umbral, un peso o el seguimiento de órdenes y traspasos no avisan.
- Un ejercicio pasado **con cifras y sin presentación registrada** no da aviso: da una nota, por si falta registrarla.

---

## 6. Eventos corporativos

Transformaciones que la app debe soportar sin migración de esquema. Se implementan como composición de cinco primitivas de lote (`scale`, `convert`, `carve_out`, `forced_sale`, `grant`; ADR-0011). El dividendo en efectivo no es un evento corporativo sino un `dividend`. El cambio puro de ISIN/ticker es un `asset_updated`, no un evento corporativo.

| Evento (`corporate_action.kind`) | Efecto sobre los lotes |
|---|---|
| **Split** (`split`, ej. 4:1) | Multiplica cantidad, divide coste unitario. Fecha y coste total intactos. |
| **Contrasplit** (`reverse_split`) | Inverso. Las fracciones sobrantes suelen liquidarse en efectivo: **hecho imponible**. |
| **Dividendo en efectivo** (`cash_dividend`) | No toca lotes. Rendimiento del capital mobiliario. |
| **Dividendo en acciones** (`stock_dividend`) | Lotes nuevos. Fecha y valoración según normativa. |
| **Fusión / absorción** (`merger`) | Los lotes se transforman en el valor nuevo por canje. Conserva antigüedad. |
| **Escisión** (`spin_off`) | El coste original se reparte entre matriz y escindida según la proporción publicada. |
| **Fusión de fondos** (`fund_merger`) | Frecuente en indexados. Como el traspaso: conserva antigüedad y coste. |
| **Cambio de clase de participación** (`share_class_change`) | Muy frecuente. Mismo fondo, otro ISIN, otro TER. Conserva antigüedad. |
| **Cierre / liquidación de fondo** (`fund_liquidation`) | Reembolso forzoso. **Sí es hecho imponible.** |
| **Cambio de ISIN o ticker** (`identifier_change`) | Solo metadatos, pero rompe las fuentes de precios. |
| **Exclusión de cotización** (`delisting`) | Posición sin precio. Requiere marcado manual. |
| **Fork de cripto** (`crypto_fork`) | Activo nuevo con **coste de adquisición cero** y fecha del fork (criterio conservador, *verificar*). Se documenta en el evento. |
| **Migración de token** (`token_migration`) | Canje. Documentar el criterio aplicado. |
| **Reestructuración de emisor de ETC/ETP** (`issuer_restructuring`) | Puede implicar canje o reembolso forzoso. |

Cada evento registrado guarda su **fuente documental** (URL o PDF del emisor).

---

## 7. Parámetros configurables

Ninguno de estos valores va codificado en el fuente. Los valores marcados como *pendiente* dependen del plan financiero privado.

Algunos parámetros tienen un **valor por defecto documentado** (el que aplica mientras el libro no diga otra cosa). Ese valor por defecto **se materializa en el libro** en cuanto se escribe un `settings_changed`, porque cada uno registra la configuración vigente **entera**, no un parche (ADR-0022): un ejercicio calculado hoy se reproduce dentro de quince años aunque el valor por defecto del código haya cambiado, que es lo que un cálculo fiscal necesita.

| Parámetro | Valor inicial | Regla asociada |
|---|---|---|
| `target_weights{}` | Pendiente (claves: `asset_id` del núcleo; suman 100) | 1, 2 |
| `deviation_threshold_pp` | 5 puntos | 3 |
| `satellite_min_weight_pct` | 10% | 6b |
| `monthly_contribution_eur` | Pendiente | 9 |
| `bucket_pct_of_contribution` | Pendiente | — |
| `bucket_max_cumulative_contribution` | Pendiente | 17 |
| `bucket_stop_loss_pct` | Pendiente | 17 |
| `bucket_max_weight_pct` | Pendiente | 18 |
| `bucket_benchmark_asset_id` | Pendiente (`asset_id` del índice de referencia) | 16 |
| `stale_price_days` | 5 | — |
| `model_720_threshold_eur` | 50.000€. Importe por encima del cual una categoría del Modelo 720 obliga a presentar (arts. 42 bis.4.e y 42 ter.4.c RD 1065/2007) | 5.8 |
| `model_720_increase_eur` | 20.000€. Subida sobre la última presentada que vuelve a obligar (arts. 42 bis.5 y 42 ter.5) | 5.8 |
| `model_720_alert_threshold_eur` | 45.000€. Importe al que la aplicación avisa, antes de que el umbral obligue. No es una cifra de la ley: es una elección del usuario, y la validación exige que no supere al umbral | 5.8 |
| `model_721_threshold_eur` | 50.000€ (art. 42 quater.5.d) | 5.8 |
| `model_721_increase_eur` | 20.000€ (art. 42 quater.6) | 5.8 |
| `model_721_alert_threshold_eur` | 45.000€, con el mismo criterio que el del 720 | 5.8 |
| `renta_season_start`, `renta_season_end` | `04-01` y `06-30`, como `MM-DD`. Semanas en que la tarjeta fiscal del Resumen sube arriba del todo: las fechas de la campaña se mueven cada año, así que también son configuración | — |
| `savings_tax_brackets[]` | Ver 5.1 | 5.1 |
| `fiscal_date_rule{}` | cotizados → contratación; fondos → fecha valor. **Mapa parcial**, como el anterior (ADR-0018). Cambiarlo puede dejar el `fx_rate` guardado de una línea sin corresponder a la fecha fiscal nueva; el motor nunca recalcula en silencio. **Antes de confirmar** el cambio, la consola (`atlas settings set`) y la web (Ajustes → Configuración) nombran las líneas cuyo tipo deja de ser el de su fecha fiscal, o que no se pueden verificar sin el histórico; después lo señala `check --deep`, y el informe fiscal lleva una nota mientras queden. La corrección es la de siempre, anulación más línea nueva con el tipo oficial, y la aplicación la **propone** entera para que el usuario la confirme (`atlas fx correct`; en la web, Verificación → Tipos del BCE) (ADR-0029, punto 10; criterio **25** de `docs/fiscal-questions.md`) | 5.10 |
| `wash_sale_window{}` | cripto `"1y"`; cotizados **y fondos, monetarios incluidos** `"2m"` (de fecha a fecha; `wash_sale_window_days` en días es la forma antigua aceptada). **Mapa parcial**: un tipo de activo ausente toma su valor por defecto, para que añadir un tipo nuevo no invalide la configuración ya escrita (ADR-0018) | 5.4 |
| `wash_sale_transfer_counts` | `true`: un traspaso entrante cuenta como adquisición a efectos de la regla de recompra | 5.4 |
| `income_category` | Por tipo de activo: `capital_gain` (ganancia patrimonial, art. 33) o `movable_capital` (rendimiento del capital mobiliario por transmisión, art. 25.2). **Por defecto `movable_capital` para `etc` y `etp`** (criterio **#24**: consulta vinculante DGT V0267-25, un ETC es un valor de deuda) y `capital_gain` para el resto. **Mapa parcial** (ADR-0018). Es el campo que ADR-0021 dejó previsto para resolver el asunto de los ETC sin tocar código | 5.1 |
| `savings_offset_limit_pct` | `"25"` (%). Parte del saldo positivo de una categoría de la base del ahorro que puede compensar el saldo negativo de la otra (art. 49). Fue 10, 15 y 20 en 2015-2017, así que es configuración y no una constante | 5.5 |
| `loss_carryforward_years` | `4`. Ejercicios a los que se arrastra un saldo negativo de la base del ahorro (art. 49) | 5.5 |
| `treaty_withholding_pct{}` | **Sin valor por defecto, a propósito**: tipo máximo de retención en origen que el convenio de doble imposición permite a cada país, por clave ISO 3166-1 alfa-2. Son cifras de tratados, verificables una a una; un dividendo de un país que no esté aquí, o sin `source_country`, no recibe deducción calculada y la salida dice por qué | 5.6 |
| `transfer_max_days` | Pendiente. Días que puede estar abierta una solicitud de traspaso antes de que la aplicación avise; contados hasta la fecha de la consulta, no hasta hoy | 5.2 |
| `tax_residence` | España | 5.9 |
| ~~`notification_email`~~ | **Sale de `Settings` (ADR-0028, Ronda 8).** El destinatario del correo tiene **una sola fuente, `terraform.tfvars`**, fuera del repositorio, de la que Terraform escribe el parámetro de SSM Parameter Store que lee la Lambda y la condición de IAM que acota el envío (ADR-0034, fila 12). No va en el repositorio porque es un dato personal y el repositorio es público; y no va en `Settings` porque **ninguna cifra del libro lo lee** y quien lo usa es la Lambda que envía el correo: un dato personal que solo usa el servidor vive donde lo lee el servidor (principio IV de la constitución, enmienda 1.6.0: en `Settings` solo la configuración que afecta a cifras del libro). Junto a él, en SSM, va un interruptor que decide si los correos llevan importes (por defecto, no): configuración operativa que ninguna cifra lee y, además, un **campo nuevo**, que en una foto completa (`settings_changed`) un cliente antiguo borraría sin avisar al escribir la foto siguiente (ADR-0026, caso 6; enmienda de ADR-0018, `docs/data-schema.md` §5). El campo `notification_email` se sigue **aceptando al cargar** líneas `settings_changed` ya escritas, para no invalidarlas (ADR-0018: retirarlo del validador sería endurecer), y deja de leerse. **La web todavía lo ofrece en Ajustes; se retira de la interfaz con la feature 016** (tareas y correo) | — |
| `job_frequencies{}` | Ver especificación | — |

**Requisitos:**
- Historial de cambios de configuración: cambiar los pesos objetivo altera el cálculo de desviaciones históricas.
- Validación: los pesos objetivo suman 100%; los umbrales deben ser coherentes entre sí.
- **Aviso al modificar un umbral que esté silenciando una alerta activa.**
- **Aviso al cambiar un parámetro fiscal que mueve un ejercicio ya cerrado.** La ventana de recompra, `wash_sale_transfer_counts`, `income_category` y los dos parámetros de la compensación mueven la **base del ahorro** de un ejercicio pasado sin mover ninguna ganancia realizada, así que el aviso relee cada ejercicio pasado con la configuración en vigor y con la propuesta y compara las **tres** cifras que fija una Renta —la base del ahorro, los saldos pendientes y el diferido al cierre—, porque un ejercicio puede conservar la base y aun así mover los siguientes. Dice qué ejercicios se mueven antes de guardar.
