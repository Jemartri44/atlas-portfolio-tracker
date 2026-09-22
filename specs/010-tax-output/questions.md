# Preguntas abiertas — feature `010-tax-output`

Estas preguntas tocan asuntos que el prompt no me deja resolver por mi cuenta: criterios fiscales, decisiones estructurales y contradicciones entre el prompt, los documentos y el código.

Cada pregunta trae **contexto suficiente para contestarla sin abrir el código**, las opciones con su coste y **mi recomendación**. `spec.md` y `plan.md` están escritos con el supuesto recomendado (S1–S17 de `spec.md`). Si una pregunta queda sin respuesta, se implementa ese supuesto.

Van ordenadas por lo que cuesta cambiarlas después. **Hay cinco criterios nuevos (fichas F1–F5)** que la salida no puede evitar decidir. Cada uno lleva una ficha con la certeza y la dirección del riesgo que propongo, para que la dirección los numere en `docs/fiscal-questions.md` antes de codificarlos.

Las fuentes oficiales se consultaron el 2026-09-19 con dos búsquedas independientes. Los números de casilla que se usan salen de las imágenes del formulario del BOE. **Comprobé yo mismo** tres cosas: las casillas de compensación (0424–0460), el apartado nuevo de los ETF (2224–2236) y el texto completo de la consulta V0267-25. Lo que no cuadra con el prompt está en las notas N1–N15.

---

> **Todas respondidas por la dirección el 2026-09-19**, antes de escribir código. Las once recomendaciones se aceptan (Q10, con un test añadido). Q2 trae además **una decisión fiscal nueva**: los ETC y los ETP pasan a ser rendimiento del capital mobiliario por defecto. El documento de criterios lo actualiza otro agente en la PR #60; el catálogo `FISCAL_CRITERIA` seguirá lo que ese documento diga (test anti-deriva de la 009).

## Respuestas de la dirección (2026-09-19)

| # | Respuesta | Qué cambia respecto al supuesto |
|---|---|---|
| **Q1** | **Aceptada**: huella sobre el contenido migrado a su propia versión; `compact` comprueba que las huellas de las presentaciones siguen cuadrando (y las vuelve a sellar) | Nada |
| **Q2** | **Decisión nueva**, a raíz de la V0267-25 y porque es la opción prudente (una pérdida como rendimiento del capital mobiliario solo compensa ganancias hasta el 25 %): **`income_category.etc` = `movable_capital` por defecto, certeza alta**; **`income_category.etp` = `movable_capital` por defecto, certeza media** (depende de la estructura de cada producto; casi todos los ETP de cripto europeos son notas de deuda). Los dos siguen siendo configurables. Entra en el **bloque 0**, con la predicción de lo que mueve en `synthetic-v1.tax.json` escrita y comiteada antes y parada si se mueve algo no previsto | **F1**: ETC y ETP van a la **0031** por defecto; ya no se quedan sin casilla. Un bloque 0 con un commit más (plan §0.3) |
| **Q3** | **Aceptada** (F2): una fila por operación, cada importe redondeado, aviso si difiere un céntimo | Nada |
| **Q4** | **Aceptada** (F3): el primer movimiento como fecha de apertura, con su certeza declarada | Nada |
| **Q5** | **Aceptada**: «no se puede determinar», con cómo resolverlo. Un evento para anotar tipos es una decisión aparte, **fuera de esta feature** | Nada |
| **Q6–Q9** | **Aceptadas** las cuatro recomendaciones | Nada |
| **Q10** | **Aceptada** (F5), **con un test** en el que el #21 vuelva a aplazar una pérdida liberada y las filas sumen exactamente lo que da el motor | Un test con nombre (plan §2.2) |
| **Q11** | **Aceptada**: en temporada **o** cuando hay algo que hacer; «no se puede determinar» cuenta | Nada |
| N3 | **`model_721_increase_eur` aprobado** (art. 42 quater.6) | Nada |

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

Más abajo están también las **fichas F1–F5** (F4 no tiene pregunta propia: es la clasificación del 720), las **notas N1–N15**, las **casillas de 2025** con su fuente, el **procedimiento para añadir un ejercicio**, los **cuatro cálculos a mano**, la **lista de documentos** que la dirección tendrá que actualizar y, al final del todo, el **traspaso** con el estado de la rama.

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

> **F1 — Apartado de la Renta de cada transmisión** *(actualizada con la respuesta a Q2)*.
>
> Criterio:
> - `fund` y `money_market` → IIC (0310–0325).
> - `etf` → apartado de IIC del art. 75.3.j) RIRPF (2224–2236, nuevo en 2025).
> - `stock` → acciones negociadas (0326–0340).
> - `crypto` → monedas virtuales (1800–1814).
> - Categoría `movable_capital`, **que desde la respuesta a Q2 es la de `etc` y `etp` por defecto** → rendimientos procedentes de la transmisión, amortización o reembolso de otros activos financieros (**0031**), cada título por separado y con su signo (la ayuda de Renta WEB 2025: «Los rendimientos negativos se consignarán precedidos del signo menos (-)» y «El cómputo de cada rendimiento debe efectuarse, individualmente, por cada título o activo»).
> - Un `etc` o `etp` que el usuario configure en `capital_gain` → sin casilla, dicho en la salida: ningún texto oficial dice dónde iría.
>
> Fundamento: formulario de la Orden HAC/277/2026 y su preámbulo; ayuda de Renta WEB 2025; DGT V0267-25.
>
> **Certeza**: alta para fondos, ETF, acciones, cripto y ETC en 2025; media para ETP (sigue a su categoría).
>
> **Riesgo**: neutro en la base (todo suma en 0422/0423 o en 0036); lo que cambia es el cruce con los datos fiscales de la AEAT.

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
>
> **Añadido tras Q2.** Con los ETC en rendimientos del capital mobiliario, una pérdida diferida de un ETC no tiene apartado de «ejercicios anteriores» en el capital mobiliario: según la ayuda de la 0031, el rendimiento negativo diferido «se integrará a medida que se transmitan los activos financieros que permanezcan en el patrimonio». Se lleva a la **0031 del ejercicio en que se libera**, en la fila del título que la libera. Certeza media. El total de la 0031 coincide con el de transmisiones del capital mobiliario del informe.

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

- **N16 — El valor por defecto nuevo de los ETC y los ETP, frente a ADR-0022.** ADR-0022 dice que cambiar un valor por defecto no altera ningún libro ya escrito. Eso es cierto para un libro cuyo `settings_changed` materializa `income_category`, y no lo es para uno escrito antes de la materialización. En ese caso el tipo ausente toma el valor por defecto al leer. **El libro sintético es de estos**: sus tres `settings_changed` no tienen `income_category`. Por eso su informe se mueve, y la predicción lo enumera. El libro real está vacío, así que no hay nada que migrar. El informe ya lista `income_category.etc` y `.etp` en `settings.from_code`, lo que dice de dónde salió la categoría.
- **N17 — El libro a mano de la 009 cambia de configuración sin querer.** `exercise-ledger.ts` escribe `{...DEFAULT_SETTINGS, …}`, y su cálculo a mano dice «todo `capital_gain`». Con el valor por defecto nuevo, el test dejaría de ser el cálculo que dice codificar. En el commit del cambio de valor por defecto, ese libro fija `income_category` en `capital_gain` explícitamente, y sus literales no se mueven. Un test nuevo comprueba el mismo libro **con el valor por defecto nuevo** contra lo que el cálculo de la 009 ya hizo a mano para esa lectura: ganancias 462,50; rendimientos −26,00; 26,00 compensados en la fase 1 (límite 115,63); **base 175,70**. Los demás tests de la 009 que usan `etc` o `etp` con la configuración por defecto se enumeran en la predicción, uno por uno, antes de tocarlos.
- **N18 — El dudoso de la categoría se parte en dos.** Con el ETC en certeza alta deja de ser dudoso (la 009 llama dudoso a todo lo que no es de certeza alta, Q8). El ETP en certeza media sigue siéndolo. El catálogo sustituye `etc_etp_category` por las entradas que numere el documento, y el test anti-deriva lo exige.

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

Método de la 009: el diseño del libro con importes elegidos para el papel, el cálculo paso a paso y **el commit antes que el código** que lo calcula. Cuando llegue ese código, el test copia estos literales, y toda discrepancia se investiga y se documenta aquí sin tocar el literal hasta saber quién tenía razón.

**Estado (2026-09-19)**: los tres cálculos que exige el prompt (§6.1–§6.3) están **completos**, con las respuestas de la dirección ya aplicadas, y cada cifra se ha comprobado con aritmética decimal exacta. La Renta de 2025 por casillas (§6.4) está recalculada con el ETC como rendimiento del capital mobiliario. Todo va en este commit, que es anterior a cualquier código de la feature.

Convenciones:
- Importes en euros salvo que se diga otra cosa.
- En todas las operaciones, `trade_date = value_date`, y `fx_rate_date` es esa misma fecha (siempre de lunes a viernes).
- Las operaciones en euros llevan el tipo `"1"` y no tienen comisión.
- La configuración es un único `settings_changed` con los valores por defecto resueltos (umbral de 50.000, subida de 20.000 y aviso de 45.000 para el 720).

### §6.1 — Un 720 a 31/12/2027 (viernes)

**Catálogo**

| Cuenta | Libro | País | Activos |
|---|---|---|---|
| `acc_es` | núcleo | `ES` | `fund_es` (`fund`, EUR) |
| `acc_ib` | núcleo | `IE` | `etf_us` (`etf`, USD), `etc_au` (`etc`, EUR), `etp_bt` (`etp`, EUR) |
| `acc_ib2` | cubo | `IE` | `stock_x` (`stock`, EUR), con su tesis |

**Eventos**

| # | Fecha | Cuenta | Evento | Efectivo después |
|---|---|---|---|---|
| A1 | 04/01 | `acc_es` | `cash_deposit` 100.000,00 | 100.000,00 |
| A2 | 05/01 | `acc_es` | `buy` `fund_es`, `amount` 60.000,00 | 40.000,00 |
| A3 | 01/03 | `acc_ib` | `cash_deposit` 52.000,00 | EUR 52.000,00 |
| A4 | 02/03 | `acc_ib` | `buy` 1.000 `etc_au` a 20,00 | EUR 32.000,00 |
| A5 | 03/03 | `acc_ib` | `buy` 2 `etp_bt` a 3.500,00 | EUR 25.000,00 |
| A6 | 04/03 | `acc_ib` | `fx_exchange`: vende 15.000,00 EUR y compra 18.000,00 USD (tipos 1 y 1,2) | EUR 10.000,00 · USD 18.000,00 |
| A7 | 05/03 | `acc_ib` | `buy` 100 `etf_us` a 150,00 USD, tipo 1,2 | USD 3.000,00 |
| A8 | 01/06 | `acc_ib2` | `cash_deposit` 6.500,00 | 6.500,00 |
| A9 | 02/06 | `acc_ib2` | `buy` 100 `stock_x` a 60,00 | 500,00 |
| A10 | 16/11 | `acc_ib` | `cash_deposit` 4.000,00 EUR | EUR 14.000,00 |
| A11 | 01/12 | `acc_ib` | `cash_deposit` 2.500,00 USD, tipo 1,08 del 01/12 | USD 5.500,00 |
| A12 | 20/12 | `acc_ib2` | `cash_withdrawal` 2.000,00 | **−1.500,00** |
| A13 | 30/12 | `acc_ib2` | `valuation` `stock_x`: 100 a 60,00 EUR, **fechada el 30/12** | |
| A14 | 31/12 | `acc_ib` | `cash_withdrawal` 2.000,00 EUR | EUR 12.000,00 |
| A15 | 31/12 | `acc_ib` | `valuation` `etf_us`: 100 a 165,01 USD, tipo 1,10 del 31/12 | |
| A16 | 31/12 | `acc_ib` | `valuation` `etc_au`: 1.000 a 22,00 | |
| A17 | 31/12 | `acc_ib` | `valuation` `etp_bt`: 2 a 4.000,0025 | |
| A18 | 31/12 | `acc_es` | `valuation` `fund_es`: a su valor liquidativo | |

**Paso 1 — Qué cuenta.** `acc_es` es española y queda fuera entera, con su fondo y sus 40.000,00 de efectivo. Si contara, las cuentas sumarían 55.500,00 y obligarían: **la exclusión decide el veredicto**, y la salida lo dice. `acc_ib` y `acc_ib2` son irlandesas y cuentan. `acc_ib2` es del cubo: los dos libros se agregan como total fiscal (constitución III).

**Paso 2 — Cantidades a 31/12**, proyectadas con `asOf = 2027-12-31`:
- Posiciones físicas: `acc_ib`: `etf_us` 100, `etc_au` 1.000, `etp_bt` 2; `acc_ib2`: `stock_x` 100.
- Efectivo: `acc_ib` EUR 12.000,00 y USD 5.500,00; `acc_ib2` EUR −1.500,00.

**Paso 3 — El tipo del 31/12.** El último día de lunes a viernes no posterior al 31/12/2027 es el propio 31/12 (viernes). El último tipo del dólar que conoce el libro a esa fecha es el de A15: 1,10, fechado el 31/12. **No lleva marca.**

**Paso 4 — Saldo a 31/12, por bien (la cuenta)**:
- `acc_ib`: 12.000,00 + 5.500,00 / 1,10 = 12.000,00 + 5.000,00 = **17.000,00**.
- `acc_ib2`: **−1.500,00**.

**Paso 5 — Saldo medio del cuarto trimestre** (F3). Son 92 días naturales, del 1/10 al 31/12, y las dos cuentas existían antes del 1/10. Los saldos salen de proyecciones con `asOf` el 30/09 y en cada fecha del trimestre con movimiento de efectivo en una cuenta extranjera (16/11, 01/12, 20/12 y 31/12).

| Cuenta y divisa | Tramos (días × saldo al cierre del día) | Suma | Media |
|---|---|---|---|
| `acc_ib` EUR | 46 × 10.000,00 (1/10–15/11) + 45 × 14.000,00 (16/11–30/12) + 1 × 12.000,00 (31/12) | 1.102.000,00 | 11.978,26086956… |
| `acc_ib` USD | 61 × 3.000,00 (1/10–30/11) + 31 × 5.500,00 (1/12–31/12) | 353.500,00 USD | 3.842,39130434… USD → / 1,10 = 3.493,08300395… € |
| `acc_ib2` EUR | 80 × 500,00 (1/10–19/12) + 12 × −1.500,00 (20/12–31/12) | 22.000,00 | 239,13043478… |

- Bien `acc_ib`: 11.978,26086956… + 3.493,08300395… = 15.471,34387351… → **15.471,34**. Se redondea una vez por bien, después de sumar sus divisas.
- Bien `acc_ib2`: **239,13**.

**Paso 6 — Categoría de cuentas**:
- Saldo a 31/12: 17.000,00 − 1.500,00 = **15.500,00**. El negativo se netea.
- Saldo medio: 15.471,34 + 239,13 = **15.710,47**.
- Todos los bienes tienen valor y ningún tipo lleva marca, así que el dato está completo. Los dos saldos están por debajo de 50.000 → **no obligado**. Los dos están por debajo de 45.000 → **sin aviso**.

**Paso 7 — Valores**, por `prices.ts`, solo Nivel 1:

| Bien | Valoración (fecha) | Tipo (fecha) | Exacto | Redondeado (half-up) | Marca |
|---|---|---|---|---|---|
| (`acc_ib`, `etf_us`) | 165,01 USD (31/12) | 1,10 (31/12) | 100 × 165,01 / 1,10 = 15.000,90909… | **15.000,91** | — |
| (`acc_ib`, `etc_au`) | 22,00 (31/12) | 1 | 22.000,00 | **22.000,00** | — |
| (`acc_ib`, `etp_bt`) | 4.000,0025 (31/12) | 1 | 8.000,005 | **8.000,01** (half-even daría 8.000,00) | — |
| (`acc_ib2`, `stock_x`) | 60,00 (**30/12**) | 1 | 6.000,00 | **6.000,00** | `valuation_not_year_end` (30/12) |

- **Suma de los bienes redondeados: 51.000,92.** La suma exacta redondeada una sola vez daría 51.000,91: esa es la lectura del #6.
- Sin el bien marcado: 45.000,92.

**Paso 8 — Veredicto de valores.** El dato está incompleto porque `stock_x` lleva marca. Lo que tiene valor, marcado incluido, suma 51.000,92, por encima del umbral → **obligado, decidido con un valor marcado**: la valoración de `stock_x` del 30/12 (S16). Sin ese valor serían 45.000,92, así que **el veredicto depende de él**, y la salida lo dice. Tampoco hay aviso previo aparte: la categoría ya está obligada.

**Paso 9 — Lo que la salida dice además**:
- Que `acc_es` queda fuera por ser española.
- Que los dos libros van juntos, como total fiscal.
- Que el efectivo se mueve en la fecha de negocio (N1).
- Que el ETF debe llevar su valor liquidativo y el ETC y el ETP su cotización (F4).
- Los criterios: #11 y los que se numeren de F3 y F4, con su certeza.

**Literales del test**:
- Cuentas: `17000.00` / `15471.34`; `-1500.00` / `239.13`; categoría `15500.00` / `15710.47`; `not_obliged`; sin aviso.
- Valores: `15000.91`, `22000.00`, `8000.01`, `6000.00` (marcado, 2027-12-30); categoría `51000.92`; `obliged`, decidido con `[stock_x]`.
- `acc_es`, excluida con el motivo `domestic_account`.

**Mutantes que mata**: aceptar la valoración del 30/12 sin marcarla (el test exige la marca y el «decidido con»); redondear la suma en vez de cada bien (51.000,91); half-even en lugar de half-up (8.000,00); contar `acc_es`.

### §6.2 — La regla de los 20.000 € con dos 720 sucesivos

**Catálogo**: `acc_ib` (`IE`, núcleo) con `etf_a` (`etf`, EUR) y `etc_b` (`etc`, EUR).

**Eventos**

| # | Fecha | Evento |
|---|---|---|
| B1 | 04/01/2027 | `cash_deposit` 70.000,00 |
| B2 | 05/01/2027 | `buy` 600 `etf_a` a 50,00 (30.000,00) |
| B3 | 05/01/2027 | `buy` 300 `etc_b` a 100,00 (30.000,00). Efectivo: 10.000,00 |
| B4 | 31/12/2027 (vie) | `valuation` `etf_a` 50,00 y `etc_b` 100,00 |
| B5 | *registrado el 15/03/2028* | `tax_return_filed` 720 de 2027, `filed_at` 2028-03-15. Declara: valores 60.000,00 con dos bienes, (`acc_ib`, `etf_a`) 30.000,00 y (`acc_ib`, `etc_b`) 30.000,00. Cuentas no declaradas |
| B6 | 01/06/2028 | `cash_deposit` 2.000,00 y `buy` 20 `etc_b` a 100,00. Efectivo: 10.000,00 |
| B7 | 31/12/2028 (**domingo**) | `valuation` `etf_a` 80,00 y `etc_b` 100,00, fechadas el 31/12 con `fx_rate_date` del viernes **29/12** |
| B8 | 31/12/2029 (lun) | `cash_deposit` 40.000,01. Efectivo: 50.000,01 |
| B9 | 31/12/2029 | `valuation` `etf_a` 80,00 y `etc_b` 100,00003125 |
| B10 | *registrado el 20/03/2030* | `tax_return_filed` 720 de 2029, `filed_at` 2030-03-20. Declara: valores 80.000,01, con (`acc_ib`, `etf_a`) 48.000,00 y (`acc_ib`, `etc_b`) 32.000,01; cuentas 50.000,01 · 10.434,78, con (`acc_ib`) 50.000,01 · 10.434,78 |
| B11 | 10/05/2030 | `sell` 320 `etc_b` a 100,00 (32.000,00) y `cash_withdrawal` 32.000,00. Efectivo: 50.000,01 |
| B12 | 30/09/2030 | `cash_withdrawal` 19.565,22. Efectivo: 30.434,79 |
| B13 | 31/12/2030 (mar) | `valuation` `etf_a` 90,00 |

**Por año**, con la fecha de consulta en 2031:

| Año | Valores | Frente a qué | Veredicto de valores | Cuentas (31/12 · media) | Veredicto de cuentas |
|---|---|---|---|---|---|
| 2027 | 30.000,00 + 30.000,00 = **60.000,00** | Primera vez | **Obligado** (60.000,00 > 50.000) | 10.000,00 · 10.000,00 | No obligado |
| 2028 | 600 × 80 = 48.000,00; 320 × 100 = 32.000,00; **80.000,00** | Último 720 en vigor: 2027 (60.000,00) → +20.000,00 | **No obligado**: la subida no es «superior a» 20.000. No hay extinción: los dos bienes siguen | 10.000,00 · 10.000,00 | No obligado: nunca declarada y por debajo del umbral |
| 2029 | 48.000,00 + 320 × 100,00003125 = 32.000,01; **80.000,01** | Último 720 en vigor: **2027** → +20.000,01 | **Obligado**. Frente a 2028 serían +0,01: muere el mutante «el año anterior» | **50.000,01** · (91 × 10.000,00 + 50.000,01) / 92 = 10.434,78271… → **10.434,78** | **Obligado**: no se declaró en 2027 y el saldo a 31/12 supera 50.000 |
| 2030 | 600 × 90 = **54.000,00** | Último 720 en vigor: **2029** → baja 26.000,01 | **Obligado por extinción**: (`acc_ib`, `etc_b`) estaba en la lista de 2029, se tenía a 31/12/2029 y no a 31/12/2030 | **30.434,79** · **30.434,79** | **Obligado**: frente a 2029, el saldo a 31/12 baja 19.565,22 y **la media sube 20.000,01**. Mueren el mutante «solo el 31/12» y el mutante «el penúltimo», porque el 720 de 2027 no declaró cuentas y con él serían «primera vez, por debajo del umbral» |

**Variantes de borde**, cada una con su test:
- Con B12 de 19.565,23, la media queda en 30.434,78, sube +20.000,00 y no obliga.
- Con B8 de 40.000,00, el saldo queda en 50.000,00 y no obliga.
- B7 comprueba el 31/12 en domingo: la valoración va fechada el 31/12, el tipo el viernes 29/12, y ninguna de las dos se marca.

**Literales del test**:
- Por año: `2027` `obliged`/`not_obliged`; `2028` `not_obliged`/`not_obliged`; `2029` `obliged`/`obliged`; `2030` `obliged`/`obliged`.
- Motivos: `threshold`, `increase` (con `60000.00` → `80000.01` y `+20000.01`), `first_time_category`, `extinction` (`etc_b`) e `increase_q4_average` (`10434.78` → `30434.79`).

### §6.3 — Una complementaria

**Catálogo y configuración**: `acc_a` (`ES`) con `fund_f` (`fund`), `stock_s` y `stock_t` (`stock`), todo en EUR. Un `settings_changed` inicial con la configuración por defecto resuelta (límite del 25 %).

**Eventos, en orden de fichero**

| # | Registrado | Fecha de negocio | Evento |
|---|---|---|---|
| C1 | 2027 | 11/01/2027 | `buy` 100 `fund_f` a 10,00 |
| C2 | 2027 | 01/02/2027 | `buy` 10 `stock_s` a 100,00 |
| C3 | 2027 | 01/06/2027 | `sell` 10 `stock_s` a 50,00 |
| C4 | 2027 | 10/11/2027 | `sell` 100 `fund_f` a 12,00 |
| C5 | 2027 | 20/12/2027 | `interest` 40,00 |
| C6 | 2028 | 01/02/2028 | `buy` 10 `stock_t` a 100,00 |
| C7 | 2028 | 01/09/2028 | `sell` 10 `stock_t` a 180,00 |
| F1 | 10/06/2028 | — | `tax_return_filed` Renta 2027, `filed_at` 2028-06-10 |
| C8 | 01/10/2028 | — | `reversal` de C4 |
| C9 | 01/10/2028 | 10/11/2027 | `sell` 100 `fund_f` a 13,00, `corrects_id` C4 |
| F2 | 05/11/2028 | — | `tax_return_filed` Renta 2027, `filed_at` 2028-11-05, `supersedes` F1 |
| C10 | 05/01/2029 | 28/12/2027 | `interest` 20,00 (registrado tarde) |
| C11 | 06/01/2029 | — | `settings_changed`: `savings_offset_limit_pct` de 25 a **20** |

**Paso 1 — 2027 tal como lo calculaba la aplicación al registrar F1** (C1–C7, límite del 25 %):
- C3: 500,00 − 1.000,00 = **−500,00**. Ventana de dos meses: [01/04/2027, 01/08/2027]. C2 (01/02) queda fuera y no hay otra compra de `stock_s`: computable **−500,00**.
- C4: 1.200,00 − 1.000,00 = **+200,00**.
- Saldos: ganancias −300,00; rendimientos +40,00.
- Fase 1: 25 % × 40,00 = 10,00. Ganancias −290,00; rendimientos 30,00.
- **Base 30,00; pendiente de 2027 (`capital_gain`): −290,00**; diferido 0,00.
- F1 declara lo mismo que calcula: `declared` = `computed` = {30,00; [2027 GP −290,00]; 0,00}. `computed.settings` = límite del 25 %.

**Paso 2 — La corrección (C8 + C9).** C9: 1.300,00 − 1.000,00 = +300,00. Ganancias −200,00, compensados 10,00: −190,00.
- **Aviso** `closed_year_moved` de la Renta de 2027, presentada el 10/06/2028, por fecha (`by_date`): el pendiente de 2027 pasa de −290,00 a **−190,00**. La base (30,00) y el diferido no se mueven.

**Paso 3 — F2, la complementaria.**
- `computed` = {30,00; [2027 GP −190,00]; 0,00}, con el límite del 25 %, a fecha 05/11/2028.
- `declared` = {30,00; [2027 GP **−200,00**]; 0,00}. El usuario lo cambió al presentar.
- Su huella cubre C1–C9 y F1.

**Paso 4 — El interés tardío (C10).**
- Rendimientos 60,00; 25 % = 15,00; ganancias −185,00; base 45,00.
- **Aviso** por fecha de la Renta de 2027, presentada el 05/11/2028: base de 30,00 a **45,00** y pendiente de −190,00 a **−185,00**.

**Paso 5 — El cambio de configuración (C11).**
- Con el 20 %: límite 12,00; ganancias −188,00; base 48,00.
- **Aviso** de la Renta de 2027: base de 45,00 a **48,00** y pendiente de −185,00 a **−188,00**. Ningún otro ejercicio cerrado.

**Paso 6 — Anulaciones.**
- `reverseEvent(F1)` → **rechazado**: F2 queda inválida sin ella (`filing_supersedes_invalid`, ADR-0003).
- `reverseEvent(F2)` → aceptado, y F1 vuelve a estar en vigor. Se comprueba en un libro aparte, para no alterar los pasos siguientes.

**Paso 7 — 2028, a fecha 10/01/2029** (límite del 20 %).
- C7: 1.800,00 − 1.000,00 = **+800,00**.
- Fase 2 con el ancla F2: −200,00 contra las ganancias, en la misma categoría y sin límite → **base 600,00**.
- Mutante «ancla sustituida» (F1, −290,00): 510,00.
- Mutante «sin ancla» (lo calculado hoy, −188,00): 612,00.
- **A fecha 01/08/2028**, antes del `filed_at` de F2, está en vigor F1 → **510,00**.

**Paso 8 — La comparación de 2027, a fecha 10/01/2029.**

| Lectura | Libro | Configuración | Base | Pendiente 2027 |
|---|---|---|---|---|
| Declarado (F2) | — | — | 30,00 | −200,00 |
| Calculado entonces (F2) | — | — | 30,00 | −190,00 |
| R0 | prefijo de F2 (C1–C9, F1) | la de F2 (25 %): límite 10,00 | 30,00 | −190,00 |
| R1 | prefijo de F2 | la de hoy (20 %): límite 8,00 | 32,00 | −192,00 |
| Hoy | todo el libro | 20 %: rendimientos 60,00, límite 12,00 | 48,00 | −188,00 |

| Causa | Base | Pendiente |
|---|---|---|
| Al presentar (calculado − declarado) | 0,00 | +10,00 |
| Motor (R0 − calculado) | 0,00 | 0,00 |
| Configuración (R1 − R0) | +2,00 | −2,00 |
| Eventos posteriores (hoy − R1) | +16,00 | +4,00 |
| **Total = hoy − declarado** | **+18,00** | **+12,00** |

- **La causa «motor»**, aparte: el mismo libro con un F2 cuyo `computed` diga base 31,00 (como lo habría escrito un motor anterior) da motor **−1,00** y total igual.
- **La huella**: F2 verifica; con C3 editado a mano en el fichero (precio 55,00), `integrity` da `filing_fingerprint_mismatch` y la comparación omite las causas.

**Literales del test**: `30.00`/`-290.00` (F1); `-290.00 → -190.00` (aviso de C9); `30.00`/`-190.00` calculado y `30.00`/`-200.00` declarado (F2); `30.00 → 45.00` y `-190.00 → -185.00` (C10); `45.00 → 48.00` y `-185.00 → -188.00` (C11); `600.00`, `510.00` a 01/08/2028; las causas `0.00`/`+10.00`, `0.00`/`0.00`, `+2.00`/`-2.00`, `+16.00`/`+4.00`.

### §6.4 — La Renta de 2025 por casillas (recalculada tras Q2)

**Libro**:
- `acc_mi` (`ES`): `fund_a`.
- `acc_ib` (`IE`): `etf_w`, `stock_s`, `stock_t`, `coin_c` y `etc_g`.
- Todo en EUR salvo el dividendo. `treaty_withholding_pct: { US: "15" }`. `income_category`, por defecto, **con `etc` en `movable_capital`**.

| Fecha | Evento | Resultado |
|---|---|---|
| 10/01/2024 | Compra de 100 `fund_a` a 10,00 | |
| 01/10/2024 | Compra de 10 `stock_t` a 100,00 | |
| 04/11/2024 | Venta de 10 `stock_t` a 80,00 | −200,00. Ventana [04/09/2024, 04/01/2025]: la compra del 01/10 la consume la propia venta (#18) |
| 02/12/2024 | Compra de 10 `stock_t` a 85,00 | Recompra: difiere los −200,00 enteros; computable de 2024: 0,00 |
| *20/06/2025* | *Renta de 2024 presentada: base 0,00; pendiente de 2023 −300,00 (anterior a la aplicación); diferido −200,00* | Ancla |
| 15/01/2025 | Compra de 10 `etf_w` a 100,00 | |
| 20/01/2025 | Compra de 10 `stock_s` a 50,00 | |
| 03/02/2025 | Venta de 10 `stock_t` a 95,00 | Propio +100,00; libera −200,00; total −100,00. La compra del 02/12 la consume esta venta (#18): computable **−100,00** |
| 10/02/2025 | Compra de 1 `coin_c` a 1.000,00 | |
| 03/03/2025 | Reembolso de 40 `fund_a` a 9,00 | −40,00. La suscripción del 05/05, 20 participaciones, difiere 20/40 = −20,00: computable **−20,00** |
| 10/03/2025 | Compra de 5 `etc_g` a 200,00 | |
| 05/05/2025 | Suscripción de 20 `fund_a` a 9,50 | Lleva −20,00 diferidos |
| 15/05/2025 | Dividendo de `stock_s`: 50,00 USD brutos, 7,50 USD en origen, tipo 1,25, `US` | 40,00; impuesto extranjero 6,00 |
| 02/06/2025 | Venta de 10 `stock_s` a 45,00 | **−50,00** (la compra del 20/01 queda fuera de la ventana) |
| 01/09/2025 | Venta de 10 `etf_w` a 120,00 | **+200,00** |
| 01/10/2025 | Venta de 5 `etc_g` a 190,00 | **−50,00**, en **rendimientos del capital mobiliario** (Q2) |
| 10/11/2025 | Reembolso de 60 `fund_a` a 11,00 | Consume por FIFO 60 del lote de 2024: **+60,00**; retención 11,40 |
| 01/12/2025 | Venta de 1 `coin_c` a 1.300,00 | **+300,00** |
| 15/12/2025 | Custodia de 10,00 (`fee_kind: custody`) | −10,00 en rendimientos (#23) |
| 31/12/2025 | Interés en `acc_mi` de 100,00, retención 19,00 | +100,00 |

**El motor**:
- Ganancias y pérdidas: −100 − 20 − 50 + 200 + 60 + 300 = **+390,00**.
- Rendimientos: 100 + 40 − 50 − 10 = **+80,00**.
- Fase 1: nada, porque los dos saldos son positivos.
- Fase 2: el pendiente de 2023 (−300,00) contra las ganancias, sin límite → 90,00.
- **Base 170,00.** Es la misma que antes de Q2, porque la pérdida del ETC pasa de un saldo positivo a otro.
- Diferido pendiente a 31/12/2025: −20,00.

**Las casillas** (F1, F2 y F5):

| Apartado | Casillas |
|---|---|
| IIC, fila del 03/03 | 0312 **360,00** · 0315 **400,00** · 0321 **40,00** · 0322 **20,00** · 0311 *falta en tus datos* |
| IIC, fila del 10/11 | 0312 **660,00** · 0315 **600,00** · 0316 **60,00** · 0320 **60,00** |
| IIC, totales | 0324 **60,00** · 0325 **20,00** · retención en 0603 **11,40** |
| ETF | 2227 **1.200,00** · 2229 **1.000,00** · 2230 **200,00** · 2232 **200,00** · 2235 **200,00** · 2236 **0,00** · 2225 *falta* |
| Acciones, `stock_s` | 0328 **450,00** · 0331 **500,00** · 0337 **50,00** · 0338 **50,00** |
| Acciones, `stock_t` | 0328 **950,00** · 0331 **850,00** · 0332 **100,00** · 0336 **100,00**. Es una ganancia en su fila; lo liberado va a su origen (F5) |
| Acciones, totales | 0339 **100,00** · 0340 **50,00** |
| Monedas virtuales | 1804 **1.300,00** · 1806 **1.000,00** · 1809 **300,00** · 1811 **300,00** · 1812 **300,00** · 1814 **300,00** · 1813 **0,00** |
| Ejercicios anteriores | 0395 **200,00** (la pérdida de 2024 de `stock_t`, liberada) · 0396 **200,00** |
| Saldo de ganancias | 0422 **660,00** · 0423 **270,00** (20 + 0 + 50 + 0 + 200) · **0424 390,00**, igual al saldo del motor |
| Rendimientos | 0027 **100,00** · 0029 **40,00** · **0031 −50,00** (`etc_g`, con su signo menos) · 0036 **90,00** · 0037 **10,00** · 0038 **80,00** · 0040 **80,00** · 0041 **80,00** · 0429 **80,00** · retención en 0597 **19,00** |
| Compensación | 0441 **300,00** · anexo C.3: 1264 **300,00**, 1265 **300,00**, 1266 **0,00** |
| Base imponible del ahorro | **0460 170,00** (390,00 − 300,00 + 80,00) |
| Doble imposición | Primer límite **6,00** (15 % de 40,00 = 6,00; impuesto extranjero 6,00). **No** es el importe de la 0588 |

**Invariantes que el test comprueba**:
- 0424 = saldo de ganancias y pérdidas del motor (390,00).
- 0041 = saldo de rendimientos del motor (80,00).
- 0460 = base (170,00).

**El mismo libro en 2024**: base 0,00 y diferido −200,00, **por conceptos y sin ningún número de casilla**, con la nota `tax_boxes_missing_year`.

**El test de Q10** (con su nombre, aparte de este libro):
- **Año 1**: una venta con pérdida de −100,00 se difiere entera. Su fila lleva pérdida obtenida −100,00 e imputable 0,00, y el motor da computable 0,00.
- **Año 2**: una venta con ganancia propia de +30,00 libera los −100,00. El total, −70,00, **vuelve a aplazarse** entero por una recompra (#21) y se atribuye a la pérdida de origen (F5).
  - Filas: la venta es una **ganancia de +30,00**. La 0395 lleva **30,00**, que es −100,00 menos los −70,00 que siguen diferidos.
  - Suma: 30,00 − 30,00 = **0,00**, el computable que da el motor ese año.
- **Año 3**: se vende la recompra, sin más recompras. La 0395 lleva **70,00**, y la suma coincide con el computable del motor.

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
| `docs/business-rules.md` §7 y `docs/data-schema.md` §6.1 | `income_category`: por defecto `movable_capital` para `etc` y `etp` (respuesta a Q2); ADR-0021 lo daba como `capital_gain` para todos |
| `docs/business-rules.md` §7 | `model_720_threshold_eur`, `model_720_increase_eur`, `model_721_threshold_eur`, `model_721_increase_eur`, las alertas con su valor por defecto y la temporada de Renta |
| `docs/fiscal-questions.md` | #11 (N2); fichas F1–F5 numeradas; la V0267-25 en la cuestión ETC/ETP (N6); el apartado «lo que el criterio dice bien pero se queda corto» del 721 |
| `docs/specification.md` | §13: lo que la Fase 5 ya entrega; §14.1: la valoración a 31/12 resuelta como Nivel 1 |
| `docs/` (nuevo o en `business-rules.md`) | El procedimiento para añadir un ejercicio de casillas |
| ADR-0020 | Si se acepta Q1: la huella y el resellado en `compact` |

---

## Traspaso (2026-09-22)

Escrito para **quien siga, sea o no quien empezó**. El detalle técnico y el porqué de cada
desviación están en `implementation-notes.md`; esto es el estado y el camino.

### 1. Estado del árbol

- Worktree `/home/jemar/projects/atlas-portfolio-tracker-010`, rama `feature/010-tax-output`,
  HEAD `6d9e206`, `git status` **limpio**: nada sin commitear, nada sin seguir.
- **26 commits por delante de `origin/develop`**, ya **rebasados** sobre `f29ebc1`, el `develop`
  que trae `docs/spec-coherence`. Si `develop` se vuelve a mover, rebase otra vez antes de la PR.
- **Sin PR y sin `push`**: la rama vive solo en local. La dirección pidió avisar antes de fusionar.
- Hooks activos en este worktree (`git config core.hooksPath .githooks`).

**Aviso del rebase**: hubo que **saltar** el commit `e9b2a7a` (`git rebase --skip`). Traía
`docs/prompts/010-tax-output.md`, `README.md` y `docs/fiscal-questions.md` en un estado **anterior**
al de `develop`; aplicarlo habría **revertido el criterio #24**. Comprobado antes de saltarlo: el
contenido válido es el de `develop`. Si alguien ve ese commit «perdido» en el reflog, está bien perdido.

### 2. Lo hecho, bloque por bloque

Cubre las entradas **1 a 16** de la tabla de commits del plan, más cuatro encargos que llegaron en
marcha. En orden real:

| # | Asunto del commit | Qué |
|---|---|---|
| 1 | `docs(010): spec, plan and questions for the tax output` | artefactos Spec Kit |
| 2 | `docs(010): record the answers and the hand-computed returns` | respuestas y los cuatro cálculos a mano, antes de una sola línea de código |
| 3 | `fix(tax): start the year chain at the first filed return` | **bloque 0.1**, la corrección P5 |
| 4 | `feat(settings): add the informative return thresholds and the tax season` | **bloque 0.2**, ocho parámetros nuevos |
| 5 | `docs(010): predict what the ETC and ETP income category moves` | predicción escrita antes de tocar el dorado |
| 6 | `test(tax): pin the hand-computed year of feature 009 to capital gains` | fija el libro a mano antes del cambio de valor por defecto |
| 7 | `feat(settings): make ETC and ETP movable capital income by default` | **bloque 0.3** |
| 8 | `feat(cli): let settings set write the transfer rule of the wash sale` | ampliación autorizada |
| 9 | `docs(domain): say what the fiscal engine now reads in these comments` | los cuatro comentarios que mentían, verificados uno a uno |
| 10 | `build(web): raise the boot ceiling: the loader validates what it reads` | techo de arranque a 74,0 KB, **autorizado por la dirección** |
| 11 | `docs(010): predict what the filing event moves in the golden snapshot` | predicción |
| 12 | `feat(schema): add the tax_return_filed event` | **bloque 1.1–1.2**, 25 tipos de evento |
| 13 | `build(web): keep the tax output out of the boot, checked on the bundle` | la comprobación automática de **forma**, no de tamaño |
| 14 | `feat(projections): project filed returns and their supplementary chain` | **1.4** |
| 15 | `feat(ledger): fingerprint the ledger before a filed return` | **1.3**, con resellado en `compact` |
| 16 | `refactor(tax): share one year chain that anchors on the filed returns` | **1.5**, `tax/chain.ts`; `TaxOptions` se queda en `{today}` |
| 17 | `feat(filings): warn when an event moves a closed tax year` | **1.6**, el **hecho** (`filings/touched.ts`) |
| 18 | `feat(filings): say from every write which filed return it reaches` | la **cifra** (`filings/closed-years.ts`) |
| 19 | `feat(tax): compare what was filed with what the ledger says today` | **1.7** y el cálculo a mano §6.3 (entrada 16 de la tabla, plegada aquí) |
| 20 | `docs(010): predict what the criteria labels move in the golden report` | predicción |
| 21 | `fix(tax): correct the certainty and the risk of criteria 17 to 24` | lote de revisión adversarial |
| 22 | `docs(010): predict what the two-month window for funds moves` | predicción |
| 23 | `fix(tax): read the wash-sale window of a fund as two months` | cambio de conducta, con `2:fund_2m` / `2:fund_1y` |
| 24 | `docs(010): predict the monetary funds moving to two months` | predicción |
| 25 | `fix(tax): read the window of a monetary fund as two months too` | extensión a `money_market` |
| 26 | `docs(010): implementation notes of blocks 0 and 1` | cierre del tramo |

**Bloques 2, 3, 4 y 5: sin empezar.** Nada de la Renta por casillas, de los modelos informativos,
de la pantalla `/fiscal` ni de los comandos de la CLI existe todavía.

### 3. Dónde paré dentro del bloque 2, y el paso siguiente

**Paré antes de la primera línea: el bloque 2 tiene cero código.** No existe
`packages/domain/src/tax/boxes/` ni ningún tipo, test o fichero suyo.

Lo único que llegué a hacer del bloque 2 fue **mirar sus fuentes**, y hay un hallazgo que condiciona
el primer commit:

- La investigación de casillas ya está **hecha y commiteada** en el apartado «Casillas de 2025» de
  este mismo documento: cada casilla de 2025 con su etiqueta, su página y sus fuentes.
- Intenté **re-verificarla contra el BOE**. `BOE-A-2026-7041` resuelve y confirma la
  **Orden HAC/277/2026, de 25 de marzo** (Modelo 100 del ejercicio 2025), y el índice del manual de
  la AEAT es alcanzable, pero el **Anexo I se publica como imágenes PNG** y la herramienta de
  descarga disponible **no puede leerlas**. Los números y etiquetas de casilla **no se han podido
  re-verificar contra la imagen primaria**.
- Consecuencia: `boxes/years/2025.ts` debe llevar en sus datos `source`, `url` y `checked_at` de la
  investigación de la fase de especificación (**2026-09-19**, certeza alta) y **decirlo con
  honradez** en el mensaje del commit. Quien tenga un visor de imágenes, que la confirme y suba
  `checked_at`.

**Paso siguiente concreto**, entrada 20 de la tabla del plan,
`feat(tax): lay the savings base out by concept and 2025 box`, en este orden:

1. `packages/domain/src/tax/boxes/concepts.ts` — los identificadores estables de concepto (plan §2.1).
2. `packages/domain/src/tax/boxes/rows.ts` — las filas por origen de la pérdida (plan §2.2, ficha F5).
3. `packages/domain/src/tax/boxes/years/2025.ts` — las casillas **como datos por ejercicio** (plan §2.3).
4. El redondeo y lo que no se calcula entero (plan §2.4), con Q3 ya respondida.

Antes de escribir: releer §2 del plan y, aquí, **Q2, Q3, Q10, el §6.4** (la Renta de 2025 por
casillas, recalculada tras Q2) y el **procedimiento para añadir un ejercicio nuevo**. El §6.4 y el
test de Q10 son el cálculo a mano que hay que fijar: **se rehacen a mano, nunca desde la salida del
código**.

### 4. La tubería, verificada hoy sobre `6d9e206`

| Medida | Valor |
|---|---|
| Tests | **163 ficheros, 1.562 tests**, todos verdes |
| Cobertura `packages/domain` | **100 %** sentencias (4.684), **100 %** ramas (2.427), **100 %** funciones (1.053), **100 %** líneas (4.462) |
| Biome (`npm run lint`) | salida **0**, 488 ficheros |
| `tsc -b` | salida **0** |
| Paquete web, arranque | **72,3 KB** gzip sobre un presupuesto de **74,0** |
| Paquete web, total | **194,6 KB** gzip sobre un presupuesto de **195,5** |
| Test de arquitectura | verde (`domain` no importa nada) |

Los dos presupuestos hay que **apretarlos a la medida real** al cerrar la feature (entrada 28 de la
tabla). El techo de arranque **no se sube sin la dirección**.

### 5. Congelado, pendiente de decisión, y preguntas abiertas

**Congelado por la dirección** (no tocar; avisar al llegar al bloque del motor):

1. El defecto de `windowCriterion` con un **ETC declarado capital mobiliario**: recibe `2:listed` y
   una alternativa de un año que el art. 25.2 no contempla. La autorización cubrió **solo fondos**.
2. El **test de definitividad** (una transmisión solo libera el diferimiento si ella misma es
   definitiva; DGT V3282-18 y Manual práctico de Renta 2025, cap. 11, texto de marzo de 2026),
   con la ventana del propio activo. Decidido, pero para el bloque del motor.
3. El criterio **#21**, la cita del **art. 35** en líneas de capital mobiliario y la atadura de las
   comisiones a valores negociables.

**A decidir en el bloque 2, al diseñar la salida**:

4. **Una cifra grande deja de verse porque hemos dejado de dudar de ella.** Con #19 en certeza alta
   desaparece del apartado de dudosos y con él los **200,00 €** en juego de la lectura contraria.
   Es lo que manda la regla de la 009, pero la información se pierde. La dirección pidió
   **plantearlo aquí**, que es donde se elige qué ve el usuario y dónde.

**Abiertas, sin resolver y sin actuar**:

5. **Homogeneidad tras un `convert`**: una compra nueva en el activo de destino nunca se empareja
   con una pérdida anterior en el de origen. Con la V0796-26 parece correcto, pero **nadie lo ha
   comprobado para el traspaso entre fondos**, donde se cruza con el #2b. Anotado en
   `docs/fiscal-questions.md`.
6. **N11 y N21 de `specs/009-tax-engine/questions.md`**: la dirección dijo expresamente
   **no actuar sobre ellas**.
7. **La web no alcanza `wash_sale_transfer_counts`**: Configuración no tiene control booleano y es
   el **único** parámetro booleano de los 31 de `Settings`. La CLI ya lo cubre. Trabajo **posterior**
   a la 010; la dirección pidió no construirlo ahora.

Y sigue en pie, al final de este documento, la tabla **«Documentos que la dirección tendrá que
actualizar»**: son cambios de `docs/` que **no** me correspondía hacer.

### 6. Trampas que morderían al siguiente

- **`npm run lint | tail` esconde el rojo**: el código de salida de la tubería es el de `tail`. Dos
  commits entraron rotos por esto. **Ejecutar `npm run lint` a pelo.**
- **Ficheros dorados**: antes de regenerar cualquiera, escribir **qué líneas se van a mover y por
  qué**, commitear la predicción y después comparar. Si se mueve algo no predicho, **parar**.
- **`tests/fiscal-criteria.test.ts`** compara la tabla de `docs/fiscal-questions.md` con el catálogo
  de `packages/domain/src/tax/criteria.ts`. Documento y catálogo, **en el mismo commit**. No se
  desactiva ni se relaja jamás. **Lee su cabecera antes de fiarte de él**: garantiza que cada fila
  tiene entrada y cada entrada tiene fila, que toda certeza y todo riesgo del catálogo es **uno de
  los que nombra su fila**, y que la certeza más dudosa y cada riesgo de la fila los lleva alguien.
  Lo que **no** garantiza, en una fila que nombra varias lecturas (solo la #2 y la #24), es atar
  **cada variante a la suya**: la celda es prosa y emparejar cada paréntesis con un identificador
  exigiría analizar español. Eso lo sostienen hoy los comentarios por variante de `criteria.ts` y
  la lectura humana.
- **Un identificador de criterio nunca cambia de significado**: una lectura nueva estrena
  identificador. Por eso existen `2:fund_2m` y `2:fund_1y` y se retiró el `2:fund` a secas.
- **Hay dos tablas de ventanas a propósito**: la de `settings.ts` y `SCENARIO_WASH_SALE_WINDOW` en
  `synth/scenario.ts`. **Unificarlas rompe el `.jsonl` dorado**, que está congelado. El comentario
  largo en `scenario.ts` lo explica y hay un test que vigila la deriva.
- **Los libros calculados a mano fijan su configuración entera y explícita**, con `HAND_SETTINGS`
  de `test/tax/helpers.ts`: las **tres familias tipo a tipo** (`fiscal_date_rule`,
  `wash_sale_window`, `income_category`) y los **cuatro escalares**
  (`wash_sale_transfer_counts`, `savings_offset_limit_pct`, `loss_carryforward_years`,
  `treaty_withholding_pct`), con el modelo de `tests/fixtures/ledger/tax-hand-v1.jsonl`. Un cálculo
  a mano que hereda valores por defecto es un espejo del código, no un cálculo. **Extender un valor
  por defecto no es fijarlo**: escribirlo como `{ ...DEFAULT_INCOME_CATEGORY, etc: … }` dejó cinco
  de los siete tipos viniendo del código y la anotación de que «ya no hereda ninguno» fue falsa
  durante un día. Si se añade un ajuste que les afecte, **fijarlo, escrito entero**.
- **El techo de arranque del paquete web es de la dirección.** La comprobación automática prohíbe
  `domain/src/tax/` y `domain/src/informative/` en cualquier trozo de arranque; lo que se vigila es
  **la forma**. No esconderle aristas con importaciones dinámicas.
- **Cobertura al 100 %**: no se llega con tests de relleno; si aparece una rama muerta, se **borra**
  con un comentario que explique el invariante.
- **Fechas en los tests**: un festivo o un domingo hace que el BCE no publique tipo y la CLI rechace
  la operación. Usar días hábiles (pasó con un 2027-04-11 en domingo).
- **Al cablear la cifra del aviso de ejercicio cerrado** en la CLI y en la web, escribir el test
  estático que pidió la dirección: que **enumere** los módulos que importan `recordEvent`,
  `correctEvent` o `reverseEvent` fuera del dominio y exija que cada uno alcance `closedYearImpact`,
  de modo que **una tercera interfaz rompa el test** hasta que alguien la añada.
- **Nunca `git push` a `develop` ni a `main`, nunca fusionar**, y no abrir la PR hasta tenerlo todo
  verde. Commits en inglés, una sola línea, **sin coautoría de ninguna IA**.

### 7. Lo que pedía el último mensaje de la dirección

| Encargo | Estado |
|---|---|
| #18 y #19 se quedan en `aggressive`: subir la certeza no cambia la dirección | **Hecho**, catálogo y documento |
| Escribir esa distinción en la leyenda de `docs/fiscal-questions.md` | **Hecho**, línea de leyenda nueva |
| `money_market` también a dos meses, con la salvedad de parar si puede designar algo que no sea IIC | **Hecho**; verificado antes (ISIN, TER, `transferable`, y `business-rules.md` / `specification.md` describen `fixed_income` como «fondos indexados o **monetarios**»): designa un fondo monetario, no un instrumento ajeno a la IIC |
| Revisar si el libro a mano hereda algún otro ajuste en vez de fijarlo | **Hecho a medias, y anotado como completo por error.** Se fijó `fiscal_date_rule`, pero `income_category` se escribió extendiendo el valor por defecto (cinco de siete tipos seguían viniendo del código) y el libro de §6.3 montaba sobre `taxBuilder()`, que no fija ningún escalar. **Cerrado en la revisión adversarial del 2026-09-22** con `HAND_SETTINGS` |
| La visibilidad de #19 y sus 200 € | **Pendiente, para el bloque 2**, como se pidió; anotada arriba |
| Rebase sobre el `develop` nuevo antes de la PR | **Hecho** sobre `f29ebc1`; cuatro conflictos en `docs/`, resueltos conservando la estructura de `develop` |
| Dejar el traspaso escrito y commiteado donde lo busque quien siga | **Esto** |
