# Especificación de la feature: Esqueleto de la aplicación web, Resumen y Movimientos (`006-web-shell`)

**Rama**: `feature/006-web-shell`

**Creada**: 2026-09-18

**Estado**: Aprobada el 2026-09-18 con **Q1-Q11 respondidas** (`questions.md`). Q6 cambió el supuesto: el modo privacidad enmascara **importes y cantidades**, como manda `docs/specification.md` §9.6, y el prompt se corrigió. Las respuestas entraron en el prompt como decisiones **(h)-(l)**.

**Entrada**: prompt de traspaso `docs/prompts/006-web-shell.md` §3 (alcance), §4 (fuera de alcance) y §6 (decisiones fijadas (a)-(g)). Gobiernan **ADR-0017** (*stack*) y **ADR-0019** (local-first); además ADR-0002, ADR-0003, ADR-0006, ADR-0007 (puertos), ADR-0012, ADR-0015 (proyección degradada), ADR-0016 (`asOf`) y ADR-0018. Documentos: `docs/specification.md` §6, §9.6 y §10; `docs/data-schema.md` §2, §3, §4, §5, §6 y §7; `docs/business-rules.md` §1 y §4; constitución I-VII y sus restricciones técnicas. Construye sobre `specs/001-ledger-core/`, `specs/004-monthly-contribution/` y `specs/005-bucket-tracking/`.

## Resumen

La aplicación existe y funciona: dominio puro, adaptadores y una CLI que cubre las fases 1, 2 y 3. Lo que no existe es la forma en la que el usuario va a usarla **a diario y desde el teléfono**. Esta feature construye el esqueleto de la web y las dos pantallas que la hacen útil el primer día, sin servidor y sin cuenta en ningún sitio (ADR-0019):

1. **El paquete `apps/web`**: Vite 8 + Solid 1.9 + TypeScript estricto dentro del monorepo, Pico CSS vendorizada con una capa de *tokens* propia, PWA instalable, CSP restrictiva y cero peticiones a terceros.
2. **El libro en el dispositivo**: un adaptador nuevo del puerto `LedgerStore` que escribe **sobre el mismo `ledger.jsonl` que usa la CLI** cuando el navegador ofrece la File System Access API, y en IndexedDB en el resto de casos, con importación y exportación en un botón. Cumple el contrato de puerto que ya cumplen el de memoria y el de fichero.
3. **Una sola navegación**: barra inferior de cuatro destinos más la acción de registrar en pantalla estrecha, rail lateral en pantalla ancha, nunca las dos a la vez y nunca un título centrado ocupando una banda.
4. **Modo privacidad activado por defecto**, con un único componente por el que pasan todos los importes y todas las cantidades de la aplicación y un test de arquitectura que lo vigila.
5. **Resumen**: patrimonio total desglosado, lo que reclama atención ordenado por importancia, y los últimos movimientos.
6. **Movimientos**: el libro entero legible y filtrable, el detalle de cada evento con su estado y sus enlaces, los formularios de registro de los eventos del día a día con **vista previa del efecto antes de escribir**, y la rectificación (anulación más evento corregido) como en la CLI.
7. **Ajustes**: configuración con las validaciones y los avisos del dominio, gestión del libro (dónde está, exportar, importar, cambiar) y verificación (`integrity` y comprobación profunda).

**Ni una regla de negocio vive en la web.** Todo cálculo, validación, orden y decisión sale de `@atlas/domain`; donde el dominio no lo expone, hay una pregunta en `questions.md` (Q1-Q4), no un cálculo en un componente. Las vistas analíticas (pesos del núcleo, aportación, cubo, fiscal) y **todas las gráficas** son la feature siguiente: aquí sus dos destinos existen en la navegación y dicen con calma qué llegará y qué comando de la CLI lo responde hoy.

## Escenarios de usuario y pruebas *(obligatorio)*

### Historia 1 — Abrir mi libro y saber siempre dónde está (Prioridad: P1)

El usuario abre la aplicación por primera vez. No hay servidor, no hay cuenta y no hay datos: lo primero es decirle a la aplicación **dónde está su libro**. En el ordenador elige la carpeta que contiene su `ledger.jsonl` —el mismo fichero que usa la CLI— y el permiso se conserva entre sesiones. En el teléfono, donde no hay File System Access API, el libro vive en el almacenamiento del navegador y se importa y exporta con un botón. A partir de ahí, **toda pantalla dice de qué libro está hablando**.

**Por qué esta prioridad**: sin libro no hay aplicación. Y el riesgo real de esta feature no es un cálculo mal hecho, es que el usuario crea que sus datos están a salvo cuando viven en un almacenamiento que se borra al limpiar los datos del sitio (ADR-0019).

**Prueba independiente**: con el *golden* sintético en una carpeta, se abre la aplicación, se elige la carpeta, y el Resumen muestra el patrimonio de ese libro; el chip de la cabecera nombra el fichero. En un navegador sin la API, el mismo libro se importa desde el fichero y el chip dice "almacenamiento del navegador" con la fecha de la última exportación.

**Escenarios de aceptación**:

1. **Dado** un primer arranque sin libro configurado, **cuando** se abre la aplicación, **entonces** se muestra la pantalla de apertura del libro (`/libro`) con las dos vías disponibles explicadas en una línea cada una, y **no** se muestra un Resumen vacío con ceros.
2. **Dado** un navegador con File System Access API, **cuando** el usuario elige la carpeta de su libro, **entonces** la aplicación abre `ledger.jsonl` de esa carpeta, lo carga, guarda el permiso y esa vía se presenta **antes** y de forma más destacada que el almacenamiento del navegador.
3. **Dado** un libro abierto por fichero y una sesión nueva (la pestaña se ha cerrado y vuelto a abrir), **cuando** el navegador exige un gesto del usuario para reactivar el permiso, **entonces** la aplicación lo dice en una frase y ofrece un botón "Reconectar", sin perder la referencia ni pedir volver a elegir la carpeta.
4. **Dado** un navegador sin la API (móvil, Firefox, Safari), **cuando** se abre la aplicación, **entonces** la vía de IndexedDB se ofrece con su limitación escrita ("no es un almacén definitivo: exporta"), y se puede importar un `ledger.jsonl` desde el selector de ficheros.
5. **Dado** un libro en IndexedDB, **cuando** se pide exportar, **entonces** se descarga un fichero `ledger.jsonl` **byte a byte idéntico** al contenido almacenado y se registra la fecha de exportación.
6. **Dado** un libro en IndexedDB exportado hace más de siete días (o nunca), **cuando** se abre cualquier pantalla, **entonces** el chip del libro muestra un aviso visible con los días transcurridos y un acceso directo a exportar.
7. **Dado** cualquier pantalla y cualquiera de las dos vías, **cuando** el usuario mira la cabecera (o el pie del rail en escritorio), **entonces** ve **de qué libro** se están hablando: el nombre del fichero, o "almacenamiento del navegador" con su fecha de exportación.
8. **Dado** un libro abierto, **cuando** el usuario pide cambiar de libro, **entonces** puede elegir otra carpeta o otro fichero y la aplicación recarga; nada del libro anterior se queda en pantalla.
9. **Dado** un fichero cuyo contenido no es un libro válido (una línea mal formada, un `schema_version` mayor que el soportado), **cuando** se intenta cargar, **entonces** se muestra el error del dominio traducido al español, con el número de línea si lo trae, y **no** se escribe nada ni se sustituye el libro configurado.

---

### Historia 2 — Moverme por la aplicación con una mano (Prioridad: P1)

El usuario usa esto en el metro, con una mano, en una pantalla de 360 px. Quiere llegar a cualquier sitio con el pulgar, que el botón atrás del teléfono haga lo que espera y que ninguna pantalla se desplace hacia los lados. En el ordenador quiere lo mismo con el teclado y con un rail lateral que no le robe espacio a los datos.

**Por qué esta prioridad**: es el esqueleto. Todo lo demás cuelga de aquí, y una navegación mal resuelta se paga en cada uso durante veinte años. El contraejemplo está escrito en el prompt: doble navegación que se pisa, un título centrado comiéndose una banda entera y un solo dato útil en una pantalla enorme.

**Prueba independiente**: a 360 px de ancho, las cuatro secciones y la acción de registrar se alcanzan con el pulgar desde cualquier pantalla; a 1280 px, las mismas cinco entradas están en el rail y **la barra inferior no existe en el DOM visible**. Ninguna pantalla produce desplazamiento horizontal en ninguno de los dos anchos.

**Escenarios de aceptación**:

1. **Dado** un ancho menor que el punto de ruptura, **cuando** se pinta cualquier pantalla, **entonces** hay **una** barra inferior con cuatro destinos (Resumen, Movimientos, Núcleo, Cubo) y un acceso destacado a registrar en el centro, y **ninguna** otra lista de destinos en la pantalla.
2. **Dado** un ancho mayor o igual que el punto de ruptura, **cuando** se pinta cualquier pantalla, **entonces** los mismos destinos están en un rail lateral y la barra inferior **no** se muestra: nunca las dos a la vez.
3. **Dado** cualquier ancho, **cuando** se pinta la cabecera, **entonces** **no** hay un título centrado ocupando una banda: el título de la pantalla es el primer encabezado del contenido, alineado a la izquierda, y se desplaza con él.
4. **Dado** cualquier destino, **cuando** se navega a él, **entonces** la URL es legible y estable (`/`, `/movimientos`, `/registrar`, `/ajustes`…), el botón atrás vuelve a la pantalla anterior y recargar la página reproduce la misma vista.
5. **Dado** la lista de movimientos con filtros aplicados, **cuando** se comparte o se recarga la URL, **entonces** los filtros vienen en la URL y se restauran; el botón atrás deshace el último filtro, no salta de sección.
6. **Dado** cualquier control interactivo, **cuando** se mide, **entonces** su objetivo táctil es de al menos 44 × 44 px y su foco es visible con teclado.
7. **Dado** un ancho de 360 px, **cuando** se recorre cualquier pantalla de la aplicación, **entonces** no hay desplazamiento horizontal y ninguna tabla se resuelve con una barra lateral: las filas densas se reorganizan en tarjetas o en filas de dos alturas.
8. **Dado** el teclado en escritorio, **cuando** se tabula, **entonces** el orden sigue el orden visual, el destino activo se anuncia (`aria-current`), y los diálogos atrapan el foco y se cierran con `Esc` (elemento `<dialog>` nativo).
9. **Dado** una ruta desconocida, **cuando** se abre, **entonces** se muestra una pantalla sobria de "no existe" con un enlace al Resumen, no una pantalla en blanco.
10. **Dado** un usuario con `prefers-reduced-motion`, **cuando** navega, **entonces** no hay transiciones; sin esa preferencia, las transiciones son mínimas y nunca decorativas.

---

### Historia 3 — Que la aplicación se pueda mirar en público (Prioridad: P1)

El usuario abre la aplicación en el metro. No quiere que la persona de al lado vea cuánto tiene. Quiere seguir viendo **cómo va de peso y de desviación**, porque eso es lo que consulta de verdad, sin que ni los importes ni las cantidades estén a la vista: doce participaciones de un fondo con precio público delatan el patrimonio igual que el importe (Q6).

**Por qué esta prioridad**: es decisión (d) del prompt y requisito de la especificación §9.6. Y es una de esas reglas que solo sobreviven si el diseño las hace imposibles de saltar: un único componente y un test que lo vigile.

**Prueba independiente**: la aplicación arranca con el modo activado; todos los importes y todas las cantidades salen enmascarados y los porcentajes, pesos, desviaciones, fechas y textos siguen legibles. Un toque en la cabecera los muestra; al recargar, el estado se recuerda. El test de arquitectura falla si un componente pinta un importe o una cantidad sin pasar por el componente único.

**Escenarios de aceptación**:

1. **Dado** un primer arranque, **cuando** se carga la aplicación, **entonces** el modo privacidad está **activado**.
2. **Dado** el modo activado, **cuando** se pinta cualquier importe o cualquier cantidad, **entonces** se sustituye por una máscara neutra de ancho estable, con su etiqueta accesible ("importe oculto", "cantidad oculta"), y la divisa y el signo **no** se muestran.
3. **Dado** el modo activado, **cuando** se pintan porcentajes, pesos, desviaciones, fechas, nombres y estados, **entonces** siguen visibles: son la información útil en público y no delatan el patrimonio (A3, Q6).
4. **Dado** el modo activado, **cuando** el usuario rellena un campo de un formulario, **entonces** lo que él está escribiendo **no** se enmascara: el enmascarado es de la presentación de datos, no de la entrada (matiz de Q6).
5. **Dado** el interruptor de la cabecera, **cuando** se pulsa, **entonces** el cambio se aplica en toda la aplicación sin recargar y se recuerda en el dispositivo; el interruptor está a **un** toque desde cualquier pantalla.
6. **Dado** cualquier importe o cantidad de cualquier pantalla, **cuando** se busca en el código, **entonces** se pinta a través del componente único; el test de arquitectura recorre las fuentes de `apps/web` y falla si el formateador se importa desde otro sitio.
7. **Dado** un importe que el dominio devuelve como "sin dato" (falta un precio, falta un tipo de cambio), **cuando** se pinta, **entonces** se muestra "sin dato" y **nunca** un cero, ni con el modo activado ni sin él (constitución V).

---

### Historia 4 — Ver cómo va y si hay algo que hacer (Prioridad: P1)

El usuario abre la aplicación una vez al día y hace una pregunta: *¿cómo va, y hay algo que requiera mi atención?* La pantalla de Resumen la responde entera, sin desplazarse para lo esencial.

**Por qué esta prioridad**: es la pantalla de entrada y la razón por la que la aplicación se abre. Y es la que hace que un aviso (una desviación por encima del umbral, un precio caducado, un evento inválido) deje de pasar desapercibido.

**Prueba independiente**: sobre el *golden* sintético, el Resumen muestra el patrimonio desglosado en núcleo, cubo y efectivo con el total marcado como parcial cuando falta un precio, la lista de avisos activos ordenada, y los cinco últimos movimientos con acceso al libro completo. Borrando una `valuation`, aparece el aviso de precio que falta y el total pasa a parcial.

**Escenarios de aceptación**:

1. **Dado** un libro cargado, **cuando** se abre el Resumen, **entonces** el patrimonio se muestra **siempre desglosado** (núcleo, cubo, efectivo) con su total, tal como lo devuelve `netWorth`; nunca un único número sin descomponer (constitución III).
2. **Dado** que falta el precio de un activo con posición o el tipo de cambio de una divisa con saldo, **cuando** se pinta el patrimonio, **entonces** el bloque y el total llevan marca de **parcialidad** y se dice exactamente qué falta, con enlace a registrar la valoración que falta.
3. **Dado** un precio manual más antiguo que `stale_price_days`, **cuando** se pinta, **entonces** su antigüedad es visible y está marcada como caducada; sin precio se muestra "sin dato", nunca un cero.
4. **Dado** los avisos activos del libro (eventos inválidos, desviación por encima del umbral, satélite por debajo del mínimo, precios o tipos caducados, órdenes y traspasos pendientes), **cuando** se pinta el bloque de atención, **entonces** aparecen ordenados por importancia, cada uno dice **qué pasa** en español y **lleva a la pantalla donde se arregla**.
5. **Dado** un libro sin nada pendiente, **cuando** se pinta el bloque de atención, **entonces** se dice con calma ("nada que hacer"), sin inventar tarjetas ni métricas de relleno.
6. **Dado** un libro con eventos inválidos, **cuando** se abre cualquier pantalla, **entonces** hay una **cabecera de aviso permanente** con su número y un enlace a la verificación, las consultas siguen funcionando y **registrar queda bloqueado** con el motivo a la vista (ADR-0015).
7. **Dado** el Resumen, **cuando** se pintan los últimos movimientos, **entonces** son los cinco o seis más recientes en orden cronológico inverso, cada uno con su fecha, tipo legible, activo o cuenta e importe, y hay un acceso al libro completo.
8. **Dado** cualquier cifra del Resumen, **cuando** se calcula, **entonces** sale de una proyección del dominio a la fecha de hoy en Europe/Madrid (`asOf`, ADR-0016) y ninguna se calcula en un componente.
9. **Dado** un libro recién creado y vacío, **cuando** se abre el Resumen, **entonces** se explica en una frase qué hacer primero (dar de alta una cuenta) y se enlaza a ello, en lugar de mostrar una pantalla de ceros.

---

### Historia 5 — Consultar el libro y entender un evento (Prioridad: P1)

El usuario quiere ver qué ha registrado, encontrar una operación concreta y entender un evento del que duda: qué campos tiene, si sigue vigente, si es la corrección de otro, y con qué orden, solicitud o tesis está enlazado.

**Por qué esta prioridad**: es la mitad del valor de la aplicación (la otra es registrar) y hoy solo existe en la CLI mediante `export`. Es además el camino de reparación de un libro degradado: para rectificar, primero hay que poder leer.

**Prueba independiente**: sobre el *golden* sintético (200 eventos), la lista muestra los eventos en orden cronológico inverso, los filtros por tipo, cuenta, activo y rango de fechas reducen la lista, la búsqueda por texto encuentra un `broker_ref`, y el detalle de la compra anulada del libro sintético se muestra como **anulada**, enlazada a su anulación.

**Escenarios de aceptación**:

1. **Dado** un libro cargado, **cuando** se abre Movimientos, **entonces** los eventos se listan en orden **cronológico inverso por fecha de negocio** (desempate por posición en el fichero, invertida), tal como lo ordena el dominio.
2. **Dado** un libro de veinte años, **cuando** se abre la lista, **entonces** se cargan los primeros veinte y el resto se trae por páginas o progresivamente; nunca se pintan miles de filas de una vez.
3. **Dado** los filtros por tipo, cuenta, activo y rango de fechas y la búsqueda por texto, **cuando** se aplican, **entonces** se combinan entre sí, se reflejan en la URL, dicen cuántos eventos quedan de cuántos y se pueden quitar de un toque.
4. **Dado** un evento anulado por un `reversal`, **cuando** se lista y cuando se abre, **entonces** aparece marcado como **anulado** (y no solo tachado: el estado se dice con palabras), con enlace al evento que lo anula.
5. **Dado** un evento que corrige a otro (`corrects_id`), **cuando** se abre, **entonces** se dice que es una corrección y se enlaza el original; y desde el original se enlaza su corrección.
6. **Dado** cualquier evento, **cuando** se abre su detalle, **entonces** se muestran **todos** sus campos con nombres legibles en español, los importes a través de `Amount`, las fechas y cantidades formateadas, y el identificador del evento copiable (es lo que hace falta para `atlas edit` o `atlas delete`).
7. **Dado** un evento enlazado a una orden, a una solicitud de traspaso o a una tesis, **cuando** se abre, **entonces** los enlaces llevan a esa orden, solicitud o tesis (o, mientras esas pantallas no existan, muestran su identificador y su estado sin prometer una navegación que no hay).
8. **Dado** un tipo de evento que esta feature no sabe registrar (evento corporativo, traspaso, tesis), **cuando** aparece en la lista, **entonces** se lista y se abre con normalidad: **leer** el libro cubre todos los tipos; solo **escribir** está limitado.
9. **Dado** un libro con eventos inválidos, **cuando** se lista, **entonces** los inválidos aparecen marcados con su motivo en español y la lista sigue funcionando (proyección degradada, ADR-0015).

---

### Historia 6 — Registrar una operación desde el teléfono, sin equivocarme (Prioridad: P1)

El usuario acaba de comprar en la plataforma. Saca el teléfono y lo registra: elige el tipo, rellena unos campos con el teclado adecuado, **ve qué va a pasar con sus lotes y su saldo antes de escribir**, y confirma. Si ya lo había registrado, la aplicación lo detecta y le pide confirmación explícita.

**Por qué esta prioridad**: es la mitad restante del valor y la razón de que esto viva en el móvil (regla 20: registro en el momento de operar). El registro manual nunca se elimina (constitución I).

**Prueba independiente**: sobre una copia del *golden* sintético, se registra una compra desde la web; la vista previa muestra la posición y los lotes antes y después; al confirmar, el fichero gana **una línea** al final, las anteriores quedan intactas byte a byte y la CLI lee el libro sin quejarse.

**Escenarios de aceptación**:

1. **Dado** el acceso a registrar, **cuando** se abre, **entonces** se ofrecen los eventos que el usuario introduce a mano a diario —compra, venta, ingreso, retirada, dividendo, valoración y orden dada— más el alta de cuenta y de activo, cada uno con una línea que dice cuándo se usa.
2. **Dado** un formulario, **cuando** se rellena en el móvil, **entonces** los campos numéricos abren teclado numérico con coma decimal, las fechas usan el selector nativo, y cuentas, activos, divisas, órdenes y tesis se **eligen** de una lista del catálogo: ningún identificador se escribe a mano cuando se puede elegir.
3. **Dado** un formulario completo, **cuando** se pide la vista previa, **entonces** se muestran el evento tal como se va a escribir y su efecto: posiciones y lotes **antes y después**, ganancias que generaría, y los avisos que el propio evento levanta (ventana de recompra, regla de parada del cubo…), exactamente lo que ve la CLI.
4. **Dado** una vista previa con un error del dominio, **cuando** se muestra, **entonces** se explica en español, se señala el campo culpable si el error lo nombra, y el botón de confirmar queda deshabilitado: nunca se escribe algo que la proyección rechaza.
5. **Dado** un evento cuya huella ya existe en el libro, **cuando** se confirma, **entonces** la aplicación avisa de la repetición, nombra los eventos existentes y exige una **confirmación explícita** (equivalente a `--confirm-duplicate`); sin ella no escribe.
6. **Dado** un libro que ha cambiado por fuera desde que se cargó (la CLI escribió mientras), **cuando** se confirma, **entonces** la escritura se rechaza por conflicto, se dice qué ha pasado, se recarga el libro y se vuelve a ofrecer la vista previa sobre el estado nuevo: **nunca se pisa** lo que escribió el otro cliente.
7. **Dado** una compra en una cuenta del cubo, **cuando** se rellena, **entonces** se exige elegir una tesis abierta de ese par (cuenta, activo) —regla 15— y, si no hay ninguna, se dice que hay que crearla y **con qué comando de la CLI**, porque el asistente de tesis llega en la feature siguiente.
8. **Dado** un formulario de operación en divisa distinta del euro, **cuando** se rellena, **entonces** el tipo del BCE y su fecha son campos obligatorios con su explicación (unidades por euro, tal como lo publica el BCE); en euros, el tipo es `1` y no se pregunta.
9. **Dado** un libro con eventos inválidos, **cuando** se intenta registrar cualquier cosa que no sea un cambio de configuración, **entonces** se rechaza con el motivo y el evento culpable a la vista, y se enlaza la verificación (ADR-0015).
10. **Dado** un evento registrado con éxito, **cuando** termina, **entonces** se dice qué se ha escrito, se muestran sus avisos, y se ofrece ir al evento recién creado o registrar otro; el estado de la aplicación se reproyecta una vez.

---

### Historia 7 — Arreglar lo que registré mal (Prioridad: P2)

El usuario se equivocó en una cantidad. El libro es *append-only*: editar es anular y registrar el evento corregido, y borrar es anular. La web lo hace igual que la CLI, con la lista de dependientes cuando la haya y el aviso de ejercicio anterior.

**Por qué esta prioridad**: sin rectificación, un error obliga a abrir un terminal. Va después de registrar porque se apoya en los mismos formularios y en la misma vista previa.

**Prueba independiente**: sobre una copia del *golden*, se corrige la cantidad de una compra desde la web; el fichero gana **dos** líneas (anulación y corregido), `atlas check` sigue sin hallazgos y el detalle del original queda marcado como anulado.

**Escenarios de aceptación**:

1. **Dado** el detalle de un evento, **cuando** se pide editar, **entonces** se abre el formulario de su tipo con los valores actuales, se muestran **original y corregido** lado a lado antes de escribir, y se exige un motivo.
2. **Dado** el detalle de un evento, **cuando** se pide eliminar, **entonces** se pide el motivo y una confirmación explícita, y se escribe una **anulación**: nada se borra del fichero.
3. **Dado** un evento que eventos posteriores ya consumieron, **cuando** se intenta anular o corregir, **entonces** se rechaza y se **listan los dependientes** con su motivo, diciendo que hay que rectificarlos antes (ADR-0003).
4. **Dado** un evento cuya fecha de negocio pertenece a un ejercicio anterior, **cuando** se rectifica, **entonces** se avisa de que puede afectar a una declaración ya presentada.
5. **Dado** un tipo que la CLI no permite editar (evento corporativo, tesis), **cuando** se abre su detalle, **entonces** la web ofrece solo anular y explica que se vuelva a registrar, con el mismo criterio que la CLI.
6. **Dado** una rectificación en curso, **cuando** el libro ha cambiado por fuera, **entonces** se comporta como en la Historia 6, escenario 6: conflicto visible, recarga y nueva vista previa.

---

### Historia 8 — Dar de alta cuentas y activos (Prioridad: P2)

Antes de registrar la primera compra hay que tener una cuenta y un activo. El usuario los da de alta desde la web con los mismos campos y las mismas validaciones que la CLI.

**Por qué esta prioridad**: es requisito de la primera compra, pero se hace un puñado de veces en la vida de la cartera.

**Prueba independiente**: sobre un libro vacío, se da de alta una cuenta y un activo desde la web y después se registra una compra; el libro resultante pasa `atlas check`.

**Escenarios de aceptación**:

1. **Dado** el alta de una cuenta, **cuando** se rellena, **entonces** se piden identificador, nombre, plataforma, libro (`core`/`bucket`), divisa base, país y estado, con las validaciones del dominio y el país explicado (Modelo 720).
2. **Dado** el alta de un activo, **cuando** se rellena, **entonces** se piden identificador, tipo, libro, nombre, divisa, clase de activo cuando corresponde, ISIN, *ticker*, TER, traspasabilidad, ETF de referencia y estado, con las validaciones del dominio.
3. **Dado** una cuenta o un activo existente, **cuando** se edita, **entonces** se registra el evento de actualización correspondiente con los campos completos y se avisa de los cambios que el dominio prohíbe (libro, tipo, divisa), con su motivo.
4. **Dado** un identificador ya usado, **cuando** se intenta dar de alta, **entonces** el dominio lo rechaza y el mensaje lo explica en español.

---

### Historia 9 — Configurar, y comprobar que el libro está sano (Prioridad: P2)

El usuario ajusta un umbral, cambia el porcentaje del cubo o fija los pesos objetivo. Y, de vez en cuando, quiere saber si su libro está íntegro. Las dos cosas están en Ajustes, con los avisos que ya existen: si el cambio **silencia un aviso activo** o **mueve las ganancias de un ejercicio anterior**, se dice antes de escribir.

**Por qué esta prioridad**: la configuración se toca pocas veces pero decide cómo se interpretan los datos (constitución IV), y la verificación es la red de seguridad trimestral.

**Prueba independiente**: sobre el *golden*, se sube `deviation_threshold_pp` por encima de una desviación activa y la web avisa de que ese aviso se apaga y pide confirmación; la pantalla de verificación no encuentra hallazgos.

**Escenarios de aceptación**:

1. **Dado** la configuración vigente, **cuando** se abre Ajustes, **entonces** se muestran sus parámetros con sus valores actuales, su unidad y de dónde vienen (configuración escrita o valor por defecto documentado), y los pesos objetivo con su suma.
2. **Dado** un cambio de configuración, **cuando** se guarda, **entonces** se valida con el dominio (`mergeSettings` y `validateSettings`), se escribe un `settings_changed` **completo** y los errores se explican en español nombrando el parámetro.
3. **Dado** un cambio que silencia un aviso activo, **cuando** se guarda, **entonces** se listan los avisos que se apagan y se exige confirmación (constitución IV).
4. **Dado** un cambio que mueve las ganancias realizadas de un ejercicio anterior, **cuando** se guarda, **entonces** se muestran los ejercicios afectados con el antes y el después y se exige confirmación.
5. **Dado** un cambio de configuración que deja eventos ya registrados inválidos, **cuando** se guarda, **entonces** se listan esos eventos y se exige la aceptación explícita equivalente a `--accept-invalid`, que **solo** existe para la configuración (ADR-0015).
6. **Dado** la pantalla de verificación, **cuando** se ejecuta, **entonces** se muestran los hallazgos de `integrity` y, a petición, los de la comprobación profunda, cada uno con su nivel y su explicación en español; sin hallazgos, se dice "libro íntegro".
7. **Dado** Ajustes, **cuando** se abre, **entonces** también se puede ver dónde está el libro, exportarlo, importarlo o cambiarlo, y activar el modo privacidad y el tema (claro, oscuro o el del sistema).

---

### Historia 10 — Instalarla y usarla sin conexión (Prioridad: P3)

El usuario añade la aplicación a la pantalla de inicio. La abre en el metro, sin cobertura, y funciona: el libro ya está en el dispositivo, así que puede consultar **y registrar**.

**Por qué esta prioridad**: es el remate que convierte la web en la aplicación del día a día, pero no aporta nada si las pantallas anteriores no están.

**Prueba independiente**: tras una primera visita, con el modo avión activado, la aplicación abre, muestra el Resumen y permite registrar una compra.

**Escenarios de aceptación**:

1. **Dado** una primera visita, **cuando** termina de cargar, **entonces** la aplicación es instalable (manifiesto e iconos propios, servidos desde el propio origen) y su *service worker* cachea todo lo necesario para arrancar sin red.
2. **Dado** la aplicación instalada y sin conexión, **cuando** se abre, **entonces** funciona completa: consulta y registro; **ninguna** funcionalidad depende de la red (ADR-0019).
3. **Dado** una versión nueva desplegada, **cuando** se abre la aplicación, **entonces** se actualiza sin dejar una versión antigua escribiendo sobre un libro más nuevo (el cargador rechaza un `schema_version` superior: `docs/data-schema.md` §5).
4. **Dado** cualquier carga de la aplicación, **cuando** se inspecciona la red, **entonces** **no** hay ni una petición a un origen ajeno: ni fuentes, ni iconos, ni analítica (constitución, seguridad).

---

### Casos límite

- **Sin libro configurado**: pantalla de apertura, nunca un Resumen de ceros (H1-1).
- **Libro vacío** (cero eventos): el Resumen explica el primer paso; los formularios de operación dicen que primero hace falta una cuenta y un activo.
- **Permiso del fichero revocado o carpeta movida**: mensaje explícito y botón para reconectar o reelegir; el libro no se sustituye por uno vacío.
- **El fichero cambió por fuera entre la carga y la escritura**: conflicto visible, recarga y nueva vista previa (H6-6).
- **Dos pestañas de la aplicación sobre el mismo libro**: la segunda escritura falla por etag y se comporta como un conflicto.
- **`schema_version` mayor que el soportado**: se rechaza la carga entera con su mensaje; no se escribe nada (`docs/data-schema.md` §5).
- **Línea corrupta o número en un campo monetario**: error de carga con el número de línea.
- **Eventos inválidos en el libro**: consultas degradadas con cabecera permanente; escritura bloqueada salvo configuración.
- **Anulación de un evento consumido**: rechazo con la lista de dependientes.
- **Huella repetida**: aviso y confirmación explícita.
- **Compra en el cubo sin tesis abierta**: rechazada por el dominio; la web lo advierte antes de dejar rellenar el resto.
- **Falta un precio o un tipo de cambio**: "sin dato" y total parcial; nunca cero ni interpolación.
- **Importe muy grande o con muchos decimales**: se formatea desde la cadena decimal, sin coma flotante, sin perder dígitos.
- **IndexedDB no disponible** (modo privado de Safari): se dice que ese navegador no puede guardar el libro y se ofrece la vía del fichero.
- **Almacenamiento lleno** al escribir en IndexedDB: error explícito, el libro anterior sigue intacto.
- **Cuota de la PWA / sitio borrado**: el aviso de exportación pendiente es la mitigación escrita de ADR-0019.

## Requisitos *(obligatorio)*

### Requisitos funcionales

**Paquete y calidad**

- **FR-001**: El paquete `apps/web` DEBE ser `@atlas/web`, dentro de los *workspaces* del monorepo, ESM, con `tsconfig` estricto heredado de `tsconfig.base.json`, y DEBE entrar en `npm run lint`, `npm run typecheck`, `npm test` y `npm run build` del repositorio.
- **FR-002**: El *stack* DEBE ser el de ADR-0017: Solid 1.9.x con versión fijada, `@solidjs/router`, Pico CSS vendorizada, `vite-plugin-pwa` como dependencia de desarrollo. No se añade ninguna dependencia que no esté en `docs/dependencies.md` (Q7 y Q8 recogen las dos que el ADR no previó).
- **FR-003**: `apps/web` NO DEBE usar directivas `use:` en ningún fichero, y `createEffect`/`onMount` se concentran en unos pocos ficheros de arranque (ADR-0017). Un test lo comprueba sobre las fuentes.
- **FR-004**: `apps/web` NO DEBE contener ninguna regla de negocio: todo cálculo, validación, orden, agrupación y decisión proviene de `@atlas/domain`. Lo único que vive en la web es presentación (formato, enmascarado, orden de avisos, textos).
- **FR-005**: El *bundle* de producción NO DEBE contener `node:*` ni ninguna URL a un origen ajeno, y su tamaño DEBE comprobarse contra un presupuesto en el propio `build`.
- **FR-006**: La aplicación DEBE servir una CSP restrictiva con `script-src 'self'` y sin `unsafe-inline` en producción; la CSP de desarrollo puede diferir y queda documentada (ADR-0017).
- **FR-007**: La interfaz DEBE estar en español, sin internacionalización; el código, los identificadores y los *commits*, en inglés.

**El libro en el dispositivo**

- **FR-008**: DEBE existir un adaptador nuevo del puerto `LedgerStore` para el navegador que cumpla el contrato ya probado (`packages/adapters/test/ledger-store.contract.ts`): rechazo de versiones más nuevas, `append` que conserva los bytes anteriores, `replace` que archiva antes de reescribir, conflicto por etag.
- **FR-009**: Cuando el navegador ofrezca la File System Access API, la aplicación DEBE trabajar sobre el mismo `ledger.jsonl` del disco que usa la CLI, conservando el permiso entre sesiones, y DEBE ofrecer esa vía de forma visible y preferente.
- **FR-010**: En el resto de casos el libro DEBE vivir en IndexedDB, con importación y exportación de fichero a un toque, y NO DEBE presentarse nunca como almacén definitivo (ADR-0019).
- **FR-011**: La aplicación DEBE decir en todo momento y de forma visible **dónde está el libro** que se está viendo: nombre del fichero, o almacenamiento del navegador.
- **FR-012**: Con el libro en IndexedDB, la aplicación DEBE mostrar **cuándo se exportó por última vez** y avisar si hace más de siete días o nunca.
- **FR-013**: La exportación DEBE producir un fichero idéntico al contenido almacenado, byte a byte.
- **FR-014**: Importar el adaptador del navegador NO DEBE arrastrar `node:fs` al *bundle*; se comprueba sobre el contenido y el tamaño del *bundle*, no se supone.
- **FR-015**: Toda escritura DEBE hacerse con `append` y el etag como control de concurrencia. Si el libro cambió por fuera, el conflicto se muestra, el libro se recarga y **nunca** se sobrescribe.

**Carga, proyección y estado**

- **FR-016**: Al abrir un libro, la aplicación DEBE cargarlo y proyectarlo **una vez** con `collectErrors: true`, y guardar el resultado en el estado; ninguna pantalla vuelve a proyectar salvo para otra fecha (`asOf`) o tras escribir.
- **FR-017**: Toda vista con fecha DEBE proyectar con `asOf` (ADR-0016) y, además, filtrar las tesis por su fecha administrativa (`docs/data-schema.md` §7.1).
- **FR-018**: Si el libro tiene eventos inválidos, DEBE mostrarse una **cabecera de aviso permanente** con su número y un enlace a la verificación; las consultas siguen funcionando y el registro queda bloqueado salvo para `settings_changed`.
- **FR-019**: Los estados de carga, vacío y error DEBEN ser visibles y sobrios: ni pantallas en blanco, ni *spinners* eternos, ni ceros donde falta un dato.
- **FR-020**: Los errores del dominio DEBEN presentarse en español a partir de su `code`, con el mismo criterio que la CLI; un código desconocido cae al mensaje del dominio y nunca se traga.

**Privacidad y formato**

- **FR-021**: DEBE existir un único componente por el que pasen **todos** los importes y **todas** las cantidades de la aplicación, con el modo privacidad **activado por defecto** y su estado recordado en el dispositivo.
- **FR-022**: Con el modo activado, importes y cantidades se enmascaran; porcentajes, pesos, desviaciones, fechas y textos siguen visibles. El enmascarado es de la **presentación de datos**: un campo de formulario que el usuario está rellenando no se enmascara (A3, Q6).
- **FR-023**: El interruptor de privacidad DEBE estar a un toque desde cualquier pantalla.
- **FR-024**: Un test DEBE recorrer el grafo de importaciones de `apps/web` y fallar si el formateador de importes y cantidades se usa fuera del componente único.
- **FR-025**: Los números DEBEN formatearse desde su cadena decimal, sin coma flotante, con coma decimal española y separador de miles, tabulares y alineados a la derecha, con el mismo número de decimales dentro de una columna.
- **FR-026**: El color NO DEBE ser el único portador de significado: una ganancia y una pérdida se distinguen también por el signo y por su etiqueta.

**Navegación y accesibilidad**

- **FR-027**: DEBE haber **una sola** navegación de destinos: barra inferior con cuatro destinos y acceso destacado a registrar en pantalla estrecha, rail lateral en pantalla ancha, nunca las dos a la vez.
- **FR-028**: NO DEBE haber un título centrado ocupando una banda; el título de cada pantalla es el primer encabezado del contenido.
- **FR-029**: Cada pantalla DEBE tener una URL legible y navegable, y el botón atrás DEBE hacer lo esperado; los filtros de la lista viajan en la URL.
- **FR-030**: Los objetivos táctiles DEBEN medir al menos 44 px, el orden de tabulación DEBE ser coherente, el foco visible, y todo alcanzable con teclado.
- **FR-031**: NO DEBE haber desplazamiento horizontal a 360 px en ninguna pantalla; las tablas densas se reorganizan en tarjetas o filas de dos alturas.
- **FR-032**: Los destinos reservados (Núcleo, Cubo) DEBEN existir y decir con calma qué llegará en la feature siguiente y qué comando de la CLI lo responde hoy.

**Resumen**

- **FR-033**: El Resumen DEBE mostrar el patrimonio **desglosado** (núcleo, cubo, efectivo) con su total y su marca de parcialidad, tal como lo devuelve `netWorth`.
- **FR-034**: DEBE mostrar los avisos activos ordenados por importancia, cada uno con su explicación en español y un enlace a donde se arregla; sin avisos, lo dice con calma.
- **FR-035**: DEBE mostrar los cinco o seis últimos movimientos con acceso al libro completo.
- **FR-036**: Los precios DEBEN mostrarse con su antigüedad y su marca de caducidad; sin precio, "sin dato".

**Movimientos**

- **FR-037**: La lista DEBE mostrar los eventos en orden cronológico inverso, con el orden calculado por el dominio.
- **FR-038**: DEBE permitir filtrar por tipo, cuenta, activo y rango de fechas, y buscar por texto, combinando filtros y diciendo cuántos eventos quedan.
- **FR-039**: DEBE paginar o cargar progresivamente; veinte años de libro no se pintan de una vez.
- **FR-040**: El detalle DEBE mostrar todos los campos del evento con nombres legibles, su estado (vigente, anulado, corrección de otro) y sus enlaces (orden, solicitud, tesis, original o corrección).
- **FR-041**: La lista y el detalle DEBEN cubrir **todos** los tipos de evento del esquema, incluidos los que esta feature no registra.

**Registro**

- **FR-042**: DEBEN existir formularios para `buy`, `sell`, `cash_deposit`, `cash_withdrawal`, `dividend`, `valuation` y `order_placed`, más el alta y la edición de cuentas y activos.
- **FR-043**: Los formularios DEBEN usar las validaciones del dominio (`validateShape` y la proyección) y **nunca** reglas propias.
- **FR-044**: Antes de escribir, DEBE mostrarse la vista previa del evento y de su efecto: posiciones y lotes antes y después, ganancias generadas y avisos del propio evento.
- **FR-045**: Una huella repetida DEBE avisar y exigir confirmación explícita (equivalente a `--confirm-duplicate`).
- **FR-046**: En el móvil, los campos numéricos DEBEN abrir teclado numérico, las fechas usar el selector nativo, y cuentas, activos, divisas, órdenes y tesis elegirse de una lista.
- **FR-047**: Una compra en una cuenta del cubo DEBE exigir una tesis abierta de ese par (cuenta, activo) y, si no hay ninguna, decir cómo crearla con la CLI.
- **FR-048**: Cada formulario DEBE cubrir **todos** los campos que el dominio define para su tipo de evento, u omitirlos explícitamente por escrito; un test lo comprueba contra `knownFieldsOf`.

**Rectificación**

- **FR-049**: Editar DEBE producir anulación más evento corregido; eliminar, solo la anulación. El libro nunca se edita ni se borra (ADR-0003).
- **FR-050**: Ambas DEBEN exigir un motivo y mostrar antes y después.
- **FR-051**: Si el evento tiene dependientes, DEBE rechazarse listándolos con su motivo.
- **FR-052**: Si el evento pertenece a un ejercicio anterior, DEBE avisarse de que puede afectar a una declaración presentada.

**Ajustes y verificación**

- **FR-053**: Ajustes DEBE mostrar y permitir cambiar la configuración con las validaciones del dominio, escribiendo un `settings_changed` completo.
- **FR-054**: Un cambio que silencie un aviso activo DEBE listarlo y exigir confirmación.
- **FR-055**: Un cambio que mueva las ganancias de un ejercicio anterior DEBE mostrarlo y exigir confirmación.
- **FR-056**: Un cambio que deje eventos inválidos DEBE listarlos y exigir la aceptación explícita que solo la configuración admite.
- **FR-057**: DEBE existir una pantalla de verificación con `integrity` y la comprobación profunda, con los hallazgos explicados en español.
- **FR-058**: Ajustes DEBE incluir la gestión del libro (dónde está, exportar, importar, cambiar), el modo privacidad y el tema.

**PWA**

- **FR-059**: La aplicación DEBE ser instalable y abrir sin conexión con todas sus funciones, incluido el registro.
- **FR-060**: NO DEBE haber ninguna petición a un origen ajeno en ninguna carga.

### Entidades clave

- **LedgerSource**: de dónde sale el libro. Fichero del disco (con su nombre visible y su permiso) o almacenamiento del navegador (con la fecha de su última exportación). Es lo que el usuario ve en el chip y lo que decide qué adaptador se compone.
- **LedgerSnapshot**: el libro cargado una vez: eventos, líneas crudas, etag y estado proyectado con `collectErrors`. Fuente única de todas las pantallas.
- **DatedProjection**: el mismo libro proyectado a una fecha (`asOf`), memoizado por fecha; lo consume el patrimonio y lo consumirán las vistas analíticas de la feature siguiente.
- **AttentionItem**: un aviso ordenado por importancia, con su texto en español y el destino donde se arregla. Se construye a partir de los avisos e inválidos del dominio, sin inventar ninguno.
- **MovementRow**: una fila del libro: evento, fecha de negocio, estado (vigente, anulado, corrección) y enlaces. La ordenación y el estado los calcula el dominio.
- **EventFormSpec**: la descripción de un formulario (campos, etiquetas, teclado, obligatoriedad, origen de las opciones), análoga a `ADD_SPECS` de la CLI. Datos puros y comprobables contra el esquema del dominio.
- **DevicePreferences**: lo que es del dispositivo y no del libro: modo privacidad, tema y la referencia al último libro abierto.

## Criterios de éxito *(obligatorio)*

### Resultados medibles

- **SC-001**: A 360 px de ancho, **ninguna** pantalla tiene desplazamiento horizontal y **todos** los controles miden al menos 44 × 44 px.
- **SC-002**: Cargar y proyectar el libro sintético (200 eventos) tarda menos de **50 ms** en el portátil de referencia (medido: 4 ms de decodificación y 1,2 ms de proyección en caliente, 5 ms en frío) y el umbral de alarma del prompt (100 ms) no se alcanza hasta el orden de **10.000 eventos**; el valor real del móvil se anota al terminar.
- **SC-003**: Registrar una compra desde el Resumen se hace en **cinco toques o menos** antes de la vista previa, y la vista previa se ve **siempre** antes de escribir.
- **SC-004**: **Cero** importes pintados fuera de `Amount` (test de arquitectura) y **cero** reglas de negocio en `apps/web` (revisión y tests).
- **SC-005**: El *bundle* servido (JS + CSS, gzip) se mantiene por debajo de **120 KB** y su valor medido queda anotado en `plan.md`; el *runtime* antes de nuestro código sigue en el orden de los 42 KB de ADR-0017.
- **SC-006**: **Cero** peticiones de red a orígenes ajenos en cualquier carga, comprobado en el panel de red y en el contenido del *bundle*.
- **SC-007**: Con el modo avión activado y tras una primera visita, la aplicación abre, muestra el Resumen y permite registrar una compra.
- **SC-008**: **El 100 %** de los avisos mostrados en el Resumen llevan a la pantalla donde se arreglan.
- **SC-009**: La web abre el `ledger.jsonl` del *golden* sintético, escribe una compra y `atlas check --deep` sobre el fichero resultante **no** encuentra hallazgos nuevos.
- **SC-010**: El usuario ve en toda pantalla de qué libro se está hablando y, en IndexedDB, cuándo exportó por última vez.

## Supuestos

Los supuestos A1-A11 correspondían a las preguntas de `questions.md` y **están confirmados por la respuesta del usuario del 2026-09-18**, salvo A3, que cambió. El detalle de cada respuesta está en `questions.md`.

- **A1 (Q1)**: la vista previa del efecto de un evento candidato se **mueve al dominio** como caso de uso (hoy vive en `apps/cli/src/commands/shared.ts`), y la CLI pasa a usarla. La web no reimplementa la vista previa.
- **A2 (Q2, confirmado)**: la lista del libro (orden cronológico inverso, estado de cada evento, fecha de negocio y filtros estructurados) se añade como **proyección del dominio**; la web solo pinta y pagina. Decisión (h).
- **A3 (Q6, cambiado por la respuesta del usuario)**: el modo privacidad enmascara **importes y cantidades**, como manda `docs/specification.md` §9.6; porcentajes, pesos, desviaciones, fechas y textos siguen visibles. El prompt §3.4 decía lo contrario y se ha corregido. El enmascarado es de la presentación de datos, no de la entrada de un formulario.
- **A4 (Q3, confirmado con condición)**: la web tiene su **propio catálogo de mensajes en español** por código, con la remediación adecuada a la web, y el test anti-deriva comprueba que **las dos** interfaces cubren todos los códigos del dominio, fallando si aparece uno sin traducir en cualquiera de ellas. Decisión (i).
- **A5 (Q4, confirmado)**: la comparación "qué avisos silencia este cambio de configuración" se **mueve al dominio**, junto a `movedFiscalYears` (hoy vive en `apps/cli/src/commands/catalogue.ts`). Decisión (h).
- **A6 (Q5, confirmado)**: la vía del fichero usa el **selector de carpeta**, no el de fichero, para poder escribir `archive/` como la CLI y para que el permiso cubra el libro y sus archivos. Decisión (j).
- **A7 (Q7, autorizada)**: `vite-plugin-solid` entra como dependencia **de desarrollo** y ya está registrada en `docs/dependencies.md`.
- **A8 (Q8, confirmado)**: se empieza **sin** entorno de DOM: la lógica de presentación se prueba como funciones puras, la regla del componente único con un test **sobre el grafo de importaciones**, y los flujos de escritura sobre la capa de acciones **comprobando los bytes del fichero**, más la verificación manual del criterio §5. `happy-dom` queda pre-autorizada para pedirla con un caso concreto si una pantalla crítica se queda sin red. Decisión (k).
- **A9 (Q9, confirmado)**: uPlot **no** se vendoriza en esta feature (no hay gráficas en el alcance); llega con la feature de las vistas analíticas. El árbol del prompt §3.1 ya lo recoge.
- **A10 (Q10, confirmado)**: el punto de ruptura entre barra inferior y rail es **768 px**, con una sola `<nav>` conmutada por CSS.
- **A11 (Q11, confirmado)**: el Resumen proyecta con `asOf` = hoy en Europe/Madrid, igual que `atlas networth` sin `--date`.
- **A12**: el idioma de la interfaz es el español, sin internacionalización, y los formatos son los españoles (coma decimal, `dd/mm/aaaa` en la lectura, `YYYY-MM-DD` en los campos de fecha nativos).
- **A13**: la aplicación es de un solo usuario y sin autenticación, porque no hay servidor ni datos remotos (ADR-0019); la protección es la del dispositivo.
