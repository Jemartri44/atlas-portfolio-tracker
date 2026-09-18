# Plan de implementación: Núcleo, Cubo, gráficas y los asistentes que faltan (`007-web-analytics`)

**Rama**: `feature/007-web-analytics` · **Spec**: [`spec.md`](spec.md) · **Mediciones**: [`research.md`](research.md) · **Contrato del dominio**: [`contracts/domain.md`](contracts/domain.md) · **Preguntas**: [`questions.md`](questions.md)

---

## Resumen

Se construyen dos pantallas (`/nucleo`, `/cubo`), tres gráficas con uPlot vendorizada, tres asistentes de registro, una regla nueva en el dominio y dos pasadas transversales (calidad y errores).

El plan se apoya en cuatro decisiones estructurales:

1. **Todo lo que es cálculo baja al dominio**: el aviso de plazo de traspaso, las dos series temporales y —hallazgo— la composición de los efectos de un evento corporativo, que hoy vive en `apps/cli`. La web compone y pinta; no decide.
2. **Una sola fuente de fecha por pantalla**: un componente `AsOfPicker` y un memo de proyección por fecha que ya existe (`store.projectionAt`). Ningún bloque proyecta por su cuenta ni lee del *snapshot* base cuando hay fecha elegida. Es la defensa contra el defecto bloqueante de la 004.
3. **Se generaliza antes de añadir**: la lista/tabla de Movimientos se extrae a un componente de datos reutilizable y las tres pantallas nuevas la usan. Un componente nuevo solo si ninguno existente da de sí, y con su motivo escrito.
4. **Las gráficas son una capa fina sobre el dominio**: uPlot solo recibe números ya decididos; qué es un hueco lo decide `netWorthSeries`, no el componente.

---

## Contexto técnico

| | |
|---|---|
| **Lenguaje** | TypeScript 7 estricto, ESM, Node 22 (`.nvmrc`) |
| **Framework** | Solid 1.9.15 fijado, `@solidjs/router` 1.0.0 (ADR-0017). **Ninguna directiva `use:`** |
| **Estilo** | Pico 2.1.1 vendorizada + *tokens* propios; **uPlot 1.6.32 vendorizada** en esta feature |
| **Dominio** | `@atlas/domain` por alias a fuentes; se le añaden cuatro cosas (ver contrato) |
| **Almacenamiento** | Sin cambios: `BlobLedgerStore` sobre carpeta o IndexedDB (ADR-0019) |
| **Tests** | Vitest. Novedad autorizada: **`happy-dom`**, solo desarrollo, solo para la web |
| **Cobertura** | `packages/domain` 100 % líneas y ramas, bloqueante |
| **Verificación visual** | Chromium de `~/.cache/ms-playwright/` conducido desde el *scratchpad* por el protocolo DevTools. **Playwright no entra en el repositorio** |
| **Objetivo de pantalla** | 400×890 con `deviceScaleFactor` 3 (Xiaomi Mi 15), y además 320, 360, 768, 1023, 1024, 1280 |

---

## Verificación contra la constitución

| Principio | Cómo lo cumple este plan |
|---|---|
| **I — el libro es la fuente de verdad** | Ninguna pantalla nueva escribe nada derivado; las series se recalculan del libro en cada consulta y no se guardan |
| **II — los lotes son la unidad; la fiscalidad sale solo del libro** | Las tres gráficas son informativas y no producen ningún número fiscal (FR-030). Las transformaciones de lotes de los eventos corporativos las hace el dominio (FR-033). `series.ts` es una hoja que lee precios, y el test de arquitectura que mantiene `prices.ts` fuera de todo cálculo fiscal lo cubre |
| **III — compartimentación** | Tres series por libro, nunca una agregada (FR-023). Las dos excepciones —patrimonio total y peso del cubo sobre él— van etiquetadas y con desglose a la vista (FR-018). Núcleo y Cubo son dos rutas y dos conjuntos de proyecciones que no se cruzan |
| **IV — nada codificado que deba ser configurable** | El plazo del aviso sale de `transfer_max_days`; sin él, no se evalúa (FR-003). Umbral, mínimo de satélite, importe mensual y porcentaje del cubo se leen de `settingsAt` |
| **V — fallo seguro, nunca silencio** | «sin dato» y nunca cero; hueco y nunca interpolación; regla no evaluada y nunca «dentro de límite»; ningún `catch` vacío; ante la duda no se escribe (FR-007, FR-019, FR-025, FR-046, FR-047) |
| **VI — supervivencia a 20 años** | Una dependencia nueva, de desarrollo (`happy-dom`) y autorizada. uPlot se **vendoriza**: el código que funciona hoy sigue siendo nuestro en 2036. Cero servicios externos |
| **VII — tests donde un error cuesta dinero** | El dominio sigue al 100 %. La comparación cifra a cifra con la CLI sobre el mismo libro es la prueba de que no se ha colado una regla en la web (FR-050) |

**Sin desviaciones que justificar.** Los añadidos que exceden el alcance literal del prompt —mover la composición de eventos corporativos al dominio, el `--date` de `atlas transfer pending` y `atlas order list`, el bloque de comisiones sueltas de `costSummary` y el catálogo español de los hallazgos de integridad— fueron **preguntados y aprobados** el 2026-09-18 (`questions.md`).

---

## Arquitectura de información

### `/nucleo` — «¿dónde va el dinero este mes?»

Orden de lectura en el teléfono, de arriba abajo, pensado para que lo esencial quepa en la primera pantalla:

1. **Cabecera con el selector de fecha** (hoy por defecto) y, si hay parcialidad, una línea que dice qué falta.
2. **Distribución** — el gráfico de reparto frente al objetivo, y debajo su tabla equivalente. Responde «¿estoy desviado?» de un vistazo.
3. **Pesos y desviaciones** — tabla por clase con sus activos dentro (`<details>` por clase en móvil, expandida la que tenga desviación por encima del umbral).
4. **Aportación del mes** — presupuesto del cubo separado y etiquetado, importe del núcleo, reparto por activo, y la frase de que es una propuesta.
5. **Simulador de traspaso** — plegado por defecto: se usa a propósito, no se consulta.
6. **Costes** — comisiones por activo, TER ponderado y coste anual, con la separación de lo que suma al coste de adquisición.
7. **Evolución del patrimonio** — la gráfica de tres series. Va al final porque es la que menos decisiones dispara.

### `/cubo` — «¿qué tal va el cubo?»

1. **Cabecera con el selector de fecha**, y el **aviso de la regla de parada arriba del todo** si está activo, como hace `atlas bucket`.
2. **Posiciones abiertas** — cantidad, coste medio, precio y antigüedad, valor, plusvalía latente (€ y %), peso dentro del cubo, y la tesis con sus días, su plazo y su condición de invalidación.
3. **Tesis frente al índice** — tabla, y la gráfica de la evolución del agregado frente al índice.
4. **Estadísticas de operativa** — con las comisiones sobre capital operado **arriba** de las demás, como en la CLI: es la métrica más reveladora del panel (regla 14).
5. **Presupuesto y control** — aporte acumulado frente al máximo, y el peso del cubo sobre el patrimonio total **etiquetado como excepción** con el desglose núcleo/cubo/efectivo a la vista.

### Rutas nuevas

| Ruta | Pantalla |
|---|---|
| `/nucleo` | Núcleo (sustituye al marcador `reservado`) |
| `/cubo` | Cubo (ídem) |
| `/registrar/evento-corporativo` | Elección del tipo de evento corporativo |
| `/registrar/evento-corporativo/:kind` | Formulario del tipo elegido |
| `/registrar/traspaso-solicitud` | Solicitud de traspaso |
| `/registrar/traspaso-etapa` | Etapa de una solicitud |
| `/registrar/traspaso` | El traspaso contable |
| `/registrar/tesis` | Abrir una tesis |
| `/registrar/tesis-cierre` | Cerrar una tesis |

La fecha de Núcleo y Cubo vive en la **URL** (`?fecha=YYYY-MM-DD`), como ya hacen los filtros de Movimientos: recargar la conserva y el botón atrás deshace el último cambio en vez de salir de la sección (FR-043).

---

## Estructura del proyecto

### Documentación de la feature

```
specs/007-web-analytics/
├── spec.md              qué y por qué
├── plan.md              este documento
├── research.md          las mediciones, todas hechas aquí
├── questions.md         lo que no decido yo
├── contracts/domain.md  los cuatro añadidos al dominio
├── data-model.md        (tras el visto bueno)
├── quickstart.md        (tras el visto bueno)
└── tasks.md             (tras el visto bueno)
```

### Código

```
packages/domain/src/
├── projections/pending.ts              + transferWatch (aviso de plazo)
├── projections/series.ts               NUEVO  netWorthSeries, bucketIndexSeries
└── projections/corporate-action-draft.ts  NUEVO  composición de efectos (Q4)

apps/cli/src/
├── commands/tracking.ts                transfer pending gana --date y el aviso
├── commands/corporate-actions.ts       pasa a consumir corporateActionDraft (Q4)
└── output/messages.ts                  + case "transfer_overdue"

apps/web/vendor/uplot/
├── uPlot.esm.js  uPlot.d.ts  uPlot.min.css  LICENSE  VENDOR.md

apps/web/src/
├── routes/nucleo/
│   ├── index.tsx           composición y fecha           (~90)
│   ├── WeightsCard.tsx     pesos y desviaciones          (~110)
│   ├── ContributionCard.tsx calculadora                  (~120)
│   ├── TransferCard.tsx    simulador                     (~130)
│   └── CostsCard.tsx       costes                        (~100)
├── routes/cubo/
│   ├── index.tsx           composición y fecha           (~90)
│   ├── PositionsCard.tsx   posiciones abiertas           (~110)
│   ├── ThesesCard.tsx      tesis frente al índice        (~110)
│   ├── StatsCard.tsx       estadísticas                  (~90)
│   └── BudgetCard.tsx      presupuesto y control         (~110)
├── routes/registrar/
│   ├── corporate/index.tsx  elección de tipo             (~70)
│   └── corporate/form.tsx   formulario por tipo          (~140)
├── components/
│   ├── DataTable.tsx       NUEVO  tarjeta en móvil + tabla en ancho, una fuente de filas
│   ├── ErrorView.tsx       NUEVO  pinta un AppError **con su acción** (inventario V6)
│   ├── AsOfPicker.tsx      NUEVO  el selector de fecha, con «hoy» y la fecha en la URL
│   └── chart/
│       ├── Chart.tsx       NUEVO  envoltorio de uPlot: ciclo de vida, tamaño, tema, reduced-motion
│       ├── RangeButtons.tsx NUEVO 1M / 1A / 5A / Todo
│       ├── ChartTable.tsx  NUEVO  la alternativa textual, con Amount
│       └── axis.ts         NUEVO  formateo y enmascarado del eje (Q5)
├── view-models/
│   ├── core.ts             NUEVO  filas de pesos, de aportación, de simulación y de costes
│   ├── bucket.ts           NUEVO  filas de posiciones, tesis, estadísticas y control
│   ├── series.ts           NUEVO  de la serie del dominio a lo que uPlot come, huecos incluidos
│   └── forms/specs.ts      + las especificaciones de traspaso y tesis
└── styles/components.css   + lo de las gráficas y la tabla genérica
```

Cifras de partida, medidas: `apps/web/src` tiene **59 ficheros y 7.171 líneas** de `.ts`/`.tsx` (media 121), más 1.443 de CSS. **Seis ficheros pasan hoy de 250 líneas** y entran en la pasada de calidad: `forms/specs.ts` (448), `ledger/actions.ts` (320), `movimientos/detail.tsx` (294), `registrar/EventForm.tsx` (289), `view-models/settings.ts` (268), `view-models/detail.ts` (263).

---

## Decisiones de diseño

**D1 — Una proyección por fecha, compartida.** `store.projectionAt(date)` ya memoiza por `(etag, fecha)`. Núcleo y Cubo la usan y **todos** sus bloques leen de ella. Ningún bloque toca `snapshot.state` cuando hay fecha elegida: ese fue el defecto bloqueante de la 004 y se evita por construcción, con un test del *view-model* que compara «lo que pinta la pantalla» contra `atlas weights --date` en dos fechas distintas.

**D2 — Los *view-models* son funciones puras y ahí vive todo lo que se puede probar sin DOM.** Un componente recibe filas ya decididas (etiqueta, valor, marca, motivo de la ausencia) y solo las coloca. Es lo que mantiene los ficheros por debajo de 250 líneas sin trocear artificialmente.

**D3 — `DataTable` en vez de un cuarto par tarjeta/tabla.** Movimientos tiene hoy el patrón «tarjetas hasta 1023 px, tabla densa desde 1024» escrito a mano en `MovementList.tsx`. Se extrae a un componente que recibe columnas (`{ key, header, align, render, priority }`) y filas, y decide qué columnas caben en la tarjeta. `MovementList` pasa a usarlo, con sus tests actuales como red. Las tres tablas nuevas lo usan. *Alternativa descartada*: copiar el patrón tres veces, que es el «primo hermano» que el prompt prohíbe.

**D4 — Los pesos y el reparto se dibujan como barra apilada comparativa, no como dónut.** El prompt §3.3 deja elegir entre el dónut SVG que previó ADR-0017 y una barra apilada comparativa, y pide justificar la elección. Razón: lo que la pantalla tiene que hacer visible es **la desviación**, y una desviación es una diferencia; en una **barra apilada de dos filas** (actual encima, objetivo debajo, misma escala) la diferencia se lee **como longitud**, alineada, sin comparar ángulos. Además cada tramo puede llevar su etiqueta dentro y no hace falta leyenda, que en un dónut duplica la tabla que ya está debajo. Se dibuja en **SVG propio**, no con uPlot: son dos rectángulos por clase. *Verificación pendiente*: se dibujan las dos formas y se miran en el navegador a 400×890 DPR 3 antes de fijar la elección; si el dónut gana, se cambia y se anota. *Alternativa descartada de entrada*: usar uPlot para esto, que no aporta nada sobre dos rectángulos.

**D5 — uPlot se usa solo para las dos series temporales.** Es lo único que uPlot hace mejor que un SVG a mano. Se carga **dentro de los fragmentos perezosos** de `/nucleo` y `/cubo`, nunca en el arranque: quien abre el Resumen no descarga 21,6 KB de gráficas.

**D6 — El envoltorio de uPlot no usa `use:`** (ADR-0017). El ciclo de vida va en un `createEffect` dentro de `Chart.tsx`, que es uno de los pocos ficheros con efectos, como `main.tsx` y `Dialog.tsx`.

**D7 — Los huecos se pasan a uPlot como `null` y `spanGaps` queda desactivado.** Es el comportamiento nativo de uPlot y coincide exactamente con la regla: donde el dominio no devuelve valor, la línea se corta. Debajo de cada gráfica, una línea de texto dice cuántos puntos faltan y por qué, generada del campo `missing` de la serie.

**D8 — El rango temporal filtra los puntos ya calculados**, no vuelve a proyectar. La serie se calcula una vez para «Todo» y los botones recortan la ventana. Cambiar de rango es entonces una operación de vista y responde muy por debajo de 100 ms (FR-041).

**D9 — Los formularios de traspaso y tesis son `FORM_SPECS` y nada más.** `transfer_requested`, `transfer_request_updated`, `transfer`, `thesis_opened` y `thesis_closed` tienen cuerpo plano y encajan en el modelo declarativo tal cual; solo hacen falta dos listas de opciones nuevas en `view-models/options.ts` (solicitudes abiertas, tesis abiertas para cerrar). Cero componentes nuevos.

**D10 — El formulario de evento corporativo es un `FORM_SPEC` por `kind`, más una traducción a `CorporateActionParams`.** Las nueve variantes de la CLI se describen como nueve especificaciones de campos planos (`ratio`, `to_asset_id`, `cost_share`, los cinco de la liquidación en efectivo), y la web **no compone el array `effects`**: envía los parámetros a `corporateActionDraft` del dominio y muestra lo que devuelve. Si la dirección responde que no a la **Q4**, la alternativa es ofrecer solo los cuatro `kind` cuyo `effects` es un único efecto trivial (`split`, `fund_merger`, `share_class_change`, `delisting`) y dejar el resto en la CLI, diciéndolo en pantalla.

**D11 — El manejo de errores se hace con un componente, no con una capa.** `ErrorView` recibe un `AppError` y pinta mensaje + acción + código plegado (`<details>`). `RequireLedger` pasa a usarlo, y también `EventForm` y la pantalla de configuración, que hoy tiran a la basura `failure.error.action`. Cero conceptos nuevos: `toAppError` y su catálogo se extienden (FR-048).

**D12 — La importación de un fichero deja de abrir un libro antes de validarlo.** Hoy `onImport` llama a `openBrowserLedger()` *antes* de validar, y un fichero malo deja un libro vacío abierto **y recordado**. Se invierte: validar el texto en memoria, y solo si es un libro, abrir y reemplazar. Es el punto más grave del inventario V6 porque es el camino de entrada de un teléfono.

**D13 — `happy-dom` sin librería de *testing*.** Con el entorno de DOM basta `render` de `solid-js/web`, que devuelve su propio `dispose`. Se usa para tres cosas concretas que el grafo de importaciones no ve: que `Chart.tsx` monta y desmonta uPlot sin fugas, que el enmascarado del eje se aplica de verdad, y la prueba de humo del grafo de pantallas que la 006 no pudo hacer (N4 de sus notas). **El test de la puerta de `Amount` sigue siendo el del grafo de importaciones**: es mejor y no se sustituye.

**D14 — El techo de 250 líneas se vigila con un test**, no con buena voluntad: recorre `apps/web/src`, exige que todo `.ts`/`.tsx` de más de 250 líneas lleve un marcador con su razón en la cabecera, y falla si aparece uno sin ella. Es el mismo mecanismo que `NOT_SHOWN` del test de mensajes: la excepción existe, pero está escrita.

---

## Mediciones

Las de partida están en [`research.md`](research.md). Se repiten al terminar y se anotan aquí:

| Qué | Antes (medido) | Después | Criterio |
|---|---|---|---|
| Proyección del libro sintético, en caliente | 1,95 ms | — | informativo |
| Serie mensual de 29 puntos | 56–61 ms | — | < 100 ms (SC-004) |
| Serie más larga del libro sintético | por medir con la serie final | — | se anota pase lo que pase |
| uPlot en el *bundle* | 21,6 KB gzip (medido fuera) | — | se anota (SC-005) |
| *Bundle* de arranque | ~70 KB gzip | — | **techo 80 KB gzip** (Q6); uPlot es perezosa, no debe crecer |
| *Bundle* total | 113,3 KB gzip | — | **techo 150 KB gzip** (Q6); al terminar se fija en lo medido |
| Arranque con CPU ×1 / ×4 / ×10 | `/` en los tres (006) | — | sin cambios de ruta (SC-003) |
| Ficheros de `apps/web/src` > 250 líneas | 6 | 0 sin razón escrita | SC-007 |
| Líneas de `apps/web/src` (`.ts`/`.tsx`) | 7.171 en 59 ficheros | — | se anota |

---

## Verificación

**Automática** (`npm run lint && npm run typecheck && npm test && npm run build`, y `npm run clean && npm run build` desde cero):

- Dominio al 100 % de líneas y ramas, con los casos del aviso de plazo (vencido, en plazo, justo en el límite, sin configurar, etapa `redeemed`), de las series (punto completo, punto parcial por núcleo, por cubo, por efectivo, rango vacío, una sola fecha, tope de puntos) y de la composición de eventos corporativos (las nueve variantes y el contrasplit con picos en dos cuentas).
- Test anti-deriva de mensajes en verde con el código nuevo traducido en las dos interfaces.
- Tests de arquitectura: la puerta de `Amount` con su lista de autorizados ampliada y justificada, sin `node:`, sin `use:`, sin orígenes ajenos, las clases del CSS y del marcado en las dos direcciones (**incluyendo las de uPlot**, cuya hoja vendorizada hay que sumar al conjunto de clases declaradas), y el techo de líneas.
- Comprobador del *bundle*: sin `node:`, sin orígenes ajenos, sin `style=` en línea, y **dos presupuestos** — arranque ≤ 80 KB gzip, total ≤ 150 KB gzip (Q6).
- *View-models* probados como funciones puras, y los flujos de escritura de los tres asistentes nuevos sobre la capa de acciones **comprobando los bytes del fichero**, como la 006.

**En un navegador de verdad** (Chromium del entorno, conducido desde el *scratchpad*):

- Las seis anchuras de SC-002, con la privacidad **quitada**, que es el caso ancho.
- Las tres gráficas en vertical a 400×890 DPR 3.
- Arranque con CPU ×1, ×4 y ×10.
- Navegación atrás con diálogo abierto y con formulario a medias.
- Cada caso del inventario de errores provocado a mano.

**Contra la CLI**: una tabla, anotada en `questions.md`, con cada cifra de Núcleo y Cubo al lado de la de `atlas <comando> --date <fecha>` sobre el mismo libro, en **dos** fechas distintas (una con el núcleo completo y otra parcial).

---

## Riesgos y cómo se cortan

| Riesgo | Corte |
|---|---|
| **La gráfica sale casi vacía** y parece un fallo. Medido: 6 puntos de 29 en el núcleo | La pantalla dice cuántos puntos hay y por qué faltan los demás, y ofrece el enlace a registrar una valoración. Es la verdad del libro, no un defecto — pero tiene que **leerse** como la verdad y no como un error. Q1 |
| **El presupuesto del *bundle* revienta** con uPlot | Medido y puesto por delante (Q6) en vez de descubierto al final. uPlot va solo en los fragmentos perezosos |
| **Una regla de negocio se cuela en la web** al componer los efectos de un evento corporativo | Q4: se mueve al dominio. Si la respuesta es no, se recorta el alcance de la pantalla en vez de duplicar la regla |
| **Repetir el defecto de la 004** (cantidades del final del libro con precios de otra fecha) | D1 más un test que compara dos fechas distintas; ningún bloque recibe `snapshot.state` |
| **El eje de una gráfica se salta el modo privacidad** | Q5 y un test con `happy-dom` que renderiza la gráfica con la privacidad puesta y comprueba que no queda ninguna cifra a la vista |
| **`transfer pending` de la CLI y la web discrepan** por la fecha | El mismo `transferWatch` alimenta a las dos, y la CLI gana `--date` (Q3) |
| **Los ficheros vuelven a crecer** en la siguiente feature | D14: el techo se comprueba en CI, con excepciones escritas |
| **Mover la composición de eventos corporativos rompe la CLI** | Sus tests actuales son el guardián; se mueve sin cambiar comportamiento y se comprueba que la suite de la CLI sigue verde sin tocarla |

---

## Complexity Tracking

Sin desviaciones que justificar. Las cuatro ampliaciones de alcance respecto al prompt se preguntaron antes de aplicarlas y la dirección las aprobó: Q3 (`--date` en las dos vistas de seguimiento), Q4 (composición de eventos corporativos al dominio), Q9 (comisiones sueltas en `costSummary`) y Q11 (catálogo español de los hallazgos de integridad).
