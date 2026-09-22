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

**Escrito antes que el código del motor** (plan §6). Las cifras de aquí salen de aritmética hecha paso a paso sobre los datos de los eventos y de las reglas aprobadas (#1–#23); **no** de ejecutar el motor, que todavía no existe. El test `packages/domain/test/tax/exercise.test.ts` codificará estas cifras como literales. Toda discrepancia que aparezca al contrastar se investigará y se documentará al final de esta sección, sin tocar el literal hasta saber quién tiene razón.

### Configuración

Un único `settings_changed`, completo: los tres mapas por defecto (fondos y monetario a fecha valor y ventana `"1y"`; cotizados y cripto a fecha de contratación; cotizados `"2m"`, cripto `"1y"`; todo `capital_gain`), `wash_sale_transfer_counts: true`, `savings_offset_limit_pct: "25"`, `loss_carryforward_years: 4` y `treaty_withholding_pct: { US: "15" }`.

### Catálogo

| Cuenta | Libro | | Activo | Tipo | Libro | Divisa | Otros |
|---|---|---|---|---|---|---|---|
| `acc_mi` | núcleo | | `fund_a`, `fund_b` | `fund` | núcleo | EUR | traspasables |
| `acc_ibkr` | núcleo | | `etc_gold` | `etc` | núcleo | EUR | `market: XETR` |
| `acc_bkt` | cubo | | `stock_us` | `stock` | cubo | USD | `market: XNAS` |
| | | | `stock_eu` | `stock` | cubo | EUR | |
| | | | `coin_x`, `coin_y` | `crypto` | cubo | EUR | |

Cuatro tesis abiertas en el cubo (una por activo del cubo), para que las compras sean válidas (regla 15). No intervienen en ninguna cifra.

### Los eventos

En todos, `trade_date = value_date` y `fx_rate_date` = esa fecha (todas son días laborables), así que la fecha fiscal no depende de la regla del #1 y ningún tipo es anterior a su fecha (#5 no aplica). Sin comisión salvo donde se dice.

| # | Fecha | Evento | Datos |
|---|---|---|---|
| E1 | 2027-02-01 | `buy` `fund_a`, `acc_mi` | 100 participaciones, `amount` 1.000 €, `unit_price` 10 (informativo) |
| E2 | 2027-03-01 | `buy` `stock_us`, `acc_bkt` | 10 acciones, `amount` 1.000 USD, comisión 1 USD, tipo 1,10 |
| E3 | 2027-05-03 | `buy` `etc_gold`, `acc_ibkr` | 10 a 70 € |
| E4 | 2027-06-01 | `buy` `stock_eu`, `acc_bkt` | 10 a 20 € |
| E5 | 2027-09-01 | `sell` `stock_us`, `acc_bkt` | 10 acciones, `amount` 800 USD, comisión 1 USD, tipo 1,25 |
| E6 | 2027-10-01 | `interest`, `acc_mi` | bruto 40 €, retención 7,60 € |
| E7 | 2028-01-10 | `buy` `etc_gold` | 5 a 50 € |
| E8 | 2028-01-31 | `fx_exchange`, `acc_bkt` | vende 1.000 EUR, compra 1.100 USD, tipos 1 y 1,10 |
| E9 | 2028-02-01 | `buy` `stock_us` | 10 acciones, `amount` 1.000 USD, comisión 1 USD, tipo 1,10 |
| E10 | 2028-02-10 | `buy` `coin_x`, `acc_bkt` | 1 a 1.000 € |
| E11 | 2028-03-01 | `sell` `fund_a`, `acc_mi` (reembolso) | 40 participaciones, `amount` 320 € |
| E12 | 2028-03-10 | `sell` `etc_gold` | 10 a 55 € |
| E13 | 2028-05-02 | `corporate_action` `reverse_split` `stock_eu` | `scale("1/4")` + `forced_sale` de 0,5 a 90 € en `acc_bkt` |
| E14 | 2028-05-11 | `buy` `etc_gold` | 5 a 52 € |
| E15 | 2028-06-01 | `buy` `fund_a` | 20 participaciones, `amount` 180 € |
| E16 | 2028-06-15 | `dividend` `stock_us` | bruto 20 USD, retención en origen 6 USD, España 0, tipo 1,25, `source_country: US`, `per_unit` 2 |
| E17 | 2028-07-03 | `swap` `coin_x` → `coin_y` | entrega 1, recibe 10, valor entregado 1.200 €, recibido 1.190 €, comisión 10 € |
| E18 | 2028-09-01 | `transfer` `fund_a` → `fund_b`, `acc_mi` | 80 → 160, `nav_out` 12, `nav_in` 6 (informativos), fechas valor 2028-09-01 |
| E19 | 2028-11-02 | `sell` `etc_gold` | 5 a 60 € |
| E20 | 2028-11-15 | `sell` `fund_b` (reembolso) | 150 participaciones, `amount` 900 €, `withholding` 31,35 € |
| E21 | 2028-12-01 | `sell` `stock_us` | 10 acciones, `amount` 1.300 USD, comisión 1 USD, tipo 1,20 |
| E22 | 2028-12-15 | `buy` `etc_gold` | 2 a 62 € |
| E23 | 2028-12-29 | `interest`, `acc_mi` | bruto 60 €, retención 11,40 € |
| E24 | 2028-12-29 | `standalone_fee`, `acc_ibkr` | 12 €, `fee_kind: custody` |
| E25 | 2028-12-29 | `valuation` de cada posición abierta | precios: **no deben mover nada** |

Los lotes se nombran por el evento que los abre: `L1`, `L2`, `L3`… `L18a` y `L18b` son los dos lotes que el traspaso E18 abre en `fund_b`.

---

### Ejercicio 2027

**E5 — venta de `stock_us`.** Consume `L2` entero (10 acciones).

- Coste (E2): (1.000 + 1) USD / 1,10 = 1.001 / 1,10 = **910,00 €** (#3: la comisión de compra suma).
- Transmisión: (800 − 1) USD / 1,25 = 799 / 1,25 = **639,20 €** (#3: la de venta resta).
- Resultado propio: 639,20 − 910,00 = **−270,80 €**. Nada liberado (`L2` no lleva diferimiento).
- Regla de recompra: pérdida → ventana `"2m"` de `stock_us`: **[2027-07-01, 2027-11-01]**. Adquisiciones de `stock_us`: E2 (2027-03-01) fuera; E9 (2028-02-01) fuera. **Nada diferido.**
- Computable: **−270,80 €**. Ganancia patrimonial.
- Criterios: #1, #2 (cotizados), #3, #4 (USD), #6, #14.

**E6 — interés**: rendimiento del capital mobiliario **+40,00 €**; retención **7,60 €**.

**Saldos**: ganancias y pérdidas **−270,80**; rendimientos **+40,00**.

**Compensación (#10, #22)**:

- Fase 1: ganancias negativas contra rendimientos positivos, hasta el 25 % de 40,00 = **10,00**. Ganancias: −270,80 + 10,00 = **−260,80**. Rendimientos: 40,00 − 10,00 = **30,00**.
- Fase 2: no hay pendientes anteriores.
- **Pendiente**: −260,80 de ganancias patrimoniales con origen 2027; caduca al cierre de **2031** (2027 + 4).
- **Base del ahorro 2027: 30,00 €.**
- Retenciones: **7,60 €**.

---

### Ejercicio 2028

#### Transmisiones, en orden

**E11 — reembolso de `fund_a`** (40 participaciones). Lotes abiertos: `L1` (100, 1.000 €, 2027-02-01). FIFO: 40 de `L1`.

- Coste: 1.000 × 40/100 = **400,00**. Transmisión: **320,00**. Propio: **−80,00**.
- Ventana `"1y"` (fondo): **[2027-03-01, 2029-03-01]**. Adquisiciones de `fund_a`: E1 (2027-02-01) fuera; **E15 (2028-06-01) dentro**, posterior, 20 participaciones sin usar.
- Disponibles: 20. Diferido: −80,00 × min(20, 40)/40 = **−40,00**, que llevará `L15` cuando se abra.
- Computable: −80,00 − (−40,00) = **−40,00**.
- Criterios: #1, #2 (fondos), #3, #6, #14.

**E12 — venta de 10 `etc_gold`**. Lotes: `L3` (10, 700 €, 2027-05-03), `L7` (5, 250 €, 2028-01-10). FIFO: `L3` entero.

- Coste **700,00**; transmisión 10 × 55 = **550,00**; propio **−150,00**.
- Ventana `"2m"`: **[2028-01-10, 2028-05-10]**. E3 (2027-05-03) fuera. **E7 (2028-01-10) dentro, justo en el borde** `d − 2m`, anterior: `L7` sigue abierto con 5 → disponibles 5. **E14 (2028-05-11) fuera por un día** (`d + 2m + 1`).
- Diferido: −150,00 × 5/10 = **−75,00**, a `L7`.
- Computable: **−75,00**.
- Criterios: #1, #2 (cotizados), #3, #6, #14, categoría ETC/ETP.

**E13 — contrasplit de `stock_eu`**. `L4` (10, 200 €) → `scale(1/4)` → 2,5 acciones, 200 €. Pico: 0,5 a 90 €.

- Transmisión 0,5 × 90 = **45,00**; coste 200 × 0,5/2,5 = **40,00**; propio **+5,00**. Sin regla (gana).
- `L4` queda con 2 acciones y 160 €.
- Computable: **+5,00**. Criterios: #3, #6 (una venta forzosa toma la fecha del evento, no la regla del #1).

**E17 — permuta `coin_x` → `coin_y`**. `L10` (1, 1.000 €).

- Valor (art. 37.1.h): el mayor de 1.200 y 1.190 = **1.200**. Transmisión: 1.200 − 10 = **1.190,00** (#17: la comisión resta de lo transmitido). Coste **1.000,00**. Propio **+190,00**.
- Abre `L17`: 10 `coin_y`, **1.200 €**, fecha 2028-07-03.
- Computable: **+190,00**. Criterios: #1, #3, #6, #17.

**E18 — traspaso `fund_a` → `fund_b`** (no es transmisión). Lotes de `fund_a`: `L1` (60, 600 €, 2027-02-01) y `L15` (20, 180 €, 2028-06-01, lleva **−40,00**).

- `L18a`: 160 × 60/80 = **120** participaciones, 600 €, fecha **2027-02-01**.
- `L18b`: 160 − 120 = **40** participaciones, 180 €, fecha **2028-06-01**, y **el diferimiento de −40,00 viaja con él** (#15).

**E19 — venta de 5 `etc_gold`**. Lotes: `L7` (5, 250 €, 2028-01-10, lleva −75,00), `L14` (5, 260 €, 2028-05-11). FIFO: `L7` entero.

- Coste **250,00**; transmisión 5 × 60 = **300,00**; propio **+50,00**.
- **Liberado**: `L7` se transmite entero → los **−75,00** de E12.
- Total: 50,00 − 75,00 = **−25,00** → pérdida (#21: lo liberado vuelve a pasar por la regla).
- Ventana `"2m"`: **[2028-09-02, 2029-01-02]**. E14 (2028-05-11) fuera. **E22 (2028-12-15) dentro**, posterior, 2 sin usar.
- Diferido: −25,00 × min(2, 5)/5 = **−10,00**, a `L22`.
- Computable: −25,00 − (−10,00) = **−15,00**.
- Criterios: #1, #2 (cotizados), #3, #6, #14, #21, categoría ETC/ETP.

**E20 — reembolso de 150 `fund_b`**. Lotes: `L18a` (120, 600 €), `L18b` (40, 180 €, lleva −40,00). FIFO: `L18a` entero y 30 de `L18b`.

- Coste: 600,00 + 180 × 30/40 = 600,00 + 135,00 = **735,00**. Transmisión **900,00**. Propio **+165,00**.
- **Liberado**: 30 de las 40 de `L18b` → −40,00 × 30/40 = **−30,00** (viajó por el traspaso: #15). Quedan en `L18b` 10 participaciones, 45 €, **−10,00**.
- Total: 165,00 − 30,00 = **+135,00**. Sin regla.
- Computable: **+135,00**. Retención **31,35 €** (#12).
- Criterios: #1, #2 (fondos), #3, #6, #14, #15.

**E21 — venta de `stock_us`**. `L9` (10, 910 €: 1.001 / 1,10).

- Transmisión: (1.300 − 1) / 1,20 = 1.299 / 1,20 = **1.082,50**. Propio **+172,50**.
- Computable: **+172,50**. Criterios: #1, #3, #4, #6.

#### Ganancias y pérdidas patrimoniales

| Transmisión | Propio | Liberado | Diferido | Computable |
|---|---|---|---|---|
| E11 | −80,00 | | −40,00 | −40,00 |
| E12 | −150,00 | | −75,00 | −75,00 |
| E13 | +5,00 | | | +5,00 |
| E17 | +190,00 | | | +190,00 |
| E19 | +50,00 | −75,00 | −10,00 | −15,00 |
| E20 | +165,00 | −30,00 | | +135,00 |
| E21 | +172,50 | | | +172,50 |
| **Total** | **+352,50** | **−105,00** | **−125,00** | **+372,50** |

Ganancias 502,50; pérdidas −130,00; **saldo +372,50**. Comprobación: 352,50 − 105,00 + 125,00 = 372,50.

#### Rendimientos del capital mobiliario

| Evento | Concepto | Importe |
|---|---|---|
| E16 | Dividendo: 20 USD / 1,25 | **+16,00** |
| E23 | Interés | **+60,00** |
| E24 | Custodia (art. 26.1.a, #23): 12 / 1 | **−12,00** |
| | **Saldo** | **+64,00** |

#### Compensación (#10, #22)

- Fase 1: los dos saldos son positivos. Nada.
- Fase 2: pendiente de 2027, **−260,80** de ganancias → contra el saldo positivo de ganancias, sin límite: 372,50 − 260,80 = **111,70**. Pendiente de 2027: **0**.
- **Base del ahorro 2028: 111,70 + 64,00 = 175,70 €.** Nada pendiente para 2029.

#### Regla de recompra: el año en tres cifras

- Diferido en 2028: −40,00 (E11) − 75,00 (E12) − 10,00 (E19) = **−125,00**.
- Liberado en 2028: −75,00 (en E19, de E12) − 30,00 (en E20, de E11) = **−105,00**.
- **Pendiente a 31/12/2028: −20,00** = −10,00 en `L18b` (origen E11, ha viajado: #15) + −10,00 en `L22` (origen E19).
- Conservación: −125,00 = −105,00 + −20,00.
- Provisionalidad: la ventana de E19 cierra el **2029-01-02**. Con fecha de consulta anterior, E19 es **provisional**; con fecha de consulta el 2029-01-03 o después, no.

#### Retenciones a cuenta

E20: **31,35**; E23: **11,40**; E16: 0 en España. **Total: 42,75 €.** Se restan de una cuota que este motor no calcula.

#### Doble imposición (E16, #16)

- Impuesto satisfecho en origen: 6 USD / 1,25 = **4,80 €**.
- Límite del convenio (EE. UU., 15 %): 15 % × 16,00 = **2,40 €**.
- Primer límite: **2,40 €**. Los otros **2,40 €** no son deducibles en España (se reclaman en origen).
- El segundo límite (tipo medio efectivo × 16,00) **no es calculable** sin la base liquidable completa.

#### Lo que la salida dice que no calcula

La cuota; el segundo límite de la doble imposición; las diferencias de cambio del efectivo, **con E8 en la lista**; ninguna renta en especie (no hay `grant`).

---

### Criterios dudosos de 2028 y el dinero en juego

#### #2 cotizados (en disputa, agresivo) — recálculo con `"1y"` para `stock`, `etf`, `etc`, `etp`

Hay que recalcular **los dos ejercicios**, porque la otra lectura alcanza también a E5.

**2027 con `"1y"`.** E5: ventana [2026-09-01, 2028-09-01]. E2 está dentro, pero `L2` lo consume la propia E5 (**#18**: no cuenta). **E9 (2028-02-01) dentro**, posterior, 10 → diferido −270,80 × 10/10 = **−270,80**, a `L9`. Computable 0. Ganancias 0, rendimientos 40,00, sin compensación. **Base 2027: 40,00** (+10,00). Nada pendiente.

**2028 con `"1y"`.**

- E11: igual, **−40,00** (el fondo ya tenía un año).
- E12: ventana [2027-03-10, 2029-03-10]. E3 dentro, pero `L3` lo consume la propia E12 (**#18**). E7: 60 días, `L7` 5 disponibles. E14: 62 días, posterior, 5. E22: 280 días, posterior, 2. Por cercanía: E7 (5) + E14 (5) = 10 → diferido **−150,00**: −75,00 a `L7` y −75,00 a `L14`. Computable **0**.
- E13: **+5,00**. E17: **+190,00**.
- E19: consume `L7` → propio +50,00, liberado −75,00, total −25,00. Ventana [2027-11-02, 2029-11-02]: E7 consumido por E19 (**#18**), E14 dentro pero sus 5 ya las usó E12 (**#19**), E22 2 disponibles → diferido **−10,00** a `L22`. Computable **−15,00**.
- E20: igual, **+135,00**.
- E21: consume `L9`, que lleva −270,80 → propio +172,50, liberado −270,80, total **−98,30**. Ventana [2027-12-01, 2029-12-01]: E9 consumido por E21 (**#18**), E2 fuera. Computable **−98,30**.
- Ganancias: −40,00 + 0 + 5,00 + 190,00 − 15,00 + 135,00 − 98,30 = **176,70**. Rendimientos 64,00. Sin pendientes.
- **Base 2028: 240,70**.

**Dinero en juego del #2 en 2028: +65,00** de base (240,70 − 175,70), más **+10,00** en 2027. Pendiente de compensar a 31/12/2028: 0 en los dos casos. Diferido pendiente a 31/12/2028: −20,00 frente a −95,00 (−75,00 más en `L14`). **Dirección: agresiva** (la lectura alternativa da más base). Mercados afectados: `XETR` (E12, E19) y `XNAS` (E5, a través de E21).

#### #4 método de la ganancia en divisa (en disputa) — diferencia calculada

E21, calculando primero en dólares: (1.299 − 1.001) USD / 1,20 = 298 / 1,20 = 248,333… → **248,33**. Frente a +172,50: **+75,83**. **Agresiva.** (En 2027, E5: (799 − 1.001) / 1,25 = −161,60 frente a −270,80: +109,20, también agresiva; figura en el informe de 2027.)

#### #4 diferencias de cambio del efectivo (en disputa) — no calculado

E8 listado. Sin importe.

#### #15 (en disputa, conservador) — exposición

Liberado tras viajar: 30,00 (E20). Pendiente tras viajar: 10,00 (`L18b`). **Exposición 40,00. Conservadora.**

#### #17 (media, agresivo en el momento) — la comisión

E17: **10,00 €. Agresiva.**

#### #21 (baja, conservador) — diferencia calculada

E19: con la lectura alternativa (la regla solo mira el resultado propio, +50,00), no habría diferimiento y el computable sería −25,00. Diferencia: **−10,00** de base. **Conservadora.**

#### Sin efecto este año (una línea cada uno)

- **#1** (media): con la regla invertida la base no se mueve (**0,00**): en este libro contratación y valor coinciden.
- **Categoría ETC/ETP**: con `etc` como rendimiento del capital mobiliario, E12 (−75,00) y E19 (−15,00) pasan a rendimientos: ganancias 462,50, rendimientos 64,00 − 90,00 = −26,00. Fase 1: −26,00 contra el 25 % de 462,50 = 115,625 → **115,63**; se compensan 26,00 → ganancias 436,50. Fase 2: −260,80 → **175,70**. Diferencia **0,00**.
- **#22** (media): un solo ejercicio de origen y ningún límite del 25 % en juego: **0,00**.

No aparecen por no tocar ninguna cifra: #2b (ningún traspaso entrante causa un diferimiento), #2 cripto (ninguna pérdida de cripto), #5, #7, #8, #13, #18, #19 y #20 (en la lectura vigente; #18 y #19 sí aparecen **dentro** del recálculo del #2). El #23 tiene certeza alta: no es dudoso, aunque su cifra (−12,00) lleve el criterio.

---

### Contraste con el motor

`packages/domain/test/tax/exercise.test.ts` construye este libro evento a evento (`exercise-ledger.ts`) y compara con literales copiados de esta sección, no de la salida del motor. **Todas las cifras coinciden a la primera ejecución, al céntimo**: las siete transmisiones de 2028 (propio, liberado, diferido y computable), los totales (502,50 / −130,00 / +372,50), los rendimientos (16,00 + 60,00 − 12,00), la compensación de 2027 (10,00 en fase 1, −260,80 pendiente hasta 2031) y la de 2028 (260,80 en fase 2, base **175,70**), el diferimiento del año (−125,00 / −105,00 / −20,00), las retenciones (42,75), la doble imposición (4,80 → 2,40 + 2,40) y el dinero en juego de los dudosos (+65,00, +75,83, 40,00, 10,00, −10,00, y los ceros del #1, la categoría del ETC y el #22).

Tres discrepancias, **ninguna en una cifra**:

1. **El orden de los criterios.** La primera ejecución dio las listas de criterios con `"2:listed"` y `"2:fund"` al final. Error del motor, no del cálculo: `Object.keys` pone primero las claves numéricas de un objeto. Corregido: el catálogo declara su orden explícitamente (`CRITERION_IDS`).
2. **Qué operaciones nombra el #2.** El motor nombraba solo E12 y E19, las que aplican la ventana; este cálculo a mano decía que el #2 afecta también a E21 (mercado `XNAS`), porque con un año la pérdida de E5 de 2027 se habría diferido y liberado en ella. **Tenía razón el cálculo a mano**: una cifra que cambia con la lectura alternativa depende del criterio aunque no lo aplique ella misma. Corregido: el apartado de dudosos nombra también las operaciones cuya cifra cambia al recalcular (E12, E19, E21; mercados `XETR` y `XNAS`).
3. **El #2b en otro test** (no en este ejercicio): esperaba una diferencia de base de −100 al no contar un traspaso entrante como adquisición, y el motor dio 0. **Tenía razón el motor**: sin diferimiento la pérdida se computa, pero la base del ejercicio es cero en las dos lecturas y lo que cambia es la pérdida pendiente de compensar (−100) y el diferimiento pendiente (+100). El test estaba mal escrito y se corrigió; la dirección sigue saliendo «conservadora» por lo pendiente.

---

## Notas de implementación (2026-09-18)

Lo que apareció al construir y que la dirección tiene que saber. Numeradas a continuación de N1–N6.

- **N7 — Un bloqueo abierto: el presupuesto del paquete de la web.** `npm run build` falla en `apps/web/scripts/check-bundle.mjs`: **167,2 KB gzip** frente a un techo de **166,0**. `develop` ya estaba a 165,6 (0,4 KB de margen). El motor fiscal entero **no** llega a la web (lo comprobé en el paquete construido, y un commit marca como puras las dos llamadas a nivel de módulo que arrastraban el catálogo de criterios). Lo que crece es lo que la web **sí** usa o el test anti-deriva **exige**: el diario de lotes y la validación nueva de `Settings` en el dominio (~0,6 KB) y las traducciones de los códigos nuevos (~1,0 KB entre `errors.ts` y `warnings.ts`). El arranque sigue dentro: 77,3 KB de 80. **No lo he tocado**: es `apps/web` fuera de los catálogos, y la dirección pidió que se le avisara antes. Propuesta, con el mismo patrón que usó la 008: subir el techo de 166 a **168** con este motivo escrito en el script — *«Movido de 166 a 168 por la feature 009: el diario de lotes de la proyección, tres parámetros fiscales nuevos con su validación y las traducciones de dieciséis códigos del motor fiscal que el test anti-deriva exige en las dos interfaces. El motor fiscal no entra en el paquete. El arranque: 77,3 KB de 80.»* Alternativa: cargar perezosamente las traducciones de los avisos fiscales, que la web no enseña hasta la 010; es trabajo del agente de la web.
- **N8 — La tabla de `docs/fiscal-questions.md` está partida.** La nota al criterio 16 está escrita **entre** las filas 16 y 17: en Markdown eso termina la tabla, y las filas 17 a 23 dejan de verse como tabla en GitHub. El test anti-deriva las lee igualmente (recorre la sección entera), pero un lector humano no. Basta con mover la nota debajo de la tabla.
- **N9 — Donde el documento da dos certezas, el catálogo guarda la más dudosa.** #21 «Media-baja» → `low`; #22 «Alta (orden) / Media (redondeo)» → `medium`. Una cifra nunca se presenta más firme que la parte más débil de lo que la sostiene. El test lo comprueba así: cada certeza del código tiene que estar en el documento, y la más dudosa del documento tiene que estar en el código. #22 tiene riesgo **neutro**, un valor que el catálogo no tenía y que ahora tiene (`neutral`).
- **N10 — Mi lectura en el #2: los fondos tienen certeza alta.** La fila del #2 da certeza a los cotizados de fuera de la UE (en disputa) y a la cripto (baja), y calla sobre el año de los fondos (letra g del art. 33.5). El catálogo lo trata como `high` y el test lo lista como silencio del documento, con su motivo. Si la dirección lo escribe en la fila, el test dejará de necesitar la excepción.
- **N11 — Los diez avisos de recompra de `ast_world` que no difieren nada.** Con el #19, la pérdida de −90,82 de 2027 la cubren la compra del 2027-01-03 y parte de la del 2027-02-05, las más cercanas; las compras de marzo a enero de 2028 llegan con la pérdida ya cubierta y el motor no les asigna nada, pero el aviso de recompra sigue saliendo en cada una. El aviso vive en la proyección y no puede saber lo que el motor reparte después sin repetir su recorrido. Por eso el texto dice «**puede** hacer que esa pérdida no sea computable» y remite a `atlas tax`. Para que dejen de salir habría que mover el reparto a la proyección o generar los avisos desde el motor: es una decisión de diseño que no he tomado en el último commit (predicción, `warnings-expectation.md`).
- **N12 — `normalizeSettings` materializa ahora tres parámetros más** (`wash_sale_transfer_counts`, `savings_offset_limit_pct`, `loss_carryforward_years`), por ADR-0022: el siguiente `settings_changed` que escriban **la CLI o la web** los incluirá. La web cambia lo que escribe sin tocar su código. No mueve ninguna cifra.
- **N13 — `wash_sale_transfer_counts` sigue sin *flag* en la CLI** (viene de la PR #40). No lo he añadido: nadie lo pidió. El motor calcula igualmente qué pasaría con el otro valor (apartado de dudosos, #2b).
- **N14 — Ficheros de `apps/web` tocados fuera de los catálogos: solo tests.** `test/format.test.ts` (los dos códigos nuevos de configuración) y `test/screens.test.tsx`: la prueba de privacidad de los avisos vendía entera la compra que el aviso nombraba, y con el #18 ese aviso ya no existe; ahora vende 10 de 10,5 y sigue probando lo mismo.
- **N15 — `tax_year_unsupported` y los libros anteriores a 2018.** Un libro con cualquier cifra fiscal anterior a 2018 no da informe de ningún año (A13); `movedTaxYears` devuelve vacío en ese caso para no romper `atlas settings set`.
- **N16 — Documentos que la dirección querrá actualizar** (no he tocado `docs/`): `data-schema.md` §6.1 y `business-rules.md` §7 (los tres parámetros nuevos de `Settings`); `data-schema.md` §7 (el diario de lotes, fuera de la instantánea; `realizedGains` sigue sin diferimientos y es `taxYear` quien los aplica) y §8.4 (las reglas #18–#21 y que el aviso previo solo nombra lo que sigue en cartera); los detalles de los dos avisos de recompra (`tax_year`, `buy_date`, `sale_date`, y `quantity` como cantidad de la compra); el contrato de `atlas tax`.

### El *golden* del libro, en el commit final

Exactamente la predicción de `warnings-expectation.md`: solo se mueve `warnings`, de **21 a 18**; desaparecen los tres avisos previstos, los otros cinco de compra previa ganan `sale_date` y `tax_year`, y los doce de recompra ganan `buy_date` y `tax_year` y cambian `quantity` a la de la compra (la de `ast_delta` con fecha de contratación 2027-12-20, como estaba previsto). El informe fiscal del libro sintético (`synthetic-v1.tax.json`) no se movió. Hasta ese commit, la instantánea del libro fue **idéntica byte a byte** a la de `develop`.

## Las dos revisiones: fiscal y de calidad (2026-09-18 y 19)

Todo lo que pidieron las dos tandas está en la rama, en commits atómicos, salvo **una cosa que espera decisión** (N17). Numeradas a continuación de N16.

- **N17 — La cantidad del aviso de compra previa tras un contrasplit (tanda fiscal, punto 7a): opción (a), decidida por la dirección.** El aviso citaba lo **comprado**, en las unidades del día de la compra: tras un contrasplit 1:4 decía «2 títulos» cuando quedan 0,5, y tras una venta que consumió parte de la compra decía que seguía en cartera lo que ya no estaba. Ahora cita **lo que de esa compra sigue en cartera**, en las unidades de hoy (la suma de sus lotes abiertos), y la frase dice «cuando siguen en cartera N títulos de una compra del D». Una compra anotada una vez por cuenta (un `grant` con coste en dos cuentas) se nombra una sola vez. Predicción en `held-quantity-expectation.md`, comiteada antes. Al regenerar, la instantánea movió exactamente la línea prevista: `buy_quantity` de la compra de `ast_world` del 2026-09-04, de 6.3526 a 0.0551. La instantánea no guarda el mensaje. **Y la clave lo dice:** una misma `buy_quantity` que fuera «lo comprado» en un aviso y «lo que queda» en el otro sería la trampa de `quantity` otra vez, así que, por decisión de la dirección, en `wash_sale_window_prior_buy` se llama `held_quantity`; en `wash_sale_window_repurchase` sigue siendo `buy_quantity`, lo comprado. Predicción en `held-quantity-rename-expectation.md`, comiteada antes; la instantánea movió exactamente las cinco claves de esos avisos, con su valor.
- **N18 — El informe fiscal del libro sintético (`synthetic-v1.tax.json`) se movió en 2027, y solo en 2027.** El libro sintético no se movió, y su instantánea de la proyección solo lo hizo en N24, con permiso y predicción. Tres de los arreglos pedidos mueven el informe porque el libro contiene justo esos casos:
  - la venta en efectivo de `ast_beta_new` tras la conversión (`01N428YK78ARMXKW9TRZB7XV2D`) gana el criterio **13** y un dudoso #13 de exposición **1,41** (conservador), antes del #13 por régimen no registrado (punto 3);
  - el dudoso **2:listed** pasa de «diferido −7,52» a **−84,17**: con la lectura de un año, lo que espera una recompra del año siguiente ahora cuenta como pendiente (punto 2); ya cuadra con su diferencia de base de +84,16;
  - el dudoso **#18** pasa de 87,60 (agresivo) a **0**, dirección «ninguna», con el motivo `no_carrier_left` (decisión sobre el #18).
  Ninguna base, compensación ni cifra de operación cambia, y los años 2026, 2028 y 2029 son idénticos.
- **N19 — El #22 lo corregí dos veces.** En la tanda fiscal (punto 4) dejé de contar como competencia dos pasos de un mismo ejercicio. El libro calculado a mano de la tanda de calidad destapó que me había pasado: en 2023, 2020 y 2022 compiten por un saldo que no llega para los dos, 2020 se lo lleva entero **y 2022 no aparece en ningún paso**, así que mi condición (ejercicios de los pasos) decía 0. Ahora un ejercicio que el orden deja sin nada también compite: 339,75 en 2023 y 7,50 en 2024, y sigue siendo 0 en el caso del revisor (2021, solo 2020).
- **N20 — El #7 y el #13 aparecen dos veces en 2027, y es correcto** (punto 11 de calidad). El documento da al #7 dos riesgos: el **reparto del coste** en una escisión (en disputa; su exposición es el coste de los lotes que se vendieron con ese reparto, 167,57) y el **régimen de neutralidad** («agresivo si la escisión no está amparada»; su exposición es el coste de los lotes que creó el evento sin régimen escrito, 39,90, con el motivo `regime_not_recorded`). Son dos preguntas distintas con dos medidas distintas; el motivo las distingue en la CLI. El #13 igual: el efectivo del canje (1,41) y el canje sin régimen (320,53).
- **N21 — Una unidad recomprada puede prestar unas milmillonésimas de más.** La propiedad «cada unidad difiere una vez» encontró, con el generador ampliado (una venta forzosa en dos cuentas), 25,607 títulos comprados y **25,6070000006** prestados a dos pérdidas. La parte usada de un lote se guarda como fracción redondeada a diez decimales (ADR-0005) y se vuelve a multiplicar por lo que queda. En euros son millonésimas de céntimo: el redondeo por operación no lo ve nunca. El test lo admite con una tolerancia relativa de 10⁻⁹ y lo dice. Si la dirección lo quiere exacto, hay que guardar la parte usada como pareja de cantidades en lugar de fracción; no lo he hecho.
- **N22 — El #4 como exposición era un importe con signo.** Con un lote comprado en otra divisa, la exposición del #4 sumaba los resultados tal cual: una pérdida la restaba. Ahora suma valores absolutos, como las demás exposiciones (lo encontró el test del mutante N20).
- **N23 — Mismo ISIN en dos activos.** Se rechaza al registrar (`asset_created` y `asset_updated` que cambie el ISIN), en cualquier libro, con el activo que hay que usar; un libro ya escrito lo dice `integrity` (`duplicate_isin`, error) y el informe fiscal (`tax_duplicate_isin`). No es validación de carga. En la web, el error nombra el activo por su nombre; el ISIN va tal cual.
- **N24 — `details.quantity` de los dos avisos de recompra se llama ahora `buy_quantity`** (punto 13 de calidad). Predicción en `buy-quantity-expectation.md`, escrita y comiteada antes; al regenerar, la instantánea se movió exactamente eso: 17 claves renombradas con el mismo valor. El test de privacidad de la web trata ya como cifra cualquier detalle terminado en `_quantity`. Para N16: los detalles de los avisos son `tax_year`, `buy_date`, `sale_date` y, según el aviso, `buy_quantity` (recompra: lo comprado) o `held_quantity` (compra previa: lo que de ella sigue en cartera, N17).
- **N25 — Lo que la CLI decidía por su cuenta.** Las estrellas de los criterios dudosos usaban `certainty === "high"` en dos sitios; ahora usan `isDoubtful` del dominio.
- **N26 — Los campos de los rechazos.** Además del `nav_in` de un traspaso que pidió el revisor, un `invalid_field` de `fx_exchange` (divisas iguales) y el de `value_date` anterior a `trade_date` tampoco decían su campo: la CLI habría escrito «El campo undefined». Los tres lo dicen ya.
- **N27 — El paquete de la web, rebasado sobre la ronda de defectos (PR #59).** El commit que subía el techo a 168 sobraba sobre la base nueva (su techo ya es 177) y lo quité del rebase. Medido sobre esa base: **178,6 KB** en total y **72,6 KB** de arranque (de 80). Subí el techo de 177 a **179**, con el motivo escrito en `check-bundle.mjs`: el diario de lotes, los tres parámetros fiscales nuevos, el rechazo del ISIN duplicado y las traducciones de los códigos del motor.
- **N28 — Los mutantes que sobrevivieron, otra vez contra el código final: mueren los 21.** Reescritos donde el código cambió (M08 es ahora devolver `>=` a `>`; K03 quita `isDoubtful`; N20 tiene un gemelo, N20b, que quita el valor absoluto). Qué test mata cada uno:

  | Mutante | Qué rompe | Lo mata |
  |---|---|---|
  | M08 | la pérdida deja de ser provisional el último día de su ventana | `wash-sale.test.ts` «marks as provisional…» (el borde del 2028-02-01) |
  | M17 | una unidad recomprada antes presta dos veces (#19) | `wash-sale.test.ts` «#19: a repurchase bought before two losses…» y la propiedad «lends each repurchased unit to one deferral only» |
  | M33 | la comisión deducible al tipo de otro evento en la misma divisa | `hand-checked.test.ts` 2024 y `tax-figures.test.ts` 2024 (12,50 USD a 1,25) |
  | M85 | `movedTaxYears` ignora el último ejercicio cerrado | `moved-years.test.ts` «sees the last closed year» |
  | N05 | #17 en una permuta sin comisión | `lines.test.ts` «a swap valued at what was received…» |
  | N12 | lo que viajó se hereda otra vez en una escisión | `wash-sale.test.ts` «a partial transfer then a spin-off of the origin…» |
  | N20, N20b | la exposición del #4, a cero o con signo | `year.test.ts` «#4: the currency-first method is an exposure…» (+100 y −100: 200) |
  | N22 | la exposición del #13 con signo | `year.test.ts` «puts the cash of an exchange at a loss at stake as an absolute amount (#13)» |
  | N26 | la nota de ventana abierta sin lo que libera | `wash-sale.test.ts` «gives the open window the whole loss at stake…» |
  | N27 | los gastos de otros ejercicios | `lines.test.ts` «lists the deductible fees in date order…» |
  | N29 | la renta en especie de otros ejercicios | `year.test.ts` «records a fork's income without integrating it (#8)…» |
  | K01–K09 | la consola: base, computable, estrellas, dirección, caducidad, total de retenciones, deducible, dinero en juego, ganancias y pérdidas | `apps/cli/test/commands/tax-figures.test.ts` (K01 lo matan los cuatro años; K04 y K07, 2021; K05, 2024) |
- **N29 — Mis mensajes de la web, al estilo de la ronda de defectos.** Fechas con `day` (dd/mm/aaaa), años y códigos con `num`, tipos y clases con `enumValue`, sin identificadores. El aviso de parámetros tomados del código dice cuántos son en lugar de listar sus claves internas; la CLI los sigue nombrando. En `no-jargon.test.tsx` añadí dos casos al generador de detalles: `existing_asset_id` es un activo, como `asset_id`, y no una lista de eventos; e `isin` es un código público que el usuario escribió, no un identificador de la aplicación.


## Tercera tanda: lo que encontró el verificador (2026-09-19)

- **N30 — El ISIN se comprueba contra el catálogo vigente.** Antes se comprobaba contra las líneas crudas del libro, con los eventos anulados dentro. El resultado era un rechazo falso al rehacer el alta anulada de un activo, que es el camino natural porque `asset_updated` no deja cambiar ni el tipo ni la divisa, y una aceptación falsa cuando se anulaba un cambio de ISIN. Ahora se mira el catálogo proyectado del libro candidato. El catálogo anterior solo se proyecta si hay choque, para distinguir una actualización que conserva su ISIN. `correctEvent` hace la misma comprobación. El ISIN se compara en mayúsculas y sin espacios, y así lo agrupan también el hallazgo `duplicate_isin` de `integrity` y la nota `tax_duplicate_isin` (`projections/isin.ts`). No se tocó ningún *fixture*.
- **N31 — Un split entre la venta con pérdida y la recompra ya no excluye la recompra.** Sustituye a mi decisión A12. El diario de lotes guarda en cada `scale` la razón exacta del evento, y el motor convierte lo comprado después a las unidades de la venta: 20 títulos tras un 2:1 son 10 de antes. Con la razón siempre en el diario, la conversión siempre se puede hacer; no queda caso que mandar a dudosos. Una división no exacta, como un 3:1 sobre un número que no es múltiplo de 3, se redondea a diez decimales, como cualquier reparto (ADR-0005). Lo asignado y lo usado por el #19 se guardan en las unidades de la propia compra. En el informe, lo diferido va en unidades de la venta y la adquisición en las suyas. Desaparecen `scale_excluded` y la nota `tax_scale_in_window`, con sus traducciones. Tests: el caso del verificador, una recompra mayor de lo necesario, un split 3:1, un contrasplit 1:4 y un split anterior a la venta que no cambia nada. Predicción en `split-conversion-expectation.md`: no se mueve ningún *fixture*, y no se movió.
- **N32 — Las opciones booleanas ya no se comen la palabra siguiente.** `atlas --json tax 2027` y `atlas --yes asset add …`, el orden que sugiere la línea de uso, leían el comando como valor de la opción. El analizador conoce las opciones que nunca llevan valor (`BOOLEAN_FLAGS`, las globales y las de cada comando). Un test lee las fuentes de la CLI y falla si algún `booleanFlag` no está en esa lista. Hay tests de las opciones globales delante y detrás del comando, en el analizador y de punta a punta.

## Cuarta tanda (2026-09-19)

- **N33 — Una opción booleana seguida de una palabra ya no registra lo contrario de lo escrito.** Mi arreglo de N32 dejaba la palabra suelta y ningún comando la rechazaba. Así, `--neutrality-regime false` registraba `neutrality_regime: true`, y `--transferable false` registraba `true`. Ahora pasan dos cosas:
  - Una opción booleana seguida de `true`, `false`, `sí`, `si`, `no`, `0` o `1` (sin distinguir mayúsculas) es un error que explica cómo se escribe. Si la opción tiene su contraria, la nombra: «pon --neutrality-regime para sí y --no-neutrality-regime para no». Si no la tiene: «pon --json para sí; omítela para no».
  - Cada comando declara cuántas palabras lee (`ARITY` en `apps/cli/src/main.ts`, por subcomando cuando los tiene), y la primera que sobra se rechaza por su nombre antes de registrar nada. Un test obliga a que todo comando tenga su entrada.
  `atlas --json tax 2027` y `atlas --yes asset add …` siguen funcionando.
- **N34 — El mutante X5 muere.** Es el que usa solo el primero de varios splits entre la pérdida y la recompra. Lo mata el caso del verificador, calculado a mano, como test: 3:2 y 1:4, −600 aplazado entero, −50 aplazado y −700 computable en la segunda venta, −650 liberados al final y −1.350 en el año. Con el mutante, el primer aplazamiento cae a −160.
- **N35 — Un split de un activo que nadie tiene ya se puede registrar.** Solo si el evento no tiene más efectos que `scale`: no transforma nada, pero deja en el diario una entrada `units` con la razón, y el motor la usa para convertir como en N31. Relaja una validación, así que los libros ya escritos siguen siendo válidos. No se movió ningún *fixture*: ninguno tenía un evento así, porque habría sido inválido. El generador aleatorio ya produce splits sin posición, y la propiedad del diario comprueba que un `units` lleva la razón del evento y que no hay lotes abiertos del activo en ese momento.
- **N36 — En un libro con eventos inválidos, el ISIN repetido da su propio error.** El catálogo de antes se proyectaba en modo estricto, así que respondía el evento inválido (`insufficient_position`) en lugar del `duplicate_isin`. Ahora se proyecta recogiendo errores, tanto al registrar como al corregir.

## Quinta tanda: el criterio #24 del documento (2026-09-22)

- **N37 — La pregunta de los ETC y los ETP ya tiene número, y el catálogo lo sigue.** La PR #60 añadió la fila #24 (certeza alta para el ETC, media para el ETP; riesgo conservador), y mi test anti-deriva lo cazó: «#24: missing in the catalogue». La entrada `etc_etp_category` se parte en cuatro variantes, no en dos, porque el catálogo guarda la certeza y el riesgo por identificador y las dos cosas dependen de la lectura aplicada, igual que con la ventana efectiva del #2:
  - `24:etc` (alta, conservador) y `24:etp` (media, conservador) cuando `income_category` dice rendimiento del capital mobiliario, que es lo que dice el documento; con eso el ETC deja de ser dudoso y el ETP sigue siéndolo;
  - `24:etc_gain` y `24:etp_gain` (media, agresivo) cuando dice ganancia patrimonial, lo contrario del documento: una pérdida compensaría al 100 % lo que la lectura documentada limita al 25 %.
  El riesgo agresivo no está en la fila, así que esas dos variantes se eximen **solo en el riesgo**, con su motivo, como ya hacían `2:listed_1y`, `2:crypto` y `2:other`. `NOT_IN_THE_TABLE` desaparece: el catálogo ya no tiene nada fuera de la tabla. La lectura alternativa se calcula por tipo de activo, en lugar de dar la vuelta a los dos a la vez, para que cada variante diga lo suyo.
- **N38 — El valor por defecto no se ha tocado.** `income_category` sigue siendo ganancia patrimonial para los dos; lo cambia el bloque 0 de la feature 010, que tiene su propia predicción. Por eso, con la configuración de hoy, el libro sintético etiqueta `24:etc_gain`, dudoso y agresivo, que es lo correcto mientras esa sea la lectura aplicada.
- **N39 — El *golden* se movió lo previsto y nada más** (`etc-etp-criterion-expectation.md`): en 2027, el criterio de las dos líneas del contrasplit de `ast_gold` y tres campos de su dudoso (`criterion`, `certainty` de `disputed` a `medium` y `documented_risk` de `both` a `aggressive`). Las cifras no cambian, no aparece ningún dudoso del ETP porque no hay ninguna transmisión suya, y `synthetic-v1.jsonl`, su instantánea y el libro calculado a mano siguen igual.
