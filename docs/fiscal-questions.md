# Criterios fiscales aplicados, y lo que sigue en duda

Todo lo que los documentos marcan como *verificar*, consolidado. Cada respuesta se traduce en un valor de `Settings` o en una nota de `business-rules.md`.

> **Quién ha decidido esto y con qué valor.** El usuario **no tiene asesor fiscal**. Los criterios de abajo los fijó la dirección del proyecto el 2026-09-18 con su mejor lectura de la normativa española. **No es asesoramiento fiscal.**
>
> **Revisión adversarial del 2026-09-18.** Una segunda lectura independiente contrastó los criterios **entonces vigentes —del #1 al #16—** contra el texto de la LIRPF, el manual práctico de IRPF y las FAQ del Modelo 720 de la AEAT, y contra el código ya escrito. **Encontró tres criterios incorrectos, seis matizables y siete correctos**, más diez datos que el libro no guarda y que harán falta. Los criterios **del #17 en adelante se añadieron después y no pasaron por ella**; la tabla crece, el alcance de esta revisión no. Lo relevante de esa revisión está incorporado abajo; los hallazgos que dependen de interpretar la norma quedan marcados como **en disputa**, no resueltos, porque resolverlos sería sustituir una lectura no verificada por otra.
>
> **Corrección importante.** La versión anterior de este documento afirmaba que los criterios dudosos eran *todos conservadores*: que si estaban equivocados, el error habría sido pagar de más y nunca al revés. **Eso era falso y se retira.** Hay al menos dos criterios dudosos que van en dirección agresiva —declarar de menos o deducir de más—, que es la dirección que tiene consecuencias frente a la Agencia Tributaria. Están señalados uno por uno.
>
> Fecha de referencia de la normativa: septiembre de 2026.

| Grado | Qué significa |
|---|---|
| **Alta** | Hay artículo o regla expresa y su lectura no es controvertida |
| **Media** | Hay norma o doctrina aplicable, pero requiere interpretación o hay criterios discrepantes |
| **Baja** | No hay norma específica; el criterio elegido es el prudente y hay que revisarlo si la cifra crece |
| **En disputa** | La revisión del 2026-09-18 aporta un argumento de peso en contra. **Sin resolver**: requiere revisión profesional antes de que mueva una cantidad que importe |

**Dirección del riesgo**, que es lo que de verdad hay que mirar:

| | Qué significa si el criterio está mal |
|---|---|
| **Conservador** | Se paga de más o se deduce de menos. Cuesta dinero, no tiene consecuencias sancionadoras |
| **Agresivo** | Se declara de menos o se deduce de más. **Es la dirección con consecuencias** |
| **Ambas** | Puede fallar en los dos sentidos según el caso |

---

## Los criterios

| # | Pregunta | Criterio aplicado | Fundamento | Certeza | Riesgo |
|---|---|---|---|---|---|
| 1 | Fecha de la alteración patrimonial | **Cotizados: fecha de contratación. Fondos: fecha valor**. Es el valor por defecto de `fiscal_date_rule` | La alteración se produce al perfeccionarse la transmisión; en un fondo, el reembolso al valor liquidativo aplicable | Media | Conservador |
| 2 | Plazo de la regla de recompra | **Dos meses** para valores admitidos a negociación; **un año** para los no admitidos, entre ellos los fondos. Para cripto, **un año** por prudencia | Art. 33.5.f) y g) LIRPF. Para cripto no hay norma expresa | **En disputa** (valores no UE) / Baja (cripto) | **Agresivo** para lo cotizado fuera de la UE |
| 2b | ¿Un **traspaso entrante** cuenta como adquisición? | **Sí** (`wash_sale_transfer_counts`, por defecto `true`). Unas acciones liberadas (`scale`) y un `grant` a coste cero **no**. Un traspaso de custodia (mismo activo, otra cuenta) tampoco | Es una adquisición de valores homogéneos aunque no tribute en origen (art. 94 LIRPF). Contar difiere la pérdida, que es lo prudente | Media | Conservador |
| 3 | Comisiones en la base | La de **compra suma** al valor de adquisición; la de **venta resta** del de transmisión. Las de **custodia, administración o conectividad no entran en la ganancia patrimonial** | Art. 35 LIRPF: gastos **inherentes** a la adquisición o a la transmisión | Alta **pero incompleto** | Conservador |
| 4 | Diferencias de cambio del efectivo en divisa | **Ganancia o pérdida patrimonial** al convertir a euros o cambiar por otra divisa. Imputación **FIFO por divisa** | La moneda extranjera es un elemento patrimonial; el FIFO por analogía con el art. 37.2 | **En disputa** | **Ambas** |
| 5 | Días sin publicación del BCE | **El último tipo publicado anterior**, guardando su fecha (`fx_rate_date`) | Práctica habitual y reproducible desde la tabla oficial | Media | Conservador |
| 6 | Redondeo a céntimos | **Half-up, una vez por operación**, nunca por lote | Convención contable ordinaria; la norma no impone método | Alta | Conservador |
| 7 | Reparto del coste en una escisión | **La proporción que publique el emisor**; si no publica, valores de mercado del primer día de cotización separada | Es el criterio que sostiene la sociedad y el que la administración puede contrastar | **En disputa** | **Agresivo** si la escisión no está amparada por el régimen de neutralidad |
| 8 | Fork o airdrop de cripto | **Coste de adquisición cero y fecha del fork**, sin declarar nada en el ejercicio de recepción | Sin norma específica en la ley | **En disputa** | **Agresivo** |
| 9 | Pérdida por liquidación de una sociedad | Computable **cuando la sociedad se disuelve y se liquida**. **Una exclusión de cotización no basta** | Art. 37.1.e) LIRPF | Alta | Conservador |
| 10 | Compensación de pérdidas con rendimientos del capital mobiliario | Hasta el **25 %** del saldo positivo, **en los dos sentidos**. El remanente se arrastra **cuatro ejercicios**, y **compensar el máximo posible cada año es obligatorio** | Art. 49 LIRPF; el 25 % rige **desde 2018** (Ley 26/2014 con régimen transitorio 2015-2017) | Alta | Conservador |
| 11 | Modelo 720 | Valores: valoración a **31/12**, por cotización a esa fecha convertida al tipo del BCE. Cuentas: **el saldo a 31/12 y el saldo medio del cuarto trimestre**, los dos, tanto para el umbral como para la regla de repetición. Umbral de **50.000 € por categoría**, aviso configurable a 45.000 €. Se repite si una categoría **sube más de 20.000 €** sobre la última presentada (en las cuentas, cualquiera de los dos saldos) **o si se deja de ser titular** de un bien declarado | Normativa del 720 (arts. 42 bis y 42 ter RD 1065/2007); las FAQ de la AEAT admiten expresamente la cotización a 31/12 como alternativa a la media del cuarto trimestre para los valores, y usan los dos saldos de las cuentas para el límite y para la subida de 20.000 € | Media | Conservador |
| 12 | Retención en reembolsos de fondos | **19 % sobre la ganancia**, en `sell.withholding`, restado de la cuota | Art. 101.6 LIRPF. Solo las comercializadoras sujetas a retención en España | Alta | Conservador |
| 13 | Fusión o canje con **compensación en efectivo** | El efectivo **tributa como ganancia patrimonial** en el ejercicio del canje | En un canje acogido al régimen de neutralidad, la parte en dinero queda fuera del diferimiento | **En disputa** | Conservador en el año, **incorrecto en la base** |
| 14 | ¿La ventana se cuenta de fecha a fecha? | **Sí**, en meses y años naturales, con el día inexistente llevado al **último del mes**. El último día de la ventana **sí** avisa | Cómputo civil de plazos (art. 5 CC). Lo corrigió ADR-0014 | Alta | Conservador |
| 15 | Pérdida diferida cuyos lotes se **traspasan o canjean** | El diferimiento **viaja con los lotes descendientes** (`source_lot_id`) | Sin norma expresa | **En disputa** | Conservador |
| 16 | Deducción por doble imposición de dividendos extranjeros | La menor de: el impuesto satisfecho fuera **limitado al tipo del convenio**, y el tipo medio efectivo aplicado a esa renta. Por eso `dividend` guarda `source_country` | Art. 80 LIRPF y convenios | Alta, **pero no calculable entero** | Conservador |
| 17 | La **comisión de una permuta** (`swap`), ¿resta de lo transmitido o suma al coste de lo adquirido? | **Resta de lo transmitido**, igual que en una venta: la pata de salida de una permuta es una transmisión | Art. 35 LIRPF. Una permuta es simultáneamente transmisión y adquisición, y la comisión es inherente a las dos; la norma no reparte | Media | **Agresivo en el momento**: restar ahora baja la ganancia de este ejercicio y sube la de uno futuro |
| 18 | Para la regla de recompra, ¿qué adquisiciones cuentan? | Solo las que **permanecen en el patrimonio después de la venta**. Una compra que la propia venta consume por FIFO no bloquea la pérdida | Art. 33.5.f) y g) LIRPF: la pérdida se integra «a medida que se transmitan los valores que permanezcan en el patrimonio». Es la lectura mayoritaria | Media | **Agresivo** frente a la alternativa (contar también lo consumido difiere más pérdida) |
| 19 | ¿Puede una misma unidad recomprada aplazar dos pérdidas distintas? | **No**: cada unidad recomprada aplaza una sola vez, asignada por orden cronológico | Sin norma expresa; evita contar dos veces la misma adquisición | Media | **Agresivo** frente a contarla varias veces |
| 20 | ¿Sobre qué se aplica la regla de recompra? | **Por operación de transmisión**: cada venta con pérdida se evalúa por separado | Art. 33.5 LIRPF habla de las pérdidas «derivadas de las transmisiones» | Media | Ambas, según el caso |
| 21 | Una pérdida liberada al vender, si esa venta tiene a su vez una recompra en su ventana | **Se suma a la pérdida de esa venta y se vuelve a aplicar la regla** | Coherencia con el art. 33.5 in fine; sin norma expresa | Media-baja | Conservador (puede volver a aplazar) |
| 22 | Orden de la compensación de pérdidas (art. 49) | **Dos fases**, como el manual práctico de la AEAT: primero dentro de cada tipo de renta y después el cruce entre ganancias y rendimientos hasta el **25 % conjunto**. Las pérdidas de ejercicios anteriores se aplican **de la más antigua a la más reciente**, y el límite se redondea a céntimos | Art. 49 LIRPF y manual práctico de IRPF | Alta (orden) / Media (redondeo) | Neutro: no cambia el total, evita que caduquen pérdidas |
| 23 | Comisiones de **custodia y administración** en el rendimiento del capital mobiliario | Se deducen **solo** las comisiones sueltas marcadas como custodia o administración; las de conectividad, datos o gestión discrecional, no | Art. 26.1.a) LIRPF | Alta | Conservador (lo dudoso no se deduce) |
| 24 | Categoría de renta de los **ETC** y los **ETP**: ¿ganancia patrimonial o rendimiento del capital mobiliario? | **ETC → rendimiento del capital mobiliario** (art. 25.2 LIRPF, cesión a terceros de capitales propios): es una nota de deuda garantizada, no una IIC. **ETP → rendimiento del capital mobiliario por defecto**: depende de la estructura jurídica de cada producto, aunque los ETP de cripto europeos suelen ser notas de deuda. Configurable por tipo de activo (`income_category`); el valor por defecto de los dos cambia en la feature 010 | Consulta vinculante de la DGT [**V0267-25**](https://petete.tributos.hacienda.gob.es/consultas/?num_consulta=V0267-25), de 13/03/2025: califica el rendimiento de un ETC como rendimiento del capital mobiliario «en todo caso». Para un ETP no hay consulta propia: se sigue su estructura | Alta (ETC) / Media (ETP) | **Conservador**: como rendimiento del capital mobiliario, una pérdida solo compensa ganancias patrimoniales hasta el 25 %, y una ganancia no puede absorber al 100 % pérdidas patrimoniales |

> **Nota al criterio 16 (2026-09-18).** El tipo de cada convenio **no está en ningún sitio** del sistema. Se configura por país y **no tiene valores por defecto**: si un país no tiene tipo configurado, **no se calcula deducción** y la salida lo dice. Deducir todo lo retenido sin conocer el convenio sería agresivo.

---

## Los criterios en disputa, uno por uno

Ninguno está resuelto. Se recogen con el argumento en contra para que la decisión, cuando llegue, se tome sabiendo lo que hay.

**#2 — Dos meses para valores de fuera de la UE.** El art. 33.5.f) habla de mercados *"definidos en la Directiva 2004/39/CE"*, es decir, mercados regulados **de la UE**. Una acción del Nasdaq no lo está, y la lectura literal la llevaría a la letra g): **un año**. La práctica mayoritaria aplica los dos meses apoyándose en las decisiones de equivalencia de mercados estadounidenses, pero no se ha encontrado consulta vinculante que lo resuelva, y para mercados sin decisión de equivalencia ni ese argumento existe. **La opción por defecto del proyecto (`stock → "2m"`) es la agresiva.** Afecta de lleno al cubo, que es donde hay operativa frecuente. **Hueco estructural:** el catálogo de activos no guarda **dónde cotiza** cada valor, así que hoy el criterio no podría aplicarse por mercado aunque se decidiera.

**#4 — Método de cálculo de la ganancia en divisa.** Hay doctrina que sostiene que la ganancia de unas acciones compradas y vendidas en dólares se calcula **primero en dólares** y se convierte al tipo de la fecha de transmisión, separando el efecto divisa del principal. El proyecto usa el método clásico —convertir cada pata a su propio tipo—, que es el mayoritario y el que usa la herramienta Cartera de Valores de la AEAT, pero **no da el mismo número**. Además, "se emplea en una adquisición" como hecho imponible de la divisa no está bien fundado: el criterio de la DGT es que la diferencia no se imputa hasta que el cambio se realiza efectivamente. **Riesgo en las dos direcciones. Hueco estructural:** el FIFO por divisa exige lotes de divisa y hoy solo se guardan saldos.

**#7 y #13 — El régimen de neutralidad no siempre se aplica.** Los dos criterios dan por supuesto que una fusión, canje o escisión está acogida al régimen de diferimiento. El manual de la AEAT lo condiciona a que la entidad adquirente sea española o esté en el ámbito de la Directiva 2009/133/CE: **una fusión entre dos sociedades estadounidenses no lo cumple**, y sin régimen especial el canje es una permuta plenamente sujeta (art. 37.1.h LIRPF). El proyecto la modela como `convert`, que conserva fecha y coste y no declara nada: **omitiría la ganancia entera del canje**. Es la cifra individual más grande que puede fallar en todo el sistema. Aparte, sobre el #13: hay base para sostener que la compensación en dinero **no tributa en el canje sino que minora el valor fiscal** de los títulos recibidos (arts. 80/81 LIS). **Hueco estructural:** `corporate_action` no guarda si la operación se acoge al régimen.

**#8 — Fork y airdrop.** Hay doctrina de la DGT que califica la recepción gratuita de criptoactivos como **ganancia patrimonial no derivada de transmisión**, por el valor de mercado en la recepción, integrada en la **base general** (no en la del ahorro). Si es así, el criterio actual omite renta en el año de recepción y luego tributa en la base equivocada. **Es agresivo, no prudente como decía la versión anterior de este documento.**

**#15 — Contra qué se libera la pérdida diferida.** El art. 33.5 in fine dice que las pérdidas se integran *"a medida que se transmitan los valores o participaciones que permanezcan en el patrimonio del contribuyente"* — no dice "los valores recomprados". Con FIFO, los lotes recomprados son los últimos en venderse, así que el modelo del proyecto libera la pérdida **más tarde** de lo que permite la ley. Efecto colateral: desactiva el miedo que justificaba este criterio, porque la pérdida no desaparece aunque los lotes recomprados se traspasen.

---

## Lo que el criterio dice bien pero se queda corto

**#3 — Las comisiones de custodia sí se deducen, pero de otra cosa.** No entran en la ganancia patrimonial (correcto), pero el art. 26.1.a) LIRPF permite deducir **los gastos de administración y depósito de valores negociables** del rendimiento íntegro del capital mobiliario. Quedan fuera la gestión discrecional de cartera y, razonablemente, las cuotas de datos de mercado o conectividad. **Hueco estructural:** `standalone_fee` solo guarda una descripción en texto libre, sin nada que distinga una comisión de depósito de otra cosa.

**#11 — Modelo 721.** El umbral de 50.000 € es del **conjunto** de criptoactivos custodiados por terceros en el extranjero, no por categorías como el 720, y la autocustodia queda fuera. Y el motivo escrito para excluir MyInvestor ("es entidad española") **no es el criterio legal**: lo que cuenta es dónde están situados los bienes, y lo que salva el caso es que en cuenta ómnibus la titular formal es la comercializadora española. Con la regla tal como está escrita, comprar un fondo extranjero en una plataforma extranjera daría la respuesta contraria a la correcta.

**#16 — Lo que la aplicación no puede calcular.** El límite del tipo medio efectivo exige conocer la base liquidable del ahorro completa, que la aplicación no ve. Y el exceso no deducible **se pierde**: en IRPF no hay arrastre.

---

## Lo que falta y ningún criterio cubre

Por probabilidad de aparecer en esta cartera:

1. **ETC y ETP**: resuelto el 2026-09-19 con la consulta vinculante V0267-25; es el criterio **#24**.
2. **Staking y airdrops** si alguna vez hay cripto en tenencia directa. Si solo se tiene vía ETP, decirlo explícitamente.
3. **Permuta cripto por cripto**: art. 37.1.h, el mayor entre el valor de mercado de lo entregado y de lo recibido. El libro solo tiene `fx_exchange` para divisas.
4. **Derechos de suscripción preferente**: venta con retención del 19 % desde 2017. El esquema da el número correcto pero no puede registrar la retención.
5. **Devolución de prima de emisión y reducción de capital con devolución de aportaciones**: minoran el valor de adquisición, el exceso es rendimiento del capital mobiliario.
6. **Art. 95 LIRPF** (IIC en jurisdicciones no cooperativas): varios ETC de oro y ETP de cripto se domicilian en Jersey, Guernsey o Caimán. Hay que comprobarlo producto a producto, y **el catálogo no guarda el domicilio del emisor**.
7. **Pérdida por quiebra de un emisor o de un *exchange***: créditos vencidos y no cobrados, con el régimen y los plazos del art. 14.2.k).
8. **Impuesto sobre el Patrimonio**: obligación de declarar por encima de 2.000.000 € de bienes y derechos aunque no salga cuota. Con horizonte de veinte años, llega.
9. **Quedan excluidos explícitamente**, para que nadie los reproponga: los coeficientes de abatimiento (DT 9ª, solo para adquisiciones anteriores a 1995) y el oro físico en lingote, que sí es ganancia patrimonial a diferencia del ETC.

---

## Huecos estructurales: datos que el libro no guarda y va a necesitar

Son de la clase "barata ahora, carísima después". **Ninguno exige decidir hoy quién tiene razón en las disputas de arriba**: se trata de guardar el dato para que cualquiera de las dos lecturas sea implementable.

> **Implementados** (feature 008, PR #51, 2026-09-18): los nueve están en el esquema y el libro ya los guarda. Lo que sigue pendiente es **consumirlos**, que es la Fase 5.
>
> **Decisión original, ADR-0021** (2026-09-18): las nueve previsiones están decididas y se implementan **antes de que se registre la primera operación real**. La novena (`fx_rate_date` obligatorio) manda el calendario, porque es un endurecimiento y ADR-0018 solo lo permite mientras el libro real esté vacío.

| # | Dato que falta | Para qué | Criterio afectado |
|---|---|---|---|
| 1 | **Categoría de renta** de cada transmisión | Distinguir ganancia patrimonial (art. 33) de rendimiento del capital mobiliario (art. 25.2), que compensan distinto. Hoy `RealizedGain` no lleva ni el tipo de activo | #24 |
| 2 | **Mercado donde cotiza** el valor | Aplicar una ventana de recompra distinta dentro y fuera de la UE; elegir bien la valoración del 720 | #2 |
| 3 | **Domicilio del emisor** del fondo o ETC | Art. 95 LIRPF; clasificación en 720/721 | Falta 6 |
| 4 | **Naturaleza de `standalone_fee`** | Distinguir depósito y administración (deducible de RCM) de conectividad o gestión | #3 |
| 5 | **`withholding` en `forced_sale`** | Retención de una liquidación de fondo, de la venta de derechos o de un ETC en bróker español | #12 |
| 6 | **Renta recibida en especie sin transmisión** | Fork o airdrop a valor de mercado; acciones de una escisión no amparada; dividendo en especie. No existe la noción de base general | #8, #7 |
| 7 | **Permuta cripto-cripto** | Regla de valoración del art. 37.1.h | Falta 3 |
| 8 | **Si una acción corporativa se acoge al régimen de neutralidad** | Decide si un `merger` es `convert` (sin tributación) o permuta sujeta | #7, #13 |
| 9 | **Lotes de divisa** con su tipo de adquisición | El FIFO por divisa no es computable sobre saldos | #4 |

---

## Estado

- **La Fase 5 no está bloqueada, pero sí condicionada.** El motor puede escribirse tratando las disputas como configuración, igual que ya hace con la ventana de recompra — **siempre que el esquema guarde antes los datos de la tabla de arriba**. Eso es una decisión de diseño, no fiscal, y es lo que se hará.
- **Lo que sigue siendo del usuario**, y no puede resolverlo ningún asistente: los criterios **#2 (valores de fuera de la UE)**, **#7/#13 (fusiones extranjeras)**, **#8 (forks)** y la estructura de cada **ETP** que se compre (#24, certeza media) merecen una revisión profesional antes de presentar la primera declaración hecha con esta aplicación. El de los **ETC** lo resolvió la consulta vinculante V0267-25 (#24, certeza alta). No corre prisa: el libro está vacío y no hay nada presentado.
- Queda abierta una decisión **de diseño** ya resuelta en su forma: qué deja registrado el libro sobre lo declarado (`tax_return_filed`, **ADR-0020**), que se implementa en la Fase 5.
