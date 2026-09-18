---

description: "Lista de tareas de la feature 006-web-shell"
---

# Tareas: Esqueleto de la aplicación web, Resumen y Movimientos (`006-web-shell`)

**Entrada**: documentos de diseño de `specs/006-web-shell/`

**Prerrequisitos**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/routes.md`, `contracts/storage.md`, `contracts/domain.md`, `quickstart.md`

**Tests**: obligatorios. Lo que se añada a `packages/domain` va al **100 % de líneas y ramas** (constitución VII, bloqueante en CI). En `apps/web` no hay umbral numérico pero sí tests reales de `format/`, `view-models/`, `ledger/` y del catálogo de mensajes, más tres reglas nuevas en `tests/architecture.test.ts`. Cada tarea lleva sus tests **en el mismo commit**, y `npm run lint` tiene que estar verde **antes** de cada commit.

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: se puede hacer en paralelo (ficheros distintos, sin dependencias pendientes)
- **[USn]**: historia de `spec.md` a la que pertenece
- Rutas relativas a la raíz del worktree `../atlas-portfolio-tracker-006`

## Convenciones de ruta

- Web: `apps/web/src/…`, tests en `apps/web/test/…`
- Adaptadores: `packages/adapters/src/…`, tests en `packages/adapters/test/…`
- Dominio: `packages/domain/src/…`, tests en `packages/domain/test/…`
- Reglas de arquitectura: `tests/architecture.test.ts`

---

## Fase 1: Preparación

**Propósito**: base verde y artefactos congelados antes de tocar código.

- [x] T001 Worktree `../atlas-portfolio-tracker-006` y rama `feature/006-web-shell` desde `origin/develop`, con `core.hooksPath=.githooks`, `nvm use` y `npm ci` (hecho antes de empezar)
- [x] T002 Base verde de partida verificada: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`
- [x] T003 Verificaciones previas del plan, con su resultado anotado en `research.md`: sondas de TypeScript 7 (DOM, `.tsx`, `composite` + `noEmit`), versiones y rangos de pares en el registro npm, coste real de proyectar el *golden*, compatibilidad real de la File System Access API
- [x] T004 `git merge origin/develop` (PR #35: respuestas a Q1-Q11 y decisiones (h)-(l) del prompt), artefactos actualizados con las respuestas y commit `docs(spec): add 006-web-shell specification and plan`

**Punto de parada del prompt: superado.** Q1-Q11 respondidas el 2026-09-18. Cambia una cosa respecto al borrador: **el modo privacidad enmascara importes y cantidades** (Q6), así que el componente único cubre las dos y `Figure` queda para porcentajes, pesos y desviaciones, que no se enmascaran.

---

## Fase 2: Andamio del paquete (bloqueante para todo)

**Propósito**: que `apps/web` exista, compile, se *lintee*, se pruebe y se construya, sin una sola pantalla dentro.

**Prueba independiente**: `npm run lint && npm run typecheck && npm test && npm run build` en verde con `apps/web` dentro, y `npm run dev -w @atlas/web` sirviendo una página mínima.

- [x] T005 `apps/web/package.json` (`@atlas/web`, privado, ESM, `dependencies`: `@atlas/domain`, `@atlas/adapters`, `solid-js` **1.9.15**, `@solidjs/router` **1.0.0**; `devDependencies`: `vite`, `vite-plugin-solid`, `vite-plugin-pwa`) y scripts `dev`, `build`, `preview`
- [x] T006 `apps/web/tsconfig.json` compuesto con `noEmit`, `lib: ["ES2023","DOM","DOM.Iterable"]`, `module: "preserve"`, `moduleResolution: "bundler"`, `jsx: "preserve"`, `jsxImportSource: "solid-js"`, referencia a `packages/domain`; alta en el `tsconfig.json` raíz
- [x] T007 `apps/web/vite.config.ts`: `vite-plugin-solid`, alias de `@atlas/domain` y de las subrutas de `@atlas/adapters` al código fuente (D2), `build.target` moderno y **sin** `minify: "esbuild"` (trampa de Vite 8, ADR-0017)
- [x] T008 Scripts raíz: `build` = `tsc -b && npm run build -w @atlas/web`, `dev` = `npm run dev -w @atlas/web`, `clean` incluye `apps/web/dist` y `node_modules/.vite`
- [x] T009 [P] Proyecto `web` en `vitest.config.ts` (raíz `apps/web`, sin entorno de DOM, Q8) y alias coherentes con T007; la cobertura sigue restringida a `packages/domain`
- [x] T010 [P] Pico CSS vendorizada: `apps/web/vendor/pico/pico.css` (de `@picocss/pico` 2.1.1, sin modificar), `VENDOR.md` con origen, versión, integridad del *tarball*, SHA-256 del fichero, licencia y procedimiento de actualización, siguiendo `packages/domain/vendor/VENDOR.md`; exclusión en `biome.json` como la de `big.js`
- [x] T011 [P] `apps/web/index.html` con la CSP de producción en `<meta http-equiv>`, sin nada remoto, y un `transformIndexHtml` que la relaje solo en desarrollo (D15); `apps/web/src/main.tsx` mínimo que pinte "Atlas"
- [x] T012 `apps/web/scripts/check-bundle.mjs` enganchado al `build` de la web: falla si el resultado contiene `node:`, una URL `http(s)://` ajena, o si el tamaño gzip pasa de 120 KB; imprime el tamaño para anotarlo

**Punto de control**: el monorepo construye la web y la comprobación del *bundle* corre sola.

---

## Fase 3: El libro en el dispositivo (US1, bloqueante para las pantallas)

**Propósito**: un adaptador del puerto que pasa el contrato existente, y las dos vías reales del navegador.

**Prueba independiente**: `ledgerStoreContract` en verde para el adaptador nuevo; en el navegador, abrir una carpeta con el *golden* y leerlo.

- [x] T013 [US1] `packages/adapters/src/ledger-store/blob.ts`: interfaz `LedgerBlob` y clase `BlobLedgerStore` (`load` con número de línea en los errores, etag `sha256Hex`, `append` sin re-serializar, `replace` que archiva primero), según `contracts/storage.md` §1-2
- [x] T014 [US1] `packages/adapters/test/blob.test.ts`: `MemoryBlob` + `ledgerStoreContract("blob", …)` **sin modificar el contrato**, más los casos propios (fichero inexistente = libro vacío, contenido sin salto final, nombre de archivo con separador)
- [x] T015 [P] [US1] `packages/adapters/tsconfig.browser.json` (`lib` con DOM, sin `@types/node`) y subrutas `./blob`, `./browser`, `./clock` y `./random` en el `exports` de `packages/adapters/package.json`, para que la web nunca importe el barril (que arrastra `node:fs`); alta en el `tsconfig.json` raíz
- [x] T016 [US1] `packages/adapters/src/ledger-store/browser/directory.ts`: `DirectoryLedgerBlob` sobre `showDirectoryPicker` (carpeta, D4), con `archive/`, escritura por `createWritable`, `queryPermission`/`requestPermission` y persistencia del *handle* en IndexedDB
- [x] T017 [US1] `packages/adapters/src/ledger-store/browser/indexeddb.ts`: `BrowserLedgerBlob` (almacén `ledger`, registro `current`, archivos con `add`, `lastExportAt`, `navigator.storage.persist()`)
- [x] T018 [US1] Regla de arquitectura en `tests/architecture.test.ts`: `apps/web` no importa `node:*` ni el barril `@atlas/adapters` (solo subrutas)

**Punto de control**: el adaptador del navegador está probado al mismo nivel que el de fichero.

---

## Fase 4: Lo que le falta al dominio (US5, US6, US9 — decisión (h))

**Propósito**: que ninguna pantalla tenga que calcular nada. Aprobada: las tres entran en el dominio y **la CLI pasa a consumirlas en el mismo commit**.

**Prueba independiente**: los tres añadidos con cobertura del 100 % y la CLI consumiéndolos sin cambio de comportamiento observable.

- [x] T019 [US6] `packages/domain/src/usecases/preview-event.ts` (`previewEvent`, `contracts/domain.md` §1) + export público + tests (candidato colocado cronológicamente, error propagado igual que `recordEvent`, duplicados, sin efectos)
- [x] T020 [US6] `apps/cli/src/commands/shared.ts` pasa a usar `previewEvent`; los tests de la CLI siguen en verde sin cambiar sus expectativas
- [x] T021 [US5] `packages/domain/src/projections/ledger-entries.ts` (`ledgerEntries`, `contracts/domain.md` §2) + export público + tests (orden inverso con desempate, eventos sin fecha de negocio, los cuatro estados, cada filtro y su combinación, tipos reservados, evento inválido con su motivo)
- [x] T022 [P] [US9] `silencedWarnings` en `packages/domain/src/projections/settings-impact.ts` + export + tests (aviso que se apaga, aviso que se mantiene, no evaluable por falta de precios)
- [x] T023 [US9] `apps/cli/src/commands/catalogue.ts` pasa a usar `silencedWarnings`; comportamiento de la CLI intacto

**Punto de control**: `npm run test:coverage` en verde con el dominio al 100 %.

---

## Fase 5: El esqueleto (US2, US3 — bloqueante para las pantallas)

**Propósito**: el marco, el estado y las dos reglas que no se pueden saltar.

**Prueba independiente**: la aplicación arranca, navega entre rutas vacías, recuerda el tema y la privacidad, y los tests de arquitectura fallan si se rompe una regla.

- [x] T024 [US2] `apps/web/src/styles/tokens.css`: una escala tipográfica, una de espacio, radios, pesos y colores semánticos, en claro y oscuro, redefiniendo las variables `--pico-*`; `base.css` y `layout.css` encima de Pico
- [x] T025 [US3] `apps/web/src/format/number.ts` y `money.ts`: formateo desde la cadena decimal, sin `Number()` (D9), decimales por columna, máscara de privacidad; tests con casos de miles, negativos, cero, muchos decimales y valor ausente
- [x] T026 [US3] `apps/web/src/components/Amount.tsx` (único consumidor de `format/money.ts`), con importes **y cantidades** enmascarados (Q6), y `Figure.tsx` para porcentajes, pesos y desviaciones, que **no** se enmascaran; "sin dato" para `undefined`, signo y etiqueta además del color
- [x] T027 [US3] Regla de arquitectura en `tests/architecture.test.ts`: `format/money.ts` (importes y cantidades) solo puede importarse desde `components/Amount.tsx` (puerta del componente único, D8)
- [x] T028 [P] [US2] Regla de arquitectura: ningún fichero de `apps/web` contiene una directiva `use:` (ADR-0017)
- [x] T029 [US2] `apps/web/src/shell/Nav.tsx`: **una** `<nav>` con una sola lista (cuatro destinos + acción de registrar), conmutada por CSS a barra inferior (<768 px) o rail (≥768 px), con `aria-current` y objetivos de 44 px
- [x] T030 [US2] `apps/web/src/shell/StatusBar.tsx` (chip del libro, interruptor de privacidad, acceso a Ajustes; solo en estrecho) y `DegradedBanner.tsx` (permanente si hay eventos inválidos)
- [x] T031 [US2] `apps/web/src/shell/AppShell.tsx` + `ErrorBoundary`, con `<main>`, salto al contenido y el relleno inferior que impide que la barra tape el contenido
- [x] T032 [US1] `apps/web/src/ledger/source.ts` (detecta la vía disponible, recuerda la elegida) y `store.ts` (compone `BlobLedgerStore` + `systemClock` + `webCryptoRandom`); tests de la elección de vía con las capacidades simuladas
- [x] T033 [US1] `apps/web/src/ledger/state.ts`: señales, `LoadPhase`, `snapshot`, `projectionAt(date)` memoizado, `privacy`, `theme`, contexto (`data-model.md` §3); tests de la máquina de estados y de la memoización
- [x] T034 [US6] `apps/web/src/ledger/actions.ts`: registrar, rectificar y configurar sobre los casos de uso del dominio, con traducción de `ConflictError`, `DuplicateFingerprintError`, `DependentEventsError` e `InvalidLedgerError` a estados de interfaz; tests de extremo a extremo **sin DOM** contra un `MemoryBlob` (el fichero gana exactamente las líneas esperadas y las anteriores no cambian)
- [x] T035 [US2] `App.tsx` con las once rutas de `contracts/routes.md`, la puerta de arranque (redirección a `/libro`), la ruta `*` y los estados comunes; `main.tsx` como **único** sitio con efectos de arranque (tema, *service worker*, primera carga)

**Punto de control**: se navega por toda la aplicación con pantallas vacías, con una sola navegación y la privacidad activada.

---

## Fase 6: US1 — Abrir mi libro y saber dónde está (P1) 🎯 MVP

**Objetivo**: la aplicación es utilizable con el libro real del usuario.

**Prueba independiente**: pasos 1-3 y 9.1 de `quickstart.md`.

- [x] T036 [US1] Ruta `/libro`: las dos vías explicadas en una línea, la del fichero primero donde existe, la limitación de IndexedDB escrita, e importación desde `<input type="file">` validando **antes** de sustituir
- [x] T037 [US1] Estado `reconnect`: mensaje en una frase y botón "Reconectar" que llama a `requestPermission` dentro del gesto (D5)
- [x] T038 [US1] Exportación byte a byte con `<a download>` y registro de `lastExportAt`; aviso a los siete días en el chip y en Ajustes
- [x] T039 [P] [US1] Errores de carga en español con el número de línea (`SchemaTooNewError`, `ValidationError`) y la acción que resuelve; el libro configurado no se sustituye
- [x] T040 [P] [US1] `apps/web/src/format/messages/errors.ts` y `warnings.ts`: catálogo por `code` con remediación de la web (Q3, D14)
- [x] T041 [US1] Test anti-deriva **bidireccional** (decisión (i)): todo código de error y de aviso que emite el dominio está traducido en **las dos** interfaces, y falla si cualquiera de ellas deja uno sin traducir

**Punto de control**: se abre el *golden* desde el disco y desde el navegador, y la aplicación dice siempre dónde está el libro.

---

## Fase 7: US4 — Ver cómo va y si hay algo que hacer (P1)

**Objetivo**: la pantalla por la que se abre la aplicación.

**Prueba independiente**: pasos 4 de `quickstart.md`.

- [x] T042 [US4] `view-models/networth.ts`: `NetWorth` → bloques pintables, total como suma de lo mostrado, parcialidad y lista de lo que falta; tests
- [x] T043 [US4] `view-models/attention.ts`: avisos e inválidos → `AttentionItem[]` ordenados, cada código con su destino (`data-model.md` §6.1); tests del orden, del caso vacío y de que **todo** código mostrable tiene destino
- [x] T044 [US4] `routes/resumen/NetWorthBlock.tsx` con el desglose, la parcialidad y la antigüedad de los precios
- [x] T045 [US4] `routes/resumen/AttentionBlock.tsx`, con "nada que hacer" cuando no hay nada
- [x] T046 [US4] `routes/resumen/LastMovements.tsx` (cinco entradas de `ledgerEntries`) y composición de `routes/resumen/index.tsx` con el orden de lectura del plan
- [x] T047 [US4] Estado vacío del Resumen (libro sin eventos): la frase y el enlace al primer paso

**Punto de control**: el Resumen responde la pregunta del día a día sobre el *golden*, y degrada de forma visible sin un solo cero inventado.

---

## Fase 8: US5 — Consultar el libro y entender un evento (P1)

**Objetivo**: el libro legible.

**Prueba independiente**: paso 5 de `quickstart.md`.

- [x] T048 [US5] `view-models/movements.ts`: `LedgerEntry` → `MovementRow` (etiqueta del tipo, importe principal por tipo, enlaces); tests por cada familia de eventos
- [x] T049 [US5] `format/labels.ts`: nombres legibles en español de tipos de evento y de **todos** los campos del esquema; test de que no falta ninguno de `knownFieldsOf`
- [x] T050 [US5] `routes/movimientos/MovementList.tsx`: tarjeta de dos alturas en móvil y `<table>` nativa desde 768 px, misma fuente de datos (D11)
- [x] T051 [US5] `routes/movimientos/Filters.tsx`: tipo, cuenta, activo, rango y texto, en la URL, con recuento y borrado de un toque
- [x] T052 [US5] Carga progresiva de veinte en veinte, con el recuento total a la vista
- [x] T053 [US5] `view-models/detail.ts` + `routes/movimientos/detail.tsx`: todos los campos, estado, enlaces, identificador copiable
- [x] T054 [P] [US5] Marcas de estado con palabras (vigente, anulado, anulación de…, corrección de…) y de evento inválido con su motivo
- [x] T055 [P] [US5] Tipos que la web no registra: se listan y se abren con normalidad (comprobado con los siete eventos corporativos y las tesis del *golden*)

**Punto de control**: los 200 eventos del *golden* se recorren, filtran y leen en el móvil sin desplazamiento horizontal.

---

## Fase 9: US6 — Registrar desde el teléfono (P1)

**Objetivo**: la otra mitad del valor de la aplicación.

**Prueba independiente**: paso 6 de `quickstart.md`, con las tres variantes (huella repetida, conflicto, cubo sin tesis).

- [x] T056 [US6] `view-models/forms/` con las nueve `EventFormSpec` (`data-model.md` §6.3), incluidos `omitted` con su motivo
- [x] T057 [US6] Test de cobertura de campos: `fields ∪ omitted` = `knownFieldsOf(type)` menos el sobre, para los nueve formularios
- [x] T058 [US6] Componentes de campo: `Field`, `Select`, `DateField`, `DataList`, `Switch`, con `inputmode`, `<label>`, error asociado por `aria-describedby`, objetivo de 44 px y **sin enmascarar lo que el usuario escribe** (matiz de Q6)
- [x] T059 [US6] `routes/registrar/index.tsx`: los nueve accesos con su línea de "cuándo se usa"
- [x] T060 [US6] `routes/registrar/form.tsx`: renderizador genérico de una especificación, con opciones tomadas del catálogo del estado (cuentas, activos, divisas, órdenes abiertas, tesis abiertas) y campos condicionales (`fx_rate` solo si la divisa no es el euro)
- [x] T061 [US6] `routes/registrar/Preview.tsx` sobre `previewEvent`: evento a escribir, posiciones y lotes antes/después, ganancias y avisos; confirmar deshabilitado mientras haya error del dominio
- [x] T062 [US6] Diálogo de huella repetida con confirmación explícita, y de conflicto con recarga y nueva vista previa (`contracts/routes.md` §4)
- [x] T063 [US6] Compra en el cubo: selección de tesis abierta del par (cuenta, activo) y, sin ninguna, el aviso con el comando de la CLI (regla 15)
- [x] T064 [P] [US6] Escritura bloqueada con libro degradado, con el motivo y el enlace a verificación (ADR-0015)
- [x] T065 [US6] Confirmación posterior: qué se escribió, sus avisos, y los dos accesos (ir al evento, registrar otro); una sola reproyección

**Punto de control**: se registra una compra desde el móvil y el fichero gana una línea, con las 200 anteriores intactas.

---

## Fase 10: US7 — Rectificar (P2)

- [x] T066 [US7] `routes/movimientos/edit.tsx`: formulario del tipo con los valores actuales, original y corregido lado a lado, motivo obligatorio
- [x] T067 [US7] Anulación desde el detalle: motivo, confirmación y `reverseEvent`
- [x] T068 [US7] Diálogo de dependientes (`DependentEventsError`) con su tabla y su explicación
- [x] T069 [US7] Aviso de ejercicio anterior (`priorYear`) y tipos no editables (evento corporativo, tesis): solo anular, con el mismo criterio que la CLI

**Punto de control**: editar produce dos líneas y `atlas check --deep` sigue limpio.

---

## Fase 11: US8 — Cuentas y activos (P2)

- [x] T070 [US8] Formularios de alta de cuenta y de activo, con las validaciones del dominio y las ayudas (país para el Modelo 720, traspasabilidad, ETF de referencia)
- [x] T071 [US8] Edición: evento de actualización con los campos completos, avisando de lo que el dominio prohíbe cambiar (libro, tipo, divisa) con su motivo
- [x] T072 [P] [US8] Listados de cuentas y activos en Ajustes, con su estado y su historial de identificadores

**Punto de control**: sobre un libro vacío se puede llegar a registrar la primera compra sin salir de la web.

---

## Fase 12: US9 — Configurar y verificar (P2)

- [x] T073 [US9] `routes/ajustes/index.tsx`: bloque del libro (dónde, exportar, importar, cambiar), privacidad y tema, y accesos a configuración y verificación
- [x] T074 [US9] `routes/ajustes/configuracion.tsx`: formulario de `Settings` con `mergeSettings`, pesos objetivo con su suma, mapas por tipo de activo y el origen de cada valor (escrito o por defecto)
- [x] T075 [US9] Diálogo de avisos silenciados sobre `silencedWarnings`
- [x] T076 [US9] Diálogo de ejercicios movidos sobre `movedFiscalYears`, con la tabla antes/después
- [x] T077 [US9] Diálogo de eventos que quedan inválidos, con la aceptación explícita que solo admite la configuración (ADR-0015)
- [x] T078 [US9] `routes/ajustes/verificacion.tsx`: `integrity` y comprobación profunda a petición, hallazgos en español con su nivel
- [x] T079 [P] [US9] Interruptor de tema (sistema, claro, oscuro) con `data-theme` y `prefers-reduced-motion` respetado

**Punto de control**: subir un umbral avisa de lo que apaga; la verificación no encuentra hallazgos en el *golden*.

---

## Fase 13: US10 — PWA y seguridad (P3)

- [x] T080 [US10] `vite-plugin-pwa`: manifiesto, iconos propios en `public/`, estrategia de caché que incluya el arranque y nada remoto
- [x] T081 [US10] CSP de producción comprobada en `vite preview` (sin `unsafe-inline`), con la diferencia de desarrollo documentada en el README
- [x] T082 [US10] Comprobación de cero peticiones ajenas: en el `check-bundle` y a mano en el panel de red

---

## Fase 14: Cierre

- [~] T083 Recorrido manual completo de `quickstart.md` (pasos 1-10) sobre una copia del *golden*, con su resultado anotado
- [~] T084 Comprobación a 360 px de **todas** las pantallas: cero desplazamiento horizontal y objetivos táctiles a tamaño
- [x] T085 Mediciones anotadas en `plan.md`: tamaño del *bundle* (JS y CSS, gzip), tiempo de carga y de proyección en un móvil real, y cualquier número peor de lo esperado
- [x] T086 [P] README: arranque de la web en local, cómo abrir un libro (las dos vías y sus límites reales por navegador), CSP de desarrollo frente a producción, y el estado de la Fase "web"
- [x] T087 [P] `specs/006-web-shell/questions.md` actualizado con las respuestas del usuario y las notas de implementación que hayan surgido
- [x] T088 `npm run clean && npm run build` desde cero, más `lint`, `typecheck` y `test:coverage` en verde; CI en verde
- [x] T089 Revisión propia contra la checklist y contra las decisiones (a)-(g) del prompt, incluida la relectura de los componentes buscando cualquier regla de negocio colada
- [~] T090 Commits atómicos revisados (Conventional Commits en inglés, un asunto por cambio conceptual) y entrega a la dirección **sin PR**

---

## Estado al entregar (2026-09-18)

Todas las tareas están hechas salvo tres, marcadas `[~]`, que **no se pueden cerrar en el entorno de implementación porque no hay navegador**:

- **T083** y **T084**: el recorrido visual de `quickstart.md` y la comprobación a 360 px. Lo que sí se ha verificado de forma automática (y cómo) está en `plan.md` §Verificación.
- **T090**: la entrega a la dirección, que sube y fusiona; no se abre PR (prompt §2.5).

`plan.md` recoge las mediciones reales del *bundle* y de la proyección, y `questions.md` las notas N1-N6 con los hallazgos.

## Dependencias

- **Fase 2** bloquea todo lo demás.
- **Fase 3** bloquea la Fase 6 y cualquier escritura (Fases 9-12).
- **Fase 4** bloquea la Fase 8 (T021), la Fase 9 (T019) y la Fase 12 (T022). Si una pregunta se responde "no", la tarea correspondiente se sustituye por su alternativa escrita en `questions.md`, con el motivo anotado.
- **Fase 5** bloquea todas las pantallas.
- Las Fases 6 → 7 → 8 → 9 van en ese orden porque cada una usa lo anterior (el Resumen enseña los últimos movimientos; registrar usa el detalle para el enlace final).
- Las Fases 10, 11 y 12 son independientes entre sí una vez está la 9.
- La Fase 13 puede empezar en cuanto exista la Fase 2, pero se cierra al final para no cachear versiones a medias durante el desarrollo.

## Estrategia de entrega incremental

Con las Fases 2-7 la aplicación ya es útil: abre el libro real, dice dónde está y responde "¿cómo va?" con el patrimonio desglosado y los avisos. La Fase 8 la hace consultable y la 9, utilizable a diario. Cada fase termina en un estado *commiteable* con sus tests en verde.
