# ADR-0035 — Atlas siempre en la nube: el libro de S3 como única fuente de verdad, sin cola local

**Estado:** Aceptada (2026-10-06), por la persona (decisión transmitida por la coordinadora de DESBASTE). Desarrolla la decisión de la persona del mismo día. **Enmienda en parte ADR-0019 y ADR-0026** (cada una lleva una nota que remite aquí) y obliga a poner notas en ADR-0015, ADR-0027, ADR-0029, ADR-0032 y ADR-0033 (lista en «Documentos y tareas afectados»). Incluye la enmienda de la constitución (principio VI, versión 2.0.0), **que no se aplica aquí sino en E0**, con `/speckit-constitution`. Ningún criterio fiscal cambia. Las preguntas abiertas están resueltas (sección «Resueltas»).

## Resumen en llano

- **Atlas pasa a ser una web en Internet.** Entras con tu cuenta de Google desde el móvil o el ordenador y ves siempre el mismo libro. Todo lo que registras se guarda en la nube al momento. El dispositivo no guarda nada para subirlo después.
- **Lo que ya no podrás hacer:** registrar sin conexión, usar la web sin iniciar sesión e importar un fichero de libro en la web. Desaparecen la pantalla «Sincronización» y «lo retenido», junto con sus botones de unirse, rehacer y descartar, y el aviso «sin exportar».
- **Sin conexión**, la aplicación se abre pero solo dice «Sin conexión», con un botón para reintentar. No enseña cifras ni deja registrar. Si la conexión se corta con la aplicación abierta, oculta los datos al momento. Cuando vuelve, carga el libro otra vez.
- **Si registras desde dos sitios a la vez**, el segundo ve «El libro ha cambiado; revisa y confirma otra vez». Nada se mezcla sin que lo veas.
- **Si se corta la red justo al guardar**, la aplicación lo comprueba al volver y te dice si la operación se guardó o no. Nunca la guarda dos veces.
- **La consola (`atlas`)** también trabaja contra la nube, con el token que ya tiene. Sin conexión no hace nada. `atlas backup` sigue haciendo copias en tu disco. Y si algún día la nube desaparece, la consola puede abrir una de esas copias y trabajar sobre ella en tu ordenador.
- **Copias:** el botón «Descargar copia» de la web y `atlas backup` son, desde ahora, **las únicas copias fuera de AWS**: los dispositivos ya no guardan una réplica. El correo mensual lo recuerda.
- **Hasta que la nube esté desplegada** (features 018 y 019), la web actual sigue como está.

## Contexto

**La decisión de la persona (2026-10-06).** Atlas será una aplicación web en la nube, siempre sincronizada: se entra con Google desde cualquier sitio y se ve el mismo libro. La persona no quiere guardar cambios en el dispositivo para subirlos después: **sin conexión no se registra nada**. El libro de la nube (`ledger/ledger.jsonl` en S3) pasa a ser **la única fuente de verdad**. La web escribe directamente contra la API, con escritura condicional (etag e `If-Match`), sin cola local de pendientes y sin libro en IndexedDB.

**Lo que esto deshace.**

- ADR-0019 hizo la web *local-first*: el libro en IndexedDB, registro sin conexión, sin autenticación, y exportar e importar como forma de pasar el libro de un sitio a otro.
- ADR-0026 añadió la nube como capa sobre lo local. Cada dispositivo guardaba una cola de pendientes, que se reaplicaba sobre el remoto. Lo que ya no cabía quedaba retenido para que decidiera el usuario. Eso exigía once casos de conflicto, un marcador, `held.jsonl`, `discarded.jsonl`, unirse, volver a descargar y rehacer.
- **La opción 1 de ADR-0026, «Solo se escribe con conexión»,** se descartó entonces por un solo motivo: rompía el registro sin conexión que había prometido ADR-0019. La persona invierte ahora esa prioridad: una sola fuente de verdad pesa más que registrar sin red.

**Por qué ahora cuesta poco.** Las features 014 y 015 construyeron la cola y la API, pero **no hay nada desplegado**. La 018 (desplegar `dev`) y la 019 (`prod`, con la primera subida del libro real) siguen pendientes (`docs/decision-roadmap.md`). El protocolo de la cola **no ha hablado nunca con una nube real**, así que no hay clientes antiguos que migrar en el servidor.

**Restricciones que siguen pesando:**

- La API es la única que escribe el libro en S3, solo añade y valida cada línea con el dominio (ADR-0026, Parte A; `docs/api.md` §5.2).
- CloudFront sobrescribe `Authorization`, y cada `POST` lleva `x-amz-content-sha256` (ADR-0027).
- Credenciales: la cookie de sesión en la web (8 h en ADR-0027; **24 h** con esta ADR, pregunta 6) y el token de dispositivo en la consola (ADR-0027, ADR-0033).
- Registros sin importes, líneas, cuentas, tokens, correos ni `sub`.
- Coste mínimo con alarma (ADR-0028, ADR-0034).
- El libro es *append-only* (ADR-0003) y se carga entero en memoria (ADR-0002).

## Opciones consideradas

1. **Mantener ADR-0026: cola local por dispositivo.** *Ventajas:* se registra sin conexión, y ya está construido y probado. *Inconvenientes:* son dos sitios con datos. Lo que se ve antes de sincronizar puede cambiar después. Hay que resolver a mano lo retenido. Y es justo lo que la persona no quiere.
2. **Solo nube: escritura directa con `If-Match` y nada del libro guardado en el dispositivo** (elegida). *Ventajas:* una sola fuente de verdad. No hay fusión, así que los once casos de ADR-0026 desaparecen del cliente. Se retira mucho código. Y el cliente OAuth de Google se usa a diario, con lo que deja de correr el riesgo de borrado por seis meses sin uso (ADR-0027). *Inconvenientes:* sin conexión no hay aplicación. AWS y Google quedan en el camino crítico del uso diario. Y las réplicas de los dispositivos dejan de ser una copia de seguridad gratuita.
3. **Nube como fuente, con una copia de solo lectura guardada en el dispositivo** para consultar sin conexión. *Ventajas:* se puede consultar sin red. *Inconvenientes:* deja datos financieros en el dispositivo y presenta como actual algo que puede no estarlo. La persona recomienda no mostrar nada que pueda confundir. **Descartada.**
4. **Como la 2, pero si la conexión se pierde con la aplicación abierta, seguir enseñando lo que hay en memoria**, marcado como de solo lectura. *Inconvenientes:* tras una escritura cortada, la pantalla enseña un estado del que no se sabe si incluye la operación. Y abrir la aplicación sin conexión se comportaría distinto que perderla con la aplicación abierta. **Descartada** por la misma recomendación.

## Decisión

Se elige la **opción 2**.

### 1. Qué se retira y qué se conserva

| Se retira | Viene de |
|---|---|
| El libro de la web en IndexedDB (`BrowserLedgerBlob`, claves `current` y `current:meta`) y la petición de almacenamiento persistente | ADR-0019 |
| Importar un libro en la web y vincular la carpeta de la consola (para leer de ella el libro o el histórico del BCE) | ADR-0019 y su enmienda del 2026-09-24 |
| El aviso «sin exportar» (`EXPORT_REMINDER_DAYS` = 7), `heldOwed` y la exportación como vía de paso de datos entre dispositivos | ADR-0019; `docs/data-schema.md` §1 |
| «Sin conexión no se pierde ninguna funcionalidad» y «no hay autenticación» | ADR-0019 |
| «Capa, no sustituto»: que todo dispositivo guarde el libro entero y funcione sin la nube | ADR-0026, Parte A |
| La cola por dispositivo, con todo lo que la acompaña: `sync/state.json`, `sync/held.jsonl`, `sync/discarded.jsonl`, las claves `sync:*` de la web, `ledger.held.jsonl`, inicializar o unirse como sincronización, volver a descargar, rehacer, descartar y desactivar | ADR-0026, Parte B, y sus notas |
| Publicar el estado de la cola (`PUT /api/sync/devices/self` y los campos `pending` y `held`) y la negativa de `compact` y de la restauración por líneas pendientes | ADR-0026, paso 7; ADR-0032; `docs/api.md` §5.3 |
| La cabecera `x-atlas-expected-device`: sin un almacén unido a un dispositivo, ya no protege nada | `docs/api.md` §5.4 |
| Las réplicas de los dispositivos como capa 1 de las copias | ADR-0032 |
| Los cierres de precios guardados en la web: los nombres de los ficheros dicen qué activos se tienen | feature 016, E3 |

**Se conserva:**

- **El dominio puro compartido** (ADR-0001, ADR-0007). La web y la consola descargan el libro entero y lo proyectan, simulan y calculan en el cliente. La API valida con el mismo código. El motivo de ADR-0001 de «consultar sin conexión» deja de valer, pero su decisión no cambia: tiene sus otros motivos.
- **La API como único escritor, que solo añade y valida cada línea** (ADR-0026, Parte A; `docs/api.md` §5.2). Sigue todo: el rechazo por línea, la pareja y la cadena como una sola unidad, el sello de una presentación, la tolerancia del reloj, `waiver_not_appendable` y la confirmación de una huella repetida.
- **Las rutas del libro:** `GET /api/ledger`, `POST /api/ledger/lines` y `PUT /api/ledger`. Esta última, solo para **la subida inicial a una nube vacía** y para la restauración (ADR-0032): no es una sincronización.
- **Las rutas de referencia** (§6), **el acceso** (ADR-0027, ADR-0033) y **los objetos de dispositivo como identidad**: sirven para olvidar un navegador o una consola y para listar los tokens.
- **Las operaciones de líneas crudas del puerto `LedgerStore`**: las usan la API, la inicialización y la restauración.
- **`compact` y la restauración**, como operaciones de administración sobre el remoto (ADR-0032, pasos 1 a 5). El paso 6, que hacía que cada dispositivo detectara la reescritura, queda sin objeto: el siguiente `412` recarga el libro.
- **La Parte C de ADR-0026**: una sola corrección viva por raíz. Es una regla del dominio.
- **En el dispositivo, solo lo que no es dato personal:**
  - el *shell* de la aplicación, en la caché del *service worker*;
  - las preferencias de la interfaz, como el modo privacidad;
  - la copia del histórico del BCE en IndexedDB, que es pública e igual para cualquiera (se conserva, pregunta 4).

### 2. Leer y escribir en la web

- **Al arrancar**, la web pide `GET /api/session`. Sin sesión, solo enseña «Entrar con Google». Con sesión, pide `GET /api/ledger`, comprueba que el `ETag` es el SHA-256 de los bytes (como hoy), carga el libro con el cargador del dominio y lo proyecta una vez (FR-016 de la feature 006). Si el libro tiene una versión de esquema más nueva que la de la web, se niega y pide actualizar la aplicación.
- **Un adaptador nuevo, `ApiLedgerStore`** (nombre propuesto), implementa `LedgerStore` sobre HTTP:
  - `load()` es `GET /api/ledger`;
  - `append(events, etag)` serializa cada evento con `encodeLine` y lo envía en un `POST /api/ledger/lines` con `If-Match: "<etag>"`;
  - `replace`, `appendLines` y `replaceLines` se niegan: la web nunca compacta ni restaura.

  **Los casos de uso no cambian**: `recordEvent`, `correctEvent`, `reverseEvent` y la cadena de correcciones de tipos (`writeRateCorrections`) siguen cargando el libro, validando y añadiendo con el etag de su carga.
- **Las declaraciones de la petición las deduce el adaptador:**
  - `has_correction` y `chain_continues`, de la forma del lote: anulación seguida de su corrección, o una cadena;
  - `confirm_duplicate`, por unidad, con las huellas del libro cargado más la unidad entera (miembros posteriores incluidos): la misma regla que aplica la API (`docs/api.md` §5.2, fila 7).

  Es correcto porque el caso de uso **ya se negó** si no había confirmación, y `If-Match` garantiza que la API juzga exactamente los mismos bytes. Es la misma regla que ya rige al inicializar (`docs/api.md` §5.5). *Alternativa descartada:* que el puerto reciba las confirmaciones. Cambiaría todos los adaptadores para no ganar nada mientras haya `If-Match`.
- **Toda escritura de un caso de uso es una sola unidad** (un evento, una pareja o una cadena), así que la API la acepta entera o no la acepta. Una aceptación parcial no debería ocurrir: si ocurre, el adaptador la trata como fallo interno, recarga y dice qué quedó escrito.
- **Qué hace la web con cada respuesta:**
  - **`200`, todo aceptado:** recarga y vuelve a proyectar.
  - **`200` con `rejected`:** un error nuevo del dominio con el código de la API (nombre propuesto: `remote_rejected`). No se escribió nada. Significa que el cliente y la API no están de acuerdo: una versión, el reloj, un sello. Se dice con la frase de su código y **ni se retiene ni se reintenta solo**.
  - **`412`:** `ConflictError`, como hoy (FR-015). La web recarga y **vuelve a construir la vista previa del mismo formulario** sobre el libro nuevo; el formulario sigue en memoria. Dice que el libro ha cambiado y **pide confirmar otra vez**. **Nunca reintenta sola y nunca fusiona.**
  - **`401` o `403` de credencial:** no se escribió nada; la web lleva al inicio de sesión. Antes de abrir un formulario, avisa si a la sesión le quedan menos de 15 minutos (pregunta 6).
  - **Fallo de red, `5xx` o `transport_rejected` después de enviar:** el resultado se desconoce. El identificador de cada evento se fija **antes** de enviar. Cuando hay conexión, la web recarga y busca ese `id`. Si está, la operación se registró; si no está, no se escribió nada y se ofrece reintentar con los mismos datos. Reintentar es seguro: si la operación ya estaba, la API la rechaza por `duplicate_id`.
- **Coste de cada escritura.** Cada escritura vuelve a descargar el libro (la carga del caso de uso y la comprobación de FR-015). Con un libro de pocos MB en veinte años (ADR-0002), está aceptado; el plan puede quitar la carga duplicada.

### 3. Sin conexión

- **No se muestra nada** (opción 2 frente a la 4; recomendación de la persona).
  - **Al abrir sin conexión:** el *shell* sale de la caché del *service worker* y enseña «Sin conexión» con «Reintentar». Ni cifras, ni formularios, ni el último estado.
  - **Si se pierde la conexión con la aplicación abierta** (el evento `offline` o una petición que falla por red): la web oculta al momento las vistas de datos y los formularios. Al volver, **recarga siempre** el libro antes de enseñar nada.
  - **Una escritura en curso** sigue la regla del resultado desconocido (§2).
- ***Service worker*:**
  - precarga solo el *shell*, con los patrones de hoy (`js`, `css`, `html`, `svg`, `png`, `webmanifest`);
  - no tiene ninguna regla de caché en tiempo de ejecución para `/api/*`;
  - mantiene `navigateFallbackDenylist: [/^\/api\//]`.
- **Toda respuesta de `/api/*` lleva `Cache-Control: no-store`**, el libro y los cierres incluidos, para que la caché HTTP del navegador no lo guarde en disco. La base de `apps/api/src/respond.ts` ya lo pone; un test lo comprueba ruta a ruta. Las rutas del BCE pueden conservar `ETag` y `304`.
- **Un test de la web recorre lo que queda en el dispositivo tras una sesión** (almacenes de IndexedDB, claves de `localStorage` y entradas de la caché). Ni libro, ni cierres, ni borradores, ni estado de sincronización. Solo el *shell*, las preferencias de la interfaz y la copia pública del BCE.
- **No hay nada que migrar.** Todavía no existe ningún libro real, ni en un navegador ni en una carpeta de la consola (pregunta 2), así que la web no ofrece descargar ni subir lo que hubiera en el navegador. Los almacenes que retira esta ADR se dejan de usar sin más.

### 4. La consola

- **Una carpeta es de nube o es local, nunca las dos.**
  - **De nube:** tiene el fichero de identidad de hoy (`sync/remote.json`, con `origin` y `device_id`; el plan puede moverlo de sitio si lo justifica) y **no tiene `ledger.jsonl`**. Toda orden que lee o escribe el libro usa `ApiLedgerStore` con el token de dispositivo (ADR-0033). Sin conexión, la orden falla, dice que no ha leído ni registrado nada y sale con un código propio. Con el token caducado, remite a `atlas remote login`.
  - **Local:** tiene `ledger.jsonl` y no tiene identidad remota. Sirve para cuatro cosas:
    - desarrollo y pruebas, con datos sintéticos;
    - la prueba anual de restauración (ADR-0032);
    - abrir una copia;
    - seguir trabajando si la nube desaparece.
  - **Una carpeta con las dos cosas se niega** (nombre propuesto: `folder_mode_ambiguous`), con instrucciones.
- **No hay ningún camino que sincronice lo local con la nube:**
  - **Para subir:** `PUT /api/ledger`, solo sobre una nube vacía (la subida inicial, o una cuenta nueva), o `atlas admin restore` (ADR-0032), que compara por identificador y pide confirmar.
  - **Para bajar:** `atlas backup`.
  - `compact` sigue negándose en una carpeta de nube (no tiene libro) y funciona como siempre en una local.
  - `acceptInvalid` nunca llega a la nube, porque la API rechaza una proyección inválida. Solo vale en local, como ya decía la nota de ADR-0015 para un libro sincronizado.
- **`atlas backup --to <dir>`, en una carpeta de nube:**
  - baja el libro por la API con el token y comprueba que el SHA-256 coincide con el `ETag`;
  - escribe una copia con fecha que nunca sobrescribe otra;
  - la deja **de solo lectura** (`0444`), para que no se escriba en ella por descuido y nazca un segundo libro.

  `--from-bucket` sigue como hoy para `documents/` e `imports/`, con el rol de administración. `atlas export` (JSONL o CSV) funciona en los dos modos.
- **La carpeta de nube conserva copias de los datos de referencia** que baja de la API (`reference/ecb/` y `prices/`, como hace hoy la feature 016, E3; pregunta 5). Nunca el libro, ni borradores, ni una cola. Es el ordenador del usuario, junto a `credentials.json` (pregunta 5).
- **«Datos exportables en cualquier momento»** (constitución VI) se cumple sin que importar o exportar sea una vía de sincronización:
  - el botón **«Descargar copia»** de la web, que baja el libro byte a byte en JSONL y también en CSV;
  - `atlas backup`;
  - `atlas export`;
  - el volcado mensual a `backups/` (ADR-0032, capa 3).

  El libro sigue siendo un JSONL legible sin la aplicación.

### 5. Desarrollo y pruebas

- **Sin AWS.** El servidor local de pruebas (`apps/api/test/support/local-server.ts`) compone **el manejador real** con los dobles de S3, SSM y Google y sirve `apps/web/dist`. Pasa a ser el camino documentado de desarrollo. `npm run dev` lleva `/api` a ese servidor con el *proxy* de Vite, solo en desarrollo.
- **Sigue siendo solo de pruebas.** El test de arquitectura que impide que el producto lo alcance no cambia. Solo datos sintéticos (feature 003); nunca datos de producción.
- **`ApiLedgerStore` pasa los tests de contrato de `LedgerStore`** contra el manejador con dobles: carga, añadido, conflicto, versión más nueva, rechazo por línea y resultado desconocido. Las operaciones de líneas crudas quedan fuera, porque las niega.

### 6. Seguridad, privacidad, coste y constitución

**Seguridad.**

- La superficie no crece: la API ya existe con estas rutas.
- **Gana el móvil perdido.** Un teléfono robado sin sesión viva ya no guarda el libro. Con una sesión viva (24 h como mucho), da lectura y escritura, como hoy.
- **Pierde la consola.** El token robado daba antes escritura y seguir leyendo; la lectura ya la daba la réplica de al lado. Ahora el token es lo único que da acceso, así que la revocación (ADR-0033, punto 8) pesa más. No cambia ninguna regla.

**Privacidad.** CloudWatch sigue sin importes, líneas, posiciones, cuentas, tokens, correos ni `sub`. Los `details` de un rechazo pueden llevar cifras: van solo al cliente y **nunca a un registro**, como ya dice `docs/api.md` §5.2. Los códigos nuevos entran en la lista de lo que se puede registrar.

**Coste.**

- No hay ningún servicio nuevo.
- Cada sesión hace del orden de tres peticiones (sesión, libro y referencia), y cada escritura, dos `GET` y un `POST`. Con un usuario, eso son cientos o pocos miles de peticiones al mes: muy lejos del millón del plan Free de CloudFront (ADR-0028) y del nivel gratuito de Lambda.
- El coste de las lecturas de S3 de un objeto de pocos MB: estimado en céntimos al mes y **SIN VERIFICAR**; la 018 lo mide.
- La estimación de **≈ 0,01-0,05 $/mes** no debería moverse. Los datos móviles serán unos pocos MB por sesión a veinte años, porque CloudFront no comprime `application/x-ndjson` (`docs/api.md` §5.1).

**Disponibilidad.** Si AWS o Google fallan, no hay uso diario. La salida es la consola en local sobre la última copia, y después `atlas admin restore`. Es un riesgo aceptado por la persona con esta decisión.

**Constitución. Lo que contradice, dicho explícitamente:**

- **VI, «Cero servicios de pago de terceros en el camino crítico»: contradicho.** AWS (de pago) y Google (gratuito) pasan al camino crítico del uso diario. Hasta hoy no lo estaban, porque la nube era una capa (ADR-0026, Parte A). **Enmienda aceptada, sin aplicar todavía** (se aplica en E0, con `/speckit-constitution`). Texto propuesto:

  > «El uso diario depende de AWS, con coste mínimo y alarma de presupuesto, y del acceso con Google (ADR-0035). La supervivencia no depende de ellos: el libro se descarga en un clic, `atlas backup` hace copias verificadas fuera de AWS y la consola trabaja sobre una copia local sin ningún servicio.»

  Versión: **2.0.0 (MAJOR)**, decidida por la persona (pregunta 3): la enmienda redefine el principio VI, y por eso no sigue el precedente MINOR de la 1.6.0.
- **VI, «exportable a CSV/JSON en un clic»: se mantiene**, con «Descargar copia».
- **V, «se muestra el último valor conocido con su antigüedad marcada»: no se contradice**, porque se refiere a las fuentes de precios y de referencia, que siguen igual. El libro sin conexión no se enseña, y se dice: es un fallo visible, no un silencio. Se propone una aclaración PATCH que lo diga.
- **I, «Toda operación se registra en el momento de operar»: tensión, no contradicción.** Sin conexión no se puede registrar. Pero operar en la plataforma del bróker también exige conexión, así que el momento de operar es un momento con red. La regla 20 del plan queda así; la persona lo acepta con esta decisión.
- **Restricciones técnicas:** sin cambios. «Validación siempre en el backend» pasa a cubrir toda escritura.

### 7. Plan de implementación

Va **antes de la 018**, para que el protocolo de la cola no llegue nunca a una nube real. Las estimaciones son de orden de magnitud, **sin medir**: incluyen leer el contexto, el código, los tests y una ronda de revisión; `desbaste:medir` puede calibrarlas con las features anteriores.

| Entrega (una PR) | Contenido | Riesgo | Esfuerzo y tokens aproximados |
|---|---|---|---|
| **E0 — Documentos** | Esta ADR aceptada. Notas en ADR-0015, 0027, 0029, 0032 y 0033 (las de 0019 y 0026 ya están). `docs/specification.md` §9.2 y §9.6. `docs/data-schema.md` §1 y §5. `docs/api.md` §3 (sesión de 24 h), §5.3, §5.4 y §5.7, más el cliente de escritura directa. La enmienda de la constitución, versión 2.0.0, con `/speckit-constitution`. La fila del *stack* de `CLAUDE.md`. `docs/decision-roadmap.md` (018 y 019). La FR-059 y la historia 10 de `specs/006-web-shell/spec.md` | Bajo | S · 0,2-0,4 M |
| **E1 — `ApiLedgerStore`** | El adaptador, las declaraciones deducidas, el error `remote_rejected`, el resultado desconocido buscado por `id` y los tests de contrato contra el manejador con dobles | Medio: es el núcleo de la corrección | M · 0,6-1,0 M |
| **E2a — Web: leer y sin conexión** | El arranque por sesión y libro, la pantalla «Entrar con Google», la pantalla «Sin conexión», `no-store` comprobado y el *proxy* de desarrollo. El test de lo que queda en el dispositivo | Medio: techos del paquete y estados de arranque | M · 0,7-1,2 M |
| **E2b — Web: escribir** | Los formularios sobre `ApiLedgerStore`, el `412` guiado, el resultado desconocido, «Descargar copia» (JSONL y CSV) y el aviso de sesión (menos de 15 minutos). Fuera del producto: el libro en IndexedDB, importar, la carpeta, el aviso «sin exportar» y la tarjeta de sincronización | Alto: es lo que la persona usa a diario | M · 0,7-1,2 M |
| **E3 — Consola** | Modo de nube y modo local, `folder_mode_ambiguous`, el código de salida sin conexión, `backup` y `export` por la API y la subida inicial a una nube vacía | Medio | M · 0,6-1,0 M |
| **E4 — API** | Retirar `PUT /api/sync/devices/self`, la obligación de `x-atlas-expected-device` y la negativa por pendientes de `compact` y de la restauración. Los objetos de dispositivo se conservan como identidad. Si la cabecera se quita de la política de origen, es un cambio pequeño de `infra/`, solo con `plan` | Bajo-medio | S-M · 0,4-0,7 M |
| **E5 — Código muerto** | Borrar el motor de la cola del cliente (`packages/adapters/src/sync/` salvo `http-remote` y `api-ledger-store` (E1), y en el dominio sobreviven `unitsOf` y `entriesOf`, de los que depende este último; el almacén de sincronización del navegador y la descarga de lo retenido), los módulos del dominio que solo usa la cola, `atlas sync` y la interfaz de sincronización. **Se conserva lo que importa la API** (`acceptAppend` y sus dependencias), y el grafo lo decide. El dominio, al 100 % | Medio: borrar algo que aún usa la API | M · 0,5-0,9 M |
| **E6 — Borradores** (pregunta 1) | Borradores en la nube por la API, como objetos que nunca se borran y se marcan confirmados o descartados. **Hasta que llegue E6, los clientes de nube no tienen borradores** | Medio | M · 0,6-1,0 M |

**Total orientativo: ≈ 4,3-7,4 M de tokens.** Si el presupuesto aprieta, E5 puede esperar: el código muerto no cambia lo que se ve. Y E4 se puede reducir a lo mínimo, porque `pending` siempre será cero. **La 018 y la 019 cambian sus pruebas:** «dos dispositivos sincronizando» pasa a ser «dos dispositivos escribiendo contra la nube, con un `412` y su reintento guiado».

## Consecuencias

- **Más fácil:**
  - una sola fuente de verdad;
  - nada que conciliar entre dispositivos;
  - sin pantalla de lo retenido;
  - mucho menos código que mantener veinte años;
  - un teléfono perdido no guarda el libro;
  - el cliente OAuth se usa a diario.
- **Más difícil:**
  - sin conexión no hay aplicación;
  - AWS y Google en el camino crítico;
  - cada escritura cuesta una ida y vuelta;
  - las copias fuera de AWS dependen de que el usuario las haga, porque la capa 1 de ADR-0032 desaparece;
  - registrar exige sesión (24 h en la web).
- **Riesgos aceptados**, con esta decisión de la persona: no hay uso sin conexión; una caída de AWS o de Google deja sin uso diario; un formulario a medias se pierde si se recarga la página o caduca la sesión.

### Documentos y tareas afectados

- **Notas de enmienda parcial** cuando se acepte:
  - en **ADR-0019** y **ADR-0026**, que ya llevan su nota de enmienda;
  - en **ADR-0032**: la capa 1, la tabla de qué falla, el paso 6 y la negativa por pendientes;
  - en **ADR-0027**: la salida de emergencia «sobre la réplica local» pasa a ser la consola en local sobre una copia;
  - en **ADR-0029**: en la web, el BCE llega desde la nube (con su copia pública en IndexedDB), y los borradores pasan a la nube (E6), sin borradores en los clientes de nube hasta entonces;
  - en **ADR-0027**, además: la sesión de la web pasa de 8 h a 24 h (`docs/api.md` §3);
  - en **ADR-0033**: el alcance del token ya no incluye publicar su cola;
  - en **ADR-0015**: `acceptInvalid` vale solo en local;
  - en **ADR-0001**: su motivo de consulta sin conexión decae, y la decisión se mantiene.
- **Documentos:**
  - `docs/specification.md` §9.2, §9.6 (sincronizar desde la web; «funciona sin conexión para consulta») y §12;
  - `docs/data-schema.md` §1 (las filas de `sync/*`, `sync:*`, `ledger.held.jsonl`, `current:meta` y `drafts/`) y §5 (IndexedDB, y la negativa de `compact` en una carpeta de nube);
  - `docs/api.md` §2.3, §5.3, §5.4, §5.7 y §8;
  - `docs/runbooks/restore-the-ledger.md` y `stolen-google-account.md`;
  - `README.md`, por el aviso de una semana sin exportar;
  - `CLAUDE.md`, en la tabla del *stack*.
- **Specs:**
  - `specs/006-web-shell` (FR-013 y FR-059, historia 10);
  - `specs/014-ledger-sync-core` y `specs/015-api-access` (E4), que quedan como históricas, con una nota que remita aquí;
  - `specs/012-ecb-reference-rates`, por la lectura del BCE desde la carpeta en la web.
- **`docs/decision-roadmap.md`:** las pruebas de la 018 y la 019 y el orden de las entregas.

## Preguntas abiertas

## Resueltas

Respuestas de la persona (2026-10-06, transmitidas por la coordinadora de DESBASTE).

1. **Borradores (ADR-0029).** Hoy viven en el dispositivo (`drafts/` en la carpeta y el almacén `drafts` de IndexedDB), lo que choca con «nada en el dispositivo para registrarlo después». **Resuelta:** (a) **en la nube**, por la API, como objetos que nunca se borran (el rol de la API no tiene permiso de borrado) y se marcan confirmados o descartados; y (b) **sin borradores en los clientes de nube mientras no esté la entrega E6**. Descartada la opción de dejarlos en el dispositivo como excepción.
2. **¿Dónde está hoy el libro real?** **Resuelta:** no existe todavía ningún libro real, ni en los navegadores ni en la consola. Por eso se ha retirado de esta ADR cualquier migración desde el navegador (§3 y plan de entregas, E2b incluida). `PUT /api/ledger` queda solo para la subida inicial y la restauración.
3. **Versión de la enmienda constitucional.** **Resuelta:** **2.0.0**. El texto propuesto sigue en §6 y se aplica en E0 con `/speckit-constitution`, no con esta ADR.
4. **La copia pública del BCE en la web.** **Resuelta:** se conserva en IndexedDB.
5. **Las copias de referencia de la consola en modo de nube** (`reference/ecb/` y `prices/`). **Resuelta:** se conservan, como ya hace la 016.
6. **La sesión de la web** (`docs/api.md` §3). **Resuelta:** **24 h**, y antes de abrir un formulario la web avisa si quedan menos de 15 minutos. Esto cambia las 8 h de ADR-0027 y de `docs/api.md` §3 (E0).
7. **Comprimir `GET /api/ledger`.** **Resuelta:** sin comprimir hasta que el tamaño del libro lo pida (aviso de ADR-0028).
8. **Importaciones de extractos futuras** (Ronda 6). **Resuelta:** se aplazan a la ADR de la importación automática, que decidirá si una importación es «todo o nada». Hoy la API escribe el tramo válido hasta el primer rechazo.
