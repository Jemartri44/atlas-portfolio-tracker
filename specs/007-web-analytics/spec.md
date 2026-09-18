# Especificación de la feature: Núcleo, Cubo, gráficas y los asistentes que faltan (`007-web-analytics`)

**Rama**: `feature/007-web-analytics`

**Creada**: 2026-09-18

**Estado**: Borrador — pendiente del visto bueno de la dirección

**Entrada**: `docs/prompts/007-web-analytics.md`

---

## Resumen

La 006 entregó el esqueleto, el almacenamiento local, la navegación, el modo privacidad, Resumen, Movimientos y Ajustes. Faltan las dos pantallas que hoy solo contesta la CLI —**Núcleo** («¿dónde va el dinero este mes?») y **Cubo** («¿qué tal va el cubo?»)—, las **tres gráficas**, los **tres asistentes** que la 006 dejó fuera (eventos corporativos, traspasos, tesis), y dos pasadas transversales que el usuario ha pedido expresamente: **calidad del frontend** y **manejo de errores**.

Además entra **una regla de negocio nueva en el dominio**: el aviso de solicitud de traspaso abierta más de `transfer_max_days`, que existe en `Settings` desde la Fase 1 y **nadie consume**.

El usuario usa esto **desde el teléfono, a diario**. Es la restricción que condiciona todo lo demás.

Cuatro reglas gobiernan la feature entera y aparecen en casi todos los requisitos:

1. **Toda vista con fecha corta el libro entero por esa fecha** (`asOf`, ADR-0016): cantidades, lotes, efectivo, avisos y estadísticas, no solo precios.
2. **Núcleo y cubo no se mezclan nunca** (constitución III), salvo las **dos** excepciones escritas y etiquetadas.
3. **Donde no hay precio hay hueco**, nunca un cero ni una línea recta (constitución V).
4. **Ni una regla de negocio en la web**: si un número no sale del dominio, va al dominio o es una pregunta.

---

## Escenarios de usuario y pruebas *(obligatorio)*

### Historia 1 — Saber dónde va el dinero este mes (Prioridad: P1)

Es principio de mes, el usuario está en el metro con el teléfono y tiene que decidir qué comprar. Abre **Núcleo** y ve el peso real de cada clase frente a su objetivo, la desviación en puntos, y el reparto que propone la calculadora para el importe del mes, con el presupuesto del cubo separado y etiquetado como presupuesto. Da las órdenes a mano en la plataforma y luego vuelve a registrarlas.

**Por qué esta prioridad**: es la pregunta que el usuario se hace cada mes y la única que hoy exige un terminal.

**Prueba independiente**: se abre `/nucleo` con el libro sintético, se compara cada cifra con `atlas weights` y `atlas contribute` a la misma fecha, y coinciden.

**Escenarios de aceptación**:

1. **Dado** un libro con todos los precios del núcleo a la fecha, **cuando** se abre Núcleo, **entonces** cada activo muestra cantidad, precio con su antigüedad, valor, peso, objetivo y desviación en pp, agrupados por clase con su subtotal y el total.
2. **Dado** un activo del núcleo con posición y sin precio a la fecha, **cuando** se abre Núcleo, **entonces** su fila dice «sin precio», los pesos aparecen en blanco (no a cero), el total va marcado *parcial* y la pantalla dice qué falta y dónde se arregla.
3. **Dado** un activo que supera `deviation_threshold_pp`, **cuando** se abre Núcleo, **entonces** su fila lleva una marca que **no** depende solo del color y el aviso explica que rebalancear vendiendo es una decisión anual del usuario (regla 3).
4. **Dado** un importe mensual configurado, **cuando** se abre la calculadora, **entonces** muestra el presupuesto del cubo aparte, el importe a repartir en el núcleo y una fila por activo con déficit, asignación, valor tras y peso tras; la suma de las asignaciones es exactamente el importe del núcleo.
5. **Dado** que la calculadora no se puede calcular (falta un precio, no hay pesos objetivo), **cuando** se abre, **entonces** dice **por qué** y qué hacer, y la pantalla sigue siendo utilizable: el resto de bloques se ven.
6. **Dado** cualquier estado, **cuando** se lee la calculadora, **entonces** deja claro que es **una propuesta** y que nada se ha registrado.

---

### Historia 2 — Simular un traspaso sin equivocarme de concepto (Prioridad: P1)

El usuario quiere mover parte de un fondo a otro. Antes de dar la orden, quiere ver cómo quedan los pesos y confirmar que no genera hecho imponible.

**Por qué esta prioridad**: es el error caro del proyecto (trampa 1 de `CLAUDE.md`). Que la pantalla lo diga cada vez es parte del diseño.

**Prueba independiente**: simular el mismo traspaso en la web y con `atlas transfer simulate` sobre el mismo libro y fecha; las dos tablas coinciden.

**Escenarios de aceptación**:

1. **Dado** dos fondos traspasables del núcleo, **cuando** se indica origen, destino y cantidad (o «todo»), **entonces** se muestran los pesos y las desviaciones **antes y después**, el importe movido y la frase de que un traspaso entre fondos conserva fecha de adquisición y coste y **no** es hecho imponible.
2. **Dado** un origen sin posición suficiente, o un activo no traspasable, o un núcleo parcial, **cuando** se simula, **entonces** el rechazo del dominio se muestra en español diciendo qué falta, sin volcados y sin romper la pantalla.
3. **Dado** cualquier simulación, **entonces** la pantalla dice que **no se ha registrado nada**.

---

### Historia 3 — Ver qué tal va el cubo, medido contra el índice (Prioridad: P1)

El usuario abre **Cubo** y ve sus posiciones abiertas con su plusvalía latente y su peso dentro del cubo, cada tesis frente al índice en el mismo periodo, sus estadísticas de operativa y el control de presupuesto.

**Por qué esta prioridad**: es el libro con más funcionalidad propia (especificación §6.2) y la regla 16 dice que la referencia es el índice, no cero.

**Prueba independiente**: comparar con `atlas bucket` y `atlas thesis list` a la misma fecha.

**Escenarios de aceptación**:

1. **Dado** posiciones abiertas en el cubo, **cuando** se abre Cubo, **entonces** cada fila muestra cantidad, coste medio, precio con antigüedad, valor, plusvalía latente en euros y en porcentaje, **su peso dentro del cubo**, y la tesis con sus días abiertos, su plazo y su condición de invalidación a la vista.
2. **Dado** una tesis con índice de referencia y precios, **cuando** se abre Cubo, **entonces** se muestra su resultado frente al índice **calculado por el dominio** (`result_vs_index_eur`): el término latente es la **plusvalía latente**, nunca el valor de la posición.
3. **Dado** que falta el precio del índice en alguna fecha, **cuando** se abre Cubo, **entonces** la comparación queda **sin dato** y se dice el motivo una vez por causa, no una vez por tesis.
4. **Dado** el control de presupuesto, **cuando** se abre Cubo, **entonces** el aporte acumulado frente al máximo y el **peso del cubo sobre el patrimonio total** aparecen **etiquetados como excepción acotada a la compartimentación**, con el desglose (núcleo / cubo / efectivo) siempre a la vista.
5. **Dado** que una regla de control no se ha podido evaluar, **entonces** se dice que **no se ha podido evaluar**, nunca que está dentro de límite.
6. **Dado** la regla de parada superada, **entonces** el aviso aparece arriba del todo, como en la CLI, y no en un rincón.
7. **En ninguna** pantalla del cubo aparece una cifra del núcleo mezclada, ni al revés.

---

### Historia 4 — Ver la evolución en el tiempo sin que me mientan (Prioridad: P2)

El usuario quiere ver cómo ha evolucionado su patrimonio, cómo está repartido el núcleo frente al objetivo, y cómo van sus tesis frente al índice.

**Por qué esta prioridad**: es informativa (constitución II) y llega después de que los números estén bien; pero es lo que convierte la aplicación en algo que apetece abrir.

**Prueba independiente**: sobre el libro sintético, los puntos de la serie coinciden con `atlas networth --date <fecha>` en cada fecha dibujada, y los tramos sin dato coinciden con las fechas en las que `atlas networth` marca *parcial*.

**Escenarios de aceptación**:

1. **Dado** un libro con precios dispersos, **cuando** se dibuja la evolución del patrimonio, **entonces** hay **tres series** (núcleo, cubo, efectivo), nunca una línea agregada única, y donde un libro no tiene precio para valorar su bloque **hay hueco**, no interpolación ni arrastre.
2. **Dado** un tramo sin dato, **entonces** la gráfica **dice por qué** (qué falta y a qué fecha) en texto, no solo con la forma.
3. **Dado** el rango temporal, **cuando** se cambia con los botones 1M / 1A / 5A / Todo, **entonces** la gráfica responde de inmediato y **no** hay gestos de pinza en ninguna parte.
4. **Dado** el modo privacidad activo, **entonces** la **forma** de las gráficas sigue visible y los **ejes y los valores** quedan enmascarados (`docs/specification.md` §9.6).
5. **Dado** cualquier gráfica, **entonces** tiene alternativa textual equivalente (tabla de los mismos puntos), no depende del color para distinguir series, y respeta `prefers-reduced-motion`.
6. **Ningún** número fiscal sale de una gráfica.

---

### Historia 5 — Registrar un evento corporativo sin tocar la CLI (Prioridad: P2)

Llega un *split*, un canje o una liquidación. El usuario elige el tipo, rellena los datos del documento del emisor, ve el efecto sobre sus lotes **antes de escribir**, y confirma.

**Por qué esta prioridad**: es la parte delicada (lógica de transformación de lotes) y la que más se agradece no tener que teclear en un terminal.

**Prueba independiente**: registrar el mismo *split* desde la web y desde `atlas ca split` sobre copias del mismo libro; los bytes del evento escrito coinciden salvo `id` y `recorded_at`.

**Escenarios de aceptación**:

1. **Dado** un tipo de evento corporativo, **cuando** se rellena el formulario, **entonces** la **fuente documental** (URL o clave del PDF del emisor) es **obligatoria** y el formulario no deja avanzar sin ella.
2. **Dado** el formulario relleno, **cuando** se pide ver el efecto, **entonces** se muestran posiciones y **lotes antes y después** y las ganancias que generaría, calculados por el dominio.
3. **La web no implementa ninguna transformación de lotes**: invoca la del dominio y enseña el resultado.
4. **Dado** una huella repetida, **entonces** se avisa y se exige confirmación explícita, como en el resto de formularios.
5. **Dado** un contrasplit con picos, **entonces** el reparto de la venta forzosa por cuenta lo calcula el dominio y la vista previa lo enseña antes de escribir.

---

### Historia 6 — Registrar traspasos y tesis desde el teléfono (Prioridad: P2)

El usuario solicita un traspaso, va anotando sus etapas, y lo cierra cuando llega la suscripción. Y abre una tesis antes de comprar en el cubo, como exige la regla 15.

**Por qué esta prioridad**: cierra la lista de «lo que todavía se registra desde la CLI» y elimina el callejón sin salida de la compra del cubo sin tesis.

**Prueba independiente**: abrir una tesis y registrar a continuación una compra del cubo enlazada a ella, todo desde la web, sobre un libro de prueba.

**Escenarios de aceptación**:

1. **Dado** dos fondos traspasables, **cuando** se registra una **solicitud** de traspaso, **entonces** queda como traspaso pendiente y **nunca** como una venta.
2. **Dado** una solicitud abierta, **cuando** se registra una etapa (reembolsado, suscrito, cancelado), **entonces** la solicitud avanza sin tocar ningún lote.
3. **Dado** una solicitud abierta, **cuando** se registra el traspaso contable, **entonces** el formulario ofrece la solicitud a la que pertenece y el evento lleva sus dos lados en un único hecho atómico.
4. **Dado** una compra en una cuenta del cubo sin tesis abierta, **entonces** la pantalla lleva **a crear la tesis**, en vez de remitir a un comando de la CLI.

---

### Historia 7 — Que un fallo nunca me deje la pantalla muda (Prioridad: P1)

Algo falla: el almacenamiento está lleno, el fichero importado no es un libro, la CLI escribió mientras, el permiso de la carpeta caducó. El usuario lee qué ha pasado, qué puede hacer, y **sale sin recargar**.

**Por qué esta prioridad**: el usuario lo ha pedido expresamente y la 006 dejó el inventario levantado con el navegador. Es P1 aunque no sea una pantalla nueva.

**Prueba independiente**: provocar cada caso del inventario y comprobar que hay mensaje, motivo y salida.

**Escenarios de aceptación**:

1. **Dado** cualquier error visible, **entonces** dice **qué ha pasado y qué hacer**, en español, sin jerga y sin volcados; el código técnico puede ir detrás, plegado.
2. **Dado** un error con acción asociada (exportar, abrir el libro, ver la verificación), **entonces** el botón que lleva a la solución **se muestra**, en todas las pantallas, no solo en la guarda de carga.
3. **Dado** un fichero importado que no es un libro válido, **entonces** **no se abre ni se recuerda ningún libro**: el estado anterior se conserva intacto.
4. **Dado** un fallo al abrir el libro, **entonces** el aviso sobrevive a la navegación: se pinta en la pantalla de apertura mientras dure.
5. **Dado** cualquier escritura, **entonces** ante la duda **no se escribe**; un `append` a medias nunca deja el libro en un estado que la CLI no sepa leer.
6. **No hay ningún `catch` vacío** en `apps/web/src`.

---

### Historia 8 — Que perseguir un traspaso colgado no dependa de mi memoria (Prioridad: P2)

Un traspaso entre fondos tarda días. El que se queda colgado es exactamente el que hay que perseguir.

**Por qué esta prioridad**: es la regla de negocio nueva de la feature y la única que toca el dominio de forma observable.

**Prueba independiente**: sobre el libro sintético, consultar a una fecha en la que una solicitud lleva más de `transfer_max_days` abierta y ver el aviso; consultar a una fecha anterior al vencimiento y **no** verlo.

**Escenarios de aceptación**:

1. **Dado** una solicitud de traspaso abierta más de `transfer_max_days` **a la fecha de la consulta**, **entonces** se emite un aviso del dominio con su código, que las **dos** interfaces traducen al español.
2. **Dado** la misma solicitud consultada a una fecha anterior, **entonces** **no** hay aviso: los días se cuentan hasta la fecha consultada, no hasta hoy.
3. **Dado** que `transfer_max_days` no está configurado, **entonces** no se evalúa la regla y no se inventa un plazo.
4. **La CLI lo muestra igual que la web.**

---

### Historia 9 — Que la aplicación siga siendo fácil de cambiar dentro de dos años (Prioridad: P2)

No es una historia de usuario final: es el encargo literal del dueño. El frontend no puede convertirse en una cantidad ingente de código mal escrito.

**Prueba independiente**: las cifras del informe (líneas por paquete, fichero más largo, componentes nuevos frente a reutilizados) y los tests de arquitectura en verde.

**Escenarios de aceptación**:

1. **Ningún fichero de `apps/web/src` por encima de ~250 líneas** sin una razón escrita en su cabecera.
2. **Las tablas de las tres pantallas nuevas comparten componente** con las que ya existen; si las de Movimientos no dan de sí, se generalizan, no se copian.
3. **Cero valores mágicos** en los estilos: todo sale de los *tokens*; un escalón nuevo se añade al *token* y se documenta.
4. **Antes de crear un componente se reutiliza el que existe**; un primo hermano de un componente existente es deuda.

---

### Casos límite

- Libro **vacío**: Núcleo y Cubo muestran su estado vacío con el siguiente paso, nunca una tabla de ceros ni una gráfica plana en cero.
- Libro **degradado** (eventos inválidos, ADR-0015): las dos pantallas **consultan**; los tres asistentes nuevos **no escriben** y dicen por qué, como el resto.
- **Sin precios en absoluto**: Núcleo muestra cantidades y objetivos, marca todo lo demás como sin dato y no calcula pesos sobre un total parcial; las gráficas quedan vacías **con su explicación**, no en blanco.
- **Cubo sin tesis y sin posiciones**: estado vacío con el enlace a crear una tesis.
- **Índice de referencia sin configurar o desconocido**: la comparación queda sin dato y se dice dónde se configura.
- Fecha consultada **anterior al primer evento**: todo vacío, sin días negativos ni divisiones por cero.
- Fecha consultada **posterior al último evento**: la foto del final del libro, con la antigüedad de los precios a la vista.
- **Todas las posiciones del cubo cerradas**: las estadísticas siguen siendo legibles y el aviso de muestra insuficiente se mantiene.
- **Una tesis contaminada** (sus ventas consumieron lotes de otra): queda fuera de las medias y se dice, como ya hace el dominio.
- Pantalla a **320 px**: sin desplazamiento horizontal, gráficas legibles en vertical, objetivos táctiles a tamaño.
- **Navegación atrás** con un diálogo abierto o un formulario a medias: hace lo que el usuario espera.

---

## Requisitos *(obligatorio)*

### Requisitos funcionales

#### Regla nueva del dominio

- **FR-001**: El dominio DEBE emitir un aviso cuando una solicitud de traspaso lleva abierta más de `Settings.transfer_max_days` **contados hasta la fecha de la consulta**.
- **FR-002**: El aviso DEBE llevar código propio, entrar en el catálogo, tener test propio y estar traducido al español en **las dos** interfaces; el test anti-deriva de `tests/messages.test.ts` falla si falta en alguna.
- **FR-003**: Sin `transfer_max_days` configurado, la regla NO se evalúa y no se emite ni aviso ni sustituto.
- **FR-004**: La CLI DEBE poder consultar los traspasos pendientes **a una fecha**, igual que la web, y mostrar el aviso igual que ella.

#### Pantalla Núcleo

- **FR-005**: `/nucleo` DEBE mostrar, a la fecha seleccionada: pesos y desviaciones por activo y por clase, calculadora de aportación, simulador de traspaso y costes.
- **FR-006**: La pantalla DEBE llevar **selector de fecha visible**, con «hoy» por defecto, y **todos** los bloques DEBEN proyectar con `asOf` a esa fecha (cantidades incluidas).
- **FR-007**: Un activo con posición y sin precio DEBE mostrarse como «sin dato», nunca como cero, y el total DEBE marcarse parcial; los pesos NO se calculan sobre un total parcial.
- **FR-008**: La desviación por encima del umbral y el satélite por debajo del mínimo DEBEN marcarse de forma que **no dependa solo del color**.
- **FR-009**: La calculadora DEBE separar el presupuesto del cubo **como presupuesto**, etiquetado, y nunca repartirlo entre los pesos objetivo.
- **FR-010**: La calculadora DEBE dejar explícito que es una **propuesta** y que las órdenes las da el usuario a mano.
- **FR-011**: El simulador DEBE mostrar pesos y desviaciones antes y después y la frase de que un traspaso entre fondos **no** es hecho imponible.
- **FR-012**: Los costes DEBEN separar las comisiones que suman al coste de adquisición de las que no son deducibles, según `docs/business-rules.md`. **Hoy el dominio no expone la segunda mitad** (`costSummary` no mira `standalone_fee`): ver **Q9**.
- **FR-013**: Cuando el dominio **rechaza** una vista (`missing_manual_prices`, `missing_target_weights`, `no_target_weight_in_table`…), la pantalla DEBE explicar el rechazo en español y seguir mostrando el resto de bloques.

#### Pantalla Cubo

- **FR-014**: `/cubo` DEBE mostrar, a la fecha seleccionada: posiciones abiertas, tesis frente al índice, estadísticas de operativa, presupuesto del cubo y avisos del cubo.
- **FR-015**: Cada posición DEBE mostrar su plusvalía latente y **su peso dentro del cubo**.
- **FR-016**: El resultado frente al índice DEBE consumirse de `bucketTheses` (`result_vs_index_eur`); la web NO lo recalcula.
- **FR-017**: Una comparación sin dato DEBE decir su motivo, una vez por causa.
- **FR-018**: El peso del cubo sobre el patrimonio total DEBE aparecer **etiquetado como excepción acotada** a la compartimentación, con el desglose a la vista.
- **FR-019**: Una regla de control no evaluada DEBE decirse como «no evaluada», nunca como «dentro de límite».
- **FR-020**: Ninguna vista, métrica o total DEBE mezclar núcleo y cubo fuera de las dos excepciones escritas.

#### Gráficas

- **FR-021**: uPlot 1.6.32 DEBE vendorizarse en `apps/web/vendor/uplot/` con su `LICENSE` y su `VENDOR.md` (origen, versión, hash, licencia), como Pico.
- **FR-022**: Hay **tres** gráficas y ninguna más: evolución del patrimonio por libro, distribución del núcleo frente al objetivo, y tesis frente al índice en el tiempo.
- **FR-023**: La evolución del patrimonio DEBE tener **una serie por libro** (núcleo, cubo, efectivo); NO existe una línea agregada única.
- **FR-024**: Las series temporales DEBEN calcularlas **el dominio**, con sus tests; ningún bucle de componente las construye.
- **FR-025**: Donde no hay precio DEBE haber hueco: ni interpolación, ni arrastre, ni recta entre dos puntos lejanos.
- **FR-026**: Un tramo sin dato DEBE explicarse en texto (qué falta, a qué fecha).
- **FR-027**: El rango se elige con **botones** (1M / 1A / 5A / Todo). NO hay gestos de pinza.
- **FR-028**: Cada gráfica DEBE tener alternativa textual equivalente, no depender del color y respetar `prefers-reduced-motion`.
- **FR-029**: Con el modo privacidad activo, la forma se mantiene y **los ejes y los valores** quedan enmascarados.
- **FR-030**: Ningún número fiscal sale de una gráfica.

#### Asistentes que faltan

- **FR-031**: DEBE haber formularios para **eventos corporativos**, **traspasos** (solicitud, etapa y traspaso contable) y **tesis** (apertura y cierre), con el mismo patrón que `routes/registrar/`: validación del dominio, vista previa del efecto antes de escribir, aviso de huella repetida.
- **FR-032**: La fuente documental de un evento corporativo es **obligatoria**, no opcional.
- **FR-033**: La web NO implementa ninguna transformación de lotes ni compone efectos por su cuenta: invoca al dominio.
- **FR-034**: La compra del cubo sin tesis DEBE llevar a **crear la tesis** dentro de la web.
- **FR-035**: La pantalla `/registrar` DEBE dejar de decir que estos tres se registran solo desde la CLI.

#### Calidad del frontend

- **FR-036**: Ningún fichero de `apps/web/src` supera ~250 líneas sin una razón escrita en su cabecera.
- **FR-037**: Las tablas de Núcleo y Cubo comparten componente con las de Movimientos.
- **FR-038**: Todo estilo sale de los *tokens*; un escalón nuevo se añade al *token* con su motivo escrito.
- **FR-039**: Los componentes existentes se reutilizan antes que clonarse.

#### UX fluida

- **FR-040**: Ninguna pantalla en blanco: mientras carga o proyecta hay esqueleto **del tamaño correcto** y al llegar los datos **no se mueve nada de sitio**.
- **FR-041**: Cambiar la fecha, filtrar o cambiar el rango responde de inmediato; una operación de más de ~100 ms lo dice y una de más de un segundo se puede cancelar.
- **FR-042**: El arranque no compite consigo mismo; verificado con la CPU frenada ×4 y ×10.
- **FR-043**: La navegación atrás del teléfono hace lo esperado, incluidos diálogos y formularios a medias.

#### Manejo de errores

- **FR-044**: Todo error visible dice qué ha pasado y qué hacer, en español, sin volcados; el código técnico va detrás, plegado.
- **FR-045**: Un error **deja la aplicación utilizable**: siempre se puede salir sin recargar.
- **FR-046**: Ante la duda **no se escribe**.
- **FR-047**: No hay ningún `catch` vacío.
- **FR-048**: El manejo de errores **extiende** `toAppError` y su catálogo; no se sustituye por una capa nueva.
- **FR-049**: Los casos del inventario de la 006 quedan resueltos **o explicados uno por uno**, con test donde importa: almacenamiento lleno o bloqueado, fichero que no es un libro, libro con líneas inválidas, permiso revocado, conflicto de etag, ruta inexistente.

#### Transversales

- **FR-050**: Toda cifra mostrada en Núcleo y Cubo **coincide con la de la CLI** sobre el mismo libro y la misma fecha.
- **FR-051**: `packages/domain` se mantiene al 100 % de líneas y ramas.
- **FR-052**: `docs/` no se toca; lo que no encaje es una pregunta.

### Entidades clave

No se crea ninguna entidad de datos nueva ni se toca el esquema del libro. Las entidades que la feature **lee** ya existen: `CoreWeights`, `ContributionPlan`, `TransferSimulation`, `CostSummary`, `BucketPositions`, `BucketThesisView`, `BucketStats`, `BucketControls`, `NetWorth`, `OpenTransfer`, `PendingOrder`, `PriceLookup`, `Warning`.

Lo que se **añade** al dominio (contrato en `contracts/domain.md`): el aviso de traspaso vencido, dos proyecciones de serie temporal y la composición de los efectos de un evento corporativo, que hoy vive en la CLI.

---

## Criterios de éxito *(obligatorio)*

### Resultados medibles

- **SC-001**: Sobre el libro sintético, **todas** las cifras de Núcleo y Cubo coinciden con las de `atlas weights`, `atlas contribute`, `atlas costs`, `atlas transfer simulate`, `atlas bucket` y `atlas thesis list` a la misma fecha. La comparación se anota.
- **SC-002**: Ninguna pantalla tiene desplazamiento horizontal a 320, 360, **400 (DPR 3)**, 768, 1024 y 1280 px; los objetivos táctiles miden al menos 44 px; las tres gráficas se leen en vertical.
- **SC-003**: El arranque termina en la pantalla correcta con la CPU frenada ×1, ×4 y ×10, sin cambios de ruta intermedios.
- **SC-004**: Cambiar de fecha y cambiar de rango de una gráfica responden por debajo de 100 ms sobre el libro sintético; lo que no lo haga se dice en pantalla.
- **SC-005**: El coste de uPlot en el *bundle* y el tiempo de la serie más larga quedan **medidos y anotados** en `plan.md`.
- **SC-006**: Cada código de aviso y de error que puede ver el usuario está traducido en las dos interfaces (test anti-deriva en verde).
- **SC-007**: Ningún fichero de `apps/web/src` pasa de 250 líneas sin una razón escrita, comprobado por un test.
- **SC-008**: `lint`, `typecheck`, `test`, `build` y CI en verde desde cero (`npm run clean && npm run build`); `packages/domain` al 100 %.
- **SC-009**: Todos los puntos del inventario de errores de la 006 tienen una fila con «resuelto» o «explicado y por qué».

---

## Supuestos

Los supuestos con los que se escribió este `spec.md`, cada uno con su pregunta en `questions.md`. **Las once quedaron respondidas el 2026-09-18**; abajo va el supuesto ya confirmado o corregido.

- **A1** (Q1, **precisado**): un punto de una serie **solo existe cuando todos sus componentes tienen precio**; un total `partial` no se dibuja nunca, porque es más pequeño que la realidad y es indistinguible de una caída. El hueco se decide **por serie** (el núcleo se corta cuando el núcleo es parcial, el cubo cuando el cubo lo es), y los puntos del eje X son las **fechas de valoración** del libro dentro del rango, más el extremo del rango. Medido sobre el libro sintético con rejilla mensual: 6 de 29 puntos tienen el núcleo completo y 3 de 29 el cubo.
- **A2** (Q2): el aviso de traspaso vencido se expone como una proyección **nueva** que envuelve `pendingTransfers` (patrón de `bucketTheses` sobre `theses`), sin romper a quien ya la llama.
- **A3** (Q3, **ampliado**): `atlas transfer pending` **y `atlas order list`** ganan `--date` y proyectan con `asOf`, y `order list --all` deja de falsear `days_open` a 0. Arreglar la mitad de un defecto de clase es como sobreviven las inconsistencias.
- **A4** (Q4, **confirmado, sin ADR**): la composición de los efectos de un evento corporativo (incluido el cálculo de picos del contrasplit) **se mueve al dominio** y la CLI pasa a consumirla. No se propone ADR: mover una regla de negocio de una aplicación al dominio **es** la regla (ADR-0007, decisión (h) de la 006), no una excepción.
- **A5** (Q5): el formateo de los ejes de las gráficas necesita `format/money.ts`; se añade **un** módulo más a la lista de consumidores autorizados de la puerta de `Amount`, con su motivo escrito y su test.
- **A6** (Q6, **con cifras**): el presupuesto del *bundle* pasa a medirse en dos: **arranque ≤ 80 KB gzip** y **total ≤ 150 KB gzip**. Primero se arregla lo que el comprobador mide (hoy dice medir el arranque y suma todo `dist`).
- **A7** (Q7, **confirmado**): la gráfica «tesis frente al índice» es **una** curva agregada del cubo frente al índice, con la tabla por tesis debajo. Precedente fijado por la dirección: **cuando el prompt y `docs/specification.md` se contradigan, manda la especificación**.
- **A8** (Q8): el techo de 250 líneas se aplica a `.ts`/`.tsx`; las hojas de estilo llevan su razón escrita en vez de partirse.
- **A9** (Q9, **corregido**): `costSummary` gana un bloque **agregado** de comisiones sueltas (`standalone_fee`), etiquetado como que **no forman parte del coste de adquisición**. **No se clasifican por tipo**: el campo que distingue custodia de conectividad (`fee_kind`) lo añade la feature 008 (ADR-0021) y hoy no existe.
- **A10** (Q10, **confirmado**): la opción «Valor por defecto» de la fecha fiscal por tipo de activo pasa a **quitar** la clave del mapa (ADR-0018: los mapas son parciales y el tipo ausente toma el valor documentado). Se descarta la variante reversible: un control que promete restaurar el valor por defecto y no hace nada es peor que no tenerlo.
- **A11** (Q11, **ampliado**): las **tres** filas del inventario que la 006 dejó a la dirección entran: la importación valida antes de abrir nada, el aviso de la fase `failed` se pinta en `/libro` mientras dure, y **los diez hallazgos de integridad se traducen al español**.
- **A12**: `happy-dom` entra como dependencia **de desarrollo** y es la única; no se añade `@solidjs/testing-library` (se renderiza con `render` de `solid-js/web`). `docs/dependencies.md` lo registra la dirección; el implementador no toca `docs/`.
- **A13**: la fecha por defecto de Núcleo y Cubo es **hoy** en Europe/Madrid, igual que la CLI sin `--date` y que el Resumen (Q11 de la 006).
- **A14**: los tres asistentes nuevos entran como rutas bajo `/registrar/<slug>`, reutilizando `EventForm`; el que no cabe en el modelo plano de `FORM_SPECS` (evento corporativo) usa una variante declarada, no un componente a medida por tipo.
