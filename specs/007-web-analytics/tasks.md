# Tareas — feature `007-web-analytics`

Derivadas de [`spec.md`](spec.md), [`plan.md`](plan.md) y [`contracts/domain.md`](contracts/domain.md), con las once respuestas de [`questions.md`](questions.md) ya incorporadas.

Orden por dependencia: **el dominio primero** (nadie puede consumir lo que no existe), después la CLI (que es el patrón de referencia contra el que se compara la web), después los cimientos de la web, después las pantallas, y al final las dos pasadas transversales y la verificación.

`[P]` = se puede hacer en paralelo con la anterior. Cada tarea es un commit atómico.

---

## B0 — Dominio

- **T001** `transferWatch(state, at, settings)` en `projections/pending.ts`: envuelve `pendingTransfers`, marca `overdue` con `days_open > transfer_max_days` y emite `transfer_overdue` por solicitud vencida. Sin el parámetro configurado, `overdue` ausente y `warnings` vacío. La etapa `redeemed` cuenta. Export en `index.ts`.
- **T002** Tests de T001 al 100 %: vencido, en plazo, **justo en el límite** (`days_open === max_days` → no avisa), sin configurar, etapa `redeemed`, etapa `subscribed`, solicitud completada y cancelada (no aparecen), y la misma solicitud a dos fechas distintas.
- **T003** `projections/series.ts`: `netWorthSeries(events, options)`. Fechas por defecto = las de `valuation` del libro dentro del rango más `to`; una proyección con `asOf` por punto; `settingsAt` por punto. **Un bloque solo existe si todos sus componentes tienen precio**; nunca un total parcial. `missing` por bloque. `max_points` con muestreo uniforme que conserva primero y último.
- **T004** [P] `bucketIndexSeries(events, options)` en el mismo fichero: consume `bucketTheses` en cada fecha y agrega `result`, `benchmark_equivalent` y `vs_index`; si una sola tesis no se puede comparar, el punto queda ausente.
- **T005** Tests de T003 y T004 al 100 %: punto completo, parcial por núcleo, por cubo, por efectivo, rango vacío, una sola fecha, `from` posterior a `to`, tope de puntos, libro vacío, y la comprobación de que un punto de la serie **es igual** a `netWorth` a esa fecha.
- **T006** `projections/corporate-action-draft.ts`: `corporateActionDraft(state, events, params)` con las nueve variantes y el cálculo de picos (`posición − ⌊posición⌋` por cuenta), trasladado de `apps/cli/src/commands/corporate-actions.ts` **sin cambiar comportamiento**. Export en `index.ts`.
- **T007** Tests de T006 al 100 %: las nueve variantes, contrasplit con picos **en dos cuentas**, contrasplit sin picos, `source_document` ausente (rechazo), parámetros que no bastan para el `kind` (rechazo con el mismo código que hoy), y que la secuencia producida pasa `checkEffectsAgainstKind`.
- **T008** `costSummary` gana el bloque **agregado** de comisiones sueltas (`standalone_fee`), con su total en euros y la cuenta a la que se cargaron. **Sin clasificar por tipo** (el `fee_kind` llega con la 008). Respeta `asOf`, los eventos anulados y los inválidos, como el resto del acumulador.
- **T009** Tests de T008 al 100 %: con y sin comisiones sueltas, en divisa, anulada, inválida, y cortada por `asOf`.
- **T010** `npm run test:coverage` en verde: `packages/domain` al 100 % de líneas y ramas.

## B1 — CLI

- **T011** `atlas transfer pending` gana `--date`, proyecta con `asOf`, consume `transferWatch`, marca la fila vencida y saca el bloque de avisos al pie.
- **T012** `atlas order list` gana `--date`, proyecta con `asOf` y **deja de falsear `days_open` a 0** con `--all` (Q3).
- **T013** `apps/cli/src/output/messages.ts`: `case "transfer_overdue"`. El test anti-deriva pasa a verde.
- **T014** `atlas ca …` pasa a consumir `corporateActionDraft`; los nueve asistentes se quedan en el mapeo de banderas a `CorporateActionParams`. **Los tests actuales de la CLI no se tocan**: son el guardián de que el comportamiento no se mueve.
- **T015** `atlas costs` imprime el bloque de comisiones sueltas, etiquetado como que no forman parte del coste de adquisición.
- **T016** [P] `atlas thesis list` redondea a céntimos `invertido`, `resultado` y `previsto`, como `atlas bucket` (nota 6 de `questions.md`).

## B2 — Cimientos de la web

- **T017** Vendorizar uPlot 1.6.32 en `apps/web/vendor/uplot/` (`uPlot.esm.js`, `uPlot.d.ts`, `uPlot.min.css`, `LICENSE`, `VENDOR.md` con origen, versión, hash y licencia).
- **T018** `scripts/check-bundle.mjs`: **arregla lo que mide**. Dos presupuestos, arranque (lo que `index.html` precarga) **≤ 80 KB gzip** y total **≤ 150 KB gzip**, ambos impresos.
- **T019** [P] `happy-dom` como dependencia de desarrollo; proyecto `web` de Vitest con entorno de DOM. Sin `@solidjs/testing-library`.
- **T020** `components/DataTable.tsx`: columnas (`key`, `header`, `align`, `render`, `priority`) y filas; tarjeta bajo 1024 px y tabla densa desde ahí. `MovementList` pasa a usarlo, con sus tests actuales como red.
- **T021** [P] `components/ErrorView.tsx`: pinta un `AppError` con su mensaje, **su acción** y el código técnico plegado. `RequireLedger` pasa a usarlo.
- **T022** [P] `components/AsOfPicker.tsx`: selector de fecha con «hoy» por defecto y la fecha en la URL (`?fecha=`).
- **T023** `components/chart/`: `Chart.tsx` (envoltorio de uPlot, ciclo de vida en un único `createEffect`, sin `use:`, tema y `prefers-reduced-motion`), `RangeButtons.tsx`, `ChartTable.tsx` (la alternativa textual, con `Amount`) y `axis.ts` (formateo y enmascarado del eje).
- **T024** `tests/architecture.test.ts`: `axis.ts` entra en la lista de consumidores autorizados de `format/money.ts` **con su motivo escrito**; las clases de `uPlot.min.css` entran en el conjunto de clases declaradas.
- **T025** Test con `happy-dom`: la gráfica renderizada **con la privacidad puesta no deja ninguna cifra absoluta a la vista**, ni en el eje ni en el *tooltip* (condición de Q5).

## B3 — Pantalla Núcleo

- **T026** `view-models/core.ts`: filas de pesos, de la calculadora, de la simulación y de costes, como funciones puras; el rechazo del dominio se convierte en un estado explicable, no en una excepción que sube.
- **T027** Tests de T026 sin DOM, incluido el caso de **dos fechas distintas** que fija que las cantidades salen de la proyección cortada (defensa contra el defecto de la 004).
- **T028** `routes/nucleo/`: `index.tsx`, `WeightsCard`, `ContributionCard`, `TransferCard`, `CostsCard`. Ruta `/nucleo` sustituye al marcador `reservado`.
- **T029** Comparación cifra a cifra con `atlas weights`, `atlas contribute` y `atlas costs` en **dos** fechas (una completa y una parcial), anotada.

## B4 — Pantalla Cubo

- **T030** `view-models/bucket.ts`: posiciones (con su peso dentro del cubo), tesis frente al índice, estadísticas y control de presupuesto, puras.
- **T031** Tests de T030 sin DOM, incluido que el término latente es la **plusvalía latente** y no el valor de la posición.
- **T032** `routes/cubo/`: `index.tsx`, `PositionsCard`, `ThesesCard`, `StatsCard`, `BudgetCard`. Aviso de parada arriba del todo; el peso sobre el patrimonio total **etiquetado como excepción** con el desglose a la vista.
- **T033** Comparación cifra a cifra con `atlas bucket` y `atlas thesis list` en dos fechas, anotada.

## B5 — Las tres gráficas

- **T034** `view-models/series.ts`: de la serie del dominio a lo que uPlot come, con los huecos como `null` y el texto de «faltan N puntos porque…».
- **T035** Gráfica 1, evolución del patrimonio: tres series (núcleo, cubo, efectivo), `spanGaps` desactivado, botones de rango que filtran puntos ya calculados.
- **T036** Gráfica 2, distribución del núcleo frente al objetivo: **se dibujan el dónut y la barra apilada, se miran a 400×890 DPR 3 y se fija la elección**, anotando cuál gana y por qué.
- **T037** Gráfica 3, cubo frente al índice: curva agregada más la tabla por tesis debajo.
- **T038** Accesibilidad de las tres: alternativa textual, sin depender del color, `prefers-reduced-motion`, y botones de rango sin puntos deshabilitados con su motivo.

## B6 — Los asistentes que faltan

- **T039** `FORM_SPECS` de traspaso: `transfer_requested`, `transfer_request_updated`, `transfer`; y listas de opciones nuevas en `view-models/options.ts` (solicitudes abiertas).
- **T040** [P] `FORM_SPECS` de tesis: `thesis_opened`, `thesis_closed`; la compra del cubo sin tesis enlaza **a crear la tesis**, no a la CLI.
- **T041** Formulario de evento corporativo: elección de tipo y una especificación de campos planos por `kind`, que se traduce a `CorporateActionParams` y se envía a `corporateActionDraft`. `source_document` **obligatorio**. La web no compone `effects`.
- **T042** `/registrar` deja de decir que estos tres se registran solo desde la CLI.
- **T043** Tests de escritura de los tres, sobre la capa de acciones, **comprobando los bytes del fichero**.

## B7 — Calidad del frontend

- **T044** Test del techo de líneas: todo `.ts`/`.tsx` de `apps/web/src` por encima de 250 líneas necesita un marcador con su razón en la cabecera.
- **T045** Partir de verdad `routes/registrar/EventForm.tsx` y `routes/movimientos/detail.tsx` (la lógica de presentación baja a `view-models/`).
- **T046** Razón escrita en los que son tablas de datos (`forms/specs.ts`, `view-models/settings.ts`) y en las hojas de estilo; partir o razonar `ledger/actions.ts` y `view-models/detail.ts`.
- **T047** Cifras finales para el informe: líneas por paquete, fichero más largo, componentes nuevos frente a reutilizados.

## B8 — Manejo de errores

- **T048** La importación **valida antes de abrir nada**: un fichero que no es un libro deja el estado anterior intacto (punto 1 del inventario V6).
- **T049** La fase `failed` se pinta en `/libro` mientras dure (punto 2).
- **T050** Catálogo español de los **diez hallazgos de integridad**, con su entrada en el test anti-deriva (punto 3, Q11).
- **T051** `ErrorView` en todas las pantallas que escriben (`configuracion`, `EventForm`): dejan de tirar `failure.error.action`.
- **T052** «Valor por defecto» de la fecha fiscal por tipo de activo **quita** la clave del mapa (Q10), con su test.
- **T053** Barrido: ningún `catch` vacío en `apps/web/src`, comprobado por test.
- **T054** Tests de los casos que importan: almacenamiento lleno, almacenamiento bloqueado, fichero que no es un libro, libro con líneas inválidas, conflicto de etag, ruta inexistente.
- **T055** Tabla del inventario de la 006, fila por fila, con «resuelto» o «explicado y por qué».

## B9 — Verificación

- **T056** Navegador: 320, 360, **400 (DPR 3)**, 768, 1023, 1024 y 1280 px, en todas las rutas, **con la privacidad quitada**, sin desplazamiento horizontal y con los objetivos táctiles a tamaño.
- **T057** Arranque con CPU ×1, ×4 y ×10, sin cambios de ruta intermedios.
- **T058** Navegación atrás con diálogo abierto y con formulario a medias.
- **T059** **Mirar las pantallas con ojos de quien las va a usar**, no solo comprobar que funcionan: nombres en vez de identificadores, jerarquía, densidad, qué se lee primero. Anotar lo que chirríe aunque ningún test lo vea.
- **T060** Mediciones finales en `plan.md`: serie más larga, coste de uPlot, dos cifras del *bundle*, tiempos de cambio de fecha y de rango.
- **T061** `npm run clean && npm run build`, `npm test`, `npm run typecheck` y **`npm run lint` como último paso**.
