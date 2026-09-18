# Preguntas abiertas — feature `007-web-analytics`

Lo que el prompt me prohíbe resolver por mi cuenta: contradicciones entre documentos, cosas que el dominio no expone y que la web necesita, y decisiones que cambian comportamiento observable de la CLI o de la fiscalidad.

Cada pregunta lleva **contexto suficiente para responderla sin abrir el código**, las opciones con su coste, y **mi recomendación**. El `spec.md` y el `plan.md` están escritos con el supuesto recomendado (los `A1`-`A12` de `spec.md`): si no hay respuesta, se implementa eso.

Van ordenadas por lo que cuesta cambiarlas después.

> **Todas respondidas por la dirección el 2026-09-18**, antes de escribir una línea de código. **Q9 era un error del prompt**; las diez restantes confirmaron la recomendación, dos de ellas ampliando el alcance (Q3 y Q11).

---

## Respuestas de la dirección (2026-09-18)

| # | Respuesta | Qué cambia respecto al supuesto |
|---|---|---|
| **Q1** | Recomendación aprobada, **con una regla explícita añadida**: *un punto solo existe cuando **todos** sus componentes tienen precio*. Nunca se dibuja un total `partial`, porque es la suma de lo que sí tiene precio, es más pequeño que la realidad y **es indistinguible de una caída**; dibujarlo sería inventar una pérdida que no ha ocurrido. «Dos puntos de 29 no es un problema de la gráfica: es información sobre el libro — el usuario tiene que ver que valora poco» | Nada en el diseño; la regla queda escrita en `series.ts` y en la pantalla |
| **Q2** | Aprobada tal cual, con los tres detalles: código `transfer_overdue`, operador `>` («el parámetro dice *más de N días*, así que el día del plazo aún está en plazo») y la etapa `redeemed` **cuenta** («es el estado en que el dinero ya salió del fondo de origen y no ha llegado a ninguna parte») | Nada |
| **Q3** | **Los dos**, no solo `transfer pending`. «Arreglar la mitad de un defecto de clase es como sobreviven las inconsistencias» | `atlas order list` gana `--date` y deja de falsear `days_open` a 0 con `--all` |
| **Q4** | Opción (a), al dominio, **y no merece ADR**: «mover una regla de negocio de una aplicación al dominio **es la regla** (ADR-0007, decisión (h) de la 006), no una excepción que haya que justificar. Un ADR se escribe cuando se decide algo, no cuando se aplica lo ya decidido» | No se propone ADR |
| **Q5** | Autorizado `components/chart/axis.ts`, con el test de privacidad renderizada como **condición**. Criterio dicho en voz alta: **el eje de una gráfica es un importe a todos los efectos**; con la privacidad activa no puede haber cifras absolutas en el eje, y «si eso deja la gráfica coja en privado, que quede coja: es exactamente lo que el modo privacidad promete» | Nada |
| **Q6** | Aprobado el cambio de criterio. **Arranque ≤ 80 KB gzip** y **total ≤ 150 KB gzip**; primero se arregla lo que el comprobador mide, y al terminar el total se fija en lo medido, no en el techo | Los dos techos quedan fijados |
| **Q7** | Curva agregada con la tabla por tesis debajo. **Precedente escrito**: «cuando mi prompt y `docs/specification.md` se contradigan, **manda la especificación**. El prompt es un encargo; la especificación es el producto» | Nada |
| **Q8** | Reparto aprobado entero | Nada |
| **Q9** | **Error del prompt, reconocido**: se escribió «separadas de las que no son deducibles» dando por hecho que `costSummary` veía las dos mitades. Se añade al dominio **con un matiz de alcance**: se suman las comisiones sueltas y se enseñan **como bloque aparte, etiquetado como que no forman parte del coste de adquisición**, y **no se clasifican por tipo**, porque el campo que distingue custodia de conectividad (`fee_kind`) lo añade la feature 008 (ADR-0021) y todavía no existe | Un bloque agregado, sin clasificación por tipo |
| **Q10** | **Arréglalo.** «Un control que promete restaurar el valor por defecto y no hace nada es peor que no tenerlo: el usuario cree que ha cambiado algo». ADR-0018 legitima la semántica y ADR-0015 protege el caso peligroso | Se descarta la variante reversible |
| **Q11** | **Las tres.** Los diez hallazgos de integridad se traducen: «una comprobación de integridad que informa en inglés es inútil justo en el momento en que hace falta» | El catálogo de hallazgos entra en el alcance |

**De las notas de lectura**: conformes todas. El peso de una posición dentro del cubo **no** sube al dominio. Lo de `atlas thesis list` sin redondear frente a `atlas bucket` redondeando: **se arregla si es trivial**, y manda el criterio de `atlas bucket` (redondear una vez, al mostrar). Dónut frente a barra apilada: se dibujan las dos y se miran a 400×890 DPR 3 antes de fijarlo.

**Dos recordatorios**, recogidos aquí porque son criterios de terminado: `npm run lint` **como último paso antes de entregar**; y al acabar, **abrir el navegador y mirar las pantallas con ojos de quien las va a usar**, no solo comprobando que funcionan — la ronda anterior descubrió que la aplicación llevaba semanas enseñando `ast_delta · acc_bucket` en vez de «Delta Materials · Cubo especulativo», y ningún test lo vio porque ningún test lo mira.

---

## Q1 — En la gráfica del patrimonio, ¿qué es exactamente un hueco?

**Por qué es la primera.** Es la pregunta que decide si la gráfica principal de la aplicación tiene seis puntos o veintinueve, y no se puede responder sin mirar el libro.

**Contexto.** El prompt §3.3 dice: *«Donde no hay precio, hay hueco. No se interpola, no se arrastra un valor inventado, no se dibuja una línea recta entre dos puntos lejanos como si fuera información»*. La constitución V dice, en cambio: *«si una fuente de datos cae, se muestra el último valor conocido con su antigüedad marcada»*. No se contradicen —arrastrar el último precio conocido **con su edad a la vista** no es inventar—, pero sí dejan abierta la pregunta de qué se dibuja.

Y hay un dato duro. `priceAt` devuelve **el último precio anterior o igual a la fecha**, con `age_days` y `stale`. El libro sintético tiene 30 valoraciones para 13 activos, casi todas del 31/12, y `stale_price_days` vale **7**. Medido aquí (`research.md` §3), proyectando los 29 cierres de mes entre 2026-08 y 2028-12:

| Bloque | Puntos con **todos** sus precios, de 29 |
|---|---|
| Núcleo | **6** |
| Cubo | **3** |
| Efectivo | **29** |
| Los tres a la vez | **2** |

Es decir: **una línea única del patrimonio total tendría 2 puntos de 29.** Y dibujar los puntos parciales no es una opción: `netWorth.total_eur` con `partial === true` es la suma de *lo que sí tiene precio*, o sea un número **más pequeño** que la realidad, indistinguible de una caída. Eso es exactamente la mentira silenciosa que la constitución V prohíbe.

**Opciones.**

- **(a) Hueco por serie, y los puntos son las fechas de valoración del libro (supuesto provisional).** Tres series; la del núcleo se corta cuando el núcleo es parcial, la del cubo cuando lo es el cubo, la de efectivo casi nunca. El eje X no es una rejilla fija sino las fechas en las que el libro **sabe algo nuevo** (más el extremo del rango). Ventajas: honesto, barato (una proyección por punto y no hay puntos de relleno), y la curva no tiene doce puntos idénticos entre dos valoraciones anuales. Inconveniente: sobre el libro sintético la del núcleo tiene 6 puntos y la del cubo 3, y *parece* una gráfica rota si no se explica al lado.
- **(b) Rejilla fija (mensual) con hueco por serie.** Mismo criterio de hueco, pero puntos regulares. Ventaja: el eje X se lee mejor. Inconvenientes: entre dos valoraciones dibuja el mismo valor repetido (arrastre del último precio), que es información falsa de movimiento; y multiplica las proyecciones sin añadir nada.
- **(c) Además, cortar por precio caducado** (`age_days > stale_price_days`). Es la lectura más estricta de «no se arrastra». Con `stale_price_days = 7` y valoraciones anuales deja **prácticamente solo las fechas de valoración**, que es lo mismo que (a) pero llegando por otro camino y con más código.
- **(d) Dibujar los puntos parciales, marcados.** Descartada por mí: la constitución V no lo permite y el número dibujado sería menor que el real.

**Mi recomendación: (a).** Con dos condiciones que doy por hechas si se acepta: debajo de la gráfica, una línea de texto que diga **cuántos puntos hay, cuántos faltan y por qué** (qué activo y a qué fecha), y un enlace a registrar una valoración. La gráfica escasa no es un defecto: es lo que el libro sabe. Pero tiene que **leerse** como la verdad y no como un error, y eso es trabajo de la pantalla, no de la serie.

*Si la dirección prefiere (b), cambia `netWorthSeries` en un parámetro y la vista en nada.*

---

## Q2 — ¿Dónde vive el aviso de traspaso vencido, y con qué nombre?

**Contexto.** Decisión (c) del prompt: `transfer_max_days` se consume en el dominio, con su aviso, su test y su traducción en las dos interfaces, contado hasta la fecha de la consulta.

El problema es dónde ponerlo. `pendingTransfers(state, at)` devuelve un array de solicitudes con `days_open` ya contados hasta `at`, pero **no tiene canal de avisos ni recibe la configuración**. Y los avisos de la proyección (`state.warnings`) se generan al proyectar, que no sabe a qué fecha se va a consultar: sin `asOf` el corte es el final del libro, no hoy, así que ahí el aviso saldría mal.

**Opciones.**

- **(a) Una proyección nueva que envuelve a la que hay (supuesto provisional)**: `transferWatch(state, at, settings) → { rows, warnings }`, con `pendingTransfers` intacta. Es el patrón que ya existe: `bucketTheses` envuelve a `theses` exactamente por este motivo (que la de dentro no puede conocer los precios). Ventajas: no rompe a ninguno de sus tres consumidores actuales; el envoltorio es donde vive la regla y se prueba solo. Inconveniente: dos funciones parecidas, y el nombre `transferWatch` al lado de `pendingTransfers` no es obvio.
- **(b) Cambiar `pendingTransfers` para que devuelva `{ rows, warnings }`** y acepte `settings`. Ventaja: una sola función. Inconveniente: rompe la firma en tres sitios (`atlas transfer pending`, el Resumen de la web y su *view-model* de avisos), por una razón que no es de esos tres.
- **(c) Meterlo en la proyección** (`state.warnings`). Descartada: la proyección no conoce la fecha de la consulta, y ese es justo el requisito.

**Mi recomendación: (a)**, y si el nombre no convence, `openTransfers` o `transfersAt` en lugar de `transferWatch`: es lo único que cambiaría.

**Tres detalles que van dentro de la misma respuesta**, porque son decisiones y no las invento:

1. **El operador.** Propongo `days_open > transfer_max_days` (estrictamente mayor: el día del plazo todavía está en plazo). Con `>=`, un plazo de 15 avisaría el día 15.
2. **El código.** Propongo **`transfer_overdue`**. En cuanto aparezca en el dominio, el test anti-deriva falla hasta que las dos interfaces lo traduzcan, que es lo que se busca.
3. **La etapa `redeemed`.** Una solicitud reembolsada y no suscrita sigue abierta y **sí** cuenta para el plazo: es el estado peligroso —el dinero ha salido de un fondo y no ha entrado en el otro— y es exactamente el traspaso que hay que perseguir. Lo doy por hecho salvo que se diga lo contrario.

---

## Q3 — `atlas transfer pending` no acepta `--date`: ¿se lo añado?

**Contexto.** El prompt §3.0 dice que los días se cuentan hasta la fecha de la consulta y que *«la CLI lo muestra igual que la web»*. Hoy `atlas transfer pending` **no tiene `--date`**: carga el libro sin `asOf` y cuenta los días hasta hoy (`todayInMadrid`). Para cumplir la decisión (c) tiene que ganar `--date` y proyectar con `asOf`, como ya hacen `weights`, `contribute`, `costs`, `networth`, `bucket`, `thesis list` y `transfer simulate`.

Eso es un cambio de la CLI que el prompt no menciona, aunque se deduce de él.

Y hay un segundo: **`atlas order list` tiene exactamente el mismo defecto** (sin `asOf`, días hasta hoy), y además, con `--all`, falsea `days_open` a `0`. No entra en el alcance de esta feature.

**Opciones.**

- **(a) `--date` solo en `transfer pending` (supuesto provisional)**, que es lo que la decisión (c) exige, y `order list` se queda como está y se anota para la dirección.
- **(b) `--date` en los dos**, por simetría. Ventaja: dos vistas de seguimiento coherentes. Inconveniente: ensancha la feature con algo que nadie ha pedido.
- **(c) Ninguno**: el aviso solo en la web. Descartada: contradice el prompt de forma literal.

**Mi recomendación: (a)**, con `order list` anotado. Si se prefiere (b), son unas quince líneas más y sus tests.

---

## Q4 — El formulario de eventos corporativos necesita una regla que hoy vive en la CLI

**Por qué la señalo con fuerza.** Es el mismo caso que Q1 de la 006 (la vista previa), que se resolvió moviendo `previewEvent` al dominio. Si no se decide, el implementador se ve empujado a escribirla en la web, y eso es la segunda definición de una regla fiscal.

**Contexto.** `corporate_action` es el único evento del esquema cuyo cuerpo **no es plano**: lleva `effects: Effect[]`, y cada efecto es un `scale`, `convert`, `carve_out`, `grant` o `forced_sale` con sus campos. El modelo declarativo con el que la web construye formularios (`FORM_SPECS`) describe campos planos y no puede expresar un array anidado.

La CLI sí sabe hacerlo: `apps/cli/src/commands/corporate-actions.ts` tiene nueve asistentes (`split`, `reverse-split`, `merger`, `spin-off`, `fund-merger`, `share-class-change`, `fund-liquidation`, `delisting`, `raw`) que, a partir de unas pocas banderas, **componen el array**. Y una de sus funciones no compone: **calcula**. `fractionalSale` proyecta el efecto principal, mira la posición resultante cuenta por cuenta, calcula `posición − ⌊posición⌋` y añade el `forced_sale` de los picos con su reparto. Cuánto se vende en cada cuenta en un contrasplit con picos **es una regla de negocio con consecuencia fiscal**, y hoy vive en `apps/cli`.

**Opciones.**

- **(a) Moverla al dominio (supuesto provisional)**: `corporateActionDraft(state, events, params) → { draft, fractional }`, pura, con cobertura del 100 %, y **la CLI pasa a consumirla** (sus nueve asistentes se quedan en el mapeo de banderas a parámetros). Contrato escrito en `contracts/domain.md` §4. Ventajas: una sola definición; la web y la CLI no pueden divergir en un evento corporativo, que es donde un error no se nota en años. Inconvenientes: toca dominio y CLI, que no estaban en el alcance literal del prompt; el diff de la CLI hay que revisarlo. Mitigación: los tests actuales de `apps/cli/test/commands/corporate-actions.test.ts` son el guardián de que el comportamiento no se mueve.
- **(b) La web duplica la composición.** Inconveniente: dos implementaciones del cálculo de picos, una de ellas sin la cobertura del dominio, y en la parte del esquema que `CLAUDE.md` marca como trampa 6.
- **(c) Recortar la pantalla**: ofrecer solo los cuatro `kind` cuyo `effects` es un único efecto trivial (`split`, `fund_merger`, `share_class_change`, `delisting`) y dejar el resto en la CLI, diciéndolo en pantalla. Ventaja: cero riesgo, y la web cubre los casos frecuentes. Inconveniente: el prompt §3.4 pide los eventos corporativos sin recortes, y el usuario se queda yendo al terminal justo para los casos difíciles.

**Mi recomendación: (a)**, y si se rechaza, **(c) antes que (b)**. Duplicar el reparto de picos es la clase de defecto que este proyecto tarda años en detectar.

*Si se acepta (a), creo que merece un ADR propio (puedo proponerlo con `/adr`, no aceptarlo), porque fija el criterio general: «lo que compone un evento del esquema vive en el dominio».*

---

## Q5 — El eje de una gráfica tiene que formatear euros, y `format/money.ts` está cerrado

**Contexto.** Una regla de arquitectura, comprobada sobre el grafo de importaciones, dice que **solo `components/Amount.tsx` puede importar `apps/web/src/format/money.ts`**. Es lo que hace imposible que una pantalla se salte el modo privacidad, y la 006 decidió deliberadamente no debilitarla ni siquiera para colocar un test (nota S4).

uPlot pide una función que reciba **números** y devuelva las etiquetas del eje Y, y otra para el *tooltip*. Ahí dentro no hay componente por el que pasar.

Y el enmascarado sí aplica: `docs/specification.md` §9.6 dice que el modo privacidad oculta importes y cantidades *«(saldos, posiciones, P&L, **ejes de gráficas**)»* y que **las formas siguen visibles**.

**Opciones.**

- **(a) Un módulo más en la lista de autorizados (supuesto provisional)**: `components/chart/axis.ts`, que formatea y enmascara llamando a `amountDisplay` (la misma función pura que usa `Amount`, con sus tests), añadido a la lista con su motivo escrito. La regla sigue siendo verdad: los sitios que formatean dinero están **enumerados**, y pasan de uno a dos. Coste: la lista deja de tener un solo elemento, que es lo que la hacía obvia.
- **(b) Eje sin números**: la escala se lee en la tabla equivalente, que sí usa `Amount`. Cumple sin tocar nada. Inconveniente: una gráfica de patrimonio sin escala en el eje es bastante peor.
- **(c) Eje relativo** (porcentaje sobre el máximo del rango). No delata importes, así que ni siquiera hay que enmascararlo. Inconveniente: deja de ser la gráfica que se pide; el usuario quiere ver euros.

**Mi recomendación: (a)**, con un test que renderiza la gráfica con la privacidad puesta (aquí sí con `happy-dom`) y comprueba que **no queda ninguna cifra a la vista**. Si la dirección prefiere no tocar la lista, (b) es perfectamente defendible y no cuesta nada.

---

## Q6 — El presupuesto del *bundle* no da para uPlot

**Contexto.** `apps/web/scripts/check-bundle.mjs` **falla el build** si el total supera **120 KB gzip**. Medido hoy sobre `develop`: **113,3 KB**. Quedan 6,7 KB.

uPlot 1.6.32, descargada y medida aquí: **21,6 KB gzip** minificada (y 0,7 KB su CSS). ADR-0017 la describe como «23 KB», que es su tamaño **minificado sin comprimir**, coherente con las cifras de Chart.js y ECharts que pone al lado; no hay contradicción, simplemente la unidad no era gzip.

Con uPlot, dos pantallas nuevas, tres formularios y sus *view-models*, el `build` **fallará**.

Hay además una incoherencia en el propio comprobador: su cabecera dice que mide *«lo que el navegador descarga para arrancar»*, pero suma **todos** los `.js` y `.css` de `dist`, fragmentos perezosos incluidos. Lo que de verdad se descarga al arrancar son ~70 KB gzip; los otros ~43 llegan al entrar en cada pantalla.

**Opciones.**

- **(a) Dos cifras, y la que importa es la del arranque (supuesto provisional).** El comprobador pasa a medir y a exigir: **presupuesto de arranque** (lo que `index.html` precarga) y **presupuesto total**, cada uno con su número y su motivo escrito. uPlot va solo en los fragmentos perezosos de `/nucleo` y `/cubo`, así que el arranque **no crece**. Propongo mantener el arranque en un techo cercano a lo medido (~80 KB gzip) y poner el total en el valor medido al terminar, redondeado hacia arriba con holgura escrita.
- **(b) Subir el total y ya.** Un número más grande, sin distinguir. Ventaja: una línea. Inconveniente: se pierde la única cifra que el usuario nota en un teléfono, que es la del arranque.
- **(c) No vendorizar uPlot** y dibujar las dos series temporales en SVG a mano, como el reparto. Descartada: el prompt fija uPlot en la decisión (e), y una serie temporal con ejes, huecos y *tooltip* escrita a mano es mucho más código que 21,6 KB.

**Mi recomendación: (a).** El número concreto lo propongo al terminar, ya medido, en vez de inventarlo ahora. Lo que necesito de la dirección es el permiso para **cambiar el criterio de medida**, no solo el número.

---

## Q7 — «Tesis frente al índice en el tiempo»: ¿una curva o una por tesis?

**Contexto.** El prompt §3.3 pide como tercera gráfica *«Tesis frente al índice en el tiempo, en la pantalla del cubo»*. La especificación §6.2 pide, en su lista de gráficas del cubo, *«Curva de valor del cubo frente a la del mismo dinero invertido en el índice»*. No son lo mismo.

Con nueve tesis en el libro sintético, una línea por tesis son nueve series en una pantalla de 400 px, con nueve colores que además **no pueden ser el único portador de significado** (decisión (f) de la 006). Es ilegible.

**Opciones.**

- **(a) Una curva agregada (supuesto provisional)**: dos series, «resultado del cubo» y «equivalente en índice», que es literalmente lo que pide la especificación §6.2, más la tabla de tesis debajo con el `vs índice` de cada una (que ya está en la pantalla). Ventaja: se lee en el teléfono y responde a la regla 16.
- **(b) Una línea por tesis**, con un selector para aislar una. Ventaja: literal al prompt. Inconveniente: ilegible por defecto, y el selector añade estado a una pantalla ya densa.
- **(c) La curva agregada, y al tocar una tesis de la tabla, su propia curva sustituye a la agregada.** Es (a) más una interacción; cuesta poco y cubre las dos lecturas.

**Mi recomendación: (a)**, y (c) si sobra tiempo. Aviso de que esto es una lectura mía del prompt: si «tesis frente al índice» quería decir literalmente una línea por tesis, dígamelo y lo hago con selector.

---

## Q8 — El techo de 250 líneas: ¿qué cuenta y qué hago con los seis que ya se pasan?

**Contexto.** Decisión (g): *«Techo de ~250 líneas por fichero en `apps/web/src` sin razón escrita»*. Medido hoy: 59 ficheros `.ts`/`.tsx`, 7.171 líneas, media de 121 — coherente con lo que dice el prompt. **Seis pasan de 250**:

| Fichero | Líneas | Qué es |
|---|---|---|
| `view-models/forms/specs.ts` | 448 | **datos**: la descripción declarativa de los nueve formularios |
| `ledger/actions.ts` | 320 | toda la escritura y sus tres resultados |
| `routes/movimientos/detail.tsx` | 294 | la ficha de un evento |
| `routes/registrar/EventForm.tsx` | 289 | el formulario genérico |
| `view-models/settings.ts` | 268 | las tablas de configuración |
| `view-models/detail.ts` | 263 | los campos de un evento |

Y en `apps/web/src/styles/` hay 1.443 líneas de CSS en cuatro ficheros, con `components.css` a 528 y `layout.css` a 426.

**Opciones.**

- **(a) El techo aplica a `.ts`/`.tsx`; el CSS lleva su razón escrita (supuesto provisional).** Partir `components.css` por pantalla dispersaría la cascada, que es donde nacen los defectos de estilo que la 006 encontró en el navegador. De los seis de arriba: `specs.ts` y `settings.ts` son **datos** y llevan su razón; `EventForm.tsx` y `detail.tsx` se parten de verdad (su lógica de presentación baja a `view-models/`); `actions.ts` y `view-models/detail.ts` se miran y se parten si el corte es natural, y si no, llevan su razón.
- **(b) El techo aplica a todo, CSS incluido.** Consecuencia: tres ficheros de estilo troceados en unos diez.
- **(c) Solo a lo nuevo.** Inconveniente: el prompt dice *«el que se pase, se parte»*, no «el que se escriba a partir de ahora».

**Mi recomendación: (a)**, con el techo vigilado por un test que exige un marcador con la razón en la cabecera de todo fichero que lo supere. La excepción existe, pero está escrita y se lee en la revisión — el mismo mecanismo que la lista `NOT_SHOWN` del test de mensajes.

---

## Q9 — Costes: el dominio no separa las comisiones deducibles de las que no lo son

**Esta es una en la que creo que el prompt pide algo que no existe.**

**Contexto.** El prompt §3.1 pide, en el bloque de costes: *«`costSummary`, con las comisiones que suman al coste de adquisición separadas de las que no son deducibles (`business-rules.md`)»*.

`docs/business-rules.md` §5.2 lo dice bien: *«la de compra se suma al coste de adquisición; la de venta se resta del valor de transmisión; las de **custodia, administración o conectividad no son deducibles**… Se guardan aparte del precio»*.

Pero `costSummary` **no hace esa separación**, y no por olvido: solo acumula las comisiones de `buy`, de `sell` y de las ventas forzosas de un evento corporativo — que son, todas ellas, las **inherentes a la adquisición o a la transmisión**, es decir, las deducibles. Las **no deducibles** viven en el evento `standalone_fee` (custodia, administración, conectividad), y `costSummary` **no mira ese tipo de evento en absoluto**. La CLI tampoco las enseña: `atlas costs` imprime `comisiones EUR`, `% invertido`, `TER %`, `valor EUR` y `coste anual EUR`, y ninguna de esas columnas las contiene.

O sea: no hay nada que «separar», porque una de las dos mitades no está.

**Opciones.**

- **(a) Añadir la mitad que falta al dominio**: `costSummary` gana un bloque de comisiones **no deducibles** por cuenta, alimentado de `standalone_fee`, con su test y su cobertura; `atlas costs` lo imprime y la web lo enseña separado, como pide el prompt. Ventaja: cumple el prompt de verdad y prepara la Fase 5, que va a necesitar esa distinción. Inconveniente: es un añadido al dominio que el prompt no describe como tal.
- **(b) La web enseña lo que hay y dice que las de custodia no están incluidas.** Ventaja: cero riesgo. Inconveniente: incumple la frase del prompt, y una pantalla de costes que se deja fuera las comisiones de custodia está dando una cifra optimista.
- **(c) La web suma los `standalone_fee` por su cuenta.** Descartada: es una regla de negocio en la web, y encima fiscal.

**Mi recomendación: (a).** Es poco código y cierra un agujero real: hoy no hay ninguna vista, ni en la CLI ni en la web, donde el usuario vea lo que le cobran por custodia. Pero es un cambio de dominio, así que no lo doy por hecho.

*Nota: no es un cálculo fiscal. Son informativas, y la §5.2 solo dice que no entran en la ganancia patrimonial. La separación es de presentación de un dato que ya está en el libro.*

---

## Q10 — «Valor por defecto» de la fecha fiscal por tipo de activo no hace nada, y arreglarlo cambia comportamiento fiscal

**Contexto.** Está en el inventario de errores de la 006 (nota V6, «anotado, sin tocar»), y el prompt §3.7 me manda resolver ese inventario. Pero esta fila es fiscal y la anotación de la 006 decía expresamente que por eso no se tocaba.

En Ajustes → Configuración, la fecha fiscal por tipo de activo ofrece una opción «Valor por defecto». Hoy elegirla **no hace nada**: la función que aplica el cambio ignora el valor vacío, así que un valor ya fijado **no se puede quitar desde la pantalla**. Es comportamiento heredado, conservado tal cual en el refactor de la 006.

ADR-0018 dice que estos mapas de `Settings` son **parciales** y que *«los tipos ausentes toman el valor por defecto documentado en ADR-0013 y ADR-0014»*. O sea: quitar la clave es una operación legítima y con semántica escrita. El control promete hacerlo y no lo hace.

**Opciones.**

- **(a) Que vaciar el campo quite la clave del mapa (supuesto provisional).** Es lo que el control promete y lo que ADR-0018 define. Coste: una línea más su test. Efecto: la regla fiscal de ese tipo de activo pasa a ser la documentada por defecto, lo cual **puede cambiar la fecha fiscal de operaciones ya registradas** y, con ella, su orden cronológico. El propio dominio ya avisa de eso al registrar un `settings_changed` (ADR-0015: lista los eventos que pasan a ser inválidos y exige confirmación), así que el usuario no lo haría a ciegas.
- **(b) Quitar la opción «Valor por defecto»** de la pantalla: si no se puede quitar, que no se ofrezca. Coste: una línea. Inconveniente: se pierde una capacidad que el ADR define y que la CLI sí permite.
- **(c) Dejarlo como está** y anotarlo otra vez. Inconveniente: el prompt dice que el inventario se resuelve o se explica; «se explica» aquí sería explicar por segunda vez lo mismo.

**Mi recomendación: (a)**, porque el aviso de ADR-0015 ya protege el caso peligroso. Pero es fiscal y el prompt dice que nada fiscal se decide aquí, así que no lo toco sin respuesta. Si la respuesta tarda, implemento **(b)**, que es reversible y no cambia ninguna cifra.

---

## Q11 — Tres filas del inventario de errores que la 006 dejó marcadas «decisión de la dirección»

**Contexto.** El prompt §3.7 me manda resolver el inventario de `specs/006-web-shell/questions.md` (nota V6). La mayoría son arreglos claros y los hago sin preguntar. Tres llevan escrito que la decisión era de la dirección, así que las traigo con mi propuesta:

1. **Importar un fichero que no es un libro deja un libro vacío abierto y recordado.** Hoy la importación abre primero el almacenamiento del navegador y **después** valida; si la validación falla, el usuario se queda con un libro vacío abierto y recordado para el arranque siguiente, sin que nada se lo diga. La 006 lo marcó como «el camino de entrada de un teléfono». **Propongo invertir el orden**: validar el texto en memoria y abrir solo si es un libro. Es el arreglo obvio y no cambia ninguna otra cosa. *Lo doy por hecho salvo que se me diga que no.*
2. **La fase `failed` del libro pierde su aviso al navegar.** El error vive en la pantalla que lo provocó; al navegar, la guarda rebota a `/libro` y el aviso desaparece. **Propongo** que `failed` se pinte en `/libro` mientras dure, como ya hace la fase `reconnect`. *Ídem: lo doy por hecho.*
3. **Los hallazgos de integridad se muestran en inglés.** El título está en español pero el detalle es el mensaje del dominio. No hay equivalente de `describeError` para `IntegrityFinding`: son diez códigos con detalles distintos, no es de una línea. **Propongo** un catálogo para los hallazgos en el mismo módulo de mensajes de la web, con su entrada en el test anti-deriva. **Aquí sí pregunto**, porque es la única de las tres que ensancha el trabajo de forma apreciable y no es un defecto de comportamiento, sino de idioma.

**Mi recomendación**: hacer 1 y 2 sin más trámite, y hacer 3 si la dirección confirma que entra (yo creo que sí: un mensaje en inglés en la pantalla de verificación es exactamente lo que el prompt §3.7 llama «jerga»).

---

## Notas de lectura (no son preguntas)

1. **`docs/dependencies.md` ya lista uPlot** como vendorizada de runtime, así que no hay nada que añadir ahí por mi parte. `happy-dom` no está; según la instrucción que he recibido, **lo añade la dirección** y yo no toco `docs/`. Lo instalo como dependencia de desarrollo cuando lo necesite. *(El prompt §6(h) dice a la vez que se añade a `docs/dependencies.md` y que el implementador no toca `docs/`; la dirección ya ha aclarado cuál manda.)*
2. **`happy-dom` sola, sin `@solidjs/testing-library`.** Con un entorno de DOM basta `render` de `solid-js/web`, que devuelve su propia función de limpieza. Una dependencia autorizada, una dependencia añadida.
3. **El test de la puerta de `Amount` sigue siendo el del grafo de importaciones.** `happy-dom` no lo sustituye: la decisión (k) de la 006 dice que el grafo es *mejor* y sigo pensando lo mismo. `happy-dom` se usa para tres cosas que el grafo no ve: el ciclo de vida de uPlot, el enmascarado del eje renderizado, y la prueba de humo del grafo de pantallas que la 006 no pudo hacer (su nota N4, que es literalmente el caso concreto que se pedía para autorizarla).
4. **El peso de una posición dentro del cubo no lo añado al dominio.** `bucketPositions` ya devuelve `total_value_eur` y el `value_eur` de cada fila; dividir dos cifras que el dominio ya da es presentación. Si la dirección lo ve como regla, es una línea añadir `weight_pct` a `BucketPosition` y lo hago.
5. **Los rangos 1M y 1A de las gráficas van a salir vacíos a menudo** sobre un libro con valoraciones anuales: una ventana de un mes no contiene ninguna fecha de valoración. La pantalla lo dirá («no hay ningún punto en este rango»), y los botones sin puntos irán deshabilitados con su motivo, en vez de dejar una gráfica en blanco.
6. **Inconsistencia de la CLI, anotada y no tocada**: `atlas thesis list` imprime `invertido`, `resultado` y `previsto` **sin redondear**, mientras `atlas bucket` los redondea a céntimos. La web redondeará a céntimos en los dos sitios (como `atlas bucket`), así que en esa columna la web y `atlas thesis list` pueden diferir en el último decimal. Si molesta, es una línea en la CLI.
7. **`atlas bucket` imprime la regla de parada dos veces** (arriba y en el pie de avisos). La web la pondrá arriba y no la repetirá en la lista de avisos; es la misma información, no dos.
8. **Q4 y Q6, si se aceptan, creo que merecen ADR** («lo que compone un evento del esquema vive en el dominio», y «el presupuesto del *bundle* se mide en arranque y total»). Puedo redactarlos con estado *Propuesta*; aceptarlos es de la dirección.

---

## Notas de implementación (2026-09-18, al terminar)

Lo que apareció al escribir el código y la dirección debería conocer. Nada reabre una decisión; tres son hallazgos y uno es un techo que no aguantó.

### N1 — El presupuesto total del *bundle* no cabe en 150 KB: son 163,1

Medido al terminar. El desglose, todo gzip: ~34 KB el dominio (está en el arranque porque la primera pantalla proyecta el libro), ~22 uPlot (en un fragmento perezoso que solo cargan Núcleo y Cubo), ~16 la hoja de estilo con Pico dentro, ~12 el router, ~8 Solid y el arranque, y unos 2 KB por pantalla.

No hay grasa que quitar: lo único descartable sería uPlot, y la decisión (e) lo fija. La dirección aprobó 175 KB con una instrucción —*«fija el total en lo que realmente hayas medido, no en el techo»*—, así que **el techo queda en 164 KB**: lo medido al terminar (163,1, con los arreglos de las dos revisiones dentro) redondeado al KB siguiente. El desglose está escrito en la cabecera de `scripts/check-bundle.mjs`. La cifra que se nota en un teléfono es la del **arranque**, y esa ha pasado de 70,4 a **74,5 KB** con dos pantallas, seis formularios y una librería de gráficas — dentro de los 80 que la dirección fijó.

Si la dirección prefiere mantener 150, la única palanca real es dejar de vendorizar uPlot y dibujar las dos series a mano en SVG, que es mucho más código que 22 KB.

### N2 — La serie más larga del libro sintético tiene ocho puntos

Y dos de ellos son completos. No es un defecto de la gráfica: es lo que el libro sabe. Las valoraciones son manuales y casi todas de un 31 de diciembre, así que la evolución del patrimonio tiene ocho fechas en las que decir algo y en seis de ellas falta el precio de algún activo.

La pantalla lo dice con todas las letras debajo de la gráfica («N de M puntos con datos: en el resto falta el precio de X. No se interpola: donde no hay precio, hay hueco») y los botones de rango sin puntos salen deshabilitados con su motivo. **Merece la pena mirarlo en el libro real**: si allí también sale escaso, la conclusión no es tocar la gráfica, es valorar más a menudo — y esa es justamente la información que la pantalla está dando.

### N3 — Dos defectos encontrados mirando, no ejecutando

Ninguno de los dos lo habría visto un test:

1. **Todas las filas de todas las tarjetas llevaban una viñeta cuadrada.** Al generalizar la lista a `<ul>/<li>` por accesibilidad, `list-style: none` en el `<ul>` no basta: Pico pone `list-style-type: square` en el `li`, que gana a lo que el elemento hereda. Se ve en una captura y en ninguna otra parte.
2. **Una posición sin precio decía «sin dato» tres veces seguidas** en la misma línea de la tarjeta (el importe del P&L, su porcentaje y el valor). Ahora dice uno.

Y dos de estructura, del mismo tipo: la tesis de una posición estaba en una lista al final de la tarjeta, lejos de su posición, y la condición de invalidación se leía como un bloque suelto — ahora va pegada a su fila, que es donde la regla 15 la quiere; y la distribución del núcleo era una tarjeta aparte que repetía peso y objetivo de la tabla de abajo, así que se han fundido en una.

### N4 — El selector de fecha nativo muestra el formato del **sistema**, no el de la página

En el Chromium sin cabeza del entorno sale `01/31/2027` aunque la página sea `lang="es"`: `<input type="date">` se pinta con la configuración regional del navegador, no con la del documento. En el teléfono del usuario, en español, saldrá `31/01/2027`.

No se ha tocado: ADR-0017 eligió los controles nativos a propósito (en el móvil dan la rueda del sistema) y escribir un selector propio para arreglar un formato sería exactamente la clase de componente que el ADR evita. **Queda anotado para que nadie lo lea como un defecto en una captura.**

### N5 — `atlas order list` y `atlas transfer pending` tenían el mismo defecto de clase

Confirmado al añadirles `--date` (Q3): ninguno de los dos proyectaba con `asOf` y los dos contaban los días hasta hoy. `order list --all` además ponía `days_open: 0` en todas las filas, que no es un dato ausente sino **equivocado**, impreso en la misma columna que el bueno. Los dos arreglados.

De la misma raíz salió un tercero, este en la web: los desplegables de «orden que cierra» y «solicitud que cierra» mostraban **`-780 días`** para un evento con fecha futura. Un formulario se rellena contra el libro entero, que puede tener una operación con fecha valor de la semana que viene, así que la resta puede salir negativa; ahora dice «con fecha futura» y hay un test que prohíbe imprimir una edad negativa.

### N6 — La prueba de privacidad de las gráficas: lo que se pudo y lo que no

La condición de Q5 era un test que renderizara con la privacidad puesta. Se ha hecho con `happy-dom` sobre todo lo que es DOM de una gráfica —la leyenda y la tabla equivalente, que no dejan ni un dígito a la vista— y sobre **las opciones que se le entregan a uPlot**, que es donde vive la regla: el test aplica el formateador del eje Y tal y como lo va a llamar el lienzo y comprueba que devuelve la máscara. Antes esa expresión vivía dentro del componente y quitarle la bandera de privacidad dejaba la suite entera en verde.

(El formateador del *tooltip* que esta nota mencionaba ya no existe: la leyenda de uPlot está apagada —la nuestra lleva el trazo además del color— así que nadie lo llamaba nunca. Se ha borrado con su test.)

**El lienzo no se puede pintar sin navegador**: `happy-dom` no tiene contexto 2D y uPlot falla al dibujar. Falsear uno sería reimplementar mal un navegador, que es lo que la 006 descartó. El eje dibujado se ha comprobado en Chromium, que es la prueba más fuerte de las dos.

### N7 — Lo que el libro sintético no ejercita

El aviso de traspaso vencido **no se ve en el libro sintético**: sus tres solicitudes se completan en dos días y el plazo son quince. La regla está cubierta por nueve tests del dominio (vencido, en plazo, justo en el límite, sin configurar, etapa `redeemed`, cancelada, dos fechas distintas…), pero si la dirección quiere verlo en pantalla habría que añadir una solicitud que se quede colgada al generador, lo cual regenera el *golden* y su snapshot. No se ha hecho: cambiar el libro sintético no estaba en el alcance.

Lo mismo, más llamativo, con el presupuesto del cubo: el libro sintético mete 5.000 € en la cuenta del cubo contra un presupuesto de 300 €, así que la pantalla enseña un aporte veinte veces el previsto. Es el generador, no la aplicación.

### N8 — `atlas costs` enseña por primera vez lo que cuesta la custodia

Efecto lateral de Q9 que merece leerse: sobre el libro sintético, `atlas costs --date 2027-12-31` imprime ahora **3,00 EUR de comisiones sueltas en la cuenta del núcleo**, que hasta hoy no aparecían en ninguna pantalla de ninguna de las dos interfaces. Están etiquetadas como lo que son: no forman parte del coste de adquisición ni del valor de transmisión.

---

## Notas de la segunda revisión (2026-09-18)

Tres cosas que la revisión funcional dejó anotadas para que decida la dirección, no para arreglarlas aquí.

### N9 — Un `forced_sale` de fusión barre también el pico que la cuenta ya tenía (es correcto)

**Qué pasa.** En una fusión o una escisión, `corporateActionDraft` mide el pico sobre la posición **resultante** en el activo de destino, no sobre la parte que acaba de convertirse. Si la cuenta ya tenía 0,4 participaciones del activo de destino de antes, esas 0,4 entran en el pico que se vende.

**Por qué es correcto.** Es lo que hace el intermediario: liquida la parte fraccionaria de lo que te queda en la cuenta al final de la operación, no la de un tramo concreto. Medirlo sobre la conversión sola dejaría a la cuenta con un pico imposible de tener en un activo que no admite fracciones, y obligaría a inventar de qué lote sale lo vendido. FIFO sobre la posición resultante es la respuesta única y es la que el dominio ya da.

**Qué falta.** Nada de código: es idéntico en `develop` y está bien. Lo que no existe es la frase que lo diga en `docs/data-schema.md` §6.5 o en `docs/business-rules.md`, y es justo el tipo de detalle que dentro de tres años parecerá un error. La dirección actualiza el documento.

### N10 — `settingsAt` materializa los mapas parciales en cada guardado (preexistente)

**Qué pasa.** ADR-0018 hace parciales los mapas por tipo de activo (`fiscal_date_rule`, `wash_sale_window`): un tipo ausente toma el valor por defecto documentado. Pero `settingsAt` normaliza los ajustes al proyectar, así que lo que la pantalla de configuración guarda al tocar cualquier otro campo es el mapa **entero**, con todos los tipos escritos.

**Por qué importa.** El día que la dirección cambie un valor por defecto —porque lo diga el asesor fiscal— ese cambio **no alcanzará** a los libros que ya hayan guardado el mapa completo: llevan escrito el valor viejo, tipo por tipo, y el libro es *append-only*. La semántica de «ausente = por defecto» queda inutilizada en la práctica sin que nadie lo note.

**Qué se ha hecho.** Nada: es anterior a esta feature, toca la forma en que se serializan los ajustes y es una decisión de la dirección, posiblemente un ADR. Aquí solo se ha arreglado lo que pedía Q10 (vaciar un campo quita la clave del mapa que se envía).

### N10bis — Los costes sueltos: una lectura que conviene confirmar

La indicación era *«que enseñe los dos totales como hace la CLI, y que el del cubo salga en `/cubo`»*. Se ha hecho así: cada libro lleva **sus filas y su total**, el del núcleo en `/nucleo` y el del cubo en `/cubo`, y bajo el total del núcleo hay una línea que dice dónde están los otros (sin repetir la cifra, que es del otro libro).

**Por qué no los dos totales juntos en `/nucleo`:** `atlas costs` es un comando sobre el libro entero y puede permitirse una tabla con columna «Libro» y dos totales etiquetados; una pantalla que se llama «Núcleo» no, porque la constitución III dice que los dos libros no comparten ni vista ni métrica salvo en las dos excepciones acotadas, y ésta no es ninguna de ellas. Si la dirección quería literalmente los dos totales en la misma tarjeta, es una línea: el grupo del cubo ya viaja en el *view-model*.

### N11 — La prosa de los avisos del dominio enseña importes con la privacidad puesta

**Qué pasa.** Con el modo privado activado, las cifras de las tablas, las tarjetas, los ejes y la leyenda quedan enmascaradas —eso está cubierto por tests y comprobado en Chromium—, pero el **texto de un aviso** las sigue enseñando, porque el importe va incrustado en la frase:

> El aporte bruto al cubo (5000 EUR) supera el tope de 6000 EUR

**Por qué no se ha arreglado aquí.** Es anterior a esta feature (nació con el Resumen de la 006) y no tiene arreglo pequeño: o los catálogos de mensajes reciben la bandera de privacidad y componen la frase con `Amount`, o el dominio deja de meter importes en la prosa y los pasa en `details` para que la interfaz los pinte. Lo primero cambia la firma de los dos catálogos; lo segundo cambia el dominio y la CLI. Cuál de las dos es una decisión de producto.

**Mientras tanto** conviene saber que el modo privado cubre las cifras, no las frases.

**Resuelto (rama `fix/privacy-in-messages`, 2026-09-18).** Se ha elegido el primer camino, sin `Amount`: los dos catálogos reciben la bandera en un segundo parámetro obligatorio (`{ names, privacy }`) y piden sus cifras a `apps/web/src/format/privacy.ts` (`f.money`, `f.quantity`), que aplica la misma máscara `••••`. El segundo camino —datos estructurados y frase compuesta en la interfaz— obligaba a devolver JSX desde los siete puntos donde hoy sale un `string` (entre ellos `AppError.message`, que se guarda en el estado y se ordena), así que no compensaba. Se enmascaran importes y cantidades; porcentajes, puntos, fechas, nombres, plazos y números de regla siguen visibles (§9.6). La CLI no se toca: no tiene modo privacidad y su catálogo es suyo (decisión (i) del prompt 006).

### N12 — El techo del bundle queda con 0,1 KB de margen

El arreglo de N11 pesa **0,7 KB gzip** en el total (163,2 → 163,9 KB) y 0,9 KB en el arranque (74,5 → 75,4, con presupuesto de 80). El techo total está fijado en 164 KB, que es el medido al cerrar la 007 redondeado al KB: ese redondeo es justo lo que se acaba de gastar. La próxima feature que añada código tendrá que mover el techo a propósito, que es lo que dice el propio `check-bundle.mjs`. Conviene que la dirección lo sepa antes de que un cambio de tres líneas rompa una build.

### N13 — Ajustes → Configuración enseña los importes de los ajustes con la privacidad puesta

Comprobado en Chromium a 400×890: con el interruptor en «Oculto», el formulario de configuración muestra `Aportación mensual (EUR) = 600` y `Tope de aporte al cubo (EUR) = 6000` en sus campos, en claro. No es prosa y no lo cubre el arreglo de N11: es un `<input>`, y un campo enmascarado no se puede editar. Las salidas posibles son enmascarar el valor hasta que el campo recibe el foco, o decidir que la pantalla de configuración queda fuera del modo privacidad porque se abre para editar, no para consultar. Es una decisión de producto.

---

## Comparación con la CLI (SC-001)

Sobre el mismo libro sintético y la misma fecha, cifra a cifra. Dos fechas: una con el núcleo completo y otra parcial.

| Cifra | Fecha | CLI | Web |
|---|---|---|---|
| Total del núcleo | 2027-01-31 | `8014.16` | 8.014,16 EUR |
| Peso RV / RF / Oro / Cripto | 2027-01-31 | `23.54 / 48.98 / 25.16 / 2.31 %` | idénticos |
| Desviación RV / RF / Oro / Cripto | 2027-01-31 | `-31.46 / 18.98 / 15.16 / -2.69` | idénticas |
| Total del núcleo | 2027-12-31 | `14226.62` | 14.226,62 EUR |
| Aportación: cubo / núcleo | 2027-01-31 | `60 / 540` | 60,00 / 540,00 EUR |
| Reparto por activo | 2027-01-31 | `111.42 / 255.63 / 141.33 / 0 / 0 / 31.62` | idéntico |
| Comisiones del núcleo | 2027-12-31 | `3.3545329017` | 3,35 EUR |
| TER ponderado | 2027-12-31 | `0.1228754852` | 0,1229 % |
| Comisiones sueltas del núcleo | 2027-12-31 | `3` | 3,00 EUR |
| Total del cubo / coste | 2027-01-31 | `997.5325705022 / 520.0228216863` | 997,53 / 520,02 EUR |
| Total del cubo / coste, parcial | 2027-12-31 | `1185.4224124588 / 1225.172948086`, parcial | 1.185,42 / 1.225,17 EUR, marcado parcial |
| P&L latente de cada posición | 2027-12-31 | `-59.77 (-20.2 %) / 587.44 (162.33 %)` | idénticos |
| Tesis frente al índice | 2027-12-31 | `85.81 / -2.73 / 608.28 / — / -43.84 / -87.6 / -224.75 / —` | idénticas, y los dos «sin dato» con su motivo |
| Comisiones sobre capital operado | 2027-12-31 | `0.37858468 %` | 0,38 % |
| Tasa de acierto | 2027-12-31 | `40 %` | 40,00 % |
| Resultado frente al índice | 2027-12-31 | `335.1754581474…` | +335,18 EUR |
| Peso del cubo sobre el patrimonio | 2027-01-31 | `5.02942514 %` | 5,03 % |
| Peso del cubo sobre el patrimonio | 2027-12-31 | no evaluable | «no evaluada» con su motivo |

Ninguna diferencia. Donde la CLI imprime sin redondear y la web redondea a céntimos, la cifra es la misma redondeada una vez al mostrarla (ADR-0005).

---

## Inventario de errores de la 006, fila por fila

| Caso (nota V6 de la 006) | Estado |
|---|---|
| Importar un fichero que no es un libro deja un libro vacío abierto y recordado | **Resuelto.** `importLedger` valida antes de abrir nada; si el texto no es un libro, el estado anterior queda intacto. Con test |
| La fase `failed` pierde su aviso al navegar | **Resuelto.** Se pinta en `/libro` mientras dure, como la fase `reconnect` |
| Las pantallas que escriben descartan `failure.error.action` | **Resuelto.** `ErrorView` pinta mensaje, acción y código plegado; lo usan la guarda, la configuración, el formulario genérico y el de eventos corporativos |
| Los hallazgos de integridad salen en inglés | **Resuelto.** Catálogo español de los diez códigos, con qué significa y qué hacer, y el mensaje del dominio plegado como evidencia. Con test anti-deriva |
| «Valor por defecto» de la fecha fiscal no hace nada | **Resuelto** (Q10). Vaciar el campo quita la clave del mapa; ADR-0018 define esa semántica y ADR-0015 protege el caso peligroso. Con dos tests |
| Permiso de carpeta revocado a mitad de sesión | **Resuelto** por la misma vía que la tercera fila: el `AppError` ya traía la acción y ahora se pinta |
| Almacenamiento lleno (`QuotaExceededError`) | **Ya estaba resuelto** en la 006; ahora tiene test propio y su acción se ve en las pantallas que escriben |
| Fichero vacío, libro de esquema más nuevo, libro con eventos inválidos, rutas inexistentes | **Ya eran correctos**; comprobados otra vez en el barrido de 112 combinaciones |
| Una escritura que falle a mitad | **No se puede provocar** desde el navegador: `BlobLedgerStore` escribe el fichero entero. Se provocan el fallo previo (cuota) y el conflicto de *etag*, que sí tienen camino |
| La vía de carpeta completa (File System Access) | **Sigue sin poder comprobarse aquí**: Chromium sin cabeza no da el selector de carpetas sin interacción real |
