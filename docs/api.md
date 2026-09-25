# Contrato de la API

El contrato HTTP de la Lambda de la API (`apps/api`), que se alcanza **solo a través de CloudFront**, bajo `/api/*` (ADR-0028, fila 6). Lo encargan **ADR-0026** («Consecuencias»: rutas, cuerpos, códigos, la confirmación y el rechazo por línea, la pareja de anulación y corrección como una sola línea, y el rechazo de una anulación cuya corrección no viene en la misma petición) y **ADR-0033** («Reparto entre features»: la cabecera, las rutas de inicio, canje, revocación y lista, sus códigos de error, los límites del nombre del dispositivo y cómo se liga a su sesión el identificador de dispositivo de la web). Se escribe **antes de implementar**, con el prompt de la feature 014.

**Estado:** escrito el 2026-09-25 con `docs/prompts/014-ledger-sync-core.md`. **Nada de esto está implementado.** La **feature 014** construye la sincronización contra un **remoto simulado** que cumple la semántica de las rutas de sincronización (§5) sin HTTP; la **feature 015** implementa la API de verdad, el acceso (§3 y §4) y los clientes HTTP. Lo que este documento no decide va marcado **[PENDIENTE]** y lo decide la dirección; una propuesta marcada como tal no es una decisión.

**Si este documento discrepa de una ADR, manda la ADR**, y la discrepancia se anota en el `questions.md` de la feature que la encuentre.

## 1. Reglas generales

- **Un solo origen.** La SPA y la API comparten distribución de CloudFront: la cookie es del mismo sitio y **la API no responde a CORS** (ADR-0028, fila 6). El navegador y la consola nunca llaman a la Function URL directamente.
- **`Authorization` no se usa nunca.** CloudFront la sobrescribe para firmar con OAC (ADR-0027, hecho 1). Toda credencial va en la cookie o en `x-atlas-device-token` (§2).
- **Todo `POST` y `PUT` lleva `x-amz-content-sha256`** con el SHA-256 hexadecimal del cuerpo exacto (ADR-0027, hecho 2). Si falta o no cuadra, la petición la rechaza AWS **antes** de llegar a la Lambda, con una respuesta que **no** tiene el formato de error de §7: el cliente la trata como `transport_rejected` y nunca como un rechazo de sus líneas.
- **Cuerpo JSON obligatorio** en toda petición que escribe (`Content-Type: application/json`), incluso vacío (`{}`): es una de las defensas contra la falsificación de peticiones de ADR-0027.
- **Fechas** en ISO 8601; instantes en UTC con `Z`. **Importes**, si alguna vez viajan fuera de una línea del libro, como cadenas (ADR-0005).
- **Ninguna ruta de datos redirige.** Solo las del inicio de sesión (§3 y §4) responden con `302`. La consola hace sus peticiones con `redirect: "error"` (ADR-0033, punto 4), así que una redirección inesperada es un fallo y el token nunca sale hacia otro origen.
- **Registros de la Lambda:** el código del resultado y, como mucho, el identificador público de un token (`token_id`). Nunca el token, su hash, el correo, el `sub`, una línea del libro, un importe, una posición ni una cuenta (ADR-0027, ADR-0028 fila 16, ADR-0033 punto 10, `CLAUDE.md` → *Logging*).

## 2. Credenciales

Hay **dos**, y cada petición lleva **exactamente una**:

| Credencial | Quién | Dónde viaja | Definida en |
|---|---|---|---|
| Cookie de sesión `__Host-…` | La web | Cookie `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, firmada con la subclave `session` (HKDF) y con `typ` | ADR-0027, ADR-0033 punto 2 |
| Token de dispositivo | La consola | Cabecera **`x-atlas-device-token`** | ADR-0033 |

- **Cookie y token a la vez: `400 credentials_ambiguous`**, sin mirar ninguna de las dos (ADR-0033, punto 4).
- **Sin ninguna: `401 unauthenticated`**, salvo en las rutas de inicio de sesión.
- **Con cookie, toda petición que escribe** comprueba además `Origin` contra el origen propio (`403 origin_rejected`). Con el token no hace falta: un navegador no añade una cabecera propia a otro sitio sin una comprobación CORS previa, y la API no responde a CORS.
- **Cada petición vuelve a consultar la lista permitida** `{sub, email}` (ADR-0027, enmienda; ADR-0033, punto 5), con la caché de la lista de ADR-0027 (**[PENDIENTE]**, el valor lo fija la 015). El registro del token **no** se cachea (§2.2).

### 2.1 Formato del token de dispositivo

```
atlasdt1.<token_id>.<secret>
```

- `atlasdt1` — prefijo fijo y reconocible (versión 1 del formato), para que un escáner de secretos lo encuentre. La regla de `gitleaks` es configuración de herramientas: **se propone al usuario**, no se añade (ADR-0033, punto 1).
- `<token_id>` — **22 caracteres exactos de `[A-Za-z0-9_-]`** (128 bits aleatorios en base64url sin relleno). Es **público**: nombra el parámetro de SSM, sale en la lista de la web y puede ir a un registro. **Nunca contiene `:` ni `/`**: `GetParameter` interpreta `nombre:versión` y `nombre:etiqueta`, y sin esta regla un token revocado volvería a valer leyendo una versión anterior del registro (ADR-0033, bloqueante B1).
- `<secret>` — **43 caracteres exactos de `[A-Za-z0-9_-]`** (256 bits de `crypto.randomBytes` en base64url sin relleno). El servidor guarda solo su SHA-256.
- Expresión completa: `^atlasdt1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$`. Lo que no cuadre es `401 device_token_invalid` **antes** de tocar SSM.

### 2.2 Comprobación del token, en cada petición

En este orden, rechazando al primer fallo (ADR-0033, punto 5):

1. Formato (§2.1) → `device_token_invalid`.
2. Registro `/atlas/<entorno>/device-tokens/<token_id>`, leído de SSM **sin caché** y **sin selector de versión**; si no existe, o **su propio `token_id` no es el pedido** → `device_token_invalid`.
3. SHA-256 del secreto, comparado en tiempo constante (`crypto.timingSafeEqual`) → `device_token_invalid`.
4. No revocado → `device_token_revoked`.
5. No caducado: antes de `expires_at` **y** antes de `issued_at` + 120 días (techo fijo en el código, ADR-0033 punto 7) → `device_token_expired`.
6. Su par `{sub, email}` sigue en la lista permitida → `403 not_allowed`.

Solo pueden cachearse los negativos que no pueden volver a valer (revocado, caducado); un «no existe» no se cachea.

### 2.3 Alcance de cada credencial

| Ruta | Sesión (web) | Token (consola) |
|---|---|---|
| §5 Sincronización: leer el libro, añadir líneas, publicar el estado de **su** cola | Sí | Sí |
| §6 Datos de referencia | Sí | Sí |
| §4.4 Revocar **el propio** token | — | Sí |
| §4.5 Listar tokens y revocar uno cualquiera; leer el estado de todos los dispositivos | Sí | **No**: `403 forbidden_for_credential` |
| §4.1 Emitir un token | Solo al final de un inicio de sesión que abre la consola (§4) | **No** |

**El identificador del dispositivo sale siempre de la credencial, nunca del cuerpo** (ADR-0033, punto 6; ADR-0026, paso 7). Un campo `device_id` en el cuerpo de una petición de sincronización es `400 body_invalid`.

## 3. Acceso de la web (ADR-0027)

La **vía c**: la Lambda es el cliente OAuth y el token de Google nunca toca la SPA.

| Método y ruta | Qué hace |
|---|---|
| `GET /api/auth/login` | Crea el intento (`state`, `nonce`, verificador PKCE) en la **cookie transitoria** `SameSite=Lax` de un solo uso, y redirige (`302`) a Google. |
| `GET /api/auth/callback` | Vuelta de Google. Verifica en el orden de ADR-0027 (`state` contra la cookie transitoria, PKCE, firma, `aud` del entorno, `iss`, `exp`, `nonce`, `email_verified`, par `{sub, email}` en la lista). Si el intento es de la **web**, emite la cookie de sesión y redirige a la SPA. Si es de la **consola**, sigue §4.2. |
| `POST /api/auth/logout` | **[PENDIENTE]**: ADR-0027 no nombra una ruta para cerrar la sesión de la web. Propuesta: borra la cookie y responde `204`. La decide la 015. |

La duración de la sesión y de la cookie transitoria son **[PENDIENTE]**: ADR-0027 las deja a la feature (la 015).

## 4. El token de dispositivo de la consola (ADR-0033)

### 4.1 Inicio del intento

`GET /api/auth/console/start`, sin credencial, abierto en el navegador por `atlas remote login` (la consola **siempre imprime la URL**). Parámetros de consulta:

| Parámetro | Regla |
|---|---|
| `port` | Entero de 1024 a 65535: el puerto que la consola abrió en `127.0.0.1` (puerto 0, elegido por el sistema). Obligatorio salvo en `mode=manual`. |
| `state` | 43 caracteres de `[A-Za-z0-9_-]` generados por la consola. |
| `code_challenge` | 43 caracteres de `[A-Za-z0-9_-]` (S256 del verificador, RFC 7636). |
| `code_challenge_method` | Exactamente `S256`. |
| `device_name` | El nombre que la consola propone para el dispositivo. **Límites [PENDIENTE]**, propuesta: de 1 a 40 caracteres, letras (con tildes y `ñ`), dígitos, espacio, `-`, `_` y `.`, sin espacios al principio ni al final. **Se escapa** allí donde se muestre (página manual, lista de la web, correo). |
| `mode` | `loopback` (por defecto) o `manual`. |

Cualquier parámetro que no cumpla es `400 console_start_invalid`, con el nombre del parámetro en `details`, y no se abre ningún intento. Si cumplen, la Lambda guarda los parámetros **en la cookie transitoria** de ADR-0027, junto a los suyos, y sigue la vía c pidiendo a Google una **pantalla interactiva** (`prompt=select_account`).

### 4.2 La vuelta de Google, rama de la consola

`GET /api/auth/callback` verifica **todo** lo de §3, lista permitida incluida. Si el intento es de la consola, **no emite cookie de sesión**: emite un **código de un solo uso**, firmado con la subclave `console_code` (HKDF) y con `typ` de código —el verificador de la cookie lo rechaza, y el del código rechaza una cookie—, que lleva el `token_id` que tendrá el token, el `code_challenge`, el par `{sub, email}`, el nombre del dispositivo y su caducidad (**[PENDIENTE]**, ADR-0033 dice «en minutos»; propuesta: 5 minutos).

- **Si `amr` con `mfa` resulta verificable** (SIN VERIFICAR, la 015 lo comprueba antes de escribir código), una vuelta sin `mfa` es `403 mfa_required` y no hay código.
- **`mode=loopback`:** `302` a `http://127.0.0.1:<port>/callback?code=<código>&state=<state>`. El destino es el **literal** `127.0.0.1`, fijado en el código, y el puerto, el número validado en §4.1: la ruta no puede redirigir a ningún otro sitio. La página que la consola sirve en ese puerto no carga nada externo y lleva `Referrer-Policy: no-referrer`; un `state` erróneo se ignora y el puerto sigue esperando.
- **`mode=manual`:** una página propia de la Lambda **sin script**, con `Content-Security-Policy: sandbox`, `Cache-Control: no-store` y `Referrer-Policy: no-referrer`. Primero pide **confirmar expresamente el nombre del dispositivo**; después enseña el código, la hora del intento y el aviso de que el código solo se teclea en una consola que el usuario acaba de abrir él mismo. La consola lo lee sin mostrarlo.

### 4.3 Canje

`POST /api/auth/console/token`, sin cookie. Cuerpo:

```json
{ "code": "<código de §4.2>", "code_verifier": "<verificador PKCE>" }
```

- **Renovación:** si la consola tiene un token anterior para ese origen, lo envía en `x-atlas-device-token`. Para esta ruta, y solo para ella, un token **caducado pero no revocado** vale para identificar el dispositivo. La API **conserva su `device_id`** y **revoca el token anterior antes de crear el nuevo**. Un token revocado aquí es `401 device_token_revoked`, y la consola vuelve a iniciar sesión sin él.
- Comprobaciones, en orden: firma y `typ` del código (`console_code_invalid`), caducidad (`console_code_expired`), verificador contra el `code_challenge` (`pkce_mismatch`), lista permitida otra vez (`not_allowed`).
- **Uso único obligatorio:** el registro se crea **sin sobrescribir** (`PutParameter` sin `Overwrite`) con el `token_id` que trae el código; si ya existe, el código ya se usó: `409 console_code_used`. Que eso sea atómico ante dos canjes simultáneos está SIN VERIFICAR (la 015 lo verifica y, si no lo es, para).
- **`device_id` lo asigna la API** en el primer canje: 22 caracteres de `[A-Za-z0-9_-]`, aleatorios. La consola nunca lo propone.

Respuesta `200`, **una sola vez**:

```json
{
  "token": "atlasdt1.<token_id>.<secret>",
  "token_id": "<token_id>",
  "device_id": "<device_id>",
  "device_name": "<nombre>",
  "issued_at": "2026-10-01T10:00:00Z",
  "expires_at": "2026-12-30T10:00:00Z"
}
```

`expires_at` = `issued_at` + la caducidad configurada (90 días, ADR-0033 punto 7), **nunca** más que el techo de 120. La consola lo guarda en `~/.config/atlas/credentials.json` con el origen para el que se emitió (`docs/data-schema.md` §1).

### 4.4 Revocar el propio token

`POST /api/auth/console/revoke`, con `x-atlas-device-token` y cuerpo `{}`. Revoca **ese** token y solo ese: sobrescribe su registro con `revoked_at` (la única sobrescritura del registro). Respuesta `200 { "token_id": "…", "revoked_at": "…" }`. `atlas remote logout` **solo borra su entrada local cuando recibe este 200**; sin él, avisa de que el token sigue vivo en el servidor (ADR-0033, punto 8).

### 4.5 Lista y revocación desde la web (solo con sesión)

- `GET /api/devices/tokens` → `200 { "tokens": [ … ] }`, uno por registro: `token_id`, `device_id`, `device_name`, `issued_at`, `expires_at`, `status` (`active` \| `expired` \| `revoked`), `revoked_at?`, `last_sync_at?` (leído de `sync/devices/<device_id>.json`, §5.3, nunca guardado en el registro) y `recent` (emitido en los últimos días; **[PENDIENTE]** cuántos, propuesta: 7). Sin correo ni `sub`.
- `POST /api/devices/tokens/<token_id>/revoke`, cuerpo `{}` → `200 { "token_id": "…", "revoked_at": "…" }`. `<token_id>` pasa la regla de §2.1 **antes** de construir el nombre del parámetro (`400 body_invalid` si no). Revocar uno ya revocado devuelve el mismo `revoked_at`, sin volver a escribir.
- **Revocar todos sin Google** no es una ruta: es una operación de administración con credenciales de AWS (ADR-0028, fila 12), con procedimiento escrito en la 015 o la 018.

## 5. Sincronización del libro (ADR-0026)

El remoto es `ledger/ledger.jsonl` del bucket de datos. **La API solo añade**: nunca reescribe ni borra una línea (ADR-0026, Parte A). Las líneas se escriben **tal como las serializó el cliente**, byte a byte, para que la réplica de cada dispositivo sea exactamente el remoto (Parte A, «Réplicas idénticas byte a byte»).

**El etag de la API es el SHA-256 hexadecimal de los bytes del libro.** El cliente nunca ve el ETag de S3; la Lambda traduce el suyo a la condición de S3 (`If-Match` en `PutObject`). Con un libro vacío o inexistente, el etag es el SHA-256 de cero bytes.

### 5.1 Leer el remoto

`GET /api/ledger`

- `200`, cuerpo = **los bytes exactos** del libro, `Content-Type: application/x-ndjson; charset=utf-8`, cabecera `ETag: "<sha256>"`. Sin compresión que cambie los bytes que el cliente hashea (si CloudFront comprime, el cliente hashea lo descomprimido: lo que cuenta son los bytes del fichero).
- El cliente comprueba con este cuerpo el **hash del prefijo** que sincronizó (ADR-0026, Parte A): si los bytes de sus primeras `synced_lines` líneas no dan el hash de su marcador, el remoto se ha reescrito y no sube nada.
- **La API no interpreta la versión de esquema al servir**: un cliente antiguo que no entiende el remoto lo rechaza al cargar (`docs/data-schema.md` §5), y sus pendientes esperan.

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
    { "line": "<la corrección, con corrects_id a la operación anulada>" }
  ]
}
```

- `line`: el texto exacto de una línea del libro, como cadena JSON. La API escribe `line` + `"\n"` en UTF-8, **sin volver a serializar**. Una cadena con `"\n"` o `"\r"` es `400 body_invalid`.
- `confirm_duplicate`: la confirmación explícita, **por línea**, de una huella repetida (ADR-0012; ADR-0026, Parte A). Sin ella, una huella repetida es un rechazo de esa línea.
- `has_correction`: la declaración de que **esta anulación tiene corrección**. Solo vale en una línea de tipo `reversal` (`400 body_invalid` si no).
- Cualquier otro campo es `400 body_invalid`, y en particular un `device_id` (§2.3).

**Si `If-Match` no es el etag actual: `412 precondition_failed`**, sin escribir nada. También si otro escritor gana la carrera entre la lectura de la Lambda y su `PutObject` condicional. El cliente vuelve al paso 1 de la sincronización.

**Validación, línea a línea y en orden**, con el dominio (ADR-0026, Parte A), sobre el remoto con las líneas anteriores ya aceptadas:

| Orden | Comprobación | Código del rechazo |
|---|---|---|
| 1 | La línea es JSON y tiene `schema_version` | `line_unreadable` |
| 2 | `schema_version` no es más nueva que la que conoce la Lambda | `schema_version_unsupported` |
| 3 | La línea se decodifica y valida con el dominio (forma, `id` no repetido…) | `line_invalid`, con el código del dominio en `details.domain_code` |
| 4 | `recorded_at` no es posterior a la hora de la Lambda más la tolerancia (ADR-0026, caso 8; tolerancia configurable, valor **[PENDIENTE]**, lo fija la 015) | `recorded_at_in_future` |
| 5 | El libro proyectado con la línea añadida sigue siendo válido | `domain_rejected`, con `details.domain_code` |
| 6 | Si la huella está repetida, la línea trae `confirm_duplicate` | `duplicate_unconfirmed`, con los `id` que la repiten |
| 7 | Una línea que **sella el prefijo** (`tax_return_filed`, `filing_fingerprint_waived`) cuadra con el prefijo sobre el que cae | **[PENDIENTE]**: ADR-0026 no lo pide a la API, y la proyección de hoy no comprueba la huella de una presentación al registrarla (solo `check --deep` y `compact`). Propuesta: rechazarla con `seal_mismatch` |

**La pareja de anulación y corrección cuenta como una sola línea** (ADR-0026, segunda y tercera enmiendas):

- Una línea con `has_correction` **tiene que traer en la misma petición, detrás de ella**, la línea cuyo `corrects_id` es el `reverses_id` de la anulación. Si no la trae: `pair_incomplete`, en el índice de la anulación. Es la única forma que tiene la API de negarse a **partir una pareja entre dos peticiones**, porque no ve la cola del dispositivo: por eso el cliente **declara**.
- La pareja **se evalúa entera**: si falla la anulación o falla la corrección, el rechazo se da **en el índice de la anulación**, con `code: "pair_rejected"`, el código de la que falló en `details.member_code` y cuál fue en `details.member` (`reversal` \| `correction`). No se escribe ninguna de las dos.
- Si la corrección no va inmediatamente detrás de su anulación, **[PENDIENTE]**: la aplicación siempre las escribe juntas (`rectify.ts` añade `[reversal, event]` en una sola escritura), pero ADR-0026 solo dice «que la acompaña en la cola». Propuesta: exigir que sean contiguas (`pair_not_contiguous`).

**El rechazo es por línea:** la API escribe **el tramo válido hasta la primera línea rechazada**, en un solo `PutObject` condicional, y devuelve el motivo de esa línea. Nada de lo que va detrás se escribe, aunque fuera válido.

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
    "details": { "member": "correction", "member_code": "insufficient_position" }
  }
}
```

- `accepted`: cuántas entradas de `lines` se escribieron, desde la primera. Con `accepted: 0` no se escribió nada y `etag` es el mismo.
- `rejected`: ausente si se escribieron todas.
- **Una respuesta perdida no pierde nada:** el cliente nunca da una línea por subida con este `200`; vuelve a leer el remoto (§5.1) y comprueba que sus líneas están dentro, byte a byte, antes de quitarlas de su cola (ADR-0026, pasos 2 y 5).
- `details` puede contener lo que el dominio diga de la línea (un importe, una cantidad): va al cliente del propio usuario, **nunca a un registro**.

### 5.3 Publicar el estado de la cola del dispositivo

`PUT /api/sync/devices/self`, cuerpo:

```json
{ "pending": 2, "held": 1, "last_sync_at": "2026-10-01T10:00:00Z" }
```

La API escribe `sync/devices/<device_id>.json` con el `device_id` **de la credencial** (§2.3), esos tres campos y `published_at` (su hora). `pending` y `held` son enteros ≥ 0 (`400 body_invalid` si no). Respuesta `200 { "device_id": "…", "published_at": "…" }`. Es lo que miran `compact` y la restauración antes de actuar (ADR-0026, paso 7; ADR-0032): se niegan si algún dispositivo conocido tiene `pending` o `held` mayor que cero.

`GET /api/sync/devices` (**solo sesión**) → `200 { "devices": [ { "device_id", "pending", "held", "last_sync_at", "published_at" } ] }`.

### 5.4 Cómo se liga a su sesión el identificador de dispositivo de la web

**[PENDIENTE] — lo decide la dirección antes de la 015.** Lo que está fijado: la API toma el dispositivo de la credencial y **nunca del cuerpo** (ADR-0033, punto 6), para que quien robe una credencial no pueda publicar el estado de otro dispositivo, del que dependen `compact` y la restauración. Para la consola lo resuelve el token (el `device_id` que la API asignó al canjear). La web no tiene token: su credencial es una sesión corta que se renueva pasando por Google, y su identificador de dispositivo tiene que **sobrevivir** a las sesiones, porque su cola vive en su IndexedDB. Lo que el revisor de ADR-0033 dejó abierto es cómo se ata ese identificador a la sesión. Opciones, sin elegir:

- **(a) Asignado por la API al iniciar sesión y firmado dentro de la cookie.** La web guarda su `device_id` en IndexedDB y lo presenta **en el inicio de sesión** (`GET /api/auth/login?device_id=…`, no en cada petición); la API lo mete en la cookie transitoria y, tras verificar a Google, en la cookie de sesión. La primera vez, la API asigna uno. *Inconveniente:* la API no puede saber si ese identificador es de ese navegador; quien tenga la cuenta de Google podría iniciar sesión presentando el de otro dispositivo.
- **(b) Un registro de dispositivos web en SSM**, como el de los tokens de la consola, con un secreto propio del navegador guardado en IndexedDB y presentado al iniciar sesión. *Inconveniente:* es una credencial de larga duración en la página, lo que ADR-0027 y ADR-0033 evitaron.
- **(c) Sin identificador persistente en la web:** cada sesión es un dispositivo nuevo, y `compact` mira todos los que tengan algo pendiente. *Inconveniente:* se acumulan dispositivos muertos que hay que olvidar a mano.

## 6. Datos de referencia

**[PENDIENTE] — feature 015.** El token y la sesión permiten leer los datos de referencia (ADR-0033, punto 6): el histórico del BCE (`reference/ecb/`) y los precios (`prices/`) que la tarea diaria escribe en la nube (ADR-0031, «Dónde se descarga»; ADR-0029). Las rutas, sus formatos y cómo sabe un dispositivo qué ha cambiado se fijan en el prompt de la 015. `documents/` e `imports/` se suben con la regla de añadir y nunca sobrescribir (ADR-0026, Consecuencias), con su detalle en la feature que los use.

## 7. Errores

Todo error de la Lambda tiene esta forma, sin mensaje en lenguaje natural (lo ponen las interfaces, que traducen cada código, `tests/messages.test.ts`):

```json
{ "error": { "code": "device_token_expired", "details": {} } }
```

| Código | HTTP | Cuándo |
|---|---|---|
| `unauthenticated` | 401 | Ninguna credencial en una ruta que la pide |
| `credentials_ambiguous` | 400 | Cookie **y** token en la misma petición |
| `session_invalid` | 401 | Cookie mal firmada, de otro `typ` o caducada |
| `device_token_invalid` | 401 | Token con mal formato, sin registro, con otro `token_id` en el registro o con un secreto que no cuadra |
| `device_token_revoked` | 401 | Token revocado |
| `device_token_expired` | 401 | Token caducado (`expires_at` o el techo de 120 días) |
| `not_allowed` | 403 | El par `{sub, email}` no está en la lista permitida |
| `forbidden_for_credential` | 403 | Un token en una ruta solo de sesión (§2.3) |
| `origin_rejected` | 403 | Escritura con cookie y `Origin` ajeno |
| `mfa_required` | 403 | Emisión de un token sin `amr` con `mfa`, si se puede exigir (§4.2) |
| `console_start_invalid` | 400 | Un parámetro de §4.1 no cumple su regla |
| `console_code_invalid` | 400 | Código mal firmado o de otro `typ` |
| `console_code_expired` | 400 | Código caducado |
| `console_code_used` | 409 | Código ya canjeado |
| `pkce_mismatch` | 400 | El verificador no corresponde al `code_challenge` |
| `body_invalid` | 400 | Cuerpo que no cumple el de la ruta (campo desconocido, `device_id`, salto de línea en `line`…) |
| `body_not_json` | 415 | Cuerpo que no es JSON en una ruta que escribe |
| `precondition_required` | 428 | `POST /api/ledger/lines` sin `If-Match` |
| `precondition_failed` | 412 | `If-Match` distinto del etag actual; nada escrito |
| `not_found` | 404 | Ruta que no existe |
| `internal` | 500 | Cualquier otro fallo; nada escrito |

Y los **motivos de rechazo de una línea** (dentro de un `200`, en `rejected.code`, §5.2): `line_unreadable`, `schema_version_unsupported`, `line_invalid`, `recorded_at_in_future`, `domain_rejected`, `duplicate_unconfirmed`, `pair_incomplete`, `pair_rejected` y, si la dirección los acepta, `seal_mismatch` y `pair_not_contiguous`.

Fuera de la Lambda: `transport_rejected` es el nombre que da **el cliente** a una respuesta sin este formato (el hash del cuerpo rechazado por AWS, el WAF, un error de CloudFront). Nunca se trata como un rechazo de líneas: la sincronización para y lo dice.

## 8. Quién implementa qué

| Pieza | Feature |
|---|---|
| El caso de uso puro que reaplica y acepta líneas (el mismo para el cliente y para la Lambda), las operaciones de líneas crudas del puerto, el marcador, lo retenido y lo descartado, y un **remoto simulado** que cumple §5 sin HTTP | **014** |
| La Lambda: §1 a §7 sobre HTTP, `LedgerStore` sobre S3 con `If-Match`, el registro en SSM, los clientes HTTP de la web y de la consola, `atlas remote login` y `logout`, la pantalla de dispositivos de la web | **015** |
| El correo mensual con los inicios de sesión de la consola y los tokens vivos y emitidos | **016** |
| El prefijo de SSM y sus permisos, la política de origen que reenvía `x-atlas-device-token`, la CSP que respeta la `sandbox` de §4.2 | **017** |
