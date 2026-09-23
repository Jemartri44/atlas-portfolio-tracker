# Prompt 011 — Feature `011-fail-safe-gaps`

> Copia este texto íntegro al asistente implementador, o indícale que lea `docs/prompts/011-fail-safe-gaps.md`.
>
> **Requisito previo: la PR de cierre documental de la 010 (#67, rama `docs/post-010-cierre`) tiene que estar fusionada en `develop`.** Trae dos cosas de las que depende esta feature: **`docs/pendientes-post-010.md`**, que es el inventario del que sale casi todo el alcance, y **ADR-0024 aceptada**, que gobierna cuatro de los bloques. Si no está fusionada, los dos se leen de la rama (`git show origin/docs/post-010-cierre:docs/pendientes-post-010.md` y `git show origin/docs/post-010-cierre:docs/adr/0024-fiscal-caveats-are-report-notes.md`); en `develop` la ADR-0024 todavía figura como **Propuesta** y la versión buena es la aceptada, que además lleva dentro el criterio de **qué es nota y qué es dato**.
>
> **El inventario no es infalible, y ya se ha equivocado una vez.** La verificación independiente de este prompt encontró **dos afirmaciones falsas** en el párrafo de la pendiente 7 y **una lectura sin guardia que no estaba contada**. Donde este documento y el inventario discrepen, manda este documento, y lo que se dice aquí **también se verifica antes de tocar**.
>
> **§7 está vacío a propósito.** Es donde la dirección responderá a tus preguntas y donde se anotarán los errores de este prompt, como en los diez anteriores.

---

Eres el asistente implementador del proyecto **Atlas Portfolio Tracker** (`~/projects/atlas-portfolio-tracker`). Vas a **cerrar los huecos del fallo seguro** que dejó abiertos la feature 010: los sitios en los que el motor fiscal **sabe algo y no lo dice, o lo dice mal**, más la única puerta por la que el usuario puede quedarse encerrado fuera de su propio libro.

Entran **las nueve pendientes vivas** de `docs/pendientes-post-010.md`, una asimetría que el inventario anota «de paso» y **un defecto nuevo** que no estaba en la lista y es de la misma familia: el ancla de lo declarado.

No hay funcionalidad nueva en esta ronda. Todo lo que entra existe ya y funciona **casi siempre**. Lo que se arregla es lo que pasa en el borde, y ese es justamente el trabajo: un fallo seguro que solo falla en el borde no es un fallo seguro, es uno que nadie ha mirado.

## 0. Tres cosas que tienes que entender antes de leer nada más

**La aplicación nunca deja al usuario encerrado fuera de su propio libro.** Compactar es la única vía de migrar el fichero a una versión de esquema nueva, así que un libro que no se puede compactar es un libro **congelado para siempre**. Eso es un fallo de supervivencia a veinte años, y es peor que cualquier cosa de la que la huella de una presentación protege: la huella detecta una edición a mano; el bloqueo impide leer el libro dentro de diez años. Por eso el bloque 8 abre una salida. Pero **no se compacta en silencio**: la salida hay que pedirla a propósito y queda **registrada en el propio libro**.

**Una salvedad fiscal la emite el motor, no la interfaz** (ADR-0024). Esta ronda la aplica **cuatro veces**: la asimetría de los criterios firmes (bloque 2), el tercer desenlace del aviso de ejercicio cerrado (bloque 5), el ancla de lo declarado (bloque 6) y la comparación sobre un prefijo sin verificar (bloque 8). **Cuatro casos de la misma regla en una sola ronda no es una coincidencia: es la prueba de que la decisión describía un problema real y no una preocupación teórica.** En los cuatro, el que tiene que decirlo es el motor, como **dato con código**; las interfaces eligen palabras y sitio, nunca **si** se dice. Si mientras escribes uno de esos bloques te descubres arreglándolo en la pantalla o en la consola —añadiendo allí una condición que decide cuándo avisar—, es la señal de que lo estás haciendo mal: vuelve al dominio.

**Callarse es no ayudar; afirmar en falso es hacer daño.** Los dos aparecen en esta ronda, a veces en el mismo sitio, y **el segundo es peor que el primero**. Decir «se han editado a mano» a quien solo tiene líneas ilegibles, o «no mueve ninguna cifra declarada» cuando lo cierto es «no he podido compararlo», no es una imprecisión: es enviar al usuario en la dirección contraria con la aplicación diciéndole que va bien. El usuario no tiene asesor fiscal y esta aplicación es su única fuente.

## 1. Lee antes de hacer nada, en este orden

1. `CLAUDE.md` entero. Te afectan de lleno las *domain traps* **8** (el libro es *append-only*: nada se edita ni se borra), **10** (el cargador rechaza versiones nuevas y `append` no reserializa), **5** (ningún cálculo fiscal depende de precios) y **7** (el libro propio es la fuente de verdad).
2. `.specify/memory/constitution.md`: **V** (fallo seguro) es la que gobierna la ronda entera; **IV** (nada configurable escrito en el código) y **II** de fondo.
3. **ADR-0024 entera, en su versión aceptada** (bloques 2, 5, 6 y 8: es tu encargo), **ADR-0020** con sus dos enmiendas y su nota de erratas, **ADR-0003** (*append-only*; anular algo ya consumido se rechaza), **ADR-0018** (qué cambio de esquema es compatible y cuál exige `schema_version = 2`; **léela entera antes de los bloques 3 y 8**), **ADR-0015** (proyección degradada), **ADR-0006** (el fichero y `compact`), **ADR-0016** (`asOf`) y **ADR-0022** (la configuración se registra entera).
4. **`docs/pendientes-post-010.md` entero**, sabiendo lo que dice el aviso de arriba: es el inventario del que sale el encargo, pero **no es infalible**. Donde este prompt dice «pendiente N», es esa tabla.
5. **`specs/010-tax-output/implementation-notes.md`**, apartados **3**, **7**, **9** y **10** enteros —son las lecciones de método de la ronda anterior, y §2 ter las resume pero no las sustituye—, y **`specs/010-tax-output/questions.md`**, apartados **«5 bis»** (las doce anotaciones, en su redacción original) y **«6. Trampas que morderían al siguiente»**.
6. `docs/prompts/010-tax-output.md` **§6 y §7** y `docs/prompts/009-tax-engine.md` **§7**: las decisiones ya tomadas sobre lo que vas a tocar. No se reabren.
7. `docs/data-schema.md` **§4** (la huella de idempotencia), **§5** (el cargador y `compact`), **§7** (integridad) y lo que **§3 y §6** dicen del evento `tax_return_filed`; `docs/business-rules.md` **§5**.
8. `docs/fiscal-questions.md` entero, **con la cabecera de `tests/fiscal-criteria.test.ts` al lado** (bloque 7: ese test dice con precisión qué garantiza hoy y qué no).
9. El código, por bloque:
   - **Huellas**: `packages/domain/src/schema/fingerprint.ts` (la de idempotencia, bloque 3), `packages/domain/src/filings/fingerprint.ts` (la del libro: `FingerprintCheck`, `checkFilingFingerprints`, `resealFilings`), `packages/domain/src/projections/deep-check.ts`, `packages/domain/src/projections/integrity.ts`, `packages/domain/src/usecases/compact.ts`, `apps/cli/src/commands/compact.ts`, `apps/cli/src/main.ts` (`ARITY`, `BOOLEAN_FLAGS`).
   - **Validación del evento**: `packages/domain/src/schema/validate.ts` (el bloque `CONSISTENCY.tax_return_filed`) y `packages/domain/test/samples.ts`.
   - **Lecturas alternativas y ancla**: `packages/domain/src/tax/chain.ts` (dónde se lanza `tax_year_unsupported`, y `let anchor`), `packages/domain/src/tax/year.ts` (`movedTaxYears`, `criterionStakes`, `settingsDiff`, `taxYearWithChain`), `packages/domain/src/filings/comparison.ts` (`readingOf`, `filingComparison`), `packages/domain/src/tax/report.ts` (`AnchorDifference`, `CriterionStake`, `SettingsDiff`), `packages/domain/src/filings/closed-years.ts` (`figuresOf`, `closedYearImpact`, `ClosedYearImpact`) y `packages/domain/src/filings/touched.ts`.
   - **Las dos interfaces**: `apps/cli/src/output/messages.ts`, `apps/cli/src/output/closed-years.ts`, `apps/cli/src/commands/tax.ts`, `apps/cli/src/commands/shared.ts`, `apps/cli/src/commands/rectify.ts`, `apps/cli/src/commands/catalogue.ts`, `apps/cli/src/commands/corporate-actions.ts`; `apps/web/src/format/messages/errors.ts`, `.../findings.ts`, `apps/web/src/format/criteria.ts`, `apps/web/src/components/ClosedYearNotice.tsx`, `apps/web/src/ledger/write.ts`, `apps/web/src/view-models/fiscal/year.ts`, `apps/web/src/routes/fiscal/` entero.
   - **Los tests que mandan**: `tests/messages.test.ts` (todo código del dominio tiene traducción en **las dos** interfaces), `tests/fiscal-criteria.test.ts` y `tests/architecture.test.ts`.

Si algo es ambiguo, contradictorio o te bloquea, **no lo resuelvas**: `specs/011-fail-safe-gaps/questions.md` y avisa. Nada fiscal ni estructural se decide aquí.

## 2. Flujo de trabajo

1. Worktree separado, rama desde `develop` **actualizado**:
   ```bash
   cd ~/projects/atlas-portfolio-tracker && git fetch origin && git worktree add ../atlas-portfolio-tracker-011 -b feature/011-fail-safe-gaps origin/develop
   cd ../atlas-portfolio-tracker-011 && git config core.hooksPath .githooks && nvm use && npm ci
   ```
2. Spec Kit en `specs/011-fail-safe-gaps/` (español, identificadores en inglés). **Para después de `spec.md` y `plan.md`**, con tus preguntas en `specs/011-fail-safe-gaps/questions.md`, y espera el visto bueno antes de escribir código. En las diez features anteriores ese alto destapó las preguntas buenas, y en esta hay **dos** cosas que tienen que llegar antes de tocar nada: las dos premisas del bloque 3 y el mapa de guardias del bloque 4.
3. Implementación por bloques, en el orden de §3, commits atómicos, Conventional Commits en inglés.
4. Sin PR: la dirección sube y fusiona tras revisar.

## 2 bis. Reglas de operación

- **`packages/domain` al 100 % de líneas y ramas.** Bloqueante. No se llega con tests de relleno: si aparece una rama muerta, **se borra** con un comentario que explique el invariante.
- **Ninguna dependencia nueva.** Para el navegador, el Chromium de Playwright que hay en `~/.cache/ms-playwright/`, conducido **desde tu scratchpad**; nunca Playwright en un `package.json` del repositorio.
- **No toques `docs/`, `.githooks/`, `.claude/`, `.specify/` ni `CLAUDE.md`**, con **una excepción expresa y acotada**: el **bloque 7** cambia el formato de **`docs/fiscal-questions.md`**, y solo ese fichero, y solo para llevarlo a una fila por variante. La dirección lo autoriza por escrito en §6, decisión (k). Todo lo demás que creas que debe cambiar en los documentos va a `questions.md`: lo traslada la dirección.
- **Ninguna regla fiscal fuera del dominio.** La CLI y la web muestran. Si un aviso tiene que salir, lo decide `packages/domain`.
- **No toques el esquema por iniciativa propia.** El bloque 3 toca una huella persistida y el 8 puede pedir una versión nueva: los dos llevan su comprobación previa escrita, y si hace falta esquema nuevo se propone como **ADR en estado Propuesta** que **acepta la dirección**, nunca tú (`CLAUDE.md`, regla 8 de «Working on a feature»).
- **Las fechas que escribas en cualquier documento van en `Europe/Madrid`**, no en UTC: es la zona del contribuyente y la que gobierna toda fecha fiscal del proyecto. Una herramienta que devuelve UTC puede darte el día anterior — ya pasó con la fusión de la primera mitad de la 010, a las 22:19 UTC, que en Madrid son las 00:19 del día siguiente.
- **Verifica antes de tocar lo que este prompt afirma del código.** Dos párrafos del inventario resultaron falsos al comprobarlos. Si algo de aquí no cuadra con lo que ves, **para y dilo**: encontrar un error de este prompt es trabajo hecho, no una interrupción.
- **Commits sin rastro de IA**, ni en el asunto ni en el cuerpo. Lo verifican los hooks; si bloquean un commit, no se ejecutó nada: corrige y repite.
- **`npm run lint` verde antes de cada commit y otra vez como último paso antes de entregar.** Nunca `git push`, nunca fusiones.

## 2 ter. Lo que la ronda anterior aprendió a golpes

Cinco lecciones de la 010 que siguen aplicando enteras. Están en `specs/010-tax-output/implementation-notes.md`, donde se indica; aquí van resumidas para que no se te olviden, no para que te ahorres leerlas.

- **Un test que no has visto fallar no es un test.** De cada arreglo de esta ronda tienes que poder decir **cómo lo viste en rojo**: o lo escribiste antes, o revertiste el arreglo y lo viste fallar. Vale para los mensajes del bloque 0, para las guardias del bloque 4 y, sobre todo, para los bloques 5 y 6, cuyos desenlaces son invisibles si el caso no se construye a mano.
- **Un mutante que sobrevive puede ser un mutante que nunca se aplicó** (§3 de las notas). Tres veces se dio por muerto un mutante que el script de sustitución no había llegado a escribir, porque el formateador había reordenado el texto buscado. **Todo script de mutación afirma que la sustitución ocurre** (`assert s.count(old) == 1`) y comprueba el fichero después; y un lote que aborta a mitad deja ficheros escritos y otros no, así que **se vuelve a ejecutar entero**, no se continúa.
- **Un resultado leído a través de una tubería se come el error** (§10.9). `npm run lint | tail` devuelve el código de salida de `tail`, y por eso entraron commits con Biome en rojo **dos rondas seguidas**. El hábito, no la advertencia: **redirige a un fichero y lee `$?`**.
- **Mirar la pantalla encontró tres defectos que ningún test encontró** (§9.6, §10.1 y §10.6). El aviso de caducidad que no podía dispararse nunca, el estado vacío pintado encima de una tabla con 5.000 € caducados y el título en pasado de un ejercicio en curso: los tres salieron de una captura, con la suite entera en verde. **Las capturas no son opcionales**, van medidas, y van a `~/atlas-private/capturas/<fecha>-<asunto>/`, **nunca al repositorio**.
- **Un gemelo compilado eclipsa a su fuente** (§10.3). Ocho ficheros `.js`/`.d.ts` commiteados junto a sus `.ts` hicieron que Vite leyera el compilado: con un `throw` en la primera línea del fuente, **la suite entera pasó en verde**. Hay un test de arquitectura que lo vigila sobre `git ls-files`; no lo desactives y no añadas artefactos compilados.

Y dos más. Una que sale de la verificación de este mismo prompt: **un comentario que descarta un caso tiene que decir cuál descarta.** El de `readingOf` explica por qué no existe el caso de «no se puede calcular» —y es verdad **para los eventos inválidos**— y no dice nada del otro modo de fallo; un comentario que es cierto sobre lo que cubre hace creer que lo cubre todo, y ahí es donde se esconden los agujeros. Y otra que es de este proyecto entero: **los ficheros dorados**. La disciplina está en §5.

## 3. Alcance, por bloques y en este orden

El orden lo fija la dirección y tiene motivo: primero lo **barato y acotado**, que no toca ningún tipo que crucen las interfaces (bloques 0 a 2); después **el de una línea con premisa que verificar** (3), que cuanto antes se haga menos cuesta; después el que degrada una lectura (4), que prepara el terreno del que toca ocho consumidoras (5) y del que le sigue en la misma familia (6); después el del documento y su test (7); y **el de `compact` al final** (8), porque es el único que puede pedir una ADR y no queremos que bloquee a los demás.

### Bloque 0 — Los dos mensajes que mienten (pendientes 4 y 6)

Están en las mismas tres líneas de `packages/domain/src/projections/deep-check.ts` y son lo más barato de la ronda.

- **Dejar de acusar de «editado a mano» a quien solo tiene líneas ilegibles.** `FingerprintCheck.reason` distingue tres motivos —`lines`, `digest` y `unreadable`— y el dominio sabe cuál es. Hoy **`digest` y `unreadable` viajan bajo el mismo código**, `filing_fingerprint_mismatch`, y las dos interfaces lo traducen por «**Se han editado a mano.** Recupera la copia anterior a la edición». Un libro cuyas líneas no se pueden releer en la versión que declara la huella **no es un libro editado**, y la acción que se le manda —restaurar una copia— no arregla nada.
- **Los tres motivos se distinguen hasta las dos interfaces.** `lines` ya tiene el suyo (`filing_fingerprint_lines`, que emite `integrity`); `digest` se queda con `filing_fingerprint_mismatch`; `unreadable` estrena código propio. `IntegrityFinding` no tiene campo de detalles, así que el motivo viaja **como código**, no como dato dentro del mensaje: es lo que permite que cada interfaz elija sus palabras. `tests/messages.test.ts` te exigirá las dos traducciones en cuanto exista el código; la de la web son **dos** textos, el de `errors.ts` y el par `what`/`todo` de `findings.ts`, y el `todo` es el que más importa: **qué tiene que hacer el usuario**, que en este caso no es restaurar nada.
- **El mensaje que dice desde qué versión hay que migrar tiene que decir una versión.** Hoy escribe `cannot be read at schema version ${check.declared_lines}`, y `declared_lines` es **el número de líneas**. `FingerprintCheck` no lleva la versión de la huella, aunque la tiene delante (`declared.schema_version`): añádele el campo, rellénalo donde se construye el *check* y úsalo en el mensaje. Es el único mensaje del proyecto que le dice al usuario **desde qué versión** hay que migrar, y lo dice justo en el camino en el que más lo necesita.
- **Cuidado con lo que promete el mensaje nuevo.** Mientras el bloque 8 no exista, la salida de ese callejón **no existe**: no escribas un texto que mande hacer algo que hoy está bloqueado. Si el bloque 8 entra, vuelve a este mensaje y nómbrala.

### Bloque 1 — La fecha de cálculo sin validar (pendiente 5)

`computed.as_of` es la fecha con la que la comparación de ADR-0020 **relee el prefijo del libro** para repartir la diferencia entre lo declarado y lo calculado en sus cuatro causas. Hoy solo se valida **que sea una fecha**: puede ser anterior al ejercicio que declara, anterior a la presentación o futura, y entonces el reparto sale falso sin que nada avise.

- Las comparaciones van en el bloque de consistencia que **ya existe** para el evento (`CONSISTENCY.tax_return_filed` en `packages/domain/src/schema/validate.ts`), con su código de error propio y sus **dos** traducciones.
- **Cuenta las comparaciones antes de escribirlas.** El bloque ya valida `filed_at` contra el 31/12 del ejercicio y contra `recorded_at`, y esas comprobaciones se ejecutan **antes**. Si `as_of ≤ filed_at` y `filed_at ≤ recorded_at`, entonces «no futura» **se deduce**: escribirla sería una rama que ningún test puede cubrir, y el 100 % de ramas te la va a cazar. Fija las que no se deducen y, si al escribir el test encuentras un camino por el que la tercera sí es alcanzable, **dilo en `questions.md`** en vez de dejarla muerta o de bajar el umbral.
- **La muestra del propio esquema es hoy incoherente con la regla.** `SAMPLES.tax_return_filed` (`packages/domain/test/samples.ts`) lleva `as_of` el **2026-06-20** y `filed_at` el **2026-06-18**: calculado dos días después de presentarlo. Corrígela. Es la muestra que usan los tests de validación, así que compruébalo: si alguno esperaba la incoherencia, es un test que estaba fijando un defecto.
- **Ningún fichero dorado contiene presentaciones** —comprobado al redactar esto: no hay una sola línea `tax_return_filed` en `tests/fixtures/`—, así que aquí no hay nada que regenerar. Si algo se mueve, es un hallazgo: para y pregunta.

### Bloque 2 — Las dos de un párrafo (pendiente 10 y la asimetría «de paso»)

- **La nota N17 se salta una fase.** En `specs/010-tax-output/questions.md` dice «ganancias 462,50; rendimientos −26,00; 26,00 compensados en la fase 1 (límite 115,63); base 175,70», y 462,50 − 26,00 no es 175,70: falta la **fase 2**, con los −260,80 arrastrados de 2027. El motor sí hace las dos. **Copia la cadena buena de donde ya está bien escrita** —la cabecera de `packages/domain/test/tax/income-category-default.test.ts` y `specs/009-tax-engine/questions.md`—, no la rederives. Es una frase y no toca código; el daño de no arreglarla es que quien lea N17 concluya que el motor se salta la fase 2.
- **La asimetría del apartado de criterios firmes: primer caso de la ADR-0024 de esta ronda, y conviene decirlo en el commit.** La consola imprime **siempre** el apartado 10, «Criterios firmes: lo que moverían leídos al revés» (`apps/cli/src/commands/tax.ts`); la web envuelve su tarjeta en un `Show` que **la esconde cuando no hay ninguno**, sin estado vacío, mientras la tarjeta hermana de los dudosos **sí lo tiene** (`apps/web/src/routes/fiscal/CriteriaCards.tsx`). No se pierde ninguna cifra, pero las dos interfaces responden distinto a la misma pregunta, que es exactamente lo que motivó la ADR.
  - La partición de la 010 existe porque **«comprobado y sin efecto» es información**: una entrada cuya lectura contraria no mueve nada aparece igual, con sus ceros. Por el mismo argumento, **«ninguno de tus criterios firmes mueve nada» también lo es**, y se dice en las dos interfaces. La web gana su estado vacío, con la forma del que ya tiene `DoubtfulCard`; y comprueba qué imprime la consola con la tabla vacía: si son unas cabeceras huérfanas, que sea una frase.
  - Esto **no** es migrar lo existente a notas del informe: ADR-0024 dice expresamente que lo ya escrito queda mezclado y que migrarlo es trabajo de otra feature. Aquí solo se iguala lo que las dos interfaces dicen de un campo que ya existe.

### Bloque 3 — La huella de duplicados de una presentación (pendiente 9)

**Entra en la ronda, y entra ahora por un motivo que hay que escribir en el commit.**

La tupla de `packages/domain/src/schema/fingerprint.ts` para `tax_return_filed` es `type + filed_at + model + tax_year + receipt_reference`, y **contradice al comentario que tiene tres líneas más arriba**, que dice que una presentación se identifica por modelo, ejercicio y justificante. Con `filed_at` dentro, el **mismo justificante registrado dos veces con fechas distintas no dispara la confirmación de duplicado**: quedan dos presentaciones para una, y las dos alimentan la cadena de complementarias y el ancla del ejercicio. Se arregla **borrando una línea**.

**Por qué ahora y no en una migración futura.** La tupla que se cambia es **la de las presentaciones**, y el evento `tax_return_filed` **existe desde la feature 010, fusionada el 2026-09-23**. No puede haber en el mundo una sola línea anterior cuya huella cambie. El argumento **no depende de ningún dato sobre el libro privado del usuario**, y un argumento que no depende de un dato que nadie puede comprobar es mejor argumento. **ADR-0018**: hoy esto cuesta una línea; dentro de un año cuesta `schema_version = 2` y su función de migración.

**La condición, y es bloqueante:** antes de borrar nada, **verifica las dos premisas y repórtalas**.

1. Que el cambio **solo afecta a líneas de presentación**: `tupleOf` reparte por tipo de evento, y quitar `filed_at` toca únicamente la rama `tax_return_filed`. Compruébalo leyendo la función entera, no la rama.
2. Que **no existe ninguna línea `tax_return_filed` escrita** en el repositorio: *fixtures*, dorados, archivos de `archive/`, datos de test en disco. La comprobación de la redacción de este prompt dio **cero** en los ocho `.jsonl` de `tests/fixtures/`; repítela tú, con tu propio comando, y enseña la salida.

**Si alguna de las dos no se sostiene, para.** Y si alguna prueba fija hoy la huella de una presentación como literal, **su movimiento se predice y se comitea antes**, con la disciplina de los ficheros dorados (§5).

Lo que el arreglo tiene que dejar probado: el mismo justificante con dos fechas **colisiona** y pide confirmación; y una **complementaria**, que tiene justificante propio, **no colisiona** con la original — que es lo que el comentario del código ya promete y hasta hoy nadie ataba.

### Bloque 4 — El ejercicio que se vuelve inobtenible (pendiente 7)

**Un informe de un ejercicio soportado y calculable no puede volverse imposible de consultar porque una lectura alternativa alcance por debajo del primer año soportado. Se degrada, no se cae.** Eso, y solo eso, es lo que hay que arreglar aquí.

**Y hay una cara peor que el informe, que es por dónde hay que empezar a mirar: el camino desnudo está en el comando de configuración.** `atlas settings set` llama al cálculo **con dos configuraciones distintas** —que es justo el mecanismo que arrastra la cadena por debajo del primer año soportado— y lo hace **sin un solo `try`**. Ahí no hay un informe que no se puede consultar: hay un **cambio de ajuste que revienta**. Es la única de las cuatro lecturas en la que el usuario no está consultando nada, está **escribiendo**, y por eso sube de prioridad dentro del bloque.

> **El inventario se equivoca dos veces en este punto y se queda corto en una tercera. No lo copies.**
>
> - **Falso** que la única guardia del repositorio sea la de `movedTaxYears`: es la única **del dominio**. En la consola y en la web hay varias más que sí atrapan el lanzamiento, de modo que una de las lecturas está cubierta en **tres de sus cuatro caminos**.
> - **Falso** que el mensaje culpe al ejercicio que el usuario pidió: el error lleva el primer año soportado y el año al que llega la cadena, no el pedido. **La instrucción de la dirección sobre «no culpar al año equivocado» se cae con esa premisa y queda retirada**: no hay nada que arreglar en ese mensaje.
> - **Falta una cuarta lectura sin guardia**, la del **informe de comparación**, y está alcanzada **antes** que las tres que el inventario nombra.
>
> El alcance real es **mayor** de lo que contaba el inventario. **Verifica el mapa de guardias antes de tocar nada** y escríbelo en `questions.md`: quién llama a quién, qué camino está protegido y cuál no. El inventario ya se equivocó una vez justo aquí.

`taxChain` lanza `tax_year_unsupported` cuando la cadena tendría que empezar antes de 2018, y la cadena empieza en **el menor de tres**: el año pedido, el primero con cifras y la primera Renta presentada (`packages/domain/src/tax/chain.ts`). El mecanismo por el que una lectura **alternativa** cae ahí sin que la principal lo haga es la configuración: un cambio de `fiscal_date_rule` mueve una operación al ejercicio anterior, y la cadena alcanza un año que la lectura buena no alcanza.

Las lecturas alcanzadas **después** de que la principal haya salido bien, en el orden en que se ejecutan:

1. **`readingOf` / `filingComparison`** (`packages/domain/src/filings/comparison.ts`), llamada desde `taxYearWithChain` **antes** que las otras dos del informe. Relee el prefijo del libro **con la configuración con la que se calculó la presentación**, que es otra que la de hoy, y lo hace con un `taxChain(...) as ChainCore` **sin un solo `try`**. Su comentario explica por qué no hay caso de «no se puede calcular» —un prefijo de un libro válido es válido—, y eso es cierto **para los eventos inválidos** y no dice nada del lanzamiento por año no soportado: es justo la clase de comentario que hace creer que el otro modo de fallo tampoco existe.
2. **`criterionStakes`** (`tax/year.ts`): recalcula el ejercicio con cada configuración alternativa. Ya trata con elegancia el caso «la otra lectura deja eventos inválidos» —`measure: "not_quantifiable"` con `reason: "invalid_under_alternative"`—, así que **tiene el vocabulario**: le falta el motivo equivalente para «con la otra lectura la cadena alcanza por debajo del primer año soportado».
3. **`settingsDiff`** (`tax/year.ts`): recalcula con la configuración anterior. Su equivalente de `invalid_before` **no existe** y hay que dárselo.
4. **`figuresOf`** (`filings/closed-years.ts`): devuelve `undefined` cuando la lectura no se puede calcular, y `undefined` **no es cero** —compararlo contra una lectura que sí salió reportaría la base entera como movida—; le falta el mismo tratamiento para el caso que lanza. De sus **cuatro** caminos, tres están protegidos por un `try/catch` de la interfaz que se traga el `DomainError` (`closedYearNotes` de `apps/cli/src/commands/shared.ts`, `closedNotes` de `apps/cli/src/commands/rectify.ts` e `impactOf` de `apps/web/src/ledger/write.ts`); **el cuarto está desnudo**: `apps/cli/src/commands/catalogue.ts`, el aviso de `atlas settings set`, que llama a `closedYearImpact` sin ningún `try` y **con dos configuraciones distintas**, que es exactamente el mecanismo que dispara el fallo. Ahí no se degrada nada: se cae el comando entero.

Qué hay que hacer:

- **La guardia que ya existe se extrae a un ayudante** y se aplica donde falta. Dos detalles que no son opcionales: el ayudante **vuelve a lanzar cualquier otro error** (tragarse todo escondería defectos reales, y es el tipo de comodidad que esconde un fallo durante años), y distingue el caso por el **código** de `DomainError`, no por el texto.
- **Que la guardia de la interfaz deje de ser la que sujeta esto.** Los tres `catch` de arriba convierten el lanzamiento en silencio: el aviso no sale y nadie sabe por qué. Con el dominio degradando, esos caminos pasan a **decir** lo que pasa, que es lo que pide el bloque 5.
- **`CriterionStake.reason` es una unión cerrada**, y esa es la buena noticia: añadirle un miembro rompe la compilación en la consola, cuyo mapa `REASONS` está tipado contra la unión. **La mala**: en la web, `MEASURE_REASONS` es un `Record<string, string>` **abierto** (`apps/web/src/format/criteria.ts`), así que el motivo nuevo **no rompería nada** y la pantalla pintaría un hueco. Ciérralo contra la unión del dominio, como la 010 hizo con `PARTIAL_TEXTS` y `MODEL_NAMES`, y comprueba que el cierre no es vacío quitando una entrada.
- **Haz el bloque 4 antes que el 5.** Los dos tocan `closed-years.ts` y el 5 se apoya en que `figuresOf` ya no lance.

### Bloque 5 — El aviso que se calla (pendiente 8) — segundo caso de la ADR-0024

La cabecera de `packages/domain/src/filings/closed-years.ts` promete que el aviso de ejercicio cerrado **nunca se calla**. Es falso en una combinación alcanzable, y tiene **tres caras**, no una:

1. **Se calla.** Si la lectura anterior es inválida, `figuresOf` devuelve `undefined` y no se compara nada —es el fallo seguro que se añadió a propósito, porque comparar una lectura que falló contra una que salió reportaría la base entera como movida—; si además el cambio **no cae por fecha** en el ejercicio declarado, `closedYearImpact` **no empuja nada** y no sale ningún aviso. Es el ejemplo que usa la propia cabecera: la recompra de enero que difiere la pérdida de diciembre.
2. **Afirma algo que no ha comprobado.** Si sí cae por fecha, el impacto se empuja con `moves: []`, y las dos interfaces traducen esa lista vacía por «**no mueve ninguna cifra declarada**» (`closedYearLines` en la consola, `ClosedYearNotice` en la web). Con la comparación fallida eso no es que sea impreciso: es falso. **Esta cara es peor que la primera: callarse es no ayudar, afirmar en falso es hacer daño**, y el usuario firma una complementaria menos por una frase que la aplicación no podía sostener.
3. **Lo mismo con un 720 o un 721**, donde la comparación **no se intenta nunca** —sus cifras son valores a mercado y viven en otro módulo—, y aun así se imprime la misma frase.

**Hace falta un tercer desenlace: «no he podido comparar», que hoy el tipo no puede ni expresar.** `ClosedYearImpact` tiene `by_date: boolean` y `moves: MovedFigure[]`, y una lista vacía significa dos cosas distintas.

- **Lo emite el motor, no la interfaz.** Es la aplicación más literal de la ADR-0024 de la ronda y quiero que el commit lo diga con esas palabras: el motor decide **qué hay que advertir**, y las consumidoras solo **cómo se dice**. Si al escribirlo aparece la tentación de arreglarlo en la interfaz, es señal de que se está haciendo mal.
- **El desenlace se expresa como una unión cerrada**, que es el mecanismo que la 010 demostró que funciona: cuando el veredicto `nothing_recorded` entró en una unión cerrada, la compilación se rompió en los tres sitios que había que tocar y fue imposible olvidarse de ninguno. Un campo opcional más **no** vale: una interfaz puede desestructurar y tirarlo, que es justo el hueco que describe la ADR.
- **Distingue las causas que el motor conoce**: una lectura que no se puede calcular (eventos inválidos), una que alcanza por debajo del primer año soportado (bloque 4) y un modelo cuyas cifras la cadena **no compara por diseño** (el 720 y el 721). No las juntes en un «no se sabe» genérico: la primera se arregla reparando el libro, la tercera no se arregla porque no está rota.
- **Las consumidoras.** El inventario las cuenta como **ocho** (cinco en la web, tres en la consola). En la práctica el **texto** se escribe dos veces —`apps/web/src/components/ClosedYearNotice.tsx`, el mismo componente en las cuatro escrituras de la web, y `apps/cli/src/output/closed-years.ts`, el mismo formateador desde `add`, `ca`, `edit`, `delete` y `settings set`— y el **tipo** llega a ocho puntos de uso (`apps/web/src/ledger/write.ts` y sus cuatro `closedYearsOf*`, `routes/registrar/`, `routes/movimientos/`, `routes/ajustes/`; `apps/cli/src/commands/shared.ts`, `rectify.ts`, `catalogue.ts`). Eso no lo hace barato: lo que cambia es el tipo, y el compilador te va a enseñar la lista entera.
- **El test que existe fija solo el caso en que la fecha salva el aviso.** Escribe el caso que hoy calla —libro con eventos inválidos en la lectura anterior, cambio fechado **fuera** del ejercicio presentado que aun así mueve una cifra declarada— y **míralo en rojo antes de arreglarlo**.
- **Vigila el coste.** El hecho del ejercicio cerrado vive en el trozo de arranque de la web (`filings/touched.ts`, 0,4 KB) precisamente porque meter ahí la cifra costó 4,9 KB y arrastró `tax/` al arranque. **No deshagas ese reparto**: el desenlace nuevo se emite donde hoy se emite la cifra. Y mide: quedan **0,6 KB de margen de arranque** (72,9 medidos contra un techo de 73,5) y **1,1 KB de total** (234,9 contra 236,0). Si no cabe, **para y avisa**: el techo es de la dirección, con su motivo escrito en `check-bundle.mjs`, y no se sube por iniciativa del implementador ni se esconde con una importación dinámica.

### Bloque 6 — El ancla de lo declarado, que sustituye y no lo dice — tercer caso de la ADR-0024

**Defecto nuevo, no está en las nueve pendientes, y es de la misma familia: el más silencioso de todos.**

Cuando hay una Renta presentada, el motor **sustituye lo pendiente que él calcula por lo declarado** y sigue la cadena desde ahí (ADR-0020: lo presentado es un hecho). Eso está bien y es lo que se decidió. Lo que está mal es que no se diga:

- **La pantalla web no lo dice en ninguna parte.** `TaxYearReport.anchor` existe y la consola lo imprime (`apps/cli/src/commands/tax.ts`: «Anclado en lo declarado en 2026: calculado …; declarado …»). En la web, **`anchor` no se lee ni una vez** —los únicos aciertos de esa palabra en `apps/web/src` son un elemento `<a>` de la exportación—. El usuario ve sus pérdidas pendientes **ya sustituidas por lo declarado**, sin nada que le diga que la cifra que tiene delante no es la que el motor calculó. Es exactamente lo que la ADR-0024 describe: dos interfaces leyendo del mismo motor, una lo cuenta y la otra no.
- **Y debajo hay un segundo fallo, del dominio.** En `packages/domain/src/tax/chain.ts` el ancla se guarda en **una sola variable** (`let anchor`) que se **sobrescribe** en cada ejercicio de la cadena que tenga una presentación. Con **dos** Rentas presentadas solo sobrevive la de la última: la sustitución de la primera desaparece del informe sin dejar rastro, y ninguna interfaz puede contarla porque no le llega.

Las dos caras se arreglan juntas y la regla es una: **lo que el motor sustituye, el motor lo advierte, y las dos interfaces lo dicen.**

- En el dominio, el informe tiene que poder llevar **todas** las sustituciones que la cadena aplicó, no la última. La forma la fijas en el plan; lo que no vale es que una sustitución ocurrida quede sin representación.
- En la web, la sustitución se ve **donde está la cifra afectada** —las pérdidas pendientes—, no en una nota escondida al final. Con la privacidad activa se ve **que hubo sustitución**; los importes, no, como cualquier otro importe.
- En la consola, comprueba que el texto sigue siendo cierto con más de un ancla y que las nombra todas.
- **El test que lo ata**: un libro con **dos** Rentas presentadas en ejercicios distintos, ambas con pendientes que difieren de lo calculado, y la comprobación de que el informe del ejercicio posterior conserva **las dos**. Míralo en rojo antes de arreglarlo: hoy tiene que fallar por la sobrescritura.

### Bloque 7 — El test antideriva que no empareja variante con lectura (pendiente 12)

Desde que los criterios firmes se separan de los dudosos, **la certeza decide si al usuario se le dice «nadie sabe cómo se lee esto» o «esto está resuelto, y esto es lo que hay detrás»**. Que una variante pueda tomar la certeza de su hermana sin que nada lo vea es inaceptable justo ahí.

`tests/fiscal-criteria.test.ts` comprueba pertenencia al conjunto de la fila, que la certeza más dudosa la lleve alguien y que cada riesgo lo lleve alguien; **nunca empareja variante con lectura**. Solo afecta a las filas **#2** (siete variantes en el catálogo) y **#24** (cuatro), y hoy lo sostienen los comentarios por variante de `packages/domain/src/tax/criteria.ts` y la lectura humana.

- **Analizar prosa española no es una opción**, y está descartado: emparejar paréntesis de una frase con identificadores se rompe el día que alguien reescribe la frase, y entre medias da un verde falso.
- **La dirección autoriza el cambio de formato de `docs/fiscal-questions.md` a una fila por variante, legible por máquina, y la reescritura del bucle del test.** Es un documento de la dirección y el permiso es expreso (§6, decisión (k)).
- **Decisión de formato de la dirección: una celda vacía deja de ser expresable.** Cada variante declara **o una dirección de riesgo, o el valor explícito «lectura literal, sin alternativa en disputa»**. El silencio deja de ser un estado y pasa a ser una afirmación que alguien firma. Con eso, el mapa `DOCUMENT_SILENT` del test —cuatro exenciones escondidas en código— desaparece.
- **Lo que el formato nuevo tiene que cumplir**, y la forma exacta la fijas en el plan:
  - cada identificador del catálogo aparece **exactamente una vez**, con **su** certeza y **su** dirección del riesgo;
  - no se pierde ni una línea de la prosa y del fundamento que hoy tiene cada criterio: la fila numerada sigue siendo la que se cita como «criterio #2» en los documentos y en las pantallas;
  - el test pasa a ser un emparejamiento **exacto** (identificador → certeza, riesgo) y deja de necesitar la regla de «la certeza más dudosa la lleva alguien», que era un sustituto de no poder emparejar;
  - la cabecera del test deja de describir un límite que ya no existe, y describe el nuevo si queda alguno.
- **Las cuatro celdas que hoy el documento calla, decididas por la dirección, y las cuatro con un valor que ya existe.** No hace falta vocabulario nuevo: se llenan con los cuatro valores de `RiskDirection` de siempre.
  - **`2:listed_1y` → conservadora**, **`2:fund_1y` → conservadora** y **`2:crypto` → conservadora**, por una regla mecánica: **una ventana de recompra más larga es siempre la dirección conservadora**, porque bloquea más pérdidas en el ejercicio corriente, difiere más pérdida y hace pagar más ahora. En `2:fund_1y` y `2:crypto` es además lo que el catálogo ya declara: la celda muda solo existe en el documento.
  - **`2:other` → ambas**, que es también lo que el catálogo declara, y es el valor correcto una vez se entiende qué es ese identificador. `windowCriterion` (`packages/domain/src/tax/lines.ts`) devuelve `2:other` para **cualquier ventana configurada que no sea ninguna de las dos legales** —un número de días arbitrario, en cualquier tipo de activo—, no para «un año en un valor no admitido», que cae en `2:listed_1y` o en `2:fund_1y`. Y una ventana arbitraria puede ser **más corta** que la legal, y entonces bloquea menos pérdidas y es agresiva, o **más larga**, y entonces es conservadora: depende de lo que el usuario configure. `ambas` dice exactamente eso.
  - *(La dirección llegó a plantear un quinto valor, «lectura literal, sin alternativa en disputa», y lo **retiró** al comprobar qué significaba `2:other`. Queda escrito para que nadie lo reproponga: el vocabulario no crece.)*
- **La condición, que sigue en pie: cada celda dice lo que el catálogo ya declara.** Si al escribirlas alguna no coincide, **para y pregunta**; no la fuerces para que cuadre la tabla. Cambiar lo que el catálogo declara de un criterio es cambiar el criterio, y eso no es tuyo.
- **Documento y catálogo, en el mismo commit.** Ese test no se desactiva ni se relaja jamás, y comprueba que **no es vacío**: intercambia la certeza de `2:fund_2m` y `2:fund_1y` y tiene que ponerse rojo nombrando las dos.

### Bloque 8 — La salida registrada de `compact` (pendiente 3) — cuarto caso de la ADR-0024

**El último, y el único que puede pedir una ADR.** Va al final para que no bloquee a los demás.

**La decisión de política, con su motivo** (§6, decisión (a)): compactar es la única vía de migrar el formato, así que un libro que no se puede compactar es un libro **congelado para siempre**, y eso es un fallo de supervivencia a veinte años —peor que cualquier cosa de la que la huella protege—. Hoy `compactLedger` rechaza con `CompactRejectedError("filing_fingerprint_mismatch")` ante **cualquier** motivo, incluido `unreadable`, y **no hay salida** ni en el dominio (`CompactPlan` no tiene campo) ni en la CLI (`atlas compact` solo acepta los flags globales), ni procedimiento de recuperación escrito en ningún sitio. El único rodeo que le queda hoy al usuario es **editar el `.jsonl` a mano**, que es exactamente lo que la huella existe para detectar.

Lo que tiene que existir, como **requisitos, no como algoritmo**:

1. **El rechazo sigue siendo lo que pasa por defecto.** Nadie compacta un libro con una huella rota sin enterarse.
2. **La salida es explícita y hay que pedirla a propósito**, nombrando lo que se renuncia a verificar. No un `--force` que lo arrasa todo: el usuario tiene que poder decir «acepto que la huella de **esta** presentación no se pueda verificar» y seguir protegido en las demás. En la consola eso es un *flag* nuevo, con su entrada en `ARITY` y `BOOLEAN_FLAGS` de `apps/cli/src/main.ts` (N32 y N33 de la 009) y su confirmación; el nombre lo fijas en el plan, en inglés como el resto. **La web hoy no compacta**, así que la salida vive donde vive `compact`; lo que sí llega a las dos interfaces son los **mensajes** del bloque 0.
3. **El hecho queda registrado en el propio libro**: que la huella de esa presentación **no se pudo verificar**, y **por qué** (`digest` o `unreadable`). **Viaja con el fichero, no con la memoria de nadie.** Esto importa más de lo que parece: `resealFilings` vuelve a sellar cada presentación sobre el prefijo reescrito, así que **después de compactar nada en el fichero diría que aquella huella nunca se comprobó**. El registro es la única traza que queda.
4. **No se toca lo presentado.** ADR-0020: lo declarado es un hecho con consecuencias legales. El registro dice algo **sobre** la presentación, no la corrige ni la reescribe.
5. **`check` y `check --deep` lo siguen diciendo siempre** (decisión de la dirección, §6 (d)): sin caducar y sin esconderse, con las palabras exactas del caso —«no verificable, y lo diste por bueno tú el tal día»—, **ni como acusación de haber editado a mano ni como certificado de que todo está bien**. Una salida explícita no borra el hecho: lo registra. Si el aviso desapareciera, la salida se convertiría en una forma de limpiar el expediente, y entonces no sería una salida: sería un borrado.
6. **La comparación de lo declarado lo dice, y lo dice como nota del informe** (cuarto caso de la ADR-0024, §6 (e)). `filingComparison` reparte la diferencia entre lo declarado y lo calculado en **cuatro causas**, y una de ellas —«el motor calcula distinto que entonces»— solo se sostiene si se puede afirmar que **lo demás es igual**, es decir, si el prefijo está verificado. Cuando no lo esté, la comparación **lo advierte** y no reparte con seguridad en esa causa. La advertencia es un **dato con código** del informe, no una frase que cada interfaz decida poner. (Hoy `filingComparison` ya omite las causas cuando el recuento de líneas no cuadra, `fingerprintOk`: eso es el sitio, pero omitir no es advertir.)

**Sobre el esquema:**

- **Si registrar esa salida exige tocar el esquema, se propone como ADR en estado `Propuesta` —con `/adr`— y la acepta la dirección.** No se toca el esquema por iniciativa del implementador. Y como el libro es *append-only*, «registrar» significa **una línea nueva**: no se puede añadir un campo a una presentación ya escrita.
- **Comprueba pronto si hay que subir `schema_version` y repórtalo antes de fijar la forma.** Lee ADR-0018 entera: distingue el cambio **compatible** (añadir un campo opcional, añadir un valor a un enumerado, **añadir un tipo de evento** —fue el caso de `swap` y de `tax_return_filed`, que dejaron `schema_version` en 1—) del **rompedor**.
- La pendiente **9 ya no depende de esto**: se hace en el bloque 3, dentro de la v1, por su propio argumento. Si aun así este bloque acaba pidiendo una versión nueva, dilo con lo que cuesta y **espera**.

## 4. Fuera de alcance

- **Migrar a notas del informe lo que la ADR-0024 dejó mezclado**: `compensation.pending`/`expired`, `BoxEntry.partial` y los dos mapas de rótulos de criterios (`CRITERION_LABELS` en la consola, `CRITERION_NAMES` en la web). La propia ADR dice que no se aplica retroactivamente y que eso es trabajo de la feature que decida migrarlo. Aquí la regla gobierna **lo que se escribe nuevo** (bloques 2, 5, 6 y 8).
- **Los seguimientos que la 010 dejó anotados** en `implementation-notes.md` §6: retirar `priorYear`/`isPriorYear`, el `today()` de la web que no lee el reloj de los casos de uso, y medir el informe con la CPU frenada ×4. Ninguno entra.
- **Resolver cualquier criterio fiscal en disputa.** Seis siguen sin resolver y así se quedan: resolverlos sería sustituir una lectura no verificada por otra. Cambiar lo que el catálogo declara de cualquier criterio al rellenar la tabla del bloque 7 es cambiar el criterio: se pregunta, no se hace.
- **Aceptar una ADR** (puedes proponerla), **reabrir una aceptada**, cambiar el esquema por iniciativa propia, y cualquier cosa de AWS.
- **Funcionalidad nueva, pantallas nuevas, dependencias nuevas y retoques visuales** que no sean el estado vacío del bloque 2 y lo que el bloque 6 tenga que pintar.

**Y lo que está bloqueado, para que no lo intentes:**

- **Los importadores** (MyInvestor e IBKR): **no existen los ficheros de ejemplo reales**. No hay XML de IBKR ni exportación de operaciones de fondos de MyInvestor, y el usuario no se suscribirá hasta que la aplicación esté lista. Sin el formato real no se escribe un adaptador: se escribiría contra una suposición.
- **La nube y la Fase 4** (AWS, automatización, precios automáticos): **cuesta dinero** —exige pasar la cuenta al Paid Plan— **y el usuario lo ha descartado**. Es el único límite duro del proyecto.

## 5. Criterios de terminado

- `lint`, `typecheck`, `test:coverage`, `build` y CI en verde; `packages/domain` al **100 %** de líneas y ramas.
- **Las dos comprobaciones previas, escritas y reportadas antes de tocar lo que dependa de ellas**: las dos premisas del bloque 3 y el mapa de guardias del bloque 4.
- **Cada código de error o de hallazgo nuevo, traducido en las dos interfaces**, con `tests/messages.test.ts` en verde. En la web son los dos sitios: `errors.ts` y el par `what`/`todo` de `findings.ts`.
- **De cada arreglo, cómo lo viste en rojo.** Escrito en `questions.md`, arreglo por arreglo: el test que escribiste antes, o el commit que revertiste para verlo fallar. Un test que no has visto fallar no es un test.
- **Revisión por mutación prevista**, con la disciplina de §2 ter (afirmar que la sustitución ocurre y comprobar el fichero). Escribe los tests que matan al menos estos mutantes:
  1. devolver `unreadable` bajo el código de `digest`, y al revés;
  2. imprimir `declared_lines` donde va la versión de la huella;
  3. quitar **cada una** de las comparaciones nuevas de `computed.as_of`;
  4. devolver `filed_at` a la tupla de la huella de una presentación, y quitar de ella `receipt_reference`;
  5. quitar la guardia de `tax_year_unsupported` en **cada uno** de los sitios, por separado, incluido el del informe de comparación;
  6. hacer que el ayudante de la guardia se trague **cualquier** error en vez de solo ese código;
  7. no emitir nunca el tercer desenlace del aviso de ejercicio cerrado, y emitirlo siempre;
  8. conservar una sola sustitución del ancla cuando hay dos, y no pintarla en la web;
  9. volver a esconder la tarjeta de criterios firmes cuando está vacía;
  10. intercambiar la certeza de `2:fund_2m` y `2:fund_1y` en el documento o en el catálogo;
  11. aceptar la compactación con una huella rota **sin** que el usuario lo haya pedido, aceptarla **sin** dejar el registro, y hacer que `check` deje de decirlo después.
- **La disciplina de los ficheros dorados, tal como la practica este proyecto**: la predicción se escribe **antes** de regenerar, enumerando **qué líneas se van a mover y por qué**, se comitea, y **después** se compara clave por clave. **Si se mueve algo no predicho, se para y se pregunta.** En esta ronda la expectativa es que **no se mueva ninguno**: `synthetic-v1.jsonl`, `synthetic-v1.snapshot.json`, `synthetic-v1.tax.json` y `tax-hand-v1.jsonl` se quedan como están, y ninguno contiene presentaciones. Que alguno se mueva **es un hallazgo**, no un diff esperado. Lo mismo vale para cualquier literal de huella fijado en un test (bloque 3).
- **Verificación en el navegador, con capturas medidas que entregas**: a **400×890 con DPR 3** (el teléfono del usuario) y a **2045×1141** (su monitor), más **360** de ancho sin desplazamiento lateral, comprobando `scrollWidth === clientWidth` **en el navegador**, no a ojo; **con el libro vacío y con datos**; **con la privacidad puesta y quitada** —mide los desbordamientos con la privacidad **quitada**, que la máscara es más corta que los importes y ya escondió tres—; claro y oscuro al menos una vez. Lo que hay que mirar en esta ronda: `/fiscal` con la tarjeta de **criterios firmes vacía** (el estado nuevo) y con entradas; **el ancla de lo declarado pintada** junto a las pérdidas pendientes, con **dos** Rentas presentadas y con la privacidad puesta; el **aviso de ejercicio cerrado en su desenlace nuevo** en las cuatro escrituras de la web (Registrar, Corregir, Anular y Configuración); y **Ajustes → Verificación** con el hallazgo nuevo de la huella no verificable. Construir esos casos pide sembrar libros a propósito —uno inválido con una presentación, otro con dos Rentas—, como hizo la 010: hazlo desde tu scratchpad.
- **Las capturas van a `~/atlas-private/capturas/<fecha>-<asunto>/`, nunca al repositorio.**
- **El presupuesto del paquete web, medido**: arranque y total dentro de sus techos (73,5 y 236,0 KB gzip), con lo medido escrito. Si no cabe, se para y se avisa.
- **`docs/` sin cambios salvo `docs/fiscal-questions.md`** (bloque 7), y `specs/011-fail-safe-gaps/questions.md` con lo preguntado, las dos comprobaciones previas, cómo viste fallar cada test, lo que decidas en el plan y **la lista de documentos que la dirección tendrá que actualizar** (como mínimo: `docs/data-schema.md` §4 —la tupla de la huella cambia—, §5 y §7; `docs/business-rules.md` si cambia un mensaje que ella describe; y `docs/prompts/README.md`).
- **`npm run lint` como último paso**, ejecutado **redirigiendo a un fichero y leyendo `$?`**, nunca a través de una tubería. Y commits sin rastro de IA, uno a uno en verde.

## 6. Decisiones fijadas por este prompt

- **(a) La aplicación nunca deja al usuario encerrado fuera de su propio libro.** Compactar es la única vía de migrar el formato; un libro que no se puede compactar es un libro congelado para siempre, y eso es un fallo de supervivencia a veinte años, peor que cualquier cosa de la que la huella protege. El rodeo que hoy le queda al usuario es editar el `.jsonl` a mano, que es justo lo que la huella existe para detectar.
- **(b) Pero no se compacta en silencio.** El rechazo sigue siendo lo que pasa por defecto; la salida hay que pedirla a propósito, nombra lo que se deja sin verificar, y **queda registrada en el propio libro** con su motivo. El hecho viaja con el fichero, no con la memoria de nadie — y después de resellar, el fichero no lo diría de ninguna otra forma.
- **(c) La huella de duplicados de una presentación se arregla ahora, dentro de la v1.** La tupla que cambia es **la de las presentaciones**, y el evento `tax_return_filed` existe desde la 010, fusionada el 2026-09-23: **no puede haber en el mundo una línea anterior cuya huella cambie**, y el argumento no depende de ningún dato sobre el libro privado del usuario, que es lo que lo hace mejor argumento. **ADR-0018**: hoy cuesta una línea, dentro de un año cuesta una migración. Con la condición de verificar las dos premisas **antes** de borrar la línea y parar si alguna falla.
- **(d) Una salida explícita registra el hecho, no lo borra.** `check` y `check --deep` siguen diciendo siempre que aquella huella no se pudo verificar y que el usuario la dio por buena tal día, sin caducar y sin esconderse. Si el aviso desapareciera, la salida sería una forma de limpiar el expediente.
- **(e) Una causa que no se puede sostener no se reparte en silencio.** Si el prefijo no está verificado, la comparación de lo declarado lo advierte y no atribuye con seguridad a «el motor calcula distinto que entonces». Va como **nota del informe**, no como frase de una interfaz.
- **(f) Un ejercicio soportado y calculable no se vuelve inobtenible: se degrada.** Que una lectura alternativa alcance por debajo del primer año soportado es información sobre **esa lectura**, no un motivo para negarle al usuario el informe que sí se puede calcular. **Lo que este prompt retira**, porque su premisa resultó falsa: no hay nada que arreglar en el mensaje de `tax_year_unsupported` por «culpar al ejercicio que el usuario pidió» — el error no lleva ese año.
- **(g) Ningún mensaje de la aplicación afirma algo que no ha comprobado**, y **afirmar en falso es peor que callarse**. Ni «se han editado a mano» de unas líneas ilegibles, ni «desde la versión N» donde N es un recuento de líneas, ni «no mueve ninguna cifra declarada» cuando la comparación no se ha hecho. El usuario no tiene asesor: una afirmación tranquilizadora y falsa lo deja peor que el silencio.
- **(h) Lo que el motor sustituye, el motor lo advierte, y las dos interfaces lo dicen.** El ancla de lo declarado cambia una cifra que el usuario mira, y hoy la web no lo cuenta y el dominio solo conserva la última. Las dos caras se arreglan juntas.
- **(i) El aviso lo emite el motor y lo redacta la interfaz** (ADR-0024). Cuatro casos en esta ronda —la asimetría de los criterios firmes, el tercer desenlace del ejercicio cerrado, el ancla y la comparación sobre un prefijo sin verificar— y eso **no es casualidad**: es la prueba de que la regla describía un problema real. Los desenlaces nuevos van en uniones cerradas, porque un campo opcional lo puede tirar una interfaz sin que nada falle.
- **(j) «Comprobado y sin efecto» es información, y se dice en las dos interfaces.** Es el mismo argumento por el que los criterios firmes se **parten** de los dudosos en vez de filtrarse; por eso la tarjeta de criterios firmes gana su estado vacío en lugar de desaparecer.
- **(k) `docs/fiscal-questions.md` pasa a una fila por variante, legible por máquina, con permiso expreso de la dirección**, y **una celda vacía deja de ser expresable**: cada variante declara su dirección de riesgo, con los cuatro valores que ya existen y **sin vocabulario nuevo** — el quinto valor que la dirección llegó a plantear queda retirado, porque `2:other` es «cualquier ventana que no es ninguna de las dos legales» y `ambas` ya lo dice bien. Cada celda dice **lo que el catálogo declara**, y si alguna no coincide se pregunta. Desde que los criterios firmes se separan de los dudosos, la certeza decide si al usuario se le dice «nadie sabe cómo se lee esto» o «esto está resuelto». **Analizar prosa española queda descartado**, y **inventar** una certeza o un riesgo que el documento no dice, también.
- **(l) Lo barato primero y `compact` al final.** El orden de §3 es una decisión, no una sugerencia: los bloques 0 a 3 no tocan ningún tipo que crucen las interfaces, el 4 prepara el terreno del 5, el 6 va con él por familia, y el 8 es el único que puede quedarse esperando una ADR. Que espere él solo.

## 7. Respuestas a las preguntas del prompt

*(Vacío al escribirse. Aquí irán las respuestas de la dirección a las preguntas del implementador, las decisiones que se tomen sobre la marcha y las erratas de este prompt, como en los diez anteriores. Se rellena antes de implementar lo que dependa de ellas.)*
