# Prompt 006 — Feature `006-web-shell`

> Copia este texto íntegro al asistente implementador, o indícale que lea `docs/prompts/006-web-shell.md`. Parte de `develop` con las Fases 1, 2 y 3 fusionadas.

---

Eres el asistente implementador del proyecto **Atlas Portfolio Tracker** (`~/projects/atlas-portfolio-tracker`). Vas a construir **la primera mitad de la aplicación web**: el esqueleto sobre el que vivirán todas las pantallas, el almacenamiento en el navegador, la navegación, el modo privacidad, y las dos pantallas que hacen la aplicación utilizable desde el primer día — **Resumen** y **Movimientos** (consultar el libro y registrar operaciones). Las vistas analíticas (núcleo, aportación, cubo, fiscal) y las gráficas son la feature siguiente.

Esta es la parte del proyecto que el usuario va a tocar a diario, **desde el teléfono**. Que funcione no basta: tiene que ser cómoda con una mano, rápida de leer y difícil de equivocarse.

## 1. Lee antes de hacer nada, en este orden

1. `CLAUDE.md` entero, en especial *Code architecture*, *Working on a feature*, *Design principles* y *Language*.
2. `.specify/memory/constitution.md`: II (ningún cálculo fiscal depende de precios), III (compartimentación y sus dos excepciones), V (fallo seguro), VI (supervivencia, pocas dependencias) y las restricciones técnicas (**sin CDNs, sin fuentes remotas, sin analítica; CSP restrictiva**).
3. **ADR-0017** (*stack*: qué se usa y qué está excluido, con motivo) y **ADR-0019** (local-first: cómo funciona sin servidor). Son los dos ADR que gobiernan esta feature. Después, ADR-0002, ADR-0003, ADR-0006, ADR-0007 (puertos), ADR-0015 (proyección degradada) y ADR-0016 (`asOf`).
4. `docs/specification.md` §6 (funcionalidad por libro), §9.6 (frontend) y §10 (seguridad); `docs/data-schema.md` §2, §3, §6 y §7; `docs/business-rules.md` §1 y §4.
5. `docs/dependencies.md`: la lista es **cerrada** y ADR-0017 ya fijó exactamente qué entra.
6. El código que vas a consumir: `packages/domain/src/index.ts` (la API pública entera), `projections/`, `usecases/{record-event,rectify,project-ledger}.ts`, `schema/{validate,line,events}.ts`, `ports/ledger-store.ts`, y `packages/adapters/src/ledger-store/{memory,file}.ts` con su contrato `packages/adapters/test/ledger-store.contract.ts`.
7. `apps/cli/src/` entero: es la referencia de **qué** hace cada comando y de **cómo** se compone el dominio. La web hace lo mismo con otra piel; no reimplementes ninguna regla.

Si encuentras una contradicción o una ambigüedad que te impida seguir, **no la resuelvas tú**: anótala en `specs/006-web-shell/questions.md` y avisa. Nada fiscal ni estructural se decide en esta feature.

## 2. Flujo de trabajo

1. Worktree separado, rama desde `develop` **actualizado**:
   ```bash
   cd ~/projects/atlas-portfolio-tracker && git fetch origin && git worktree add ../atlas-portfolio-tracker-006 -b feature/006-web-shell origin/develop
   cd ../atlas-portfolio-tracker-006 && git config core.hooksPath .githooks && nvm use && npm ci
   ```
2. Spec Kit: `/speckit-specify` → `/speckit-clarify` si hace falta → `/speckit-plan` → `/speckit-tasks`, artefactos en `specs/006-web-shell/` (español, identificadores en inglés). **Enseña `spec.md` y `plan.md` y espera el visto bueno antes de escribir código.**
3. Al planificar, mira **cómo resuelven el móvil** las aplicaciones de finanzas personales que respetas (no copies: mira la navegación con el pulgar, la densidad y el orden de lectura). Anota en `plan.md` qué patrón adoptas y por qué.
4. `/speckit-implement` por tareas, commits atómicos, Conventional Commits en inglés.
5. Sin PR: la dirección sube y fusiona tras revisar.

## 2 bis. Reglas de operación

Las de `CLAUDE.md` § *Working on a feature* y las de `docs/prompts/001-ledger-core.md` §2 bis, íntegras. Para esta feature, además:

- **Ni una regla de negocio en la web.** Todo cálculo, validación o decisión vive en `@atlas/domain` y la web lo invoca. Si echas en falta algo que el dominio no expone, **no lo calcules en el componente**: anótalo en `questions.md`. Es lo que permite que la CLI y la web nunca discrepen.
- **Cobertura**: `packages/domain` sigue al 100 % de líneas y ramas (si tocas dominio). En `apps/web` no hay umbral numérico, pero sí **tests de verdad**: la lógica de presentación (formateo, enmascarado, orden, agrupación) se prueba, y los flujos principales tienen prueba de extremo a extremo.
- **Sin dependencias fuera de ADR-0017.** Si crees que hace falta una, es una pregunta, no una decisión.
- **Nada de directivas `use:`** (ADR-0017: es lo único que Solid 2.0 elimina). Concentra `createEffect`/`onMount` en unos pocos ficheros de arranque.
- Español en la interfaz, sin internacionalización. Inglés en el código, los identificadores y los commits.

## 3. Alcance

### 3.1 El paquete `apps/web`

Vite + Solid + TypeScript estricto, dentro del monorepo, con `@atlas/domain` como dependencia de workspace. Estructura de carpetas **decidida y justificada en `plan.md`** antes de escribir nada; la forma que espero es por responsabilidad, no por tipo de fichero:

```
apps/web/src/
├── main.tsx, App.tsx          arranque y router
├── routes/                    una carpeta por pantalla (resumen, movimientos, ajustes)
├── components/                componentes reutilizables (Amount, tabla, campos, avisos)
├── ledger/                    acceso al libro: adaptador, carga, proyección, acciones
├── format/                    formateo de importes, fechas, cantidades y porcentajes
└── styles/                    tokens y hoja propia sobre Pico
apps/web/vendor/               pico.css con su LICENSE y su VENDOR.md (uPlot llega con las gráficas, que son la feature siguiente: Q9)
```

No metas ficheros sueltos en la raíz de `src/`. Cada carpeta con más de un fichero lleva su `index.ts` de entrada si eso aclara los imports, no por costumbre.

### 3.2 Almacenamiento en el navegador (ADR-0019)

Un adaptador nuevo del puerto `LedgerStore`, **con el contrato existente** (`packages/adapters/test/ledger-store.contract.ts`, que ya cumplen el de memoria y el de fichero: rechazo de versiones más nuevas, `append` que conserva los bytes anteriores, `replace` que archiva antes, conflicto por etag):

- **Fichero del disco** cuando el navegador ofrece la File System Access API: el usuario abre su `ledger.jsonl` una vez, se conserva el permiso entre sesiones, y la web escribe **sobre el mismo fichero que usa la CLI**. Es la vía preferente en escritorio y hay que ofrecerla de forma visible.
- **IndexedDB** en el resto de casos, con importación y exportación de fichero en un botón.
- La web dice **siempre y de forma visible dónde está el libro** que estás viendo (fichero *tal*, o almacenamiento del navegador) y, en el segundo caso, **cuándo se exportó por última vez**, con un aviso si hace más de una semana. IndexedDB nunca se presenta como almacén definitivo (ADR-0019).
- Importar el adaptador **no puede arrastrar `node:fs`** al *bundle*: compruébalo con el tamaño y el contenido del *bundle*, no lo supongas.
- Escritura: `append` para registrar, con el etag como control de concurrencia igual que en la CLI. Si el fichero cambió por fuera (la CLI escribió mientras), el conflicto se muestra y se recarga; **nunca se pisa**.

### 3.3 Carga, proyección y estado

- Al abrir: cargar el libro, proyectar una vez con `collectErrors` y guardar el estado en un *signal*. Toda pantalla lee de ahí; **nadie vuelve a proyectar por su cuenta** salvo para una fecha distinta (`asOf`, ADR-0016) o tras escribir.
- Si el libro tiene eventos inválidos, **cabecera de aviso permanente** con el número y un enlace a la verificación (ADR-0015), exactamente como hace la CLI. Las consultas siguen funcionando; registrar, no.
- Proyectar unos miles de eventos es instantáneo, pero **mide y anótalo** en `plan.md`: si con el libro sintético (172 eventos) o con uno de diez años sintético tardara más de 100 ms, dilo en vez de esconderlo.
- Estados de carga y de error visibles y sobrios: nada de pantallas en blanco, nada de *spinners* eternos.

### 3.4 Modo privacidad (constitución: nada personal a la vista)

- Un **único componente** por el que pasa **todo** importe y **toda cantidad** de la aplicación. Enmascara con un carácter neutro cuando el modo está activo; **los porcentajes, los pesos, las desviaciones, las fechas y los textos siguen visibles** (son la información útil en público y no delatan el patrimonio).
  *Corrección (Q6 de la 006): este prompt decía que las cantidades seguían visibles y **contradecía `docs/specification.md` §9.6**, que manda ocultar "importes y cantidades". Gana la especificación: doce participaciones de un fondo con precio público delatan el importe igual que el importe. Matiz de usabilidad: el enmascarado es de la **presentación de datos**; un campo de formulario que el usuario está rellenando no se enmascara, porque lo está escribiendo él.*
- **Activado por defecto.** El interruptor está siempre a un toque desde la cabecera, y su estado se recuerda en el dispositivo.
- Un test que recorra el árbol de componentes y falle si algún importe se pinta sin pasar por `Amount`: es la única forma de que la regla siga viva dentro de dos años.

### 3.5 Navegación (móvil primero, de verdad)

- **Una sola navegación**, no dos. En pantalla estrecha, **barra inferior** con cuatro destinos alcanzables con el pulgar (Resumen, Movimientos, y dos reservados para la feature siguiente: Núcleo y Cubo) más un acceso destacado a **registrar**. En pantalla ancha, **rail lateral** con los mismos destinos. Nunca las dos a la vez, y nunca un título centrado ocupando una banda entera.
- Rutas con `@solidjs/router`, una por pantalla, con URL legible y navegable (el botón atrás del teléfono tiene que hacer lo que el usuario espera).
- Objetivos táctiles de 44 px, orden de tabulación coherente, foco visible, y todo alcanzable con teclado en escritorio.
- Sin desplazamiento horizontal en ninguna pantalla a 360 px de ancho. Las tablas densas se reorganizan en tarjetas o en filas de dos alturas en móvil; **no** se resuelven con una barra de desplazamiento lateral.

### 3.6 Pantalla **Resumen**

La respuesta a "¿cómo va?" en una sola pantalla, sin hacer *scroll* para lo esencial:

- **Patrimonio total desglosado** (núcleo, cubo, efectivo) con su marca de parcialidad si falta algún precio. Nunca un número único sin descomponer (constitución III).
- **Lo que reclama atención**: avisos activos ordenados por importancia (desviación por encima del umbral, satélite por debajo del mínimo, precios caducados, órdenes y traspasos pendientes, eventos inválidos). Cada aviso dice qué pasa y lleva a donde se arregla. Si no hay nada, se dice con calma: "nada que hacer".
- **Últimos movimientos** (cinco o seis) con acceso al libro completo.
- Todo con precios manuales y su antigüedad visible; sin precio, "sin dato", nunca un cero (constitución V).

### 3.7 Pantalla **Movimientos**

El libro, legible y accionable:

- **Lista de eventos** en orden cronológico inverso, con filtro por tipo, por cuenta, por activo y por rango de fechas, y búsqueda por texto. Paginación o carga progresiva: veinte años de libro no caben de una vez.
- **Detalle de un evento**: todos sus campos con nombres legibles, su estado (vigente, anulado, corrección de otro) y sus enlaces (la orden que cerró, la solicitud que completó, la tesis a la que pertenece).
- **Registrar**: formularios para los eventos que el usuario introduce a mano a diario — `buy`, `sell`, `cash_deposit`, `cash_withdrawal`, `dividend`, `valuation`, `order_placed` — más el alta de cuentas y activos. Cada formulario:
  - usa **las validaciones del dominio** (`validateShape` y la proyección), nunca reglas propias;
  - muestra **vista previa del evento y de su efecto** antes de escribir (lotes y saldo antes/después), como hacen los asistentes de la CLI;
  - avisa de huella repetida y exige confirmación explícita, como `--confirm-duplicate`;
  - y en móvil se rellena cómodamente: teclado numérico donde toca, fechas con el selector nativo, y ningún campo que exija escribir un identificador a mano cuando se puede elegir.
- **Rectificar**: *editar* y *eliminar* como en la CLI (anulación más evento corregido), con la lista de dependientes cuando la haya y el aviso de ejercicio anterior.
- Lo que **no** entra aquí: eventos corporativos, traspasos y tesis (sus asistentes llegan con la feature siguiente; desde la CLI ya se pueden registrar).

### 3.8 Pantalla **Ajustes**

Configuración (con las validaciones del dominio y los avisos de umbral silenciado y de ejercicio movido que ya existen), modo privacidad, gestión del libro (dónde está, exportar, importar, cambiar de fichero) y **verificación** (`integrity` y comprobación profunda, con sus hallazgos explicados en español).

### 3.9 Aspecto

- **Pico CSS vendorizada** como base, con una capa propia de **tokens** (color, espacio, tipografía, radios) en `styles/`. Modo claro y oscuro siguiendo la preferencia del sistema, con interruptor manual.
- Una escala tipográfica y una de espacio, y **nada fuera de ellas**: es lo que hace que una aplicación parezca de una pieza. Los colores semánticos (positivo, negativo, aviso, neutro) se definen una vez y no se repiten a mano.
- **El color nunca es el único portador de significado** (una ganancia y una pérdida se distinguen también por el signo y por su etiqueta): daltonismo y capturas en blanco y negro.
- Números **tabulares y alineados a la derecha**, con la coma decimal española y el mismo número de decimales dentro de una columna.
- Sin animaciones decorativas. Las transiciones, si las hay, respetan `prefers-reduced-motion`.
- Densidad: esta es una aplicación de datos. Cabe más información de la que parece si la jerarquía es clara; huye tanto del muro de números como del océano de blanco con un dato en medio.

### 3.10 Calidad y seguridad

- **CSP restrictiva** servida por la propia aplicación, con `script-src 'self'` (más lo que el *service worker* necesite) y **sin `unsafe-inline`** en producción. La CSP de desarrollo puede ser distinta y se documenta.
- **Cero peticiones de red** que no sean a la propia aplicación: ninguna fuente remota, ningún icono externo, ninguna analítica. Un test o una comprobación del *bundle* que lo demuestre.
- **PWA** con `vite-plugin-pwa`: la aplicación se instala y abre sin conexión. El libro ya está en el dispositivo, así que sin conexión no se pierde nada.
- Biome limpio antes de cada commit; `tsc` estricto sin errores; el `build` produce un *bundle* cuyo tamaño se anota en `plan.md` (y se vigila: ADR-0017 fija ~42 KB de runtime antes de nuestro código).

## 4. Fuera de alcance (no lo hagas aunque parezca fácil)

Las vistas analíticas (pesos del núcleo, calculadora de aportación, cubo, fiscal) y **todas las gráficas** — son la feature siguiente, aunque el *stack* ya las prevea; asistentes de eventos corporativos, traspasos y tesis; autenticación (no hay servidor: ADR-0019); API, Lambda, S3, Cognito y cualquier cosa de AWS; sincronización entre dispositivos; precios automáticos; importadores de extractos; cualquier cambio del esquema del libro.

## 5. Criterios de terminado

- `lint`, `typecheck`, `test`, `build` y CI en verde; `npm run clean && npm run build` desde cero.
- La aplicación abre un `ledger.jsonl` real (usa el *golden* sintético), muestra el resumen, permite registrar una compra con vista previa y la escribe correctamente — verificado **a mano** y anotado.
- Comprobado en **360 px de ancho** sin desplazamiento horizontal y con los objetivos táctiles a tamaño.
- Modo privacidad activado por defecto y ningún importe fuera de `Amount` (con su test).
- `docs/` sin cambios (si algo no encaja, es una pregunta).
- README: cómo arrancar la web en local y cómo abrir un libro.
- `specs/006-web-shell/questions.md` con lo que hayas preguntado y las notas de implementación.

## 6. Decisiones fijadas por este prompt

- **(a) El *stack* no se discute**: es ADR-0017 (Solid 1.9.x fijado, Pico y uPlot vendorizadas, sin librería de componentes, tablas HTML nativas). Las exclusiones de `docs/dependencies.md` tienen motivo escrito.
- **(b) La web funciona sin servidor** (ADR-0019). Fichero del disco cuando el navegador lo permite; IndexedDB en el resto; nunca se presenta IndexedDB como definitivo.
- **(c) Ni una regla de negocio fuera del dominio.** Si el dominio no lo expone, es una pregunta, no un cálculo en un componente.
- **(d) Un único componente `Amount`** para todo importe, enmascarado por defecto, con test que lo vigila.
- **(e) Una sola navegación**, adaptada al ancho: barra inferior en móvil, rail en escritorio. Nunca las dos.
- **(f) El color nunca es el único portador de significado** y ninguna pantalla tiene desplazamiento horizontal a 360 px.
- **(g) Esta feature es el esqueleto más Resumen y Movimientos.** Las vistas analíticas y las gráficas son la siguiente: se entrega algo pequeño y terminado antes que algo grande a medias.
- **(h) Lo que la web necesita y el dominio no expone, se añade al dominio** (respuestas a Q1, Q2 y Q4 de la 006): la **vista previa del efecto de un evento** sale de `apps/cli` y pasa a `packages/domain/usecases/` para que las dos interfaces consuman la misma; se añade una proyección que **lista el libro** ordenado por fecha de negocio (ordenar y agrupar son dominio, ADR-0017); y el cálculo de **qué avisos silencia un cambio de configuración** se mueve junto a su gemelo `movedFiscalYears`. La CLI pasa a consumir las tres: una sola definición, nunca dos.
- **(i) Los textos en español viven en cada interfaz, con un test anti-deriva** (Q3): el mensaje de la CLI remite a comandos que en la web no existen, así que cada una tiene su catálogo, y un test comprueba que **ambas** cubren todos los códigos del dominio y falla si aparece uno sin traducir. Si la duplicación llega a doler, se extrae entonces con datos reales de qué se comparte; hoy sería arquitectura especulativa.
- **(j) En escritorio se abre la carpeta, no el fichero** (Q5): desde un *handle* de fichero el navegador **no permite llegar al directorio padre**, así que no habría dónde escribir `archive/` y `compact` quedaría incompleto. Se pide la carpeta y dentro se abre `ledger.jsonl`, igual que hace la CLI.
- **(k) Se empieza sin entorno de DOM en los tests** (Q8). El test que vigila el componente de importe se hace **sobre el grafo de importaciones**, que es mejor que renderizar: es estructural y no depende de una librería. La lógica de presentación vive en su propia capa y se prueba como funciones puras, y los flujos de escritura se prueban sobre la capa de acciones **comprobando los bytes del fichero**. Si al implementar una pantalla crítica queda sin red, pide `happy-dom` con el caso concreto y se autoriza.
- **(l) En el teléfono el libro vive siempre en el navegador** (hallazgo de la 006): la File System Access API no existe en ningún navegador móvil, así que el aviso de exportación **no es un adorno, es la única red de seguridad**; y como el permiso del fichero no sobrevive al cierre de todas las pestañas, hace falta un "Reconectar" que este prompt no preveía. Ambos entran en el alcance.
