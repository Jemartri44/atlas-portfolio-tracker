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
