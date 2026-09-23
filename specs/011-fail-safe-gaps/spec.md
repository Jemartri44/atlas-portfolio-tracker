# Especificación de la feature: Los huecos del fallo seguro (`011-fail-safe-gaps`)

**Rama**: `feature/011-fail-safe-gaps`, creada desde `origin/develop` (`c141cb0`)

**Creada**: 2026-09-23 (Europe/Madrid)

**Estado**: **aprobada por la dirección el 2026-09-23**. Las dos comprobaciones previas que el encargo exige —las dos premisas del bloque 3 y el mapa de guardias del bloque 4— están hechas y reportadas en [`questions.md`](questions.md) con la salida de los comandos, y los dos defectos del bloque 4 se **reprodujeron ejecutando**. Las cinco preguntas están respondidas en `questions.md` §8.

**Entrada**: `docs/prompts/011-fail-safe-gaps.md` (§3 bloques 0–8, §5 criterios de terminado, §6 decisiones (a)–(l)); `docs/pendientes-post-010.md` (pendientes 3, 4, 5, 6, 7, 8, 9, 10 y 12, más la asimetría «de paso»); ADR-0024, ADR-0020 (con sus dos enmiendas y su nota de erratas), ADR-0003, ADR-0018, ADR-0015, ADR-0006, ADR-0016, ADR-0022; `docs/data-schema.md` §4, §5, §6.6 y §7; `docs/business-rules.md` §5; `docs/fiscal-questions.md` entero; `specs/010-tax-output/implementation-notes.md` §3, §7, §9 y §10 y `questions.md` «5 bis» y «6».

**Preguntas**: [`questions.md`](questions.md). Cinco (P1–P5), **todas respondidas**, y **cuatro** observaciones sobre el propio encargo (E1–E4), tres de ellas verificadas ejecutando. Ninguna era fiscal: de forma y de alcance.

---

## Resumen

No hay funcionalidad nueva. Se cierran los sitios en los que **el motor fiscal sabe algo y no lo dice, o lo dice mal**, más la única puerta por la que el usuario puede quedarse encerrado fuera de su propio libro. Ocho bloques, en el orden que fija la dirección (decisión (l)):

0. **Los dos mensajes que mienten.** Dejar de acusar de «editado a mano» a quien solo tiene líneas ilegibles, y decir una **versión** donde hoy se imprime un recuento de líneas.
1. **La fecha de cálculo sin validar.** `computed.as_of` pasa por el bloque de consistencia del evento.
2. **Las dos de un párrafo.** La nota N17 de la 010, y la asimetría de la tarjeta de criterios firmes entre las dos interfaces.
3. **La huella de duplicados de una presentación**: `filed_at` sale de la tupla, dentro de la v1 y por su propio argumento.
4. **El ejercicio que se vuelve inobtenible.** Una lectura alternativa que alcanza por debajo del primer año soportado **se degrada, no se cae**.
5. **El aviso que se calla**: un tercer desenlace, «no he podido comparar», emitido por el motor.
6. **El ancla de lo declarado**, que sustituye una cifra y no lo dice —ni en la web, ni en el dominio cuando hay dos Rentas—.
7. **El test antideriva de criterios**, que empareja variante con lectura porque el documento pasa a una fila por variante.
8. **La salida registrada de `compact`**, para que un libro no quede congelado para siempre.

Cinco reglas gobiernan la feature entera y salen de §0 y §6 del encargo:

- **R1 — Afirmar en falso es peor que callarse.** Ningún mensaje afirma lo que no ha comprobado: ni «se han editado a mano» de unas líneas ilegibles, ni «desde la versión N» donde N es un recuento, ni «no mueve ninguna cifra declarada» cuando la comparación no se ha hecho (decisión (g)).
- **R2 — La salvedad la emite el motor; la interfaz elige palabras y sitio** (ADR-0024, decisión (i)). Esta ronda la aplica cuatro veces: bloques 2, 5, 6 y 8. Los desenlaces nuevos van en **uniones cerradas**, nunca en un campo opcional que una interfaz pueda tirar.
- **R3 — Un ejercicio soportado y calculable no se vuelve inobtenible: se degrada** (decisión (f)). Que una lectura alternativa alcance por debajo de 2018 es información **sobre esa lectura**.
- **R4 — La aplicación nunca deja al usuario encerrado fuera de su libro, y no compacta en silencio** (decisiones (a) y (b)). La salida se pide a propósito, nombra lo que se deja sin verificar y **queda registrada en el propio libro**; `check` lo sigue diciendo siempre (decisión (d)).
- **R5 — Nada fiscal se decide aquí.** Los seis criterios en disputa siguen sin resolver; rellenar la tabla del bloque 7 copia **lo que el catálogo ya declara**, y si alguna celda no coincide se pregunta (decisión (k)).

---

## Escenarios de usuario y pruebas *(obligatorio)*

### Historia 1 — Que la verificación me diga la verdad de lo que ha encontrado (Prioridad: P1)

El usuario ejecuta `atlas check --deep`, o abre **Ajustes → Verificación** en la web, sobre un libro cuyas líneas anteriores a una presentación **no se pueden releer** en la versión que declara la huella. Hoy la aplicación le dice que se han editado a mano y le manda restaurar una copia de seguridad: las dos cosas son falsas, y la segunda no arregla nada. Después de esta feature le dice lo que de verdad pasa, con **qué versión** de esquema hay que migrar y qué puede hacer.

**Por qué esta prioridad**: es lo más barato de la ronda, está en tres líneas, y es el caso en el que una afirmación tranquilizadora y falsa deja al usuario peor que el silencio (decisión (g)).

**Prueba independiente**: un libro con una línea anterior a una presentación que la versión de la huella no sabe leer; la comprobación profunda emite un código propio, distinto del de la edición a mano, y su mensaje nombra la versión de la huella.

**Escenarios de aceptación**:

1. **Dado** un libro con una presentación cuya huella no cuadra por contenido (`digest`), **cuando** se ejecuta la comprobación profunda, **entonces** el hallazgo sigue siendo `filing_fingerprint_mismatch` y las dos interfaces siguen diciendo «se han editado a mano».
2. **Dado** un libro con una presentación cuyas líneas anteriores no se pueden leer en la versión de su huella (`unreadable`), **cuando** se ejecuta la comprobación profunda, **entonces** el hallazgo lleva un **código propio**, y lo que se le pide al usuario **no es restaurar una copia**.
3. **Dado** ese mismo hallazgo, **cuando** se lee su mensaje, **entonces** el número que aparece detrás de «schema version» es la **versión de la huella**, no el recuento de líneas que cubre.
4. **Dado** que el bloque 8 todavía no existe, **cuando** se escribe el mensaje nuevo, **entonces** no promete una salida que hoy está bloqueada; cuando el bloque 8 entra, el mensaje la nombra.

---

### Historia 2 — Que una presentación escrita a mano no pueda mentir sobre cuándo se calculó (Prioridad: P2)

`computed.as_of` es la fecha con la que la comparación de ADR-0020 **relee el prefijo del libro**. Una presentación escrita fuera de `filingProposal` con una fecha absurda —anterior al ejercicio que declara, o posterior a la presentación— se acepta hoy, y el reparto de la diferencia en sus cuatro causas sale falso sin que nada avise.

**Por qué esta prioridad**: barato, acotado al bloque de consistencia que ya existe, y sin ningún fichero dorado que regenerar.

**Prueba independiente**: la validación de forma del evento, llamada directamente, con una muestra por comparación nueva.

**Escenarios de aceptación**:

1. **Dado** un `tax_return_filed` con `computed.as_of` **anterior** al 31/12 del ejercicio que declara, **entonces** se rechaza con código propio.
2. **Dado** un `tax_return_filed` con `computed.as_of` **posterior** a `filed_at`, **entonces** se rechaza con código propio: no se calcula después de presentar y se guarda como si fuera lo que se presentó.
3. **Dado** que `filed_at` ya se valida contra el 31/12 del ejercicio y contra `recorded_at` **antes**, **entonces** «`as_of` no futura» **no** se escribe como comparación propia: se deduce, y una rama que ningún test puede cubrir no se escribe (§5, 100 % de ramas).
4. **Dado** `SAMPLES.tax_return_filed`, **cuando** se corrige su `as_of` al valor coherente, **entonces** ningún test que dependiera de la incoherencia cambia de resultado; si alguno cambia, es un test que fijaba un defecto y se dice.

---

### Historia 3 — Que las dos interfaces respondan lo mismo a la misma pregunta (Prioridad: P2)

El usuario abre `/fiscal` en un ejercicio en el que **ningún criterio firme mueve nada**. La consola imprime siempre su apartado 10; la web esconde la tarjeta. «Comprobado y sin efecto» es información (decisión (j)), y las dos interfaces la dicen.

**Por qué esta prioridad**: no se pierde ninguna cifra, pero es exactamente la divergencia que motivó ADR-0024, y arreglarla cuesta un estado vacío y una frase.

**Prueba independiente**: un informe con `settled` vacío: la tarjeta de la web aparece con su estado vacío y la consola imprime una frase en vez de unas cabeceras huérfanas.

**Escenarios de aceptación**:

1. **Dado** un informe con `settled` vacío, **cuando** se pinta `/fiscal`, **entonces** la tarjeta de criterios firmes **aparece**, con la forma del estado vacío que ya tiene la de los dudosos.
2. **Dado** ese mismo informe, **cuando** se imprime `atlas tax <año>`, **entonces** el apartado 10 dice con una frase que ninguno mueve nada, en vez de una tabla sin filas.
3. **Dado** un informe con entradas en `settled`, **entonces** las dos interfaces siguen enseñando lo de siempre, con sus ceros incluidos.

---

### Historia 4 — Que la misma presentación registrada dos veces se detecte (Prioridad: P2)

El usuario registra su Renta, se despista y la vuelve a registrar unos días después con la misma referencia de justificante. Hoy las dos fechas distintas hacen que la huella de idempotencia no colisione: quedan dos presentaciones para una, y las dos alimentan la cadena de complementarias y el ancla del ejercicio.

**Por qué esta prioridad**: cuesta borrar una línea **hoy**, y una migración de esquema dentro de un año (ADR-0018, decisión (c)).

**Prueba independiente**: dos eventos con el mismo modelo, ejercicio y justificante y distinto `filed_at` producen la misma huella; una complementaria, con justificante propio, produce otra.

**Escenarios de aceptación**:

1. **Dado** dos `tax_return_filed` del mismo modelo, ejercicio y `receipt_reference` con **fechas de presentación distintas**, **entonces** su huella de idempotencia es **la misma** y el registro pide confirmación de duplicado.
2. **Dado** una complementaria del mismo modelo y ejercicio con **su propio** justificante, **entonces** su huella es **distinta** y no colisiona con la original.
3. **Dado** el repositorio entero, **cuando** se cambia la tupla, **entonces** **ningún** fichero dorado se mueve y ninguna prueba fija hoy una huella de presentación como literal (comprobado; ver `questions.md`, comprobación previa 1).

---

### Historia 5 — Que un ejercicio que se puede calcular no se vuelva imposible de consultar (Prioridad: P1)

El usuario pide el informe de un ejercicio **soportado y calculable**, o simplemente cambia un ajuste. Hoy, si una **lectura alternativa** del libro alcanza por debajo del primer año soportado, la aplicación no degrada: se cae. En el informe eso es una pantalla de error; en `atlas settings set` es **un cambio de configuración que revienta antes de preguntar**, y el ajuste no llega a escribirse.

**Por qué esta prioridad**: es la única de las nueve pendientes en la que el usuario **no está consultando, está escribiendo**, y la única que deja un comando muerto. Verificada con salida de comandos en `questions.md` (comprobación previa 2).

**Prueba independiente**: un libro cuyo único hecho fiscal tiene la fecha de contratación en un ejercicio anterior al primero soportado y la fecha valor en el primero: la lectura principal sale, las alternativas alcanzan más atrás. El informe se obtiene, con la lectura alternativa marcada; el comando de configuración pregunta y escribe.

**Escenarios de aceptación**:

1. **Dado** ese libro, **cuando** se pide `atlas tax <año soportado>`, **entonces** el informe **se obtiene**, y la entrada del criterio cuya lectura contraria alcanza más atrás dice que **no se puede medir**, con un motivo propio distinto del de «la otra lectura deja eventos inválidos».
2. **Dado** ese libro, **cuando** la configuración anterior es la que alcanza más atrás, **entonces** el apartado de diferencias con la configuración anterior **lo dice** en vez de dejar el informe sin salida, con su equivalente del `invalid_before` que ya existe.
3. **Dado** ese libro con una Renta presentada cuya `computed.settings` es la que alcanza más atrás, **entonces** la comparación de lo declarado **se obtiene**, y lo que no se puede leer se dice; el informe no se cae.
4. **Dado** ese libro con una Renta presentada, **cuando** se ejecuta `atlas settings set` con el cambio que arrastra la cadena, **entonces** el comando **no muere**: informa, pregunta y escribe si el usuario confirma.
5. **Dado** cualquier otro error del dominio dentro de esas lecturas, **entonces** la guardia **lo vuelve a lanzar**: solo se degrada el código concreto, distinguido por **código** y nunca por texto.
6. **Dado** el motivo nuevo, **cuando** llega a la web, **entonces** el mapa de motivos de la pantalla está **cerrado contra la unión del dominio** y un motivo sin traducir rompe la compilación, no la pantalla.

---

### Historia 6 — Que el aviso de ejercicio cerrado no afirme lo que no ha comprobado (Prioridad: P1)

El usuario registra algo sobre un libro con eventos inválidos, o sobre un 720. Hoy el aviso o **se calla** —cuando la lectura anterior no se puede calcular y el cambio no cae por fecha— o **afirma** que «no mueve ninguna cifra declarada», que es lo que la aplicación dice cuando **no ha podido compararlo**. La segunda cara es la peor: el usuario firma una complementaria de menos por una frase que la aplicación no podía sostener.

**Por qué esta prioridad**: la cabecera del módulo vende «nunca en silencio» y es falso en una combinación alcanzable, y lo que se afirma en falso tiene consecuencias con la Agencia Tributaria.

**Prueba independiente**: un libro con eventos inválidos en la lectura anterior y un cambio fechado **fuera** del ejercicio presentado que aun así mueve una cifra declarada: hoy no sale nada; después sale el tercer desenlace, con su causa.

**Escenarios de aceptación**:

1. **Dado** una lectura anterior que no se puede calcular y un cambio **fuera de fecha** del ejercicio presentado, **entonces** sale un aviso que dice **«no he podido comparar»**, no silencio.
2. **Dado** una lectura que no se puede comparar y un cambio **que sí cae por fecha**, **entonces** el aviso dice que cae por fecha **y** que la comparación no se ha hecho; **nunca** «no mueve ninguna cifra declarada».
3. **Dado** un 720 o un 721 cerrado, **entonces** el aviso dice que sus cifras **no se comparan por diseño**, que no es lo mismo que «no se mueven».
4. **Dado** el desenlace nuevo, **entonces** viaja en una **unión cerrada**: añadirlo rompe la compilación en los puntos de uso del tipo, y ninguna interfaz puede desestructurarlo y tirarlo.
5. **Dado** el motor, **entonces** es **él** quien decide que hay que advertir; las interfaces solo eligen palabras y sitio.
6. **Dado** el reparto de coste de la 010, **entonces** el hecho sigue viviendo en el trozo de arranque y el desenlace nuevo se emite donde hoy se emite la cifra: el arranque de la web no pasa de 73,5 KB gzip ni el total de 236,0.

---

### Historia 7 — Que se me diga cuándo la cifra que veo no es la que el motor calculó (Prioridad: P1)

Cuando hay una Renta presentada, el motor **sustituye** lo pendiente que él calcula por lo declarado y sigue la cadena desde ahí (ADR-0020). La consola lo dice; **la web no lo dice en ninguna parte**. Y debajo hay un fallo del dominio: con **dos** Rentas presentadas solo sobrevive la sustitución de la última.

**Por qué esta prioridad**: es el más silencioso de todos. El usuario mira unas pérdidas pendientes ya sustituidas y nada le dice que la cifra que tiene delante no es la que el motor calculó.

**Prueba independiente**: un libro con **dos** Rentas presentadas en ejercicios distintos, ambas con pendientes que difieren de lo calculado; el informe del ejercicio posterior conserva **las dos** sustituciones, y la pantalla las dice junto a las pérdidas pendientes.

**Escenarios de aceptación**:

1. **Dado** un libro con dos Rentas presentadas en ejercicios distintos, **cuando** se pide el informe del ejercicio posterior, **entonces** el informe conserva **las dos** sustituciones, no la última.
2. **Dado** ese informe, **cuando** se imprime en la consola, **entonces** el texto sigue siendo cierto con más de un ancla y **las nombra todas**.
3. **Dado** ese informe, **cuando** se pinta `/fiscal`, **entonces** la sustitución se ve **junto a las pérdidas pendientes**, que es la cifra afectada, y no en una nota al final.
4. **Dado** la privacidad activa, **entonces** se ve **que hubo sustitución**; los importes, no, como cualquier otro importe.
5. **Dado** un ejercicio anclado **anterior** a los datos del libro, **entonces** se sigue diciendo lo que ya se decía: no es una diferencia, es lo que el usuario arrastraba de antes de usar la aplicación.

---

### Historia 8 — Que el test de criterios ate cada variante a su lectura (Prioridad: P2)

Desde que los criterios firmes se separan de los dudosos, **la certeza decide** si al usuario se le dice «nadie sabe cómo se lee esto» o «esto está resuelto, y esto es lo que hay detrás». El test antideriva comprueba pertenencia al conjunto de la fila y nunca empareja variante con lectura: una variante de la fila #2 o de la #24 puede tomar la certeza de su hermana sin que nada lo vea.

**Por qué esta prioridad**: no cambia ninguna cifra, pero es la barrera que sostiene una decisión que sí la cambia. Y toca un documento de la dirección, con permiso expreso (decisión (k)).

**Prueba independiente**: intercambiar la certeza de `2:fund_2m` y `2:fund_1y` en el documento o en el catálogo pone el test en rojo **nombrando las dos**.

**Escenarios de aceptación**:

1. **Dado** el documento en su formato nuevo, **entonces** cada identificador del catálogo aparece **exactamente una vez**, con **su** certeza y **su** dirección del riesgo.
2. **Dado** el formato nuevo, **entonces** **no se pierde ni una línea** de la prosa ni del fundamento que hoy tiene cada criterio, y la fila numerada sigue siendo la que se cita como «criterio #2».
3. **Dado** el test reescrito, **entonces** es un emparejamiento **exacto** y ya no necesita la regla de «la certeza más dudosa la lleva alguien», que era un sustituto de no poder emparejar.
4. **Dado** el formato nuevo, **entonces** **una celda vacía deja de ser expresable** y el mapa `DOCUMENT_SILENT` —cuatro exenciones escondidas en código— desaparece.
5. **Dado** cualquier celda que se rellene, **entonces** dice **lo que el catálogo ya declara**; si alguna no coincidiera, se para y se pregunta.
6. **Dado** el documento y el catálogo, **entonces** cambian en **el mismo commit**, y la cabecera del test deja de describir un límite que ya no existe.

---

### Historia 9 — Que un libro con una huella rota no quede congelado para siempre (Prioridad: P1)

Compactar es **la única vía de migrar el libro a una versión de esquema nueva**. Hoy, si una huella de presentación no se puede verificar, `compact` se niega siempre y no hay salida ni procedimiento escrito: el libro queda congelado en su versión para siempre, y el único rodeo que le queda al usuario es editar el `.jsonl` a mano, que es justo lo que la huella existe para detectar.

**Por qué esta prioridad**: es un fallo de supervivencia a veinte años, peor que cualquier cosa de la que la huella protege (decisión (a)). Va al final del orden porque es el único que puede pedir una ADR y no debe bloquear a los demás.

**Prueba independiente**: un libro con una huella no verificable y líneas de una versión anterior: `compact` se niega por defecto; con la salida pedida a propósito, reescribe **y deja registrado en el propio libro** que aquella huella no se pudo verificar y por qué; `check` lo sigue diciendo después.

**Escenarios de aceptación**:

1. **Dado** un libro con una huella de presentación que no se puede verificar, **cuando** se compacta sin pedir nada, **entonces** se rechaza, como hoy.
2. **Dado** ese libro, **cuando** el usuario pide la salida **a propósito y nombrando la presentación**, **entonces** compacta, y **las demás presentaciones siguen protegidas**: no es un `--force` que lo arrasa todo.
3. **Dado** ese compactado, **entonces** el **propio libro** registra que la huella de esa presentación no se pudo verificar y **por qué** (`digest` o `unreadable`), en una **línea nueva**: el libro es *append-only* y no se toca lo presentado (ADR-0020).
4. **Dado** ese libro ya compactado y resellado, **cuando** se ejecuta `check` o `check --deep`, **entonces** **lo sigue diciendo siempre**, sin caducar y sin esconderse, con las palabras del caso —no verificable, y lo diste por bueno tú el tal día—: ni acusación de edición a mano ni certificado de que todo está bien.
5. **Dado** una comparación de lo declarado sobre un prefijo **sin verificar**, **entonces** la comparación **lo advierte como nota del informe con su código** y no atribuye con seguridad a la causa «el motor calcula distinto que entonces».
6. **Dado** que registrar eso exigiera tocar el esquema, **entonces** se propone como **ADR en estado `Propuesta`** y la acepta la dirección; se comprueba **pronto** si hace falta subir `schema_version` y se reporta **antes** de fijar la forma (ADR-0018).

---

### Casos límite

- **Un libro sin ninguna presentación** (el de hoy): nada de esta feature se activa, y el coste de comprobarlo sigue siendo el camino rápido que ya existe.
- **La lectura alternativa que alcanza más atrás es la única que falla**: la principal sale y el informe se entrega; lo que no se pudo medir se dice por su motivo.
- **Las dos lecturas fallan**: la principal ya se rechaza hoy con `tax_year_unsupported` o `tax_ledger_invalid`, y eso no cambia.
- **Dos Rentas presentadas en el mismo ejercicio** (original y complementaria): el ancla del ejercicio es **una**, la de la presentación en vigor; lo que se conserva son las sustituciones de **ejercicios distintos**.
- **Un ancla anterior al primer ejercicio con cifras**: se sigue marcando como lo que es, y no cuenta como diferencia.
- **`settled` vacío y `doubtful` vacío a la vez**: las dos tarjetas enseñan su estado vacío; la pantalla no queda muda.
- **Un `2:other` con una ventana arbitraria más corta que la legal**: la dirección del riesgo es **ambas**, porque depende de lo que el usuario configure.
- **Compactar un libro con varias huellas rotas**: la salida se pide presentación a presentación; una sola no autoriza las demás.
- **Compactar dos veces**: después de resellar, nada en el fichero diría que aquella huella nunca se comprobó salvo el registro que el bloque 8 añade.

---

## Requisitos *(obligatorio)*

### Requisitos funcionales

**Bloque 0 — los mensajes**

- **FR-001**: La comprobación profunda DEBE distinguir los tres motivos de `FingerprintCheck.reason` hasta las dos interfaces: `lines` con el código que ya tiene, `digest` con `filing_fingerprint_mismatch`, y `unreadable` con un **código propio**. El motivo viaja **como código**, no como dato dentro del mensaje, porque `IntegrityFinding` no tiene campo de detalles y porque es lo que permite que cada interfaz elija sus palabras.
- **FR-002**: Lo que la aplicación le pide al usuario ante `unreadable` NO DEBE ser restaurar una copia de seguridad: no hay nada que restaurar y no arregla nada.
- **FR-003**: `FingerprintCheck` DEBE llevar la **versión de esquema de la huella**, rellenada donde se construye el *check*, y el mensaje del caso `unreadable` DEBE usarla. Es el único mensaje del proyecto que dice **desde qué versión** hay que migrar.
- **FR-004**: Mientras el bloque 8 no exista, el mensaje nuevo NO DEBE mandar hacer algo que esté bloqueado. Cuando el bloque 8 entre, DEBE nombrar la salida.

**Bloque 1 — `computed.as_of`**

- **FR-005**: El bloque de consistencia de `tax_return_filed` DEBE rechazar un `computed.as_of` **anterior al 31/12 del ejercicio que declara** —el 31/12 es válido, porque el corte del libro **incluye** su fecha— y un `computed.as_of` **posterior a `filed_at`**, cada uno con **código propio** y sus **dos** traducciones. La regla sale de que `as_of` **cubra el ejercicio entero que declara**, no de una fecha elegida: un cálculo con un corte que deja fuera media declaración produce cifras incompletas y un reparto de causas falso.
- **FR-006**: NO DEBE escribirse la comparación «`as_of` no futura»: se deduce de las dos anteriores más las que ya existen, y una rama inalcanzable no se escribe (`CLAUDE.md`, cobertura al 100 % de ramas). Si al escribir el test apareciera un camino que la hace alcanzable, se dice en `questions.md` en vez de dejarla muerta o bajar el umbral.
- **FR-007**: `SAMPLES.tax_return_filed` DEBE quedar coherente con la regla.

**Bloque 2 — el párrafo y la asimetría**

- **FR-008**: La nota N17 de `specs/010-tax-output/questions.md` DEBE recoger la cadena de compensación **completa**, copiada de donde ya está bien escrita, no rederivada.
- **FR-009**: Las dos interfaces DEBEN decir «ninguno de tus criterios firmes mueve nada» cuando así sea: la web gana su estado vacío con la forma del de `DoubtfulCard`, y la consola dice una frase en vez de unas cabeceras sin filas.
- **FR-010**: Esto NO DEBE migrar a notas del informe lo que ADR-0024 dejó mezclado: solo se iguala lo que las dos interfaces dicen de un campo que ya existe.

**Bloque 3 — la huella de duplicados**

- **FR-011**: La tupla de idempotencia de `tax_return_filed` DEBE dejar de incluir `filed_at`, de modo que el mismo modelo, ejercicio y justificante colisionen y pidan confirmación de duplicado.
- **FR-012**: Una complementaria, con justificante propio, NO DEBE colisionar con la original.
- **FR-013**: El cambio DEBE hacerse dentro de `schema_version = 1`, con las dos premisas verificadas **antes** y reportadas: que solo afecta a líneas de presentación, y que no existe ninguna línea `tax_return_filed` escrita en el repositorio.

**Bloque 4 — la degradación de una lectura alternativa**

- **FR-014**: Una lectura **alternativa** que alcance por debajo del primer año soportado NO DEBE impedir el informe del ejercicio pedido: se degrada y se dice.
- **FR-015**: La guardia DEBE vivir en **un ayudante** del dominio, aplicado en los cuatro sitios —la comparación de lo declarado, las lecturas de criterios, la diferencia con la configuración anterior y las cifras del ejercicio cerrado—, DEBE distinguir el caso por **código** de `DomainError` y NO DEBE tragarse ningún otro error.
- **FR-016**: `CriterionStake.reason` DEBE ganar el motivo equivalente para este caso, y `SettingsDiff` su equivalente de `invalid_before`.
- **FR-017**: El mapa de motivos de la web DEBE quedar **cerrado contra la unión del dominio**, comprobado quitando una entrada.
- **FR-018**: Los `catch` de las interfaces DEBEN dejar de ser lo que sujeta esto: con el dominio degradando, esos caminos pasan a **decir** lo que pasa.
- **FR-019**: `atlas settings set` NO DEBE morir por este motivo: informa, pregunta y escribe.

**Bloque 5 — el tercer desenlace del ejercicio cerrado**

- **FR-020**: `ClosedYearImpact` DEBE poder expresar un tercer desenlace, «no he podido comparar», en una **unión cerrada**; un campo opcional más NO vale.
- **FR-021**: El desenlace DEBE distinguir las causas que el motor conoce: una lectura que no se puede calcular (eventos inválidos), una que alcanza por debajo del primer año soportado, y un modelo cuyas cifras la cadena **no compara por diseño** (720 y 721).
- **FR-022**: Ninguna interfaz DEBE decir «no mueve ninguna cifra declarada» cuando la comparación no se ha hecho.
- **FR-023**: El aviso NO DEBE callarse en la combinación conocida: lectura anterior inválida y cambio fechado fuera del ejercicio presentado.
- **FR-024**: La emisión DEBE ser del motor; las interfaces solo eligen palabras y sitio.
- **FR-025**: El reparto de coste de la 010 NO DEBE deshacerse: el hecho sigue en el trozo de arranque y el desenlace se emite donde hoy se emite la cifra.

**Bloque 6 — el ancla**

- **FR-026**: El informe DEBE llevar **todas** las sustituciones que la cadena aplicó, no la última, como **lista siempre presente** —vacía cuando no hubo ninguna—, que es la convención que el resto del informe sigue con sus listas.
- **FR-027**: La web DEBE decir la sustitución **donde está la cifra afectada**, las pérdidas pendientes; con la privacidad activa se ve **que hubo sustitución** y no los importes.
- **FR-028**: La consola DEBE seguir siendo cierta con más de un ancla y nombrarlas todas.

**Bloque 7 — el test antideriva**

- **FR-029**: `docs/fiscal-questions.md` DEBE pasar a **una fila por variante**, legible por máquina, con cada identificador del catálogo exactamente una vez, su certeza y su dirección del riesgo, **sin perder** prosa ni fundamento y conservando la fila numerada que se cita como «criterio #N».
- **FR-030**: Una celda vacía DEBE dejar de ser expresable, y `DOCUMENT_SILENT` DEBE desaparecer. Las cuatro celdas hoy mudas se rellenan con los **cuatro valores que ya existen** en `RiskDirection`: `2:listed_1y`, `2:fund_1y` y `2:crypto` **conservadora**; `2:other` **ambas**. No hay vocabulario nuevo.
- **FR-031**: El test DEBE pasar a emparejar **identificador → certeza, riesgo** de forma exacta, DEBE dejar de necesitar la regla de la certeza más dudosa, y su cabecera DEBE describir lo que garantiza ahora, incluida la frase que fija qué es y qué no: **un trinquete contra la deriva futura, no una prueba de que los valores de hoy sean correctos**.
- **FR-032**: Documento y catálogo van **en el mismo commit**, y se comprueba que el test **no es vacío** intercambiando la certeza de `2:fund_2m` y `2:fund_1y`.
- **FR-033**: NO DEBE analizarse prosa española, ni inventarse una certeza o un riesgo que el documento no dice.

**Bloque 8 — la salida registrada de `compact`**

- **FR-034**: El rechazo DEBE seguir siendo el comportamiento por defecto.
- **FR-035**: La salida DEBE ser explícita, pedida a propósito y **por presentación**: aceptar que la huella de **esa** presentación no se pueda verificar, quedando protegidas las demás.
- **FR-036**: El hecho DEBE quedar registrado **en el propio libro**, con su motivo (`digest` o `unreadable`), como **línea nueva**: el libro es *append-only*.
- **FR-037**: NO DEBE tocarse lo presentado: el registro dice algo **sobre** la presentación, no la corrige ni la reescribe.
- **FR-038**: `check` y `check --deep` DEBEN seguir diciéndolo siempre, sin caducar y sin esconderse, ni como acusación de edición a mano ni como certificado de que todo está bien.
- **FR-039**: La comparación de lo declarado DEBE advertirlo **como nota del informe con su código** y no repartir con seguridad en la causa «el motor calcula distinto que entonces» cuando el prefijo no esté verificado.
- **FR-040**: Si registrarlo exige esquema nuevo, se propone **ADR en estado `Propuesta`** y decide la dirección; la comprobación se hace **pronto** y se reporta antes de fijar la forma.

### Requisitos transversales

- **FR-041**: Todo código de error o de hallazgo nuevo DEBE estar traducido en **las dos** interfaces, con `tests/messages.test.ts` en verde. *(Ver la observación E2 de `questions.md`: lo que ese test exige de un hallazgo no es literalmente lo que dice el encargo.)*
- **FR-042**: `packages/domain` DEBE quedar al **100 %** de líneas y ramas, sin tests de relleno: una rama muerta se **borra** con un comentario que explique el invariante.
- **FR-043**: NO DEBE añadirse ninguna dependencia, ni tocarse `docs/`, `.githooks/`, `.claude/`, `.specify/` ni `CLAUDE.md`, con la **única** excepción de `docs/fiscal-questions.md` (bloque 7, decisión (k)).
- **FR-044**: Ninguna regla fiscal DEBE vivir fuera del dominio.
- **FR-045**: De cada arreglo DEBE poder decirse **cómo se vio en rojo**, escrito en `questions.md`, arreglo por arreglo.

### Entidades principales

- **`FingerprintCheck`**: el resultado de verificar la huella de una presentación contra el fichero. Gana la **versión de esquema** que la huella declara, y su motivo pasa a distinguirse por código hasta las interfaces.
- **`ClosedYearImpact`**: lo que una escritura hace a un ejercicio ya presentado. Gana un **desenlace** en unión cerrada, con la causa de por qué no se pudo comparar cuando así sea.
- **`CriterionStake.reason` / `SettingsDiff`**: el vocabulario con el que el motor dice por qué una lectura alternativa no se puede medir. Gana el motivo de la cadena que alcanza demasiado atrás.
- **`AnchorDifference`**: lo que el motor sustituyó por lo declarado en un ejercicio de la cadena. Pasa de ser **uno** a ser **todos** los que la cadena aplicó.
- **La tupla de idempotencia de una presentación**: modelo, ejercicio y justificante; **sin** la fecha de presentación.
- **El registro de una huella no verificada**: lo que el libro guarda cuando el usuario pide la salida de `compact`, con la presentación que nombra, el motivo y el día en que la dio por buena.

---

## Criterios de éxito *(obligatorio)*

### Resultados medibles

- **SC-001**: `lint`, `typecheck`, `test:coverage`, `build` y CI en verde, con `packages/domain` al **100 %** de líneas y ramas. *(Línea de partida medida en `develop`: 1.782 tests, 186 ficheros, 100 % en las cuatro métricas.)*
- **SC-002**: Los once mutantes de §5 del encargo **mueren**, comprobando en cada caso que la sustitución llegó a escribirse.
- **SC-003**: El único movimiento de un fichero dorado es el **previsto y predicho**: `synthetic-v1.tax.json` gana una clave `"anchors": []` en cada uno de sus cuatro ejercicios (bloque 6), con su predicción escrita y comiteada **antes** de regenerar y el diff comparado clave por clave después. `synthetic-v1.jsonl`, `synthetic-v1.snapshot.json` y `tax-hand-v1.jsonl` quedan **idénticos**. Cualquier otra diferencia es un **hallazgo**: se para y se pregunta.
- **SC-004**: El paquete web queda dentro de sus techos, con lo medido escrito: arranque ≤ **73,5 KB** gzip y total ≤ **236,0**, partiendo de **72,9** y **235,0**.
- **SC-005**: El informe de un ejercicio soportado y calculable **se obtiene** en los cuatro casos en que hoy no se obtiene, y `atlas settings set` **escribe** donde hoy muere.
- **SC-006**: Ninguna de las dos interfaces afirma «no mueve ninguna cifra declarada» sin haber comparado, comprobado con el caso construido a mano.
- **SC-007**: Un informe con dos Rentas presentadas conserva **las dos** sustituciones, y las dos interfaces las dicen.
- **SC-008**: El test de criterios empareja **34 identificadores** con su certeza y su riesgo, sin exenciones, y se pone rojo nombrando las dos entradas al intercambiar `2:fund_2m` y `2:fund_1y`.
- **SC-009**: Un libro con una huella no verificable **se puede compactar** pidiéndolo a propósito, y después de compactar el libro y `check` lo siguen diciendo.
- **SC-010**: Capturas medidas entregadas en `~/atlas-private/capturas/`, a 400×890 DPR 3, 2045×1141 y 360 de ancho, con `scrollWidth === clientWidth` comprobado **en el navegador**, con libro vacío y con datos, con privacidad puesta y quitada, claro y oscuro al menos una vez.

---

## Supuestos

Todos verificados contra el código de `develop` (`c141cb0`); los que no se pudieron cerrar están como preguntas P1–P5 en `questions.md`.

- **S1**: `tupleOf` reparte por tipo de evento y quitar `filed_at` toca únicamente la rama `tax_return_filed`. **Verificado** leyendo la función entera (comprobación previa 1).
- **S2**: No existe ninguna línea `tax_return_filed` escrita en el repositorio. **Verificado** con `git ls-files` sobre los ocho `.jsonl` y sobre todo fichero seguido que no sea `.ts`/`.tsx`/`.md` (comprobación previa 1).
- **S3**: Las cuatro lecturas alternativas sin guardia del dominio son las que dice el encargo, **incluida** la del informe de comparación, alcanzada **antes** que las otras dos del informe. **Verificado** con trazas de pila reales (comprobación previa 2).
- **S4**: De los cuatro caminos de `figuresOf`, tres los tapa un `try/catch` de la interfaz y el cuarto —`atlas settings set`— está desnudo. **Verificado**, con la salida del comando (comprobación previa 2).
- **S5**: El mensaje de `tax_year_unsupported` **no** culpa al ejercicio que el usuario pidió: lleva el año al que llega la cadena. **Verificado**; la instrucción retirada en la decisión (f) se confirma retirada.
- **S6**: `anchor` no se lee ni una vez en `apps/web/src`. **Verificado**: los únicos aciertos de la palabra son un elemento `<a>` de la exportación.
- **S7**: La consola imprime siempre el apartado 10 y la tabla vacía sale como **cabeceras huérfanas** (cabecera más separador, sin filas). **Verificado** leyendo `table()`.
- **S8**: `MEASURE_REASONS` de la web es un `Record<string, string>` abierto y `REASONS` de la consola está tipado contra la unión. **Verificado**.
- **S9**: Las cuatro celdas mudas del documento coinciden con lo que el catálogo declara (`2:listed_1y`, `2:fund_1y`, `2:crypto` conservadoras; `2:other` ambas). **Verificado** contra `FISCAL_CRITERIA`.
- **S10**: La línea de partida del paquete web es 72,9 / 235,0 KB gzip contra techos de 73,5 / 236,0. **Medido** con `npm run build` el 2026-09-23.

---

## Fuera de alcance

Tal como lo fija §4 del encargo, y sin excepciones:

- Migrar a notas del informe lo que ADR-0024 dejó mezclado (`compensation.pending`/`expired`, `BoxEntry.partial`, `CRITERION_LABELS` y `CRITERION_NAMES`).
- Los seguimientos que la 010 dejó anotados en `implementation-notes.md` §6: retirar `priorYear`/`isPriorYear`, el `today()` de la web y medir el informe con la CPU frenada ×4.
- Resolver cualquier criterio fiscal en disputa. Cambiar lo que el catálogo declara de un criterio al rellenar la tabla del bloque 7 **es** cambiar el criterio: se pregunta.
- Aceptar una ADR (se puede proponer), reabrir una aceptada, cambiar el esquema por iniciativa propia, y cualquier cosa de AWS.
- Funcionalidad nueva, pantallas nuevas, dependencias nuevas y retoques visuales que no sean el estado vacío del bloque 2 y lo que el bloque 6 tenga que pintar.
- **Bloqueado**: los importadores de MyInvestor e IBKR (no existen los ficheros de ejemplo reales) y la nube y la Fase 4 (cuesta dinero y el usuario lo ha descartado).
