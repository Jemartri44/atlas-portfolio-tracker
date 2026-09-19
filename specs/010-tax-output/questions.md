# Preguntas abiertas — feature `010-tax-output`

Estas preguntas tocan asuntos que el prompt no me deja resolver por mi cuenta: criterios fiscales, decisiones estructurales y contradicciones entre el prompt, los documentos y el código.

Cada pregunta trae **contexto suficiente para contestarla sin abrir el código**, las opciones con su coste y **mi recomendación**. `spec.md` y `plan.md` están escritos con el supuesto recomendado (S1–S17 de `spec.md`). Si una pregunta queda sin respuesta, se implementa ese supuesto.

Van ordenadas por lo que cuesta cambiarlas después. **Hay cinco criterios nuevos (fichas F1–F5)** que la salida no puede evitar decidir. Cada uno lleva una ficha con la certeza y la dirección del riesgo que propongo, para que la dirección los numere en `docs/fiscal-questions.md` antes de codificarlos.

Las fuentes oficiales se consultaron el 2026-09-19 con dos búsquedas independientes. Los números de casilla que se usan salen de las imágenes del formulario del BOE. **Comprobé yo mismo** tres cosas: las casillas de compensación (0424–0460), el apartado nuevo de los ETF (2224–2236) y el texto completo de la consulta V0267-25. Lo que no cuadra con el prompt está en las notas N1–N15.

---

## Índice

| # | Tema | Recomendación | Si la respuesta es otra |
|---|---|---|---|
| **Q1** | La huella del libro: los tres requisitos no se cumplen con una huella de bytes | SHA-256 del contenido canónico migrado a la versión de la huella; `compact` verifica y vuelve a sellar | Una huella más débil (solo identidades) o «no verificable» tras compactar |
| **Q2** | En qué apartado va cada transmisión (**ficha F1**) | Fondos → IIC; ETF → apartado nuevo de 2025; acciones → acciones negociadas; cripto → monedas virtuales; ETC/ETP como ganancia → **sin casilla** hasta que se resuelva su categoría | Cambia una tabla de datos, no la lógica |
| **Q3** | Redondeo y una fila por operación en las casillas (**ficha F2**) | Transmisión y adquisición redondeadas cada una; una fila por operación; avisar si difiere un céntimo | Cambia la presentación, no la base |
| **Q4** | El saldo medio del cuarto trimestre (**ficha F3**) | Saldo diario, días naturales, tipo del 31/12; el periodo empieza en el primer movimiento si la cuenta aparece en el trimestre | Cambia un divisor |
| **Q5** | Efectivo en una divisa sin tipo del 31/12 en el libro | Marcarlo y no decidir con él; la dirección valora un evento para anotar un tipo | Un tipo de evento nuevo |
| **Q6** | El país de una cuenta a 31/12 | El de su último `account_*` registrado hasta ese día | Un campo opcional nuevo |
| **Q7** | En qué ejercicio obliga una extinción, y cuándo se extingue una cuenta | En el año en que deja de tenerse; una cuenta, al marcarla inactiva | Cambia una regla del veredicto |
| **Q8** | Un ejercicio pasado sin presentación registrada: ¿silencio? | Una nota informativa, no el aviso de declaración | Silencio total, como dice ADR-0020 |
| **Q9** | Las alternativas de los dudosos y la configuración anterior, ¿con el ancla? | Sí, con el ancla | El dinero en juego mezcla ejercicios presentados |
| **Q10** | Las filas del formulario frente a las líneas del motor (**ficha F5**) | Por origen de la pérdida; lo liberado de años anteriores en 0395; atribución fija del #21 | Cambia filas, nunca totales |
| **Q11** | Qué es «algo que hacer» para la tarjeta del Resumen | Temporada **o** algo que hacer; «no se puede determinar» también cuenta | La tarjeta calla un 720 sin valorar |

Más abajo están también las **fichas F1–F5** (F4 no tiene pregunta propia: es la clasificación del 720), las **notas N1–N15**, las **casillas de 2025** con su fuente, el **procedimiento para añadir un ejercicio**, los **cuatro cálculos a mano** y la **lista de documentos** que la dirección tendrá que actualizar.

---

## Q1 — La huella del libro

**Contexto.** El prompt fija tres requisitos y no el algoritmo:

1. La huella cubre todos los eventos que preceden a la presentación en el fichero.
2. No cambia con `compact` ni con una migración.
3. Permite reproducir el cálculo de aquel día.

Una huella de los bytes crudos incumple el 2 en la primera compactación. Una huella de los eventos **ya migrados en memoria** también lo incumple, pero en la primera migración de verdad. Lo he comprobado con la migración de prueba de la 003 (`TEST_SCHEMA_V2`, que renombra `note` a `notes`): el mismo libro da otro texto en memoria con el código nuevo. Ninguna representación de un evento es independiente de su versión, porque migrar consiste justamente en cambiarla.

**Lo que sí se puede garantizar.** Ninguna línea anterior a una presentación puede tener una versión más nueva que la de la presentación. El cargador rechaza versiones futuras, así que un cliente viejo nunca escribe después de uno nuevo. De ahí salen tres opciones:

1. **Contenido migrado a la versión de la huella, y `compact` vuelve a sellar.** *Recomendada*.
   - La huella guarda `{ schema_version, lines, sha256 }`. El `sha256` se calcula sobre las `lines` primeras líneas, migradas **hasta esa versión y no más**, en JSON canónico con las claves ordenadas.
   - Una migración nueva en el código no la rompe: las líneas crudas siguen en su versión y la cadena de migraciones sabe parar donde se le diga.
   - `compact` es lo único que sube las líneas por encima de esa versión. Por eso compact, antes de reescribir, verifica todas las huellas y se niega si alguna falla; después las vuelve a sellar en la versión nueva. La garantía no se pierde, porque se ha comprobado justo antes de cambiar de forma.
   - Coste: `compact` deja de ser «solo migrar»; también reescribe un campo de las presentaciones. `snapshotOf` no puede incluir ese campo, o `compact` abortaría por «proyección distinta».
2. **Solo identidades**: `sha256` de (`id`, `type`, `recorded_at`) de cada línea anterior. No cambia nunca, pero **no detecta una edición a mano del contenido**, que es justo lo que invalida la reproducción del cálculo de aquel día (requisito 3).
3. **Como la 1, pero sin volver a sellar**: tras una compactación que cruce versiones, la huella pasa a «no verificable» y no da falsa alarma. Cumple el 2 solo a medias y pierde la verificación para siempre.

**Pregunta concreta**: ¿opción 1? Si la respuesta es sí, ADR-0020 o `data-schema.md` §5 deberían decir que `compact` vuelve a sellar las huellas; no lo escribo yo.

---

## Q2 — En qué apartado de la Renta va cada transmisión (ficha F1)

**Contexto.** El prompt (decisión (f)) pide proponerlo como criterio y dice que ningún documento lo fija. **La búsqueda oficial fija casi todo para 2025**; lo único que queda sin texto oficial son los ETC y los ETP.

- **Los ETF tienen apartado propio en 2025** (casillas 2224–2236). Lo crea la Orden HAC/277/2026. Su preámbulo dice, literalmente: «para facilitar la cumplimentación de las operaciones de compraventa de participaciones o acciones de fondos cotizados y sociedades de inversión de capital variable índice cotizadas a que refiere el artículo 75.3.j) del Reglamento … se crea un nuevo apartado específico». La ayuda de Renta WEB 2025 incluye expresamente las IIC «constituidas en el extranjero análogas … ya coticen en un mercado regulado o en un sistema multilateral de negociación». En 2025 un ETF ya **no** va ni en el apartado general de IIC ni en el de acciones.
- **Sobre ETC y ETP no hay nada** en el Manual práctico 2025, en las 892 páginas de la ayuda de Renta WEB ni en la Orden.
- **Hay además una consulta vinculante que la dirección tiene que conocer**: la **V0267-25** de la DGT, de 13/03/2025, que he leído entera (nota N6). Trata un ETC emitido por una sociedad irlandesa bajo un programa de ETP. Concluye que es un valor de deuda que «generará en todo caso rendimientos del capital mobiliario derivados de la cesión a terceros de capitales propios» (art. 25.2 LIRPF). Si eso es así, su transmisión va a la casilla **0031**, no a un apartado de ganancias patrimoniales.

**Pregunta concreta**:
1. ¿Numera la dirección la ficha F1 tal como está abajo?
2. ¿Confirma que, mientras `income_category.etc/etp` siga en `capital_gain`, esas transmisiones salgan **sin casilla** y lo digan? La otra opción es asignarlas a «otros elementos patrimoniales, clave 4», que no apoya ningún texto oficial.
3. ¿Quiere llevar la V0267-25 a la cuestión ETC/ETP de `docs/fiscal-questions.md`? Resolver esa cuestión no me corresponde a mí.

---

## Q3 — Redondeo y filas en las casillas (ficha F2)

**Contexto.** La 009 redondea **el resultado de cada operación** una vez (#6). El formulario de 2025 funciona de otra manera:

- Pide **valor de transmisión** y **valor de adquisición** por separado.
- En cada fila, la aplicación de la AEAT calcula ella misma la ganancia o la pérdida.
- En fondos y ETF la fila es por **sociedad o fondo**, con «Importe global de las transmisiones efectuadas en 2025».

Redondear transmisión y adquisición por separado puede dar un resultado que difiera en **un céntimo** del que redondea el motor. Y una fila «global» por fondo que junte una venta con pérdida diferida y otra con ganancia no puede expresar qué parte de la pérdida es imputable (N15).

Opciones:

1. **Una fila por operación**, que el formulario admite: se repite el mismo NIF. Transmisión y adquisición se redondean una vez cada una, half-up. La salida enseña el resultado que calculará el formulario junto al del motor y avisa si difieren (`tax_box_rounding_differs`). *Recomendada*: es lo que el usuario teclea.
2. Ajustar la adquisición para que la diferencia cuadre con el motor. Es inventar un valor de adquisición con un céntimo de más o de menos.
3. Una fila global por fondo, como sugiere el rótulo. Pierde la parte imputable cuando hay recompra.

**Pregunta concreta**: ¿opción 1, y con qué número entra la ficha?

---

## Q4 — El saldo medio del cuarto trimestre (ficha F3)

**Contexto.** El prompt fija «el saldo de cada día del 1/10 al 31/12» y pide que compruebe qué tipo de cambio convierte el saldo medio. Esto es lo que dicen las fuentes:

- **Tipo de cambio: resuelto, certeza alta.** Las preguntas frecuentes del 720 de la AEAT (página «valoración») dicen: «aplicando el tipo de cambio vigente a 31 de diciembre … Esta misma referencia se tomará en relación con la valoración del saldo medio del último trimestre». La DGT dice lo mismo en la V0691-13. Por tanto no hace falta criterio nuevo para esto, pero el #11 debería decirlo (nota N2).
- **Método: certeza media.** La DGT, en la V0119-14, dice que el saldo medio «estará integrado por los saldos de las cuentas a lo largo de todo el trimestre … deberá referirse a la totalidad del período». No hay fórmula literal.
- **Cuenta abierta dentro del trimestre: certeza alta, y el prompt no lo prevé.** La DGT, en la V0630-25, dice que si la apertura es posterior al 1 de octubre «deberá tomarse como periodo para el cálculo el que medie entre la fecha de apertura de la posición y el día 31 de diciembre». Dividir entre 92 días daría una media más baja: la dirección que tiene consecuencias.
- **El libro no guarda la fecha de apertura de una cuenta.** `account_created` no tiene fecha de negocio.

Opciones:

1. **El periodo empieza el 1/10 o, si la cuenta aparece en el trimestre, en su primer movimiento con fecha de negocio.** *Recomendada*. Si la cuenta se abrió antes con saldo cero, el divisor sale más corto y la media más alta. Es la dirección prudente para el veredicto.
2. Un campo opcional `opened_on` en `account_created` / `account_updated`. Es compatible (ADR-0018), pero cambia el esquema: lo decide la dirección.
3. Siempre 92 días. Es la lectura que la DGT contradice.

Tampoco encontré respuesta a esto: si una cuenta **cancelada** en el trimestre entra en el saldo medio conjunto (según las preguntas frecuentes, de una cuenta cancelada se informa el saldo a la fecha de cancelación). Propongo que entre con saldo cero desde su cierre: sus días cuentan y su saldo no infla nada.

**Pregunta concreta**: ¿opción 1 y la cancelada con ceros? ¿Con qué número entra la ficha?

---

## Q5 — Efectivo en una divisa para la que el libro no tiene tipo del 31/12

**Contexto.** El prompt dice que el efectivo en divisa se convierta «con el tipo que el libro conoce a 31/12», y que un tipo que no sea del último día hábil salga marcado. El libro solo conoce tipos que **llevan los eventos**.

- Un saldo en dólares tiene tipo del 31/12 si hay algún evento en dólares ese día, normalmente la valoración de un activo en dólares.
- **Un saldo en libras sin ningún activo en libras nunca lo tendrá.** No existe un evento para anotar a mano el tipo del BCE, y `reference/ecb/` (ADR-0006) no está implementado.
- Con la regla del veredicto, ese saldo marcado deja la categoría de cuentas en «no se puede determinar» salvo que lo demás ya obligue. Es el fallo seguro, pero la acción («registra un tipo del 31/12») no tiene cómo hacerse.

Opciones:

1. **Marcar y no decidir con él**, con una acción que lo explique: «Registra una valoración a 31/12 de un activo en esa divisa, o anota el saldo a mano en la declaración». *Recomendada para esta feature*: no cambia el esquema.
2. **Un tipo de evento nuevo**, por ejemplo `fx_rate_noted` (divisa, tipo, fecha del tipo): el tipo del BCE anotado a mano, Nivel 1. Es compatible, pero es un evento más en el catálogo, y lo decide la dirección (probablemente con una ADR).
3. Leer el tipo de otro día anterior sin marcarlo. Es justo lo que el prompt prohíbe.

**Pregunta concreta**: ¿opción 1 ahora, y la 2 como decisión aparte?

---

## Q6 — El país de una cuenta a 31/12

**Contexto.** El prompt pide un caso límite con «una cuenta que cambia de país» y que se pregunte si el catálogo no permite saber el país a 31/12. **No lo permite de forma exacta.**

- `account_updated` es catálogo: se aplica en la pasada A, entero y sin fecha de negocio (§7.1), así que la proyección solo conoce el país **de hoy**.
- El libro sí guarda cuándo se **registró** cada cambio (`recorded_at`), no cuándo **ocurrió**.

Opciones:

1. **El país a 31/12 es el del último `account_*` registrado hasta ese día (fecha de Madrid)**, como `settingsAt` hace con la configuración y como ADR-0016 manda para los documentos administrativos. Cuando hay un cambio de país, la salida lo dice. *Recomendada*: no toca el esquema, y el caso es raro (un bróker que traslada su filial).
2. Un campo opcional `country_since` en `account_updated`. Es exacto y compatible, pero cambia el esquema.
3. El país de hoy para todos los años. Con una cuenta que pasó de `IE` a `ES`, aplicaría la exclusión española a los años en que era extranjera: diría «no obligado» cuando sí lo estaba.

**Pregunta concreta**: ¿opción 1?

---

## Q7 — En qué ejercicio obliga una extinción, y cuándo se extingue una cuenta

**Contexto.** Esto dicen las fuentes, con certeza alta en lo literal:

- La extinción obliga «en todo caso» (arts. 42 bis.5, 42 ter.5 y 42 quater.6). La información que se da es la de la fecha de extinción.
- Solo se aplica a lo que ya se declaró o se tuvo obligación de declarar. Según la FAQ de 2014: «No de la venta de valores que se adquieran y se vendan a lo largo del ejercicio».

Hay dos cosas que el prompt no fija:

**(a) El ejercicio.** Un bien de la lista del último 720 que se vendió en 2028, sin 720 presentado en 2028. Si se compara siempre con la lista del último 720 presentado, el bien «sigue extinguido» en 2029 y 2030, y la aplicación diría que obliga todos los años.

1. **La extinción obliga en el ejercicio en que ocurre**: el bien se tenía a 31/12 del año anterior y no a 31/12 del evaluado. Si nadie presentó ese año, el veredicto de **ese** año dice «obligado» (fuera de plazo), y los siguientes no heredan la obligación. *Recomendada*.
2. Compararlo siempre con la lista, sin mirar el año anterior. Da falsas obligaciones repetidas.

**(b) Cuándo se extingue una cuenta.** El bien del efectivo es la cuenta (S11). Un saldo cero a 31/12 no es una cancelación: la cuenta sigue abierta. El libro solo sabe que una cuenta se cerró por `account_updated.active = false`.

1. **La cuenta se extingue cuando se marca inactiva** (registrado hasta el 31/12, como en Q6). *Recomendada*.
2. Cuando su saldo es cero y no tiene posiciones. Así una cuenta vacía pero abierta obligaría.

Una **venta parcial** de un bien de la lista no es extinción: se sigue siendo titular. La norma no lo dice literalmente.

**Pregunta concreta**: ¿(a) opción 1 y (b) opción 1?

---

## Q8 — Un ejercicio pasado sin presentación registrada: ¿silencio?

**Contexto.** El prompt dice que el aviso nuevo **sustituye** al genérico de «ejercicio anterior» (`isPriorYear`, `&ejercicio=anterior`), porque «pasado no es lo mismo que declarado». ADR-0020 acepta a sabiendas que, si el usuario no registra su declaración, el sistema se quede «como está hoy, sin avisos». Pero **hoy sí avisa**: el `priorYear`.

Si solo se sustituye, un usuario que presentó su Renta y no la registró pierde un aviso que hoy tiene. Al corregir un movimiento de 2026 en 2028, ya no le diría nada.

1. **Una nota informativa, no un aviso**: «Afecta a 2026, que no consta como declarado. Si lo presentaste, regístralo». *Recomendada*: es el fallo seguro de la constitución V y empuja a registrar, sin fingir que hay una declaración.
2. Silencio total.

**Pregunta concreta**: ¿opción 1?

---

## Q9 — Las alternativas de los dudosos y la diferencia con la configuración anterior, ¿con el ancla?

**Contexto.** En la 009, las alternativas de los criterios configurables y la «configuración anterior» se recalculan desde el libro. Ahora la cadena tiene el ancla dentro, y hay que decidir si esas lecturas alternativas la usan.

1. **Con el ancla.** Un ejercicio ya presentado es un hecho en las dos lecturas. El dinero en juego de un criterio en 2028 mide lo que el criterio mueve en 2028, no lo que movería una complementaria de 2027. Lo que el cambio haría a un ejercicio presentado lo cuenta la comparación de la Historia 3 y el aviso de cierre. *Recomendada*.
2. Sin el ancla. El dinero en juego de 2028 incluiría el efecto de rehacer 2027 como si no se hubiera presentado, que es una cifra que el usuario no puede declarar en 2028.

Consecuencia que conviene saber: un `settings_changed` que reinterpreta un ejercicio presentado deja **el ancla vieja** con **la configuración nueva**. Por ejemplo, con la ventana de un año, una pérdida computada en la Renta de 2027 se difiere y se libera en 2028: 2028 la cuenta y el pendiente declarado de 2027 también la incluye. Eso dura hasta que se registre la complementaria. Lo avisa el cierre al cambiar la configuración, y el plan añade la nota `tax_anchor_differs` en los años siguientes.

**Pregunta concreta**: ¿opción 1, con esa nota?

---

## Q10 — Las filas del formulario frente a las líneas del motor (ficha F5)

**Contexto.** El motor de la 009 integra lo liberado **en la transmisión que lo libera** y le vuelve a aplicar la regla (#20, #21). El formulario de 2025 lo organiza de otra manera:

- Cada operación lleva su «pérdida obtenida» y su «pérdida imputable a 2025» (0321/0322, 0337/0338, 2233/2234, 1807/1808, 1638/1639).
- Las pérdidas de **años anteriores** que pasan a ser imputables van en un apartado aparte (0394–0396).
- La recompra no tiene casilla con número: Renta WEB tiene una marca en su ventana de captura (N12).

Los **totales son los mismos** (lo he comprobado en el cálculo §6.4). **Las filas no**: una venta con ganancia propia que libera una pérdida anterior es una **ganancia** en el formulario y una pérdida en el motor.

Opciones:

1. **Filas por origen de la pérdida**, que es lo que pide el formulario. *Recomendada*.
   - En la operación O con pérdida: imputable = resultado propio − lo que de su pérdida sigue diferido a 31/12.
   - En la 0395 de cada año: lo que de la pérdida de un ejercicio anterior dejó de estar diferido ese año.
   - Esto necesita saber **de qué pérdida original** es cada diferido pendiente, y con el #21 eso no está escrito. Regla propuesta: un diferido que genera una transmisión con resultado propio positivo es entero de las pérdidas que liberó, a prorrata. Si el propio es negativo, primero es del propio y el resto de lo liberado.
2. Las líneas del motor tal cual, con los rótulos del formulario. Da filas que Renta WEB no aceptaría: una ganancia con pérdida imputable.

**Pregunta concreta**: ¿opción 1 con esa regla de atribución, y con qué número entra la ficha?

---

## Q11 — «Algo que hacer» para la tarjeta del Resumen

**Contexto.** P1 dice que la tarjeta sube «en temporada de Renta y cuando haya algo del 720 o del 721 que hacer». Lo leo como **dos disparadores independientes**:

- El plazo del 720 es de enero a marzo, fuera de la temporada de Renta. Un «y» estricto no subiría la tarjeta nunca por el 720.
- Los casos límite del prompt prueban la temporada sola.

Además, el prompt lista como «algo que hacer» un veredicto de obligado sin presentación, una obligación de volver a presentar o un valor por encima del aviso. **No incluye «no se puede determinar»**. Con activos en el extranjero sin valoraciones a 31/12, que es el caso normal de enero, la tarjeta se quedaría discreta justo cuando falta el dato que decide si hay que presentar.

1. **Sube en temporada, o si hay algo que hacer**, y «no se puede determinar» de un 31/12 pasado cuenta como algo que hacer, con la acción de registrar las valoraciones. *Recomendada*.
2. La lista literal del prompt.

**Pregunta concreta**: ¿opción 1?

---

## Fichas de criterios nuevos

Formato de `docs/fiscal-questions.md`. Las numera la dirección. El test anti-deriva de la 009 exigirá después que el catálogo `FISCAL_CRITERIA` las siga.

> **F1 — Apartado de la Renta de cada transmisión.**
>
> Criterio:
> - `fund` y `money_market` → IIC (0310–0325).
> - `etf` → apartado de IIC del art. 75.3.j) RIRPF (2224–2236, nuevo en 2025).
> - `stock` → acciones negociadas (0326–0340).
> - `crypto` → monedas virtuales (1800–1814).
> - Categoría `movable_capital` → rendimientos por transmisión de otros activos financieros (0031).
> - `etc` y `etp` en `capital_gain` → sin casilla hasta que se resuelva su categoría.
>
> Fundamento: formulario de la Orden HAC/277/2026 y su preámbulo; ayuda de Renta WEB 2025; DGT V0267-25 para los ETC.
>
> **Certeza**: alta para fondos, ETF, acciones y cripto en 2025; media para `movable_capital`; ninguna para ETC/ETP en ganancias.
>
> **Riesgo**: neutro en la base (todo suma en 0422/0423); lo que cambia es el cruce con los datos fiscales de la AEAT.

> **F2 — Filas y redondeo de las casillas por operación.**
>
> Criterio:
> - Una fila por operación.
> - Valor de transmisión y valor de adquisición redondeados half-up una vez cada uno.
> - El resultado lo calcula el formulario, y la salida avisa si difiere del redondeado por el motor.
>
> Fundamento: el formulario pide los dos valores y calcula la diferencia; la norma no fija redondeo (#6).
>
> **Certeza**: media. **Riesgo**: ambas, por céntimos.

> **F3 — Saldo medio del cuarto trimestre de una cuenta del 720.**
>
> Criterio:
> - Media de los saldos al cierre de cada día natural.
> - El periodo va del 1/10 (o del primer movimiento de la cuenta, si es posterior) al 31/12.
> - Una cuenta cerrada en el trimestre cuenta con saldo cero desde el cierre.
> - Se convierte al tipo del 31/12.
>
> Fundamento: art. 42 bis.2.d) RD 1065/2007; DGT V0119-14 y V0630-25; FAQ 720 (valoración).
>
> **Certeza**: alta en el tipo, media en el método y en el divisor. **Riesgo**: conservador (el divisor corto sube la media).

> **F4 — Clasificación y valoración en el 720 de ETF, ETC y ETP.**
>
> Criterio:
> - ETF: clave I, a su valor liquidativo a 31/12.
> - ETC y ETP (también los de cripto): clave V, subclave 2 (deuda), a su cotización a 31/12.
> - Todos en el bloque único de valores (art. 42 ter.4.c).
> - Ningún ETP va al 721.
>
> Fundamento: FAQ 720 sobre ETF (clave I) y DGT V1013-25; para ETC/ETP, analogía con la DGT V0267-25, sin pronunciamiento sobre el 720.
>
> **Certeza**: alta para ETF, baja para ETC/ETP. **Riesgo**: ambas. El bloque es uno, así que el umbral no cambia; si el ETP de cripto fuera al 721, el 720 estaría sobredeclarado y el 721 infradeclarado.

> **F5 — Qué pérdida original lleva cada diferido, a efectos del formulario.**
>
> Criterio:
> - La pérdida imputable de cada operación y la 0395 de cada año se derivan del diferido pendiente al cierre de cada ejercicio, atribuido a su pérdida original.
> - Un diferido generado por una transmisión con resultado propio positivo pertenece a las pérdidas que ella liberó, a prorrata.
> - Con resultado propio negativo, primero al propio.
>
> Fundamento: estructura del formulario de 2025 (pérdida obtenida e imputable por operación; 0394–0396 para ejercicios anteriores); ayuda de Renta WEB sobre la «integración diferida de determinadas pérdidas por recompra».
>
> **Certeza**: baja. **Riesgo**: neutro; no cambia ningún total, solo en qué fila va cada importe.

---

## Notas

Ninguna bloquea. Las anoto porque la dirección pidió que se dijera lo que parezca equivocado o nuevo.

- **N1 — El efectivo se mueve en la fecha de negocio, no en la de liquidación.** Una compra de acciones del 30/12 que liquida el 02/01 ya ha restado el efectivo a 31/12 en el libro. El extracto del bróker puede decir otra cosa. Es coherente con el resto del sistema y no lo cambio; la salida del 720 lo dice (S15).
- **N2 — Lo que el criterio #11 debería añadir, según las fuentes oficiales.**
  - El **tipo del 31/12 convierte también el saldo medio** (certeza alta).
  - Los **saldos negativos se netean** con los positivos para el umbral (FAQ, certeza alta), aunque la deuda por ventas en corto no resta (DGT V2412-18).
  - El **formato es en euros con dos decimales** y **no fija regla de redondeo** (anexo de la Orden HAP/72/2013).
  - Valores, IIC y seguros forman **un único bloque** con un solo umbral (art. 42 ter.4.c).
  - En las acciones cotizadas, la cotización a 31/12 es **una de tres valoraciones admitidas** (FAQ).
  - El efectivo en un bróker extranjero va como cuenta, clave C, subclave 5 (DGT V1102-13).
- **N3 — El 721 tiene regla de los 20.000 € y extinción** (art. 42 quater.6, certeza alta). Por la constitución IV entra un parámetro que el prompt no nombraba: `model_721_increase_eur` (20.000). Y solo cuenta el saldo a 31/12, no la media (DGT V1012-25).
- **N4 — El 721 existe desde el ejercicio 2023.** La validación rechaza un 721 anterior y la salida lo dice para años previos. Lo trato como `FIRST_SUPPORTED_YEAR`, con su fuente escrita: es la entrada en vigor de un modelo, no un umbral que pueda cambiar.
- **N5 — El BCE publica todos los 31/12 que caen entre semana.** Lo comprobé con los datos del BCE (USD) de 2018 a 2025. En 2022 (sábado) y 2023 (domingo), el último tipo es el del viernes 30/12 y el del 29/12. El 31/12 no es día de cierre de TARGET. No hace falta la pregunta que el prompt dejaba prevista.
- **N6 — La consulta vinculante V0267-25 (13/03/2025)** califica un ETC (deuda de una sociedad irlandesa, programa de ETP) como **rendimiento del capital mobiliario del art. 25.2**, «en todo caso», y le aplica la regla de los dos meses del propio art. 25.2.b). Afecta de lleno a la cuestión ETC/ETP, que es el hallazgo de mayor cuantía de la revisión. El ETC de la consulta es un producto apalancado sobre futuros de petróleo, no un ETC de oro físico, pero el razonamiento de la DGT se apoya en que es un valor de deuda, y eso vale igual para un ETC de oro. **No la resuelvo**: la dirección decide si cambia la certeza de la cuestión. Texto en la base de consultas de la DGT (petete.tributos.hacienda.gob.es).
- **N7 — El caso práctico del Manual 2025** dice que las retenciones del capital mobiliario van «en la casilla [0597] de la página 21». En el formulario del BOE, la 0597 está en la página 23. El número coincide y solo cambia la página. Uso el formulario.
- **N8 — La base liquidable del ahorro (0510) no es calculable entera.** Es 0460 menos dos remanentes de reducciones (0506, 0507) que el libro no ve. La salida da 0460 y dice que 0510 depende de ellos, igual que la doble imposición.
- **N9 — La doble imposición** tiene número solo en su total (0588). La renta incluida en la base del ahorro y el impuesto pagado en el extranjero se teclean en una ventana de captura sin número. Salen como conceptos sin casilla, y el primer límite con su rótulo.
- **N10 — De un bien extinguido**, el 720 pide el valor a la fecha de extinción (y, en una cuenta cancelada, al tipo de esa fecha). Esta feature decide si hay que presentar, no rellena el modelo: la salida nombra el bien extinguido y su fecha, sin ese valor.
- **N11 — Un ETF en una comercializadora española no está exento por eso** (DGT V1013-25). En las IIC cotizadas, la obligación de informar es del depositario. Con la regla «país de la cuenta», un ETF en una cuenta española queda fuera, correcto si el depositario es español. Si alguna vez se compra un ETF en MyInvestor, habrá que comprobarlo.
- **N12 — La recompra no tiene casilla con número.** Renta WEB tiene una «casilla habilitada» (una marca en su ventana) para declarar la pérdida no computable. La salida lo dice así: «marca la pérdida como no computable por recompra (sin número en el formulario)».
- **N13 — `TaxOptions.filed` desaparece.** Los tests de la 009 que lo usan pasan a construir presentaciones con `LedgerBuilder`, con los mismos literales. Mantenerlo sería una segunda puerta al ancla que la CLI o la web podrían usar sin el libro.
- **N14 — El prompt dice que el 720 «es la única ruta fiscal que lee precios».** El 721 también los lee, en el mismo módulo y por la misma puerta. Sin consecuencia, pero los documentos deberían decir «los modelos informativos».
- **N15 — «Importe global» por fondo en el formulario.** Los apartados de IIC y de ETF piden importes globales por sociedad o fondo. Juntar en una fila una venta con pérdida diferida y otra con ganancia hace imposible decir la parte imputable. Por eso F2 propone una fila por operación, con el mismo NIF repetido.

---

## Casillas de 2025

Fuentes:

- **Orden HAC/277/2026**, de 25 de marzo (BOE núm. 76, de 27/03/2026, `BOE-A-2026-7041`, https://www.boe.es/diario_boe/txt.php?id=BOE-A-2026-7041). Su Anexo I, el formulario, se publica como imágenes: `https://www.boe.es/datos/imagenes/disp/2026/76/7041_16815484_<página>.png`. El Anexo C.3 es la imagen `_49`.
- **Manual práctico de Renta 2025**: https://sede.agenciatributaria.gob.es/Sede/Ayuda/25Manual/100.html
- **Ayuda de Renta WEB 2025**: https://sede.agenciatributaria.gob.es/Sede/Ayuda/25Presentacion/100.html

Todas las casillas de abajo tienen **certeza alta**: número y rótulo vistos en el formulario del BOE de 2025, en la página que se indica. En el commit del bloque 2, cada rótulo se transcribe **literal** de la imagen, con su URL y la fecha. Donde aquí va abreviado con «…», allí va entero.

| Concepto | Casilla(s) | Rótulo (formulario 2025) | Página |
|---|---|---|---|
| Intereses | 0027 | Intereses de cuentas, depósitos y activos financieros en general | 5 |
| Dividendos | 0029 | Dividendos y demás rendimientos por la participación en fondos propios de entidades | 5 |
| Transmisión de activos financieros (`movable_capital`) | 0031 | Rendimientos procedentes de la transmisión, amortización o reembolso de otros activos financieros | 5 |
| Total ingresos íntegros | 0036 | Total ingresos íntegros ([0027] + … + [0035]) | 5 |
| Gastos de administración y depósito | 0037 | Gastos fiscalmente deducibles: gastos de administración y depósito de valores negociables, exclusivamente | 5 |
| Rendimiento neto / reducido / a integrar | 0038 / 0040 / 0041 | Rendimiento neto; Rendimiento neto reducido; Suma de rendimientos reducidos … a integrar en la base imponible del ahorro | 5 |
| IIC, por operación | 0311, 0312, 0315, 0316, 0320, 0321, 0322 | NIF; Importe global de las transmisiones; Importe global de las adquisiciones; Ganancias; Ganancias reducidas no exentas; Pérdidas; Pérdidas imputables a 2025 | 14 |
| IIC, totales | 0324 / 0325 | Suma de ganancias / pérdidas … de IIC o SOCIMI | 14 |
| ETF, por operación | 2225, 2226, 2227, 2229, 2230, 2232, 2233, 2234 | NIF; Denominación; Importe global de las transmisiones; … de las adquisiciones; Ganancias; Ganancias no exentas; Pérdidas; Pérdidas imputables a 2025 | 14 |
| ETF, totales | 2235 / 2236 | Suma de ganancias / pérdidas … art. 75.3.j) del Reglamento | 14 |
| Acciones negociadas, por operación | 0327, 0328, 0331, 0332, 0336, 0337, 0338 | Denominación (entidad emisora); Importe global de las transmisiones; Valor de adquisición global; Ganancias; Ganancias reducidas no exentas; Pérdidas. Importe obtenido; Pérdidas. Importe computable | 14 |
| Acciones negociadas, totales | 0339 / 0340 | Suma de ganancias / pérdidas … de acciones negociadas | 14 |
| Monedas virtuales, por operación | 1802, 1804, 1806, 1807, 1808, 1809, 1811, 1812 | Denominación; Valor de transmisión; Valor de adquisición; Pérdida obtenida; Pérdida imputable a 2025; Ganancia obtenida; Ganancia no exenta; Ganancia no exenta imputable a 2025 | 15 |
| Monedas virtuales, totales | 1813 / 1814 | Suma de pérdidas / ganancias … monedas virtuales | 15 |
| Pérdidas de ejercicios anteriores imputables a 2025 | 0395 / 0396 | Importe de la pérdida … que procede imputar a 2025 / Suma … | 17 |
| Suma de ganancias / de pérdidas | 0422 / 0423 | Suma de ganancias patrimoniales / Suma de pérdidas patrimoniales | 18 |
| Saldo neto de ganancias y pérdidas | 0424 / 0425 | Saldo neto … a integrar en la base imponible del ahorro (positivo / negativo) | 18–19 |
| Saldo neto de rendimientos | 0429 / 0430 | Saldo neto positivo / negativo del rendimiento de capital mobiliario … | 18–19 |
| Fase 1 (25 %) | 0436 / 0446 | Saldos netos negativos de rendimientos … con el límite del 25 por 100 de [0424] / de ganancias y pérdidas … con el límite del 25 por 100 de [0429] | 19 |
| Pendientes de ganancias contra ganancias, 2021–2024 | 0439, 0440, 0441, 0442 | Saldos netos negativos de ganancias y pérdidas patrimoniales de 20XX, pendientes de compensación a 1 de enero de 2025 … | 19 |
| Pendientes de rendimientos contra ganancias, 2021–2024 | 0443, 0444, 0445, **0447** | Resto de saldos netos negativos de rendimientos … de 20XX … con el límite del 25 por 100 de [0424] | 19 |
| Pendientes de rendimientos contra rendimientos, 2021–2024 | 0449, 0450, 0451, 0452 | Saldos netos negativos de rendimientos del capital mobiliario, de 20XX, pendientes … | 19 |
| Pendientes de ganancias contra rendimientos, 2021–2024 | 0453, 0454, 0455, **0448** | Resto de saldos netos negativos de ganancias y pérdidas patrimoniales de 20XX … con el límite del 25 por 100 de [0429] | 19 |
| Base imponible del ahorro | 0460 | Base imponible del ahorro ([0424] – [0436] – … – [0448]) | 19 |
| Anexo C.3, ganancias y pérdidas | 1259–1269, 1270 | Pendiente al principio / aplicado / pendiente en ejercicios futuros, por año; saldo negativo de 2025 | C.3 |
| Anexo C.3, rendimientos | 1272–1282, 1283 | Ídem para rendimientos | C.3 |
| Retenciones de rendimientos del capital mobiliario | 0597 | Por rendimientos del capital mobiliario | 23 |
| Retenciones de reembolsos de fondos | 0603 | Por ganancias patrimoniales, incluidos premios | 23 |
| Deducción por doble imposición internacional | 0588 | Por doble imposición internacional, por razón de las rentas obtenidas y gravadas en el extranjero | 23 |

**Lo que no se codifica, y por qué**:

- **La base liquidable del ahorro (0510)**: el motor no la calcula entera (N8).
- **Los campos de la ventana de la doble imposición**: no tienen número (N9).
- **La recompra**: es una marca sin número (N12).
- **«Otros elementos patrimoniales» (1624 y siguientes)**: solo recibirían los ETC/ETP en ganancias, que F1 deja sin casilla. En el anexo C.3 no hay casilla de «pendiente en ejercicios futuros» para 2021: caduca ese año.
- **Las casillas 0510, 0588, 0597 y 0603**: se enseñan, pero la salida dice qué parte de su importe calcula el motor (el primer límite en 0588; en 0597 y 0603, las retenciones que constan en el libro).

## Procedimiento para añadir un ejercicio nuevo

Para que la dirección lo traslade a `docs/`. El primer ejercicio real del usuario será 2026 y sus casillas se publicarán en marzo de 2027.

1. **Esperar a la orden del BOE** que aprueba el Modelo 100 del ejercicio (suele salir en marzo). Descargar las imágenes de su Anexo I (`https://www.boe.es/datos/imagenes/disp/<año>/<n.º BOE>/<id>_<página>.png`) y localizar el Manual práctico y la ayuda de Renta WEB del ejercicio en la sede de la AEAT.
2. **Por cada concepto de `tax/boxes/concepts.ts`**, buscar su casilla **en el formulario de ese ejercicio**. Nunca copiar de la tabla del año anterior. Transcribir el rótulo literal y anotar la URL de la imagen, la fecha de comprobación y la certeza: alta si se ve en el formulario del año; si no, no entra.
3. **Comparar con la tabla del año anterior** solo después, como control, y enumerar los cambios. En 2025 fueron el apartado nuevo de los ETF y los años de origen de los pendientes, que se desplazan un año.
4. **Si el formulario cambia de estructura** (un apartado nuevo, una fila que desaparece), es un cambio de conceptos y no de datos: una feature, con sus preguntas.
5. **Crear `tax/boxes/years/<año>.ts`**, añadir la Renta de ese año calculada a mano sobre un libro de prueba y dejar que el test «nunca la casilla de otro ejercicio» la cubra.
6. **Revisión de la dirección antes de fusionar**, casilla a casilla contra la imagen.

---

## Cálculos a mano

Método de la 009. Aquí están **el diseño del libro y las cifras calculadas a mano** con los supuestos recomendados. Tras las respuestas, cada cálculo se completa paso a paso (conversiones, lotes, redondeos) y **se comitea antes que el código** que lo calcula (plan §6). Después, el test copia estos literales. Todos los importes son en euros salvo que se diga otra cosa.

### §6.1 — Un 720 a 31/12/2027 (viernes)

**Catálogo**:
- `acc_es`: MyInvestor, `ES`. Contiene `fund_es` (fondo) y efectivo.
- `acc_ib`: IBKR, `IE`, cartera. Contiene `etf_us` (ETF en USD), `etc_au` (ETC en EUR), `etp_bt` (ETP en EUR) y efectivo en EUR y USD.
- `acc_ib2`: IBKR, `IE`, cubo. Contiene `stock_x` (acciones en EUR) y efectivo en EUR.

**Eventos de 2027** (todos con fecha fiscal = fecha valor):

| Fecha | Cuenta | Evento |
|---|---|---|
| 04/01 | `acc_es` | Ingreso de 100.000,00 |
| 05/01 | `acc_es` | Compra de `fund_es` por 60.000,00; efectivo 40.000,00 |
| 01/03 | `acc_ib` | Ingreso de 53.500,00 |
| 02/03 | `acc_ib` | Compra de 1.000 `etc_au` a 20,00 |
| 03/03 | `acc_ib` | Compra de 2 `etp_bt` a 3.500,00 |
| 04/03 | `acc_ib` | `fx_exchange`: vende 16.500,00 EUR y compra 18.000,00 USD; EUR queda en 10.000,00 |
| 05/03 | `acc_ib` | Compra de 100 `etf_us` a 150,00 USD; USD queda en 3.000,00 |
| 01/06 | `acc_ib2` | Ingreso de 6.500,00 |
| 02/06 | `acc_ib2` | Compra de 100 `stock_x` a 60,00; efectivo 500,00 |
| 16/11 | `acc_ib` | Ingreso de 4.000,00 EUR |
| 01/12 | `acc_ib` | Ingreso de 2.500,00 USD (tipo 1,08, del 01/12) |
| 20/12 | `acc_ib2` | Retirada de 2.000,00; efectivo −1.500,00 |
| 30/12 | `acc_ib2` | Valoración de `stock_x` a 60,00: **fechada el 30/12** |
| 31/12 | `acc_ib` | Retirada de 2.000,00 EUR |
| 31/12 | `acc_ib` | Valoraciones: `etf_us` a 165,01 USD (tipo 1,10, del 31/12); `etc_au` a 22,00; `etp_bt` a 4.000,0025 |
| 31/12 | `acc_es` | Valoración de `fund_es` a su precio |

**Fuera del cálculo**: `acc_es`, porque es española. Si contara, sus 40.000,00 de efectivo llevarían las cuentas a 55.500,00, por encima del umbral. La exclusión decide el veredicto.

**Cuentas**. El trimestre tiene 92 días.

- **`acc_ib` en EUR**: 46 días a 10.000,00 (1/10–15/11), 45 días a 14.000,00 (16/11–30/12) y 1 día a 12.000,00 (31/12).
  - Suma de saldos diarios: 1.102.000,00.
  - Media: 1.102.000,00 / 92 = 11.978,2608695…
- **`acc_ib` en USD**: 61 días a 3.000,00 (1/10–30/11) y 31 días a 5.500,00 (1/12–31/12).
  - Suma: 353.500,00 USD.
  - Media: 3.842,3913043… USD, que al tipo del 31/12 (1,10) son 3.493,0830039… €.
  - Saldo a 31/12: 5.500,00 USD / 1,10 = 5.000,00 €.
- **Bien `acc_ib`**:
  - Saldo a 31/12: 12.000,00 + 5.000,00 = **17.000,00**.
  - Media: 11.978,2608695… + 3.493,0830039… = 15.471,3438735… → **15.471,34**.
- **`acc_ib2` en EUR**: 80 días a 500,00 (1/10–19/12) y 12 días a −1.500,00 (20/12–31/12).
  - Suma: 40.000,00 − 18.000,00 = 22.000,00.
  - Media: 22.000,00 / 92 = 239,1304347… → **239,13**.
  - Saldo a 31/12: **−1.500,00**, que se netea con los demás.
- **Categoría**:
  - Saldo a 31/12: 17.000,00 − 1.500,00 = **15.500,00**.
  - Saldo medio: 15.471,34 + 239,13 = **15.710,47**.
  - Los dos saldos están por debajo del umbral, todos los tipos son del 31/12 y ningún bien lleva marca → **no obligado**.

**Valores**:

| Bien | Cálculo | Exacto | Redondeado | Marca |
|---|---|---|---|---|
| `etf_us` | 100 × 165,01 USD / 1,10 | 15.000,9090… | 15.000,91 | — |
| `etc_au` | 1.000 × 22,00 | 22.000,00 | 22.000,00 | — |
| `etp_bt` | 2 × 4.000,0025 | 8.000,005 | **8.000,01** (half-up; half-even daría 8.000,00) | — |
| `stock_x` | 100 × 60,00 | 6.000,00 | 6.000,00 | **valoración del 30/12** |

- **Suma de los bienes redondeados: 51.000,92.** La suma exacta, redondeada una sola vez, sería 51.000,91. Esa diferencia es la lectura del #6: se redondea cada bien y luego se suma.
- **Veredicto: obligado, decidido con un valor marcado.** Con `stock_x` la suma supera el umbral; sin él quedaría en 45.000,92, por debajo. La salida lo dice y nombra la valoración del 30/12.
- **Aviso previo**: sin el valor marcado (45.000,92), la categoría ya está por encima de 45.000.

### §6.2 — La regla de los 20.000 € con dos 720 sucesivos

**Libro**: `acc_ib` (`IE`), con `etf_a` (ETF en EUR), `etc_b` (ETC en EUR) y efectivo en EUR. Una valoración de cada activo cada 31/12. El 31/12/2028 cae en domingo: la valoración va fechada el 31/12 y, al estar en euros, no hay tipo que comprobar.

| Año | Valores (bienes) | Valores, total | Cuentas (31/12 · media) | Veredicto de valores | Veredicto de cuentas |
|---|---|---|---|---|---|
| 2027 | `etf_a` 600 × 50,00 = 30.000,00; `etc_b` 300 × 100,00 = 30.000,00 | **60.000,00** | 10.000,00 · 10.000,00 | **Obligado** (primera vez) | No obligado |
| | *Se presenta el 720 de 2027 el 15/03/2028: valores 60.000,00, con sus dos bienes* | | | | |
| 2028 | `etc_b` compra 20 más; `etf_a` 600 × 80,00 = 48.000,00; `etc_b` 320 × 100,00 = 32.000,00 | **80.000,00** | 10.000,00 · 10.000,00 | **No obligado**: +20.000,00 no es «más de» | No obligado |
| 2029 | `etf_a` 48.000,00; `etc_b` 320 × 100,00003125 = 32.000,01 | **80.000,01** | **50.000,01** · 10.434,78 | **Obligado**: +20.000,01 sobre **2027**. Sobre 2028 serían +0,01: así muere el mutante «el penúltimo» o «el año anterior» | **Obligado**: la categoría no se declaró antes y supera 50.000 |
| | *Se presenta el 720 de 2029 el 20/03/2030: valores 80.000,01 (48.000,00 + 32.000,01); cuentas 50.000,01 · 10.434,78* | | | | |
| 2030 | `etc_b` vendido entero el 10/05; `etf_a` 600 × 90,00 = 54.000,00 | **54.000,00** (baja) | 30.434,79 · 30.434,79 | **Obligado por extinción** de (`acc_ib`, `etc_b`) sin subir | **Obligado**: la media sube +20.000,01 sobre 10.434,78; el saldo a 31/12 baja. Así muere el mutante «solo el 31/12» |

Los saldos de las cuentas:

- **2029**: 10.000,00 del 1/10 al 30/12 (91 días) y 50.000,01 el 31/12, tras un ingreso de 40.000,01.
  - Media: (910.000,00 + 50.000,01) / 92 = 10.434,7827… → **10.434,78**.
- **2030**: una retirada de 19.565,22 el 30/09 deja 30.434,79 todo el trimestre.
  - La venta de `etc_b` se retira el mismo día y no toca el efectivo.
  - Variante de borde: con 30.434,78, la subida es +20.000,00 y no obliga.

### §6.3 — Una complementaria

**Libro**: `acc_a` (`ES`) con `fund_f` (fondo) y `stock_s` y `stock_t` (acciones), todo en EUR. Configuración por defecto.

**2027**:

| Fecha | Evento | Resultado |
|---|---|---|
| 10/01 | Compra de 100 `fund_f` a 10,00 | |
| 01/02 | Compra de 10 `stock_s` a 100,00 | |
| 01/06 | Venta de 10 `stock_s` a 50,00 | −500,00. La única compra de la ventana la consume la propia venta (#18): computable |
| 10/11 | Venta de 100 `fund_f` a 12,00 | +200,00 |
| 20/12 | Interés | 40,00 |

- Ganancias −300,00; rendimientos 40,00.
- Fase 1: 25 % × 40,00 = 10,00, así que ganancias −290,00 y rendimientos 30,00.
- **Base 30,00; pendiente de 2027: −290,00.**

**2028**: compra de 10 `stock_t` a 100,00 el 01/02; venta a 180,00 el 01/09, **+800,00**.

**Registros, en orden de fichero**:

1. **F1**, Renta de 2027, presentada el 10/06/2028. Declarado = calculado: base 30,00; pendiente −290,00; diferido 0,00.
2. **Corrección** el 01/10/2028: la venta de `fund_f` era a 13,00, así que +300,00. **Avisa**, por fecha, de la Renta de 2027: el pendiente pasa de −290,00 a −190,00 (ganancias −200,00 + 10,00) y la base no se mueve.
3. **F2**, complementaria (`supersedes` F1), presentada el 05/11/2028.
   - Calculado: base 30,00; pendiente −190,00.
   - **Declarado: base 30,00; pendiente −200,00.** El usuario lo cambió al presentar.
4. **Interés tardío** de 20,00, fechado el 28/12/2027 y registrado el 05/01/2029. **Avisa**: la base pasa de 30,00 a 45,00 y el pendiente de −190,00 a −185,00.
5. **`settings_changed`** del 06/01/2029: `savings_offset_limit_pct` pasa de 25 a 20. **Avisa**: 2027 pasa a una base de 48,00 y un pendiente de −188,00.

**Anular F1: rechazado** (F2 la ha consumido). Anular F2: aceptado, y F1 vuelve a estar en vigor.

**2028 a fecha 10/01/2029**, con límite del 20 %:

- **Ancla F2** (−200,00): 800,00 − 200,00 = **base 600,00**.
- Con F1 como ancla (mutante): 510,00. Sin ancla (mutante): 800,00 − 188,00 = 612,00.
- **A fecha 01/08/2028**, anterior al `filed_at` de F2, está en vigor F1: **510,00**.

**Comparación de 2027 a fecha 10/01/2029**:

| Lectura | Base | Pendiente 2027 |
|---|---|---|
| Declarado (F2) | 30,00 | −200,00 |
| Calculado entonces (F2) | 30,00 | −190,00 |
| R0: prefijo de F2, configuración de F2 (25 %) | 30,00 | −190,00 |
| R1: prefijo de F2, configuración de hoy (20 %): límite 8,00 | 32,00 | −192,00 |
| Hoy: todo el libro, 20 %: rendimientos 60,00, límite 12,00 | 48,00 | −188,00 |

| Causa | Base | Pendiente |
|---|---|---|
| Al presentar (calculado − declarado) | 0,00 | +10,00 |
| Motor (R0 − calculado) | 0,00 | 0,00 |
| Configuración (R1 − R0) | +2,00 | −2,00 |
| Eventos posteriores (hoy − R1) | +16,00 | +4,00 |
| **Total = hoy − declarado** | **+18,00** | **+12,00** |

La causa «motor» se prueba aparte: en otro test, un `computed` escrito como lo habría escrito un motor anterior (base 31,00) da **−1,00** de motor.

### §6.4 — La Renta de 2025 por casillas

**Libro**:
- `acc_mi` (`ES`): `fund_a`.
- `acc_ib` (`IE`): `etf_w`, `stock_s`, `stock_t`, `coin_c` y `etc_g`.
- Todo en EUR salvo el dividendo. `treaty_withholding_pct: { US: "15" }`.

| Fecha | Evento | Qué ejercita |
|---|---|---|
| 10/01/2024 | Compra de 100 `fund_a` a 10,00 | Fuera de la ventana de un año de la venta de 2025 |
| 01/10/2024 | Compra de 10 `stock_t` a 100,00 | |
| 04/11/2024 | Venta de 10 `stock_t` a 80,00: −200,00 | |
| 02/12/2024 | Compra de 10 `stock_t` a 85,00 | Recompra: **difiere los −200,00 enteros**; computable de 2024: 0 |
| *20/06/2025* | *Renta de 2024 presentada: base 0,00; pendiente de 2023 −300,00 (de antes de la aplicación); diferido −200,00* | Ancla |
| 15/01/2025 | Compra de 10 `etf_w` a 100,00 | |
| 20/01/2025 | Compra de 10 `stock_s` a 50,00 | |
| 03/02/2025 | Venta de 10 `stock_t` a 95,00: propio +100,00; libera −200,00; ninguna compra en la ventana | Computable −100,00 |
| 10/02/2025 | Compra de 1 `coin_c` a 1.000,00 | |
| 03/03/2025 | Reembolso de 40 `fund_a` a 9,00: −40,00 | |
| 10/03/2025 | Compra de 5 `etc_g` a 200,00 | |
| 05/05/2025 | Suscripción de 20 `fund_a` a 9,50 | Difiere 20/40 de −40,00 = −20,00 |
| 15/05/2025 | Dividendo de `stock_s`: 50,00 USD brutos, 7,50 USD retenidos en origen, tipo 1,25, `US` | 40,00 €; impuesto extranjero 6,00 € |
| 02/06/2025 | Venta de 10 `stock_s` a 45,00: −50,00 | |
| 01/09/2025 | Venta de 10 `etf_w` a 120,00: +200,00 | |
| 01/10/2025 | Venta de 5 `etc_g` a 190,00: −50,00 | |
| 10/11/2025 | Reembolso de 60 `fund_a` a 11,00: +60,00; retención 11,40 | |
| 01/12/2025 | Venta de 1 `coin_c` a 1.300,00: +300,00 | |
| 15/12/2025 | Custodia de 10,00 (`fee_kind: custody`) | |
| 31/12/2025 | Interés en `acc_mi` de 100,00, retención 19,00 | |

**Las casillas de 2025** (con F1, F2 y F5):

| Apartado | Casillas |
|---|---|
| IIC, fila del 03/03 | 0312 **360,00** · 0315 **400,00** · 0321 **40,00** · 0322 **20,00** · 0311 *falta en tus datos* |
| IIC, fila del 10/11 | 0312 **660,00** · 0315 **600,00** · 0316 / 0320 **60,00** |
| IIC, totales | 0324 **60,00** · 0325 **20,00** · retención en 0603 **11,40** |
| ETF | 2227 **1.200,00** · 2229 **1.000,00** · 2230 / 2232 **200,00** · 2235 **200,00** · 2236 **0,00** · 2225 *falta* |
| Acciones, `stock_s` | 0328 **450,00** · 0331 **500,00** · 0337 **50,00** · 0338 **50,00** |
| Acciones, `stock_t` | 0328 **950,00** · 0331 **850,00** · 0332 / 0336 **100,00** |
| Acciones, totales | 0339 **100,00** · 0340 **50,00** |
| Monedas virtuales | 1804 **1.300,00** · 1806 **1.000,00** · 1809 / 1811 / 1812 **300,00** · 1814 **300,00** · 1813 **0,00** |
| ETC (`etc_g`, en ganancias) | **Sin casilla** (F1): pérdida de **50,00**, por conceptos |
| Ejercicios anteriores | 0395 **200,00** (la pérdida de 2024 de `stock_t`, liberada) · 0396 **200,00** |
| Saldo | 0422 **660,00** · 0423 **320,00** (20 + 50 + 50 + 200; incluye los 50,00 del ETC, que no tiene casilla, y la salida lo dice) · **0424 340,00** |
| Rendimientos | 0027 **100,00** · 0029 **40,00** · 0036 **140,00** · 0037 **10,00** · 0038 / 0040 / 0041 / 0429 **130,00** · retención en 0597 **19,00** |
| Compensación | 0441 **300,00** (el pendiente de 2023, contra las ganancias) · anexo C.3: 1264 **300,00**, 1265 **300,00**, 1266 **0,00** |
| Base imponible del ahorro | **0460 170,00** (340,00 − 300,00 + 130,00) |
| Doble imposición | Primer límite **6,00** (15 % de 40,00), **no** el importe de la 0588 |
| Diferido pendiente a 31/12/2025 | −20,00, sobre la suscripción del 05/05 |

**Contraste con el motor**: las ganancias computables son −20 + 60 + 200 − 50 − 100 + 300 − 50 = **340,00**, lo mismo que la 0424.

**El mismo libro en 2024**: base 0,00 y diferido −200,00, **por conceptos y sin ningún número de casilla**, con la nota `tax_boxes_missing_year`.

---

## Documentos que la dirección tendrá que actualizar

No he tocado `docs/`, salvo el primer commit que trae la PR #60.

| Documento | Qué |
|---|---|
| `docs/data-schema.md` §3 | `tax_return_filed` pasa de previsto a definido; 25 tipos |
| `docs/data-schema.md` §5 | Si se acepta Q1: la huella de las presentaciones y que `compact` la verifica y la vuelve a sellar |
| `docs/data-schema.md` §6 | Subsección nueva: forma del evento (plan §1.1), validación, cadena de complementarias, anular una sustituida se rechaza. §6.1: los parámetros nuevos de `Settings` |
| `docs/data-schema.md` §7 | Pasada A'' (presentaciones, filtradas por `filed_at`); `filings` en la instantánea sin la huella; el ejercicio cerrado |
| `docs/business-rules.md` §5.5 | El arrastre anclado en lo declarado; la cadena empieza en la primera Renta presentada (P5) |
| `docs/business-rules.md` §5.8 | Los dos saldos y su tipo; el saldo medio (F3); el neteo de negativos; el bloque único de valores; ETF en clave I; extinción (Q7); el 721 con sus 20.000 € y su extinción, desde 2023, solo a 31/12 |
| `docs/business-rules.md` §7 | `model_720_threshold_eur`, `model_720_increase_eur`, `model_721_threshold_eur`, `model_721_increase_eur`, las alertas con su valor por defecto y la temporada de Renta |
| `docs/fiscal-questions.md` | #11 (N2); fichas F1–F5 numeradas; la V0267-25 en la cuestión ETC/ETP (N6); el apartado «lo que el criterio dice bien pero se queda corto» del 721 |
| `docs/specification.md` | §13: lo que la Fase 5 ya entrega; §14.1: la valoración a 31/12 resuelta como Nivel 1 |
| `docs/` (nuevo o en `business-rules.md`) | El procedimiento para añadir un ejercicio de casillas |
| ADR-0020 | Si se acepta Q1: la huella y el resellado en `compact` |
