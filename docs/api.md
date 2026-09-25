# Contrato de la API

El contrato HTTP de la Lambda de la API (`apps/api`), que se alcanza **solo a través de CloudFront**, bajo `/api/*` (ADR-0028, fila 6). Lo encargan **ADR-0026** («Consecuencias»: rutas, cuerpos, códigos, la confirmación y el rechazo por línea, la pareja de anulación y corrección como una sola línea, y el rechazo de una anulación cuya corrección no viene en la misma petición) y **ADR-0033** («Reparto entre features»: la cabecera, las rutas de inicio, canje, revocación y lista, sus códigos de error, los límites del nombre del dispositivo y cómo se liga a su sesión el identificador de dispositivo de la web). Se escribe **antes de implementar**, con el prompt de la feature 014.

**Estado:** escrito el 2026-09-25 con `docs/prompts/014-ledger-sync-core.md`. **Nada de esto está implementado.** La **feature 014** construye la sincronización contra un **remoto simulado** que cumple la semántica de las rutas de sincronización (§5) sin HTTP; la **feature 015** implementa la API de verdad, el acceso (§3 y §4) y los clientes HTTP. Lo que este documento no decide va marcado **[PENDIENTE]** y lo decide la dirección; una propuesta marcada como tal no es una decisión.

**Puesto al día el 2026-09-25, al cerrar la feature 014** (PR #83). Sigue sin haber HTTP, pero la semántica de §5 ya está escrita y probada como código puro del dominio, el que llamará la Lambda de la 015: `parseAppendBody`, `acceptAppend`, `parsePublishBody`, `parseInitBody`, `acceptInit` e `initDuplicateIds` (`packages/domain/src/sync/remote.ts`), sobre el puerto `RemoteLedger` (`packages/domain/src/ports/remote-ledger.ts`). Los dos remotos simulados de los tests, en memoria y en un directorio, la cumplen. Lo que el código concretó respecto de la primera redacción está marcado «*(014)*» en §5 y §7, y la parte del cliente está en §5.7.

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

- `atlasdt1` — prefijo fijo y reconocible (versión 1 del formato), para que un escáner de secretos lo encuentre. La regla de `gitleaks` era configuración de herramientas y se propuso al usuario (ADR-0033, punto 1); **el usuario la aprobó el 2026-09-25** y vive en `.gitleaks.toml` como `atlas-console-device-token`: detecta el token completo con un secreto aleatorio y deja pasar el `token_id` solo y los marcadores de posición de este documento.
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
| §5 Sincronización: leer el libro, añadir líneas, inicializar un remoto vacío (§5.5), publicar el estado de **su** cola | Sí | Sí |
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
- *(014)* **El puerto del cliente entrega texto, no bytes** (`RemoteSnapshot`: `text` y `etag`). El dominio no tiene decodificador UTF-8, así que el cliente HTTP decodifica los bytes del cuerpo y entrega el texto; el etag sigue siendo el SHA-256 de los bytes. Decodificar no pierde nada, porque toda línea del remoto se escribió desde una cadena, y el bloque 0 de la 014 lo comprobó byte a byte (`specs/014-ledger-sync-core/questions.md` §1.4).

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

**Si `If-Match` no es el etag actual: `412 precondition_failed`**, sin escribir nada. También si otro escritor gana la carrera entre la lectura de la Lambda y su `PutObject` condicional. El cliente vuelve al paso 1 de la sincronización.

**Validación, línea a línea y en orden**, con el dominio (ADR-0026, Parte A), sobre el remoto con las líneas anteriores ya aceptadas:

| Orden | Comprobación | Código del rechazo |
|---|---|---|
| 1 | La línea es JSON y tiene `schema_version` | `line_unreadable` |
| 2 | `schema_version` no es más nueva que la que conoce la Lambda | `schema_version_unsupported` |
| 3 | **Las declaraciones de la entrada son admisibles para la línea**: `has_correction` solo en una anulación, `chain_continues` solo en una línea con `corrects_id`. Va antes que todo lo demás de la línea, y antes que `pair_incomplete`: si la declaración de la pareja está mal, no tiene sentido evaluar lo demás (decisión de la dirección, 2026-09-25) | `pair_declaration_invalid` |
| 4 | La línea se decodifica y valida su forma con el dominio | `line_invalid`, con el código del dominio en `details.domain_code` |
| 5 | `recorded_at` no es posterior a la hora de la Lambda más la tolerancia (ADR-0026, caso 8; tolerancia configurable, valor **[PENDIENTE]**, lo fija la 015) | `recorded_at_in_future` |
| 6 | El libro proyectado con la línea añadida sigue siendo válido. Un `id` repetido lo detecta la proyección (`duplicate_id`), así que es de esta fila, no de la 4 (decisión de la dirección, 2026-09-25). Una anulación con corrección no se proyecta sola: la unidad entera, abajo | `domain_rejected`, con `details.domain_code` |
| 7 | Si la huella está repetida, la línea trae `confirm_duplicate` | `duplicate_unconfirmed`, con los `id` que la repiten |
| 8 | Una `tax_return_filed` **sella el prefijo**: su `ledger_fingerprint` cuadra con el prefijo sobre el que cae, remoto más las líneas ya aceptadas de la petición (decisión de la dirección, 2026-09-25: «lo que sella el prefijo no se mueve de sitio», defendido también en el servidor; la proyección no lo comprueba al registrar, solo `check --deep` y `compact`) | `seal_mismatch` |
| 9 | La línea no es una `filing_fingerprint_waived`: una renuncia solo nace dentro de una compactación, que es de administración, y **nunca llega por esta ruta**; solo viaja dentro de los bytes de la inicialización (§5.5) (decisión de la dirección, 2026-09-25) | `waiver_not_appendable` |

**La pareja de anulación y corrección cuenta como una sola línea** (ADR-0026, segunda y tercera enmiendas):

- Una línea con `has_correction` **tiene que traer en la misma petición, detrás de ella**, la línea cuyo `corrects_id` es el `reverses_id` de la anulación. Si no la trae: `pair_incomplete`, en el índice de la anulación. Es la única forma que tiene la API de negarse a **partir una pareja entre dos peticiones**, porque no ve la cola del dispositivo: por eso el cliente **declara**.
- La pareja **se evalúa entera, como la escribe la aplicación** (decisión de la dirección, 2026-09-25; `checkCandidate` en `rectify.ts` y `rule-change.ts`): el libro se proyecta con la anulación **y** la corrección añadidas juntas, **nunca con la anulación sola**. Una compra de 10, una venta de 10 y la corrección de la compra a 12 **se aceptan**, aunque la anulación sola dejaría la venta sin lotes. Si falla la unidad, el rechazo se da **en el índice de la anulación**, con `code: "pair_rejected"` y en `details`: `member` (`reversal` \| `correction` \| `other`), `member_code`, el código del dominio, y `member_index` (`0` la anulación, `1` la corrección; ausente con `other`). **`other`** es un tercer evento del libro que la unidad deja inválido (`DependentEventsError`), y entonces `details.affected` lista los `event_id` afectados con su código. No se escribe ninguna de las dos.
- **La corrección va justo detrás de su anulación** (decisión de la dirección, 2026-09-25): la aplicación siempre las escribe juntas (`rectify.ts` añade `[reversal, event]` en una sola escritura), y exigirlo hace inequívoca la pareja. Una línea con `corrects_id` que no va inmediatamente detrás de la anulación de su objetivo con `has_correction`, o una anulación con `has_correction` cuya línea siguiente no es su corrección, se rechaza con `pair_not_contiguous` en el índice de la anulación (o de la corrección suelta).
- **Una cadena de correcciones de tipos es una sola unidad** (decisión de la dirección, 2026-09-25): las varias parejas que la aplicación escribe de una vez al corregir los tipos del BCE (`writeRateCorrections`) se aceptan enteras o no se acepta ninguna. El cliente lo declara con `"chain_continues": true` en la **corrección** de cada pareja que no es la última de la cadena: la línea siguiente tiene que ser otra anulación con `has_correction` (si no, `pair_incomplete`). La cadena **se proyecta entera**, con todos sus miembros añadidos juntos, como hace la aplicación (`rule-change.ts:270-275`). Si falla, el rechazo se da en el índice de **la primera anulación de la cadena**, con `code: "pair_rejected"`, y `details` dice qué miembro falló (`member_index`, `member` —`reversal` \| `correction` \| `other`— y `member_code`); con `other`, `details.affected` lista los `event_id` del tercer evento o eventos que la cadena deja inválidos, con su código.

**El rechazo es por línea:** la API escribe **el tramo válido hasta la primera línea rechazada**, en un solo `PutObject` condicional, y devuelve el motivo de esa línea. Nada de lo que va detrás se escribe, aunque fuera válido.

*(014)* Detalles que fija el código (`acceptAppend`):

- `rejected.index` es siempre el de **la primera línea de la unidad** que falla, y `rejected.id`, el de su primer evento si se pudo leer. En una pareja o una cadena, `details.member_index` dice qué miembro falló: en los rechazos de las filas 1 a 5, en `pair_incomplete` y `pair_not_contiguous`, en `duplicate_unconfirmed`, en `seal_mismatch` y en `pair_rejected`, de una pareja o de una cadena, salvo con `member: "other"`, que no es un miembro.
- `duplicate_unconfirmed` lleva en `details.existing` los `id` cuya huella repite. Al añadir, la huella se compara con la de los eventos **no anulados**, la regla de siempre (decisión D-Q16 de la 014; en la inicialización vale la de §5.5).
- **Un remoto que ya tiene eventos inválidos** (una regla endurecida después) no acepta nada más hasta que se repare. Responde `accepted: 0` y el rechazo en el índice 0, con `code: "domain_rejected"` y en `details` `domain_code: "ledger_has_invalid_events"` e `invalid_count`. El cliente no llega a pedirlo: al leer el remoto, para antes con `remote_ledger_invalid` (§5.7).

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
- **Una respuesta perdida no pierde nada:** el cliente nunca da una línea por subida con este `200`; vuelve a leer el remoto (§5.1) y comprueba que sus líneas están dentro, byte a byte, antes de quitarlas de su cola (ADR-0026, pasos 2 y 5).
- `details` puede contener lo que el dominio diga de la línea (un importe, una cantidad): va al cliente del propio usuario, **nunca a un registro**.

### 5.3 Publicar el estado de la cola del dispositivo

`PUT /api/sync/devices/self`, cuerpo:

```json
{ "pending": 2, "held": 1, "last_sync_at": "2026-10-01T10:00:00Z" }
```

La API escribe `sync/devices/<device_id>.json` con el `device_id` **de la credencial** (§2.3), esos tres campos y `published_at` (su hora). `pending` y `held` son enteros ≥ 0 (`400 body_invalid` si no). Respuesta `200 { "device_id": "…", "published_at": "…" }`. Es lo que miran `compact` y la restauración antes de actuar (ADR-0026, paso 7; ADR-0032): se niegan si algún dispositivo conocido tiene **`pending`** mayor que cero. **`held` no bloquea** (decisión de la dirección, 2026-09-25, como dicen ADR-0026, Parte A, y ADR-0032): lo retenido vive en el dispositivo y nunca se sube solo; se publica para que se vea.

`GET /api/sync/devices` (**solo sesión**) → `200 { "devices": [ { "device_id", "pending", "held", "last_sync_at", "published_at" } ] }`.

### 5.4 Cómo se liga a su sesión el identificador de dispositivo de la web

**[PENDIENTE] — la decide la 015** (nota del 2026-09-25 en ADR-0033). Lo que está fijado: la API toma el dispositivo de la credencial y **nunca del cuerpo** (ADR-0033, punto 6), para que quien robe una credencial no pueda publicar el estado de otro dispositivo, del que dependen `compact` y la restauración. Para la consola lo resuelve el token (el `device_id` que la API asignó al canjear). La web no tiene token: su credencial es una sesión corta que se renueva pasando por Google, y su identificador de dispositivo tiene que **sobrevivir** a las sesiones, porque su cola vive en su IndexedDB. Lo que el revisor de ADR-0033 dejó abierto es cómo se ata ese identificador a la sesión. Opciones, sin elegir:

- **(a) Asignado por la API al iniciar sesión y firmado dentro de la cookie.** La web guarda su `device_id` en IndexedDB y lo presenta **en el inicio de sesión** (`GET /api/auth/login?device_id=…`, no en cada petición); la API lo mete en la cookie transitoria y, tras verificar a Google, en la cookie de sesión. La primera vez, la API asigna uno. *Inconveniente:* la API no puede saber si ese identificador es de ese navegador; quien tenga la cuenta de Google podría iniciar sesión presentando el de otro dispositivo.
- **(b) Un registro de dispositivos web en SSM**, como el de los tokens de la consola, con un secreto propio del navegador guardado en IndexedDB y presentado al iniciar sesión. *Inconveniente:* es una credencial de larga duración en la página, lo que ADR-0027 y ADR-0033 evitaron.
- **(c) Sin identificador persistente en la web:** cada sesión es un dispositivo nuevo, y `compact` mira todos los que tengan algo pendiente. *Inconveniente:* se acumulan dispositivos muertos que hay que olvidar a mano.

### 5.5 Inicializar un remoto vacío

`PUT /api/ledger`, solo con **`If-Match: "<sha256 de cero bytes>"`**, es decir, sobre un remoto **vacío o inexistente**: sin `If-Match`, `428 precondition_required`; con otro valor o con un remoto que no está vacío, `412 precondition_failed`. *(Para la 015, SIN VERIFICAR: con el objeto inexistente S3 no admite `If-Match`, y la Lambda traduce esta condición a `If-None-Match: *` en su `PutObject`.)* Cuerpo:

```json
{ "content": "<los bytes enteros del libro del primer dispositivo, como cadena, con sus saltos de línea>", "confirm_duplicate_ids": ["<id>", "…"] }
```

Es como **el primer dispositivo** sube su libro (decisión de la dirección, 2026-09-25): **los bytes enteros**, escritos con la operación de líneas crudas, **no línea a línea** por §5.2. Así una presentación o una renuncia de una carpeta ya compactada viaja **con su prefijo intacto**, y su sello sigue cuadrando. La API comprueba antes de escribir que el contenido **carga** con su esquema (ninguna versión más nueva, ninguna línea ilegible), que su proyección es **válida**, y **las dos reglas de ADR-0026 que valen para toda línea que entra en el remoto** (decisión de la dirección, 2026-09-25; nota fechada en ADR-0026): ningún `recorded_at` más allá de la tolerancia del reloj, y **toda huella repetida confirmada** por su `id` en `confirm_duplicate_ids`. **El cliente la deduce del libro, sin volver a preguntar** (decisión de la dirección, 2026-09-25): toda línea que está en el libro local fue aceptada en local —pasó por `confirmDuplicate`, o la escribió una cadena de correcciones de tipos (`writeRateCorrections`) que el usuario confirmó entera—, así que envía los `id` de todo evento cuya huella repite la de uno anterior en el fichero. Cualquier fallo es `init_rejected`, con el código (`line_unreadable`, `schema_version_unsupported`, `domain_rejected`, `recorded_at_in_future`, `duplicate_unconfirmed`…) y la línea en `details`, y no se escribe nada. *(014)* `details.code` es el código; `details.line` es el número de línea, contando desde 1, en los rechazos de una línea, y `details.id` es el evento en `domain_rejected` y `duplicate_unconfirmed`. Una línea con `"\r"` es `init_rejected` con `code: "raw_line_break"`. Las declaraciones de pareja y de cadena no se aplican: no hay cola que partir, porque sube el libro entero. **El cliente se niega a inicializar antes de llamar si su libro no es válido** (por ejemplo, con un `settings_changed` registrado con `acceptInvalid`), y lo explica: hay que repararlo primero. Un `init_rejected` nunca es el camino normal, y nunca deja al dispositivo parado sin explicación. Respuesta `200 { "etag": "…", "lines": n }`.

### 5.6 Qué es «el mismo evento» tras una reescritura del remoto

No es una ruta: es la regla con la que un cliente clasifica lo que retiene al volver a descargar un remoto reescrito (ADR-0026, Parte A y nota fechada del 2026-09-25; ADR-0032, paso 3). **Detectar** la reescritura es por el hash de los bytes del prefijo (§5.1). **Clasificar** es por `event_id` y forma canónica: los dos eventos, **migrados a la versión de esquema actual**, se comparan en su serialización canónica (`encodeLine`) **ignorando exactamente estos campos, y ninguno más**:

| Tipo | Campo ignorado | Por qué |
|---|---|---|
| `tax_return_filed` | `ledger_fingerprint` | `compact` lo vuelve a sellar por definición sobre el prefijo reescrito (`resealFilings`, `packages/domain/src/filings/fingerprint.ts`; ADR-0025) |

`filing_fingerprint_waived` no tiene ningún campo en la lista: `compact` escribe renuncias **nuevas** y no reescribe las que ya había. La lista es cerrada: un campo nuevo que `compact` reescriba por definición entra aquí, en la nota de ADR-0026 y en el test a la vez. Mismo `event_id` y misma forma canónica: no se retiene. Mismo `event_id` y cualquier otra diferencia: conflicto real, se retiene. `event_id` ausente del remoto nuevo: se retiene. **Nunca se ofrece rehacer una presentación que el remoto ya tiene.**

### 5.7 La parte del cliente *(014)*

No es una ruta: es lo que el cliente hace con §5.1 a §5.5, fijado por el código de la 014 (`syncDevice`, `initialiseRemote`, `replaceFromRemote` y `joinWithOwnLines` en `packages/adapters/src/sync/client.ts`; `inspect`, `planUpload` y `settle` en `packages/domain/src/sync/client-plan.ts`). Los dos clientes, la consola sobre su carpeta y la web sobre su IndexedDB, comparten esta orquestación. Cada interfaz traduce cada código con su propia frase (`tests/messages.test.ts`).

**Negativas antes de llamar**, sin tocar nada:

| Código | Cuándo |
|---|---|
| `sync_not_configured` | Sincronizar en un dispositivo sin `sync/` (o sin claves `sync:*`). Empezar es siempre una elección explícita: inicializar un remoto vacío (§5.5), unirse desde el remoto o unirse subiendo las líneas propias como pendientes |
| `sync_deactivated` | Sincronizar con el marcador en `disabled`. Para volver hay que unirse otra vez, de forma explícita |
| `init_refused_invalid_ledger` | Inicializar con un libro que tiene eventos inválidos; `details.invalid` los lista con su código (§5.5) |

**Paradas**: la sincronización para, **no retiene nada** y deja todo pendiente donde estaba.

| Código | Cuándo |
|---|---|
| `remote_empty` | El remoto está vacío, el libro tiene líneas y no hay nada sincronizado: no se sube línea a línea, se inicializa (§5.5) |
| `local_prefix_changed` | El prefijo local ya no da el hash del marcador (`details.synced_lines`) |
| `remote_rewritten` | En el paso 1, el prefijo del remoto no da el hash del marcador (§5.1) (`details.synced_lines`, `details.remote_lines`). En el paso 5, el remoto releído ya no empieza por **todo** lo leído en el paso 1, línea a línea, aunque el prefijo del marcador siga cuadrando; esta parada va sin `details` (`syncDevice`, `packages/adapters/src/sync/client.ts`). Solo se vuelve a descargar cuando el usuario lo pide |
| `remote_schema_too_new` | El remoto tiene una línea de una versión de esquema que este cliente no conoce |
| `remote_unreadable` | Una línea del remoto no se puede leer (`details.line`) |
| `remote_ledger_invalid` | El remoto ya tiene eventos inválidos (`details.invalid_count`); no es culpa de ninguna línea de la cola (D-Q11) |
| `join_required` | No hay marcador legible, y la cola tiene líneas que el remoto no tiene y que no están retenidas (`details.own_lines`). Reconstruir el prefijo común no autoriza a mezclar: unirse es siempre explícito (segunda revisión de la PR #83). Sin líneas propias, el marcador se reconstruye y la sincronización sigue |
| `remote_failed` | Cualquier respuesta sin rechazo por línea, salvo el `412` al añadir, que vuelve a empezar: `details.remote_code` lleva el código tal cual, de la lista cerrada de §7, y `details.status`, el HTTP |
| `remote_contention` | Tres `412` seguidos (`MAX_REMOTE_RACES`, D-Q9; `details.attempts`) |
| `local_changed` | El libro local, lo retenido o el marcador cambiaron entre el paso 1 y el paso 6 tres veces seguidas (`MAX_LOCAL_CHANGES`, D-Q9) |

Y un **aviso**, no una parada: `publish_failed` (`details.remote_code`, `details.status`), cuando todo está escrito y solo falló publicar el estado de la cola (§5.3). Lo publica la sincronización siguiente.

**Lo que se retiene** al sincronizar, por un rechazo de una línea o unidad: en el paso 3, por el propio cliente, y en el paso 4, por un `rejected.code` de §5.2, que se retiene tal cual. En el paso 3, los motivos son estos:

- `pair_not_contiguous`: una corrección que no va justo detrás de la anulación de su objetivo;
- `seals_prefix`: una línea que sella el prefijo y ya no caería sobre el mismo;
- `concurrent_settings`, `concurrent_account` y `concurrent_asset`: fotos concurrentes (D-Q8);
- `pair_rejected`, `settings_leave_invalid` y `domain_rejected`: rechazos del dominio;
- `new_duplicate` y `new_closed_year`: avisos nuevos (D-Q3).

Al volver a descargar un remoto reescrito o al unirse desde el remoto se retiene con `absent_after_rewrite`, `differs_after_rewrite`, `absent_at_join` y `differs_at_join`, en las mismas unidades que la cola. Y al descartar solo la anulación de una pareja, su corrección se retiene otra vez, sola, con `partner_discarded` (`discardHeld`, `packages/domain/src/sync/resolve.ts`): a esa solo se le ofrece descartar, y rehacerla se niega con `redo_partner_discarded`. Mientras quede algo retenido sin resolver, no se sube nada.

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
| `precondition_required` | 428 | `POST /api/ledger/lines` o `PUT /api/ledger` sin `If-Match` |
| `init_rejected` | 422 | La inicialización de §5.5 trae un contenido que no carga o no proyecta válido; nada escrito |
| `precondition_failed` | 412 | `If-Match` distinto del etag actual; nada escrito |
| `not_found` | 404 | Ruta que no existe |
| `internal` | 500 | Cualquier otro fallo; nada escrito |

*(014)* **La lista cerrada de los fallos que no son de una línea** es `REMOTE_FAILURE_CODES` (`packages/domain/src/ports/remote-ledger.ts`). Contiene los códigos de esta tabla que pueden responder las rutas de §5, menos los de las rutas de acceso de §4, más dos que nombra el cliente para lo que no llegó a la API: `transport_rejected` (abajo) y `network_failed`, un fallo de red. El cliente los lleva tal cual en `remote_failed` (§5.7), nunca retiene por ellos, y cada interfaz tiene una frase para cada uno.

Y los **motivos de rechazo de una línea** (dentro de un `200`, en `rejected.code`, §5.2): `line_unreadable`, `schema_version_unsupported`, `line_invalid`, `recorded_at_in_future`, `domain_rejected`, `duplicate_unconfirmed`, `pair_declaration_invalid`, `pair_incomplete`, `pair_not_contiguous`, `pair_rejected`, `seal_mismatch` y `waiver_not_appendable`.

**Qué hace el cliente con cada respuesta** (decisión de la dirección, 2026-09-25): **solo un `rejected.code` retiene** la línea (o la unidad) con su motivo. Un `412` vuelve a empezar la sincronización. Cualquier otra cosa —un 5xx, `transport_rejected`, un fallo de red, `session_invalid`, `device_token_expired` o `device_token_revoked`— **para la sincronización y deja todo pendiente**, para reintentarla después; nunca retiene.

Fuera de la Lambda: `transport_rejected` es el nombre que da **el cliente** a una respuesta sin este formato (el hash del cuerpo rechazado por AWS, el WAF, un error de CloudFront). Nunca se trata como un rechazo de líneas: la sincronización para y lo dice.

## 8. Quién implementa qué

| Pieza | Feature |
|---|---|
| El caso de uso puro que reaplica y acepta líneas (el mismo para el cliente y para la Lambda), las operaciones de líneas crudas del puerto, el marcador, lo retenido y lo descartado, y un **remoto simulado** que cumple §5 sin HTTP | **014**, fusionada (PR #83, 2026-09-25) |
| Las órdenes de administración de la consola contra el almacén remoto: `compact` del remoto, restaurar y olvidar un dispositivo, **fuera de la API** (ADR-0026, Parte A) | **015** |
| La Lambda: §1 a §7 sobre HTTP, `LedgerStore` sobre S3 con `If-Match`, el registro en SSM, los clientes HTTP de la web y de la consola, `atlas remote login` y `logout`, la pantalla de dispositivos de la web | **015** |
| El correo mensual con los inicios de sesión de la consola y los tokens vivos y emitidos | **016** |
| El prefijo de SSM y sus permisos, la política de origen que reenvía `x-atlas-device-token`, la CSP que respeta la `sandbox` de §4.2 | **017** |
