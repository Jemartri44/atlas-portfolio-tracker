# Prompt 007 — Feature `007-web-analytics`

> Copia este texto íntegro al asistente implementador, o indícale que lea `docs/prompts/007-web-analytics.md`. Parte de `develop` con las Fases 1, 2 y 3 y la primera mitad de la web (006) fusionadas.

---

Eres el asistente implementador del proyecto **Atlas Portfolio Tracker** (`~/projects/atlas-portfolio-tracker`). Vas a construir **la segunda mitad de la aplicación web**: las pantallas que responden a las preguntas que hoy solo contesta la CLI —"¿cómo reparto la aportación de este mes?", "¿cómo va el cubo?"— más las **gráficas**, los **asistentes** que la 006 dejó fuera, y una pasada de **calidad** sobre lo que ya existe.

La 006 entregó el esqueleto, el almacenamiento, la navegación, el modo privacidad, Resumen, Movimientos y Ajustes. Los dos destinos de la barra inferior marcados como reservados (**Núcleo** y **Cubo**) son tuyos.

El usuario usa esto **desde el teléfono, a diario**. Lo repito porque es la restricción que más decisiones condiciona: si algo solo se entiende en un monitor, está mal hecho.

## 1. Lee antes de hacer nada, en este orden

1. `CLAUDE.md` entero, en especial *Portfolio nomenclature*, *Domain traps*, *Design principles* y *Working on a feature*.
2. `.specify/memory/constitution.md`: **II** (ningún cálculo fiscal depende de precios), **III** (compartimentación y sus **dos** excepciones, ambas acotadas), **V** (fallo seguro: nunca interpolar ni estimar en silencio), VI (pocas dependencias).
3. **ADR-0016** (`asOf`), **ADR-0017** (*stack*, incluido lo que dice de uPlot y de los gestos), **ADR-0019** (local-first). Después ADR-0015 (proyección degradada) y ADR-0010 (modelo de traspasos).
4. `docs/specification.md` §6 (funcionalidad por libro) y §9.6 (frontend); `docs/business-rules.md` §2, §3 y §4 (pesos, aportación, cubo); `docs/data-schema.md` §6.
5. **La feature 006 entera**: `apps/web/src/` completo, `specs/006-web-shell/` (sobre todo `contracts/domain.md` y `questions.md`, que te ahorran preguntas ya respondidas) y `docs/prompts/006-web-shell.md` con sus doce decisiones fijadas — **siguen vigentes todas**.
6. El dominio que vas a consumir: `coreWeights`, `contributionPlan`, `simulateTransfer`, `costSummary`, `bucketPositions`, `bucketTheses`, `bucketStats`, `theses`, `netWorth`, `valuations`, `pendingOrders`, `pendingTransfers`, `priceAt`, `manualPrices`.
7. `apps/cli/src/commands/{portfolio,bucket,tracking,thesis,corporate-actions}.ts`: la referencia de **qué** muestra cada vista y con qué números. La web enseña lo mismo con otra piel.

Si algo es ambiguo o contradictorio, **no lo resuelvas**: anótalo en `specs/007-web-analytics/questions.md` y avisa. Nada fiscal ni estructural se decide aquí.

## 2. Flujo de trabajo

1. Worktree separado, rama desde `develop` **actualizado**:
   ```bash
   cd ~/projects/atlas-portfolio-tracker && git fetch origin && git worktree add ../atlas-portfolio-tracker-007 -b feature/007-web-analytics origin/develop
   cd ../atlas-portfolio-tracker-007 && git config core.hooksPath .githooks && nvm use && npm ci
   ```
2. Spec Kit: `/speckit-specify` → `/speckit-clarify` si hace falta → `/speckit-plan` → `/speckit-tasks`, artefactos en `specs/007-web-analytics/` (español, identificadores en inglés). **Enseña `spec.md` y `plan.md` y espera el visto bueno antes de escribir código.**
3. `/speckit-implement` por tareas, commits atómicos, Conventional Commits en inglés.
4. Sin PR: la dirección sube y fusiona tras revisar.

## 2 bis. Reglas de operación

Las de `CLAUDE.md` § *Working on a feature* y las del prompt 006 §2 bis, íntegras. Para esta feature, además:

- **`npm run lint` como último paso antes de entregar, siempre.** Dos features seguidas llegaron a la dirección con el lint roto después de que el implementador dijera "limpio". No es una formalidad: es la tercera vez que se pide.
- **Ni una regla de negocio en la web** (decisión (c) de la 006). Si un número no sale del dominio, va al dominio o es una pregunta; nunca un cálculo en un componente.
- **Sin dependencias fuera de ADR-0017**, con la excepción autorizada de §6(h).
- **Nada de directivas `use:`** (ADR-0017).
- Español en la interfaz, inglés en el código.

## 3. Alcance

### 3.0 Una regla nueva en el dominio: el traspaso que se retrasa

`Settings.transfer_max_days` existe desde la Fase 1 y **nadie lo consume**. Un traspaso entre fondos tarda días en completarse y el que se queda colgado es exactamente el que hay que perseguir.

Añade en el dominio —no en la web— el aviso de **solicitud de traspaso abierta durante más de `transfer_max_days`**, junto a los avisos que ya existen, con su tipo en el catálogo, su test y su traducción en **las dos** interfaces (decisión (i) de la 006: cada interfaz tiene su catálogo y un test anti-deriva falla si aparece un código sin traducir). Los días se cuentan **hasta la fecha de la consulta** (`asOf`), no hasta hoy: consultar el 30/06/2027 tiene que decir lo que se sabía ese día. La CLI lo muestra igual que la web.

### 3.1 Pantalla **Núcleo**

La respuesta a "¿dónde va el dinero este mes?". Todo con `asOf` (§6(a)).

- **Pesos y desviaciones**: peso actual de cada clase (`equity`, `fixed_income`, `gold`, `crypto`) frente a su objetivo, la desviación en puntos porcentuales, y la marca cuando pasa el umbral o cuando un satélite baja del mínimo. Con parcialidad visible si falta algún precio: **"sin dato", nunca un cero** (constitución V).
- **Calculadora de aportación**: el reparto que propone `contributionPlan`, con su desglose por clase y la parte que se lleva el cubo como **presupuesto**, no como asignación. Deja claro que es **una propuesta**: las órdenes las pone el usuario a mano en la plataforma y luego las registra.
- **Simulador de traspaso**: `simulateTransfer` con su resultado antes/después. Es el que evita el error caro de tratar un traspaso como venta más compra.
- **Costes**: `costSummary`, con las comisiones que suman al coste de adquisición separadas de las que no son deducibles (`business-rules.md`).
- **Selector de fecha** visible, con "hoy" por defecto.

### 3.2 Pantalla **Cubo**

La respuesta a "¿qué tal va el cubo?", y **nunca mezclada con el núcleo** (constitución III).

- **Posiciones abiertas** con su plusvalía latente y su peso dentro del cubo.
- **Tesis frente al índice**: cada tesis con su resultado comparado con el índice de referencia en el mismo periodo. Cuidado con la definición, que ya se equivocó una vez: el término latente es la **plusvalía latente** (valor menos coste), **no** el valor de la posición; si no, una tesis que rinde exactamente como el índice sale con una diferencia igual a lo invertido en vez de cero. Está en `bucketTheses` y hay tests: consúmelo, no lo recalcules.
- **Estadísticas de operativa** (`bucketStats`): aciertos, fallos, duración media, lo que ya calcula el dominio.
- **Presupuesto del cubo**: cuánto se ha aportado acumulado frente al máximo, y el peso del cubo sobre el patrimonio total (regla 18). Es una de las **dos** excepciones a la compartimentación y va **etiquetada como tal**, con el desglose siempre a la vista.
- **Avisos del cubo**: parada por pérdidas, peso máximo, aportación acumulada.

### 3.3 Gráficas (uPlot)

Vendoriza **uPlot 1.6.32** en `apps/web/vendor/` con su `LICENSE` y su `VENDOR.md`, igual que se hizo con Pico (ADR-0017).

Tres gráficas, ni una más:

1. **Evolución del patrimonio** en el tiempo, desglosado por libro (núcleo / cubo / efectivo), nunca una línea única agregada.
2. **Distribución del núcleo** frente al objetivo. El dónut SVG propio de ADR-0017 sirve; una barra apilada comparativa también, y en móvil probablemente se lee mejor. Justifica la elección en `plan.md`.
3. **Tesis frente al índice** en el tiempo, en la pantalla del cubo.

Reglas que no son negociables:

- **Rango por botones** (1M / 1A / 5A / Todo), **nunca gestos de pinza**: uPlot no los tiene (ADR-0017).
- **Las series salen del dominio**, no de un bucle en el componente. Si hace falta una proyección que devuelva una serie temporal, se añade al dominio con sus tests.
- **Donde no hay precio, hay hueco.** No se interpola, no se arrastra un valor inventado, no se dibuja una línea recta entre dos puntos lejanos como si fuera información. Un tramo sin datos se ve como tramo sin datos y se dice por qué (constitución V, *Design principles*). Esta es la trampa de esta feature: los precios son manuales y por tanto dispersos.
- **Ningún número fiscal sale de una gráfica.** Las gráficas son informativas (constitución II).
- Accesibles: no dependen del color (decisión (f) de la 006), tienen alternativa textual o tabla equivalente, y respetan `prefers-reduced-motion`.
- **Mide el coste**: cuánto pesa uPlot en el *bundle* y cuánto tarda la serie más larga del libro sintético. Anótalo en `plan.md`.

### 3.4 Los asistentes que faltan

La 006 dejó fuera, y entran aquí, los formularios de **eventos corporativos**, **traspasos** y **tesis**, con el mismo patrón que ya existe en `routes/registrar/`: validación del dominio, vista previa del efecto antes de escribir, aviso de huella repetida.

Los eventos corporativos son la parte delicada: son transacciones de primera clase con su lógica de transformación de lotes (`data-schema.md` §6). **La web no implementa ninguna de esas transformaciones**: invoca las del dominio y enseña el resultado. Todo evento corporativo conserva su **fuente documental** (URL o PDF del emisor): el formulario la pide y no la trata como opcional.

### 3.5 Calidad del frontend (el usuario lo ha pedido expresamente)

No es un apartado de cortesía. El encargo literal es que el frontend **no se convierta en una cantidad ingente de código mal escrito**, que sea sencillo cambiarlo más adelante, y que se refactorice en vez de acumular.

- **Ningún fichero de `apps/web/src` por encima de ~250 líneas** sin una razón escrita. Hoy la media es de unas 120; el que se pase, se parte: la lógica de presentación a `view-models/` (donde se prueba como funciones puras, sin DOM) y los bloques repetidos a `components/`.
- **Antes de crear un componente, busca si ya existe uno.** El repertorio actual (`Amount`, `Callout`, `Dialog`, `Field`, `Figure`) cubre más de lo que parece. Un primo hermano de un componente existente es deuda, no reutilización.
- **Estilos**: todo sale de los *tokens* de `styles/`. Cero valores mágicos, cero colores a mano, cero tamaños fuera de la escala. Si te falta un escalón, se añade al *token* y se documenta; no se pone un `14px` suelto.
- **Las tablas de las tres pantallas nuevas comparten componente** con las que ya existen. Si las de Movimientos no dan de sí, se generalizan; no se copian.
- Al terminar, incluye en el informe **las cifras**: líneas por paquete, fichero más largo, componentes nuevos frente a reutilizados.

### 3.6 UX fluida (el usuario lo ha pedido expresamente)

- **Ninguna pantalla en blanco y ningún salto de maquetación.** Mientras se carga o se proyecta, hay un esqueleto del tamaño correcto; cuando llegan los datos, no se mueve nada de sitio.
- **Ninguna interacción que se sienta trabada.** Cambiar la fecha, filtrar o cambiar el rango de una gráfica responde de inmediato. Si una operación pasa de ~100 ms, lo dice; si pasa de un segundo, se puede cancelar.
- **El arranque no compite consigo mismo.** La 006 tuvo una carrera entre la ruta perezosa y la restauración del libro recordado, visible solo en dispositivos lentos. Verifica el arranque con la CPU frenada ×4 y ×10 antes de dar esto por terminado.
- **La navegación atrás del teléfono hace lo que el usuario espera**, incluidos los diálogos y los formularios a medias.
- Mide con el libro sintético y anota los números en `plan.md`. Si algo tarda, se dice; no se esconde.

### 3.7 Manejo de errores (el usuario lo ha pedido expresamente)

En `specs/006-web-shell/questions.md` hay un **inventario de sitios donde un fallo deja la pantalla muda o a medias**, levantado por la ronda de pulido anterior. Es tu punto de partida: léelo y **resuélvelo**.

El criterio, para lo de la lista y para lo que encuentres tú:

- Todo error que pueda ver el usuario **dice qué ha pasado y qué puede hacer**, en español, sin jerga y sin volcados. Un código técnico puede ir detrás, plegado.
- **Siempre se puede salir sin recargar.** Un error deja la aplicación utilizable, no muerta.
- **Fallo seguro**: ante la duda, no se escribe. Un `append` que falla a medias no puede dejar el libro en un estado que la CLI no sepa leer.
- **Nada de tragar excepciones en silencio.** Un `catch` vacío es un defecto.
- **No inventes una capa nueva**: la aplicación ya tiene `toAppError` y su catálogo de mensajes. Se extiende, no se sustituye.
- Los casos que importan, **con test**: almacenamiento lleno o bloqueado, fichero que no es un libro, libro con líneas inválidas, permiso de fichero revocado, conflicto de etag porque la CLI escribió mientras, ruta inexistente.

## 4. Fuera de alcance

Autenticación (no hay servidor: ADR-0019); API, Lambda, S3, Cognito y cualquier cosa de AWS; sincronización entre dispositivos; precios automáticos; importadores de extractos; **la pantalla fiscal** (es la Fase 5 y tiene su propia feature); cualquier cambio del esquema del libro; cualquier ADR nuevo (puedes proponerlo, no aceptarlo).

## 5. Criterios de terminado

- `lint`, `typecheck`, `test`, `build` y CI en verde; `npm run clean && npm run build` desde cero; `packages/domain` sigue al 100 % de líneas y ramas.
- **Comprobado en un navegador de verdad**, no solo en tests: a **400×890 con `deviceScaleFactor: 3`** (el teléfono del usuario es un Xiaomi Mi 15) y además a 360, 768, 1024 y 1280. Sin desplazamiento horizontal en ninguna, objetivos táctiles a tamaño, y las tres gráficas legibles en vertical. Hay Chromium de Playwright en `~/.cache/ms-playwright/`: condúcelo **desde tu scratchpad**, nunca metas Playwright en el `package.json` del repositorio.
- Los números de Núcleo y Cubo **coinciden con los de la CLI** sobre el mismo libro y la misma fecha. Compruébalo con el libro sintético y **anota la comparación**: es la prueba de que no se ha colado una regla de negocio en la web.
- Arranque verificado con CPU ×4 y ×10.
- El inventario de errores de la 006, resuelto o explicado uno por uno.
- `docs/` sin cambios (si algo no encaja, es una pregunta).
- `specs/007-web-analytics/questions.md` con lo preguntado y las notas de implementación.

## 6. Decisiones fijadas por este prompt

- **(a) Toda vista con fecha corta el libro entero por esa fecha** (ADR-0016): **las cantidades también**, no solo los precios. Se dice así de explícito porque la redacción imprecisa de un prompt anterior ("cantidad agregada entre cuentas", sin "a la fecha") produjo el defecto bloqueante de la 004: las vistas tomaban cantidades del final del libro mientras la fecha solo elegía precios. Los avisos y las estadísticas también se cortan.
- **(b) El núcleo y el cubo no se mezclan nunca** (constitución III). Las **dos** excepciones —el total fiscal, y el patrimonio total con el peso del cubo sobre él— son las únicas, van **etiquetadas** y siempre con el desglose a la vista. El cubo es un **presupuesto**, jamás una asignación dentro de los pesos objetivo.
- **(c) `transfer_max_days` se consume en el dominio**, no en la web: es una regla de negocio nueva, con su aviso, su test y su traducción en las dos interfaces. Contada hasta la fecha de la consulta, no hasta hoy.
- **(d) Las gráficas son informativas.** Ningún número fiscal ni ninguna decisión sale de una gráfica (constitución II). Donde no hay precio hay hueco: **no se interpola nunca** (constitución V).
- **(e) uPlot se vendoriza** con su `LICENSE` y su `VENDOR.md`, y el rango se elige con botones porque uPlot no tiene gestos (ADR-0017).
- **(f) Las series temporales las calcula el dominio**, con tests, no un bucle en un componente.
- **(g) Techo de ~250 líneas por fichero en `apps/web/src`** sin razón escrita, y componentes reutilizados antes que clonados. El usuario ha pedido expresamente que esto no se convierta en código difícil de cambiar.
- **(h) `happy-dom` queda autorizado** para esta feature, y solo él. La 006 se hizo sin entorno de DOM y funcionó (decisión (k)), pero las gráficas y los asistentes nuevos tienen comportamiento que no se prueba bien desde el grafo de importaciones. Se añade a `docs/dependencies.md` como dependencia **de desarrollo** con su justificación. Ninguna otra dependencia entra sin preguntar.
- **(i) El manejo de errores se extiende, no se reinventa**: `toAppError` y su catálogo ya existen. Un `catch` vacío es un defecto, y todo error visible dice qué pasó y cómo salir.
- **(j) Las doce decisiones del prompt 006 siguen vigentes** y no se reabren, en particular: ni una regla de negocio en la web, un único componente `Amount` para todo importe y toda cantidad, una sola navegación, y el color nunca como único portador de significado.
