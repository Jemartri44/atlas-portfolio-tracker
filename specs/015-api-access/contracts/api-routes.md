# Contrato HTTP: lo que esta feature añade o concreta sobre `docs/api.md`

**Aprobado por la dirección el 2026-09-25** (`questions.md` §8) y llevado a `docs/api.md` en E1, por su encargo. Este fichero reúne **las propuestas** para sus [PENDIENTE] y lo que el encargo manda proponer (§6.2 (a), (d bis) y (h); §7 P8). La dirección escribe en `docs/api.md` lo que confirme. Todo lo que sigue es **PROPUESTA** hasta entonces.

## A. Acceso de la web (§3)

| Método y ruta | Credencial | Respuesta |
|---|---|---|
| `GET /api/auth/login[?device_id=<22>]` | ninguna. Una cookie de sesión o un token presentes se **ignoran** (un inicio de sesión nuevo sustituye al anterior) | `302` a Google con `response_type=code`, `client_id`, `redirect_uri=<ATLAS_ORIGIN>/api/auth/callback`, `scope=openid email`, `state`, `nonce`, `code_challenge` (S256) y `code_challenge_method=S256`. Pone `Set-Cookie: __Host-atlas_login=…` (data-model §1.3). Un `device_id` con otro formato se descarta en silencio, y la API asigna uno nuevo: no es credencial (§7 P1). **Solo se tiene en cuenta si el inicio viene del propio sitio** (`Sec-Fetch-Site: same-origin` u `Origin` propio; S2 de la revisión de la PR #90) |
| `GET /api/auth/callback` (rama web) | la cookie transitoria | Si todo cuadra: `302` a `/ajustes#sincronizacion`, con `Set-Cookie` de la sesión y el borrado de la transitoria. Si no: la página de error (§D) con su código. Si el par no está en la lista: la página de acceso denegado (§D) |
| `POST /api/auth/logout` | cookie (con `Origin`) o ninguna | `204`. Borra la cookie de sesión (`Max-Age=0`) **sin validarla**: cerrar una sesión caducada o de una clave rotada también la borra. Cuerpo `{}` obligatorio (`415 body_not_json`). Con el token: `403 forbidden_for_credential` |
| `GET /api/session` | cookie | `200 { "signed_in": true, "expires_at": "<Z>", "device_id": "<22>" }`, con `Cache-Control: no-store`. Si no, **la misma respuesta que daría cualquier ruta con cookie**: `401 unauthenticated`, `401 session_invalid`, `403 not_allowed`, `403 device_forgotten` o `503 remote_unavailable`. Con el token: `403 forbidden_for_credential` |

## B. El token de la consola (§4)

- **`GET /api/auth/console/start`** admite además `reissue_device_id=<22>` (la reemisión, §4.3). Con un formato que no cuadra: `400 console_start_invalid` con `details.parameter: "reissue_device_id"`. El identificador viaja en la cookie transitoria y después en el código (`rdid`).
  - `device_name`: de 1 a 40 puntos de código, en NFC.
  - Caracteres admitidos: `A-Z a-z 0-9`, `ÁÉÍÓÚÜÑáéíóúüñ`, el espacio, `.`, `_` y `-`.
  - Sin espacio al principio ni al final, y sin dos espacios seguidos.
  - La lista es cerrada y latina a propósito: el nombre es lo que el usuario confirma en la página manual y en la de reemisión, y un alfabeto abierto admite caracteres que se confunden con otros.
- **`GET /api/auth/callback`, rama de la consola, con reemisión**:
  1. tras verificar a Google, la Lambda lee `sync/devices/<rdid>.json`;
  2. si falta, está olvidado o es de tipo `web`, responde con la página de error y el código propio de cada caso: `reissue_device_missing`, `reissue_device_forgotten` o `reissue_device_not_console`;
  3. si es aceptable, sirve **la página de confirmación** (§D). Sin confirmarla no hay código.
- **`POST /api/auth/console/token`** con un código que lleva `rdid`:
  1. vuelve a comprobar las tres condiciones sobre el objeto, porque pudo cambiar entre la vuelta y el canje;
  2. **revoca todos los tokens activos de ese dispositivo** (lista por ruta, filtrados por `device_id`), uno a uno y antes de crear nada;
  3. crea el nuevo sin sobrescribir.

  La respuesta es la de §4.3.
- **`GET /api/devices/tokens`**: una fila por registro. Un registro ilegible sale como `{ "token_id": "<del nombre>", "status": "unreadable" }`, **nunca se omite**, y el registro de la Lambda anota `token_record_unreadable`.

## C. Sincronización (§5) y datos de referencia (§6)

- **Tolerancia de `recorded_at`** (fila 5): **600 s** (data-model §5).
- **`PUT /api/sync/devices/self`**: sin cambios en el cuerpo. La respuesta y el objeto escrito, según data-model §6.
- **`GET /api/sync/devices`**: cada fila gana `type` y `state`.
- **Datos de referencia (§6; solo las rutas y sus clientes, §7 P12)**. Leen la sesión y el token, y no escriben nada:

| Ruta | Respuesta |
|---|---|
| `GET /api/reference/index` | `200 { "ecb": [ { "name", "version", "size" } ], "prices": [ … ] }`. `version` es la etiqueta opaca de S3 (el ETag del objeto): sirve para saber qué ha cambiado sin descargarlo. Solo el primer nivel de `reference/ecb/` y de `prices/`: `previous/` y `rejected/` no se listan |
| `GET /api/reference/ecb/<name>` | Los bytes de `reference/ecb/<name>`, con `ETag: "<version>"`. Con `If-None-Match` igual: `304` |
| `GET /api/reference/prices/<name>` | Lo mismo sobre `prices/<name>` |

  `<name>` tiene que cumplir `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$` y no contener `..`. Si no, es `400 reference_name_invalid` **antes de tocar S3**. Si no existe: `404 not_found`. El `Content-Type` sale de la extensión: `.csv` es `text/csv; charset=utf-8`, `.jsonl` es `application/x-ndjson; charset=utf-8` y `.json` es `application/json`. Cualquier otra extensión es `404`. **Nada fuera de esos dos prefijos es alcanzable.**

## D. Las páginas propias de la Lambda

Todas son `text/html; charset=utf-8`, **sin *script* y sin nada externo**, con `Cache-Control: no-store`, `Referrer-Policy: no-referrer` y `<meta name="referrer" content="no-referrer">`. Sin estilos externos: solo HTML semántico.

| Página | Cuándo | CSP | Qué enseña |
|---|---|---|---|
| **Acceso denegado** (`403`) | Vuelta de Google válida con un par que no está en la lista | `default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` | «Esta cuenta de Google no tiene acceso a Atlas en este entorno.» El **`sub` de la cuenta que acaba de autenticarse en esta misma petición**, escapado, y cómo añadirlo con el guion de secretos. **Nunca el correo.** El `sub` no se registra ni va en ninguna URL. Un enlace a `/` |
| **Error del inicio de sesión** (`400`, `403` o `503`) | Cualquier otro fallo de la vuelta: `login_attempt_missing`, `login_state_mismatch`, `google_error`, `google_exchange_failed`, `id_token_invalid`, `id_token_audience`, `id_token_issuer`, `id_token_expired`, `id_token_nonce`, `email_not_verified`, `mfa_required` (si llega a existir), `reissue_device_missing`, `reissue_device_forgotten`, `reissue_device_not_console`, `remote_unavailable` | la misma | El código literal, una frase en español por código y un enlace para volver a empezar |
| **Código manual** (`200`) | Vuelta de la consola con `mode=manual` | `sandbox` (sin `allow-same-origin`, ADR-0033) más lo de arriba | La hora del intento, el aviso de ADR-0033 punto 2 y un `<details>` cuyo `<summary>` dice «Confirmo que he abierto yo este inicio de sesión desde la consola, en el dispositivo «\<nombre\>»: enseñar el código». **El código solo aparece al desplegarlo** (PROPUESTA, plan §6.2 (i bis)) |
| **Confirmar la reemisión** (`200`) | Vuelta de la consola con `rdid` válido | `sandbox` más lo de arriba | Los datos **del servidor**: el nombre del dispositivo, su `published_at` y su `pending`, si están. Con `loopback`, un enlace «Sí, es este dispositivo: continuar» a `http://127.0.0.1:<port>/callback?code=…&state=…`. Con `manual`, el mismo `<details>` de arriba |

## E. Códigos nuevos (cada uno con su literal; van a §7 de `docs/api.md`)

| Código | HTTP | Dónde |
|---|---|---|
| `device_forgotten` | 403 | Toda ruta con credencial: el objeto del dispositivo falta, es de otro tipo o está olvidado (B1, R2-B2), con `details.reason` = `missing` \| `wrong_type` \| `forgotten` (Q3). Entra en `REMOTE_FAILURE_CODES` |
| `remote_unavailable` | 503, con `Retry-After: 5` y `details.dependency: "ssm" \| "s3"` | Un fallo transitorio de SSM (`ThrottlingException`) o de S3 (5xx, límite): se puede reintentar y nunca deja pasar una credencial (§7 P8 (b)). Entra en `REMOTE_FAILURE_CODES` |
| `reference_name_invalid` | 400 | §C |
| Los de la página de error | — (HTML) | §D. No son JSON ni los ve un cliente HTTP |
| `reissue_device_missing`, `reissue_device_forgotten`, `reissue_device_not_console` | 403 en `POST /api/auth/console/token`; página de error en la vuelta | §B |
