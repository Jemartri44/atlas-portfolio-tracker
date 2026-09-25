# Modelo de datos y formatos, escritos como contrato: `015-api-access`

Todos los formatos de esta feature viven **fuera del libro**: ninguno añade un tipo de evento ni un campo, ni sube `schema_version` (§2 bis del encargo). Los lectores son **estrictos**: una clave desconocida, un tipo que no es el suyo o un formato que no es `1` hacen el objeto **ilegible**, con su código, y nunca se leen como «vacío» ni como «válido por defecto». Todo lo marcado **PROPUESTA** lo decide la dirección en el alto (plan §6).

Convenciones: los instantes son ISO 8601 en UTC con `Z`, salvo `iat` y `exp` de las cargas firmadas, que son segundos Unix enteros. Los identificadores aleatorios usan base64url sin relleno.

---

## 1. Las cargas firmadas: sesión, intento y código de la consola

### 1.1 La firma (PROPUESTA, §6.2 (b))

- **Clave raíz**: el parámetro `/atlas/<entorno>/auth/session-key` (§4), con 32 bytes aleatorios en base64url (43 caracteres). Si mide menos de 32 bytes, la Lambda **se niega a arrancar**.
- **Subclaves**: `crypto.hkdfSync("sha256", ikm = clave raíz, salt = vacío, info, 32)`, una por propósito (RFC 5869 admite la sal vacía cuando la clave de entrada ya es aleatoria y uniforme):

| Propósito | `info` de HKDF | `typ` en la carga |
|---|---|---|
| Cookie de sesión de la web | `atlas session v1` | `atlas.session` |
| Cookie transitoria del intento (web y consola) | `atlas login v1` | `atlas.login` |
| Código de un solo uso de la consola | `atlas console_code v1` | `atlas.console_code` |

- **Forma**: `<carga>.<mac>`. `<carga>` es el JSON de la carga en base64url, y `<mac>` es `HMAC-SHA256(subclave, bytes ASCII de <carga>)` en base64url (43 caracteres).
- **La verificación, en este orden, rechazando al primer fallo** (función pura del dominio sobre bytes ya decodificados; el HMAC lo calcula el adaptador y lo compara con `timingSafeEqual`):
  1. exactamente dos segmentos de `[A-Za-z0-9_-]`;
  2. el MAC, con la subclave **del propósito que espera ese verificador**;
  3. el JSON, leído de forma estricta;
  4. `typ` igual al esperado;
  5. `v === 1`;
  6. `exp` posterior a ahora.
- **Doble barrera de B3**: una carga de otro propósito falla ya en el paso 2, porque la subclave es otra. Si una implementación rota compartiera la subclave, fallaría en el paso 4. Los mutantes 1 y 15 rompen cada barrera por separado y cada uno se ve morir.
- **Rotar la clave raíz** invalida a la vez las tres cargas, y surte efecto al vencer la caché de los secretos (§4). No hay anillo de claves: rotar es cerrar todas las sesiones (ADR-0027).

### 1.2 La cookie de sesión

`Set-Cookie: __Host-atlas_session=<firmado>; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=<duración>`, **sin `Domain`**.

```json
{ "typ": "atlas.session", "v": 1, "sub": "<sub de Google>", "sid": "<22>", "did": "<device_id de la web, 22>", "iat": 1790000000, "exp": 1790028800 }
```

- `sid`: 128 bits aleatorios. **No se registra** (plan §4, R25).
- `did`: el `device_id` de la web (§7 P1). Nunca se toma de otro sitio en una petición.
- Solo `sub`, `sid`, `did`, `iat` y `exp`: **ni el correo ni ningún otro dato**. ADR-0027 dice «solo `sub`, emisión, caducidad y un identificador de sesión», y el `did` es la ampliación de §7 P1. Por eso ADR-0027 entra en la lista de documentos (N9).

### 1.3 La cookie transitoria del intento

`Set-Cookie: __Host-atlas_login=<firmado>; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=<duración del intento>`. **Se borra en toda respuesta de la vuelta de Google, sea cual sea el resultado**, porque es de un solo uso.

```json
{
  "typ": "atlas.login", "v": 1, "flow": "web", "iat": 1790000000, "exp": 1790000600,
  "state": "<43>", "nonce": "<43>", "verifier": "<43, el verificador PKCE frente a Google>",
  "did": "<22, opcional: el device_id que la web presentó al iniciar sesión>"
}
```

Con `flow: "console"` no lleva `did`, sino un objeto `console`:

```json
"console": { "mode": "loopback", "port": 49152, "state": "<43 de la consola>", "code_challenge": "<43>", "device_name": "<nombre>", "reissue_device_id": "<22, opcional>" }
```

- **PROPUESTA**: la cookie va **firmada, no cifrada**. Lo que lleva (`state`, `nonce`, el verificador) solo le sirve a quien ya tiene el navegador del usuario, y el código de Google pasa por ese mismo navegador. La alternativa es cifrarla con AES-256-GCM y una subclave propia: un poco más de código y ningún secreto nuevo.

### 1.4 El código de un solo uso de la consola

Viaja en `?code=` hacia `127.0.0.1` o se enseña en la página manual.

```json
{ "typ": "atlas.console_code", "v": 1, "tid": "<token_id que tendrá el token, 22>", "cc": "<code_challenge, 43>", "sub": "…", "email": "…", "dn": "<nombre>", "rdid": "<22, solo en la reemisión>", "iat": 1790000000, "exp": 1790000300 }
```

- Lleva lo que exige ADR-0033: el `token_id`, el `code_challenge`, el par y el nombre.
- **Consecuencia escrita (PROPUESTA)**: el código va firmado y no cifrado, así que el correo y el `sub` se pueden leer en base64 en el historial del navegador del propio usuario. Se aceptaría como tal, igual que el `sub` en la cookie. La alternativa es cifrar con AES-256-GCM y la subclave `console_code`, que sigue siendo autenticado, o sacar el correo del código y buscarlo en la lista por su `sub` al canjear.
- Mide unos 400 caracteres: en la variante manual se **pega** en la consola, no se teclea.

---

## 2. El registro de un token en SSM

Es un `SecureString` estándar en `/atlas/<entorno>/device-tokens/<token_id>`, y su valor es este JSON, en una línea:

```json
{ "token_record_format": 1, "token_id": "<22>", "secret_sha256": "<64 hex en minúsculas>", "sub": "…", "email": "…", "device_id": "<22>", "device_name": "<nombre>", "issued_at": "2026-10-01T10:00:00Z", "expires_at": "2026-12-30T10:00:00Z", "revoked_at": "2026-11-02T08:00:00Z" }
```

- **`revoked_at` solo existe si el token está revocado.** Cualquier otra clave, un tipo distinto o un `token_id` distinto del nombre hacen el registro ilegible, y la comprobación lo trata como `device_token_invalid`.
- **Se escribe dos veces**:
  - al crearlo, con `PutParameter` **sin** `Overwrite` (y con las etiquetas `project=atlas` y `env=<entorno>` si el bloque 0 de E2 confirma que se puede);
  - al revocarlo, con `Overwrite` y el mismo JSON más `revoked_at`.
- **Revocar uno ya revocado no escribe nada.** Un solo módulo, `serializeTokenRecord` / `revokedRecord` del dominio, escribe el formato: lo usan la API y `atlas admin revoke-all-tokens` (§7 P4, «el mismo código, no una copia»).
- **`expires_at` = `issued_at` + la caducidad configurada** (90 días), y nunca más que `issued_at` + 120 días (el techo fijo en el código).

## 3. La lista permitida

`/atlas/<entorno>/auth/allow-list` (`SecureString`):

```json
{ "allow_list_format": 1, "entries": [ { "sub": "<sub>", "email": "<correo>" } ] }
```

- **PROPUESTA**: el correo se compara **exacto, byte a byte**, con el de la reclamación `email` del ID token. Normalizarlo sería reconocer por parecido (§2 ter), y la identidad de verdad es el par. El guion de secretos de la 017 escribe el correo tal cual lo muestra Google en la página de acceso denegado, o en la del propio usuario.
- Una lista vacía o ilegible **no deja pasar a nadie**. Ilegible es `remote_unavailable` en las rutas JSON y la página de error en la vuelta de Google, con su código en el registro.

## 4. Los parámetros de SSM que lee la Lambda (PROPUESTA, §6.2 (d))

El guion de secretos de la 017 los crea **tal cual** (ADR-0034, fila 21). Esta feature fija sus nombres y sus formatos, no sus valores.

| Parámetro | Tipo | Valor | Caché en cada instancia |
|---|---|---|---|
| `/atlas/<entorno>/auth/allow-list` | `SecureString` | §3 | **120 s** (PROPUESTA; «pocos minutos», ADR-0027) |
| `/atlas/<entorno>/auth/google-client-id` | `String` (no es secreto) | el identificador del cliente OAuth del entorno | 300 s |
| `/atlas/<entorno>/auth/google-client-secret` | `SecureString` | el secreto, tal cual | 300 s |
| `/atlas/<entorno>/auth/session-key` | `SecureString` | 32 bytes aleatorios en base64url (43) | **300 s** (PROPUESTA, §6.2 (c)); es lo que espera el paso 4 del procedimiento de la cuenta robada |
| `/atlas/<entorno>/device-tokens/<token_id>` | `SecureString` | §2 | **ninguna** (B2); solo se cachean, si acaso, los negativos que no pueden volver a valer |

## 5. La configuración de la Lambda que no es secreta (variables de entorno; PROPUESTA de valores, §6.2 (a))

**Ningún secreto en una variable de entorno** (`docs/specification.md` §11.8). El cargador lee solo esta lista y rechaza la configuración entera si falta una variable, sobra una del prefijo `ATLAS_` o un valor no se entiende.

| Variable | Qué es | Propuesta |
|---|---|---|
| `ATLAS_ENV` | `dev` o `prod`, de donde sale el prefijo de SSM `/atlas/<entorno>/` | — |
| `ATLAS_ORIGIN` | El origen propio (`https://…`), contra el que se compara `Origin` y al que se vuelve tras iniciar sesión | — (vive en `terraform.tfvars`) |
| `ATLAS_DATA_BUCKET` | El bucket de datos del entorno | — |
| `ATLAS_SESSION_TTL_SECONDS` | Duración de la sesión web, absoluta, sin renovación | **28 800 (8 h)** |
| `ATLAS_LOGIN_TTL_SECONDS` | Duración de la cookie transitoria | **600 (10 min)** |
| `ATLAS_CONSOLE_CODE_TTL_SECONDS` | Caducidad del código de la consola | **300 (5 min)**, como propone `docs/api.md` §4.2 |
| `ATLAS_TOKEN_LIFETIME_DAYS` | Caducidad del token | **90**. Si es mayor que 120, **no arranca** |
| `ATLAS_RECENT_ISSUE_DAYS` | Qué es una emisión «reciente» en la lista | **7**, como propone `docs/api.md` §4.5 |
| `ATLAS_CLOCK_TOLERANCE_SECONDS` | Tolerancia de `recorded_at` (§5.2, fila 5) | **600 (10 min)** |
| `ATLAS_ALLOW_LIST_CACHE_SECONDS` | Caché de la lista permitida | **120** |
| `ATLAS_SECRETS_CACHE_SECONDS` | Caché del secreto del cliente y de la clave de sesión | **300** |

## 6. El objeto del dispositivo: `sync/devices/<device_id>.json` (PROPUESTA de la forma exacta, §6.2 (d bis))

```json
{ "device_format": 1, "device_id": "<22>", "type": "web", "state": "active", "created_at": "…", "pending": 0, "held": 0, "last_sync_at": "…", "published_at": "…" }
```

- **`type`**: `web` o `console`. **`state`**: `active` o `forgotten`, y con `forgotten` va también `forgotten_at`. Un objeto `console` lleva además **`device_name`**, el del primer canje, que enseña la confirmación de la reemisión.
- **Quién lo escribe, y cómo**:

| Quién | Cuándo | Cómo |
|---|---|---|
| La API | Al asignar el identificador: web al iniciar sesión (E1), consola en el primer canje (E2) | Creado con `If-None-Match: *`, con `pending: 0`, `held: 0` y sin `last_sync_at`. Si el identificador ya existe (probabilidad nula con 128 bits), se genera otro, nunca se pisa |
| `PUT /api/sync/devices/self` | Al publicar la cola | Relee el objeto, se niega si falta, si es de otro tipo o si está olvidado, y reescribe **con `If-Match` sobre lo leído**, conservando `type`, `state`, `created_at`, `device_name` y `forgotten_at`. Si recibe un `412`, relee: olvidado → `device_forgotten`; si no, `412 precondition_failed` (R2-N2) |
| La administración | Al olvidar (E5) | Reescribe con `If-Match` y `state: "forgotten"`. **Nunca se borra** |

- **Aceptable para una credencial** = el objeto existe, **su `type` es el de la credencial** (cookie → `web`, token → `console`) y **su `state` es `active`**. Cualquier otra cosa es `403 device_forgotten`. Un objeto ilegible también: fallo seguro. Todo `device_id` tiene objeto desde que se asigna, así que uno que falta **nunca** cuenta como vivo (R2-B2).
- `rewritePermission` recibe **solo los objetos `active`**. La función pura que filtra está en el dominio, junto al lector, y su mutante (contar los olvidados) muere.
- `GET /api/sync/devices` devuelve también `type` y `state`. Es un cambio en `docs/api.md` §5.3, y va a `questions.md` («Documentos»).

## 7. La consola: `~/.config/atlas/credentials.json` (§7 P7, P16 y B2)

Está en `~/.config/atlas/`, o en `$XDG_CONFIG_HOME/atlas/` si esa variable existe. Se crea con `600` y se escribe de forma atómica (temporal con `600` y `rename`). Con otros permisos no se usa (`credentials_too_open`). La consola se niega si esta carpeta y la del libro están una dentro de la otra (`credentials_inside_ledger`).

```json
{
  "credentials_format": 1,
  "entries": {
    "<device_id>": { "origin": "https://…", "device_id": "<22>", "token": "atlasdt1.<22>.<43>", "token_id": "<22>", "device_name": "…", "issued_at": "…", "expires_at": "…", "folder_hint": "/ruta/absoluta/real/de/la/carpeta" }
  }
}
```

- **Mapa por `device_id`**, nunca por origen (mutante 29 bis).
- `folder_hint` es `realpath` de la carpeta del libro **en el momento de `atlas remote login`**.
- **Qué entrada usa cada orden** (funciones puras del dominio):
  - **para sincronizar y para renovar**, solo la que nombra `sync/remote.json` de la carpeta, por su `device_id`, y **ninguna otra** (B2);
  - **para inicializar o unirse**, solo una entrada de ese origen cuyo `folder_hint` sea **exactamente**, byte a byte, el `realpath` de esta carpeta, **aunque sea la única del origen** (B2). Si no hay ninguna, se niega con `credentials_no_entry_for_folder` y dice que hay que iniciar sesión desde esta carpeta. Si hay más de una (dos inicios de sesión desde la misma carpeta), no se elige ninguna sola: la orden se niega con `credentials_several_for_folder`, lista los `device_id` y pide `--device <id>`, que tiene que ser una de ellas.

## 8. La carpeta: `sync/remote.json` (§7 P7 y P16)

```json
{"format":1,"origin":"https://…","device_id":"<22>"}
```

Una línea, terminada en `\n`, **exactamente** con esas tres claves:

- `origin` es `https://` + host (+ puerto), sin ruta;
- `device_id` son 22 caracteres de `[A-Za-z0-9_-]`;
- cualquier otra cosa es `sync_remote_unreadable`.

**Lo escriben solo inicializar y unirse**, bajo el cerrojo y de forma atómica. El temporal es `sync/remote.json.tmp-<pid>-<hora>`, y el barrido de la 015 lo incluye. `atlas remote login` **no escribe nada** en la carpeta del libro. Los estados intermedios, en plan §7.

## 9. La configuración local de la administración (PROPUESTA, E5)

`~/.config/atlas/admin.json`. Lo escribe el usuario y **la aplicación nunca lo escribe**. No es secreto, pero tampoco va al repositorio:

```json
{ "admin_format": 1, "environments": { "prod": { "region": "eu-west-1", "data_bucket": "atlas-prod-data-<sufijo>", "ssm_prefix": "/atlas/prod/" } } }
```

Las credenciales **no** van aquí. Salen de la cadena estándar del SDK (perfil o sesión asumida con MFA del rol `atlas-<entorno>-admin`, bloque 0 de E5), y la consola nunca las guarda.

## 10. Transiciones de estado

- **Token**: `activo` → `revocado`, de forma irreversible, por la API o por la administración. `activo` → `caducado` por el reloj. Un token caducado solo sirve para identificar su dispositivo al renovar, y uno revocado no sirve para nada.
- **Dispositivo**: `active` → `forgotten`, solo con el rol de administración, **después** de revocar sus tokens. Nunca vuelve a `active` desde la API. Deshacerlo es restaurar una versión del objeto con el versionado del bucket, a mano y fuera de esta feature.
- **Carpeta**: sin sincronizar → (inicializar o unirse) → `remote.json` y marcador (`enabled`) → (desactivar) → marcador `disabled`, con `remote.json` intacto.
