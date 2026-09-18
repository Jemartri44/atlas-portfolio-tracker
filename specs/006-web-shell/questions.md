# Preguntas abiertas — feature `006-web-shell`

Dudas encontradas al leer la documentación y el código que el prompt me prohíbe resolver por mi cuenta (§1: "no la resuelvas tú"; §2 bis: sin dependencias fuera de ADR-0017, sin reglas de negocio en la web; §5: `docs/` sin cambios). Cada una lleva su **supuesto provisional**, que es con el que está escrito el `spec.md` y el `plan.md` y con el que se implementaría si no hubiera respuesta.

Las cuatro primeras son del mismo tipo y son las importantes: **el dominio no expone algo que la web necesita**, y la regla dice que eso es una pregunta, no un cálculo en un componente.

> **Todas respondidas el 2026-09-18** (PR #35, fusionada en `develop`). Las respuestas están recogidas al final de cada pregunta y, en el prompt, como decisiones **(h)-(l)**. **Q6 cambió el supuesto**; las diez restantes lo confirmaron.

---

## Q1 — La vista previa del efecto de un evento: ¿se mueve al dominio?

**Contexto.** El prompt §3.7 exige que cada formulario muestre "vista previa del evento y de su efecto antes de escribir (lotes y saldo antes/después), como hacen los asistentes de la CLI". Esa vista previa existe: es `previewCandidate` en `apps/cli/src/commands/shared.ts`, que compone `loadAndProject` + `completeDraft` + `projectLedger([...events, candidate])` y filtra posiciones, lotes, ganancias y avisos. Está **en la CLI**, no en el dominio.

**Opciones.**
- **(a) Moverla a `packages/domain/src/usecases/preview-event.ts` (supuesto provisional)** y que la CLI la consuma. Ventajas: un solo sitio donde se decide "qué pasaría si registro esto"; la web y la CLI no pueden divergir; entra con cobertura del 100 %. Inconvenientes: toca dominio y CLI, que no estaban en el alcance literal de la feature; el diff de la CLI hay que revisarlo.
- **(b) Dejarla donde está y que la web la duplique.** Ventaja: no toca nada existente. Inconveniente: dos implementaciones de la misma cosa, y la de la web sin la cobertura del dominio.
- **(c) Extraerla a un tercer sitio compartido.** Exigiría un paquete nuevo, que es un cambio estructural (CLAUDE.md fija los cinco paquetes).

**Supuesto provisional: (a).** Contrato en `contracts/domain.md` §1; spec A1, FR-044.

**Respuesta del usuario (2026-09-18): (a).** La vista previa sale de `apps/cli` y pasa a `packages/domain/usecases/`, y **la CLI pasa a consumirla**: una sola definición, nunca dos. Decisión (h) del prompt: "eso es la decisión (c) funcionando, no una excepción a ella".

---

## Q2 — La lista del libro: ¿proyección nueva del dominio?

**Contexto.** La pantalla de Movimientos necesita los eventos en orden cronológico inverso, con el estado de cada uno (vigente, anulado, anulación, corrección) y filtros. Nada de eso existe: la CLI no lista el libro (solo `export`), y ADR-0017 fija explícitamente que **"la ordenación y la agrupación viven en `@atlas/domain`"** (es el motivo escrito para rechazar TanStack Table). Además, el orden correcto exige la fecha de negocio, que depende de `settingsAt` y de `fiscalDateOf` (`docs/data-schema.md` §7.1): calcularla en la web sería la segunda implementación de una regla fiscal.

**Opciones.**
- **(a) Proyección nueva `ledgerEntries(state, events, filter)` en el dominio (supuesto provisional)**, con el orden inverso, el estado y los filtros estructurados; la paginación se queda en la web. Contrato en `contracts/domain.md` §2.
- **(b) Calcularlo en la web.** Inconveniente: reimplementa §7.1 y contradice ADR-0017.
- **(c) Ordenar por `recorded_at`** y ahorrarse la fecha de negocio. Inconveniente: sería un orden distinto del de la proyección, y un evento registrado tarde (que el proyecto considera normal) aparecería fuera de su sitio.

**Supuesto provisional: (a).** Spec A2, FR-037, FR-038.

**Respuesta del usuario (2026-09-18): (a).** Se añade la proyección que lista el libro por fecha de negocio. Decisión (h).

---

## Q3 — Los mensajes en español: ¿catálogo propio de la web?

**Contexto.** `apps/cli/src/output/messages.ts` son 317 líneas que traducen `code` → español para errores y avisos, y es el contrato escrito en `errors.ts` ("el dominio habla inglés y la CLI traduce"). La web necesita lo mismo, pero **la mitad de esos textos remiten a comandos** (`atlas settings set --target-weights …`, `--confirm-duplicate`, `atlas check`) que en la web no existen: copiarlos sería mandar al usuario a un terminal desde una pantalla que tiene el botón al lado.

**Opciones.**
- **(a) Catálogo propio en `apps/web/src/format/messages/` (supuesto provisional)**, con la misma clave (`code`) y la remediación de la web (pantalla a la que ir), más un **test anti-deriva** que falla si la web cubre menos códigos que la CLI. Inconveniente: el texto de cada código se escribe dos veces.
- **(b) Extraer un catálogo compartido** con la remediación inyectada por aplicación. Ventaja: un solo texto. Inconvenientes: exige un paquete nuevo o meter presentación en el dominio (que habla inglés por contrato); es un cambio estructural.
- **(c) Reutilizar el de la CLI tal cual** importando desde `@atlas/cli`. Inconveniente: la web mandaría a teclear comandos, y `apps/*` importándose entre sí rompe la dirección de dependencias de ADR-0007.

**Supuesto provisional: (a).** Spec A4, FR-020, plan D14.

**Respuesta del usuario (2026-09-18): (a), con una condición.** Catálogo propio en la web, y el test anti-deriva comprueba que **ambas** interfaces cubren todos los códigos del dominio, fallando si aparece uno sin traducir en cualquiera de las dos. Extraer hoy un catálogo compartido sería arquitectura especulativa; si la duplicación duele en la Fase 5, se extrae entonces con datos reales. Decisión (i).

---

## Q4 — Los avisos que silencia un cambio de configuración: ¿al dominio?

**Contexto.** La constitución IV exige avisar cuando un cambio de umbral apaga un aviso activo. La comparación está implementada en `apps/cli/src/commands/catalogue.ts` (`activeWarnings` + `confirmSilencedWarnings`), no en el dominio, mientras que la **otra** mitad del problema (ejercicios movidos) sí es del dominio (`movedFiscalYears`). La web necesita las dos.

**Opciones.**
- **(a) Añadir `silencedWarnings(state, date, current, next)` a `projections/settings-impact.ts` (supuesto provisional)**, donde ya vive `movedFiscalYears`, y que la CLI la consuma. Contrato en `contracts/domain.md` §3.
- **(b) Duplicarla en la web.** Mismo problema que Q1(b), y aquí además es un aviso que la constitución exige: dos implementaciones significan que una puede dejar de avisar.

**Supuesto provisional: (a).** Spec A5, FR-054.

**Respuesta del usuario (2026-09-18): (a).** `silencedWarnings` se va junto a `movedFiscalYears` y la CLI pasa a consumirla. Decisión (h).

---

## Q5 — Fichero o carpeta: ¿qué se elige en el escritorio?

**Contexto.** ADR-0019 dice "el usuario abre su `ledger.jsonl` una vez". Con `showOpenFilePicker` se obtiene un *handle* de **fichero**, y desde él **no se puede llegar a su directorio padre**: no habría forma de escribir `archive/`, que es lo que exige `replace` en el contrato del puerto (y lo que necesitaría un `compact` futuro). Con `showDirectoryPicker` se elige la carpeta, se abre `ledger.jsonl` dentro, y la aplicación puede crear `archive/` exactamente como la CLI.

**Opciones.**
- **(a) Selector de carpeta (supuesto provisional)**: contrato de puerto completo, `compact` posible más adelante, y el permiso cubre el libro y sus archivos. Inconveniente: el permiso es sobre una carpeta, no sobre un fichero (en la práctica, la carpeta del libro).
- **(b) Selector de fichero**, más literal al ADR, con `replace` no soportado y una excepción explícita. Inconveniente: el adaptador no cumpliría el contrato completo, que es justo lo que el prompt §3.2 pide.

**Supuesto provisional: (a).** Spec A6, plan D4, `contracts/storage.md` §3.1.

**Respuesta del usuario (2026-09-18): (a), y lo califica de hallazgo importante**: sin el directorio no habría dónde escribir `archive/` y `compact` quedaría incompleto. Se pide la carpeta y dentro se abre `ledger.jsonl`, igual que la CLI. Decisión (j).

**Nota de lectura, no es pregunta**: la File System Access API **no existe en ningún navegador móvil** (ni Chrome Android ni Safari iOS; ver `research.md` §4). En el teléfono —el uso diario— la vía es siempre IndexedDB con importación y exportación. ADR-0019 ya lo preveía; lo anoto porque cambia el peso de las dos vías: la del fichero es la del escritorio.

---

## Q6 — El modo privacidad, ¿enmascara también las cantidades?

**Contexto.** Dos documentos dicen cosas distintas:

- El prompt §3.4: "Enmascara [los importes] … **los porcentajes, las cantidades y las fechas siguen visibles**".
- `docs/specification.md` §9.6: "oculta **todos los importes y cantidades** (saldos, posiciones, P&L, ejes de gráficas) sustituyéndolos por una máscara… Los porcentajes y las formas de las gráficas siguen visibles".

No es un matiz: con 28,7 participaciones a la vista y un precio público, el importe se reconstruye de cabeza.

**Opciones.**
- **(a) Solo importes (supuesto provisional)**, según el prompt, que es el documento más reciente y el que gobierna esta feature. La cantidad es la información que el usuario consulta ("cuántas participaciones tengo") y esconderla haría la pantalla inútil en público.
- **(b) Importes y cantidades**, según la especificación. Exigiría un segundo componente (`Quantity`) con el mismo enmascarado, lo cual es barato si se decide **ahora** y caro si se decide después.

**Supuesto provisional: (a)**, con el diseño preparado para (b): las cantidades se pintan por un único componente, de modo que activar su enmascarado sea una línea.

**Respuesta del usuario (2026-09-18): (b), y el prompt estaba mal.** Gana `docs/specification.md` §9.6: el modo privacidad enmascara **importes y cantidades**; porcentajes, pesos, desviaciones, fechas y textos siguen visibles. "Doce participaciones de un fondo con precio público delatan el importe igual que el importe." **Matiz añadido**: el enmascarado es de la **presentación de datos**, no de un campo de formulario que el usuario está rellenando. El prompt §3.4 ya está corregido y deja el error escrito en vez de borrarlo. Spec A3, FR-021, FR-022, Historia 3.

---

## Q7 — `vite-plugin-solid` no está en `docs/dependencies.md`

**Contexto.** ADR-0017 fija el *stack* y `docs/dependencies.md` lista las dependencias de desarrollo: `typescript`, `@biomejs/biome`, `vitest`, `@vitest/coverage-v8`, `fast-check`, `esbuild`, `vite`, `@types/node`, `vite-plugin-pwa`. **Falta `vite-plugin-solid`**, y sin ella Vite no compila JSX de Solid: el compilador de Solid no es un transformador de JSX estándar, transforma el JSX en operaciones de DOM finas. Las alternativas reales son escribir la interfaz con `solid-js/h` o plantillas etiquetadas (perdiendo el modelo que el ADR eligió) o no usar Solid.

Comprobado hoy: `vite-plugin-solid@2.11.14` admite `vite ^8` y arrastra `@babel/core`, `babel-preset-solid`, `solid-refresh`, `merge-anything`, `vitefu` y `@types/babel__core`. Es **solo de desarrollo**: nada de eso llega al *bundle*.

**Opciones.**
- **(a) Añadirla como dependencia de desarrollo (supuesto provisional)** y que la dirección la registre en `docs/dependencies.md` y en la nota de ADR-0017 (yo no toco `docs/`).
- **(b) No añadirla** y escribir la interfaz sin JSX. Inconveniente: contradice el espíritu del ADR y hace el código mucho menos legible.

**Supuesto provisional: (a).** Spec A7.

**Respuesta del usuario (2026-09-18): autorizada.** `vite-plugin-solid` ya está registrada en `docs/dependencies.md` como dependencia de desarrollo que no llega al *bundle*.

---

## Q8 — Los tests de la web: ¿se autoriza un entorno de DOM?

**Contexto.** El prompt §2 bis pide "tests de verdad: la lógica de presentación (formateo, enmascarado, orden, agrupación) se prueba, y los flujos principales tienen prueba de extremo a extremo", y §3.4 pide "un test que recorra el árbol de componentes y falle si algún importe se pinta sin pasar por `Amount`". Renderizar componentes de Solid en Vitest exige `jsdom` o `happy-dom` **y** `@solidjs/testing-library`; una prueba de extremo a extremo de verdad exigiría además un navegador (Playwright). Ninguna de las tres está en `docs/dependencies.md`, y §2 bis dice que una dependencia nueva es una pregunta.

**Opciones.**
- **(a) Sin entorno de DOM (supuesto provisional)**: la lógica de presentación vive en funciones puras de `view-models/` y `format/` y se prueba directamente; la regla de `Amount` se vigila con un test **sobre el grafo de imports** (el mismo mecanismo que ya protege `prices.ts` en el dominio, y que resiste mejor el paso del tiempo que un renderizado); los flujos completos se prueban sin DOM sobre la capa de acciones (abrir libro de prueba → proyectar → borrador → vista previa → escribir → releer y comprobar los bytes); y el recorrido de interfaz se verifica **a mano** y se anota, como pide el criterio §5 del prompt. Coste: nada comprueba automáticamente que un componente pinte lo que debe.
- **(b) Autorizar `happy-dom` + `@solidjs/testing-library`** (dos dependencias de desarrollo, ~10 paquetes). Ventaja: tests de componente reales, incluido el enmascarado renderizado. Coste: dos dependencias más en el presupuesto cerrado.
- **(c) Autorizar además Playwright** para el extremo a extremo real. Coste alto (navegadores descargados en CI) para una aplicación de un solo usuario.

**Supuesto provisional: (a).** Spec A8, plan D16.

**Respuesta del usuario (2026-09-18): (a), y el test sobre el grafo de importaciones es *mejor* que renderizar**, así que no es un apaño: es la solución. La lógica de presentación en su capa como funciones puras, y los flujos de escritura sobre la capa de acciones **comprobando los bytes del fichero**. `happy-dom` queda **pre-autorizada**: si al implementar una pantalla crítica se queda sin red, se pide con el caso concreto. Decisión (k).

---

## Q9 — ¿Se vendoriza uPlot ya?

**Contexto.** El árbol de `apps/web/` del prompt §3.1 muestra `vendor/` con "pico.css y uPlot con su LICENSE y su VENDOR.md", pero §4 deja **todas** las gráficas fuera del alcance.

**Opciones.**
- **(a) Vendorizar solo Pico ahora (supuesto provisional)**; uPlot llega con la feature de las gráficas, que es quien la usará y quien puede probarla. Coincide con "nada añadido por añadir".
- **(b) Vendorizar las dos ahora**, literal al árbol del prompt. Inconveniente: 23 KB de código vendorizado que nadie importa, con su VENDOR.md sin verificar en uso.

**Supuesto provisional: (a).** Spec A9.

**Respuesta del usuario (2026-09-18): (a).** El árbol del prompt §3.1 ya dice que uPlot llega con las gráficas.

---

## Q10 — El punto de ruptura entre barra inferior y rail

**Contexto.** El prompt habla de "pantalla estrecha" y "pantalla ancha" sin fijar el número. Hay que elegir uno y que sea el mismo en toda la aplicación.

**Opciones.**
- **(a) 768 px (supuesto provisional)**: por debajo, barra inferior; a partir de ahí, rail. Cubre todos los teléfonos en vertical y las tabletas pequeñas en vertical; un móvil en horizontal (≈740 px) se queda con la barra inferior, que es lo correcto porque se sigue usando con el pulgar.
- **(b) 1024 px**: las tabletas usarían barra inferior. Desaprovecha el ancho.
- **(c) Dos puntos de ruptura** (por ejemplo 768 y 1200) para el ancho del contenido. Se puede añadir después sin cambiar la navegación; no es lo mismo que el de la navegación.

**Supuesto provisional: (a).** Spec A10.

**Respuesta del usuario (2026-09-18): confirmado.** 768 px.

---

## Q11 — El Resumen, ¿proyecta con `asOf` de hoy?

**Contexto.** ADR-0016 obliga a que toda vista con fecha proyecte con `asOf`. El Resumen no tiene selector de fecha: habla de hoy. Pero `asOf` = hoy **excluye** los eventos con fecha de negocio futura (una compra registrada con fecha valor de la semana que viene), mientras que no pasar `asOf` los incluye. La CLI ya resolvió esto: `atlas networth` y `atlas bucket` usan `dateFlag`, que por defecto es hoy, y proyectan con `asOf`.

**Opciones.**
- **(a) `asOf` = hoy en Europe/Madrid (supuesto provisional)**: idéntico a la CLI sin `--date`, y coherente con "patrimonio a día de hoy". Los eventos futuros se ven en Movimientos (que usa la proyección base, sin corte) pero no inflan el patrimonio de hoy.
- **(b) Sin `asOf` en el Resumen**: el patrimonio incluiría lo que aún no ha ocurrido, y el mismo libro daría cifras distintas en la web y en la CLI.

**Supuesto provisional: (a).** Spec A11, plan D7.

**Respuesta del usuario (2026-09-18): confirmado.** `asOf` = hoy, como la CLI.

---

## Notas de lectura (no son preguntas)

1. **`transfer_max_days` no lo consume nadie.** El parámetro existe en `Settings` y ninguna proyección avisa de un traspaso que se pasa de plazo. La web listará los traspasos pendientes sin marcar retraso; convertirlo en aviso es una regla de negocio nueva y no la invento (`contracts/domain.md` §4). *La dirección lo ha anotado para la segunda mitad de la web.*
2. **Modo de solo lectura por defecto** (`docs/specification.md` §9.6). Se cumple por diseño: ninguna pantalla de consulta escribe, registrar exige entrar en `/registrar`, rellenar, ver la vista previa y confirmar. No hay un interruptor de "modo edición" porque serían dos estados que decir y uno que olvidar; si la dirección quiere el interruptor explícito, se añade.
3. **`docs/specification.md` §9.2 y §9.6 describen la web detrás de Cognito y una Lambda.** *Resuelto por la dirección el 2026-09-18*: §9.6 lleva ya una nota que marca su comparativa como histórica y aclara que lo de Cognito y Lambda es la sincronización de la Fase 4, no un requisito para que la web exista.
4. **El prompt §3.1 dibuja `apps/web/src/` con cinco carpetas.** El plan añade dos (`shell/` y `view-models/`) y las justifica; el resto es idéntico. Lo anoto porque es una desviación visible del prompt, aunque menor.
5. **Solid 2.0 y `@solidjs/router` 1.0.0.** El router ha llegado a 1.0.0 después de ADR-0017 (que lo daba por "sin dependencias propias", lo cual sigue siendo cierto). *La dirección confirma fijar la versión exacta*, y `docs/dependencies.md` ya lo recoge.

6. **Los dos hallazgos del móvil son alcance permanente** (decisión (l) del prompt): en el teléfono el libro vive **siempre** en el navegador, así que el aviso de exportación es la única red de seguridad, y el "Reconectar" del permiso del fichero entra en el alcance.

---

## Notas de implementación (2026-09-18, al terminar)

Cosas que aparecieron al escribir el código y que la dirección debería conocer. Ninguna reabre una decisión; dos son hallazgos y una es una corrección de comportamiento.

### N1 — El etag del dominio protege la escritura, no lo que el usuario vio

`recordEvent`, `reverseEvent` y `correctEvent` **cargan el libro ellos mismos** y hacen `append` con el etag de *su* carga. Eso protege el fichero (nadie pisa nada) pero no detecta que el libro cambiara entre el momento en que la pantalla lo leyó y el momento en que el usuario confirma, que en un móvil pueden ser minutos. Con la vista previa por delante, confirmar una previsualización calculada sobre un libro viejo es justo lo que el prompt §3.2 quiere evitar.

**Resuelto en la capa de la web**, sin tocar el dominio: antes de escribir, `ledger/actions.ts` compara el etag del *snapshot* que la pantalla está mostrando con el del fichero; si difieren, no escribe, recarga y avisa (`WriteFailure.kind === "conflict"`). Cuesta una lectura extra por escritura (4 ms con 200 eventos) y es una comparación de etags, no una regla de negocio. Si la dirección prefiere que el dominio acepte un `expectedEtag`, es un ADR pequeño y la web lo consumiría sin cambios de interfaz.

### N2 — `silencedWarnings` compara el **sujeto** del aviso, no todos sus detalles

Al mover la comparación al dominio apareció un defecto del código que había en la CLI: identificaba un aviso por `code` + `JSON.stringify(details)`, y los detalles incluyen el propio umbral. Subir el umbral de 5 a 6 pp con una desviación del 10 % listaba el aviso como "silenciado" cuando seguía sonando: una falsa alarma en el diálogo que pide confirmación. La versión del dominio identifica el aviso por su **sujeto** (`code` + `asset_id`/`asset_class`), con su test. Cambia el comportamiento observable de `atlas settings set` (deja de avisar de más), y por eso se anota.

### N3 — La CLI traducía once códigos al inglés

El test anti-deriva bidireccional que pidió la dirección encontró, a la primera, once códigos que la CLI mostraba con el mensaje inglés del dominio: `missing_basis`, `dangling_correction`, `dangling_reference`, `negative_position`, `lots_mismatch`, `duplicate_id`, `invalid_line`, `invalid_json`, `invalid_envelope`, `invalid_currency`, `invalid_fx_rate` e `invalid_instant`. Se han traducido en `apps/cli/src/output/messages.ts`, que es lo que pedía la condición de Q3. El test lleva una lista corta de códigos que no llegan a una persona con mensaje propio (guardas internas y los de `compact`), cada uno con su motivo escrito.

### N4 — Sin DOM no se puede cargar el grafo de pantallas (caso concreto para `happy-dom`)

Se intentó una prueba de humo que importara `App.tsx` y las doce rutas para detectar un ciclo de imports o un acceso al DOM en el momento de cargar. **No es posible sin DOM**: `@solidjs/router` lee `window.history` *al importarse* (`dist/lifecycle.js`), así que el import falla antes de llegar a nuestro código. Alternativas descartadas: falsear `window` a mano (reimplementar mal un DOM) y compilar en modo SSR (un segundo modo de compilación para el mismo código).

Queda cubierto de otra forma —el servidor de desarrollo transforma las 17 pantallas y componentes con el *pipeline* real, y la lógica vive en capas puras que sí se prueban—, pero **este es el caso concreto** que la decisión (k) pedía para autorizar `happy-dom`: con él, la prueba de humo y un test de renderizado de `Amount` (máscara incluida) entrarían en unas pocas líneas. Lo pido para la feature siguiente, no para esta.

### N5 — Lo que el entorno no permitió verificar

No hay navegador en el entorno de implementación, así que el recorrido visual de `quickstart.md` (360 px, objetivos táctiles, File System Access, PWA sin conexión y tiempos en el móvil) queda para la revisión del usuario. `plan.md` §Verificación separa con precisión lo comprobado de forma automática de lo que necesita ojos.

### N6 — Dos desviaciones menores del prompt, ya acordadas o inevitables

1. `apps/web/src/` tiene dos carpetas más que el árbol del prompt (`shell/` y `view-models/`), justificadas en `plan.md`.
2. El diálogo nativo **no** se cierra al pulsar el fondo: la mitad de estos diálogos están encima de un formulario que ha costado rellenar, y perderlo por un toque perdido es peor que un clic más. `Esc` y el botón de cancelar siguen cerrando.

---

## Notas de la revisión (2026-09-18, correcciones aplicadas)

La dirección revisó la web con un revisor independiente **y abriéndola en Chromium** a 360 px y a 1280 px. Lo que sigue es lo que se corrigió, lo que queda anotado y las dos cosas que la dirección tiene que decidir.

### R1 — La clase que faltaba, y la regla que ahora lo vigila

`shell/Nav.tsx` declaraba `<nav aria-label="Secciones">` **sin `class="nav"`** mientras `styles/layout.css` tenía veinte reglas bajo `.nav`. El CSS estaba bien escrito; simplemente no encontraba al elemento. Consecuencias medidas en el navegador: iconos a 70-96 px en vez de 22, desplazamiento horizontal a 360 px (criterio de aceptación de `spec.md`), ninguna barra fija abajo, ningún rail en escritorio y el pie del rail duplicado sobre la barra inferior. Un atributo.

Corregido, y **con una regla de arquitectura nueva en `tests/architecture.test.ts`** que comprueba las dos direcciones sobre los ficheros reales: toda clase que el CSS selecciona aparece en el marcado, y toda clase literal del marcado está declarada en nuestro CSS o en el Pico vendorizado. Se ha comprobado que falla quitando otra vez el atributo (`expected [ 'nav' ] to deeply equal []`). Encontró además tres selectores muertos (`a.button`, `summary.control`, `.grow`), ya eliminados.

Lo que la regla **no** puede ver: una clase que el CSS compone en tiempo de ejecución (`is-${tone}`) se cubre por su prefijo, y las tres que devuelve una función (`positive`, `negative`, `mask`) están en una lista corta con su motivo escrito, al estilo de `ALLOWED_URLS` del comprobador del *bundle*.

### R2 — La CSP de producción bloqueaba los veintidós estilos en línea

Chromium confirmó que `style-src 'self'` (sin `unsafe-inline`) bloquea los atributos `style=` que Solid compila dentro del HTML de sus plantillas: *"The action has been blocked"*. El caso peor era visible: el engranaje de la barra de estado no tenía respaldo en CSS y en producción se pintaba al tamaño por defecto.

**No queda ningún atributo `style` en el marcado.** Los veintidós casos son ahora clases (`.flush`, `.spaced`, `.note`, `.file-input`, `.switch-inline`, `.load-more`, `.icon-button svg`, `dl.fields pre`, `.empty p`, `.nav .rail-footer a svg`), y el único valor dinámico —el ancho de cada línea del *skeleton*— es un ciclo de cuatro anchos con `:nth-child(4n+…)`, sin nada calculado por elemento. `scripts/check-bundle.mjs` **falla el build** si aparece un `style=` o un `<style>` en el HTML del *bundle*, `.js` incluidos porque es ahí donde viven las plantillas de Solid; comprobado introduciendo uno a propósito.

### R3 — `frame-ancestors` en un `<meta>` no hace nada

Chromium lo dice: *"The Content Security Policy directive 'frame-ancestors' is ignored when delivered via a `<meta>` element"*. Se ha quitado de `index.html` y de `vite.config.ts` para no anunciar una protección que no existe.

**Para la dirección:** la protección sigue haciendo falta y solo puede venir en una **cabecera HTTP**. Le corresponde a la distribución de CloudFront (Fase 4), junto con el resto de la CSP si algún día se quiere servir por cabecera en vez de por `<meta>`. Queda anotado aquí porque `docs/` no se toca en esta feature.

### R4 — Dos decisiones que la dirección debería mirar

1. **`editable` se deriva ahora de `FORM_SPECS`** (una sola fuente, como pedía la revisión). Efecto secundario: `account_created` y `asset_created` **sí** tienen formulario, así que ahora muestran "Corregir" — 19 eventos del *golden*. Antes la lista negra lo impedía por paridad con `atlas edit`, que remite a los comandos de catálogo. Corregir uno escribe anulación + evento corregido; si algo lo referencia, el dominio rechaza la anulación y lo explica (ADR-0003), así que no hay callejón sin salida, pero **es un cambio de comportamiento respecto a la CLI** y la dirección puede querer lo contrario (un `account_updated` en la web, que hoy no tiene formulario).
2. **La regla por defecto del modo privacidad vive en `ledger/state.ts`**, no en `format/money.ts`. Las dos reglas de pintado (máscara y "sin dato") sí están en el módulo vigilado, como pedía la revisión; la tercera lee `localStorage` y meterla en `format/money.ts` habría obligado a **añadir `state.ts` a la lista de módulos autorizados a importar la puerta de privacidad**, que es exactamente la regla de arquitectura que protege que solo `Amount` formate un importe. Se ha exportado como función pura (`privacyFromPreference`) con su test: las tres mutaciones de la revisión mueren igual.

### R5 — Valores fuera de las escalas: lo que queda

Se han llevado a *tokens* los que señaló la revisión (`--s-0`, `--tap-compact`, `--icon`, `--icon-sm`, `--control-max`, y el padding del `badge`). Siguen fuera de escala, y **no** se han tocado, cinco tamaños intrínsecos de una forma concreta: el punto del `ledger-chip` (0,5 rem), la pastilla de la acción (2,25 × 3,25 rem), las dos alturas del *skeleton* (1 y 2,5 rem), el ancho máximo del diálogo (34 rem) y el mínimo de un botón de la barra de acciones (12 rem). No son espacio ni tipografía; si la dirección quiere una escala también para ellos, es un cambio de `plan.md` D10.

### R6 — Lo que sigue sin verificarse aquí

No hay navegador en este entorno. Lo automático está en verde (`lint`, `typecheck`, 837 pruebas, dominio al 100 %, `build` con el comprobador del *bundle*), y los 41 módulos de `apps/web/src` se transforman con el *pipeline* real del servidor de desarrollo (200 cada uno), pero **el resultado visual de R1, R2 y la conmutación a 360/1280 px lo tiene que ver la dirección**. Lo añadido por precaución y sin poder medirlo: `min-width: 0` en cada hueco de la barra y truncado de la etiqueta, porque a 360 px "Movimientos" ocupa casi el hueco entero y bastaba para volver a empujar la página de lado.

---

## Notas de la segunda revisión (2026-09-18, medido en un navegador)

La dirección verificó en Chromium que V1, V2 y V3 estaban resueltos y encontró tres defectos más que solo se ven en pantalla. Esta vez **sí se han podido medir aquí**: la máquina ya tenía el Chromium de Playwright en `~/.cache/ms-playwright`, y se ha usado con un cliente del protocolo DevTools escrito con lo que trae Node 22 (`fetch` y `WebSocket` nativos). **No se ha instalado nada**, ni ha entrado ninguna dependencia en el repositorio: el navegador queda fuera, en el entorno, y los tests del repositorio siguen sin DOM (decisión (k)).

### S1 — La barra de estado empujaba la página 15 px fuera de la pantalla

Reproducido con el *golden* importado a 360 px: el chip del libro se quedaba clavado en su `max-width: 60vw` (216 px) porque, siendo un elemento flexible, su mínimo automático es el de su contenido; el bloque de acciones (interruptor + engranaje, 139 px) se iba a `right: 375`. **12 + 216 + 8 + 139 = 375** dentro de 360.

Corregido: `.statusbar .actions { flex: 0 0 auto }` (los objetivos de 44 px no se encogen) y `.ledger-chip { min-width: 0 }` (lo que cede es el chip, que ya truncaba). Medido después: chip 189 px, acciones hasta 348, `scrollWidth` **360** con `innerWidth` 360 a 320, 360, 768 y 1280 px.

### S2 — El hueco de la barra inferior era de 37 px, no de 72

La causa no era tipográfica. **Pico convierte el `<nav>` en un contenedor flex en fila**, así que nuestra `<ul>` era un *ítem* flexible y medía solo lo que su contenido: 187 px repartidos entre cinco huecos. De ahí los 37 px y las etiquetas cortadas a "sum" y "Movim" — el truncado que añadí en la primera ronda tapaba el síntoma. Además `nav ul:first-of-type` lleva un `margin-inline` negativo que gana en especificidad a `.nav ul`, y `nav li a` otro que hacía cada destino 16 px más ancho que su hueco, **solapándose con el vecino** (los objetivos táctiles se pisaban).

Corregido: `.nav ul { flex: 1 1 auto; min-width: 0 }`, el reset de los márgenes negativos con el mismo peso (`.nav ul:first-of-type, .nav ul:last-of-type`), `.nav a { margin: 0 }`, y la etiqueta a su propio escalón de la escala, `--t-nav: 0.625rem` (10 px), que vuelve a tamaño del enlace en el rail. Medido después: huecos de **72 px** a 360 (64 a 320, 191 en el rail), destinos contiguos sin solape, y **ninguna etiqueta truncada** en ninguna de las cuatro anchuras («Movimientos» pide 64 px de 72 a 360 px, y 64 de 64 a 320 px).

Sin navegador un test no puede medir un *layout*, así que lo que se ha añadido es un guardián de las **seis declaraciones** que sostienen el armazón (`tests/architecture.test.ts`, tabla `SHELL_RULES`), cada una con el motivo escrito: cuál era el defecto y por qué Pico gana si esa línea desaparece. Comprobado que falla al tocar cualquiera de ellas. **Idea para más adelante**, no implementada: comparar la especificidad de cada selector nuestro con los de Pico que tocan la misma propiedad y avisar cuando el nuestro pierda — eso habría encontrado los dos márgenes negativos sin que nadie los buscara.

### S3 — El arranque era una carrera, y en un teléfono la perdía

La preferencia se leía bien; lo que fallaba era el orden. El estado arrancaba en `unconfigured` y `RequireLedger` manda esa fase a `/libro` con un `<Navigate>`, así que **quien terminaba primero decidía la pantalla**: la ruta perezosa o el `restoreLedger` asíncrono. Medido con el `build` de producción, registrando cada cambio de ruta y frenando la CPU con el protocolo DevTools:

| CPU | Antes | Después |
|---|---|---|
| ×1 | `/` (Resumen) — la carrera se ganaba | `/` (Resumen) |
| ×4 | `replace:/libro` → **«Cambiar de libro»** | `/` (Resumen), sin ningún cambio de ruta |
| ×10 | `/libro` | `/` (Resumen), sin ningún cambio de ruta |

Es decir: **cuanto más lento el dispositivo, más se reproduce**, y el dispositivo de uso diario es un teléfono. Por eso la dirección lo vio y aquí, a plena velocidad, no se veía.

Corregido en la capa de estado: el arranque empieza en `loading` y `unconfigured` pasa a ser una **conclusión** del arranque, nunca su punto de partida; mientras dura, las pantallas muestran su esqueleto. Y `restoreLedger` ya no puede lanzar: un navegador con el almacenamiento bloqueado termina en `failed` con su explicación y su salida, en vez de dejar un esqueleto para siempre (que es lo que habría provocado el cambio anterior sin este). La regla de qué abrir está extraída como `bootDecision` y probada; el arranque tiene cinco pruebas en `test/actions.test.ts`, y se ha comprobado que ambas mutaciones (volver a `unconfigured`, tragarse el error) fallan.

### S4 — Las dos decisiones

1. **Privacidad por defecto en `ledger/state.ts`: aprobada por la dirección**, con su razonamiento: no se debilita una regla de arquitectura para colocar un test; el test va donde la regla lo permite. `privacyFromPreference` se queda donde está, y las dos reglas de pintado siguen en el módulo vigilado.
2. **Catálogo: corregido según lo indicado.** `account_created`, `account_updated`, `asset_created` y `asset_updated` salen de los editables, y no con una lista negra de conveniencia: la derivación sigue saliendo de `FORM_SPECS` y se le **resta** el catálogo con la regla escrita —*el catálogo se actualiza, no se anula* (`docs/data-schema.md` §6.1)— y su motivo, que el formulario que existe **crea** una entrada, no la corrige. En el detalle de esos eventos aparece un aviso que dice qué hacer en su lugar (`atlas account update` / `atlas asset update`) y que su pantalla llega en la versión siguiente. Comprobado en el navegador: en el alta de activo y en el alta de cuenta no hay «Corregir» y sí el aviso; en una compra hay «Corregir» y no hay aviso.

### S6 — Encontrado al medir: la tabla densa no cabía a 768 px

No estaba en la lista de la dirección; salió al medir las cuatro anchuras. A **768 px** exactos el documento medía 792 de ancho: el rail ocupa 216 px y la tabla de movimientos, que entraba en ese mismo punto de ruptura, pide 659 px de los 505 que quedan. La columna «Cuenta y activo» es la culpable (293 px, con `white-space: nowrap` sobre el identificador más largo del libro).

La tabla entra ahora a **1024 px**, con la medida escrita en el CSS; entre 768 y 1023 se ven las tarjetas. Se descartó `table-layout: fixed`, que habría cabido, porque obliga a repartir anchos de columna a mano —cuatro anchos nuevos fuera de escala y los importes solapando su celda— y eso ya es rediseñar la tabla. La barra inferior y el rail **siguen conmutando a 768 px**: A10 no se toca. `plan.md` D11 lleva la corrección, porque decía "a partir de 768 px".

Medido después, en `/movimientos`: sin desplazamiento a 360, 768, 900, 1023, 1024, 1280 y 1440 px, con las tarjetas hasta 1023 y la tabla desde 1024.

### S5 — Anotado y sin tocar, por indicación de la dirección

- **`signOfValue` en `components/Amount.tsx` duplica `signOf` de `format/number.ts`**: la misma regla del cero con signo escrita dos veces. Candidato para la limpieza siguiente.
- **Los cinco tamaños fuera de escala** de la nota §R5 de la primera ronda se quedan como están: son formas (el punto del chip, la pastilla de la acción, las dos alturas del esqueleto, el ancho del diálogo y el mínimo del botón de la barra de acciones), no espacio ni tipografía.
