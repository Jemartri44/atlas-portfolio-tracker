# Especificación de la feature: API y acceso (`015-api-access`)

**Rama**: `feature/015-api-access`, creada desde `origin/develop` (`b3e2fcb`, la fusión de la PR #89 con el encargo revisado en tres rondas). El código es el de `f7ba7e4`, sobre el que se escribió el encargo: `git diff --stat f7ba7e4..b3e2fcb -- packages apps tests` sale vacío.

**Creada**: 2026-09-25 (Europe/Madrid)

**Estado**: **borrador para el alto del plan**. Espera el visto bueno de la dirección junto con [`plan.md`](plan.md) y [`questions.md`](questions.md). No hay ni una línea de código de producción.

**Entrada**: `docs/prompts/015-api-access.md` entero, con sus respuestas de §7 (P1-P16) y las enmiendas de §7.1 bis (B1-B5, N1-N12, R2-B1, R2-B2, R2-N1, R2-N2). Además: ADR-0027, ADR-0033, ADR-0026, ADR-0032 y ADR-0034, las cinco enteras y con sus notas; ADR-0028 con sus notas; ADR-0015 y sus tres notas; ADR-0003, ADR-0012, ADR-0018, ADR-0019, ADR-0025, ADR-0029 y ADR-0031. También `docs/api.md` entero, `docs/data-schema.md` §1 y §5, `docs/decision-roadmap.md` (Ronda 8 y «Etapas pendientes»), `docs/specification.md` §9.2, §9.5, §9.6, §10, §11.7 y §11.8, y `specs/014-ledger-sync-core/` (`questions.md` y `deferred/`). Constitución 1.6.2. **Si el encargo y una ADR discrepan, manda la ADR**, y la discrepancia va a `questions.md`.

---

## Resumen

Hasta hoy Atlas funciona entero sin servidor (ADR-0019), y la 014 dejó escrito y probado el motor de la sincronización contra un remoto simulado. Esta feature **abre la primera puerta a Internet**: una API que solo sabe añadir líneas al libro compartido. Solo pueden llamarla la web de un usuario de la lista permitida, con una sesión obtenida en Google, y la consola, con un token propio de dispositivo. Además construye las interfaces para sincronizar y las órdenes de administración que reescriben el remoto. Se prueba entera con dobles de S3, SSM y Google. **No se despliega nada, no se llama a AWS ni a Google y no se gasta nada.**

Se entrega en **cinco partes**, cada una con su PR contra `develop` desde esta rama (partición confirmada, §7 P2 del encargo):

| Entrega | Qué deja funcionando |
|---|---|
| **E1** | El esqueleto de la API, el inicio de sesión de la web con Google, la sesión y el registro de los dispositivos de la web |
| **E2** | El token de dispositivo de la consola: emitirlo, comprobarlo, renovarlo, reemitirlo, revocarlo y listarlo |
| **E3** | La sincronización por HTTP, el almacén de S3, los datos de referencia, las órdenes de sincronizar de la consola y lo que dejó pendiente la 014 |
| **E4** | La web sincronizada: primero la negativa a importar (P2) y lo retenido en la exportación (P3), después las pantallas y los dos fallos de la web |
| **E5** | La administración contra el remoto (`compact`, restaurar, olvidar un dispositivo, revocar todos los tokens), `atlas backup` de los documentos y los tres procedimientos escritos |

Cinco reglas atraviesan la feature (§0 del encargo):

1. **Nadie fuera de la lista permitida entra**, ningún token revocado vuelve a valer y ningún dispositivo olvidado revive. Los defectos que cuestan aquí son de **identidad**, y cada credencial se reconoce por identidad exacta, nunca por parecido: la firma y el `typ` de su propósito, el `token_id` del registro y el tipo y el estado del objeto de su dispositivo.
2. **La API solo añade, y valida con el dominio que ya existe** (`acceptAppend`, `acceptInit`…). Ninguna regla de la sincronización nace en la API.
3. **Nunca se registra ni se expone** un secreto, un token, su hash, un correo, un `sub`, un código de un solo uso, un verificador PKCE, una línea, un importe ni una cuenta.
4. **La web no puede configurar la sincronización sin P2 y P3 dentro**, y un guardián lo impide desde la primera entrega.
5. **Ninguna línea del libro se pierde y ninguna cifra fiscal cambia**, pase lo que pase en la red.

## Escenarios de usuario y pruebas

Todo se prueba **sin AWS y sin Google**: la API se compone con dobles de S3 y SSM que imitan la semántica verificada con fuente (bloque 0 de cada entrega) y con un proveedor de identidad falso que firma ID tokens con claves RSA generadas en el propio test. Las pantallas se ejercitan en un Chromium de verdad contra un servidor local que compone el manejador con esos dobles (plan §11). Ese servidor no es alcanzable desde el artefacto de producción.

### Historia 1 — La web inicia sesión con Google, y solo el usuario de la lista entra (Prioridad: P1, E1)

El usuario pulsa «Iniciar sesión» en Ajustes, pasa por Google y vuelve a Atlas con una sesión corta. La usa para sincronizar. Sin sesión, la web sigue funcionando entera. Cualquier otra cuenta ve una página de acceso denegado que le enseña su propio `sub`, para que el usuario pueda darse de alta. La web tiene un identificador de dispositivo que sobrevive a las sesiones y que asigna la API.

**Por qué esta prioridad**: es la primera puerta a Internet. Todo lo demás pasa por ella, y un fallo aquí deja el libro compartido al alcance de otros.

**Prueba independiente**: la tabla de reglas de seguridad del plan (§4), cada regla con su test y su mutante visto morir, contra el doble de Google, de SSM y de S3.

**Escenarios de aceptación**:

1. **Dado** un par `{sub, email}` de la lista, **cuando** vuelve de Google con `state`, PKCE, firma RS256, `aud` del entorno, `iss`, `exp`, `nonce` y `email_verified` correctos, **entonces** recibe una cookie de sesión `__Host-` firmada con la subclave `session`, con su `typ` y su `device_id`, y vuelve a la SPA.
2. **Dado** que falla una sola de esas comprobaciones, o que el `sub` está en la lista con otro correo, **entonces** no hay sesión, y cada fallo sale con su propio código.
3. **Dado** una cuenta que no está en la lista, **entonces** ve una página sin *script*, con `no-store` y `no-referrer`, que enseña solo **su** `sub`. Nunca el correo, y el `sub` no queda en ninguna URL ni en ningún registro.
4. **Dado** una sesión viva, **cuando** su par sale de la lista, **entonces** la petición siguiente, tras la caché de la lista, recibe `403 not_allowed`.
5. **Dado** una web que presenta al iniciar sesión un `device_id` emitido por la API, de tipo `web` y no olvidado, **entonces** lo conserva. Si presenta otro, o ninguno, recibe uno nuevo, cuyo objeto crea la API. Lo lee de `GET /api/session` y lo guarda en IndexedDB, donde no es credencial.
6. **Dado** una sesión cuyo dispositivo ha sido olvidado, o cuyo objeto falta o es de otro tipo, **entonces** toda petición recibe `403 device_forgotten`.
7. **Dado** una escritura con cookie cuyo `Origin` es ajeno **o falta**, **entonces** `403 origin_rejected`. Con cookie y token a la vez, `400 credentials_ambiguous`, sin mirar ninguno.

### Historia 2 — La consola obtiene su propio token, y el usuario lo controla desde la web (Prioridad: P1, E2)

El usuario ejecuta `atlas remote login` en la carpeta de su libro. La consola abre un puerto en `127.0.0.1` e imprime la URL. El usuario inicia sesión en Google y la consola recibe un token de 90 días, que guarda en `~/.config/atlas/credentials.json` con permisos `600`. Si el navegador no alcanza el puerto, existe la variante manual: la página enseña un código tras confirmar el nombre del dispositivo, y la consola lo lee sin mostrarlo en pantalla. Desde la web, con sesión, el usuario ve los tokens, destaca las emisiones recientes y revoca uno a uno.

**Por qué esta prioridad**: es una credencial de meses guardada en disco. ADR-0033 enumera tres bloqueantes (B1, B2 y B3) que tienen que ser tests antes que código.

**Prueba independiente**: las reglas de ADR-0033 y de `docs/api.md` §2 y §4 en la tabla del plan, con los mutantes 13 a 29 sexies. Se prueban contra el doble de SSM, que imita `GetParameter` con selector y `PutParameter` sin sobrescribir tal como lo documenta AWS.

**Escenarios de aceptación**:

1. **Dado** un token con formato inválido, o un `token_id` con `:` o `/`, **entonces** `device_token_invalid` **antes** de construir el nombre del parámetro. Un registro cuyo `token_id` no es el pedido también es inválido.
2. **Dado** un token revocado en otra instancia, **entonces** la petición siguiente lo rechaza: el registro nunca se cachea en positivo, y un «no existe» tampoco se cachea.
3. **Dado** el mismo código canjeado dos veces, **entonces** la segunda recibe `409 console_code_used`.
4. **Dado** un token caducado por `expires_at`, o por `issued_at` más 120 días, **entonces** `device_token_expired`. Una configuración de más de 120 días impide arrancar, y cambiar la configuración nunca alarga un token ya emitido.
5. **Dado** una renovación con el token anterior, **entonces** el anterior se revoca **antes** de crear el nuevo, y el dispositivo se conserva. Un corte entre los dos pasos deja un estado seguro.
6. **Dado** una carpeta cuyo `sync/remote.json` nombra un dispositivo sin credencial, **cuando** se inicia sesión, **entonces** la página de la Lambda enseña los datos de ese dispositivo según el servidor y pide confirmarlos. Solo con la confirmación se reemite. Nunca se reemite para un dispositivo olvidado, inexistente o de tipo web. Los tokens anteriores del dispositivo se revocan primero.
7. **Dado** `atlas remote logout` sin conexión, **entonces** la entrada local no se borra y se avisa de que el token sigue vivo. Borrar solo lo local es una opción explícita.
8. **Dado** un token, **cuando** llama a una ruta solo de sesión, **entonces** `403 forbidden_for_credential`. Un `device_id` en el cuerpo es `400 body_invalid`.
9. **Dado** un `ThrottlingException` de SSM, **entonces** `503 remote_unavailable`, que se puede reintentar. Nunca deja pasar un token, ni lo da por inválido para siempre.
10. **Dado** `atlas remote login` en una carpeta sin sincronizar, **entonces** no se escribe nada en la carpeta del libro. `compact`, desactivar y `acceptInvalid` se comportan exactamente igual que antes.

### Historia 3 — Sincronizar por HTTP, desde la consola, contra un remoto que solo crece (Prioridad: P1, E3)

El usuario inicializa un remoto vacío desde su carpeta, o se une a uno existente, y sincroniza con `atlas sync` cuando quiere. La API valida cada línea con el dominio, escribe el tramo aceptado en un solo `PutObject` condicional y nunca reescribe ni borra. La consola sabe con qué remoto trabaja su carpeta por `sync/remote.json`. Lo que dejó abierto la 014 queda cerrado: el rehacer a medias, la espera entre unidades, los mensajes de desactivar y de `join_required`, rehacer con el libro inválido, el nombre del archivo repetido y los huecos de la propiedad.

**Por qué esta prioridad**: es la garantía central de ADR-0026, Parte A. Perder una línea es lo peor que puede pasar en esta aplicación.

**Prueba independiente**: el `LedgerStore` de S3 pasa los mismos tests de contrato que memoria, fichero y navegador. Los recorridos de la 014 se repiten a través de la API con el doble de S3. La propiedad «ninguna línea se pierde» se amplía y se instrumenta.

**Escenarios de aceptación**:

1. **Dado** un `If-Match` viejo, o dos escrituras que compiten, **entonces** `412 precondition_failed` y no se escribe nada. Un `409` de S3 también es `412`.
2. **Dado** una línea rechazada en mitad de la petición, **entonces** solo se escribe el tramo anterior, en un solo `PutObject`.
3. **Dado** un remoto que no está vacío, **entonces** `PUT /api/ledger` se niega.
4. **Dado** un `PUT /api/sync/devices/self` de un dispositivo olvidado, o cuyo objeto falta, **entonces** `403 device_forgotten`, y el objeto ni se recrea ni se reescribe. Si un olvido se cruza con el `PUT`, la respuesta es `device_forgotten`, no `precondition_failed`.
5. **Dado** un 5xx, un fallo de red, `transport_rejected` o una credencial caducada, **entonces** la sincronización para y deja todo pendiente. Solo un `rejected.code` retiene.
6. **Dado** un corte en cada hueco entre la escritura de `sync/remote.json` y la del marcador, **entonces** la orden siguiente reconoce el estado, lo dice y lo termina sin perder nada ni unirse a otro remoto.
7. **Dado** una carpeta sincronizada sin `sync/remote.json`, **entonces** sincronizar se niega y explica cómo asociarla. El remoto nunca se deduce.
8. **Dado** un rehacer de una línea o de una anulación suelta con el libro local inválido por una pareja retenida, **entonces** se registra con la regla de `correctEvent`, por una función propia que exige `event.id === plan.id`. Fuera del rehacer, `recordEvent` no cambia.

### Historia 4 — La web sincroniza, con las mismas garantías que la consola (Prioridad: P2, E4)

En la web, el usuario empieza la sincronización (inicializar o unirse), sincroniza con un botón que dice cuántas líneas hay pendientes y cuánto hace de la última, resuelve lo retenido, desactiva y vuelve a descargar. Antes de nada de eso, importar se niega en una web sincronizada y la exportación incluye aparte lo retenido. De paso se arreglan los dos fallos de la web que encontró la 014.

**Por qué esta prioridad**: es el requisito duro heredado de la 014 (D-Q17), y sin él la 019 no puede empezar.

**Prueba independiente**: el parche de `deferred/` aplicado a mano, con cada test visto en rojo y en verde. Los guardianes de «nada dispara la sincronización» siguen en verde. Hay capturas medidas a 400×890 (DPR 3), a 2045×1141 y a 360 de ancho, con el modo privacidad puesto y quitado.

**Escenarios de aceptación**:

1. **Dado** una web sincronizada, **cuando** se importa, **entonces** `import_refused_synced`, comprobado en la misma transacción.
2. **Dado** algo retenido, **cuando** se exporta, **entonces** el libro sale byte a byte y lo retenido va en un fichero aparte, `ledger.held.jsonl`.
3. **Dado** el historial de la rama, **entonces** los commits de P2 y P3 van antes del commit que afloja el guardián y hace alcanzable la configuración.
4. **Dado** que la API devuelve un `device_id` distinto del guardado, **entonces** la cola no se publica con el nuevo como si nada: la web lo dice y espera una elección explícita. Lo pendiente nunca se pierde.
5. **Dado** el modo privacidad puesto, **entonces** ningún importe ni cantidad de una línea retenida se ve, tampoco en la prosa de su motivo.
6. **Dado** una presentación duplicada, **entonces** la web ofrece confirmarla. **Dado** un evento corporativo en un ejercicio presentado, **entonces** el formulario avisa.

### Historia 5 — Administrar el remoto sin Internet de por medio, y saber qué hacer si algo va mal (Prioridad: P2, E5)

Con el rol de administración y sus credenciales de vida corta, nunca con el token ni por la API, el usuario compacta el remoto, restaura una copia en los seis pasos de ADR-0032, olvida un dispositivo perdido y revoca todos los tokens sin Google. `atlas backup` copia a su disco `documents/` e `imports/` del bucket, y también la carpeta local `documents/`. Tres procedimientos escritos le dicen qué hacer en cada caso, en orden y probados en todo lo que no necesita AWS.

**Por qué esta prioridad**: sin estas órdenes, un dispositivo perdido bloquea `compact` para siempre, una cuenta robada no tiene salida y la 019 no puede empezar.

**Prueba independiente**: cada orden contra el doble de S3 y el de SSM, con un test de corte entre los pasos cuyo orden importa y su mutante que los invierte.

**Escenarios de aceptación**:

1. **Dado** pendientes en la carpeta o publicadas por cualquier dispositivo no olvidado, **entonces** `compact` del remoto y restaurar se niegan (`rewritePermission`). Lo retenido no las bloquea.
2. **Dado** una restauración, **entonces** sigue los seis pasos sin saltarse ninguno: sustituye con `replaceLines`, archiva antes sin sobrescribir nunca y no borra nada.
3. **Dado** olvidar un dispositivo, **entonces** primero se revocan sus tokens y después su objeto se marca `forgotten` de forma condicional, sin borrarlo. Con pendientes o retenidas se niega, salvo con `--force`, que avisa antes. Un corte entre los dos pasos deja un estado seguro.
4. **Dado** `atlas admin revoke-all-tokens`, **entonces** no queda ningún token vivo, y el registro se escribe con el mismo código que la API. Repetirla no escribe nada.
5. **Dado** que se rota la clave de sesión y vence su caché, **entonces** una cookie anterior da `session_invalid`.
6. **Dado** `atlas backup` de los documentos del bucket, **entonces** solo lee del bucket, verifica la copia y nunca sobrescribe.

### Casos límite

- La lista permitida no se puede leer (SSM caído, `ThrottlingException`): `503 remote_unavailable`, y ninguna credencial pasa.
- Google no responde al canje o a las claves: el inicio de sesión falla con su código en una página propia, y no se emite nada.
- Un ID token con `alg: none`, `HS256` o un `kid` desconocido: se rechaza. Un `kid` desconocido provoca como mucho una recarga de las claves, con un límite de frecuencia.
- La cookie transitoria falta o caduca en la vuelta de Google (el usuario tardó más de lo configurado): se rechaza, y hay que empezar de nuevo.
- La respuesta de la renovación se pierde: la carpeta se queda con un `sync/remote.json` sin credencial, y la salida es la reemisión confirmada (Historia 2, escenario 6).
- `credentials.json` con permisos distintos de `600`, o dentro de la carpeta del libro (o al revés): la consola no lo usa y lo dice.
- Una carpeta copiada a otra máquina que reemite para el mismo dispositivo: riesgo aceptado y documentado. Lo delata la confirmación, que enseña los datos del servidor.
- Una IndexedDB copiada a otro navegador: dos escritores con el mismo `device_id`. Es un riesgo aceptado, y cómo se trata lo decide la dirección (plan §6.2 (d bis)).

## Requisitos

### Requisitos funcionales

- **FR-001** Un *workspace* nuevo, `@atlas/api`, con un manejador de la Function URL que **compone** dominio y adaptadores y no decide nada: enrutado, forma de error de `docs/api.md` §7, `404`, `500` sin escribir nada, cuerpo JSON obligatorio en toda escritura y ninguna ruta de datos que redirija.
- **FR-002** Toda regla de identidad (formato del token, orden de la comprobación, caducidad, reclamaciones del ID token, par en la lista, alcance de cada credencial, tipo y estado del dispositivo, origen de la escritura) es **una función pura del dominio**, detrás de una puerta propia fuera del barril, al 100 % de cobertura. Las primitivas criptográficas y la E/S viven en adaptadores o en `apps/*`.
- **FR-003** El inicio de sesión de la web por la vía c, con la cookie transitoria firmada, la cookie de sesión `__Host-` con subclave HKDF y `typ`, el `device_id` de la web en la sesión, `GET /api/session`, el cierre de sesión y la página de acceso denegado.
- **FR-004** El registro de los dispositivos en `sync/devices/<id>.json`, con su tipo (`web` o `console`) y su estado (`active` o `forgotten`), creado por la API al asignar el identificador y comprobado en cada petición. Nunca se recrea ni se reescribe desde un dispositivo.
- **FR-005** El token de dispositivo completo según ADR-0033 y `docs/api.md` §2 y §4: inicio, vuelta (*loopback* y manual), canje de un solo uso, renovación, reemisión confirmada, revocación propia, lista y revocación desde la web, y el registro en SSM, escrito solo al crear y al revocar.
- **FR-006** La consola: `atlas remote login` y `logout`, `credentials.json` como mapa por `device_id` con la pista de la carpeta, y `sync/remote.json`, escrito solo al inicializar o al unirse.
- **FR-007** Un `LedgerStore` sobre S3, contra una **interfaz estrecha propia** (el SDK solo se enchufa en la composición, §7 P3), con las seis operaciones del puerto y los tests de contrato comunes.
- **FR-008** Las rutas de `docs/api.md` §5 y las de solo lectura de los datos de referencia (§6), estas con las rutas que proponga el plan y decida la dirección.
- **FR-009** Dos clientes HTTP de `RemoteLedger`, el de la consola y el de la web, con `x-amz-content-sha256` sobre los bytes exactos, sin seguir redirecciones en la consola y con la traducción de §7.
- **FR-010** Las órdenes de sincronizar de la consola, siempre explícitas, y las pantallas de la web, en carga diferida.
- **FR-011** Lo que dejó la 014: la salida del rehacer a medias, la espera entre unidades, los mensajes de desactivar y de `join_required`, rehacer con el libro inválido (con la regla de `correctEvent`, atada al plan sellado), sus tests, el nombre del archivo repetido y los tres huecos de la propiedad.
- **FR-012** P2 y P3 en la web, antes que cualquier cosa que haga alcanzable la configuración de la sincronización, y los dos fallos de la web de la 014.
- **FR-013** Las órdenes de administración contra el remoto, con credenciales del rol de administración de la cadena estándar, inalcanzables desde `apps/api`: `compact` del remoto, restaurar, olvidar un dispositivo y `atlas admin revoke-all-tokens`. También `atlas backup` de `documents/` e `imports/` del bucket y de la carpeta local `documents/`.
- **FR-014** Tres procedimientos escritos en `specs/015-api-access/runbooks/`: restaurar, revocar todos los tokens sin Google y recuperar una cuenta de Google robada.
- **FR-015** Cada código nuevo de rechazo, negativa y fallo tiene su propio literal y su frase en las dos interfaces. `device_forgotten` y `remote_unavailable` entran en `REMOTE_FAILURE_CODES`.
- **FR-016** Registros en JSON con `request_id`, nivel y código, sin nada de lo que prohíbe §2 bis. Lo comprueba un test con centinelas que captura `stdout` y `stderr`.
- **FR-017** Ninguna dependencia externa nueva mientras el usuario no conteste la P3. Nada del SDK de AWS ni ninguna dirección de Google alcanzable desde la web o desde el dominio, con la lista de lo que alcanza la web derivada de `exports`.

### Entidades

- **Sesión de la web**: cookie firmada con `sub`, identificador de sesión, `device_id` de la web, emisión y caducidad. No se guarda en ningún servidor.
- **Intento de inicio de sesión**: cookie transitoria firmada con `state`, `nonce`, verificador PKCE y, si viene de la consola, sus parámetros.
- **Código de la consola**: carga firmada de un solo uso, con el `token_id` futuro, el `code_challenge`, el par, el nombre y la caducidad.
- **Token de dispositivo**: `atlasdt1.<token_id>.<secret>`. En la consola, en `credentials.json`; en el servidor, solo el hash, en un registro de SSM por token.
- **Dispositivo**: `sync/devices/<id>.json`, con tipo, estado y el estado publicado de su cola.
- **Asociación de una carpeta**: `sync/remote.json` (`format`, `origin`, `device_id`).
- **Lista permitida y secretos del entorno**: parámetros de SSM con nombres y formatos fijados en el plan. Sus valores los crea el guion de la 017.

## Criterios de éxito

- **SC-001** Cada regla de la tabla de seguridad del plan tiene su test, y cada mutante de §5 del encargo se ha visto morir. El recuento está en `questions.md`.
- **SC-002** El test de centinelas recorre todas las rutas, incluidos los cuerpos mal formados que empiezan por el centinela, y no encuentra ninguno en `stdout`, `stderr` ni el registrador.
- **SC-003** La salida fiscal es la misma, byte a byte, con y sin `sync/`, sobre `synthetic-v1` y sobre un libro sincronizado por la API con el doble de S3. `git diff tests/fixtures` sale vacío.
- **SC-004** `packages/domain` al 100 % de líneas y ramas. El test de arquitectura, en verde. Ningún gemelo `.js`.
- **SC-005** El paquete web se mide en cada entrega. El arranque se queda dentro de la autorización de §7 P13, o la entrega para con la medida trozo a trozo.
- **SC-006** Cada entrega termina con la tubería en verde, un commit congelado y su PR, y la dirección la fusiona antes de empezar la siguiente.

## Supuestos

- **P3 sin contestar**: no se instala `@aws-sdk/client-s3`, `@aws-sdk/client-ssm` ni `esbuild`. Los adaptadores se escriben contra interfaces estrechas propias y el artefacto de E1 es el de `tsc`. Si el usuario dice que sí, se instalan en E3 con versión fijada (plan §9).
- `amr` con `mfa` **no se puede exigir en la práctica** con un cliente OAuth personal (bloque 0 de E1, `questions.md` §1.2). La propuesta es que `mfa_required` quede sin emitir, y la decide la dirección.
- La prueba del *loopback* en el navegador real del usuario se aplaza a la 018 (§7 P14). E2 se cierra con lo verificado con fuente.
- Los valores [PENDIENTE] de `docs/api.md` son propuestas del plan (§6) hasta que la dirección los escriba.
- Esta feature no añade ningún tipo de evento ni ningún campo al libro, y no sube `schema_version`.
