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

> **Las dos columnas responden a preguntas distintas, y se han confundido dos veces.** La **dirección** responde «si este criterio está mal, ¿se pagó de más o de menos?». La **certeza** responde «¿qué probabilidad hay de que lo esté?». Son independientes: **subir la certeza nunca cambia la dirección**, solo hace el riesgo más remoto. Un criterio de certeza alta y dirección agresiva es exactamente eso — un fallo improbable que, de darse, costaría dinero—, y no una contradicción. (La primera confusión fue afirmar que todo lo dudoso era conservador; la segunda, querer quitarle la etiqueta agresiva a los criterios #18 y #19 al subirles la certeza.)

---

## Los criterios

| # | Pregunta | Criterio aplicado | Fundamento |
|---|---|---|---|
| 1 | Fecha de la alteración patrimonial | **Cotizados: fecha de contratación. Fondos: fecha valor**. Es el valor por defecto de `fiscal_date_rule` | La alteración se produce al perfeccionarse la transmisión; en un fondo, el reembolso al valor liquidativo aplicable |
| 2 | Plazo de la regla de recompra | **Dos meses** para valores admitidos a negociación, **y entre ellos los fondos de inversión** (corregido el 2026-09-22; antes un año). **Un año** para los no admitidos. Para cripto, **un año** por prudencia. **Los monetarios van con los fondos**, a dos meses: en este catálogo `money_market` es un fondo monetario —lleva ISIN, TER y `transferable`, que es el régimen de traspaso español y solo existe para las IIC—, no una letra del Tesoro ni un depósito | Art. 33.5 **f)** y **g)** LIRPF: lo único que separa los dos plazos es estar «admitidos a negociación en alguno de los mercados secundarios oficiales de valores definidos en la Directiva 2004/39/CE» —ese es el literal de la ley; la remisión se entiende hoy hecha a la Directiva **2014/65/UE**, que la derogó—, y la ley **no menciona los fondos**. El **art. 4.9 del RD 1082/2012** dice, para los fondos que garanticen el reembolso diario, que cumplir la obligación de difusión diaria del valor liquidativo «determinará que las participaciones en los correspondientes fondos tengan la consideración de **valores admitidos a cotización a los efectos de aquellas disposiciones que regulen regímenes específicos de inversión**». **Esa última cláusula acota el apoyo y hay que leerla entera**: el art. 33.5 f) LIRPF no es obviamente una disposición que regule un régimen específico de inversión, así que el pilar reglamentario es **discutible y no sostiene la decisión por sí solo**. Lo que la sostiene son las **dos únicas** consultas sobre esto, **DGT 0011-00** (17/02/2000) y **DGT V2067-06** (20/10/2006), encajan las participaciones de fondos en la **letra f)**. El **Manual de ayuda del Modelo 100, edición IRPF 2025**, incluye en el supuesto de dos meses «los fondos de inversión que cumplen las obligaciones de información diaria»; su ejemplo del año son las SICAV y SOCIMI del MAB. La **guía de fiscalidad de fondos de la CNMV** solo contempla dos meses. Para cripto no hay norma expresa |
| 2b | ¿Un **traspaso entrante** cuenta como adquisición? | **Sí** (`wash_sale_transfer_counts`, por defecto `true`). Unas acciones liberadas (`scale`) y un `grant` a coste cero **no**. Un traspaso de custodia (mismo activo, otra cuenta) tampoco | Es una adquisición de valores homogéneos aunque no tribute en origen (art. 94 LIRPF). Contar difiere la pérdida, que es lo prudente |
| 3 | Comisiones en la base | La de **compra suma** al valor de adquisición; la de **venta resta** del de transmisión. Las de **custodia, administración o conectividad no entran en la ganancia patrimonial** | Art. 35 LIRPF: gastos **inherentes** a la adquisición o a la transmisión |
| 4 | Diferencias de cambio del efectivo en divisa | **Ganancia o pérdida patrimonial** al convertir a euros o cambiar por otra divisa. Imputación **FIFO por divisa** | La moneda extranjera es un elemento patrimonial; el FIFO por analogía con el art. 37.2 |
| 5 | Días sin publicación del BCE | **El último tipo publicado anterior**, guardando su fecha (`fx_rate_date`) | Práctica habitual y reproducible desde la tabla oficial |
| 6 | Redondeo a céntimos | **Half-up, una vez por operación**, nunca por lote | Convención contable ordinaria; la norma no impone método |
| 7 | Reparto del coste en una escisión | **La proporción que publique el emisor**; si no publica, valores de mercado del primer día de cotización separada | Es el criterio que sostiene la sociedad y el que la administración puede contrastar |
| 8 | Fork o airdrop de cripto | **Coste de adquisición cero y fecha del fork**, sin declarar nada en el ejercicio de recepción | Sin norma específica en la ley |
| 9 | Pérdida por liquidación de una sociedad | Computable **cuando la sociedad se disuelve y se liquida**. **Una exclusión de cotización no basta** | Art. 37.1.e) LIRPF |
| 10 | Compensación de pérdidas con rendimientos del capital mobiliario | Hasta el **25 %** del saldo positivo, **en los dos sentidos**. El remanente se arrastra **cuatro ejercicios**, y **compensar el máximo posible cada año es obligatorio** | Art. 49 LIRPF; el 25 % rige **desde 2018** (Ley 26/2014 con régimen transitorio 2015-2017) |
| 11 | Modelo 720 | Valores: valoración a **31/12**, por cotización a esa fecha convertida al tipo del BCE. Cuentas: **el saldo a 31/12 y el saldo medio del cuarto trimestre**, los dos, tanto para el umbral como para la regla de repetición. Umbral de **50.000 € por categoría**, aviso configurable a 45.000 €. Se repite si una categoría **sube más de 20.000 €** sobre la última presentada (en las cuentas, cualquiera de los dos saldos) **o si se deja de ser titular** de un bien declarado | Normativa del 720 (arts. 42 bis y 42 ter RD 1065/2007); las FAQ de la AEAT admiten expresamente la cotización a 31/12 como alternativa a la media del cuarto trimestre para los valores, y usan los dos saldos de las cuentas para el límite y para la subida de 20.000 € |
| 12 | Retención en reembolsos de fondos | **19 % sobre la ganancia**, en `sell.withholding`, restado de la cuota | Art. 101.6 LIRPF. Solo las comercializadoras sujetas a retención en España |
| 13 | Fusión o canje con **compensación en efectivo** | El efectivo **tributa como ganancia patrimonial** en el ejercicio del canje | En un canje acogido al régimen de neutralidad, la parte en dinero queda fuera del diferimiento |
| 14 | ¿La ventana se cuenta de fecha a fecha? | **Sí**, en meses y años naturales, con el día inexistente llevado al **último del mes**. El último día de la ventana **sí** avisa | Cómputo civil de plazos (art. 5 CC). Lo corrigió ADR-0014 |
| 15 | Pérdida diferida cuyos lotes se **traspasan o canjean** | El diferimiento **viaja con los lotes descendientes** (`source_lot_id`) | Sin norma expresa |
| 16 | Deducción por doble imposición de dividendos extranjeros | La menor de: el impuesto satisfecho fuera **limitado al tipo del convenio**, y el tipo medio efectivo aplicado a esa renta. Por eso `dividend` guarda `source_country` | Art. 80 LIRPF y convenios |
| 17 | La **comisión de una permuta** (`swap`), ¿resta de lo transmitido o suma al coste de lo adquirido? | **Resta de lo transmitido**, igual que en una venta: la pata de salida de una permuta es una transmisión | Art. 35 LIRPF. Una permuta es simultáneamente transmisión y adquisición, y la comisión es inherente a las dos; la norma no reparte |
| 18 | Para la regla de recompra, ¿qué adquisiciones cuentan? | Solo las que **permanecen en el patrimonio después de la venta**. Una compra que la propia venta consume por FIFO no bloquea la pérdida | Art. 33.5.f) y g) LIRPF: la pérdida se integra «a medida que se transmitan los valores que permanezcan en el patrimonio». Y lo dice el **Manual práctico de Renta 2025** de la AEAT, capítulo 11, «Pérdidas patrimoniales que no se computan fiscalmente como tales» (actualizado el 17/03/2026, verificado el 2026-09-23): «Se considera que existe una recompra cuando se adquieren valores homogéneos dentro de los dos meses anteriores o posteriores a la venta y **dichos valores continúan en el patrimonio del contribuyente tras la transmisión**» |
| 19 | ¿Puede una misma unidad recomprada aplazar dos pérdidas distintas? | **No**: cada unidad recomprada aplaza una sola vez, asignada por orden cronológico | Consulta vinculante de la DGT **V3282-18**, de 28/12/2018, que resuelve **esta misma pregunta**: «cuando tenga lugar una transmisión que origine una pérdida patrimonial y en los mencionados plazos legales se produzcan diversas compras y ventas, sólo deberán tenerse en cuenta, a efectos de determinar si existe recompra, **las compras de acciones que a su vez no hayan sido consideradas previamente recompras de acciones en transmisiones anteriores**» |
| 20 | ¿Sobre qué se aplica la regla de recompra? | **Por operación de transmisión**: cada venta con pérdida se evalúa por separado | Art. 33.5 f) y g) LIRPF habla de las pérdidas «derivadas de **las transmisiones**», y el manual del Modelo 100 dice de las monedas virtuales que se calcula «de manera independiente para **cada operación de venta**» |
| 21 | Una pérdida liberada al vender, si esa venta tiene a su vez una recompra en su ventana | **Se suma a la pérdida de esa venta y se vuelve a aplicar la regla** | Coherencia con el art. 33.5 in fine; sin norma expresa |
| 22 | Orden de la compensación de pérdidas (art. 49) | **Dos fases**, como el manual práctico de la AEAT: primero dentro de cada tipo de renta y después el cruce entre ganancias y rendimientos hasta el **25 % conjunto**. Las pérdidas de ejercicios anteriores se aplican **de la más antigua a la más reciente**, y el límite se redondea a céntimos | Art. 49 LIRPF y manual práctico de IRPF |
| 23 | Comisiones de **custodia y administración** en el rendimiento del capital mobiliario | Se deducen **solo** las comisiones sueltas marcadas como custodia o administración; las de conectividad, datos o gestión discrecional, no | Art. 26.1.a) LIRPF, que exige que sean gastos de **administración y depósito de valores negociables** (su remisión a la Ley 24/1988 se entiende hoy a la Ley 6/2023). **Tres flecos sin determinar**: si una custodia de cripto en tenencia directa es depósito de un valor negociable; si la deducción vale cuando quien la repercute es un **bróker extranjero**; y si se admite un rendimiento neto de capital mobiliario **negativo generado solo por gastos** |
| 24 | Categoría de renta de los **ETC** y los **ETP**: ¿ganancia patrimonial o rendimiento del capital mobiliario? | **ETC → rendimiento del capital mobiliario** (art. 25.2 LIRPF, cesión a terceros de capitales propios). **ETP → rendimiento del capital mobiliario por defecto**. Configurable por tipo de activo (`income_category`); es el valor por defecto desde la feature 010 | Consulta vinculante de la DGT [**V0267-25**](https://petete.tributos.hacienda.gob.es/consultas/?num_consulta=V0267-25), de 13/03/2025, **la única de toda la base** sobre estos productos. Su *ratio* **no es «es un ETC»**: es que **es un valor de deuda**, «ya que conlleva para la entidad emisora **obligaciones de pago** vinculadas con su amortización o reembolso». El producto consultado era un ETC **sintético y apalancado** sobre futuros de brent, de una sociedad de propósito especial irlandesa, con vencimiento en 2062 y rentabilidad por permuta financiera. **Lo que decide es el folleto del producto concreto**: si obliga a pagar o a **entregar metal**, si hay permuta o respaldo físico, vencimiento y emisor. El art. 25.2.b), último párrafo, aplica su propia regla de recompra: «Los rendimientos negativos derivados de transmisiones de activos financieros, cuando el contribuyente hubiera adquirido activos financieros homogéneos **dentro de los dos meses anteriores o posteriores** a dichas transmisiones, se integrarán a medida que se transmitan los activos financieros que permanezcan en el patrimonio del contribuyente» — **dos meses en todo caso**, sin variante de un año y sin mencionar ningún mercado |


### Cada variante con su lectura, su certeza y su riesgo

Una fila **por identificador del catálogo** (`packages/domain/src/tax/criteria.ts`), que es lo que `tests/fiscal-criteria.test.ts` empareja de forma exacta. Un criterio que el motor puede aplicar de varias formas —la ventana de recompra, la categoría de renta de un ETC o un ETP— tiene una fila por forma, porque **la certeza decide si al usuario se le dice «nadie sabe cómo se lee esto» o «esto está resuelto, y esto es lo que hay detrás»**, y eso no puede depender de qué hermana se mire.

**Una celda vacía no es expresable**: cada variante declara su certeza y su dirección del riesgo, con el vocabulario de siempre y sin valores nuevos. El silencio deja de ser un estado y pasa a ser una afirmación que alguien firma.

| # | Identificador | Lectura que aplica | Certeza | Riesgo | Matiz |
|---|---|---|---|---|---|
| 1 | `1` | La fecha fiscal que fija `fiscal_date_rule` por tipo de activo | Media | Conservador |  |
| 2 | `2:listed` | Ventana de **dos meses** para un valor cotizado | En disputa | Agresivo | La disputa es la de los valores de fuera de la UE: el art. 33.5 f) remite a mercados regulados de la UE y la práctica mayoritaria aplica los dos meses igual. El sistema no gobierna la ventana por el mercado, así que todo cotizado la lleva |
| 2 | `2:listed_1y` | Ventana de **un año** para un valor cotizado | En disputa | Conservador | El otro lado de la misma disputa. Una ventana más larga bloquea más pérdidas en el ejercicio corriente y difiere más: siempre es la dirección conservadora |
| 2 | `2:crypto` | Ventana de **un año** para criptomonedas, por prudencia | Baja | Conservador | No hay norma expresa que fije plazo para las monedas virtuales. El año es la lectura prudente, y una ventana más larga difiere más pérdida |
| 2 | `2:crypto_2m` | Ventana de **dos meses** para criptomonedas | Baja | Agresivo | El lado menos prudente de lo mismo: difiere menos pérdida |
| 2 | `2:fund_2m` | Ventana de **dos meses** para un fondo de inversión | Media | Agresivo | Lo que el criterio aplica desde el 2026-09-22. La certeza no es alta por dos motivos: el art. 4.9 del RD 1082/2012 acota su alcance «a los efectos de aquellas disposiciones que regulen regímenes específicos de inversión», y está escrito para fondos españoles gestionados por una SGIIC, sin que nada resuelva un UCITS extranjero |
| 2 | `2:fund_1y` | Ventana de **un año** para un fondo de inversión | Media | Conservador | El otro lado de la misma disputa, y el conservador por la misma regla: más ventana, más pérdida diferida |
| 2 | `2:other` | Una ventana **a medida** (un número de días) que ninguna lectura de la norma sostiene | Baja | Ambas | No es «un año en un valor no admitido» —eso cae en `2:listed_1y` o en `2:fund_1y`—: es **cualquier** ventana configurada que no sea ninguna de las dos legales, en cualquier tipo de activo. Puede ser más corta que la legal, y entonces bloquea menos pérdidas y es agresiva, o más larga, y entonces es conservadora: depende de lo que se configure |
| 2b | `2b` | Un traspaso entrante **cuenta** como adquisición para la regla de recompra | Media | Conservador |  |
| 3 | `3` | Las comisiones de compra suman al coste y las de venta restan de lo transmitido | Alta | Conservador | Alta **pero incompleto**: no entran en la ganancia patrimonial, y el art. 26.1.a) sí permite deducir administración y depósito del rendimiento del capital mobiliario, que es el criterio #23 |
| 4 | `4` | La ganancia en divisa se calcula convirtiendo cada pata a su propio tipo | En disputa | Ambas | Hay doctrina que calcula primero en divisa y convierte al tipo de la transmisión, y no da el mismo número |
| 5 | `5` | En un día sin publicación del BCE se usa el último tipo anterior | Media | Conservador |  |
| 6 | `6` | Cada operación se redondea a céntimos una sola vez, half-up | Alta | Conservador |  |
| 7 | `7` | El coste de una escisión se reparte por la proporción que publique el emisor | En disputa | Agresivo | Agresivo **si la escisión no está amparada por el régimen de neutralidad**, que el libro no registra |
| 8 | `8` | Un fork o un airdrop entran a coste cero y no se declaran al recibirlos | En disputa | Agresivo |  |
| 9 | `9` | La pérdida por liquidación se computa cuando la sociedad se disuelve y se liquida | Alta | Conservador |  |
| 10 | `10` | Las pérdidas compensan hasta el 25 % en los dos sentidos y se arrastran cuatro ejercicios | Alta | Conservador |  |
| 11 | `11` | Los umbrales y la regla de repetición de los Modelos 720 y 721 | Media | Conservador |  |
| 12 | `12` | Retención del 19 % sobre la ganancia en un reembolso de fondo | Alta | Conservador |  |
| 13 | `13` | El efectivo de un canje tributa como ganancia patrimonial en el ejercicio del canje | En disputa | Conservador | Riesgo, tal como lo decía la fila: «Conservador en el año, **incorrecto en la base**». Hay base para sostener que el dinero no tributa en el canje sino que minora el valor fiscal de los títulos recibidos |
| 14 | `14` | La ventana de recompra se cuenta de fecha a fecha, y el último día cuenta | Alta | Conservador |  |
| 15 | `15` | La pérdida diferida viaja con los lotes descendientes | En disputa | Conservador |  |
| 16 | `16` | La deducción por doble imposición se limita al tipo del convenio | Alta | Conservador | Certeza, tal como la decía la fila: «Alta, **pero no calculable entero**». El segundo límite, el tipo medio efectivo, exige una base que la aplicación no ve, y el exceso se pierde |
| 17 | `17` | La comisión de una permuta resta de lo transmitido | Media | Agresivo | **Agresivo en el momento**: restar ahora baja la ganancia de este ejercicio y sube la de uno futuro |
| 18 | `18` | Solo cuenta para la recompra lo que permanece en el patrimonio tras la venta | Alta | Agresivo | Certeza, tal como la decía la fila: «Alta (subió el 2026-09-23, al verificarse el manual de la AEAT)». Riesgo: «**Agresivo** frente a la alternativa (contar también lo consumido difiere más pérdida). Subir la certeza hace el fallo más improbable, no de otro signo» |
| 19 | `19` | Cada unidad recomprada aplaza una sola pérdida, por orden cronológico | Alta | Agresivo | Agresivo frente a contarla varias veces |
| 20 | `20` | La regla de recompra se aplica por operación de transmisión, sobre su resultado neto | Media | Agresivo | Riesgo, tal como lo decía la fila: «**Agresivo**: netear el resultado de la operación nunca difiere **más** que hacerlo lote a lote —el valor absoluto de la pérdida neta es siempre menor o igual que la suma de las pérdidas por lote—, así que siempre se paga menos hoy y no existe el escenario contrario» |
| 21 | `21` | Lo que una transmisión libera se suma a su resultado y vuelve a pasar por la regla | Baja | Conservador | La fila le da certeza «Media-baja» y el catálogo se queda con la más dudosa: una cifra nunca se presenta más firme que la parte más débil de lo que depende. Riesgo, tal como lo decía la fila: «Conservador (puede volver a aplazar)» |
| 22 | `22` | La compensación del art. 49 va en dos fases, de la pérdida más antigua a la más reciente | Media | Neutro | La fila le da certeza «Alta (orden) / Media (redondeo)» y el catálogo se queda con la más dudosa. Riesgo, tal como lo decía la fila: «Neutro: no cambia el total, evita que caduquen pérdidas» |
| 23 | `23` | Se deducen del capital mobiliario las comisiones sueltas de custodia y administración | Alta | Agresivo | Riesgo, tal como lo decía la fila: «**Agresivo**: si el criterio está mal, se **deduce de más**, que es la dirección con consecuencias. (La clasificación por defecto sí es prudente —lo dudoso se marca `other` y no se deduce—, pero eso responde a otra pregunta: la columna dice qué pasa **si este criterio está mal**, no cómo de prudente es el valor por defecto. Es la tercera vez que se cruzan las dos columnas aquí)» |
| 24 | `24:etc` | Un ETC tributa como **rendimiento del capital mobiliario** | Media | Ambas | Lo que dice la V0267-25, cuya *ratio* es «es un valor de deuda». Media y no alta: un ETC de oro físico con derecho de entrega obliga al emisor a **entregar**, no a pagar, y la consulta no lo resuelve |
| 24 | `24:etc_gain` | Un ETC tributa como **ganancia patrimonial** | Baja | Ambas | La lectura contraria a una consulta vinculante que dice «en todo caso»: por eso es la más débil de las cuatro |
| 24 | `24:etp` | Un ETP tributa como **rendimiento del capital mobiliario** | Baja | Ambas | No hay ninguna consulta sobre ETP de criptomonedas, y la DGT sí tiene doctrina consolidada de que la cripto en tenencia directa es ganancia patrimonial |
| 24 | `24:etp_gain` | Un ETP tributa como **ganancia patrimonial** | Media | Ambas | Más defendible que su hermana del ETC, porque la estructura jurídica de cada producto deja margen real |

> **Lo que decían las filas que nombran varias lecturas, tal cual**, para que el paso a una fila por variante no pierda una palabra:
>
> - **#2** — certeza: «**En disputa** (valores no UE) / Baja (cripto) / Media (fondos)»; riesgo: «**Agresivo** para lo cotizado fuera de la UE y para los fondos».
> - **#24** — certeza: «Media (ETC) / Baja (ETP)»; riesgo: «**Ambas**. El art. 49.1 es simétrico y la primera lectura solo miró una mitad: con **pérdida** en el ETC y **dividendos** en el cubo, tratarlo como capital mobiliario absorbe los dividendos al 100 % en vez de al 25 % y **se paga menos de lo debido**; con **ganancia** en el ETC y **pérdidas patrimoniales**, ocurre lo contrario y **se paga de más**. Los dos escenarios son normales en esta cartera».

> **Nota al criterio 2 (2026-09-22), el flanco abierto de los fondos.** El fundamento reglamentario está redactado para **fondos españoles gestionados por una SGIIC e inscritos en la CNMV**. **Ninguna fuente resuelve qué pasa con un UCITS irlandés o luxemburgués**, que es lo que se contrata habitualmente en España; el manual de la AEAT no distingue, pero es un manual, no una norma. Por eso la certeza es **media** y la dirección **agresiva**: dos meses difieren menos pérdida que un año. El dato que permitiría afinarlo por activo es **`issuer_country`**, que el catálogo ya guarda desde la feature 008 y que hasta ahora no leía nadie.

> **Nota al criterio 24 (2026-09-22).** La certeza del **ETC** es **media**, no alta: si un ETC de oro físico concede **derecho de entrega del metal**, la obligación del emisor no es de pago sino de **entrega**, y cuesta sostener que haya habido «captación y utilización de capitales ajenos» del art. 25.2. La V0267-25 **no lo resuelve**. La del **ETP** es **baja**: no hay ninguna consulta sobre ETP de criptomonedas, y la DGT sí tiene doctrina consolidada de que la cripto **en tenencia directa** es ganancia patrimonial.

> **Nota al criterio 16 (2026-09-18).** El tipo de cada convenio **no está en ningún sitio** del sistema. Se configura por país y **no tiene valores por defecto**: si un país no tiene tipo configurado, **no se calcula deducción** y la salida lo dice. Deducir todo lo retenido sin conocer el convenio sería agresivo.

---

## Los criterios en disputa, uno por uno

Ninguno está resuelto. Se recogen con el argumento en contra para que la decisión, cuando llegue, se tome sabiendo lo que hay.

**#2 — Dos meses para valores de fuera de la UE.** El art. 33.5.f) habla de mercados *"definidos en la Directiva 2004/39/CE"*, es decir, mercados regulados **de la UE**. Una acción del Nasdaq no lo está, y la lectura literal la llevaría a la letra g): **un año**. La práctica mayoritaria aplica los dos meses apoyándose en las decisiones de equivalencia de mercados estadounidenses, pero no se ha encontrado consulta vinculante que lo resuelva, y para mercados sin decisión de equivalencia ni ese argumento existe. **La opción por defecto del proyecto (`stock → "2m"`) es la agresiva.** Afecta de lleno al cubo, que es donde hay operativa frecuente. **~~Hueco estructural~~ (corregido el 2026-09-22):** el catálogo **sí** guarda dónde cotiza cada valor desde la feature 008 (`asset.market`), y el motor lo vuelca en cada línea de transmisión y en el apartado de dudosos, que enumera los mercados afectados. Lo que no hace es **gobernar la ventana** con él: eso sigue siendo una decisión pendiente, no un dato que falte.

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

## Por qué buscar las recompras por `asset_id` es correcto

El motor busca los valores homogéneos **solo por `asset_id`**. ADR-0009 explica la equivalencia técnica —la norma imputa por valor homogéneo, el ISIN lo identifica, y la regla «un ISIN, un activo» lo traduce a `asset_id`—, pero la doctrina que sostiene que esa traducción **no se queda corta** no estaba escrita en ninguna parte. Queda escrita aquí para que la coincidencia deje de parecer afortunada:

- **Definición reglamentaria**, transcrita en el Manual práctico de Renta 2025: son homogéneos los valores que proceden de **un mismo emisor**, forman parte de una misma operación financiera o responden a una unidad de propósito, y tienen **igual naturaleza y régimen de transmisión**.
- **DGT V2067-06**: «las participaciones que correspondan a **diferentes fondos de inversión no tienen entre sí la consideración de valores homogéneos**, dado que representan partes alícuotas de patrimonios separados distintos»; y **«es irrelevante»** que los fondos los gestione una misma gestora. Dos fondos distintos son dos `asset_id`: el motor acierta.
- **DGT V0796-26** (09/04/2026): distintas **clases del mismo fondo tampoco** son homogéneas entre sí cuando difieren en la comisión de gestión, por ser un elemento diferenciador no accesorio. Dos clases son dos ISIN y, por tanto, dos `asset_id`: el motor vuelve a acertar.

**Pregunta abierta, sin resolver** (verificación del 2026-09-22). Tras un `convert` —un cambio de clase o una fusión de fondos— los **lotes** se mudan al activo nuevo y un diferimiento ya posado viaja con ellos (criterio #15). Pero una **compra nueva en el activo de destino** nunca se empareja con una pérdida anterior en el activo de origen, porque la búsqueda mira solo el `asset_id` de la venta. Con la doctrina de V0796-26 en la mano eso **parece** lo correcto —son valores no homogéneos entre sí—, pero **nadie lo ha comprobado para el traspaso entre fondos**, que es donde se cruza con el criterio **#2b** (un traspaso entrante sí cuenta como adquisición). Queda anotado, no resuelto.

---

## Lo que falta y ningún criterio cubre

Por probabilidad de aparecer en esta cartera:

1. **ETC y ETP**: encauzado el 2026-09-19 con la consulta vinculante V0267-25; es el criterio **#24**. La verificación del 2026-09-22 bajó su certeza: **media** para el ETC y **baja** para el ETP. Sigue siendo del usuario comprobar el **folleto de cada producto**.
2. **Staking y airdrops** si alguna vez hay cripto en tenencia directa. Si solo se tiene vía ETP, decirlo explícitamente.
3. **Permuta cripto por cripto**: art. 37.1.h, el mayor entre el valor de mercado de lo entregado y de lo recibido. El libro solo tiene `fx_exchange` para divisas.
4. **Derechos de suscripción preferente**: venta con retención del 19 % desde 2017. El esquema da el número correcto pero no puede registrar la retención.
5. **Devolución de prima de emisión y reducción de capital con devolución de aportaciones**: minoran el valor de adquisición, el exceso es rendimiento del capital mobiliario.
6. **~~Art. 95 LIRPF~~ (retirada el 2026-09-22): el domicilio del emisor de un ETC o un ETP**. La invocación del art. 95 (IIC en jurisdicciones no cooperativas) era **incoherente con el criterio #24**: el presupuesto del art. 95 es que el vehículo **sea una IIC**, y si sostenemos que un ETC es un valor de deuda emitido por una sociedad de propósito especial, no lo es. La CNMV lo confirma por su lado: en sus preguntas y respuestas sobre normativa de IIC, los ETC y los ETN son **activos en los que una IIC invierte**, no IIC. Las dos calificaciones son **mutuamente excluyentes**: o valor de deuda (art. 25.2, art. 95 inaplicable) o IIC (art. 95 aplicable, art. 25.2 inaplicable). Lo que **sigue faltando** es el domicilio del emisor, que hace falta para clasificar un bien en el 720 y en el 721, y para decidir la ventana de recompra de un fondo extranjero (#2). *(Jersey, Guernsey y la Isla de Man **sí** están en la lista española de jurisdicciones no cooperativas, Orden HFP/115/2023: lo que falla no es el territorio, es el presupuesto subjetivo.)*
7. **La clave del impreso del Modelo 720 para cada vehículo.** La aplicación decide **si hay que presentar**, no rellena el modelo, así que hoy no elige clave ninguna ni guarda campo para ello. Para rellenarlo a mano hará falta saber qué clave y subclave corresponden a un ETF, a un ETC y a un ETP, y con qué valoración. **No está verificado en ninguna fuente de este repositorio**, así que queda como pregunta, no como criterio. Lo que sí es seguro es que **no mueve el umbral**: valores, IIC y seguros forman un bloque único (art. 42 ter.4.c, `business-rules.md` §5.8).
8. **Pérdida por quiebra de un emisor o de un *exchange***: créditos vencidos y no cobrados, con el régimen y los plazos del art. 14.2.k).
9. **Impuesto sobre el Patrimonio**: obligación de declarar por encima de 2.000.000 € de bienes y derechos aunque no salga cuota. Con horizonte de veinte años, llega.
10. **Quedan excluidos explícitamente**, para que nadie los reproponga: los coeficientes de abatimiento (DT 9ª, solo para adquisiciones anteriores a 1995) y el oro físico en lingote, que sí es ganancia patrimonial a diferencia del ETC.

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
| 3 | **Domicilio del emisor** del fondo o ETC | Clasificación en el 720 y el 721, y la ventana de recompra de un fondo extranjero. **No** el art. 95, que presupone una IIC (Falta 6) | Falta 6, #2 |
| 4 | **Naturaleza de `standalone_fee`** | Distinguir depósito y administración (deducible de RCM) de conectividad o gestión | #3 |
| 5 | **`withholding` en `forced_sale`** | Retención de una liquidación de fondo, de la venta de derechos o de un ETC en bróker español | #12 |
| 6 | **Renta recibida en especie sin transmisión** | Fork o airdrop a valor de mercado; acciones de una escisión no amparada; dividendo en especie. No existe la noción de base general | #8, #7 |
| 7 | **Permuta cripto-cripto** | Regla de valoración del art. 37.1.h | Falta 3 |
| 8 | **Si una acción corporativa se acoge al régimen de neutralidad** | Decide si un `merger` es `convert` (sin tributación) o permuta sujeta | #7, #13 |
| 9 | **Lotes de divisa** con su tipo de adquisición | El FIFO por divisa no es computable sobre saldos | #4 |

---

## Estado

- **La Fase 5 no está bloqueada, pero sí condicionada.** El motor puede escribirse tratando las disputas como configuración, igual que ya hace con la ventana de recompra — **siempre que el esquema guarde antes los datos de la tabla de arriba**. Eso es una decisión de diseño, no fiscal, y es lo que se hará.
- **Lo que sigue siendo del usuario**, y no puede resolverlo ningún asistente: los **seis criterios en disputa** —**#2** (valores de fuera de la UE), **#4** (método de cálculo de la ganancia en divisa), **#7 y #13** (fusiones extranjeras y régimen de neutralidad), **#8** (forks y airdrops) y **#15** (contra qué se libera la pérdida diferida)— merecen una revisión profesional antes de presentar la primera declaración hecha con esta aplicación. Con ellos, el **#24**: la consulta vinculante V0267-25 encauzó los **ETC**, pero **no los resuelve** —la verificación del 2026-09-22 dejó su certeza en **media** y la del **ETP** en **baja**—, así que la estructura de cada producto que se compre sigue siendo del usuario. **#24 no está en disputa**: tiene criterio aplicado y configurable (`income_category`); lo que tiene es certeza baja. No corre prisa: el libro está vacío y no hay nada presentado.
- Queda abierta una decisión **de diseño** ya resuelta en su forma: qué deja registrado el libro sobre lo declarado (`tax_return_filed`, **ADR-0020**), que se implementa en la Fase 5.
