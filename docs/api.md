# Contrato de la API

El contrato HTTP de la Lambda de la API (`apps/api`), que se alcanza **solo a través de CloudFront**, bajo `/api/*` (ADR-0028, fila 6). Lo encarga **ADR-0026** («Consecuencias»: rutas, cuerpos, códigos, la confirmación y el rechazo por línea, la pareja de anulación y corrección como una sola línea, y el rechazo de una anulación cuya corrección no viene en la misma petición). Desde **ADR-0037** (2026-11-03) su único cliente es la web: la consola no tiene acceso propio a la API.

**Estado:** implementado (features 015, 016 y 021-027) y probado con dobles de S3, SSM y Google; **sin desplegar todavía** (017 y 018). Desde **ADR-0035** (2026-10-06) el libro de S3 es la única fuente de verdad: no hay cola local ni sincronización entre dispositivos, y la web escribe directamente con `If-Match` (§5.8). Lo que el código concretó respecto del diseño previo va marcado «*(014)*», «*(015)*» o «*(016)*» según la feature. Lo que quede sin decidir se marca **[PENDIENTE]**.

**Si este documento discrepa de una ADR, manda la ADR**, y la discrepancia se anota en el `questions.md` de la feature que la encuentre.

## 1. Reglas generales

- **Un solo origen.** La SPA y la API comparten distribución de CloudFront: la cookie es del mismo sitio y **la API no responde a CORS** (ADR-0028, fila 6). El navegador nunca llama a la Function URL directamente.
- **`Authorization` no se usa nunca.** CloudFront la sobrescribe para firmar con OAC (ADR-0027, hecho 1). La única credencial es la cookie (§2).
- **Todo `POST` lleva `x-amz-content-sha256`** con el SHA-256 hexadecimal del cuerpo exacto (ADR-0027, hecho 2). Si falta o no cuadra, la petición la rechaza AWS **antes** de llegar a la Lambda, con una respuesta que **no** tiene el formato de error de §7: el cliente la trata como `transport_rejected` y nunca como un rechazo de sus líneas.
- **Cuerpo JSON obligatorio** en toda petición que escribe (`Content-Type: application/json`), incluso vacío (`{}`): es una de las defensas contra la falsificación de peticiones de ADR-0027.
- **Fechas** en ISO 8601; instantes en UTC con `Z`. **Importes**, si alguna vez viajan fuera de una línea del libro, como cadenas (ADR-0005).
- **Ninguna ruta de datos redirige.** Solo las del inicio de sesión (§3) responden con `302`.
- **Registros de la Lambda:** el código del resultado. Nunca la cookie, el correo, el `sub`, una línea del libro, un importe, una posición ni una cuenta (ADR-0027, ADR-0028 fila 16, `CLAUDE.md` → *Logging*).

## 2. Credenciales

La única es la **cookie de sesión** `__Host-atlas_session` de la web (`HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, firmada con la subclave `session` y con `typ`; ADR-0027 y §3). El token de dispositivo de la consola se retiró con ADR-0037.

- **Sin cookie: `401 unauthenticated`**, salvo en las rutas de inicio de sesión y en `logout`.
- **Toda petición que escribe** comprueba además `Origin` contra el origen propio (`403 origin_rejected`).
- **Cada petición comprueba la cookie en este orden:** firma y `typ`, caducidad (`401 session_invalid`), lista permitida (`403 not_allowed`) y la marca de `logout-all` (`401 session_invalid` con `details.reason = "closed"`, §3).
- **La lista permitida se vuelve a consultar en cada petición** (ADR-0027, enmienda), con su caché de **120 s** (decidido el 2026-09-25). La cookie no lleva el correo: se comprueba que **el `sub` de la sesión siga teniendo una entrada**; el par `{sub, email}` entero se comprobó al iniciar la sesión (decisión Q10, 2026-09-26). **Retirar el acceso es quitar la entrada de ese `sub`**, no cambiarle el correo: con el mismo `sub` y otro correo, las sesiones vivas siguen valiendo hasta que caducan, y un inicio de sesión nuevo ya no pasa.
- **Un fallo transitorio** de SSM (`ThrottlingException`) o de S3 al comprobar la cookie es **`503 remote_unavailable`**, que se puede reintentar, y **nunca** deja pasar la cookie ni la da por inválida para siempre (ADR-0034, fila 13).

### 2.3 Alcance de la cookie

Toda ruta de §5 (el libro), §6 (datos de referencia) y §6.1 (borradores) pide la cookie, igual que `GET /api/session` y `POST /api/auth/logout-all` (§3). La tabla de rutas vive en `apps/api/src/access/routes.ts`. **La API no toma ningún identificador del cuerpo**: un campo `device_id` en el cuerpo de una petición es `400 body_invalid`.

## 3. Acceso de la web (ADR-0027)

La **vía c**: la Lambda es el cliente OAuth y el token de Google nunca toca la SPA.

| Método y ruta | Qué hace |
|---|---|
| `GET /api/auth/login` | Crea el intento (`state`, `nonce` y verificador PKCE) en la **cookie transitoria** `__Host-atlas_login` (`SameSite=Lax`, firmada, de un solo uso), y redirige (`302`) a Google con `scope=openid email`, PKCE S256, `state` y `nonce`. Una credencial presente se ignora. |
| `GET /api/auth/callback` | Vuelta de Google. Verifica en el orden de ADR-0027 (`state` contra la cookie transitoria, PKCE, firma, `aud` del entorno, `iss`, `exp`, `nonce`, `email_verified`, par `{sub, email}` en la lista), emite la cookie de sesión y redirige a la raíz de la SPA (`/`; no hay `return_to`). La cookie transitoria **se borra en toda respuesta**. Un par que no está en la lista recibe la **página de acceso denegado**; cualquier otro fallo, la **página de error** (§3.1). |
| `POST /api/auth/logout` | Cuerpo `{}` obligatorio (`415 body_not_json`). Borra la cookie de sesión (`Max-Age=0`) **sin validarla** —cerrar una sesión caducada o firmada con una clave rotada también la borra— y responde `204`. Con cookie, la comprobación de `Origin` de §2. |
| `POST /api/auth/logout-all` | **Cierra la sesión en todos los dispositivos** (ADR-0037), esta incluida. Pide cookie válida, `Origin` propio y cuerpo **exactamente** `{}` (otro cuerpo, `400 body_invalid`). Avanza la marca (abajo) a la hora del servidor, borra la cookie y responde `204`. |
| `GET /api/session` | `200 { "signed_in": true, "expires_at": "<Z>" }`, con `Cache-Control: no-store`: así sabe la SPA si tiene sesión (la cookie es `HttpOnly`) y hasta cuándo. Si no, la misma respuesta que cualquier ruta con cookie (`401 unauthenticated`, `401 session_invalid`, `403 not_allowed`, `503 remote_unavailable`). |

**Duraciones**: la sesión, **24 h absolutas**, sin renovación (ADR-0035, pregunta 6, 2026-10-06; antes eran 8 h, ADR-0027); la cookie transitoria, **10 min** (2026-09-25). Las dos son configuración de la Lambda (§9). **Antes de abrir un formulario, la web avisa si a la sesión le quedan menos de 15 minutos** (`expires_at` de `GET /api/session`), porque un formulario a medias se pierde si la sesión caduca (ADR-0035, §2 y «Riesgos aceptados»).

**La cookie de sesión** es `__Host-atlas_session`, con `Path=/`, `Secure`, `HttpOnly`, `SameSite=Strict` y sin `Domain`, firmada con HMAC-SHA256 y la subclave HKDF de `info` `atlas session v1`, con `typ: "atlas.session"`. Lleva **solo** `sub`, un identificador de sesión (`sid`), la emisión (`iat`, en segundos) y la caducidad (`exp`): **ninguna cookie lleva el correo**. La transitoria, `__Host-atlas_login`, con su propia subclave (`atlas login v1`, `typ: "atlas.login"`). Formato exacto: `packages/access/src/signed.ts`.

**La marca de `logout-all`** es `access/sessions-valid-from.json` del bucket de datos, `{"sessions_valid_from_format":1,"at":<segundos epoch>}` (`docs/data-schema.md` §1). `at` es siempre la hora de la Lambda, nunca una que mande el cliente. **Solo avanza**: se escribe con `If-Match` sobre lo leído (o `If-None-Match: *` si no existía) y una marca guardada igual o posterior no se toca. Toda cookie cuyo `iat` sea **estrictamente anterior** a `at` es `401 session_invalid` con `details.reason = "closed"`; una emitida en el mismo segundo o después vale, así que el inicio de sesión que sigue al cierre funciona en el acto. **Una marca que no se lee de forma estricta cierra todas las sesiones** (falla cerrado): solo puede venir de una escritura que quería cerrarlas. Para salir de ahí, la administración lo rehace con una marca válida: su rol puede escribir el objeto, no borrarlo ([`runbooks/stolen-google-account.md`](runbooks/stolen-google-account.md)). La web, ante `reason: "closed"`, dice: «Se ha cerrado la sesión en todos tus dispositivos. Si fuiste tú, entra de nuevo con Google.» Por qué una marca y no objetos por dispositivo: ADR-0037.

**El último inicio de sesión web** *(016)*. Tras emitir la cookie de una sesión, la API avanza `access/last-web-sign-in.json` (formato en `docs/data-schema.md` §1) a la fecha de hoy en Madrid, **solo si es posterior** a la guardada, con `If-Match` sobre lo leído o `If-None-Match: *` si no existía. Lo lee el recordatorio mensual, para avisar antes de que Google borre un cliente OAuth sin uso (ADR-0027). **El inicio de sesión nunca falla por ello**: lo que pasó es el `reason` de su línea de registro (`signed_in`), uno de `sign_in_date_written`, `sign_in_date_unchanged`, `sign_in_date_conflict` (otra escritura ganó) y `sign_in_date_unavailable` (S3 no respondió).

### 3.1 Las páginas propias de la Lambda

Todas `text/html; charset=utf-8`, **sin *script* y sin nada externo**, con `Cache-Control: no-store`, `Referrer-Policy: no-referrer` y CSP `default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`.

- **Acceso denegado** (`403`): la vuelta de Google fue válida pero el par no está en la lista. Enseña **solo el `sub` de la cuenta que acaba de autenticarse en esa misma petición**, escapado, y cómo darlo de alta. **Nunca el correo.** El `sub` no se registra ni va en ninguna URL.
- **Error del inicio de sesión** (`400`, `403`, `500` o `503`): cualquier otro fallo del inicio o de la vuelta, con su código literal y una frase por código: `login_attempt_missing` (el intento no está o caducó), `login_attempt_invalid` (la cookie del intento no se lee o está repetida; añadido en E1 de la 015, a confirmar por la dirección), `login_state_mismatch`, `google_error`, `google_exchange_failed`, `id_token_invalid`, `id_token_audience`, `id_token_issuer`, `id_token_expired`, `id_token_nonce`, `email_not_verified`, `remote_unavailable` (con `Retry-After: 5`, como en JSON) e `internal` (`500`: cualquier fallo inesperado del inicio o de la vuelta, que también borra la cookie del intento; revisión de la PR #90, N1).

## 4. (Retirada)

El token de dispositivo de la consola, su inicio de sesión, su canje y su revocación se retiraron el 2026-11-03 (ADR-0037, que reemplaza a ADR-0033). La sección conserva su número para no romper las referencias antiguas.

## 5. El libro (ADR-0026, ADR-0035)

> **ADR-0035.** No hay cola por dispositivo ni sincronización: la API es el único escritor y solo añade y valida cada línea (§5.2); `GET /api/ledger` y `POST /api/ledger/lines`. La subida inicial a una nube vacía y la restauración son `atlas admin restore`, que nunca pasa por la API (ADR-0037). La web escribe directamente con `If-Match` (§5.8).

El remoto es `ledger/ledger.jsonl` del bucket de datos. **La API solo añade**: nunca reescribe ni borra una línea (ADR-0026, Parte A). Las líneas se escriben **tal como las serializó el cliente**, byte a byte: ni la API ni nadie reserializa lo ya escrito (trampa 10 de `CLAUDE.md`).

**El etag de la API es el SHA-256 hexadecimal de los bytes del libro.** El cliente nunca ve el ETag de S3; la Lambda traduce el suyo a la condición de S3 (`If-Match` en `PutObject`). Con un libro vacío o inexistente, el etag es el SHA-256 de cero bytes.

### 5.1 Leer el remoto

`GET /api/ledger`

- **Compresión** *(auditoría de seguridad 03/11)*: desde 256 KiB y con `Accept-Encoding: gzip` (que `fetch` envía siempre), la respuesta va en gzip (`Content-Encoding: gzip`, `Vary: Accept-Encoding`, cuerpo en base64), como los ficheros de §6. El `ETag` es el mismo con y sin compresión: el cliente hashea los bytes ya descomprimidos. Sin ella, un libro de más de 6 MB no cabría en la respuesta de la Function URL (`502`, y el libro, que solo se añade, no se arreglaría por la API). Toda respuesta de `/api/*` lleva `Cache-Control: no-store`; con ADR-0035 la web descarga el libro entero al arrancar y tras cada escritura (§5.8).
- **Cuánto pesa un libro de veinte años** (medido con `tests/fixtures/ledger/synthetic-v1.jsonl`: 200 líneas, 356 bytes de media; una compra con su orden, 674; un dividendo, 460; una valoración, 299). Con 12 activos y una aportación al mes por activo, más dividendos trimestrales y una valoración al año: unos 2,7 MB. Con tres aportaciones al mes por activo, unos 6,5 MB. Comprimido (relación medida 5:1, base64 incluido, un 26 % del original) cabe con holgura en los 6 MB; sin comprimir, el caso alto los pasaría hacia el año 18. Por eso el tope del libro de §5.2 está en 16 MiB: con la respuesta comprimida son unos 4,2 MB en el cable (bajo los 6 MB), y el caso alto de arriba lo alcanzaría hacia el año 50, no antes de los veinte ni de los treinta. Con 8 MiB lo habría alcanzado hacia el año 25. Queda un riesgo que el tope no cierra: un escritor con credencial válida y texto incompresible puede llenar 16 MiB que ya no cabrían comprimidos; lo limitan el tope de línea y el de peticiones, y se arregla por administración.
- `200`, cuerpo = **los bytes exactos** del libro, `Content-Type: application/x-ndjson; charset=utf-8`, cabecera `ETag: "<sha256>"`. La compresión no cambia los bytes que el cliente hashea: hashea lo descomprimido, que son los bytes del fichero.
- *(015)* **Los bytes viajan como texto si son UTF-8 válido**, porque así se reescriben idénticos, y **en base64 (`isBase64Encoded`) si no lo son**. Exactos en los dos casos. El cliente comprueba que la cabecera `ETag`, fuerte o débil (`W/`, que pone CloudFront al comprimir), dice el SHA-256 de los bytes que recibió, ya descomprimidos. Si no lo dice, o si los bytes no son UTF-8, es `transport_rejected` (bloque 0 de E3, §23.3). **CloudFront no comprime `application/x-ndjson`**, que no está en su lista de tipos.
- **La API no interpreta la versión de esquema al servir**: un cliente antiguo que no entiende el remoto lo rechaza al cargar (`docs/data-schema.md` §5).
- *(014)* **El puerto del cliente entrega texto, no bytes** (`RemoteSnapshot`: `text` y `etag`). El dominio no tiene decodificador UTF-8, así que el cliente HTTP decodifica los bytes del cuerpo y entrega el texto; el etag sigue siendo el SHA-256 de los bytes. Decodificar no pierde nada, porque toda línea del remoto se escribió desde una cadena, y el bloque 0 de la 014 lo comprobó byte a byte (la feature 014).

### 5.2 Añadir líneas

`POST /api/ledger/lines`

Cabeceras: la credencial, `x-amz-content-sha256`, `Content-Type: application/json` y **`If-Match: "<sha256 del remoto que el cliente descargó>"`**, obligatoria (`428 precondition_required` sin ella).

Cuerpo:

```json
{
  "lines": [
    { "line": "<la línea exacta, sin salto de línea final>" },
    { "line": "<…>", "confirm_duplicate": true },
    { "line": "<la anulación>", "has_correction": true },
    { "line": "<la corrección, con corrects_id a la operación anulada>", "chain_continues": false }
  ]
}
```

- `line`: el texto exacto de una línea del libro, como cadena JSON. La API escribe `line` + `"\n"` en UTF-8, **sin volver a serializar**. Una cadena con `"\n"` o `"\r"` es `400 body_invalid`.
- `confirm_duplicate`: la confirmación explícita, **por línea**, de una huella repetida (ADR-0012; ADR-0026, Parte A). Sin ella, una huella repetida es un rechazo de esa línea.
- `has_correction`: la declaración de que **esta anulación tiene corrección**. Solo vale en una línea que se lee como `reversal`.
- `chain_continues`: en la corrección de una pareja, que **la pareja siguiente pertenece a la misma cadena** de correcciones de tipos. Solo vale en una línea con `corrects_id`; por defecto, `false`.
- **`400 body_invalid` es solo para la forma de la petición** (un campo desconocido, un tipo que no es el suyo, un `device_id`, un salto de línea en `line`), **nunca depende del contenido de una línea**. Lo que sí depende de él es un rechazo **por línea**, dentro del `200`, en el orden de la tabla de abajo: una línea ilegible es `line_unreadable` lleve o no `has_correction`, y una declaración en una línea legible que no la admite (`has_correction` en algo que no es una anulación, `chain_continues` en algo sin `corrects_id`) es `pair_declaration_invalid`, la primera comprobación tras leer la línea (fila 3 de la tabla) (decisión de la dirección, 2026-09-25, por coherencia con §7: el cliente retiene los rechazos por línea y para ante un `400`).
- Cualquier otro campo es `400 body_invalid`, y en particular un `device_id` (§2.3).

**Tope de unidades por petición: `MAX_APPEND_UNITS = 100`** (`packages/domain/src/sync/remote.ts`). Cada unidad se valida contra el libro entero al que cae, así que el coste de una petición es sus unidades por la proyección del libro (medido: 500 unidades sobre un libro de 5.000 eventos, 13 s, frente a los 30 s de la Lambda). Una unidad es una línea, una pareja o una cadena entera, por larga que sea; una escritura normal es una. Con una más, `413 append_too_many_units` con `details.max`, **antes de juzgar nada y sin escribir**. El cliente (`ApiLedgerStore`) parte solo en peticiones de como mucho 100 unidades, **nunca por dentro de una unidad**, cada una con el `If-Match` del etag que devolvió la anterior; si una posterior se rechaza, las anteriores quedan escritas y lo cuenta como `remote_rejected` con `accepted` total (el mismo caso que una aceptación parcial), y cualquier otro rechazo tras el primer lote, un `412` incluido, es `partial_write`. El coste crece con el libro. Medido el 2026-10-24 en la VM de desarrollo (la Lambda, con 256 MB, tiene menos CPU y no se ha medido): una unidad tarda 0,25 s sobre 5.000 eventos, 1,0 s sobre 10.000 y 1,3 s sobre 20.000; 100 unidades, 6,6 s, 13 s y 35 s. Con el tope de 100, los 30 s se pasan hacia los 15.000-20.000 eventos; una sola unidad aguanta mucho más. Cada unidad cuesta una proyección del libro y no hay trabajo repetido que quitar sin una proyección incremental, que sería otro cambio del dominio. Ningún caso de uso de hoy escribe más de una unidad, así que el troceado no se nota; si el libro real se acerca a esas cifras, revisar el tope o la memoria de la Lambda.

**Si `If-Match` no es el etag actual: `412 precondition_failed`**, sin escribir nada. También si otro escritor gana la carrera entre la lectura de la Lambda y su `PutObject` condicional. El cliente vuelve al paso 1 de la sincronización.

*(015)* **`If-Match` solo vale como `"<sha256>"` fuerte, en minúsculas.** Débil (`W/"…"`), sin comillas, una lista o `*` nunca son el etag del remoto, y dan `412` sin escribir nada. La carrera entre dos `PutObject` condicionales la verificó el bloque 0 de E3 (§23.1): S3 responde `412` o `409 ConditionalRequestConflict` a la que pierde, y la API traduce los dos a `412`.

**Validación, línea a línea y en orden**, con el dominio (ADR-0026, Parte A), sobre el remoto con las líneas anteriores ya aceptadas:

| Orden | Comprobación | Código del rechazo |
|---|---|---|
| 0 | La línea no pasa de **`MAX_LINE_BYTES` = 64 KiB** (en bytes de UTF-8). Una línea real ocupa unos cientos de bytes, salvo una presentación 720/721, que lista cada activo dos veces y no se puede acortar después (200 activos ≈ 46 KB); el tope solo frena un texto libre que llene el libro | `line_too_large`, con `details.limit` y `details.bytes` |
| 1 | La línea es JSON y tiene `schema_version` | `line_unreadable` |
| 2 | `schema_version` no es más nueva que la que conoce la Lambda | `schema_version_unsupported` |
| 3 | **Las declaraciones de la entrada son admisibles para la línea**: `has_correction` solo en una anulación, `chain_continues` solo en una línea con `corrects_id`. Va antes que todo lo demás de la línea, y antes que `pair_incomplete`: si la declaración de la pareja está mal, no tiene sentido evaluar lo demás (decisión de la dirección, 2026-09-25) | `pair_declaration_invalid` |
| 4 | La línea se decodifica y valida su forma con el dominio. Un decimal (importe, cantidad, tipo, a cualquier profundidad de la línea) lleva **como mucho `MAX_DECIMAL_DIGITS` = 40 cifras**, sin contar el signo ni la coma; solo se exige **al escribir** (esta ruta y `recordEvent`), nunca al cargar un libro (ADR-0018) | `line_invalid`, con el código del dominio en `details.domain_code` |
| 5 | `recorded_at` no es posterior a la hora de la Lambda más la tolerancia (ADR-0026, caso 8; tolerancia configurable: **10 minutos**, decidido el 2026-09-25) | `recorded_at_in_future` |
| 5 bis | **El libro resultante** (remoto más las líneas ya aceptadas más esta unidad) no pasa de **`MAX_LEDGER_BYTES` = 16 MiB**. Es una guarda por debajo de lo que la Function URL responde (arriba, en §5.1, la cuenta de un libro real), no un límite que un libro de veinte años roce; protege de un libro que dejaría de servirse y que, siendo de solo añadir, no se arregla por la API. Se juzga por unidad, antes de proyectarla: la que lo pasa se rechaza entera y las anteriores quedan escritas | `ledger_too_large`, con `details.limit` y `details.bytes` |
| 6 | El libro proyectado con la línea añadida sigue siendo válido. Un `id` repetido lo detecta la proyección (`duplicate_id`), así que es de esta fila, no de la 4 (decisión de la dirección, 2026-09-25). Una anulación con corrección no se proyecta sola: la unidad entera, abajo | `domain_rejected`, con `details.domain_code` |
| 7 | Si la huella está repetida, la línea trae `confirm_duplicate` | `duplicate_unconfirmed`, con los `id` que la repiten |
| 8 | Una `tax_return_filed` **sella el prefijo**: su `ledger_fingerprint` cuadra con el prefijo sobre el que cae, remoto más las líneas ya aceptadas de la petición (decisión de la dirección, 2026-09-25: «lo que sella el prefijo no se mueve de sitio», defendido también en el servidor; la proyección no lo comprueba al registrar, solo `check --deep` y `compact`) | `seal_mismatch` |
| 9 | La línea no es una `filing_fingerprint_waived`: una renuncia solo nace dentro de una compactación, que es de administración, y **nunca llega por esta ruta**; solo la escribe la administración, fuera de la API (decisión de la dirección, 2026-09-25) | `waiver_not_appendable` |

**La pareja de anulación y corrección cuenta como una sola línea** (ADR-0026, segunda y tercera enmiendas):

- Una línea con `has_correction` **tiene que traer en la misma petición, detrás de ella**, la línea cuyo `corrects_id` es el `reverses_id` de la anulación. Si no la trae: `pair_incomplete`, en el índice de la anulación. Es la única forma que tiene la API de negarse a **partir una pareja entre dos peticiones**, porque no ve la cola del dispositivo: por eso el cliente **declara**.
- La pareja **se evalúa entera, como la escribe la aplicación** (decisión de la dirección, 2026-09-25; `checkCandidate` en `rectify.ts` y `rule-change.ts`): el libro se proyecta con la anulación **y** la corrección añadidas juntas, **nunca con la anulación sola**. Una compra de 10, una venta de 10 y la corrección de la compra a 12 **se aceptan**, aunque la anulación sola dejaría la venta sin lotes. Si falla la unidad, el rechazo se da **en el índice de la anulación**, con `code: "pair_rejected"` y en `details`: `member` (`reversal` \| `correction` \| `other`), `member_code`, el código del dominio, y `member_index` (`0` la anulación, `1` la corrección; ausente con `other`). **`other`** es un tercer evento del libro que la unidad deja inválido (`DependentEventsError`), y entonces `details.affected` lista los `event_id` afectados con su código. No se escribe ninguna de las dos.
- **La corrección va justo detrás de su anulación** (decisión de la dirección, 2026-09-25): la aplicación siempre las escribe juntas (`rectify.ts` añade `[reversal, event]` en una sola escritura), y exigirlo hace inequívoca la pareja. Una línea con `corrects_id` que no va inmediatamente detrás de la anulación de su objetivo con `has_correction`, o una anulación con `has_correction` cuya línea siguiente no es su corrección, se rechaza con `pair_not_contiguous` en el índice de la anulación (o de la corrección suelta).
- **Una cadena de correcciones de tipos es una sola unidad** (decisión de la dirección, 2026-09-25): las varias parejas que la aplicación escribe de una vez al corregir los tipos del BCE (`writeRateCorrections`) se aceptan enteras o no se acepta ninguna. El cliente lo declara con `"chain_continues": true` en la **corrección** de cada pareja que no es la última de la cadena: la línea siguiente tiene que ser otra anulación con `has_correction` (si no, `pair_incomplete`). La cadena **se proyecta entera**, con todos sus miembros añadidos juntos, como hace la aplicación (`rule-change.ts:270-275`). Si falla, el rechazo se da en el índice de **la primera anulación de la cadena**, con `code: "pair_rejected"`, y `details` dice qué miembro falló (`member_index`, `member` —`reversal` \| `correction` \| `other`— y `member_code`); con `other`, `details.affected` lista los `event_id` del tercer evento o eventos que la cadena deja inválidos, con su código.

**El rechazo es por línea:** la API escribe **el tramo válido hasta la primera línea rechazada**, en un solo `PutObject` condicional, y devuelve el motivo de esa línea. Nada de lo que va detrás se escribe, aunque fuera válido.

*(014)* Detalles que fija el código (`acceptAppend`):

- `rejected.index` es siempre el de **la primera línea de la unidad** que falla, y `rejected.id`, el de su primer evento si se pudo leer. En una pareja o una cadena, `details.member_index` dice qué miembro falló: en los rechazos de las filas 1 a 5, en `pair_incomplete` y `pair_not_contiguous`, en `duplicate_unconfirmed`, en `seal_mismatch` y en `pair_rejected`, de una pareja o de una cadena, salvo con `member: "other"`, que no es un miembro.
- `duplicate_unconfirmed` lleva en `details.existing` los `id` cuya huella repite. Al añadir, la huella se compara con la de los eventos **no anulados**, la regla de siempre (decisión D-Q16 de la 014).
- **Un remoto que ya tiene eventos inválidos** (una regla endurecida después) no acepta nada más hasta que se repare. Responde `accepted: 0` y el rechazo en el índice 0, con `code: "domain_rejected"` y en `details` `domain_code: "ledger_has_invalid_events"` e `invalid_count`.

Respuesta `200` siempre que `If-Match` cuadró:

```json
{
  "etag": "<sha256 del libro tras escribir>",
  "lines": 1234,
  "accepted": 3,
  "rejected": {
    "index": 3,
    "id": "<id de la línea, si se pudo leer>",
    "code": "pair_rejected",
    "details": { "member": "correction", "member_code": "insufficient_position", "member_index": 1 }
  }
}
```

- `etag`: el SHA-256 del libro remoto después de escribir.
- `lines`: cuántas líneas tiene el libro remoto después de escribir (no las de la petición).
- `accepted`: cuántas entradas de `lines` de la petición se escribieron, desde la primera. Con `accepted: 0` no se escribió nada y `etag` es el mismo.
- `rejected`: ausente si se escribieron todas.
- **Una respuesta perdida no pierde nada:** el cliente (`ApiLedgerStore`) no da una escritura por hecha sin este `200`; si no llegó, vuelve a leer el remoto (§5.1) y mira si sus líneas están dentro, byte a byte, antes de repetir (ADR-0035).
- `details` puede contener lo que el dominio diga de la línea (un importe, una cantidad): va al cliente del propio usuario, **nunca a un registro**.

### 5.3 a 5.5 (retiradas)

Los objetos de dispositivo (§5.3), su ligadura con la sesión (§5.4) y la inicialización de una nube vacía por la API (§5.5) se retiraron el 2026-11-03 (ADR-0037). La subida inicial a una nube vacía es `atlas admin restore --env <e> --from <ledger.jsonl>` (`docs/cli.md`).

### 5.8 El cliente de escritura directa (ADR-0035)

Decidido por ADR-0035. **El adaptador está implementado (E1, `specs/021-api-ledger-store`)**: `ApiLedgerStore` sobre `httpRemote`, con los errores `remote_rejected` (`RemoteRejectedError`) y `write_outcome_unknown` (`WriteOutcomeUnknownError`) y `findOutcome(ids)` para resolver el resultado desconocido. La web lo usa desde E2b (feature 023); la consola lo usó de E3 (feature 024) a ADR-0037.

- **Un solo almacén, `ApiLedgerStore`**, implementa `LedgerStore` sobre HTTP: `load()` es `GET /api/ledger` (se comprueba que el `ETag` es el SHA-256 de los bytes); `append(events, etag)` serializa cada evento con `encodeLine` y lo envía en `POST /api/ledger/lines` con `If-Match: "<etag>"`. `replace`, `appendLines` y `replaceLines` se niegan. Sin cola local y sin libro guardado en el dispositivo.
- **Las declaraciones de §5.2 las deduce el adaptador:** `has_correction` y `chain_continues`, de la forma del lote; `confirm_duplicate`, por unidad, con las huellas del libro cargado más la unidad entera (miembros posteriores incluidos), que es la regla de la fila 7 de la tabla de §5.2.
- **Cada escritura de un caso de uso es una unidad** (un evento, una pareja o una cadena): la API la acepta entera o no.
- **Respuestas:**

| Respuesta | Qué hace el cliente |
|---|---|
| `200`, todo aceptado | Recarga y vuelve a proyectar |
| `200` con `rejected` | Error `remote_rejected` con el código de la API. No se escribió nada. Ni se retiene ni se reintenta solo |
| `412` | `ConflictError`: recarga, reconstruye la vista previa del mismo formulario y **pide confirmar otra vez**. Nunca reintenta sola ni fusiona |
| `401` o `403` de credencial | No se escribió nada; lleva al inicio de sesión |
| Fallo de red, `5xx` o `transport_rejected` tras enviar | Resultado desconocido. El `id` de cada evento se fija **antes** de enviar. Con conexión, recarga y busca ese `id`: si está, se registró; si no, no se escribió y se ofrece reintentar con los mismos datos. Reintentar es seguro: `duplicate_id` |

- **Lo que las interfaces dicen de un rechazo** (catálogo único, `packages/domain/src/messages/errors-remote.ts`): `remote_rejected` se traduce por `remote_code` con una tabla de motivos (`line_invalid`, `domain_rejected`, `duplicate_unconfirmed`, `seal_mismatch`, `recorded_at_in_future`, `partial_write`, etc.), cada uno con su remedio de consola o de web; un código que la tabla no conoce da «no la ha aceptado tal como estaba». Si `accepted` es 0 añade «No se ha guardado nada»; si no, el número de líneas guardadas y que se mire el libro antes de repetir. Un `RemoteError` antes de enviar se dice con `REMOTE_FAILURES` (`remote-failures.ts`, el mismo catálogo) y termina en «No se ha guardado nada».
- **Sin conexión, la web no muestra datos ni deja registrar** («Sin conexión» y «Reintentar»).
- **`compact` y la restauración** siguen como operaciones de administración sobre el remoto (ADR-0032); sin pendientes que comprobar, tras ellas el siguiente `412` recarga el libro.
- **La consola no es cliente de la API** (ADR-0037): trabaja sobre una carpeta local, y llega a la nube solo como administración, con credenciales cortas de AWS y MFA (`atlas admin pull|compact|restore`, `docs/cli.md`). Las carpetas «de nube» de E3 (`specs/024-console-cloud`) se retiraron.

## 6. Datos de referencia

Decidido el 2026-09-25 (feature 015) y ampliado por la 016 (2026-09-28): la regla de los nombres de `prices/`, el `symbols.json` que no se sirve y el cliente de la web. Leen con la sesión, **no escriben nada** y no alcanzan nada fuera de `reference/ecb/` y `prices/`:

| Ruta | Respuesta |
|---|---|
| `GET /api/reference/index` | `200 { "ecb": [ { "name", "version", "size" } ], "prices": [ … ] }`. `version` es una etiqueta opaca (el ETag del objeto en S3): sirve para saber qué ha cambiado sin descargarlo. Solo el primer nivel de cada prefijo (`previous/` y `rejected/` no se listan), y **solo lo que se serviría** con la regla de abajo *(016)* |
| `GET /api/reference/ecb/<name>` | Los bytes de `reference/ecb/<name>`, con `ETag: "<version>"`; con `If-None-Match` igual, `304`. *(015)* Vale también en su forma débil, `W/"<version>"`, porque CloudFront debilita el ETag al comprimir (`text/csv` y `application/json` sí están en su lista), y `*` |
| `GET /api/reference/prices/<name>` | Lo mismo sobre `prices/<name>`. *(016)* Un `symbols.json` con una clave repetida, o con una clave de primer nivel que no sea `symbols_format` ni `assets`, **no se sirve**: `404 not_found` con `details.reason` `repeated_key` o `unknown_key` (no pasó por la diferencia de `atlas admin prices push`) |

**El nombre se comprueba antes de tocar S3**, y si no cumple la regla de su prefijo, `400 reference_name_invalid`:
- en `reference/ecb/`, `<name>` cumple `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$` y no contiene `..`;
- en `prices/` *(016)*, `symbols.json` por su nombre, o un nombre que es **exactamente el que escribe `priceFileName`** para algún `asset_id` no vacío: termina en `.jsonl`, tiene como mucho 255 caracteres y `priceFileName(decodeURIComponent(<base>))` lo devuelve igual (una secuencia `%` rota se niega). Así nada sale de `prices/` y cualquier `asset_id` del libro tiene su fichero. **`_status.json` y `config.json` no se sirven.**

Si no existe, `404 not_found` (`details.reason: "missing"`). `Content-Type` por la extensión: `.csv` → `text/csv; charset=utf-8`, `.jsonl` → `application/x-ndjson; charset=utf-8`, `.json` → `application/json`; cualquier otra, `404`. **El cliente** *(016)*: uno solo, `@atlas/adapters/reference-http`, con la cookie de la web y `redirect: "error"`. Pide cada fichero con `If-None-Match` sobre la versión que ya tiene, y no acepta una respuesta de más de 20 MB (64 MB para `eurofxref-hist.csv` y `api-exr.csv`). La web lo usa para el histórico del BCE con la sesión iniciada, también en el móvil (ADR-0029, nota del 2026-09-28); la consola ya no baja nada de la nube (ADR-0037). Qué guarda la web en local: `docs/data-schema.md` §1 (`reference/ecb/`).

**Compresión** *(fallos 2, 2026-10-22)*: la Function URL responde como mucho 6 MB y `api-exr.csv` pesa unos 12 MB. Un fichero de 256 KiB o más se sirve en gzip (`Content-Encoding: gzip`, `Vary: Accept-Encoding`, cuerpo en base64) si el cliente manda `Accept-Encoding: gzip`, que `fetch` envía siempre. El `ETag` es el mismo con y sin compresión: nombra el fichero, no su codificación. La ruta no se cachea (`CachingDisabled`), así que no hay clave de caché que separar. Sin gzip, un fichero que supere los 6 MB no cabe (`502`): con datos como los reales (relación ~4:1) el tope del CSV está en unos 17 MB: cuando el histórico se acerque, hay que partirlo o servirlo por tramos.

`documents/` e `imports/` se suben con la regla de añadir y nunca sobrescribir (ADR-0026, Consecuencias), con su detalle en la feature que los use (la subida no es de la 015).

### 6.1 Borradores *(E6 de ADR-0035, feature 027)*

Decidido el 2026-10-06 (ADR-0035, pregunta 1, y ADR-0029, punto 9, opción B). Una operación en divisa registrada **antes** de que el BCE publique el tipo de su fecha fiscal no es un hecho: no entra en el libro, no cuenta en ninguna cifra y **nunca se confirma sola**. Hasta E6 los clientes de nube no la guardaban; desde E6 se guarda **en la nube**, por la API, con el formato propio de ADR-0029 (`docs/data-schema.md` §1, fila `drafts/`), y no es de un dispositivo. Con la cookie (§2.3), como §5 y §6; toda escritura comprueba `Origin` (§2). El libro **nunca** guarda un dato provisional: confirmar es registrar el evento por §5 (`POST /api/ledger/lines`), con su vista previa y su pregunta de duplicado, y después cerrar el borrador.

**Nada se sobrescribe ni se borra.** El rol de la API tiene `GetObject`, `PutObject` y `ListBucket` sobre `drafts/` y **ningún permiso de borrado**, y cada objeto se crea con `If-None-Match: *`: la creación es atómica y un segundo intento recibe `412`, que la API traduce. La sentencia `DraftsOnlyIfAbsent` de la política del bucket repite la condición para cualquier otro escritor y se mantiene: no cuesta nada y protege lo que puede ser la única copia de una operación (decidido el 2026-10-26). Un borrador son **hasta tres objetos inmutables**, uno por estado (`docs/data-schema.md` §1): `drafts/<id>.json` (guardado), `drafts/<id>.stamp.json` (el identificador que tendrá su evento, `pending_event_id`) y `drafts/<id>.end.json` (confirmado o descartado). «Pendiente» es tener el primero y no el tercero. Es la única forma de cumplir «sin borrar y sin sobrescribir» con las reglas de `pending_event_id` (§6.3 del esquema): sellar es **crear** el objeto de sello, y «solo si sigue como se leyó» es que ese `If-None-Match` falle.

| Ruta | Qué hace |
|---|---|
| `GET /api/drafts` | `200 { "drafts": [ <borrador> ], "unreadable": [ "<nombre>" ] }`. Solo los **pendientes**, del más antiguo al más reciente (el orden del identificador). Cada `<borrador>` es el formato lógico `{ "draft_format": 1, "id", "saved_at", "event", "pending_event_id"? }`, con el sello ya incorporado. `unreadable` nombra, sin leerlos ni borrarlos, los objetos de `drafts/` que no cumplen la forma (un nombre ajeno, un sello o un cierre sin borrador, un JSON ilegible o que no corresponde a su nombre): puede ser la única copia de una operación |
| `POST /api/drafts` | Cuerpo `{ "draft": { "draft_format": 1, "id", "saved_at", "event" } }`, **sin** `pending_event_id`. Crea `drafts/<id>.json`. `201 { "id" }`. `409 draft_exists` si ya hay un borrador con ese `id` (también uno cerrado). `409 too_many_drafts` con `details.max` si ya hay **`MAX_PENDING_DRAFTS` = 32** pendientes (los cerrados no cuentan; reintentar uno ya guardado sigue dando `draft_exists`) |
| `POST /api/drafts/{id}/stamp` | Cuerpo `{ "pending_event_id": "<ULID>" }`. Crea `drafts/<id>.stamp.json` **solo si no existe**: `200 { "id", "pending_event_id", "created": true }`. Si ya existe **con ese mismo identificador**, `200` con `"created": false` (reintentar un corte es seguro). Si existe con **otro**, `409 draft_changed` con `details.now = "stamped"`: otro cliente lo está confirmando, no se escribe nada. Si el borrador está cerrado, `409 draft_changed` con `details.now = "gone"`; si nunca existió, `404 not_found` con `details.reason = "draft_missing"` |
| `POST /api/drafts/{id}/end` | Cuerpo `{ "outcome": "confirmed", "event_id": "<ULID>" }` o `{ "outcome": "discarded" }`. Crea `drafts/<id>.end.json`. `200 { "id", "outcome", "created" }`. **Confirmar exige que el sello exista y sea exactamente `event_id`** (`409 draft_changed`, `now = "stamped"`, si es otro; `400 body_invalid`, `reason = "not_stamped"`, si no hay sello); descartar no lo exige. Cerrar otra vez con el **mismo** resultado es `200` con `"created": false`; con otro distinto, `409 draft_changed`, `now = "gone"` (gana el primero). `404 draft_missing` si no existe |

- **`{id}` es un ULID** (26 caracteres de Crockford); otra cosa es `400 body_invalid` con `reason = "draft_id"`, **antes** de tocar S3. Los nombres de objeto los construye la Lambda, nunca el cliente; ninguna ruta lee ni escribe fuera de `drafts/` ni más de un nivel.
- **Un cuerpo exacto:** un campo desconocido, `pending_event_id` al crear, un `draft_format` distinto de `1`, un `id` que no es ULID, un `saved_at` que no es un instante ISO 8601 en UTC con `Z`, o un `event` que no es un objeto con `type` en texto, es `400 body_invalid` con el motivo en `details.reason`. **La API no juzga la operación** (le falta el tipo del BCE, y la vista previa es del cliente): solo la forma. El libro sigue exigiendo `fx_rate` cuando se confirma.
- **Tope propio:** un borrador de más de **65.536 bytes** una vez serializado es `413 body_too_large` con `details.limit`. Un borrador real ocupa unos cientos de bytes.
- **Carrera entre cerrar y sellar:** tras crear el sello, la API vuelve a mirar si el borrador se cerró entre medias y, si es así, responde `409 draft_changed` (`now = "gone"`): el cliente no llega a escribir el evento. El sello que quedó no hace daño (un borrador cerrado no se vuelve a abrir).
- **Qué hace el cliente al confirmar** (`recordPendingDraft`, dominio): sella con `…/stamp`, escribe el evento por §5 con ese identificador, y cierra con `…/end` (`confirmed`). Un corte entre escribir y cerrar deja el borrador **pendiente y sellado**: al reintentar, solo un evento del libro con **exactamente** ese identificador cuenta como «ya registrado», y entonces solo se cierra. Si cerrar falla, el cliente lo dice y no lo traga.
- **Tope de pendientes:** un borrador real vive los segundos entre guardar la operación y escribirla; 32 pendientes a la vez es que algo va mal, y con 32 de 64 KiB el listado queda en unos 3 MB, bajo los 6 MB de la respuesta. `GET /api/drafts` lee los objetos en paralelo.
- **Crecimiento:** los borradores cerrados no se borran ni se archivan y siguen en el listado de primer nivel de `drafts/`, que la API recorre entero en S3. Con decenas al año no hace falta paginar ni archivar; se hará si el listado se nota lento (decidido el 2026-10-26).
- **Registros de la Lambda:** solo el código (`drafts_listed`, `draft_saved`, `draft_stamped`, `draft_ended`, o el del error). Nunca el `id`, la operación ni un importe.
- **No se comprime, no se cachea y no se versiona en el cliente:** como todo `/api/*`, `Cache-Control: no-store`; la web no guarda ningún borrador en el dispositivo (ADR-0035, §3).


## 7. Errores

Todo error de la Lambda tiene esta forma, sin mensaje en lenguaje natural (lo ponen las interfaces, que traducen cada código, `tests/messages.test.ts`):

```json
{ "error": { "code": "session_invalid", "details": { "reason": "closed" } } }
```

| Código | HTTP | Cuándo |
|---|---|---|
| `unauthenticated` | 401 | Ninguna credencial en una ruta que la pide |
| `session_invalid` | 401 | Cookie mal firmada, de otro `typ`, repetida o caducada; con `details.reason = "closed"`, emitida antes de la marca de `logout-all`, o con una marca ilegible (§3) |
| `not_allowed` | 403 | El `sub` de la sesión ya no tiene entrada en la lista permitida (§2) |
| `origin_rejected` | 403 | Escritura con cookie y `Origin` ajeno |
| `body_invalid` | 400 | Cuerpo que no cumple el de la ruta (campo desconocido, `device_id`, salto de línea en `line`, un cuerpo que no es `{}` en `logout-all`…) |
| `body_not_json` | 415 | Cuerpo que no es JSON en una ruta que escribe |
| `precondition_required` | 428 | `POST /api/ledger/lines` sin `If-Match` |
| `precondition_failed` | 412 | `If-Match` distinto del etag actual; nada escrito |
| `not_found` | 404 | Ruta que no existe; y en §6.1, un borrador que no existe (`details.reason`: `draft_missing`) |
| `internal` | 500 | Cualquier otro fallo; nada escrito |
| `remote_unavailable` | 503 | Fallo transitorio de SSM o de S3; se puede reintentar (`Retry-After: 5`, `details.dependency`: `ssm` \| `s3`). Nunca deja pasar una credencial |
| `reference_name_invalid` | 400 | Un nombre de §6 que no cumple su regla |
| `draft_exists` | 409 | `POST /api/drafts` con un `id` que ya tiene borrador (§6.1) |
| `too_many_drafts` | 409 | `POST /api/drafts` con `MAX_PENDING_DRAFTS` (32) borradores ya pendientes, `details.max` (§6.1); nada escrito |
| `draft_changed` | 409 | El borrador ya no está como se leyó: cerrado (`details.now = "gone"`) o sellado con otro identificador (`"stamped"`). Nada escrito; el cliente no registra la operación como nueva (`docs/data-schema.md` §6.3) |
| `append_too_many_units` | 413 | `POST /api/ledger/lines` con más de `MAX_APPEND_UNITS` (100) unidades, `details.max` (§5.2); nada escrito |
| `body_too_large` | 413 | Un cuerpo por encima del tope propio de la Lambda, antes de leerlo (la Function URL admite 6 MB) |

*(014)* **La lista cerrada de los fallos que no son de una línea** es `REMOTE_FAILURE_CODES` (`packages/domain/src/ports/remote-ledger.ts`). Contiene los códigos de esta tabla que pueden responder las rutas de §5 y §6.1, y dos que nombra el cliente para lo que no llegó a la API: `transport_rejected` (abajo) y `network_failed`, un fallo de red. El cliente los lleva tal cual en `remote_failed`, y cada interfaz tiene una frase para cada uno.

Y los **motivos de rechazo de una línea** (dentro de un `200`, en `rejected.code`, §5.2): `line_unreadable`, `schema_version_unsupported`, `line_invalid`, `recorded_at_in_future`, `domain_rejected`, `duplicate_unconfirmed`, `pair_declaration_invalid`, `pair_incomplete`, `pair_not_contiguous`, `pair_rejected`, `seal_mismatch`, `waiver_not_appendable`, `line_too_large` y `ledger_too_large`.

**Qué hace el cliente con cada respuesta:** §5.8.

Fuera de la Lambda: `transport_rejected` es el nombre que da **el cliente** a una respuesta sin este formato (el hash del cuerpo rechazado por AWS, el WAF, un error de CloudFront). Nunca se trata como un rechazo de líneas: se dice y el resultado de la escritura se trata como desconocido (§5.8).

## 8. Quién implementa qué

| Pieza | Feature |
|---|---|
| El caso de uso puro que acepta líneas (el mismo para el cliente y para la Lambda), las operaciones de líneas crudas del puerto y un **remoto simulado** que cumple §5 sin HTTP | **014**, fusionada (PR #83, 2026-09-25) |
| `ApiLedgerStore`, la web contra la nube (la consola, hasta ADR-0037), la API sin cola y el código muerto, retirados | **021 a 026** (E1 a E5 de ADR-0035) |
| Las órdenes de administración de la consola contra el almacén remoto (`pull`, `compact` y `restore`), **fuera de la API** (ADR-0026, Parte A; ADR-0037) | **015** y ADR-0037 |
| La Lambda: §1 a §7 sobre HTTP, `LedgerStore` sobre S3 con `If-Match`, la lista permitida en SSM y el cliente HTTP de la web | **015** |
| El correo mensual con el último inicio de sesión de la web (`access/last-web-sign-in.json`, §3); la regla de nombres de `prices/` y el cliente de §6 | **016**, fusionada (PR #104, #106, #108 y #109, 2026-09-28) |
| El prefijo de SSM y sus permisos, y la política de origen que reenvía `Origin` a `/api/*` (sin él, toda escritura se rechaza con `origin_rejected`, §2; revisión de la PR #90, ronda 2) | **017** |
| `POST /api/auth/logout-all` y su marca (§3), y la retirada del token de la consola | ADR-0037 |
| Los borradores en la nube: §6.1, el prefijo `drafts/` del rol de la API sin permiso de borrado, el puerto sobre la API y el cliente de la web | **027** (E6 de ADR-0035) |

## 9. Parámetros de SSM y configuración de la Lambda

Decidido el 2026-09-25 (feature 015). **Los valores los crea y los rota el guion de secretos**, con el rol de administración, nunca Terraform (ADR-0034, fila 21); aquí van sus nombres y formatos.

| Parámetro | Tipo | Valor | Caché en cada instancia |
|---|---|---|---|
| `/atlas/<entorno>/auth/allow-list` | `SecureString` | `{"allow_list_format":1,"entries":[{"sub":"…","email":"…"}]}`; el correo se compara **exacto** y además se exige `email_verified` | 120 s |
| `/atlas/<entorno>/auth/google-client-id` | `String` | el identificador del cliente OAuth del entorno | 300 s |
| `/atlas/<entorno>/auth/google-client-secret` | `SecureString` | el secreto, tal cual | 300 s |
| `/atlas/<entorno>/auth/session-key` | `SecureString` | 32 bytes aleatorios en base64url (43 caracteres); de ella salen las subclaves HKDF | 300 s: rotarla cierra todas las sesiones como mucho en 5 minutos |

**Configuración que no es secreta**, en variables de entorno de la Lambda (**ningún secreto en una variable de entorno**): `ATLAS_ENV`, `ATLAS_ORIGIN`, `ATLAS_DATA_BUCKET`, `ATLAS_SESSION_TTL_SECONDS` (86.400), `ATLAS_LOGIN_TTL_SECONDS` (600), `ATLAS_CLOCK_TOLERANCE_SECONDS` (600), `ATLAS_ALLOW_LIST_CACHE_SECONDS` (120) y `ATLAS_SECRETS_CACHE_SECONDS` (300). Una variable `ATLAS_*` desconocida, o un valor que no se entiende, impide arrancar. **Techos fijos en el código** (revisión de seguridad de la PR #90, S4): la sesión, como mucho 24 h (86.400); la cookie transitoria, 30 min (1.800); las dos cachés, 1 h (3.600); la tolerancia del reloj, 1 h (3.600). Por encima, la configuración se rechaza y la Lambda no arranca.

### 9.1 Las tareas programadas *(016)*

Las cinco funciones de `apps/jobs` (`docs/specification.md` §9.5) siguen las mismas reglas que la API: **ningún secreto en una variable de entorno**, y una variable `ATLAS_*` desconocida o un valor que no se entiende impiden arrancar (`jobs_config_invalid`, con `details.variable` y `details.reason`). Cada variable es obligatoria en la función que la usa y desconocida en las demás. Los valores los escribe Terraform (017), salvo las claves de las fuentes, que crea y rota el guion de secretos (ADR-0034, fila 21). Contrato completo, con cada regla: `specs/016-scheduled-jobs/contracts/ssm-and-config.md` (retirada; en git).

| Parámetro | Tipo | Quién lo escribe | Quién lo lee |
|---|---|---|---|
| `/atlas/<entorno>/mail/recipient` | `String` | Terraform, desde `terraform.tfvars`, que escribe también la condición `ses:Recipients` (ADR-0034, fila 12); nunca a mano | solo el adaptador de SES, en cada envío |
| `/atlas/<entorno>/mail/amounts` | `String` | Terraform, `off` por defecto (ADR-0028, fila 18) | solo la función de correo: **solo `on` enciende los importes**; cualquier otra cosa, o nada, los deja apagados |
| `/atlas/<entorno>/prices/eodhd-key` | `SecureString` | el guion de secretos; **`dev` no la lleva** (ADR-0034, fila 2) | solo la función de precios, en cada ejecución |

Cambiar el destinatario o el interruptor: [`docs/runbooks/mail-recipient-and-amounts.md`](runbooks/mail-recipient-and-amounts.md).

| Variable | Funciones | Valor y techo fijo en el código |
|---|---|---|
| `ATLAS_ENV`, `ATLAS_DATA_BUCKET` | todas | como en la API; el bucket, además, **empieza por `atlas-<ATLAS_ENV>-`** |
| `ATLAS_JOBS` | todas | las tareas de la función, **de una sola familia** y sin repetir |
| `ATLAS_JOB_MAX_RUN_SECONDS` | todas | de 1 a 900, el mismo valor que el `timeout` de la Lambda: un registro reclamado hace menos no se retoma |
| `ATLAS_MAIL_FROM`, `ATLAS_ORIGIN`, `ATLAS_OAUTH_IDLE_WARNING_DAYS` | correo | el remitente verificado; el origen, lo único que un correo enlaza; los días sin iniciar sesión a partir de los que avisa (150, de 1 a 179) |
| `ATLAS_PRICE_SOURCES`, `ATLAS_PRICES_EODHD_DAILY_CALLS`, `ATLAS_PRICES_FAILURE_THRESHOLD` | precios | la fuente (`eodhd`; `simulated` solo en `dev`); el presupuesto de la nube, 18 (como mucho 20); el umbral de fallos seguidos, 3 (de 1 a 30) (ADR-0031, nota del 2026-09-28; [`docs/runbooks/cloud-symbols-and-budgets.md`](runbooks/cloud-symbols-and-budgets.md)) |
| `ATLAS_LEDGER_SIZE_WARNING_BYTES` | integridad | 1.048.576, de 1.024 a 104.857.600: avisa el libro **por encima**, nunca en el umbral (ADR-0028, nota del 2026-09-28) |
