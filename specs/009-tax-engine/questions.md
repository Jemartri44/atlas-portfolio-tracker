# Preguntas abiertas — feature `009-tax-engine`

Lo que el prompt me prohíbe resolver por mi cuenta: criterios fiscales, decisiones estructurales, contradicciones entre el prompt, los documentos y el código.

Cada pregunta lleva **contexto suficiente para responderla sin abrir el código**, las opciones con su coste y **mi recomendación**. `spec.md` y `plan.md` están escritos con el supuesto recomendado (A1–A16 de `spec.md`): si no hay respuesta, se implementa eso.

Van ordenadas por lo que cuesta cambiarlas después. **Tres traen criterios fiscales nuevos** que el motor no puede dejar de decidir (Q1, Q2 y Q5, seis fichas en total): cada uno lleva una **ficha** con certeza y dirección del riesgo propuestas, para que la dirección los numere en `docs/fiscal-questions.md` antes de que se cuelen sin marcar, que es lo que pasó con el #17.

---

> **Todas respondidas por la dirección el 2026-09-18**, antes de escribir código. **Catorce confirman la recomendación**; la nota **N6** cambia de «no lo toco» a «hazlo al final, en commit propio». Cinco eran errores del prompt o de los documentos, reconocidos: **Q4**, **Q9** (ADR-0020 se enmienda hoy), **Q10**, **Q13** y N1–N4.

## Respuestas de la dirección (2026-09-18)

| # | Respuesta | Qué cambia respecto al supuesto |
|---|---|---|
| **Q1** | **Las cuatro reglas, numeradas**: (a) **#18**, (b) **#19**, (c) **#20**, (d) **#21**. *«Que sean mayoritarias no las hace inocuas: son agresivas frente a la alternativa, y así irán en el documento y en la salida.»* Las fichas las pasa la dirección a `docs/fiscal-questions.md` | Nada; el catálogo usa esos números |
| **Q2** | **Aceptado, criterio #22** | Nada |
| **Q3** | **`Settings` con valor por defecto**, los dos. *«El 25 % ya cambió cuatro veces entre 2015 y 2018»* | Nada |
| **Q4** | **Mapa opcional por país, sin valores por defecto**; sin tipo, no se calcula y se dice. Error del prompt, reconocido | Nada |
| **Q5** | **Aceptado, criterio #23**: solo `custody` y `administration` | Nada |
| **Q6** | **Fuera de la 009, dicho en la salida con todas las letras** | Nada |
| **Q7** | **No integrar; dudosos como exposición.** Hoy la exposición real es cero (cripto vía ETP), pero el apartado tiene que existir | Nada |
| **Q8** | **Aceptado** | Nada |
| **Q9** | **Ancla ya**, y **ADR-0020 se enmienda hoy**: pendientes separados por categoría | Nada |
| **Q10** | **No se aplican tramos.** Error del prompt, reconocido | Nada |
| **Q11** | **Aceptado**: un libro con inválidos da la lista de lo que hay que reparar | Nada |
| **Q12** | **Aceptado**: función nueva en el dominio, la CLI ya, la web en la siguiente | Nada |
| **Q13** | **Sí, también `fiscal_date_rule`** | Un código más |
| **Q14** | **Primer commit del bloque 0, con su test** | Nada |
| **Q15** | **Aceptado** | Nada |
| **N6** | **No se deja así**: con el #18, el aviso que nombra una compra consumida por la propia venta es falso. **Al final, en commit propio**, con predicción escrita antes, diff enumerado, y **parar si se mueve algo que no sea la lista de avisos** | Entra un commit nuevo al final |
| **N1–N4** | Los corrige la dirección hoy | Nada |

---

## Índice

| # | Tema | Recomendación | Si la respuesta es otra |
|---|---|---|---|
| **Q1** | Cuatro reglas finas de la recompra que §8.4 no fija | (a) solo cuenta lo que sigue en el patrimonio; (b) cada unidad recomprada, una vez; (c) la unidad es la operación; (d) lo liberado se suma y se reaplica la regla | Cambia el bloque 2 y cifras del ejercicio a mano |
| **Q2** | Orden y límite de la compensación | Dos fases como el manual de la AEAT (verificado), 25 % conjunto, antiguas primero, límite redondeado a céntimos | Cambia `compensation.ts` |
| **Q3** | 25 %, cuatro años: ¿configuración o constante? | Configuración con valor por defecto (constitución IV) | Dos campos menos en `Settings` |
| **Q4** | Tipo de convenio de la doble imposición: el libro no lo tiene | Mapa opcional por país en `Settings`, sin valores por defecto | Sin él, el primer límite no es calculable |
| **Q5** | ¿Se deducen del capital mobiliario las comisiones de custodia y administración (art. 26.1.a)? | Sí, solo las marcadas `custody`/`administration` | Una línea menos en los rendimientos |
| **Q6** | Diferencias de cambio del efectivo (#4) | Fuera de la 009, dicho en la salida; el método del #4 sí se cuantifica | Lotes de divisa: una feature entera |
| **Q7** | Renta en especie de un `grant` | No se integra (criterio #8 vigente); exposición en dudosos | Cambia la base y exige cambiar el coste del lote |
| **Q8** | Qué es «dudoso» y cómo se mide el dinero en juego | Disputa + media + baja + nuevos + categoría ETC/ETP; diferencia recalculada si es configuración, exposición si no | Cambia el tamaño del apartado |
| **Q9** | Ancla de lo declarado, y un hueco en ADR-0020 | Parámetro del motor ya; pendientes separados por categoría | Cambia la forma del evento de la 010 |
| **Q10** | Los tramos del ahorro: el prompt se contradice | No se aplican en la 009 | Una cifra «orientativa» más |
| **Q11** | Libro con eventos inválidos | Sin cifras: la respuesta es la lista de inválidos | Cifras con cabecera de aviso |
| **Q12** | El aviso de `settings set` se queda ciego ante el motor | Función nueva en el dominio + CLI; la web en la 010 | Cambia lo que ve la web ahora |
| **Q13** | Código de error de `income_category`: `fiscal_date_rule` tampoco tiene | Dárselo a los dos | Uno de tres queda impar |
| **Q14** | **Defecto vivo**: un evento corporativo fallido deja rastro | Arreglarlo en el bloque 0 | Adquisiciones fantasma en el motor |
| **Q15** | #2 por mercado: no hay lista de mercados de la UE | No clasificar; toda pérdida cotizada con `"2m"` lo declara | Un parámetro nuevo o una tabla |

Más abajo, **seis notas** sobre el prompt y los documentos (N1–N6), y el sitio donde irá el **ejercicio calculado a mano** (commit 4, tras las respuestas).

---

## Q1 — Cuatro reglas finas de la recompra que `data-schema.md` §8.4 no fija

**Contexto.** §8.4 dice: se buscan adquisiciones en la ventana; se difiere `min(cantidad recomprada, cantidad vendida) / cantidad vendida`; se asocia a los lotes recomprados, los más cercanos primero; viaja con los descendientes; se libera cuando se transmiten. Para calcular, el motor tiene que decidir cuatro cosas más. Las cuatro mueven cifras.

### (a) ¿Cuenta una adquisición que ya no se conserva?

Con aportación mensual y un reembolso **total**, la venta con pérdida consume por FIFO también las participaciones compradas el mes anterior. ¿Esas participaciones son una «recompra» que difiere la pérdida?

**Pasa hoy en el libro sintético**: la venta de `ast_world` del 2027-01-06 avisa (`wash_sale_window_prior_buy`) de la compra del 2026-08-28, cuyas 2,5 participaciones **consumió esa misma venta**.

El art. 33.5 *in fine* dice que la pérdida se integra «a medida que se transmitan los valores o participaciones **que permanezcan en el patrimonio**». Si no permanece nada, no hay lote al que asociar el diferimiento ni momento en que liberarlo.

1. **Solo cuentan las unidades que siguen en el patrimonio** tras la venta (ni las que consume esa venta ni las ya transmitidas). *Recomendada*: es la única coherente con el #15 —sin lote portador, el diferimiento no tiene dónde viajar ni cuándo liberarse—.
2. Cuentan todas las adquiridas en la ventana. Difiere más, pero deja diferimientos sin portador: habría que inventar cuándo se liberan.

> **Ficha propuesta — criterio nuevo «recompra que ya no está»**: *Una adquisición de la ventana solo difiere por las unidades que siguen en el patrimonio tras la transmisión con pérdida.* Fundamento: art. 33.5 *in fine* («que permanezcan en el patrimonio»). **Certeza: media. Riesgo: agresivo** frente a la lectura literal de la letra f), que no exige que permanezcan.

### (b) Una recompra en la ventana de dos ventas con pérdida

Vendo 10 con pérdida el 1 de marzo, recompro 10 el 5, vendo otras 10 con pérdida el 10. La recompra está en la ventana de las dos ventas.

1. **Cada unidad recomprada difiere como mucho una unidad vendida**, y las pérdidas se atienden por orden cronológico: la primera venta se difiere entera, la segunda no. *Recomendada*: aplicar la proporción de §8.4 a cada venta por separado difiere 20 unidades de pérdida con 10 recompradas, y el lote recomprado llevaría dos diferimientos por una sola compra.
2. Cada venta se evalúa sola: las dos se difieren enteras.

> **Ficha propuesta — «cada recompra, una vez»**: *Cada unidad adquirida en la ventana difiere como mucho una unidad transmitida; las transmisiones con pérdida se atienden en orden cronológico.* Sin norma expresa. **Certeza: baja. Riesgo: agresivo** frente a la opción 2, que difiere más.

### (c) ¿La regla mira la operación o cada lote?

Una venta que consume un lote con ganancia y otro con pérdida puede tener resultado neto positivo.

1. **La operación**: su resultado neto. *Recomendada*: es lo que ya hacen los avisos de hoy y el redondeo (criterio #6, «una vez por operación»), y la ley habla de «pérdidas derivadas de las transmisiones».
2. Cada lote: se difiere la pérdida del lote perdedor aunque la operación gane.

> **Ficha propuesta — «la operación es la unidad»**: *La regla se aplica al resultado neto de cada transmisión, no lote a lote.* **Certeza: media. Riesgo: ambas.**

### (d) Lo liberado convierte en pérdida una transmisión con ganancia

En el ejercicio a mano: la venta 18 gana 50 por sí misma y libera −75 diferidos; el total es −25. Si hubiera una recompra en su ventana, ¿se difieren esos −25?

1. **Lo liberado se suma al resultado de la transmisión que lo libera y la regla se aplica al total.** *Recomendada*: la pérdida liberada «se integra» en esa transmisión; si con ella la transmisión pierde y hay recompra, el supuesto de hecho de la letra f) se vuelve a dar.
2. Lo liberado se integra directamente, fuera de la regla; esta solo mira el resultado propio.

> **Ficha propuesta — «lo liberado vuelve a pasar por la regla»**: **Certeza: baja. Riesgo: conservador** (la opción 1 difiere más).

**Pregunta concreta**: ¿las cuatro recomendaciones? Y, si sí, ¿con qué números entran en `docs/fiscal-questions.md`? El catálogo del código usará esos números, y el test anti-deriva (plan §4.1) lo exigirá.

---

## Q2 — Orden y límite de la compensación

**Contexto.** El #10 fija el 25 % en los dos sentidos, los cuatro años y la obligación de compensar el máximo. No fija **el orden** entre la compensación del ejercicio y la de los pendientes, ni si el 25 % es uno solo para todo. El orden decide qué caduca.

**Lo he verificado** contra el manual práctico de IRPF 2025 de la AEAT ([integración y compensación en la base del ahorro](https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/irpf-2025/c12-integracion-compensacion-rentas/reglas-integracion-compensacion-rentas/integracion-compensacion-rentas-base-imponible-ahorro.html), [caso práctico](https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/irpf-2025/c12-integracion-compensacion-rentas/caso-practico.html); y la [fase 2 en el manual de 2020](https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/irpf-2020/capitulo-12-integracion-compensacion-rentas/reglas-integracion-compensacion-rentas/integracion-compensacion-rentas-base-imponible-ahorro/fase-2_.html)):

- **Fase 1**, el ejercicio: cada categoría se integra por separado; el saldo negativo de una se compensa con el positivo de la otra hasta el 25 % de este.
- **Fase 2**, lo pendiente: primero contra el saldo positivo restante **de su misma categoría**, sin límite; después contra el de la otra, con el 25 %, que **«junto con la [compensación] de los saldos negativos de rendimientos del capital mobiliario de [el ejercicio] no podrá superar conjuntamente el límite del 25 por 100»**.
- **El caso práctico lo confirma con números**: ganancias netas 4.000 → límite 1.000; se compensan 800 de rendimientos negativos del ejercicio, 700 y 2.100 de pérdidas pendientes de 2021 y 2022 (misma categoría, sin límite) y **solo 200** de los 500 de rendimientos negativos de 2021 (lo que queda del límite). Base: 200.

Tres puntos que el manual no cierra y el motor sí tiene que cerrar:

1. **Dos fases como el manual, 25 % conjunto.** *Recomendado*. El caso práctico entra tal cual como test.
2. **Entre ejercicios pendientes, los más antiguos primero.** El manual no lo dice (su ejemplo los lista en orden, 2021 antes que 2022). No cambia cuánto se compensa este año, solo qué sobrevive: los antiguos primero minimizan lo que caduca.
3. **El límite del 25 % se redondea half-up a céntimos** (25 % de 279,23 es 69,8075). Extensión del #6.

> **Ficha propuesta — «orden de la compensación»**: *Fase 1 del ejercicio con el 25 %; fase 2 de lo pendiente, primero en la misma categoría y después cruzado con el 25 % conjunto; entre ejercicios, los más antiguos primero; el límite, a céntimos half-up.* Fundamento: art. 49 LIRPF y manual práctico de la AEAT. **Certeza: alta** en las fases y el límite conjunto; **media** en el orden entre ejercicios y el redondeo. **Riesgo: conservador.**

**Y una contradicción en los documentos** (N3): `business-rules.md` §5.5 dice que el 25 % rige «desde 2022»; `fiscal-questions.md` #10, «desde 2018» (Ley 26/2014, con 10 %, 15 % y 20 % en 2015-2017). El segundo es el correcto. No toco `docs/`; lo dejo anotado.

**Pregunta concreta**: ¿las tres? ¿Y con qué número entra la ficha?

---

## Q3 — El 25 % y los cuatro años: ¿configuración o constante?

**Contexto.** La constitución IV dice que los tipos impositivos son configuración y que las cifras fiscales **nunca** van como constantes del código. El 25 % ya cambió una vez (2015-2018); nada impide que vuelva a cambiar.

1. **Dos campos opcionales de `Settings`** con valor por defecto documentado y resueltos en el punto de uso, como `income_category`: `savings_offset_limit_pct` (`"25"`) y `loss_carryforward_years` (`4`). Compatibles según ADR-0018. Por ADR-0022, en cuanto se escriba el siguiente `settings_changed` quedan fijados en el libro: un ejercicio calculado hoy se podrá reproducir en 2040 aunque la ley cambie. *Recomendada*.
2. Constantes con nombre en un único módulo, con la etiqueta «según se entienden en septiembre de 2026». Menos superficie, pero va contra la letra de la constitución IV y contra el argumento de ADR-0022.

El año 2018 no es un parámetro: es el inicio del régimen, y el motor rechaza ejercicios anteriores (A13).

**Coste de la opción 1**: dos validaciones, dos *flags* en `atlas settings set`, y la dirección actualiza `data-schema.md` §6.1 y `business-rules.md` §7. La web no se toca: guarda lo que lee.

**Pregunta concreta**: ¿opción 1?

---

## Q4 — El tipo de convenio de la doble imposición no está en ningún sitio

**Contexto.** El prompt pide calcular «lo que sí puede: el impuesto extranjero limitado al tipo del convenio». **Ese tipo no lo tiene el sistema**: ni el libro ni `Settings` guardan los tipos de los convenios (15 % Estados Unidos, 15 % Suiza aunque retenga el 35 %, 15 % Alemania aunque retenga el 26,375 %…). El `dividend` guarda el impuesto retenido y el país del pagador (`source_country`, opcional), no el límite.

Deducir todo lo retenido sin límite sería **agresivo**: es justo el exceso que el convenio dice que se reclama en origen, no en España.

1. **Mapa opcional por país en `Settings`** (`treaty_withholding_pct: Record<ISO 3166-1, DecimalString>`), **sin valores por defecto** (son cifras de tratados, verificables una a una). Un dividendo de un país sin tipo, o sin `source_country`, no recibe deducción calculada, y la salida dice por qué. *Recomendada*.
2. Sin configuración: la salida lista lo retenido por país y **no** calcula ningún límite. Honesto, pero no hace lo que pide el prompt.
3. Una tabla en el código. Descartada: constitución IV, y cada fila sería un criterio fiscal sin verificar.

El segundo límite (tipo medio efectivo) sigue sin ser calculable con cualquiera de las tres, y la salida lo dice, con que el exceso **se pierde** (sin arrastre en IRPF).

**Pregunta concreta**: ¿opción 1?

---

## Q5 — ¿Se deducen de los rendimientos del capital mobiliario las comisiones de custodia y administración?

**Contexto.** `fiscal-questions.md`, bajo «lo que el criterio dice bien pero se queda corto»: el art. 26.1.a) permite deducir los gastos de **administración y depósito de valores negociables** del rendimiento del capital mobiliario (no la gestión discrecional). La feature 008 añadió `standalone_fee.fee_kind` precisamente para distinguirlos. **Pero el criterio aplicado del #3 no dice que se deduzcan**: solo que no entran en la ganancia patrimonial. Aplicarlo es un criterio nuevo.

1. **Deducir solo las marcadas `custody` o `administration`**, convertidas al tipo de su evento, como línea negativa de los rendimientos. `fee_kind` ausente es `other` y no se deduce: **sin marcar nada, nada cambia**. *Recomendada*: es la letra de la ley y la 008 existe para esto.
2. No deducir nada en la 009; mostrarlas como «posiblemente deducibles».

> **Ficha propuesta — «gastos de administración y depósito»**: *Las comisiones sueltas marcadas `custody` o `administration` se deducen del rendimiento íntegro del capital mobiliario (art. 26.1.a LIRPF); `connectivity`, `discretionary_management` y `other`, no.* **Certeza: alta** en la norma; la clasificación de cada comisión es del usuario. **Riesgo: agresivo** si se marca como custodia lo que no lo es.

**Pregunta concreta**: ¿opción 1, y con qué número?

---

## Q6 — Diferencias de cambio del efectivo en divisa (criterio #4)

**Contexto.** El #4 tiene dos partes, las dos en disputa y con riesgo **en las dos direcciones**:

- **El método de la ganancia de un valor en divisa** (convertir cada pata a su tipo, o calcular en divisa y convertir al tipo de la transmisión). El libro permite calcular los dos.
- **La ganancia o pérdida del propio efectivo en divisa** al cambiarlo, con FIFO por divisa. Exige **lotes de divisa**, que no existen (ADR-0012 los aplazó «cuando el asesor confirme el tratamiento»), y sobre si el hecho imponible es el cambio o el empleo en una compra hay doctrina contraria.

El prompt no los pide expresamente («conversión de divisa por fecha fiscal» es convertir cada operación, que sí se hace).

1. **Método**: se aplica el vigente y se cuantifica la alternativa como dinero en juego del #4 (ejercicio a mano: +75,83 en la venta de acciones USA). **Efectivo**: fuera de la 009; la salida dice que no se calcula y lista los `fx_exchange` y movimientos en divisa del ejercicio. *Recomendada*: los lotes de divisa son una proyección nueva completa sobre un criterio que ni siquiera tiene claro su hecho imponible.
2. Implementar ya los lotes de divisa con el criterio vigente, marcado en disputa.

**Pregunta concreta**: ¿opción 1?

---

## Q7 — La renta en especie de un `grant` (`income_eur`, `income_base`)

**Contexto.** La 008 guarda en un `grant` el valor de lo recibido y la base a la que iría, «sin que entre en ningún cálculo»: decidirlo es la Fase 5. El criterio vigente, **#8**, dice: coste cero y **nada que declarar en la recepción**. Está **en disputa** y es **agresivo**: la DGT califica la recepción gratuita de criptoactivos como ganancia no derivada de transmisión, a valor de mercado y en la base **general**.

Si se integrara `income_eur`, habría que cambiar **también** el coste del lote (de cero al valor integrado); si no, la misma renta tributa dos veces, al recibir y al vender. Eso ya no es «integrar un importe»: es otra transformación del lote.

1. **No se integra**, según el #8 vigente. Va al apartado de dudosos con `income_eur` como exposición y la base que dice el evento. Si falta `income_eur`, «no cuantificable desde el libro». *Recomendada*.
2. Integrar lo de base `savings` como rendimiento del capital mobiliario y listar lo de base `general` como «fuera de la base del ahorro». Exige decidir además el coste del lote.

Y un hueco que nadie cubre: un **dividendo en especie** (ADR-0021 lo cita entre los usos de `income_eur`) sería rendimiento del capital mobiliario, pero el evento no distingue un dividendo en especie de un *airdrop*. Lo dejo anotado para quien resuelva el #8.

**Pregunta concreta**: ¿opción 1?

---

## Q8 — Qué es «dudoso» y cómo se mide el dinero en juego

**Contexto.** El prompt pide un apartado con «qué cifras dependen de un criterio **en disputa**», y dos líneas antes dice que «varios más tienen certeza media». Y la dirección añade que el #17 (media) se marque «como cualquier otro criterio dudoso».

**Alcance**:

1. Solo los seis en disputa.
2. **En disputa, certeza media o baja, los criterios nuevos sin clasificar y la categoría de renta de ETC/ETP** (sin número, pero «el hallazgo de mayor cuantía de la revisión»). *Recomendado*. Para no hacer ruido, un criterio cuya alternativa no mueve **ni** la base del ejercicio **ni** lo pendiente se lista en una línea, sin tabla.

**Medida** (tabla completa en plan §4.2):

- Si el criterio es configuración (#1, #2 y su variante cripto, #2b, categoría ETC/ETP): la **diferencia real** de base y de pendientes al recalcular desde el libro con la otra lectura. La dirección sale del signo.
- Si no lo es: la **exposición** (el importe de las cifras que toca), o una diferencia calculada cuando el libro lo permite (el método del #4 lo permite). La dirección, la documentada.
- Nunca se usa un precio para cuantificar: el canje sin régimen de neutralidad (#7/#13) y el *fork* sin `income_eur` (#8) quedan «no cuantificables desde el libro», dicho así.

**Pregunta concreta**: ¿alcance 2 y esta medida?

---

## Q9 — El ancla de lo declarado, y un hueco en ADR-0020

**Contexto.** El prompt pide un arrastre «anclado en lo efectivamente declarado cuando exista un `tax_return_filed`» y deja el evento para la 010. Para que la 010 solo tenga que enchufar, el motor acepta ya un **ancla** como parámetro: para un ejercicio dado, lo pendiente sale de lo declarado y no de lo calculado, y el informe enseña la diferencia.

**El hueco**: ADR-0020 dice que el evento guarda «las pérdidas pendientes de compensar **por ejercicio de origen**». No basta. Un saldo negativo de ganancias patrimoniales y uno de rendimientos del capital mobiliario **compensan distinto** (cada uno sin límite en su categoría y con el 25 % en la otra, Q2): el evento tiene que guardarlos **separados por categoría**. Y «las pérdidas que siguen diferidas por recompra a 31/12» solo pueden servir para **comparar**: un diferimiento vive en lotes concretos, y un total declarado no se puede volver a colgar de ellos.

1. **Ancla = `{ year, pending: [{ origin_year, category, amount_eur }] }`**, parámetro de `taxYear` desde la 009; la 010 la construye desde el evento. *Recomendada*. Y ADR-0020 debería decir «por ejercicio de origen **y categoría**» antes de que la 010 fije el formato.
2. Sin ancla en la 009; todo en la 010.

**Pregunta concreta**: ¿opción 1, y actualiza la dirección ADR-0020?

---

## Q10 — Los tramos del ahorro: el prompt se contradice

**Contexto.** §3.4: «Si se usan los tramos del ahorro, la salida dice **"estimación de la base"**». Pero los tramos no estiman una base: aplicados a una base, dan una **cuota**. Y ni siquiera la cuota del ahorro se puede estimar bien aislada: el mínimo personal y familiar se aplica primero a la base general y solo su remanente a la del ahorro, y el motor no ve la base general. La decisión (a) dice que el motor calcula la base, no la cuota.

1. **No aplicar tramos en la 009.** *Recomendado*: cualquier cifra con tramos sería exactamente «una cifra creíble y falsa». Nota: `savings_tax_brackets` no tiene valor por defecto en el código (solo aparece en la configuración del libro sintético), así que tampoco habría con qué calcular sin configurarlo.
2. Aplicarlos si están configurados, rotulando «cuota orientativa del ahorro, aislada, sin mínimo personal ni deducciones: no es lo que pagas».

**Pregunta concreta**: ¿opción 1?

---

## Q11 — ¿Cifras fiscales sobre un libro con eventos inválidos?

**Contexto.** ADR-0015: las consultas de solo lectura proyectan en modo degradado y avisan en cabecera. En `gains` o `positions` es razonable. En la salida fiscal, una proyección que se ha saltado un evento da **una base aproximada**, y el prompt pide «un mensaje claro, no un número aproximado».

1. **La consulta proyecta degradada, como manda ADR-0015, pero si hay inválidos su respuesta es la lista de inválidos** (`tax_ledger_invalid`, con cuántos y cuáles) **en vez de cifras**, remitiendo a `atlas check`. *Recomendado*. No creo que contradiga ADR-0015 —la consulta no muere, dice qué pasa—, pero es la dirección quien lo juzga.
2. Cifras con la cabecera de aviso, como el resto.

**Pregunta concreta**: ¿opción 1, y la considera compatible con ADR-0015?

---

## Q12 — El aviso de `atlas settings set` se queda ciego ante el motor

**Contexto.** `movedFiscalYears` (feature 005) avisa cuando un cambio de configuración mueve **ganancias realizadas** de un ejercicio anterior. Tras esta feature, cambiar la ventana de recompra, `wash_sale_transfer_counts` o `income_category` **mueve la base** sin mover una sola ganancia realizada, y el aviso callaría. Antes de la 009 no importaba: esos parámetros no movían ninguna cifra.

La web usa la misma función (`ajustes/configuracion.tsx`) y su diálogo dice «Este cambio mueve ganancias de ejercicios anteriores», con las cifras de antes y después.

1. Cambiar `movedFiscalYears` para comparar también la base y avisar si se mueve cualquiera de las dos. La web se enteraría sin tocar código, pero su diálogo enseñaría ganancias iguales antes y después para un año que solo mueve la base: confuso, y es territorio del otro agente.
2. **Una función nueva en el dominio (`movedTaxYears`) que compara la base del ahorro por ejercicio, usada por la CLI ya; la web la adopta en la 010**, que según ADR-0020 reescribe este aviso para distinguir *pasado* de *declarado*. *Recomendada*.
3. Todo en la 010.

**Pregunta concreta**: ¿opción 2?

---

## Q13 — El código de error de `income_category`: la premisa no es del todo exacta

**Contexto.** El encargo dice que `income_category` reutiliza `invalid_settings` «mientras sus dos mapas hermanos tienen código propio». **Solo uno lo tiene**: `wash_sale_window` usa `invalid_wash_sale_window`, pero `fiscal_date_rule` usa `invalid_settings` tanto para «falta» como para un valor desconocido de un tipo de activo.

1. Solo `income_category` (`invalid_income_category`), como se pide.
2. **También `fiscal_date_rule`** (`invalid_fiscal_date_rule`, con `asset_type` y `value`). *Recomendado*: son cinco minutos más, y la regla que la dirección dio en la Q1 de la 008 fue «que no nazca siendo el impar de tres». «Falta `fiscal_date_rule`» sigue siendo `invalid_settings`, como «falta `wash_sale_window`».

**Pregunta concreta**: ¿opción 2?

---

## Q14 — Defecto vivo: un evento corporativo que falla deja rastro

**Esto no es una duda de diseño: es un defecto reproducido en esta rama, que es `develop`.**

`applyCorporateAction` guarda el estado antes de aplicar los efectos y lo restaura si uno falla, «so a rejected event leaves no trace». Restaura lotes, posiciones, efectivo, contadores, ganancias y avisos. **No restaura `acquisitions` ni `inKindIncome`.**

**Reproducción** (un test temporal, ya borrado): `stock_dividend` con `grant` de 10 derechos a 1 € con `income_eur: "10"`, seguido de una `forced_sale` de 11 (más de lo recibido). En modo `collectErrors`:

| | Esperado | Obtenido |
|---|---|---|
| `invalid` | `[insufficient_position]` | `[insufficient_position]` |
| lotes del activo concedido | ninguno | ninguno |
| `acquisitions` del activo | 0 | **1** |
| `inKindIncome` | 0 | **1** |

`inKindIncome` **está en la instantánea** (`in_kind_income`), así que un evento rechazado aparece como renta registrada. `acquisitions` alimenta los avisos de recompra y, desde esta feature, **el diferimiento**: una adquisición fantasma difiere una pérdida real. Solo pasa en modo degradado (en estricto la proyección lanza), que es justo el modo en que se lee un libro que hay que reparar. Nace en la 005 (`acquisitions`) y se amplía en la 008 (`inKindIncome`).

1. **Arreglarlo en el bloque 0**, commit propio y primero, con el test. *Recomendado*: el motor fiscal lee esa lista.
2. Rama `fix/` aparte.

**Pregunta concreta**: ¿opción 1?

---

## Q15 — El #2 por mercado: el sistema no sabe qué mercados son de la UE

**Contexto.** El #2 está en disputa **para valores de fuera de la UE**; la 008 añadió `asset_created.market` para poder distinguirlo. Pero `market` es texto libre (MIC o nombre), y el sistema no tiene la lista de mercados regulados de la UE (ni de los que tienen decisión de equivalencia).

1. **No clasificar.** Toda pérdida de un valor cotizado con ventana `"2m"` declara el #2 en disputa, mostrando su `market` o «desconocido»; quien revise descarta a ojo los de Fráncfort. *Recomendada*.
2. Un parámetro de configuración con la lista de mercados que el usuario considera UE.
3. Una tabla en el código. Descartada: es un criterio fiscal y cambia.

**Pregunta concreta**: ¿opción 1?

---

## Notas sobre el prompt y los documentos

Ninguna bloquea. Las anoto porque la dirección pidió que se dijera lo que parezca equivocado.

- **N1.** El prompt manda leer `projections/fiscal-lots.ts`. **No existe**: `fiscalLots` vive en `projections/lots.ts`. Lo he leído ahí.
- **N2.** El prompt manda leer `docs/business-rules.md` «§5 entera y §8». **`business-rules.md` termina en §7.** Supongo que se refería a `data-schema.md` §8, que he leído entera.
- **N3.** `business-rules.md` §5.5 dice que el 25 % rige «desde 2022»; `fiscal-questions.md` #10, «desde 2018». El correcto es 2018 (Q2).
- **N4.** El encabezado de la tabla de `fiscal-questions.md` sigue diciendo «**Los dieciséis criterios**»; desde el #17 tiene diecisiete filas. El test anti-deriva leerá las filas, no el título.
- **N5.** ADR-0020 no separa por categoría las pérdidas pendientes que el evento debe guardar (Q9).
- **N6.** El aviso `wash_sale_window_prior_buy` de hoy nombra también las compras que **la propia venta consumió**, y dice que «la pérdida no será computable este ejercicio». Si se adopta Q1-a, el aviso y el motor dirán cosas distintas sobre la misma compra (el aviso es más prudente). No lo cambio en la 009: los avisos están en la instantánea y el *golden* se movería. Propongo ajustarlo en la feature en que se toque el *golden* por otra razón.

---

## Ejercicio calculado a mano

**Pendiente de las respuestas.** El diseño está en `plan.md` §6. El cálculo completo —operación por operación, con la compensación, los pendientes y el dinero en juego de cada criterio dudoso— se escribe aquí **y se comprueba en git antes que el código del motor** (commit 4 del plan). Q1, Q2 y Q5 cambian cifras de ese cálculo, por eso no lo adelanto.
