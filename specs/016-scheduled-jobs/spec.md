# Especificación de la feature: tareas programadas y correo (`016-scheduled-jobs`)

**Rama**: `feature/016-scheduled-jobs`, creada a mano desde `origin/develop` (`ae66814`, la fusión de la PR #98, con la 015 entera dentro: `git log origin/develop..origin/feature/015-api-access` sale vacío).

**Creada**: 2026-09-27 (Europe/Madrid)

**Estado**: **aceptada por la dirección el 2026-09-27** (`questions.md` §9). E1 en construcción.

**Entrada**: `docs/prompts/016-scheduled-jobs.md` entero, con las respuestas de §8.1 (P1-P18, P6 bis y la regla de `--yes`) y las decisiones de §8.2 (B1, B2, M1-M7, m1-m3). Además: ADR-0028 con sus notas, ADR-0034 entera, ADR-0029, ADR-0031 y ADR-0032 con sus enmiendas y notas, ADR-0033 («Consecuencias»), ADR-0027 («Riesgo»), ADR-0026, ADR-0018 y ADR-0022; `docs/specification.md` §5, §7, §9.2-§9.6, §11.7 y §11.8; `docs/business-rules.md` §7; `docs/data-schema.md` §1; `docs/api.md` §1, §2, §6, §7 y §9; `docs/decision-roadmap.md` (Ronda 8, la entrada de la 016 y «Etapas pendientes»); `docs/prompts/015-api-access.md` §2-§2 ter y §5, y `specs/015-api-access/questions.md` de §20 en adelante. Constitución 1.6.2. **Si el encargo y la hoja de ruta o una ADR discrepan, mandan la hoja de ruta y la ADR**, y la discrepancia va a `questions.md`.

---

## Resumen

Hasta hoy, todo lo que Atlas hace lo hace porque el usuario abre la consola o la web. Esta feature construye **lo que la nube hace sola**: unas tareas que se despiertan cada día, hacen su trabajo sobre el bucket de datos y, cuando hay algo que hacer, escriben un correo al usuario. Se prueba entera con dobles de S3, SSM, SES, del BCE y de las fuentes de precios. **No se despliega nada, no se llama a AWS, a SES, al BCE ni a ninguna fuente de precios real, y no se gasta nada** (§7.1 (o) del encargo).

Se entrega en **cuatro partes**, una rama y una PR por entrega (partición confirmada, §8.1 P2):

| Entrega | Qué deja funcionando |
|---|---|
| **E1** | El esqueleto de las tareas, el puerto `Notifier` con su adaptador de SES, el destinatario y el interruptor de importes, la redacción de los correos sin importes y **el recordatorio mensual** de principio a fin, con la fecha del último inicio de sesión web que escribe la API |
| **E2** | **Los datos del día en la nube**: el BCE y los cierres diarios, sus almacenes en S3, las claves de las fuentes en SSM, el cupo compartido, la fuente simulada de `dev`, `atlas admin prices push` y los hallazgos que esas tareas dejan para el correo |
| **E3** | **Los dispositivos beben de la nube**: la consola baja de la API los precios que ya bajó la nube, la web del móvil descarga el histórico del BCE (y los precios), y `notification_email` sale de las fotos nuevas y de Ajustes |
| **E4** | **Copias, integridad y avisos periódicos**: el volcado mensual con `positions.json`, la integridad y el ensayo de restauración trimestrales con el aviso de tamaño del libro, los avisos semanales, la Renta en enero, los umbrales del 720 y el 721, y los procedimientos |

Siete reglas atraviesan la feature (§0 del encargo):

1. **Lo que sale por correo sale del perímetro.** Ningún correo lleva un importe, una cantidad, un precio, un nombre de activo, un ISIN, un símbolo ni una cuenta salvo que el usuario haya activado el interruptor, que vive en SSM y nunca en `Settings`. Con él activado, tampoco una cuenta ni un ISIN.
2. **Una tarea se ejecuta más de una vez.** Cada tarea deja un registro por periodo, escrito de forma condicional, y cada escritura en dos pasos tiene su test de corte entre los dos.
3. **El bucket no tiene cerrojo.** Lo que en local es una transacción bajo el cerrojo de la carpeta es, en la nube, una secuencia de escrituras condicionales objeto a objeto, con cada estado intermedio de fallo seguro y reconocido. **Un solo escritor por objeto.**
4. **Una sola clave, un solo cupo.** La nube y la consola comparten las claves de EODHD y Alpha Vantage y su cupo diario; la consola deja de pedir lo que ya bajó la nube. Las reglas de la 013 no cambian.
5. **Ningún precio llega a la fiscalidad, tampoco por correo.** El aviso del 720 y el 721 sale solo de las valoraciones manuales.
6. **Solo la función de correo envía.** Las demás tareas dejan sus hallazgos en su registro de ejecución y nunca tienen permiso de SES; la función de correo nunca alcanza una clave de fuente.
7. **Nada se registra** que sea un destinatario, un remitente, el asunto o el cuerpo de un correo, un importe, una posición, una cuenta, un `asset_id`, un símbolo, un ISIN, una clave de fuente, un token, un correo o un `sub`, ni el mensaje de un error ajeno.

## Escenarios de usuario y pruebas

Todo se prueba **sin AWS**: cada tarea se compone con dobles de S3 (las cuatro salidas verificadas en la 015: `200`, `404`, `409`, `412`), de SSM, de SES, del BCE y de las fuentes de precios, con un `Clock` fijo, y los correos se entregan como texto con un `Notifier` de fichero que no viaja al alcance de la composición de producción (plan §11).

### Historia 1 — El recordatorio mensual llega siempre, sin importes salvo que se activen (Prioridad: P1, E1)

Cada mes, el usuario recibe un correo en texto plano, en español, que le recuerda la aportación del mes con el reparto calculado por clase del núcleo en porcentajes, cuántos días hace del último inicio de sesión (web o consola), cuántos tokens de consola siguen vivos y cuántos se emitieron en el mes, y la orden exacta para hacer la copia fuera de AWS. Si el cliente OAuth se acerca a los seis meses sin uso, el correo lo avisa. Si el libro no se puede leer o no hay precios, el correo llega igual y dice qué no pudo calcular.

**Por qué esta prioridad**: es lo único que la constitución (V) exige que llegue siempre, y es lo más caro de equivocarse: lo que sale por correo queda para siempre en el proveedor del usuario.

**Prueba independiente**: se compone la función de correo con los dobles, un libro sintético sembrado de importes, cantidades, precios, nombres de activos, ISIN y cuentas centinela, y el `Notifier` de fichero; se renderiza cada correo con el interruptor apagado y encendido y se compara con la lista exacta de lo que puede aparecer.

**Escenarios de aceptación**:

1. **Dado** el interruptor apagado (o ausente, o con un valor que no se entiende), **cuando** la función de correo redacta el recordatorio, **entonces** el cuerpo lleva las clases del núcleo, porcentajes, recuentos, fechas y códigos, y **ninguno** de los centinelas.
2. **Dado** el interruptor encendido, **entonces** aparecen además, **exactamente**, los euros del reparto de la aportación (uno por clase y el total), con su valor, y **nunca** una cuenta, un ISIN, un símbolo ni un nombre de activo.
3. **Dado** un libro inválido o sin precios, **entonces** el correo llega igual y dice, con su código, qué no pudo calcular.
4. **Dado** que el último inicio de sesión (el mayor entre la fecha que escribe la API al iniciar sesión la web y el `issued_at` de los tokens de consola) se acerca a los seis meses, **entonces** el correo lo avisa antes de que el cliente OAuth pueda borrarse por falta de uso.
5. **Dado** el registro de tokens de SSM con uno vivo, uno revocado, uno caducado y uno ilegible, **entonces** el correo cuenta **uno** vivo y **dice** que hay un registro ilegible; nunca lo omite ni lo cuenta como vivo.
6. **Dado** un corte entre enviar el correo y apuntar el envío, **entonces** el reintento lo vuelve a enviar (al menos una vez), con el identificador del periodo en el asunto para que un duplicado se reconozca.
7. **Dado** `job_frequencies` que intenta apagar el recordatorio mensual, o que trae una clave o un valor desconocidos, **entonces** el recordatorio se envía igual, el libro sigue válido, y el registro de la tarea y Ajustes dicen qué se ignoró.

### Historia 2 — Cada tarea hace su trabajo una sola vez por periodo, aunque la invoquen varias veces (Prioridad: P1, E1)

EventBridge Scheduler despierta cada función una vez al día. Una función pura del dominio dice, con `job_frequencies`, el día en `Europe/Madrid` y el registro de la última ejecución, si cada tarea de esa función toca hoy. La tarea reclama su periodo con una escritura condicional antes de hacer nada y lo cierra al terminar. Un reintento de Scheduler o de Lambda nunca manda un aviso dos veces, nunca gasta dos veces el cupo y nunca escribe dos volcados.

**Por qué esta prioridad**: es el esqueleto que usan todas las demás tareas, y un error aquí se multiplica por cada una.

**Prueba independiente**: tests de la función pura en los bordes (cambio de hora de marzo y octubre, fin de mes, 31 de diciembre a las 23:30 frente al 1 de enero en Madrid) y tests de corte entre reclamar y hacer y entre hacer y cerrar, contra el doble de S3.

**Escenarios de aceptación**:

1. **Dado** un evento de Scheduler con un campo desconocido, que no es JSON, o con una tarea que esa función no tiene en `ATLAS_JOBS`, **entonces** se niega con su código y no hace nada.
2. **Dado** una tarea ya cerrada en su periodo, **cuando** llega otra invocación, **entonces** no hace nada y lo registra con su código.
3. **Dado** un corte entre reclamar y hacer, **entonces** la invocación siguiente reconoce el periodo reclamado sin cerrar y lo termina (recordatorio mensual: lo reenvía; avisos: no los reenvía si el envío ya consta).
4. **Dado** el 31 de diciembre a las 23:30 en Madrid (22:30 UTC), **entonces** el periodo es el de diciembre y el año el que termina; a las 00:30 del 1 de enero en Madrid (23:30 UTC del 31), el de enero y el año nuevo.
5. **Dado** una variable `ATLAS_*` desconocida o que no se entiende, o un fallo del SDK al componer, **entonces** la función no arranca y registra solo un código y el nombre del error, nunca su mensaje.

### Historia 3 — La nube baja cada día los tipos del BCE y los cierres, y avisa solo si hay algo que hacer (Prioridad: P2, E2)

Cada día, una función descarga el histórico del BCE (primero el ZIP, la API si falla) y lo activa en `reference/ecb/` solo si contiene, con el mismo valor, todos los tipos del anterior; otra descarga los cierres de los activos del libro remoto con la cascada de la 013, su cupo, `symbols.json` subido por el usuario, nunca el día en curso y nunca una correspondencia sin contrastar. Una fuente que llega a su umbral de fallos seguidos, una tesis del cubo con el horizonte vencido o un hallazgo del BCE quedan en el registro de la tarea, y la función de correo los avisa una vez por racha.

**Por qué esta prioridad**: sin ella los dispositivos no tienen de dónde beber, y el móvil sigue sin precios ni tipos.

**Prueba independiente**: los mismos tests de contrato que los almacenes de carpeta, contra el doble de S3, y un test de corte en cada hueco de cada secuencia de escrituras.

**Escenarios de aceptación**:

1. **Dado** un corte entre dos escrituras de la activación del BCE, **entonces** ningún lector ve el fichero nuevo con el manifiesto viejo como si cuadrara, y la ejecución siguiente termina o deshace lo que quedó a medias.
2. **Dado** un conflicto de S3 al reservar una llamada o al añadir cierres, **entonces** la ejecución aborta sin reintentar, **nunca** devuelve una llamada ya reservada y **nunca** deja una línea de cierre a medias.
3. **Dado** `dev` sin claves, **entonces** la tarea no descarga, no cuenta fallos seguidos, no deja hallazgos y lo registra con su código. **Dado** `ATLAS_ENV=prod` y la fuente simulada configurada, **entonces** la composición se niega a arrancar.
4. **Dado** una fuente con cuatro fallos seguidos de una misma racha, en días distintos, y el umbral en tres, **entonces** el usuario recibe **un** correo por esa racha; `not_found` y `budget_exhausted` no cuentan.
5. **Dado** el usuario que ejecuta `atlas admin prices push --env prod`, **entonces** ve la diferencia con el `symbols.json` remoto, confirma tecleando `prod`, y el objeto se escribe con `If-Match` sobre esa misma lectura; con `--yes`, sin terminal, con `misstored` o con un formato más nuevo, no escribe nada.

### Historia 4 — La consola y el móvil beben de la nube sin gastar el cupo dos veces (Prioridad: P2, E3)

En una carpeta sincronizada cuya nube tiene precios, `atlas prices update` baja de la API lo que la nube ya bajó y lo añade con las reglas de la 013, sin llamar a EODHD ni a Alpha Vantage salvo con una opción explícita que dice que gasta el cupo compartido. La web del móvil, con sesión, descarga el histórico del BCE (y los precios) de la API cuando el usuario lo pide o abre la tarjeta del BCE, comprueba el SHA-256 contra el manifiesto y no usa lo que no cuadra. Ajustes deja de ofrecer `notification_email`, y ninguna foto nueva de `settings_changed`, de la web o de la consola, lo lleva.

**Por qué esta prioridad**: cierra «una sola clave, un solo cupo» (ADR-0031) y el punto 3 de ADR-0029 («en el móvil, cuando exista la nube»).

**Prueba independiente**: la consola contra el cliente HTTP de la 015 con un servidor doble y fuentes que fallan si se las llama; la web en Chromium contra el servidor local de la 015, con capturas medidas.

**Escenarios de aceptación**:

1. **Dado** una carpeta sincronizada cuya nube tiene precios, **cuando** se ejecuta `atlas prices update` sin la opción explícita, **entonces** ninguna fuente externa recibe una llamada y la red se usa fuera del cerrojo.
2. **Dado** un cierre local y otro de la nube para la misma fecha, **entonces** se añade la línea solo si las reglas de la 013 lo añaden, y nunca se reescribe un byte local.
3. **Dado** un histórico descargado por la web cuyo SHA-256 no cuadra con su manifiesto, **entonces** no se usa y se dice. Nada se descarga al arrancar ni por temporizador.
4. **Dado** un libro con una línea `settings_changed` antigua que lleva `notification_email`, **entonces** carga igual; una foto nueva escrita desde la web o la consola ya no lo lleva.

### Historia 5 — Copias que no se sobrescriben, integridad comprobada y avisos que solo llegan cuando hay algo que hacer (Prioridad: P3, E4)

Cada mes, la nube vuelca en `backups/<YYYY-MM>/` el libro byte a byte, el histórico del BCE en vigor con su manifiesto, `prices/` entero y `positions.json`, sin sobrescribir nunca un objeto. Cada trimestre recalcula todo, ensaya la restauración en memoria comparando con el libro vivo cortado en los mismos eventos, e informa del tamaño del libro, avisando al pasar de 1 MB. Cada semana avisa de las desviaciones del núcleo por encima de su umbral y de las reglas del cubo; en enero, de que los datos de la Renta están listos; y una vez al año, de los umbrales del 720 y el 721 calculados solo con valoraciones manuales.

**Por qué esta prioridad**: depende de E1 y E2, y lo que escribe es para siempre.

**Prueba independiente**: tests de corte entre objetos del volcado, del ensayo de restauración con un volcado alterado, del umbral de tamaño justo por encima, y del 720 con cierres automáticos posteriores sembrados que harían saltar el aviso.

**Escenarios de aceptación**:

1. **Dado** un volcado cortado entre dos objetos, **entonces** el reintento lo termina sin pisar lo escrito; un objeto que ya existe con otros bytes se niega y se avisa.
2. **Dado** un volcado que difiere del libro vivo cortado en los mismos eventos, **entonces** la función de correo avisa diciendo qué difiere, sin importes salvo el interruptor.
3. **Dado** cierres automáticos posteriores a las valoraciones manuales que superarían el umbral del 720, **entonces** el aviso no salta.
4. **Dado** una semana sin desviaciones por encima del umbral ni reglas del cubo incumplidas, **entonces** no sale ningún correo.

### Casos límite

- El cambio de hora de marzo y de octubre en `Europe/Madrid`; fin de mes; 31 de diciembre a las 23:59 frente al 1 de enero; la medianoche GMT del cupo de EODHD, que no cambia (§8.1 P15).
- Un `asset_id` cuyo `priceFileName` lleva `%`, `! ' ( ) * ~`, un `_` o un `-` al principio, un punto inicial o más de 128 o de 255 caracteres (§8.2 M1).
- Un parámetro de SSM ausente, ilegible o limitado (`ThrottlingException`); SES que rechaza; una fuente que responde 401; S3 que da `AccessDenied`; la función sin configuración.
- Un registro de ejecución ilegible, o de un formato más nuevo.
- Un `symbols.json` del bucket ilegible, de un formato más nuevo o con `misstored`.
- Un evento de Scheduler con una clave repetida o un suplente suelto.
- El libro remoto ausente (la nube sin inicializar): cada tarea lo dice y no inventa nada.

## Requisitos

### Requisitos funcionales

**Esqueleto (E1)**

- **FR-001**: Las tareas DEBEN vivir en un paquete propio (`@atlas/jobs`, `apps/jobs`) que importa el dominio y los adaptadores y que **nada importa**; un único artefacto, construido una vez, y una función por familia de permisos (BCE, precios, correo, volcado e integridad), cada una con su rol y su lista cerrada de tareas (`ATLAS_JOBS`).
- **FR-002**: El evento de Scheduler DEBE leerse de forma estricta; cualquier otra forma se niega con su código sin hacer nada.
- **FR-003**: Qué toca hoy DEBE decidirlo una función pura del dominio a partir de `job_frequencies`, del día en `Europe/Madrid` y del registro de la última ejecución, con un conjunto cerrado de claves y valores, lectura tolerante (lo desconocido se ignora, se usa el valor por defecto y se dice) y escritura estricta. El recordatorio mensual NO se puede apagar.
- **FR-004**: Cada tarea DEBE reclamar su periodo con `If-None-Match: *` y cerrarlo con `If-Match`, con la conducta de cada reintento en cada estado escrita en el plan: el recordatorio mensual, al menos una vez; los avisos, como mucho una vez.
- **FR-005**: Solo la función de correo DEBE enviar correo. Las demás tareas dejan sus hallazgos en su registro de ejecución, bajo `jobs/`, y la función de correo los lee, los envía y apunta la racha para avisar una vez por racha.
- **FR-006**: Cada función DEBE leer su configuración de variables `ATLAS_*` con la regla de la API (una desconocida o que no se entiende impide arrancar), sin ningún secreto en una variable de entorno.

**Correo (E1)**

- **FR-007**: El puerto `Notifier` DEBE recibir un mensaje ya redactado (asunto y cuerpo en texto plano) y **nunca** el destinatario, que pone el adaptador de SES leyéndolo de SSM; un destinatario que no es una dirección válida no envía.
- **FR-008**: El interruptor de importes DEBE tener un solo lector, la composición de la tarea, con la regla «ausente o que no se entiende = sin importes», y la redacción DEBE recibir el valor ya interpretado.
- **FR-009**: La redacción de cada correo DEBE ser una función pura del dominio, en español, texto plano sin HTML, sin nada remoto ni enlaces de seguimiento; con el interruptor apagado no lleva nada de la lista de §8.1 P9, y con él encendido añade exactamente las cifras en euros que fija el plan.
- **FR-010**: Un fallo transitorio de SSM o de SES DEBE ser un fallo con código, nunca un envío dado por hecho.

**Recordatorio mensual (E1)**

- **FR-011**: El recordatorio DEBE llegar siempre, con el reparto de la aportación (`contributionPlan`, y la nota `weights_use_approximation` cuando aplique), los días desde el último inicio de sesión (web o consola) con el aviso antes de los seis meses, los tokens de consola vivos y emitidos en el mes (un registro ilegible se cuenta como tal) y el recordatorio de la copia fuera de AWS con su orden exacta. Valora con lo que haya en el bucket (valoraciones manuales o precios ya subidos) y dice lo que no pudo calcular.
- **FR-012**: La API DEBE escribir, al terminar cada inicio de sesión de la web, un objeto con **solo** la fecha del último inicio de sesión web, con `If-Match` para que solo avance, sin `sub`, sin correo y sin dispositivo.

**Datos del día (E2)**

- **FR-013**: DEBEN existir almacenes de S3 para `reference/ecb/` y `prices/` que cumplan los mismos tests de contrato que los de carpeta, sin `rename` ni cerrojo, con cada estado intermedio de fallo seguro y un test de corte en cada hueco.
- **FR-014**: La tarea de precios DEBE reutilizar `updatePrices`, con los activos y su prioridad del libro remoto, `symbols.json` del bucket, y los presupuestos, el orden de las fuentes y el umbral de fallos seguidos como configuración de la función (18 y 23 por defecto); nunca el día en curso; nunca una correspondencia sin contrastar; nunca escribe `symbols.json` ni lee un `prices/config.json` en la nube.
- **FR-015**: Las claves de las fuentes DEBEN leerse de SSM en cada ejecución, nunca en una variable de entorno ni en un registro, y censuradas en toda URL que llegue a un error. Sin claves, la tarea no descarga, no cuenta fallos ni deja hallazgos.
- **FR-016**: La fuente simulada de `dev` DEBE ser la única excepción declarada al guardián de los dobles: viaja en el artefacto y la composición se niega a usarla con `ATLAS_ENV=prod`.
- **FR-017**: `atlas admin prices push` DEBE subir solo `prices/symbols.json`, sin estado local, enseñando la diferencia con el remoto, pidiendo que se teclee el entorno, rechazando `--yes`, saliendo con 4 sin terminal y escribiendo con `If-Match` sobre esa misma lectura (o `If-None-Match: *`); se niega con `misstored`, con un fichero ilegible o de un formato más nuevo.
- **FR-018**: `REFERENCE_NAME` DEBE validar por ida y vuelta con `priceFileName`, con 255 caracteres como máximo, y `_status.json` no se sirve.

**Dispositivos (E3)**

- **FR-019**: En una carpeta sincronizada cuya nube tiene precios, `atlas prices update` DEBE bajar de la API y no llamar a las fuentes salvo con una opción explícita; lo bajado se añade con las reglas de la 013, conservando `source` y `fetched_at`, con la red fuera del cerrojo. `atlas prices status` dice de dónde vinieron los precios y cuándo. La consola sigue bajando el BCE del BCE.
- **FR-020**: La web, con sesión, DEBE poder descargar el histórico del BCE (y los precios, si caben en la autorización del paquete) de la API solo a petición o al abrir la tarjeta del BCE, comprobando el SHA-256 contra el manifiesto, en carga diferida y sin cambiar la CSP.
- **FR-021**: Ajustes DEJA de ofrecer `notification_email`; el cargador lo sigue aceptando; una regla del dominio, usada por la web y la consola, lo quita de toda foto nueva de `settings_changed`; la lista congelada de claves de `Settings` y el generador sintético no cambian.

**Copias, integridad y avisos (E4)**

- **FR-022**: El volcado mensual DEBE escribir cada objeto de `backups/<YYYY-MM>/` con `If-None-Match: *`, dejar un objeto ya existente con los mismos bytes, negarse y avisar si tiene otros, y terminar un mes a medias en el reintento.
- **FR-023**: La tarea trimestral DEBE recalcular desde cero, ensayar la restauración del último volcado en memoria contra el libro vivo cortado en los mismos eventos (comparación del dominio), e informar del tamaño del libro avisando por encima del umbral configurable (1 MB por defecto).
- **FR-024**: Los avisos periódicos (desviaciones del núcleo y reglas del cubo semanales, Renta en enero, 720 y 721 anual) DEBEN salir solo cuando hay algo que hacer, con los umbrales de `Settings`, y el del 720 y el 721 calculado solo con valoraciones manuales, por la misma función que usa el modelo.
- **FR-025**: Los procedimientos DEBEN escribirse en `specs/016-scheduled-jobs/runbooks/` y probarse contra los dobles en el estado exacto que deja el paso anterior, sin dejar datos personales ni secretos en el historial del *shell*.

**Transversales**

- **FR-026**: Nada de lo que prohíbe la regla 7 del resumen DEBE aparecer en un registro, ni en los caminos de fallo; el registro de una tarea dice su nombre, su periodo y su resultado con código y recuentos.
- **FR-027**: Ninguna tarea, adaptador ni test nuevo DEBE leer la hora real fuera del adaptador del reloj.
- **FR-028**: Ninguna orden nueva que escriba en el bucket, envíe un correo o no se pueda deshacer DEBE aceptar `--yes`.
- **FR-029**: La salida fiscal (`tax` con `--lots`, `--boxes` y `--json`, `gains`, `income`, `m720`, `m721`, `filed`) NO DEBE moverse, y ningún fichero dorado cambia.
- **FR-030**: Lo que la feature añade a la web DEBE ir en carga diferida: el arranque no sube; el total, lo medido y como mucho 3 KB por encima del techo de partida.

### Entidades

- **Evento de Scheduler**: lo que la programación manda a la función; nombra la tarea (o la pasada diaria) y nada más.
- **Registro de ejecución** (`jobs/…`): por tarea y periodo, reclamado y cerrado de forma condicional; lleva el resultado con código, recuentos y los hallazgos para el correo, sin nada de la regla 7.
- **Hallazgo y racha**: lo que una tarea deja para avisar, con su código; la función de correo apunta la racha para avisar una vez por racha.
- **Mensaje**: asunto y cuerpo en texto plano ya redactados; sin destinatario.
- **Destinatario e interruptor de importes**: dos `String` de SSM que escribe Terraform desde `terraform.tfvars`.
- **Claves de las fuentes**: dos `SecureString` de SSM que crea el guion de secretos.
- **Último inicio de sesión web**: un objeto del bucket con solo una fecha, que la API solo hace avanzar.
- **Volcado mensual** y **`positions.json`**: la copia para siempre y la proyección valorada legible sin la aplicación.

## Criterios de éxito

- **SC-001**: Con el interruptor apagado, **cero** centinelas de la lista de §8.1 P9 aparecen en ningún correo renderizado, en ningún camino (feliz o de fallo).
- **SC-002**: Con el interruptor encendido, aparecen exactamente las cifras que fija el plan, cada una con su valor exacto, y ninguna otra.
- **SC-003**: Cualquier número de invocaciones repetidas en un mismo periodo produce **como mucho un** aviso y **al menos un** recordatorio mensual, y **cero** llamadas de más a una fuente.
- **SC-004**: Ningún registro, en ningún camino, contiene un centinela de la regla 7.
- **SC-005**: Cada regla de la tabla del plan tiene un test y un mutante que lo rompe, visto morir.
- **SC-006**: La salida fiscal da los mismos bytes con y sin `prices/` de la nube, y `git diff tests/fixtures` sale vacío.
- **SC-007**: El arranque del paquete web no crece ni un byte, y el total crece como mucho 3 KB.
- **SC-008**: `packages/domain` al 100 % de líneas, ramas, funciones y sentencias en su propia pasada, y la cuenta de tests de los ficheros de guardianes igual o mayor que en `develop`.

## Supuestos

- La 017 crea la infraestructura (programaciones, roles, identidad de SES, parámetros de SSM con los nombres y formatos que fija este plan); esta feature entrega la lista de permisos y los formatos, no los recursos.
- Las tareas bloqueadas por los importadores (IBKR diario, conciliación semanal, rotación del token Flex) quedan fuera (§4 del encargo).
- La condición de invalidación de una tesis es texto libre y no genera aviso (§8.2 B1).
- `alert_channels` no se implementa (§8.1 P17); su redacción se propone en `questions.md`, apartado «Documentos».
- La única dependencia externa nueva es `@aws-sdk/client-sesv2@3.1141.0`, autorizada por el usuario, que se instala en E1 tras el bloque 0.
