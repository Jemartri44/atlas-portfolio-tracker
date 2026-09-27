# Preguntas y verificaciones de la feature 015

Fechas en `Europe/Madrid`. Todo lo ejecutado está en el *scratchpad* de la sesión, en ficheros con el prefijo `015-` (`015-bundle/`, `015-cookie/`, `015-build-baseline.log`, y las páginas descargadas del bloque 0), nunca en el repositorio. Las salidas se citan literalmente.

---

## 0. Estado: alto del plan (2026-09-25, 15:10)

`spec.md`, `plan.md` y los artefactos del plan (`research.md`, `data-model.md`, `contracts/` y `quickstart.md`) están escritos. **No hay ninguna línea de código de producción.**

- **Bloque 0 de E1**: hecho (§1). Tres de los cuatro puntos salen bien. El punto 2 (`amr`) sale **«se puede pedir, pero no se puede exigir en la práctica»**, y es la pregunta Q2.
- **Paquete web**: la partida coincide con el encargo (§4). La estimación del **total** no cabe en la autorización de §7 P13, y es la pregunta Q1.
- **Worktree**: `../atlas-wt-015`, como pidió la dirección al lanzar la sesión, y no `../atlas-portfolio-tracker-015`, que es lo que dice el encargo en §2.1.

---

## 1. Bloque 0 de E1 — las verificaciones, con su fuente

Consultadas el 2026-09-25. Las páginas se descargaron con `curl` y se leyeron como texto; las citas son literales.

### 1.1 Punto 1 — `iss`, las claves públicas, su caché y el algoritmo

**Fuentes**:

- el documento de descubrimiento, `https://accounts.google.com/.well-known/openid-configuration`;
- la guía OIDC, `https://developers.google.com/identity/openid-connect/openid-connect` («Last updated 2026-06-15»);
- la guía de verificación, `https://developers.google.com/identity/gsi/web/guides/verify-google-id-token` («2025-12-22»);
- las claves, `https://www.googleapis.com/oauth2/v3/certs`.

**Lo que dicen**:

- **Descubrimiento**, tal cual:
  - `"issuer": "https://accounts.google.com"`
  - `"authorization_endpoint": "https://accounts.google.com/o/oauth2/v2/auth"`
  - `"token_endpoint": "https://oauth2.googleapis.com/token"`
  - `"jwks_uri": "https://www.googleapis.com/oauth2/v3/certs"`
  - `"id_token_signing_alg_values_supported": ["RS256"]`
  - `"code_challenge_methods_supported": ["plain","S256"]`
  - `"token_endpoint_auth_methods_supported": ["client_secret_post","client_secret_basic"]`
  - `"claims_supported": ["aud","email","email_verified","exp","family_name","given_name","iat","iss","name","picture","sub"]`
- **`iss`**: «Verify that the value of the iss claim in the ID token is equal to https://accounts.google.com or accounts.google.com.» La tabla de reclamaciones repite: «Always https://accounts.google.com or accounts.google.com for Google ID tokens.»
- **Caché de las claves**: «you can cache them using the cache directives of the HTTP response» (guía OIDC) y «examine the `Cache-Control` header in the response to determine when you should retrieve them again» (guía GIS).
- **Observado hoy** (`curl -sI` a `/oauth2/v3/certs`, a las 14:50 hora de Madrid): `cache-control: public, max-age=23474, must-revalidate, no-transform`. Hay dos claves, las dos `kty: RSA`, `alg: RS256` y `use: sig`.

**Conclusión**:

- Se aceptan **las dos formas** de `iss`, cada una como literal exacto.
- Las claves se toman de la dirección del descubrimiento, que **se fija en el código** (no se descubre en cada arranque). Se cachean según el `max-age` de la respuesta, con un tope propio (PROPUESTA: 24 h).
- **Solo RS256.**
- Un `kid` desconocido provoca **una** recarga de las claves, con un límite de frecuencia (PROPUESTA: una por minuto y por instancia), y si sigue sin aparecer se rechaza.

**No documentado**: el plazo de rotación. Google dice «infrequently» en una página y «regularly rotated» en la otra.

### 1.2 Punto 2 — reautenticar y `amr` (bloquea la decisión de E2)

**Fuentes**:

- la guía OIDC (arriba);
- la referencia, `https://developers.google.com/identity/openid-connect/reference` («2026-03-27»);
- el *security bundle*, `https://developers.google.com/identity/siwg/security-bundle` («2026-06-15»);
- `https://developers.google.com/identity/protocols/oauth2/web-server` («2026-09-14»).

**Lo que dicen**:

- **`prompt`**: los valores documentados son `none`, `consent` y `select_account`: «Possible values: none (no UI), consent (prompt for consent), select_account (prompt to select account).» **`login` no aparece.** `max_age` no aparece en ninguna de las cuatro páginas.
- **Reautenticación**: «Google does not support Google Account reauth requests.»
- **`amr` y `auth_time`** se piden con el parámetro `claims`: «amr … claims={"id_token":{"amr":{"essential":true}}} Must be enabled in settings.» Sobre `mfa`: «mfa Multi-factor authentication was completed … Present only when the amr claim is included in the authentication request and enabled in settings.»
- **Condiciones**:
  - «To receive additional claims your app needs to be published, verified, and security bundle features enabled» («Publishing status is In production», «Verification Status is Verified», y en la configuración avanzada, «Authentication strength claims to enable amr»).
  - «The amr claim is included in the ID token only when information is available on the authentication method used, it may not be present even when requested.»
  - «Missing claims are likely due to the app not being verified or additional settings are disabled, which is the default.»
- En la navegación del sitio, el *security bundle* cuelga de «Early Access Features» y lleva la marca «Beta».

**Conclusión**:

- **No se puede forzar la reautenticación.** `prompt=select_account` obliga a pasar por la pantalla de Google, que es lo que exige ADR-0033, pero no a volver a autenticarse.
- **`amr` se puede pedir, y exigirlo no es viable** con este cliente:
  - hace falta una aplicación **publicada y verificada por Google** con una función en Beta activada;
  - aun así, `amr` **puede no venir**.
  - Exigir `mfa` dejaría al usuario sin poder emitir tokens en cuanto faltara, y pedirlo sin exigirlo no protege de nada.
- **Propuesta**: `mfa_required` **no se emite**, y **no se pide** `amr`. La verificación en dos pasos sigue siendo un requisito operativo del usuario (§7 P15). La dirección lo anota en ADR-0033 y en `docs/runbooks/google-2-step-verification.md`. Es la pregunta **Q2**. Con ella, el punto 7 del bloque 0 de E2 no tiene objeto y el mutante 28 queda como no aplicable, dicho así.

### 1.3 Punto 3 — el borrado de un cliente OAuth sin uso, y su gestión por API

**Fuentes**:

- `https://support.google.com/cloud/answer/15549257`, sección «Unused Client Deletion» (sin fecha visible);
- la página de servidores web (arriba);
- `https://docs.cloud.google.com/iap/docs/deprecations/migrate-oauth-client` («2026-09-24»);
- `https://docs.cloud.google.com/iam/docs/reference/rest/v1/projects.locations.oauthClients` («2025-11-24»);
- el registro de Terraform, `hashicorp/google` 8.4.0 (publicado el 2026-09-22), con su guía `version_8_upgrade`.

**Lo que dicen**:

- **Plazo**: «OAuth 2.0 clients that have been inactive for six months are automatically deleted.»
- **Qué cuenta como uso**: «…neither of the following actions have occurred within the past six months: The client has not been used for any credential or token request via the Google OAuth2.0 endpoint. The client's settings have not been modified…»
- **Aviso**: «You will receive an email notification 30 days before an inactive client is scheduled for deletion.» Y otro después del borrado.
- **Recuperación**: «You can restore deleted clients within 30 days of the deletion» (en otra sección, «typically recoverable at least 30 days»).
- **Gestión por API**:
  - Terraform 8.x: «`google_iap_brand` and `google_iap_client` have been removed … OAuth consent screens (brands) and OAuth clients can no longer be managed programmatically via the API and must be configured directly in the Google Cloud Console.»
  - `oauthClients` de IAM es para *Workforce Identity Federation*.
- El secreto del cliente solo se puede ver al crearlo.

**Conclusión**:

- Se borra a los seis meses sin una petición de token ni un cambio, con aviso por correo 30 días antes, y se puede recuperar unos 30 días.
- Cada `atlas remote login` y cada inicio de sesión de la web **cuentan como uso**: son peticiones al *token endpoint*. La página no lo dice de forma explícita, pero se desprende de «any credential or token request».
- **No hay API ni recurso de Terraform** para el cliente ni para la pantalla de consentimiento: sigue siendo una excepción manual (ADR-0027), ahora con fuente.
- El procedimiento de E5 lo recoge.

### 1.4 Punto 4 — el evento de la Function URL, las cookies y los límites

**Fuentes**:

- `https://docs.aws.amazon.com/lambda/latest/dg/urls-invocation.html`;
- `https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html`;
- `https://docs.aws.amazon.com/lambda/latest/api/API_CreateFunctionUrlConfig.html`;
- `https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html`.

**Lo que dicen**:

- **El formato**: «The request and response event formats follow the same schema as the Amazon API Gateway payload format version 2.0.» Campos: `version: "2.0"`, `rawPath`, `rawQueryString`, `cookies` («An array containing all cookies sent as part of the request»), `headers`, `requestContext.http.method`, `body` e `isBase64Encoded` («If the content type of the request is binary, the body is base64-encoded»).
- **Respuesta**: «To return cookies from your function, don't manually add set-cookie headers. Instead, include the cookies in your response payload object. Lambda automatically interprets this and adds them as set-cookie headers».
- **Límites**:
  - «6 MB each for request and response (synchronous)»;
  - «1 MB for the total combined size of request line and header values»;
  - «BUFFERED – This is the default option … The maximum payload size is 6 MB.»
- Del formato 2.0 de API Gateway, al que remite: «Duplicate headers are combined with commas», «All cookie headers in the request are combined with commas and added to the cookies field», «All headernames are lowercased».

**Conclusión**:

- Las cookies se leen de `event.cookies` y varias `Set-Cookie` se devuelven en `cookies`.
- El cuerpo se decodifica según `isBase64Encoded`.
- Una petición y una respuesta caben en 6 MB. El libro mide menos de 1-2 MB en veinte años (ADR-0002).
- **La 015 devuelve `413`** (PROPUESTA: `body_too_large`) antes de parsear un cuerpo que supere un tope propio, muy por debajo de 6 MB.

**No documentado en la página de la Function URL**: que los nombres de cabecera lleguen en minúsculas y que `cookie` salga de `headers`. **Decisión de diseño que no depende de ello**:

- el manejador pasa todo nombre de cabecera a minúsculas;
- las cookies son la unión de `event.cookies` y de `headers.cookie`, si viene;
- **una cookie `__Host-atlas_session` repetida con dos valores es `session_invalid`**, nunca la primera que aparezca.

### 1.5 Lo que la dirección tiene que escribir en cada documento, del bloque 0 de E1

- **ADR-0027**:
  - los dos `iss`, la dirección de las claves y su caché;
  - no hay reautenticación (cita);
  - el borrado del cliente (6 meses, aviso a 30 días, recuperable unos 30 días);
  - no hay API ni Terraform (cita de Terraform 8.x).
- **ADR-0033**: `amr` exige una aplicación publicada y verificada con una función Beta, y puede no venir, así que **`mfa_required` no se emite** (si la dirección acepta Q2).
- **`docs/runbooks/google-2-step-verification.md`**: lo mismo, dicho para el usuario.
- **`docs/api.md` §7**: `body_too_large` (413), si se acepta.

## 2. Bloque 0 de E2 a E5: qué se verifica y cuándo

Cada uno, **antes del primer commit de código de su entrega**, escrito aquí con fuente, fecha y salida.

| Entrega | Punto | Qué | Si sale mal |
|---|---|---|---|
| E2 | 1 | `PutParameter` sin `Overwrite` es atómico ante dos peticiones simultáneas (`ParameterAlreadyExists`) | **Para E2** |
| E2 | 2 | `PutParameter` admite `Tags` al crear un `SecureString` estándar, y qué permiso pide (`ssm:AddTagsToResource`) | Se escribe; la dirección lo anota en ADR-0034 |
| E2 | 3 | `GetParameter` con selector (`nombre:versión`, `nombre:etiqueta`), para que el doble lo imite | — (lo imita) |
| E2 | 4 | *Loopback* a `http://127.0.0.1` y *Local Network Access* en Chromium, con fuente; el procedimiento del usuario, preparado aquí y aplazado a la 018 (§7 P14) | No para |
| E2 | 5 | `Content-Security-Policy: sandbox` sin `allow-same-origin` impide a la SPA leer la página, con fuente y con **Chromium de verdad**; también que un `<details>` se despliega dentro del *sandbox* | Para **solo** la variante manual |
| E2 | 6 | WSL en modo NAT y abrir el navegador desde WSL (documentación de Microsoft) | No para |
| E2 | 7 | Qué valor exacto de `amr` se exige | Sin objeto si se acepta Q2 |
| E3 | 1 | `PutObject` con `If-Match` y con `If-None-Match: *`: el `412`, la carrera, el `409` y los permisos que exige la escritura condicional | **Para E3** si no garantiza que una escritura condicional no pisa otra |
| E3 | 2 | El ETag de S3 no es el SHA-256: cómo lo obtiene la Lambda de su propia lectura | — |
| E3 | 3 | Si CloudFront comprime `GET /api/ledger` y qué ve el cliente | — |
| E5 | 1 | La cadena estándar de credenciales del SDK y cómo se asume `atlas-<entorno>-admin` con MFA (las dos variantes de C5) | — (dobles) |
| E5 | 2 | STS rechaza `AssumeRole` con credenciales del *root* | Se escribe tal cual |

**Hecho ya, adelantado de §6.2 (i)**: Chromium 151 acepta las cookies `__Host-…; Secure` servidas por `http://127.0.0.1`.

- **Prueba**: un servidor `node:http` en el puerto 0 responde a `/set` con dos `Set-Cookie` (`__Host-atlas_session=abc; Path=/; Secure; HttpOnly; SameSite=Strict` y `__Host-atlas_login=xyz; …; SameSite=Lax`) y un `302` a `/check`, que devuelve la cabecera `Cookie`. Lo abre `chrome-headless-shell --dump-dom` (Chrome for Testing 151.0.7922.34, `chromium_headless_shell-1234`).
- **Salida**: `COOKIE=__Host-atlas_session=abc; __Host-atlas_login=xyz`.
- **Consecuencia**: el servidor local de las capturas puede ir por HTTP en `127.0.0.1`, sin certificado.

## 3. Lo que el encargo afirma del código, comprobado sobre esta rama

`git diff --stat f7ba7e4..b3e2fcb -- packages apps tests` sale vacío: el código es el de `f7ba7e4`. Comprobado, y cierto:

- no existe `apps/api`;
- los *workspaces* son `packages/*` y `apps/*`;
- las catorce piezas de `packages/domain/src/sync/`;
- `permission.ts`, con sus cinco funciones;
- `RemoteLedger` y `REMOTE_FAILURE_CODES` (18 códigos);
- `appendLines` y `replaceLines`;
- los clientes y `held-actions.ts`;
- `folder-store.ts` y `sync-store.ts`;
- `simulated-remote.ts`;
- `ledger-store.contract.ts`;
- `export.ts` y `transfer.ts`;
- `backup.ts`, que no copia `documents/`;
- `corporate-actions.ts:225`;
- los mensajes de `messages.ts:390/404` y `errors.ts:434/448`;
- `ARITY`;
- `architecture.test.ts:1128`;
- `check-bundle.mjs:259/612/723`;
- los `exports` de `adapters` con `./sync` y `./sync-client`;
- el SDK y `esbuild`, presupuestados y sin instalar;
- `resolve.ts:282-293` (`targetOf`, el mismo bloque).

**Tres matices que el plan tiene en cuenta**:

- `DeviceQueueState`, la entrada de `rewritePermission`, **no tiene tipo ni estado**. Filtrar los olvidados es trabajo de E5 (plan §8).
- `discardHeld` **no mira** si hay un rehacer empezado, así que descartar ya es una salida del rehacer a medias (plan §8, punto 1).
- `checkCandidate` y `completeDraft` ya están exportados. La función de N1 puede vivir en `sync/` sin tocar `record-event.ts` (plan §8, punto 4; Q5).

## 4. El paquete web: la partida, medida

`npm run build` sobre `b3e2fcb`, con la misma regla que `check-bundle.mjs` en bytes exactos (guion `015-bundle/measure-015.mjs`, que suma el gzip de cada `.js` y `.css`; el arranque es lo que pide `index.html`):

```
assets/domain-DIqNvFMe.js 41487
assets/index-C5669RsE.css 10163
assets/index-C67cakac.js 24068
registerSW.js 125
BOOT 75843
TOTAL 280039
```

**Arranque 75.843 (techo 75.869, 26 de margen); total 280.039 (techo 280.064, 25 de margen).** Coincide con el encargo.

**Lo que ya está hoy en el paquete de la sincronización**:

- solo el fragmento perezoso `write` (1.584 bytes gzip): `archive.ts`, `lines.ts`, `marker.ts` y `sync-store.ts`;
- el motor entero **no está en el paquete**, porque nada de la web lo alcanza.

**Medido con `rolldown --minify`** sobre los `dist` de `tsc` (`015-bundle/`), una aproximación de lo que costará hacerlo alcanzable en E4:

- el barril del dominio, solo: 48.542 bytes gzip;
- el barril más `@atlas/domain/sync`, `sync/client.js` y `sync-store.js`: 58.660;
- **unos 10 KB gzip más**, de los que ya hay 1,5 en `write`.

La estimación trozo a trozo está en plan §12, y es la base de Q1.

## 5. Preguntas nuevas a la dirección

- **Q1 — El total del paquete no cabe en la autorización de §7 P13 (+4 KB).**
  - La estimación de toda la feature es **+16 a +23 KB gzip** (plan §12):
    - el motor de la sincronización que E4 hace alcanzable, unos 8,5 KB;
    - las pantallas de sesión, dispositivos y sincronización, de 6 a 10 KB;
    - los clientes y los mensajes, de 1,5 a 3 KB.
  - Con la regla actual, **se pararía en E2 o en E4**.
  - Opciones que veo, sin elegir:
    - **(a)** autorizar ahora un tope del total de **+24 KB** (hasta 304.640), con la misma disciplina: cada subida en su propio commit, con lo medido y la tendencia;
    - **(b)** mantener +4 KB y parar en cada entrega con la medida;
    - **(c)** sacar de la web parte de lo previsto, como la resolución de lo retenido.
  - **Recomiendo (a)**: todo es carga diferida, y el arranque, que es lo que paga cada visita, no se mueve de su tope.
- **Q2 — `mfa_required`** (§1.2). Propuesta: no se emite y no se pide `amr`. La dirección lo anota en ADR-0033 y en el procedimiento de la verificación en dos pasos (§7 P15). El mutante 28 queda como no aplicable, dicho así.
- **Q3 — `device_forgotten` para las tres causas.**
  - R2-B2 dice que si el objeto falta, es de otro tipo o está olvidado, se niega con `403 device_forgotten`, y el mutante 49 prohíbe plegar dos códigos en uno.
  - Propuesta: **un solo código** en la respuesta, porque para el cliente la salida es la misma (volver a iniciar sesión, o reemitir), con `details.reason` = `forgotten` \| `missing` \| `wrong_type`. El registro de la Lambda lleva la causa.
  - La alternativa son tres códigos, con tres frases en cada interfaz.
  - ¿Cuál?
- **Q4 — La P3 sin respuesta deja la feature sin artefacto desplegable.**
  - Sin el SDK no hay composición real de S3 y SSM, así que la Lambda **no se puede desplegar** y las órdenes de `atlas admin` y `atlas backup --from-bucket` **solo corren contra los dobles**.
  - ¿Se acepta cerrar la 015 así, y que el adaptador del SDK sea lo primero de la 017, si el usuario sigue sin contestar?
- **Q5 — Dónde vive la función de N1** (el rehacer con la regla de `correctEvent`).
  - N2 la da por parte del dominio del arranque, pero `checkCandidate` y `completeDraft` ya están exportados.
  - **Propuesta**: vive en `packages/domain/src/sync/redo-record.ts`, junto a `startRedoPlan`, fuera del fragmento del arranque. Solo la llaman el rehacer de la consola y el de la web, que ya es perezoso, y `record-event.ts` no cambia. Estimación: **de +0 a +10 bytes** en el arranque (ruido de la tabla), que se miden.
  - Si la dirección prefiere que viva en `record-event.ts`, estimo de +40 a +80, dentro de la autorización.
  - No es esconder nada con una importación dinámica: es donde vive el resto del rehacer.
- **Q6 — La IndexedDB copiada (§7 P1).**
  - Una detección **barata y robusta** no existe sin tocar el contrato. Contrastar `last_sync_at` del objeto publicado con el del marcador falla por relojes distintos y da falsos positivos tras un `publish_failed`.
  - Lo robusto sería publicar el `synced_sha256` o un contador, que es un campo nuevo en `PUT /api/sync/devices/self` y en el marcador.
  - **Recomiendo solo documentarlo**, como riesgo aceptado (plan §6.2 (d bis)).
- **Q7 — Dónde va la sincronización en la web.**
  - **Propuesta**: una sección de **Ajustes** cargada en diferido (`/ajustes#sincronizacion`), no una ruta nueva. Una ruta añade su entrada a la tabla del arranque (estimo +25 a +45 bytes), y una sección dentro de un fragmento perezoso, no.
  - Si la dirección quiere una página propia (`/ajustes/sincronizacion`), cabe en la autorización de P13, pero se mide.

## 6. Documentos (para que los traslade la dirección)

- **`docs/api.md`**:
  - los [PENDIENTE] que se confirmen: la caché de la lista, la sesión y el intento, `logout`, `device_name`, el código de 5 minutos, «recientes» de 7 días, la tolerancia de 10 minutos y las rutas de §6;
  - `GET /api/session`, `remote_unavailable`, `device_forgotten` en §2.2, §5.3 y §7, y la página de acceso denegado;
  - la ligadura de §5.4 (§7 P1), con el registro en `sync/devices/`;
  - la forma de `sync/devices/<id>.json` y `type`/`state` en `GET /api/sync/devices`;
  - la reemisión (`reissue_device_id` en §4.1, las tres negativas y la confirmación en §4.2 y §4.3);
  - los nombres y formatos de SSM;
  - lo que verifique E3 en §5.5;
  - los códigos de la página de error, `reference_name_invalid` y `body_too_large`;
  - §4.5: «procedimiento escrito en la 015 o la 018» pasa a «en la 015».
- **ADR-0027**: lo verificado (§1.5) y que la cookie lleva también el `device_id` de la web (N9).
- **ADR-0033**: lo verificado (§1.5) y lo que verifique E2.
- **ADR-0034**: lo que verifiquen E2 (etiquetas) y E5 (STS y el *root*).
- **`docs/data-schema.md` §1**:
  - `sync/devices/` con su tipo y su estado;
  - `sync/remote.json` y su temporal en el barrido;
  - `credentials.json` como quede, con `folder_hint`;
  - `~/.config/atlas/admin.json`, si se acepta;
  - `token_expiry_warning_days` en `atlas.config.json`.
  - **Y una errata anterior a esta feature**: el párrafo que sigue a la tabla dice aún «Cada entorno (`dev`, `prod`) vive en su propia cuenta AWS miembro (ADR-0028)» y habla de un bucket de CloudTrail, cuando ADR-0034 los sustituye.
- **`docs/runbooks/`**: los tres procedimientos de E5, y la línea 86 de `google-2-step-verification.md`, que tiene que enlazar el tercero.
- **`docs/dependencies.md`**, si el usuario autoriza la P3.
- **`docs/decision-roadmap.md`** y **`docs/prompts/README.md`**, al cerrar.

## 7. Gemelos `.js`

Tras el *build* de partida: la búsqueda de un `.js` junto a un `.ts` o un `.tsx` del mismo nombre, fuera de `dist*/` y de `node_modules/`, en `packages`, `apps` y `tests`, **no encuentra ninguno** (2026-09-25, 14:55).

```
find packages apps tests -name '*.js' -not -path '*/node_modules/*' -not -path '*/dist*' | while read f; do b="${f%.js}"; [ -e "$b.ts" -o -e "$b.tsx" ] && echo "TWIN $f"; done
```

## 8. Respuestas de la dirección al alto del plan (2026-09-25)

`spec.md` y `plan.md` reciben el **visto bueno**. Decisiones, tal como llegaron:

- **Propuestas del alto (plan §6): aceptadas todas tal como se proponen** — los valores [PENDIENTE] (lista 120 s, sesión 8 h, intento 10 min, `POST /api/auth/logout` → `204`, `device_name` de 1 a 40 con el alfabeto cerrado, código 5 min, «recientes» 7 días, tolerancia 10 min, secretos 300 s), los nombres de SSM, `GET /api/session`, `remote_unavailable`, la página de acceso denegado, el objeto del dispositivo, el `<details>` y el enlace a `127.0.0.1`, `reissue_device_id`, el aviso a 14 días, `--local-only`, las órdenes, las rutas de referencia y **la comparación exacta del correo, exigiendo además `email_verified`** —, **con una precisión: ninguna cookie lleva el correo.** La sesión y la cookie transitoria solo llevan el `sub` y lo imprescindible; así, **firmar sin cifrar es suficiente y queda aprobado**.
  - *Nota del implementador:* el diseño ya cumplía la precisión en las dos cookies (`data-model.md` §1.2 y §1.3: ninguna lleva el correo). **El código de un solo uso de la consola (E2) no es una cookie y sí lleva el correo** (`data-model.md` §1.4). Queda como pregunta para antes de E2: **Q8** (§9).
- **Rehacer a medias: opción (a).**
- **Q1: autorizado el total hasta +24 KB por encima del techo actual** (280.064 + 24.576 = **304.640**), cada subida en su propio commit con la medición. **El arranque sigue con su tope de 76.069.**
- **Q2: no se emite `mfa_required`.** Nota fechada en ADR-0033 y en el procedimiento de la verificación en dos pasos (hechas en E1, por encargo de la dirección).
- **Q3: un solo código, `device_forgotten`, con `details.reason`** (`missing`, `wrong_type`, `forgotten`).
- **Q4: depende del usuario (P3).** Si dice que sí, el SDK entra en E3; si no, la 015 se cierra con dobles y el SDK se conecta al empezar la 017. La dirección lo confirma antes de E3.
- **Q5: `sync/redo-record.ts`.**
- **Q6: la IndexedDB copiada se documenta como riesgo aceptado.**
- **Q7: sección perezosa de Ajustes.**
- **§6: la errata de `docs/data-schema.md` §1** (cuentas miembro y bucket de CloudTrail) **se corrige en E1** según ADR-0034.
- **Documentos**: la dirección encarga **en E1** llevar estas decisiones a `docs/api.md` y a `data-model.md`, la nota de Q2 a ADR-0033 y al procedimiento, y la errata de `data-schema.md`. Es una excepción expresa a la regla de §2 bis del encargo («no toques `docs/`»), limitada a esto.

## 9. Preguntas abiertas para antes de E2

- **Q8 — El correo en el código de la consola.** La precisión de §8 («ninguna cookie lleva el correo») vale para las cookies. El código de un solo uso de §4.2 viaja en la URL de vuelta a `127.0.0.1` (queda en el historial del navegador) o se enseña en la página manual, firmado y **sin cifrar**, y ADR-0033 lo liga al par `{sub, email}`. Opciones, sin elegir: **(a)** el código lleva solo el `sub`, y al canjear la API toma el correo de la entrada de la lista permitida con ese `sub` (el par se vuelve a comprobar entero en ese momento; si el `sub` tiene dos entradas, se niega); **(b)** se cifra el código con AES-256-GCM y la subclave `console_code` (autenticado y opaco); **(c)** se acepta el correo legible en el código. Recomiendo **(a)**: no añade primitiva y el par se comprueba igual en el canje.
- **Q9 — Un objeto de dispositivo ilegible.** Q3 fija tres valores de `details.reason` (`missing`, `wrong_type`, `forgotten`). Un `sync/devices/<id>.json` que existe pero no se lee de forma estricta (a mano, o de una versión más nueva) no es ninguno de los tres. E1 lo niega igual (`403 device_forgotten`, fallo seguro) con un **cuarto valor, `unreadable`**, en lugar de plegarlo en `missing`. ¿Se confirma, o se prefiere plegarlo?

## 10. E1 — el esqueleto de la API, el acceso de la web y la sesión (2026-09-25)

### 10.1 Qué hay en la rama

| Bloque | Commits | Qué |
|---|---|---|
| Documentos del alto | `37ac7b7`, `edfc2cb`, `7374c53`, `08b8689` | Las decisiones de §8 en este fichero, en `data-model.md`, en `contracts/` y en `docs/api.md`; la nota de `mfa_required` en ADR-0033 y en `docs/runbooks/google-2-step-verification.md`; la errata de `docs/data-schema.md` §1 (cuenta compartida, sin bucket de CloudTrail) y la fila de `sync/devices/` con su tipo y su estado. Por encargo expreso de la dirección (§8) |
| 1 — guardianes | `44e525a` | `tests/api-access.test.ts`: `@atlas/api` como *workspace* sin dependencias externas e inalcanzable; ningún doble ni carpeta de test alcanzable desde la API ni desde ningún `exports`; `Authorization` en ningún fuente del producto; el SDK de AWS solo en `adapters/src/aws/sdk-*`; las direcciones de Google solo en `adapters/src/identity/`; lo que alcanza la web, **derivado de sus importaciones y de `exports`**, sin SDK, Google, `node:` ni las reglas del acceso; la web sin nombres que configuren la sincronización ni claves `sync:*` (con el comentario de que se afloja solo en E4, tras P2 y P3); los módulos nuevos de la web en `LAZY_ONLY` |
| 2 — reglas y esqueleto | `5a4a2f3`, `1d0abd5`, `e6267c7`, `51b6c8e` | `@atlas/domain/access` (puro, al 100 %): códigos, credenciales, rutas y su admisión, `Origin`, cuerpo, cargas firmadas, ID token, lista permitida, objeto del dispositivo, configuración. `@atlas/adapters/{access,identity,aws}` (solo Node): HKDF y HMAC con `timingSafeEqual`, PKCE, RS256; Google con sus direcciones fijadas y la caché de claves; las interfaces estrechas de S3 y SSM, el almacén de dispositivos y los secretos con su caché. `apps/api`: `createHandler(deps)` |
| 3 — acceso de la web | `e6267c7`, `d82e45a`, `f20c5bf`, `211a099`, `30d48c6` | Inicio, vuelta, sesión, `GET /api/session`, cierre, páginas; `device_forgotten`, `remote_unavailable` y `body_too_large` en `REMOTE_FAILURE_CODES` y en las dos interfaces; la tarjeta «Sincronización» de Ajustes y el `device_id` guardado en IndexedDB |
| Capturas | `d51c5fa`, `f96bf7c` | El servidor local con los dobles (`apps/api/test/support/local-server.ts`) |

### 10.2 Cómo se vio cada test en rojo

- **Guardianes**: con `apps/api` y `access.ts` sin crear, 5 de 11 en rojo (los de «tiene los ficheros», dependencias, puerta, SDK en los `package.json` y `LAZY_ONLY`); los otros seis **se vieron matar su mutante** (§10.3), porque sobre el árbol de hoy no había violación que ver.
- **Dominio** (`packages/domain/test/access/`, 3 ficheros, 37 tests): con `src/access/` apartado, los tres ficheros fallan al cargar; con él, verdes y al 100 % de líneas y ramas.
- **Adaptadores** (`test/access`, `test/identity`, `test/aws`, 21 tests): con `src/{aws,access,identity}` apartados, los tres en rojo.
- **API** (`apps/api/test/`, 43 tests): con `createHandler` sustituido por uno que lanza, 43 de 43 en rojo.
- **Mensajes**: al añadir los tres códigos a `REMOTE_FAILURE_CODES`, `tests/messages.test.ts` falló en «translates every one of them in both interfaces» antes de escribir las frases.
- **El *service worker*** (`30d48c6`): el test del guardián se vio en rojo antes de añadir `navigateFallbackDenylist`.
- *Honestidad sobre el orden*: en el dominio y los adaptadores escribí el código antes que el test y verifiqué el rojo apartando el código; la prueba de que cada test ata su regla son los mutantes de §10.3, cada uno visto morir.

### 10.3 Mutación (guion `015-mut/mutate-015.mjs`: afirma cada sustitución, restaura y compara byte a byte, se niega con gemelos `.js`)

**Lote de guardianes** (`e1-guards.json`, sobre el árbol final de E1): 14 de 14 muertos.

| Id | Mutante | Resultado |
|---|---|---|
| M8a / M8b | leer `Authorization` en la API / escribirla en la web | muertos |
| M12a–d | la web importa `BrowserSyncStore`, `initialiseRemote`, el cliente por importación dinámica, o nombra una clave `sync:*` | muertos |
| G-api-reach | la consola importa `@atlas/api` | muerto |
| G-double | la API importa un doble de test | muerto |
| G-sdk | el SDK de AWS fuera de `src/aws/sdk-*` | muerto |
| G-google | una dirección de Google en el dominio | muerto |
| G-lazy | quitar la sección de Ajustes de `LAZY_ONLY` | muerto |
| G-barrel | el barril reexporta el acceso | muerto |
| G-dep | una dependencia externa en `@atlas/api` | muerto |
| G-web-access | la web importa `@atlas/domain/access` | muerto |

**Lote de E1** (`e1.json`): **51 de 51 muertos**, el árbol igual antes y después (`git status` comparado). Dos ajustes durante el lote, dichos: **M12bis-a sobrevivió** la primera vez —el test de «un id que la API no emitió» leía `device_id` del cuerpo de un `403` y comparaba `undefined`—; el test se reforzó (`89d0546`: exige `200` y el objeto del nuevo dispositivo) y el mutante murió. **M9a no se aplicó** la primera vez (Biome había partido la línea); se corrigió el ancla y murió.

| Id | Mutante (§5 del encargo) | Resultado |
|---|---|---|
| M1a–d | la sesión abierta con la subclave del intento; una subclave para todos; sin mirar `typ`; la clave de sesión sin derivar | muertos |
| M2 (×10) | saltarse `state`, PKCE, la firma, `aud`, `iss`, `exp`, `nonce`, `email_verified`; el `sub` sin el correo; el correo sin el `sub` | muertos |
| M3-alg / M3-kid | otro algoritmo que RS256; una clave cualquiera para un `kid` desconocido | muertos |
| M4a–c | no volver a consultar la lista; caché para siempre; caché del doble de lo configurado | muertos |
| M5 | cookie y token: atender al token | muerto |
| M6a / M6b | sin `Origin` aceptada (`if (origin && …)`); `Origin` ajeno aceptado | muertos |
| M7 (×5) | sin `HttpOnly`; sin `Secure`; sin `__Host-`; sesión `Lax`; transitoria `Strict` | muertos |
| M9a–c | registrar el mensaje de un error ajeno (con el filtro del registrador quitado); el mensaje de `JSON.parse` de un cuerpo que empieza por el centinela; el `sub` del acceso denegado | muertos |
| M10 | el `sub` en una URL | muerto |
| M11 | la web alcanza `@atlas/adapters/identity` por una subruta de `exports` | muerto |
| M12bis-a–c, R2B2, M46sexies | aceptar un id presentado sin mirar su objeto; uno de consola u olvidado; no comprobar el dispositivo en cada petición; un objeto que falta cuenta como vivo; no mirar el tipo | muertos |
| M12ter-a–d | página denegada sin `no-store`, sin `no-referrer`, con el correo; `GET /api/session` con la firma sin comprobar | muertos |
| M12quater | `GET /api/session` con otro `device_id` | muerto |
| M49a / M49b | plegar causas de `device_forgotten`; plegar `session_repeated` en `unauthenticated` | muertos |
| SW, R01, R24, R05, R19, R31 | el SW vuelve a servir `/api/` con la SPA; `Authorization` como credencial; una ruta de datos que redirige; un cuerpo no JSON aceptado; la sesión no caduca; un parámetro de SSM que falta da una lista vacía | muertos |
| M-login-clear | no borrar el intento en la vuelta | muerto |

**No aplican a E1**: M12 (el guardián, ya en el lote de guardianes); de E2 en adelante, los de su entrega.

### 10.4 El paquete web

Medido con la regla de `check-bundle.mjs` (guion `015-bundle/measure-015.mjs`), contra una construcción de la base (`b3e2fcb`, en un worktree desacoplado):

| Trozo | Base | E1 | Δ |
|---|---|---|---|
| `ajustes` (la tarjeta y el cliente de la sesión) | 4.637 | 6.240 | +1.603 |
| `web-device` (nuevo) | 0 | 411 | +411 |
| `errors` (tres frases) | 10.304 | 10.413 | +109 |
| El resto (ruido de *hashes*) | | | +3 |
| **Total** | 280.039 | **282.165** | **+2.126** |
| **Arranque** | 75.843 | **75.834** | **−9** |

**Medida sobre el commit congelado** (con la exclusión de `/api/` en el `sw.js`, +22): **arranque 75.834, total 282.187**. El techo del total subió a **276 KB (282.624)** en su propio commit (`f20c5bf`), dentro de la autorización de Q1 (hasta 304.640). El techo del arranque no se tocó. **Corregido el 2026-09-26 (revisión de la PR #90, B1): la subida no fue antes del commit que la necesitaba.** `d82e45a` (las frases de los tres códigos nuevos, +109 en `errors`) ya deja el total en **280.105**, por encima del techo de entonces (280.064), así que **`d82e45a` no pasa el `build`**; `f20c5bf`, que sube el techo, va **después**. La historia no se reescribe (el empuje forzado está vetado). **Lección para E2-E5: el techo se mide y se sube antes del primer commit que añade bytes a la web, incluidos los mensajes, no solo antes de la pantalla.**

### 10.5 Capturas (Chromium 151, desde el *scratchpad*; `~/atlas-private/capturas/2026-09-25-015-e1/`)

A 400×890 con DPR 3, a 2045×1141, y a 360 de ancho midiendo `scrollWidth === clientWidth`: sin sesión con el libro vacío y privacidad puesta; sin sesión con datos (`synthetic-v1`) y privacidad quitada; con sesión; con sesión en oscuro (monitor); sesión caducada (el reloj del servidor avanza 8 h); dispositivo olvidado; acceso denegado; página de error (`email_not_verified`). **21 de 21 sin desplazamiento lateral** (`medidas.json`).

**Lo que encontró mirar la pantalla** y ningún test había visto: **el *service worker* de la PWA respondía toda navegación con `index.html`**, así que con la PWA instalada `GET /api/auth/login` y la vuelta de Google **nunca llegaban a la Lambda** y la SPA pintaba «Aquí no hay nada». Arreglo en `30d48c6`: `navigateFallbackDenylist: [/^\/api\//]`, un test del guardián que lo exige en `vite.config.ts` y **una comprobación en `check-bundle.mjs` sobre el `sw.js` generado**, para que un cambio del *plugin* pare el *build*. Queda para E2: la página manual y la de reemisión también son navegaciones bajo `/api/`, ya cubiertas.

### 10.6 Desviaciones del plan, dichas

- **Los dobles** viven en `packages/adapters/test/{aws,identity}/test-only-*.ts` y el servidor local en `apps/api/test/support/`, no en `tests/support/api/`: los tests de los adaptadores y los de la API los comparten, y `apps/api/tsconfig.test.json` los incluye por ruta. El guardián de «ningún doble alcanzable» mira los dos sitios (patrón `test-only-` y carpetas `test/`).
- **La comprobación de la lista en cada petición con cookie es por el `sub`** (`subjectAllowed`): la cookie no lleva el correo (precisión de la dirección), así que el par entero se comprueba al emitir la sesión y en cada petición se pregunta que el `sub` siga teniendo entrada. Quitar la entrada cierra la sesión en la petición siguiente tras la caché. **Pregunta Q10** (§11).
- **`login_attempt_invalid`**, un código de página más (cookie del intento mal firmada, de otro `typ` o repetida), distinto de `login_attempt_missing` (ausente o caducada): no plegar dos casos. Escrito en `docs/api.md` §3.1 como «a confirmar».
- **`body_too_large` entra también en `REMOTE_FAILURE_CODES`**: las rutas de §5 pueden responderlo.
- **El `device_id` en IndexedDB** va bajo la clave `web:device_id` del almacén `ledger`, fuera de `sync:*`: iniciar sesión nunca configura la sincronización.
- **La API no tiene composición de producción** (`lambda.ts`): sin el SDK no hay nada que componer (Q4, pendiente del usuario).

### 10.7 Tubería y gemelos

`npm run lint`, `typecheck`, `test:coverage` (el dominio al 100 %) y `build` en verde sobre el commit congelado (salidas en `015-final-*.log` del *scratchpad*). Búsqueda de gemelos `.js` antes de cada lote y antes de la PR: ninguno. `git diff b3e2fcb -- tests/fixtures`: vacío (E1 no toca el libro ni la salida fiscal; la predicción fiscal es de E3).

## 11. Preguntas nuevas de E1

- **Q10 — La lista permitida en cada petición, por el `sub`.** Como ninguna cookie lleva el correo, en cada petición con cookie se comprueba que el `sub` de la sesión siga teniendo una entrada en la lista (§10.6). El par `{sub, email}` entero se comprueba al iniciar sesión. El caso que esto deja pasar: cambiar en la lista el correo de una entrada **manteniendo su `sub`** no cierra las sesiones vivas hasta que caducan (8 h). ¿Se acepta, o se quiere que la cookie lleve un hash del correo (no el correo) para comparar el par entero en cada petición?

## 12. Respuestas de la dirección (2026-09-26)

- **Q8: opción (a).** El código de la consola lleva **solo el `sub`**; en el canje, la API toma el correo de la lista permitida y **vuelve a comprobar el par entero**, y **se niega si el `sub` tiene dos entradas**. Se aplica en E2 (`data-model.md` §1.4 se pone al día al empezar E2).
- **Q9: se confirma el cuarto valor, `unreadable`**, de `details.reason` en `device_forgotten`.
- **P3 / Q4: el usuario autoriza instalar `@aws-sdk/client-s3`, `@aws-sdk/client-ssm` y `esbuild`, con la versión fijada, en E3**, y construir aquí el paquete de la Lambda. **No se instalan en E1.**
- **Q10**: pendiente.

## 13. E1 congelada (2026-09-26)

- **Commit congelado**: el que contiene esta sección (su SHA va en la PR de E1 y en el informe a la dirección). Desde aquí no se empuja nada a la rama mientras dura la revisión.
- **Tubería sobre él**: `lint`, `typecheck`, `test:coverage` (277 ficheros, 2.739 tests; el dominio al 100 % de líneas, ramas, funciones y sentencias) y `build` en verde; ningún gemelo `.js`; `git diff b3e2fcb -- tests/fixtures` vacío.
- **Paquete**: arranque 75.834 (techo 75.869), total 282.187 (techo 282.624).

## 14. Revisión de la PR #90, ronda 1: decisiones de la dirección y arreglos (2026-09-26)

Revisiones: corrección (`#issuecomment-5841582316`) y seguridad (`#issuecomment-5841596527`; «no encuentra ninguna forma de saltarse la autenticación»). Decisiones de la dirección del 2026-09-26, tal como llegaron, con el commit de cada arreglo, cómo se vio en rojo y qué se volvió a mirar.

### 14.1 De la revisión de corrección

- **B1 — el orden del techo.** No se reescribe la historia. §10.4 dice ahora la verdad: `d82e45a` no pasa el `build` y `f20c5bf` sube el techo después. **Lección para E2-E5: el techo se sube antes.**
- **B2 — importaciones dinámicas no literales** (`73c18d6`). El guardián prohíbe en **todo el producto** cualquier `import(` cuyo argumento no sea una cadena literal entre comillas simples o dobles: las comillas invertidas y las expresiones quedan fuera. Así, todo lo que leen los guardianes (el de P2 y P3, el de alcance, el del SDK, el de «nada lo alcanza») y el cálculo de lo que alcanza la web ven todas las importaciones. **Corregido el 2026-09-26 (ronda 2, B2-bis y B3): no era cierto.** El quitado de comentarios se rompía con un `//` dentro de una cadena (R7c), el guardián de P2 y P3 no leía `export … from` ni rutas relativas (R1, R3), y ningún guardián veía `require` (R4) ni `import.meta.glob` (R5): los cinco metían el cliente en el paquete con los guardianes en verde, y solo los paraba el techo. Lo que hay ahora, en §15. *Rojo:* **S10 sobrevivió** con el guardián anterior (`git stash` del test, lote `r1-b2.json`) y muere con el nuevo, igual que S10b (una variable) y S10c (comillas invertidas en la API).
- **N1 y S1 — un fallo inesperado del inicio de sesión** (`0f09f1c`). Cualquier error que nadie esperaba en `/api/auth/login` o en `/api/auth/callback` responde con **la página de error** (código de página nuevo, `internal`, `500`), que **borra la cookie del intento**. *Rojo:* tres tests en rojo antes del arreglo: un `putIfNoneMatch` que lanza un `Error` genérico, tres colisiones de identificador y una `session-key` mal formada, en la vuelta y en el inicio.
- **N2 — `Retry-After` en la página** (`0f09f1c`). La página de `remote_unavailable` lleva `Retry-After: 5`, como el JSON. *Rojo:* el test de «SSM falla durante un inicio de sesión» pidió la cabecera antes del arreglo.
- **N3 — para E3**: **la Lambda se niega a arrancar si la clave de sesión no mide 32 bytes.** Hoy no hay composición de producción. Se hará en la composición del SDK (E3): leer la clave al arrancar y construir el `Signer`, y si falla, no arrancar. Hasta entonces, una clave mal formada da la página `internal` o el `500`, nunca una firma débil.
- **N4 — el nivel del registro** (`5023f0d`). Un test exige `ERROR` en un 5xx, `WARN` en un 4xx e `INFO` en el resto. *Rojo:* el test se escribió contra el código tal cual, que ya ponía el nivel bien; **mata S4** (el nivel fijo en `INFO`), que sobrevivía.
- **N5 — `docs/api.md` al día** (`9518223`): `unreadable` confirmado (Q9), y «Quién implementa qué» va ahora antes de «Parámetros de SSM…», de modo que §8 precede a §9 (las referencias a §9 siguen valiendo). El comentario de `device.ts` y `data-model.md` §6 dicen «confirmado» (`b9e6750`).
- **N6 — las dos preferencias**: `presentedDeviceId` usa `isId22` (`8912a09`), y `/api/session` se atiende por su nombre y exige una admisión de sesión, mientras que una ruta de la tabla sin rama en el `switch` responde `404` en vez de caer en la de la sesión (`979d017`).

### 14.2 De la revisión de seguridad

- **S2 — el `device_id` presentado, solo desde el propio sitio** (`8912a09`). El inicio de sesión tiene en cuenta el `device_id` **solo si la petición viene del propio sitio**: `Sec-Fetch-Site: same-origin` u `Origin` propio (`fromOwnSite`, en el dominio). Desde otro sitio, o sin forma de saberlo, se ignora y el inicio sigue sin él (se asigna uno nuevo). La tarjeta de la web navega desde el propio origen, así que la envía el navegador. *Rojo:* un test del dominio y otro de la API, con `cross-site`, `same-site`, sin cabeceras y con un `Origin` ajeno, en rojo antes del arreglo. Mutantes S2a (desde cualquier sitio) y S2b (aceptar sin `Sec-Fetch-Site`): muertos.
- **S3 — la lista, por el `sub`, con cookie (Q10, aceptado)** (`9518223`). `docs/api.md` §2 y §7 lo dicen así: **con cookie, cada petición comprueba solo que el `sub` siga en la lista; retirar el acceso es quitar la entrada del `sub`, no cambiarle el correo**. El procedimiento de la cuenta robada ya dice «quitar el par de la lista», que es quitar la entrada: no hace falta tocarlo. El guion de secretos (017) lo tiene que decir igual (se añade a «Documentos»).
- **S4 — techos en la configuración** (`f18fa57`), fijos en el código, como el del token: sesión ≤ 24 h, cookie transitoria ≤ 30 min, cachés ≤ 1 h, código de la consola ≤ 15 min. Por encima, la configuración se rechaza (`above_ceiling`). *Rojo:* el test del dominio con cada techo y cada techo más uno, en rojo antes del arreglo. Mutantes S4-techo y S4-sesion: muertos.
- **S5 — los centinelas por los caminos de fallo** (`d39b8b1`): el proveedor caído, un token falsificado con los centinelas dentro (con un `kid` desconocido y con una firma que no es), un fallo de S3 en una petición y en una vuelta, y el `500` de un `Error` cuyo mensaje lleva los centinelas. El test comprueba además que cada camino se recorrió (`google_exchange_failed`, `id_token_invalid`, `dependency: s3`, `500`). Mutante S5 (registrar el mensaje saneado de un fallo del inicio de sesión): muerto.
- **La cookie duplicada** entra en la lista del primer despliegue (018) de `docs/decision-roadmap.md` (`7851269`): comprobar cómo entrega la Function URL las cookies, y si una misma cookie llega por las dos fuentes, decidir antes de seguir. El código sigue fallando cerrado (`session_invalid`, `repeated`).

### 14.3 Lo que se volvió a mirar alrededor

- Las **cuatro rutas** tras N1: el `catch` es común y el `switch` ya no tiene rama por defecto que atienda una ruta nueva (N6); el guardián de alcance sigue viendo la web entera tras B2.
- **Los lotes de mutación, enteros otra vez** sobre el árbol arreglado: **E1, 59 de 59 muertos** (los 51 de antes, con el ancla de M9a al día, más S4-nivel, N1, N2, S2a, S2b, S4-techo, S4-sesion y S5), y **guardianes, 18 de 18** (los 14 de antes, más S10, S10b, S10c y G-api-rel: el guardián de rutas relativas hacia `apps/api`, que la revisión señaló sin mutar). El árbol, igual antes y después de cada lote.

### 14.4 Tubería sobre el commit congelado de la ronda 1

| Orden | Código de salida | Nota |
|---|---|---|
| `npm run lint` | 0 | |
| `npm run typecheck` | 0 | |
| `npm run test:coverage` | 0 | 277 ficheros, 2.745 tests; el dominio al 100 % de líneas, ramas, funciones y sentencias |
| `npm run build` | 0 | arranque **75.834**, total **282.187**; sin cambio respecto del congelado anterior |

Ningún gemelo `.js`; `git diff b3e2fcb -- tests/fixtures` vacío. **Commit congelado de la ronda 1: el que contiene esta sección** (su SHA, en el comentario de la PR y en el informe a la dirección).

### 14.5 Documentos, añadidos

- **Guion de secretos (017)** y su procedimiento: retirar el acceso es quitar la entrada del `sub` de la lista (S3).
- **ADR-0027**: que la comprobación de cada petición con cookie es por el `sub` (Q10), y los techos de la configuración (S4).

## 15. Revisión de la PR #90, ronda 2: decisiones de la dirección y arreglos (2026-09-26)

Revisión: `#issuecomment-5842695728`, sobre `ed1bb11`. Decisiones de la dirección: `#issuecomment-5842719680`. Hechas en la máquina nueva, en `.claude/worktrees/015-api-access`, a partir de `ed1bb11`. El guion de mutación de §10.3 se perdió con la mudanza; se reescribió igual (`mutate-015.mjs` del *scratchpad*: afirma que cada sustitución ocurre las veces dichas, restaura y compara byte a byte, borra lo creado, compara `git status` antes y después y se niega a correr con gemelos `.js`), y además **exige el motivo**: un mutante solo cuenta como muerto si la salida contiene el mensaje del guardián que debe matarlo.

### 15.1 Mapa hallazgo → commit

| Hallazgo | Decisión de la dirección | Commit | Cómo se vio en rojo |
|---|---|---|---|
| **B2-bis y B3** — la prueba autoritativa | Leer el grafo real del paquete después de `vite build` | `d599174` (y `7959ede`, el test que lo mantiene en su sitio) | Los siete mutantes del lote del grafo, contra el `check-bundle.mjs` de `ed1bb11`: **ninguno** falla por el grafo; seis solo por el techo del total y R4 también por el del arranque (tabla de §15.3). Con el grafo, mueren todos por su regla |
| **B2-bis y B3** — los guardianes estáticos | Endurecerlos: sin `require(`, sin `import.meta.glob`, `export … from` leído, comentarios quitados sin romper con `//` en cadenas | `41c1c41` (y `3549059`, que solo recorre el árbol donde la construcción puede estar) | Los ocho mutantes del lote estático **sobreviven** los 60 tests de los dos guardianes sobre `ed1bb11`, y mueren con el nuevo |
| **§14.1, la afirmación de B2** | Corregirla | este commit | — |
| **T1** — ningún test sale a la red | `fetch` inyectado en `SessionCard`; un `fetch` global que falla en el entorno de la web | `3f26a6e`, `43fe27b`, `735422c` | `no-network*.test.ts`, en rojo sin el *setup* (Node: `Failed to parse URL`; happy-dom: `Failed to execute "fetch()"`); `session-card.test.tsx`, 2 de 3 en rojo sin la inyección |
| **T1**, lo que salió al repetirla | — | `0a47dd5`, `3549059`, `1987520` | Tres *timeouts* de 5 s en cuatro ejecuciones de la suite completa, ninguno de red, con la máquina cargada por otros proyectos (§15.5): la prueba de los precios del libro sintético, el guardián nuevo de `require` (recorría el árbol de cada fuente del producto: 2,5 s solo) y el de las columnas de la rejilla a 1024 px |
| **No bloqueante 1** — la política de origen | `Sec-Fetch-Site` y `Origin` a `/api/*` en `docs/api.md` §8 (fila de la 017) y en la lista de la 018 | `788389b` | — |
| **No bloqueante 2** — `docs/api.md:96` | La página `internal` con `500` | `788389b` | — |
| **No bloqueante 3** — los techos | `ATLAS_CLOCK_TOLERANCE_SECONDS` ≤ 3.600 y `ATLAS_RECENT_ISSUE_DAYS` ≤ 90, con tests | `54d79dd` | El test de los techos, con las dos filas nuevas, en rojo antes del arreglo (1 de 16) |

### 15.2 Qué se hizo

- **El grafo real del paquete** (`d599174`). Un *plugin* de `vite.config.ts` (`atlas-module-graph`, solo en `build`) escribe en `dist/.vite/atlas-modules.json` los módulos que Rolldown metió en cada trozo, con los bytes que cada uno aporta (`renderedLength`) y los nombres que el paquete usa de él (`renderedExports`). `check-bundle.mjs` lo lee y **para el *build*** con cualquiera de estas familias, se llegue por donde se llegue (un reenvío, una ruta relativa, `require`, `import.meta.glob`, una cadena):
  - **cargado siquiera en el grafo**: el cliente y la orquestación de la sincronización (`packages/adapters/{src,dist}/sync/` y `sync-http/`, hasta E4), las reglas del acceso (`domain/{src,dist}/access`), los adaptadores de Node de la API (`aws/`, `access/`, `identity/`), el SDK de AWS (`@aws-sdk`, `@smithy`, `@aws-crypto`), `apps/api` y `apps/cli`, un módulo de Node (`node:` o `__vite-browser-external`) y los dobles (`test/`, `tests/`, `test-only-`);
  - **con un byte en el paquete**: el motor del dominio de la sincronización. La puerta `@atlas/domain/sync` se carga para la pregunta de solo lectura del almacén de la sincronización, y con ella todo su motor, que Rolldown quita (0 bytes); solo `archive.ts`, `lines.ts` y `marker.ts` pueden aportar bytes, nombrados uno a uno;
  - **por nombre**: del almacén de la sincronización (`sync-store.ts`) el paquete solo puede usar `browserSyncConfigured`, `browserSyncPresence` y los nombres de las tres claves. `BrowserSyncStore`, el que escribe, no.
  - **Guardianes del guardián**: el grafo tiene que existir, tener la entrada y el dominio, describir **cada** trozo `.js` de la salida (salvo el *service worker*, que construye Workbox y que solo puede traer Workbox, y la línea de `registerSW.js`), y contener cada módulo que el *source map* de cada trozo nombra.
  - **Por qué `moduleIds` y no los *source maps***: un módulo que el árbol quita del todo no sale en el *source map* y sí en el grafo. Leer el grafo es más estricto: el motor del dominio aparece entero en él, y por eso esa familia se lee por bytes.
- **Los guardianes estáticos** (`41c1c41`) leen ahora cada fuente con **el analizador que ya trae Vite** (`parseSync`, de Oxc: ninguna dependencia nueva). Las importaciones, los reenvíos y las importaciones dinámicas salen del analizador, y los comentarios se quitan por los rangos que él da, así que un `//` dentro de una cadena no esconde nada. Tres reglas nuevas: **ni `require`, ni `createRequire`, ni `import.meta.glob`** (ni `import.meta` con clave calculada) en ningún fuente del producto; el guardián de P2 y P3 lee también los **`export … from`**, y trata como puerta **cualquier especificador que se resuelva a un fichero de las puertas**, no solo el nombre del paquete; y **la web no alcanza `packages/adapters/src/sync/` por ningún camino** (el alcance ya seguía rutas relativas y reenvíos). Una fuente que no se puede analizar hace fallar el guardián. Para no pagar el árbol de sintaxis de cada fuente (`3549059`), el de las importaciones dinámicas solo recorre las que el analizador dice que tienen alguna, y el de `require` solo las que tienen algún `import.meta` según el analizador o que escriben `require` como palabra, `createRequire` o un escape `\u` (un identificador puede escribirse con escapes: el mutante R4u lo prueba). Siguen siendo el aviso rápido: la prueba que decide es la del grafo.
- **T1** (`3f26a6e`, `43fe27b`, `735422c`). El proyecto `web` de Vitest carga `test/setup/no-network.ts`, que cambia el `fetch` global por uno que **falla al instante** con `fetch sin simular en un test: <método> <url>`; en happy-dom, `window` es el propio objeto global, así que cubre también `window.fetch` (lo comprueba `no-network.dom.test.ts`). `SessionCard` recibe `request` y lo pasa a `readSession` y a `signOut`; la aplicación no le da ninguno y usa el del navegador en cada llamada. **Lo visto en esta máquina**: la suite completa sobre `54d79dd` (`ed1bb11` más los techos, sin tocar la web) salió con 0, pero su registro trae cinco `ECONNREFUSED 127.0.0.1:3000`: la tarjeta salía a la red en cada test que pintaba Ajustes. En la máquina del revisor algo escuchaba en el puerto 3000 y respondía `404` (lo dice su registro). Por qué eso hacía fallar allí el test de los precios no lo he reproducido; lo que está visto es que la petición salía, y que tras el arreglo ya no sale: ningún `ECONNREFUSED` en los registros.
- **Documentos** (`788389b`): `docs/api.md` §3.1, la página de error del inicio de sesión con `400`, `403`, `500` o `503`, y «del inicio o de la vuelta»; `docs/api.md` §8, fila de la 017: la política de origen reenvía a `/api/*` `x-atlas-device-token`, `Sec-Fetch-Site` y `Origin`, y qué pasa sin ellas; `docs/decision-roadmap.md`, la 017 con las tres cabeceras y una comprobación más del primer despliegue de la 018 (dos inicios de sesión seguidos en `dev` conservan el `device_id`). Los techos nuevos, en `docs/api.md` §9 y `data-model.md` (`54d79dd`).

### 15.3 Mutantes

**Lote estático** (`guards-static-015.json`; orden: `vitest --project repo tests/api-access.test.ts tests/architecture.test.ts`): sobre los guardianes de `ed1bb11`, **0 de 8 muertos**; con `41c1c41`, **8 de 8**; y sobre el árbol final (`3549059`), con dos más, **10 de 10**.

| Id | Mutante | Lo mata |
|---|---|---|
| R1 | `apps/web/src/sync/relay.ts` con `export { initialiseRemote } from "@atlas/adapters/sync-client"`, importado por ruta relativa desde `SessionCard`, con uso vivo | P2 y P3 (el reenvío, leído por nombre) y el alcance |
| R1b | Igual con `export *` | P2 y P3 y el alcance |
| R3 | `initialiseRemote` desde `../../../../../../packages/adapters/src/sync/client` | P2 y P3 (resuelto a la puerta) y el alcance |
| R4 | `console.info(require("@atlas/adapters/sync-client"))` | «ni `require` ni `import.meta.glob`» |
| R5 | `import.meta.glob("…/packages/adapters/src/sync/client.ts", { eager: true })` | «ni `require` ni `import.meta.glob`» |
| R7c | ``["//", () => import(`@atlas/adapters/sync-client`)]`` | «solo con una cadena literal» |
| R6 | `BrowserSyncStore` por ruta relativa a `sync-store` | P2 y P3 (resuelto a la puerta) |
| R8 | `export { BrowserSyncStore } from "@atlas/adapters/sync"` en un reenvío | P2 y P3 (el reenvío, leído por nombre) |
| R4u | `require` escrito con un escape, `\u0072equire(…)` | «ni `require` ni `import.meta.glob`» |
| R5c | `import.meta["glob"](…)`, con clave calculada | «ni `require` ni `import.meta.glob`» |

**Lote de guardianes de la ronda 1, repetido** sobre los guardianes nuevos (`guards-r1-015.json`), con `41c1c41` y otra vez con `3549059`: **19 de 19 muertos** las dos veces: M8a, M8b, M12a-d, S10, S10b, S10c, G-api-reach, G-api-rel, G-double, G-sdk, G-google, G-lazy, G-barrel, G-dep, G-web-access y M11.

**Lote del grafo** (`guards-graph-015.json`; orden: `vite build && node scripts/check-bundle.mjs`, y el mutante solo cuenta como muerto si falla **con el mensaje de su regla**):

| Id | Mutante | Sobre `ed1bb11` | Con `d599174` |
|---|---|---|---|
| B-R1 | R1 | solo el techo (276,5 KB) | muerto: «el cliente o la orquestación» (`client.ts`) |
| B-R1b | R1b | — | muerto, ídem |
| B-R3 | R3 | solo el techo (276,5 KB) | muerto, ídem |
| B-R4 | R4 | solo los techos (arranque 76,8 KB; total 286,6 KB) | muerto, ídem |
| B-R5 | R5 | solo el techo (282,9 KB) | muerto, ídem |
| B-R7c | R7c | solo el techo (283,0 KB) | muerto, ídem |
| B-R6 | R6 | solo el techo (276,8 KB) | muerto: «usa `BrowserSyncStore`» y el motor con bytes |
| B-R8 | R8 | solo el techo (276,8 KB) | muerto, ídem |
| B-engine | `joinWithMine` de `@atlas/domain/sync` en la web | — | muerto: «el motor de la sincronización» |
| B-access | las reglas del acceso por ruta relativa | — | muerto: «las reglas del acceso» |
| B-distaccess | la puerta compilada del acceso, desde `dist/` | — | muerto, ídem |
| B-identity | el adaptador de Google | — | muerto: «un adaptador de Node de la API» |
| B-aws | `aws/errors.ts` | — | muerto, ídem |
| B-api | `apps/api/src/log.ts` | — | muerto: «la API o la consola» |
| B-node | `node:fs` | — | muerto: «un módulo de Node» |
| B-double | `packages/adapters/test/fake-idb.ts` | — | muerto: «un doble o código de test» |
| B-nograph | el *plugin* escribe el grafo con otro nombre | — | muerto: «no se ha podido leer el grafo» |
| B-nochunk | el grafo deja fuera el trozo de Ajustes | — | muerto: «no describe este chunk» |

**18 de 18 muertos.** *Dicho*: `@atlas/domain/access` por su nombre no llega a empaquetarse en la web: el alias `@atlas/domain` de `vite.config.ts` casa por prefijo y lo convierte en `index.ts/access`, y el *build* falla antes del guardián. Por eso B-access y B-distaccess entran por ruta.

**Lote de T1 y de los techos** (`r2-rest-015.json`): **10 de 11 muertos**. C-clock y C-recent (sin techo), C-clock+1 y C-recent+1 (el techo, uno más), S4-techo (sin comprobar techos) y S4-sesion (el de la sesión, doble) mueren con el test de los techos. T1-card (la tarjeta ignora su `fetch`), T1-signout (el cierre usa el global), T1-global (el *setup* no cambia el global) y T1-wiring (el proyecto `web` sin el *setup*) mueren con `no-network*` y `session-card`. **T1-window sobrevivió**: el *setup* cambiaba también `window.fetch`, y bajo happy-dom `window` **es** el objeto global (comprobado: `window === globalThis`). Era un mutante equivalente sobre una línea muerta; la línea se quitó (`735422c`) y el comentario lo dice.

El árbol, igual antes y después de cada mutante (`git status` comparado). Ningún gemelo `.js` antes de cada lote.

### 15.4 El paquete web

Sin subida de techo. Medido con la regla de `check-bundle.mjs`: **arranque **75.843** (techo 75.869), total **282.280** (techo 282.624)**. Contra `ed1bb11` construido en esta máquina (75.834 y 282.187, lo mismo que en la anterior): el total sube **+93**, de ellos **+25** en `ajustes` (la inyección del `fetch`) y el resto ruido de *hashes*; el arranque sube **+9**, todo en la tabla de precargas de la entrada (`index`), sin código nuevo en él. El grafo va a `dist/.vite/atlas-modules.json`, que no cuenta: no es `.js` ni `.css`.

### 15.5 Tubería

Sobre `1987520`, el último commit de código (el congelado solo añade esta sección y la corrección de §14.1, que ningún test lee), en esta máquina, con 6 núcleos y otros proyectos compilando y probando a la vez (carga media entre 8 y 15):

| Orden | Código de salida | Nota |
|---|---|---|
| `npm run lint` | 0 | |
| `npm run typecheck` | 0 | |
| `npm run test:coverage` | 0 | 280 ficheros, 2.753 tests, 491 s; el dominio al 100 % de líneas, ramas, funciones y sentencias; ningún `ECONNREFUSED` en el registro |
| `npm run test:coverage`, otra vez, seguida | 0 | 280 ficheros, 2.753 tests, 487 s; el dominio al 100 %; ningún `ECONNREFUSED` |
| `npm run build` | 0 | arranque 75.843, total 282.280 |

**Lo que costó llegar ahí, dicho.** La suite completa sobre `54d79dd` en esta máquina salió con 0 (5 min), con cinco `ECONNREFUSED 127.0.0.1:3000` en el registro: T1 existía, y aquí no se notaba porque nadie escuchaba en el puerto 3000. Con el arreglo, la suite se ejecutó seis veces más: sobre `735422c`, 1 y 0 (la prueba de los precios del libro sintético pasó de 5 s); sobre `0a47dd5`, 1 y 1 (el guardián nuevo de `require` y la rejilla a 1024 px pasaron de 5 s); sobre `1987520`, 0 y 0. Los tres fallos son *timeouts* del plazo por defecto de Vitest con la máquina cargada; ninguno es de red ni de lógica. Los tres tests reciben su plazo, como las suites de propiedades que ya lo tenían (`0a47dd5`, `1987520`), y el guardián de `require` deja de recorrer lo que no hace falta (`3549059`: de 2,5 s a 0,15 s). **Si la dirección prefiere otro remedio para los plazos** —un `testTimeout` global en `vitest.config.ts`, por ejemplo—, es una línea; no lo he tocado porque es configuración de la herramienta.

Ningún gemelo `.js` antes de cada lote ni antes de cada ejecución. `git diff ed1bb11 -- tests/fixtures`: vacío.

### 15.6 Documentos, añadidos

- **017**: el despliegue deja fuera de lo que sirve CloudFront `dist/.vite/` (el grafo de módulos, como el manifiesto de Vite) y, si la dirección lo prefiere, los `*.map`. Hoy los *source maps* ya llevan las rutas de los fuentes, así que el grafo no enseña nada nuevo; pero no hace falta servirlo.
- **Nada más**: las tres cabeceras y la comprobación de la 018 ya están escritas (`788389b`).

### 15.7 Congelado

**Commit congelado de la ronda 2: el que contiene esta sección** (su SHA, en el comentario de la PR y en el informe a la dirección). Desde aquí no se empuja nada a la rama mientras dura la revisión.

## 16. Revisión de la PR #90, ronda 3: decisiones de la dirección y arreglos (2026-09-26)

Revisión: `#issuecomment-5843549502`, sobre `85b5a87`. No convergió por **CI-1**: la CI `verify` de `85b5a87` salió en rojo por la cobertura de ramas del dominio en `packages/domain/src/ecb/propose.ts:95`. Además, (b) y (c) quedaron sin verificar. Decisiones de la dirección (2026-09-26), tal como llegaron:

1. **CI-1**: un test determinista que cubra esa rama. Además, ejecutar la cobertura del dominio **sin** las suites de propiedades y cubrir con tests fijos lo que falte. El 100 % no puede depender de la semilla. En su propio commit.
2. **Las cuatro vías de elusión** que apunta el revisor, cada una con su mutante, visto primero sobrevivir y después morir:
   - `?worker&inline` y los *workers*;
   - `?raw` y `?url`;
   - `new URL("…", import.meta.url)`;
   - alias o `node_modules/@atlas/…`.
3. **Plazos**: bajarlos a 30 s en los tests de `0a47dd5` y `1987520`.

### 16.1 Mapa hallazgo → commit

| Hallazgo | Commit | Cómo se vio en rojo |
|---|---|---|
| CI-1: las ramas que solo cubría una propiedad aleatoria | `99b0b9a` | El mutante C-residue sobrevive a los tests fijos de su fichero sin el test nuevo, y muere con él (§16.4) |
| Vías de elusión: *workers*, consultas, ficheros emitidos y alias | `69ac13a`, y `f1d52f0` (el test que lo mantiene en su sitio) | V1, V2, V3 y V4 sobreviven al guardián de `85b5a87`. V1b y V1c solo los paraba «no describe este chunk», no una regla. Con el arreglo mueren todos por su regla (§16.4) |
| Plazos a 30 s | `9d2f80b` | — |

### 16.2 CI-1: lo medido

- **Cómo se buscó.** Se ejecutó la suite entera con un sustituto inerte de `fast-check`: un alias de Vitest que convierte `fc.assert` en una operación vacía y cada arbitrario en un objeto que no hace nada. El sustituto y su configuración se quedan en el *scratchpad* (`noprops-015/`); no entran en el repositorio ni en ninguna dependencia. Cuatro tests fallan, como se esperaba, porque exigen que la propiedad haya recorrido libros, pero la cobertura se informa igual.
  - **Solo el proyecto `domain`**: faltan líneas o ramas en `ecb/drafts.ts`, `ecb/rule-change.ts`, `filings/closed-years.ts`, `filings/proposal.ts`, `informative/m720.ts`, `projections/contribution.ts`, `projections/primitives.ts` y `usecases/preview-event.ts`.
  - **La suite entera, como la mide `test:coverage`**: los tests fijos de la consola y de la web cubren todo eso salvo una cosa. **Solo queda `projections/contribution.ts`, líneas 113 (una rama) y 120-121**: el caso en que el redondeo deja un residuo positivo que va entero a la primera fila. Solo lo alcanzaba la propiedad aleatoria de la aportación.
  - **Arreglo** (`99b0b9a`): un test fijo. Cuatro activos iguales en su objetivo y un céntimo que repartir: cada fila redondea a cero y el céntimo va a `ast_a`. Sin propiedades, `contribution.ts` queda al 100 %.
- **`propose.ts:95` no es de las propiedades.** Con las propiedades inertes, `propose.ts` sigue al 100 %. Lo cubren tests fijos: el proyecto `domain` con las propiedades inertes pasa por las dos ramas del `if` 6 y 5 veces, y `propose.test.ts` él solo, 5 y 2 (medido por la ronda 4). En la suite entera las dos ramas suman 239 y 72 pasadas. Ninguna suite de propiedades toca el BCE. Así que **la premisa de la decisión 1 de la dirección («la cubre a veces una propiedad aleatoria») no se sostiene con lo medido**, y un test fijo más no la cambiaría: ya lo hay. No he añadido uno redundante. *Corregido el 2026-09-26 (§17): aquí se atribuía esa premisa a la ronda 3, que no la afirmó («No he buscado la causa»); venía de la decisión de la dirección. Y las 239 y 72 pasadas se atribuían a la web y a la consola: son de la suite entera.*
- **Qué la pudo dejar sin cubrir en la CI: no lo he averiguado.** La hipótesis, sin verificar, es que la fusión de la cobertura V8 de un mismo fichero cargado por varios proyectos y procesos pierda recuentos de bloque según el orden en que llegan. En la CI, con otros núcleos, el reparto cambia de una ejecución a otra. **No demostrado**: la PR añade el proyecto `api` y un `setupFiles` en `web`, que cambian qué procesos cargan el dominio, y ese es justo el mecanismo sospechoso (*corregido el 2026-09-26, §17: antes decía «sería de Vitest o de V8, no de la PR»*). Lo que hay:
  - de las últimas 40 ejecuciones de `verify`, dos fallaron;
  - esta falló en cobertura;
  - en esta máquina, las cuatro ejecuciones completas en verde de la ronda 2 sacaron el dominio al 100 %, igual que las dos del revisor sobre `85b5a87`.
  Si vuelve, lo propio es aislarla con `coverage-final.json` de la CI, no con más tests. Desde la ronda 4, la CI lo sube como artefacto cuando falla (§17).

### 16.3 Las vías de elusión, cerradas

- **Los *workers*** (`69ac13a`). El *plugin* del grafo es ahora una fábrica, `moduleGraph("main" | "worker")`, y va también en `worker.plugins`. Cada *build* de un *worker* deja su grafo, con la entrada de cada trozo, y el principal lo escribe todo en `dist/.vite/atlas-modules.json` (`workers`). `check-bundle.mjs` pasa las reglas por todos los grafos. Además, **falla si el grafo principal importa un `?worker` o un `?sharedworker` sin un grafo de *worker* cuya entrada sea ese fichero**: con `inline` no queda un `.js` suelto que avise.
- **`?raw` y `?url`.** El identificador llega **sin la consulta**, que va aparte y solo se usa para enseñarlo y para detectar *workers*. Las reglas comparan la ruta.
- **Todos los ficheros emitidos.** `check-bundle.mjs` repasa ahora cada fichero de `dist/`, no solo los `.js`. Un fuente (`.ts`, `.tsx`, `.mts`, `.cts`, `.jsx`) nunca se sirve. Cada fichero tiene que estar descrito por alguno de estos:
  - un trozo o un recurso de algún grafo; los recursos llevan sus ficheros de origen (`originalFileNames`), que pasan por las mismas reglas;
  - un *source map* de uno de ellos;
  - un fichero de `public/`;
  - uno de los que se escriben después del grafo, nombrados uno a uno: la página, el manifiesto y el *service worker*.
- **Alias y enlaces simbólicos.** El *plugin* aplica `realpath` a cada identificador y a cada origen, relativo a la raíz real del repositorio. Así ningún alias, ningún `preserveSymlinks` y ningún `node_modules/@atlas/…` disfrazan un fichero de un paquete. Las reglas ya no van ancladas al principio. Como defensa en profundidad, además:
  - un identificador que después de `realpath` sigue en `node_modules/@atlas/` se niega («un paquete del repositorio por node_modules»);
  - también uno de fuera del repositorio.

### 16.4 Mutantes

Con el guion de §15: un mutante solo cuenta como muerto si falla **con el mensaje de su regla**. Los mutantes de las vías suben los dos techos del paquete dentro del propio mutante. Así, «sobrevive» significa que el *build* sale con 0, y el techo no tapa nada.

| Id | Mutante | Sobre `85b5a87` (el guardián de la ronda 2) | Con `69ac13a` |
|---|---|---|---|
| V1 | Un *worker* `?worker&inline` que importa `@atlas/adapters/sync-client` | **sobrevive** (sale con 0) | muerto: `worker 1: … el motor de la sincronización`, `… el cliente o la orquestación` |
| V1b | Igual, con `?worker` | lo para solo «no describe este chunk» | muerto, ídem |
| V1c | `new Worker(new URL("…/w.ts", import.meta.url))` | lo para solo «no describe este chunk» | muerto, ídem |
| V2 | `import … from "…/domain/src/access.ts?raw"` | **sobrevive** | muerto: «las reglas del acceso» |
| V2b | `import … from "…/adapters/src/sync/client.ts?url"` | muerto (el patrón no iba anclado al final) | muerto |
| V3 | `new URL("…/adapters/src/sync/client.ts", import.meta.url)` | **sobrevive**: `assets/client-*.ts` servido | muerto: «el bundle lleva un fuente» y la regla del cliente sobre el origen del recurso |
| V4 | Alias `@atlas/relay` → `node_modules/@atlas/adapters/src/aws/errors.ts` con `preserveSymlinks: true` | **sobrevive** | muerto: «un adaptador de Node de la API» |
| V4b | El mismo alias, sin `preserveSymlinks` | muerto (Vite ya resolvía el enlace) | muerto |
| G3-noworker | V1, con el *plugin* fuera de `worker.plugins` | — | muerto: «crea un worker cuyo grafo no se conoce» |
| G3-noworker-b | V1b, ídem | — | muerto: «no describe este chunk» |
| G3-norealpath | V4, con el `realpath` del *plugin* quitado | — | muerto: «un paquete del repositorio por node_modules» |
| G3-stray | Un fichero escrito en `dist/` después del grafo | — | muerto: «ningún grafo dice de dónde sale» |
| C-residue-before | `contribution.ts`: el residuo positivo se pierde, sin el test nuevo (solo los tests fijos de su fichero) | **sobrevive** | — |
| C-residue | Ídem, con el test nuevo | — | muerto |

- **Resultado**: V1-V4b, 8 de 8 muertos. De los que sobrevivían o solo paraba la cobertura, 6 de 6. G3, 4 de 4. C-residue, 1 de 1.
- **Lotes anteriores**: el del grafo de la ronda 2, repetido sobre `69ac13a`, 18 de 18. Los estáticos (§15.3) no cambian: `tests/api-access.test.ts` solo añade comprobaciones de texto al test que mantiene el guardián.
- El árbol, igual antes y después de cada mutante. Ningún gemelo `.js`.

### 16.5 Plazos (`9d2f80b`)

`proofs.test.ts` («deletes every price of the synthetic ledger…») y `grid-spans.test.tsx` bajan de 60 s a **30 s**. Son unas seis veces lo que miden, así que cubren la carga y siguen avisando si se vuelven mucho más lentos. El tercer *timeout* de la ronda 2, el guardián de `require`, no llevaba plazo: se arregló haciéndolo más rápido (`3549059`).

### 16.6 Tubería y CI

Sobre `f1d52f0`, el último commit de código. El congelado solo añade esta sección a `questions.md`, que ningún test lee.

| Orden | Código de salida | Nota |
|---|---|---|
| `npm run lint` | 0 | |
| `npm run typecheck` | 0 | |
| `npm run test:coverage` | 0 | 280 ficheros, 2.754 tests, 443 s; el dominio al 100 % (ramas 4.566/4.566, líneas 7.523/7.523); ningún `ECONNREFUSED` |
| `npm run test:coverage`, repetida a continuación | 0 | 280 ficheros, 2.754 tests, 444 s; el dominio al 100 %; ningún `ECONNREFUSED` |
| `npm run build` | 0 | Arranque 75.843 y total 282.280, sin cambio; ningún techo tocado |
| La suite con las propiedades inertes (§16.2) | 1, por los cuatro tests que exigen que la propiedad recorra libros | **Ningún fichero del dominio con una línea, una rama o una función sin cubrir** |

**CI `verify` en GitHub**: verde sobre `9d2f80b` (36221656013) y sobre `f1d52f0` (36222119247). La del congelado se comprueba después de empujarlo y va en el comentario de la PR.

Ningún gemelo `.js`. `git diff ed1bb11 -- tests/fixtures` vacío.

### 16.7 Congelado

**Commit congelado de la ronda 3: el que contiene esta sección.** Su SHA va en el comentario de la PR y en el informe a la dirección. Desde aquí no se empuja nada a la rama mientras dura la revisión.

## 17. Revisión de la PR #90, ronda 4: decisiones de la dirección y arreglos (2026-09-26)

Revisión: `#issuecomment-5843896025`, sobre `787441b`. Queda un solo bloqueante: **V3-inline**. Un fuente vetado de menos de 4 KiB, alcanzado con `new URL("…", import.meta.url)`, se incrusta en un trozo como `data:video/mp2t;base64,…` y no se emite como fichero. Así pasa por fuera de todos los grafos. Decisiones de la dirección (2026-09-26), tal como llegaron:

1. **Cerrar V3-inline**:
   - `build.assetsInlineLimit` pasa a ser una función que **nunca** incrusta un fuente de código y deja lo demás como lo hace Vite;
   - `check-bundle.mjs` falla si un trozo lleva una URL `data:` con un tipo MIME de código;
   - mutantes V3b (`aws/errors.ts`) y V3c (`access/id-token.ts`), vistos sobrevivir sobre `787441b` y después morir;
   - el tamaño del *build* limpio, medido.
2. **CI**: cuando `test:coverage` falle, subir `coverage/coverage-final.json` como artefacto (`actions/upload-artifact`, `if: failure()`).
3. **§16**: corregir la atribución de la premisa de CI-1 y rebajar «no viene de la PR».

### 17.1 Mapa hallazgo → commit

| Hallazgo | Commit | Cómo se vio en rojo |
|---|---|---|
| V3-inline: nunca incrustar código y negar las URL `data:` de código | `45b2bc4`, y `4b7be16` (el test que lo mantiene en su sitio) | V3b y V3c **sobreviven** sobre `787441b`: el *build* sale con 0 y `index-*.js` lleva `data:video/mp2t;base64`. Con el arreglo mueren (§17.3) |
| CI: el informe de cobertura como artefacto | `06a7dbc` (el informe `json`); el paso de la CI, **sin empujar** (§17.2) | — |
| §16.2 corregido | el commit congelado | — |

### 17.2 Qué se hizo

- **`assetsInlineLimit`** (`45b2bc4`) es una función que devuelve `false` para `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs` y `.cjs`, también con consulta, y `undefined` para lo demás, que conserva el límite por defecto de Vite. Un fuente alcanzado con `new URL` sale entonces como fichero, y lo niegan las reglas de la ronda 3: «el bundle lleva un fuente» y la regla de su origen.
- **`check-bundle.mjs`** busca en cada fichero de texto de `dist/` una URL `data:` con un tipo de código: `video/mp2t` (el que recibe `.ts`, porque la extensión es también la de MPEG-TS), `text/` o `application/` con `javascript`, `ecmascript`, `typescript`, `jsx`, `tsx` o `babel`, con o sin `x-`, `text/jsx` y `application/node`. Si la encuentra, para el *build*. Son dos capas, y cada una mata el mutante sola: G4-nolimit y G4-nodata.
- **El *build* limpio no cambia de tamaño**: arranque 75.843 y total 282.280, byte a byte igual que en `787441b`. El paquete no llevaba nada incrustado de código ni de otro tipo. Las únicas coincidencias de `data:` eran `data:d` dentro del código de `@solidjs/router`, sin URL.
- **La CI.** El paso está escrito:

  ```yaml
  - uses: actions/upload-artifact@v4
    if: failure()
    with:
      name: coverage-final
      path: coverage/coverage-final.json
      if-no-files-found: ignore
      retention-days: 14
  ```

  Va justo después de `npm run test:coverage`, y fija la versión mayor como las demás acciones del fichero (`@v4`). **No he podido empujarlo**: GitHub rechaza el empuje porque la credencial de esta máquina no tiene el permiso `workflow` («refusing to allow an OAuth App to create or update workflow `.github/workflows/ci.yml` without `workflow` scope»). Cambiar los permisos de la credencial no me corresponde. El cambio queda así:
  - en el *scratchpad*, como parche (`ci-upload-artifact-015.patch`);
  - en el *stash* del worktree (`ci-015-upload-artifact`).

  Lo tiene que empujar alguien con ese permiso: el usuario, o `gh auth refresh -s workflow` y un empuje. **Lo que sí va en la rama** (`06a7dbc`): `vitest.config.ts` escribe también el informe `json`. Sin él no habría `coverage/coverage-final.json` que subir, porque los informes eran `text` y `html`. Comprobado: una ejecución que falla por los umbrales lo escribe igual.

### 17.3 Mutantes

Con el guion de §15. Cada mutante sube los techos del paquete dentro de sí mismo, y solo cuenta como muerto si falla con el mensaje de su regla.

| Id | Mutante | Sobre `787441b` | Con `45b2bc4` |
|---|---|---|---|
| V3b | `new URL("../../../packages/adapters/src/aws/errors.ts", import.meta.url)` en `main.tsx` | **sobrevive**: `data:video/mp2t;base64` en `index-*.js` | muerto: «el bundle lleva un fuente» y «un adaptador de Node de la API» sobre `assets/errors-*.ts` |
| V3c | Lo mismo con `packages/domain/src/access/id-token.ts` | **sobrevive** | muerto: «las reglas del acceso» y «el bundle lleva un fuente» |
| G4-nolimit | V3b con `assetsInlineLimit` quitado | — | muerto: «lleva código incrustado como URL data: (data:video/mp2t;)» |
| G4-nolimit-c | V3c, ídem | — | muerto, ídem |
| G4-nodata | V3b con la regla de las URL `data:` desactivada | — | muerto: «el bundle lleva un fuente» |

5 de 5 muertos, y las dos vías vistas sobrevivir antes. El árbol, igual antes y después de cada mutante.

### 17.4 Tubería y CI

Sobre `06a7dbc`, el último commit de código. El congelado solo cambia `questions.md`, que ningún test lee.

| Orden | Código de salida | Nota |
|---|---|---|
| `npm run lint` | 0 | |
| `npm run typecheck` | 0 | |
| `npm run test:coverage` | 0 | 280 ficheros, 2.754 tests, 361 s; el dominio al 100 % (ramas 4.566/4.566); ningún `ECONNREFUSED` |
| `npm run test:coverage`, repetida a continuación | 0 | 2.754 tests, 488 s; el dominio al 100 %; ningún `ECONNREFUSED` |
| `npm run build` | 0 | Arranque 75.843 y total 282.280: los mismos que en `787441b` |

**CI `verify` en GitHub**: verde sobre `06a7dbc` (36224021137). La del commit congelado se comprueba después de empujarlo y va en el comentario de la PR. Ningún gemelo `.js`.

### 17.5 Congelado

**Commit congelado de la ronda 4: el que contiene esta sección.** Su SHA va en el comentario de la PR y en el informe a la dirección. Desde aquí no se empuja nada a la rama mientras dura la revisión.

## 18. E2 — bloque 0: las verificaciones, con su fuente (2026-09-26)

E1 quedó fusionada en `develop` (PR #90, `490f0e1`); la rama sigue desde ahí. Las páginas se consultaron el 2026-09-26 (hora de Madrid) con `curl` o leídas como texto; las citas son literales. Antes del primer commit de código de E2.

### 18.1 Punto 1 — `PutParameter` sin `Overwrite` ante dos peticiones simultáneas

**Fuente**: la referencia de la API, `https://docs.aws.amazon.com/systems-manager/latest/APIReference/API_PutParameter.html`.

**Lo que dice**:

- `Name`: «A parameter name must be unique within an AWS Region».
- `Overwrite`: «Overwrite an existing parameter. The default value is `false`.»
- Error `ParameterAlreadyExists`: «The parameter already exists. You can't create duplicate parameters.» (HTTP 400).
- Error `TooManyUpdates`: «There are concurrent updates for a resource that supports one update at a time.» (HTTP 400).

**Lo que no dice**: ninguna frase habla literalmente de dos `PutParameter` sin `Overwrite` **a la vez** sobre el mismo nombre. Lo que se sostiene es una deducción de tres afirmaciones documentadas: el nombre es único, sin `Overwrite` un parámetro existente no se sustituye nunca, y un parámetro «admite una actualización a la vez» y rechaza las concurrentes. De ahí, **como mucho una creación gana**; la otra recibe `ParameterAlreadyExists` (si llega después) o `TooManyUpdates` (si se cruzan). Buscado también en re:Post y en las incidencias del proveedor de Terraform: nada contradice esto ni lo afirma con más precisión.

**Decisión de implementación, dentro de lo decidido**: el adaptador traduce `ParameterAlreadyExists` a «ya existe» (`409 console_code_used`) y `TooManyUpdates` a un fallo transitorio (`503 remote_unavailable`, se puede reintentar): si la otra creación ganó, el reintento da `console_code_used`; si ninguna ganó, el reintento crea. **Ninguno de los dos caminos deja dos tokens con el mismo `token_id`.** El doble de SSM imita las dos respuestas.

**No paro E2**, porque la garantía que pide ADR-0033 (el uso único) se sigue de lo documentado. **Pero lo digo para la dirección**: si exige una cita literal sobre la concurrencia, no la hay, y la regla del encargo («si no lo es, para») se tendría que decidir con esta deducción delante. **Queda como pregunta Q11** (§19).

### 18.2 Punto 2 — etiquetas al crear

**Fuentes**:

- la misma referencia, parámetro `Tags`: «Optional metadata that you assign to a resource. […] To add tags to an existing Systems Manager parameter, use the AddTagsToResource operation.»;
- `https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-ssm-parameter.html`, nota: «To create an SSM parameter, you must have the AWS Identity and Access Management (IAM) permissions ssm:PutParameter and ssm:AddTagsToResource.»;
- `https://docs.aws.amazon.com/cli/latest/reference/ssm/put-parameter.html`, `--tags`: el mismo texto.

**Conclusión**: `PutParameter` **admite `Tags` al crear**; no hay restricción de nivel (un `SecureString` estándar vale). Etiquetar al crear **exige además `ssm:AddTagsToResource`** sobre el recurso (la nota de CloudFormation; la tabla de acciones de IAM se sirve con JavaScript y no se pudo leer como texto). Las etiquetas solo se ponen **al crear**: la revocación sobrescribe con `Overwrite` y sin `Tags`, y las conserva (las etiquetas son del recurso, no de la versión).

**Hecho**: la API crea los registros con `project=atlas` y `env=<entorno>`. **Para la 017 y ADR-0034 (fila 9)**: el rol de la API necesita `ssm:AddTagsToResource` sobre `/atlas/<entorno>/device-tokens/*` (plan §10 ya lo preveía «solo si»; ahora es «sí»).

### 18.3 Punto 3 — `GetParameter` con selector

**Fuente**: `https://docs.aws.amazon.com/systems-manager/latest/APIReference/API_GetParameter.html`.

- `Name`: «To query by parameter label, use `"Name": "name:label"`. To query by parameter version, use `"Name": "name:version"`.»
- Errores: `ParameterNotFound` («The parameter couldn't be found») y `ParameterVersionNotFound` («The specified parameter version wasn't found»).
- La respuesta lleva `Selector` y `Version`.

**El doble** (`test-only-fake-ssm.ts`) guarda **todas las versiones** de cada parámetro y resuelve `nombre:<n>` a la versión `n` y `nombre:<etiqueta>` a la versión etiquetada, como SSM. Así el mutante de B1 (construir el nombre sin validar el `token_id`, con `<id>:1` para leer la versión anterior a la revocación) muere contra el doble y no contra un supuesto.

### 18.4 Punto 4 — la vuelta a `http://127.0.0.1` y *Local Network Access*

**Fuentes**:

- `https://developer.chrome.com/blog/local-network-access` (9 de junio de 2025; lanzamiento en Chrome 142): el permiso se pide para «requests initiated using the JavaScript `fetch()` API, subresource loading, and subframe navigation». **Las navegaciones de primer nivel no están en la lista.**
- El *explainer* del WICG, `https://github.com/WICG/local-network-access/blob/main/explainer.md`, sección «Potential future changes» → «Top-level navigations to local network»: «Top-level navigations remain a risk after restrictions on subresource local network requests are in place». Es **trabajo futuro**, fuera del alcance actual.
- Desde Chrome 146 el permiso se parte en «Local Network» y «Loopback Network» (resultados de búsqueda de fuentes secundarias; no cambia lo anterior).

**Conclusión, con fuente**: el `302` de la vuelta de Google a `http://127.0.0.1:<puerto>/callback` es una **navegación de primer nivel** y **hoy no la restringe** *Local Network Access*. La página que sirve la consola no carga nada, así que no dispara ningún subrecurso local. **Riesgo escrito**: si Chromium extiende LNA a las navegaciones (el *explainer* lo contempla), la variante `--manual` sigue funcionando, porque no navega a `127.0.0.1`.

**La prueba en el navegador real del usuario se aplaza a la 018** (§7 P14). El procedimiento, preparado:

1. En WSL, en una carpeta cualquiera: `node -e 'require("http").createServer((q,s)=>{s.end("LOOPBACK-OK "+q.url)}).listen(49321,"127.0.0.1")'`.
2. En Windows, abrir en el navegador de siempre (Chrome o Edge) cualquier página pública https que redirija; basta con escribir en la barra `https://httpbin.org/redirect-to?url=http%3A%2F%2F127.0.0.1%3A49321%2Fcallback%3Fcode%3Dx%26state%3Dy`.
3. **Anotar**: si la pestaña enseña `LOOPBACK-OK /callback?code=x&state=y`; si el navegador pidió algún permiso («acceder a dispositivos de tu red local» o parecido); la versión del navegador (`chrome://version`) y el modo de red de WSL (`wsl --status` o `.wslconfig`).
4. Parar el servidor con Ctrl+C.

### 18.5 Punto 5 — `Content-Security-Policy: sandbox` y la página del código

**Fuentes**:

- HTML, `https://html.spec.whatwg.org/multipage/browsers.html#sandboxed-origin-browsing-context-flag`: «The sandboxed origin browsing context flag: This flag forces content into an opaque origin, thus preventing it from accessing other content from the same origin», y se pone «unless the tokens contains the `allow-same-origin` keyword».
- CSP 3, `https://www.w3.org/TR/CSP3/`: `sandbox` no se admite en `<meta>` ni en modo de solo informe; va en la cabecera, como la envía la Lambda.

**La prueba en Chromium de verdad** (Chrome for Testing 153.0.8010.12, `~/.cache/ms-playwright/chromium-1243`, conducido por el protocolo de DevTools con el `WebSocket` de Node 22, desde el *scratchpad*: `sandbox-probe-015.mjs`; sin instalar nada). Un servidor local sirve en el **mismo origen** una SPA con *script* y la página del código con dos variantes: solo `sandbox`, y la cabecera real (`default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox`, más `no-store` y `no-referrer`). Salida literal:

```
a contentDocument=null | threw:SecurityError | threw:SecurityError
b contentDocument=null | threw:SecurityError | threw:SecurityError
popup-null
origin seen by the page: null
details open before: false
code visible before (innerText): false
details open after a click: true
code visible after (innerText): true
```

- La SPA **no puede leer** la página del código: ni su documento ni su `location` (`SecurityError`), tanto con solo `sandbox` como con la cabecera real; abrirla en una ventana sin gesto del usuario la bloquea el navegador.
- La página tiene **origen opaco** (`null`).
- El `<details>` **se despliega** dentro del *sandbox* con un clic real del ratón, sin *script*: antes el código no es texto visible; después, sí.

**Nota de método**: en esta máquina Chromium solo arranca con `--no-sandbox` (el *sandbox* del proceso, que AppArmor no deja crear sin espacios de nombres de usuario); no tiene que ver con la `sandbox` de CSP, que es la que se prueba, y solo se cargaron páginas del servidor local de la prueba.

**Conclusión**: la variante manual **sigue**.

### 18.6 Punto 6 — WSL en modo NAT y abrir el navegador desde WSL

**Fuente**: `https://learn.microsoft.com/en-us/windows/wsl/networking` (actualizada el 2026-06-02), «Default networking mode: NAT» → «Accessing Linux networking apps from Windows (localhost)»: «If you are building a networking app […] in your Linux distribution, you can access it from a Windows app (like your Edge or Chrome internet browser) using `localhost` (just like you normally would).» Y en modo *mirrored*: «the Windows host and WSL2 VM can connect to each other using `localhost` (127.0.0.1)».

**Lo que no dice**: si en modo NAT el reenvío de `localhost` escucha también en el literal `127.0.0.1` de Windows (y no solo en `::1`), que es a donde redirige la Lambda. **Sin verificar**; entra en el procedimiento de §18.4 (paso 3, anotar el modo de red). Si falla, `--manual` lo cubre. **Abrir el navegador desde WSL no es un requisito**: la consola **imprime siempre la URL** e intenta abrirla sin depender de ello.

### 18.7 Punto 7 — el valor de `amr`

Sin objeto: Q2 decidió no emitir `mfa_required` (§8).

### 18.8 Q8 aplicada

El código de la consola lleva **solo el `sub`** (§12, Q8 (a)): `data-model.md` §1.4 está al día. En el canje, la API toma el correo de la lista permitida por ese `sub` y vuelve a comprobar el par entero; si el `sub` tiene dos entradas, se niega (`403 not_allowed`, `details.reason: "ambiguous_subject"`).

## 19. Preguntas nuevas de E2

- **Q11 — La atomicidad de `PutParameter` sin `Overwrite`** (§18.1): documentada por deducción, no con una frase literal. E2 sigue con ella. ¿Basta, o se quiere una segunda barrera que no dependa de SSM (por ejemplo, una escritura condicional de S3 por `token_id`, con su prefijo nuevo y su permiso en la 017)?

## 20. E2 — el token de dispositivo de la consola (2026-09-26)

E1 quedó fusionada en `develop` (PR #90, `490f0e1`). La ronda 5 convergió. E2 sigue el encargo §3 E2, §7.1 y §7.1 bis, y lo decidido en §8 a §17. El bloque 0 está en §18 y la pregunta nueva, en §19 (Q11).

### 20.1 Los retoques de la ronda 5 (`67007c1`)

- **La regla `data:` lee `application/octet-stream`.** Ese tipo es el de los fuentes cuya extensión Vite no conoce (`.tsx` y `.cts`). La regla lo niega **cuando el trozo tiene un fuente de código importado como recurso** (`?inline`, `?url` o `?raw`, según el grafo). Así no hay falsos positivos con un recurso binario legítimo.
- **El mensaje nombra el módulo** cuando el grafo lo tiene: por ejemplo, `…: lleva código incrustado como URL data: (data:video/mp2t;): packages/domain/src/access/id-token.ts?url&inline`.
- **El comentario de `vite.config.ts` dice la verdad.** `assetsInlineLimit` no cubre `?inline`, porque Vite lee esa consulta antes de preguntar a la función. Lo que lo para es la regla `data:`.
- **Además**, el cruce con los *source maps* compara la ruta **sin la consulta**. Si no, un `?url` legítimo daría un falso «su source map nombra … y el grafo no».
- **Dicho: `?inline` solo** no incrusta un `.tsx` ni un `.mts`. Vite los compila como módulo, y el *build* falla por `MISSING_EXPORT` antes del guardián. La vía que sí incrusta es `?url&inline`, y con ella se hicieron los mutantes.

| Mutante | Sobre `490f0e1` | Con `67007c1` |
|---|---|---|
| V5-tsx: `SessionCard.tsx?url&inline` en `main.tsx` | **sobrevive** (`data:application/octet-stream`) | muerto, y el mensaje nombra el módulo |
| V5-cts: un `probe.cts?url&inline` de la web | **sobrevive** | muerto, y nombra el módulo |
| V5-ts: `id-token.ts?url&inline` | — | muerto: `(data:video/mp2t;): packages/domain/src/access/id-token.ts?url&inline` |
| G5, control: V5-tsx con la lectura de `octet-stream` quitada | — | sobrevive, **como tiene que ser**: nada más lo para |
| El lote V3 de la ronda 4 (V3b, V3c, G4-nolimit, G4-nodata), repetido | — | 4 de 4 muertos |

### 20.2 Qué hay en la rama

| Bloque | Commits | Qué |
|---|---|---|
| 0 | `6348306` | Las verificaciones con fuente (§18). `data-model.md` §1.4 queda al día con Q8 (a): el código lleva solo el `sub` |
| 1, reglas | `0dc54d8`, `23fa3dc` | `access/token.ts`: el formato antes de construir el nombre (B1); el registro, leído solo como el token pedido; el orden de §2.2; la caducidad bajo el techo; y la fila de la lista. `access/console.ts`: el inicio parámetro a parámetro; el nombre del dispositivo; el literal `127.0.0.1`; el canje; la entrada de un `sub`; y la reemisión. `access/credentials.ts`: `credentials.json` como mapa por dispositivo; `sync/remote.json` estricto; qué entrada usa cada orden (B2); las carpetas que no se anidan; y el aviso de caducidad. `signed.ts` recibe el intento de la consola y su código. `routes.ts` recibe las rutas nuevas y sus políticas. `token_expiry_warning_days` (14) entra en `atlas.config.json` |
| 1, adaptadores | `5dd5f77` | `ParameterStore` ofrece `putNew` (sin `Overwrite`, con etiquetas), `overwrite` (solo para revocar) y `listByPath`, **y nada más** (T26). `TokenRegistry` no cachea nada. `sha256Hex` y `sameSecret` comparan con `timingSafeEqual`. El doble de SSM guarda las versiones, resuelve `nombre:versión` y `nombre:etiqueta`, y responde `ParameterAlreadyExists` y `TooManyUpdates` |
| 2, API | `f6cbbf7`, `b21b658`, `893fd05`, `407405d` | `console/start`; la rama de consola de la vuelta (*loopback*, manual y reemisión); `console/token` (emitir, renovar y reemitir); `console/revoke`; y `devices/tokens` con su revocación. Las páginas manual y de reemisión llevan `sandbox`. El registro de la Lambda lleva el `token_id` y nada más. El guardián de arquitectura impide borrar y etiquetar |
| 3, consola | `42179a4` | `atlas remote login` (*loopback*, `--manual`, renovación y reemisión), `atlas remote logout` (`--local-only`) y `atlas remote status` |
| 4, web | `84cdd35` (techo), `20127d3`, `38f8555` | La tarjeta «Dispositivos de la consola» en la sección de sincronización de Ajustes, en carga diferida |

**Dicho**:
- `f6cbbf7` no pasa `typecheck`. Un test de la API tenía un tipo sin ajustar, y el *hook* solo mira Biome. `b21b658` lo arregla dos minutos después. La historia no se reescribe.
- La suite completa encontró dos fallos que la selección de E2 no veía, y los arregla `38f8555`:
  - el test de `readLocalConfig` de los adaptadores esperaba la configuración sin la clave nueva;
  - el guardián de «ninguna clase que la hoja no declare» rechazaba la clase `devices`; la tarjeta es ahora una `<section>` con su `aria-label`.

  Desde `23fa3dc` y `20127d3` hasta `38f8555`, la suite completa no estaba en verde. La CI no los vio porque solo corre en la PR.

### 20.3 La tabla de reglas (plan §4.2), con su test y su mutante

| # | Test | Mutantes, todos muertos |
|---|---|---|
| T01-T02 | `token.test.ts` (formato, nombre, registro); `console.test.ts` de la API («checks the format before building any name», «a record whose own token id is another»); `token-registry.test.ts` (el doble con selectores) | M13a, M13b, M13c |
| T03 | `token-registry.test.ts` (`sameSecret`); API («a wrong secret») | M-secret |
| T04, T17 | `token.test.ts`; API (revocado; renovar con uno revocado) | M17a |
| T05, T06 | `token.test.ts` (el techo); API («past the ceiling whatever its record says»); `config` (E1) | M16a, M16b, M17b |
| T07 | `token.test.ts`; API (el par fuera de la lista) | M-list |
| T08 | API (olvidado, borrado, de tipo `web`) | M46sexies, M-dev |
| T09 | `token-registry.test.ts` («reads again on every call»); API (se revoca entre dos peticiones) | M14 |
| T10 | API (SSM limitado: 503 y el reintento pasa) | M27 |
| T11, T14 | `console.test.ts` del dominio (rutas); API (un token en `console/start` y en la lista) | M26a, M26b |
| T12 | Dominio y API (un `device_id` en el cuerpo del canje) | — (lo cubren los tests de forma) |
| T13 | Dominio (cada parámetro con su nombre); API | M29a |
| T15 | API (`prompt=select_account`) | — |
| T16, T20 | Dominio (el código con su `typ`); API (sin cookie de sesión; un código de otro propósito; caducado; PKCE; la lista otra vez; y el `sub` con dos entradas) | M15a, M15b, M-pkce, M-listagain, M-ambig |
| T17 (*loopback*) | Dominio y API (el literal y el puerto) | M20a, M20b |
| T18 | API (sin *script*, `sandbox`, `no-store`, `no-referrer`, el código solo dentro del `<details>` y partible en el teléfono) | M21a, M21b, M-wbr |
| T21 | API (dos canjes del mismo código: `409`, un solo registro); `token-registry.test.ts` | M19 |
| T22 | API (renovar conserva el dispositivo y revoca antes; el corte entre los dos pasos deja el anterior revocado y ningún nuevo) | M18a, M18b |
| T23 | API (confirmación con los datos del servidor; los cuatro rechazos con su código; todos los tokens vivos revocados antes; el dispositivo, comprobado otra vez en el canje; el nombre del servidor, escapado); consola (reemite tras la confirmación) | M29sex-a a M29sex-e, M29b |
| T24 | API (`console/revoke` revoca ese y solo ese) | M-revokeother |
| T25 | API (lista solo con sesión; un registro ilegible sale; `<token_id>` validado antes del nombre; revocar dos veces escribe una) | M-webid, M-rewrite |
| T26 | Arquitectura: `ParameterStore` ofrece exactamente cuatro operaciones y ningún fuente nombra ni borrar ni etiquetar | — (guardián estático) |
| T27 | Consola: un `state` erróneo se ignora y el puerto sigue esperando; la página sin nada externo, con `no-referrer` | M22 |
| T28, T29 | Consola: siempre imprime la URL; `redirect: "error"`; solo `https`; el token nunca en la salida, en un error ni en una URL | M23a, M23b, M23c |
| T30 | Consola: `600` y atómico, `700` para la carpeta; no se usa con permisos abiertos; se niega dentro de la carpeta del libro | M24a, M24b, M24c |
| T31, T34 | Dominio (mapa por dispositivo; qué entrada usa cada orden); consola (renueva solo con la entrada que nombra `sync/remote.json`, y las demás intactas) | M29bis, M29quinq |
| T32 | Dominio (`sync/remote.json` estricto). La escritura bajo el cerrojo es de E3 | — |
| T33 | Consola (el árbol de la carpeta del libro, igual antes y después de `login`) | — (cubierto por el mismo test) |
| T35 | Consola (sin el `200` la entrada sigue; `--local-only` no llama al servidor y lo dice) | M25 |
| T36 | Dominio (umbral −1, 0 y +1); consola (`status` avisa a 13 días) | T36 |
| T37 | Web (el nombre como texto, nunca como marcado); API (escapado en la página) | M-card, M29b |
| T38 | Dominio (el borde de 7 días) | T38 |

### 20.4 Cómo se vio cada test en rojo

- **Dominio**: sin `token.ts`, `console.ts` y `credentials.ts`, los tres ficheros de test fallan al cargar. Con ellos, el acceso está al 100 %. `local-config.test.ts` falla (1 de 2) antes de añadir `token_expiry_warning_days`.
- **API**: con el manejador de E1 puesto otra vez (`git stash`), `console.test.ts` da 23 de 24 en rojo.
- **Web**: `devices-card.test.tsx` falla al cargar sin el componente. `session-card.test.tsx` se puso al día, porque con sesión ahora pide también la lista.
- **Consola**: los tests se escribieron después de la orden. El rojo se vio con los mutantes: cada uno de T27 a T36 muere con su test.
- **Honestidad**: como en E1, en el dominio, los adaptadores y la API escribí el código antes que el test. Comprobé el rojo quitando el código, y la prueba de que cada test ata su regla son los mutantes.

### 20.5 Mutación

- **Lote de E2** (`e2-015.json` y `e2-wbr-015.json`): **52 de 52 muertos**. Cada uno se comprobó aplicado, se restauró y se comparó byte a byte, con el árbol igual y sin gemelos. La orden es la selección de tests de E2: dominio, adaptadores, API, consola, web y arquitectura. Revisé a mano qué test mata una muestra de diez (M18a, M29sex-d, M-rewrite, M24a, M23c, M14, M19, M16b, M26a y M-webid): cada uno muere por el test que lleva su regla.
- **Guardianes, repetidos** sobre el árbol de E2: estático 10 de 10 y ronda 1 19 de 19.
- **No aplican**: M28 (Q2, no se emite `mfa_required`). M29 bis de `sync/remote.json` escrito fuera del cerrojo y M29 quater son de E3, que es quien lo escribe.
- **No repetido**: el lote de 59 mutantes de E1 sobre el manejador se perdió con la mudanza. Los caminos de E1 que tocó E2 (la vuelta de Google y el `catch` común) los cubren sus tests, que siguen en verde.

### 20.6 El paquete web

| | Medida | Techo |
|---|---|---|
| Arranque | **75.845** | 75.869; sin tocar |
| Total | **283.158** | **277 KB (283.648)**, subido en su propio commit **antes** del que lo necesita (`84cdd35`), sobre la medida de 283.119, y dentro de la autorización de Q1 (hasta 304.640). La `<section>` de `38f8555` añade 39 bytes |

- **Del total**, respecto de los 282.280 de E1: `ajustes` +859 (la tarjeta y su cliente), `ecb` +29 e `index` +9 de ruido de *hashes*. La tendencia: 272,2 → 273,3 → 275,6 → 276,5.
- **El arranque sube +2** en la medida final (+9 en la intermedia), todo en la tabla de precargas de la entrada; no hay código nuevo en él.

### 20.7 Capturas (Chrome for Testing 153, desde el *scratchpad*: `capture-e2-015.mjs`; en `~/personal/atlas/privado/capturas/2026-09-26-015-e2/`)

- **Qué se captura**: la tarjeta de dispositivos, con una emisión reciente, un token antiguo y uno revocado, a 400×890 con DPR 3, a 2045×1141 (claro y oscuro) y a 360 de ancho. También la página manual (cerrada y abierta) y la de reemisión. **Sin desplazamiento lateral** en todas: `scrollWidth === clientWidth`, en `medidas.json`.
- **Lo que encontró mirar la pantalla**: con la página manual abierta, **el código de unos 400 caracteres no se podía partir y hacía la página cinco veces más ancha que el teléfono** (`scrollWidth` 2.239 frente a 400). El arreglo (`893fd05`) mete un `<wbr>` cada 32 caracteres. Hace falta así: la CSP de la página no admite estilo, y `<wbr>` no añade nada al texto copiado. Tiene su test y su mutante (M-wbr).
- **Comprobado en Chromium**: el enlace «Sí, es este dispositivo: continuar» de la página de reemisión, **servida con su CSP `sandbox`**, navega al clic hasta el `127.0.0.1` de la consola.
- **Sin datos del libro**: la tarjeta no lee el libro ni enseña importes, así que el modo privacidad no tiene nada que tapar. Las capturas son con el libro vacío y la privacidad puesta (el valor por defecto). En las capturas de página entera, la barra fija de la aplicación queda dibujada a media página: es un efecto de la captura, no de la pantalla.

### 20.8 Decisiones propias, dichas (a confirmar por la dirección)

- **`reissue_device_unreadable`**, un cuarto código de la reemisión, como `unreadable` en Q9. Existe para no plegar un objeto ilegible en `missing`: página `403` en la vuelta y JSON `403` en el canje.
- **Revocar desde la web un token que no existe o no se lee**: `404 not_found`, con `details.reason` `token_missing` o `token_unreadable`. No se escribe nada en ninguno de los dos casos.
- **`not_allowed` con motivo**: `ambiguous_subject` si el `sub` del código tiene dos entradas (Q8 (a)), y `other_subject` si el token para renovar es de otro `sub`.
- **Renovar y reemitir a la vez** (un token en la cabecera y `rdid` en el código): `400 body_invalid`, con `reason: renewal_and_reissue`. La consola nunca lo pide.
- **Si al renovar el token anterior ya está revocado**, la consola borra esa entrada local y lo dice. Sin ella, el siguiente `atlas remote login` reemite para ese dispositivo («la consola vuelve a iniciar sesión sin él», §4.3).
- **El primer canje crea el registro antes que el objeto del dispositivo.** El registro sin sobrescribir es la barrera del uso único. Si el objeto no se pudiera crear, el token nuevo se revoca y no se entrega nada.
- **`atlas remote status`** enseña la entrada que nombra `sync/remote.json` y las de esta carpeta y su origen, y avisa con el umbral de `atlas.config.json`.
- **La consola intenta abrir el navegador** con `xdg-open` (o `open` o `explorer.exe`) y no espera. La URL se imprime siempre.
- **`apps/cli/tsconfig.test.json`** tiene ahora `rootDir: "../.."` e incluye el arnés de la API y sus dobles. Así los tests de la consola corren contra el manejador de verdad.

### 20.9 Documentos (para que los traslade la dirección; §2 bis del encargo)

- **`docs/api.md`**:
  - §4.2: el correo ya no está pendiente de Q8, porque el código lleva solo el `sub`;
  - §3.1 y §7: `reissue_device_unreadable`;
  - §4.5: el `404 not_found` al revocar un token que no existe o no se lee;
  - §7: los motivos de `not_allowed` (`ambiguous_subject` y `other_subject`) y de `body_invalid` (`renewal_and_reissue`).
- **Plan §10 y la 017**: el rol de la API necesita **`ssm:AddTagsToResource`** sobre `/atlas/<entorno>/device-tokens/*` (§18.2).
- **ADR-0034, fila 9**: `PutParameter` admite `Tags` al crear, con `ssm:AddTagsToResource` (§18.2).
- **ADR-0033**:
  - los SIN VERIFICAR de la 015, con su fuente (§18.1 a §18.6);
  - la atomicidad de `PutParameter`, como deducción documentada y no como cita literal (Q11);
  - la prueba en el navegador real, aplazada a la 018 con su procedimiento (§18.4).
- **`contracts/cli-commands.md`**: `atlas remote status` y `token_expiry_warning_days`, tal como quedan.

### 20.10 Lo que queda abierto

- **Q11**: la atomicidad de `PutParameter` sin `Overwrite` está documentada por deducción (§18.1).
- **P14**: la vuelta a `127.0.0.1` en el navegador real del usuario se aplaza a la 018. El procedimiento está en §18.4. Que el reenvío de `localhost` de WSL en modo NAT escuche en el literal `127.0.0.1` está SIN VERIFICAR.
- **El paso de la CI** (`upload-artifact`) sigue esperando a que el usuario conceda el permiso `workflow`.
- **El SDK de AWS** no está instalado (E3), así que no hay composición de producción.

### 20.11 Tubería y congelado

Sobre `38f8555`, el último commit de código. El congelado solo añade esta sección a `questions.md`, que ningún test lee.

| Orden | Código de salida | Nota |
|---|---|---|
| `npm run lint` | 0 | |
| `npm run typecheck` | 0 | |
| `npm run test:coverage` | 0 | 287 ficheros, 2.836 tests, 425 s; el dominio al 100 % (sentencias 8.120/8.120, ramas 4.803/4.803, funciones 1.811/1.811, líneas 7.721/7.721); ningún `ECONNREFUSED` |
| `npm run test:coverage`, repetida a continuación | 0 | 2.836 tests, 406 s; el dominio al 100 %; ningún `ECONNREFUSED` |
| `npm run build` | 0 | Arranque 75.845 y total 283.158 |

- Ningún gemelo `.js`.
- `git diff 490f0e1 -- tests/fixtures` está vacío: E2 no toca el libro ni la salida fiscal.
- La CI `verify` solo corre en la PR; su resultado va en la PR.

**Commit congelado de E2: el que contiene esta sección.** Su SHA va en la PR de E2 y en el informe a la dirección. Desde aquí no se empuja nada a la rama mientras dura la revisión.

## 21. Decisiones de la dirección sobre E2 (2026-09-26)

Tal como llegaron, con lo que se hizo con cada una.

- **Q11, aceptada la deducción.** La API documenta `ParameterAlreadyExists` para un `PutParameter` sin `Overwrite` sobre un nombre que ya existe, y las escrituras concurrentes sobre un mismo nombre se rechazan. **No se para.** A la lista de comprobaciones de la 018 se añade una prueba real contra SSM: dos canjes simultáneos del mismo código, de los que solo uno prospera. **Hecho**:
  - ADR-0033 lleva una nota fechada con la deducción;
  - la prueba entra en `docs/decision-roadmap.md`, 018, junto con la del *loopback* en el navegador real (P14).
- **Las cuatro decisiones de §20.8, aceptadas tal cual.** **Hecho** en `docs/api.md` §3.1, §4.2, §4.3, §4.5 y §7:
  - `reissue_device_unreadable`;
  - `404 not_found` sin escribir nada, con `token_missing` y `token_unreadable`;
  - los motivos `ambiguous_subject` y `other_subject`;
  - borrar la entrada local para reemitir en el siguiente inicio de sesión.
  - Además, `renewal_and_reissue`, dentro de `body_invalid`.
- **Los dos tramos intermedios en rojo** (`f6cbbf7`, y de `23fa3dc` a `20127d3`) **quedan anotados como están**, sin reescribir la historia (§20.2). **La regla**: antes de cada empuje, al menos `typecheck`.
- **Documentos: los traslado yo, en esta PR**, por orden expresa de la dirección. Es una excepción a §2 bis del encargo, limitada a esto. **Hecho en `dc6d6d2`**:
  - `docs/api.md`: Q8 (el código lleva solo el `sub`), los códigos nuevos, el `404` y los motivos;
  - ADR-0033: una nota fechada que cierra o actualiza los SIN VERIFICAR del bloque 0 (§18);
  - ADR-0034: una nota fechada sobre la fila 9 (las etiquetas al crear, que exigen `ssm:AddTagsToResource`);
  - `docs/decision-roadmap.md`: `ssm:AddTagsToResource` en la entrada de la 017, y las pruebas de Q11 y del *loopback* en la lista de la 018.

**Tubería**: `npm run lint` 0 y `npm run typecheck` 0 antes de cada empuje. La CI `verify` va en el comentario de la PR #95. Los cambios de esta sección son solo de documentos. El código es el de `38f8555`, con `test:coverage` dos veces en 0 y `build` en 0 (§20.11).

**Commit congelado: el que contiene esta sección.** Su SHA va en la PR #95. Desde aquí no se empuja nada mientras dura la revisión.

## 22. Decisiones de la dirección sobre las revisiones de la PR #95 (2026-09-26)

Tal como llegaron, con lo que se hizo con cada una y el commit que lo lleva. Las dos revisiones se hicieron sobre el congelado `a6c5367`.

### 22.1 Seguridad

- **B1. `sentinels.test.ts` se extiende a las 5 rutas nuevas** (la reemisión, la renovación y la lista incluidas) y a sus caminos de fallo, con un registro de token cuyo `sub`, `email` y `secret_sha256` son centinelas. **Hecho en `c23c183`**:
  - siembra un registro `SOWN` con `secret_sha256` centinela (`5e…`), el `sub` y el correo centinelas, y un objeto de dispositivo de consola;
  - recorre el inicio, las vueltas (*loopback*, manual, reemisión, dispositivo inexistente), los canjes (emisión, repetición, renovación, token falsificado, cuerpo mal formado, SSM limitado, S3 caído), las revocaciones de la consola, la lista y la revocación de la web;
  - comprueba que ningún centinela, ningún secreto y ningún *hash* aparece en los registros, y que las 5 rutas y los códigos de resultado sí aparecen.
  - **Lo que encontró**: el registro tiraba la plantilla de ruta `/api/devices/tokens/{token_id}/revoke`, porque la expresión `SAFE` de `apps/api/src/log.ts` no admitía `{}`. **Corregido en `85d76ae`**. Por eso `c23c183` está en rojo por sí solo y pasa desde `85d76ae`; se deja anotado, sin reescribir la historia.
- **N1. El canje lee `tokens.read(code.tid)` antes de revocar nada**; si el registro existe, responde `409 console_code_used` sin escribir. **Hecho en `8e5b86a`**, con tests de repetición para la emisión, la renovación y la reemisión: cada uno comprueba que el número de escrituras en SSM no cambia, y la reemisión, además, que el token recién entregado sigue sin `revoked_at`.
- **N2. No se toca aquí.** **Hecho en `73cdb64`**: la entrada de la 017 en `docs/decision-roadmap.md` lleva una regla de límite de ritmo del WAF sobre `/api/*` y la concurrencia reservada, porque protegen la cuota de SSM compartida (ADR-0034).
- **N3. Hecho en `73cdb64`**: la lista de la 018 lleva comprobar que el `GetParameter` justo después de revocar ya lee el valor nuevo.
- **N4. La consola comprueba la carpeta `~/.config/atlas` como `packages/adapters/src/prices/secrets.ts`** (`mode & 0o077`, salvo en Windows) y avisa si no es `700`: «…ciérrala con chmod 700.». **Hecho en `8f7b0d4`**; `78155ef` añade los casos de solo el grupo (`750`) y solo los demás (`705`), y el de `700` sin aviso.
- **N5. La respuesta del canje se valida con las reglas del dominio antes de guardarla** (`isCredentialEntry`, exportada ahora desde `@atlas/domain/access`), y en la renovación o la reemisión el `device_id` devuelto tiene que ser el pedido. Si no, no se escribe nada y sale `Error (console_response_invalid): …` con el código de salida de dominio. **Hecho en `8f7b0d4`** (y `c955f15` para la función del dominio).
- **N7. Hecho**: la descripción de la PR #95 dice ahora, en su primer punto, que la PR lleva también los retoques de la ronda 5 de la PR #90 (`67007c1`), que no son de E2.

### 22.2 Corrección

- **B1. Hecho en `8e5b86a`**: el test de la reemisión siembra un token vivo de **otro** dispositivo (`OTHEROTHEROTHEROTHEROT`) y comprueba que su registro no cambia y que no se escribe nada sobre él. Mata `listed.read.device_id === code.rdid` → `true`.
- **B2. Hecho en `8e5b86a`**: `other_subject`, `403 not_allowed` sin escribir nada (la lista con dos entradas, el token de una y el código de la otra). Mata `if (previous.sub !== code.sub)` → `if (false)`.
- **N1. Aviso preciso. Hecho en `c955f15`** (dominio) **y `8f7b0d4`** (consola): `expiryWarning` devuelve `"expired"` solo cuando `expires_at <= ahora`, y `0` cuando queda menos de un día; la consola dice «Caduca en menos de un día» y «Ha caducado» solo si ha caducado. Tests con 23 h, 1 h, 25 h, un milisegundo antes y el instante exacto.
- **N2. Hecho en `8f7b0d4`**: toda escritura de `credentials.json` pasa por `updateCredentials`, que relee el fichero justo antes de escribir y aplica solo el cambio de esta orden. El test escribe la entrada de otra terminal mientras la consola espera al navegador, y comprueba que las tres entradas quedan.
- **N3. Hecho en `8e5b86a`**: si `devices.create` lanza, el token recién creado se revoca (hasta tres intentos, tragando sus errores) y se relanza el fallo original, que responde `503 remote_unavailable` con la dependencia `s3`. La colisión también revoca por ese camino. Tests del fallo y de la colisión en `8e5b86a`; `78155ef` añade el reintento (dos fallos de SSM y el tercer intento revoca; tres fallos y la respuesta sigue diciendo `s3`).
- **N4. Hecho en `43b3085`**: `docs/api.md:135` dice lo de §21 (uso único aceptado por deducción, prueba real en la 018) y que la repetición se responde antes de revocar.
- **N5. Hecho en `43b3085`**: `token_expiry_warning_days` (14) en `docs/data-schema.md:28`.
- **N6. Hecho en `8e5b86a`** (`renewal_and_reissue` y `token_unreadable`) **y `8f7b0d4`** (borrar la entrada local tras `device_token_revoked`).
- **N7. Hecho en `8e5b86a`**: en la reemisión, el registro guarda el nombre del objeto del dispositivo, el que el usuario confirmó, no `code.dn`. Test: el registro y la respuesta dicen «sobremesa».
- **N8.** El *chunk* `ajustes` se queda como está.

### 22.3 Cómo se vio cada test en rojo

- Los mutantes de los revisores (S1-S7) se reprodujeron **sobre `a6c5367`, antes de tocar nada**: los 7 **sobrevivieron** (registros en el *scratchpad*, `r95b/`).
- Los tests nuevos se corrieron contra el código viejo antes de cada corrección: en la API, 3 en rojo (repetición, fallo de S3, nombre de la reemisión); en la consola, 5 (N1, N2, N4, y los dos de N5); en el dominio, 3 (los casos de horas y `isCredentialEntry`).
- Los dos tests de `78155ef` (reintento de la revocación y bits del grupo) se añadieron porque sus mutantes (N3b, N3c, N4b) no tenían quien los matara; se vieron sobrevivir con los tests de `73cdb64` y morir con los de `78155ef`.

### 22.4 Mutación, después de las correcciones

Sobre `78155ef`, con `mutate-015.mjs` (lote `r95-after-015.json` del *scratchpad*; la selección de tests del dominio, los adaptadores, la API, la consola y la web). **20 de 20 muertos.**

| Id | Mutante | Antes | Después |
|---|---|---|---|
| S1 | el aviso cuenta el día con `Math.ceil` | sobrevive (`a6c5367`) | muerto |
| S1b | «caducado» solo estrictamente después del instante (`<= 0` → `< 0`) | — (código nuevo) | muerto |
| S1c | la consola dice «0 días» en vez de «menos de un día» | — (código nuevo) | muerto |
| S2 | la reemisión revoca los tokens de cualquier dispositivo | sobrevive (`a6c5367`) | muerto |
| S3 | la renovación no comprueba el `sub` | sobrevive (`a6c5367`) | muerto |
| S4 | renovar y reemitir a la vez | sobrevive (`a6c5367`) | muerto |
| S5 | se conserva la entrada revocada tras renovar | sobrevive (`a6c5367`) | muerto |
| S6 | la colisión sin revocar el token nuevo | sobrevive (`a6c5367`) | muerto |
| S7 | `token_unreadable` confundido con `token_missing` | sobrevive (`a6c5367`) | muerto |
| N1s | sin la lectura previa: la repetición revoca antes de responder | tests en rojo sobre el código viejo | muerto |
| N3a | el fallo de `devices.create` deja el token vivo | tests en rojo sobre el código viejo | muerto |
| N3b | la revocación se intenta una sola vez | sobrevive (tests de `73cdb64`) | muerto |
| N3c | un fallo al revocar tapa el fallo de S3 | sobrevive (tests de `73cdb64`) | muerto |
| N7 | la reemisión guarda el nombre propuesto (`code.dn`) | tests en rojo sobre el código viejo | muerto |
| N2 | se escribe sobre la instantánea leída antes del navegador | tests en rojo sobre el código viejo | muerto |
| N4a | sin aviso por la carpeta abierta | tests en rojo sobre el código viejo | muerto |
| N4b | solo se miran los bits de los demás (`0o007`) | sobrevive (tests de `73cdb64`) | muerto |
| N5a | se guarda la respuesta sin las reglas del fichero | tests en rojo sobre el código viejo | muerto |
| N5b | se guarda una renovación de otro dispositivo | tests en rojo sobre el código viejo | muerto |
| LOG | la expresión `SAFE` sin `{}` tira la plantilla de ruta | el test de centinelas en rojo (`c23c183`) | muerto |

Cada mutante se restaura y se compara byte a byte, con `git status` igual antes y después.

### 22.5 Notas de honestidad

- `c23c183` (los centinelas) está en rojo por sí solo: el test encontró el fallo del registro, que se corrige en el commit siguiente, `85d76ae`.
- `8e5b86a` junta varias correcciones del canje (N1 de seguridad, B1, B2, N3, N6 y N7 de corrección), porque tocan la misma función y sus tests comparten el mismo bloque.
- `43b3085` debía llevar también la hoja de ruta; solo lleva `docs/api.md` y `docs/data-schema.md`. La hoja de ruta va en `73cdb64`.
- Todos los commits de esta ronda pasaron `lint` y `typecheck` en 0 antes de empujarlos.

### 22.6 Tubería y congelado

Sobre `78155ef`, el último commit de código. El congelado solo añade esta sección a `questions.md`, que ningún test lee.

| Orden | Código de salida | Nota |
|---|---|---|
| `npm run lint` | 0 | |
| `npm run typecheck` | 0 | |
| `npm run test:coverage` | 0 | 287 ficheros, 2.852 tests, 390 s; el dominio al 100 % (sentencias 8.125/8.125, ramas 4.808/4.808, funciones 1.812/1.812); ningún `ECONNREFUSED` |
| `npm run test:coverage`, repetida a continuación | 0 | 2.852 tests, 443 s; ningún `ECONNREFUSED` |
| `npm run build` | 0 | Arranque 75.845 y total 283.158 bytes gzip, los mismos que en `a6c5367`: esta ronda no toca la web |

- `git diff 490f0e1 -- tests/fixtures` sigue vacío.
- El paso de la CI con `upload-artifact` sigue fuera de la rama, a la espera del permiso `workflow`.
- La CI `verify` va en el comentario de la PR #95.

**Commit congelado: el que contiene esta sección.** Su SHA va en la PR #95. Desde aquí no se empuja nada mientras dura la revisión.

## 23. E3 — bloque 0 y lo que se fija antes del código (2026-09-26)

Escrito antes del primer commit de código de E3. Consultado el 2026-09-26 (Europe/Madrid). Delante van los cuatro puntos que dejó la ronda 2 de la PR #95 y la instalación, que no son código de E3 (§24 los reporta).

### 23.1 Punto 1 — las escrituras condicionales de S3

**Fuentes**:

- `https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html`, apartado «Conditional write behavior»;
- `https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutObject.html`, cabeceras `If-Match` e `If-None-Match`.

**Lo que dicen, literal**:

- `If-None-Match`: «If there's no existing object with the same key name in the bucket, the write operation succeeds, resulting in a `200 OK` response. If there's an existing object, the write operation fails, resulting in a `412 Precondition Failed` response.» Y la carrera: «If multiple conditional writes or copies occur for the same object name, the first write operation to finish succeeds. Amazon S3 then fails subsequent writes with a `412 Precondition Failed` response.» Con versionado, solo cuenta la versión actual.
- `If-Match`: «If there's an existing object with the same key name and matching ETag, the write operation succeeds, resulting in a `200 OK` response. If the ETag doesn't match, the write operation fails with a `412 Precondition Failed` response. You can also receive a `409 Conflict` response in the case of concurrent requests.»
- **Sin objeto**, `If-Match` no da `412`: «If there's no current object version with the same name, or if the current object version is a delete marker, the operation fails with a `404 Not Found` error.»
- El `409`, en la referencia de `PutObject`: «If a conflicting operation occurs during the upload S3 returns a `409 ConditionalRequestConflict` response. On a 409 failure you should fetch the object's ETag and retry the upload.»
- **Permisos**: `If-None-Match` exige `s3:PutObject`; `If-Match`, «the `s3:PutObject` and `s3:GetObject` permissions». Hay que firmar con SigV4, que el SDK hace siempre.

**Conclusión: se sostiene.** Una escritura condicional no pisa otra: con `If-Match`, la segunda recibe `412` (ETag distinto) o `409` (concurrente); con `If-None-Match`, la primera en terminar gana y las demás reciben `412`. **No se para.**

**Cómo lo aplica el código**:

- El adaptador del SDK (`sdk-s3.ts`) traduce a `precondition_failed` (o a `exists` con `If-None-Match`) el `412`, el `409` y, con `If-Match`, el `404`. Nunca reintenta él: quien decide es el llamador (la API responde `412 precondition_failed` y el cliente vuelve al paso 1, `docs/api.md` §5.2).
- `docs/api.md` §5.5, que lo dejaba SIN VERIFICAR, queda confirmado: con el objeto inexistente, `If-Match` daría `404`, y la API escribe con `If-None-Match: *`.
- El doble de S3 imita las cuatro salidas (`412`, `409` en la carrera, `404` de `If-Match` sin objeto, `200`) y cita esta fuente.

**Lo que encontré de más, para la 017** (no bloquea E3, que va con dobles):

- `API_GetObject.html`: «If the object that you request doesn't exist, the error that Amazon S3 returns depends on whether you also have the `s3:ListBucket` permission.» Con él, `404`; **sin él, `403 Access Denied`**.
- El libro remoto no existe hasta la primera inicialización, y un objeto de dispositivo puede faltar. Si la API recibe `403` por falta de `s3:ListBucket`, **el adaptador no lo toma por «no existe»**: lanza, y la API responde `500 internal`. Es fallo seguro, pero rompe la inicialización.
- **La 017 tiene que dar a la Lambda `s3:ListBucket` que cubra `ledger/`**, además de `sync/devices/`, `reference/ecb/` y `prices/` (plan §10).
- **SIN VERIFICAR**: si un `s3:ListBucket` con la condición `s3:prefix` cuenta para convertir el `403` en `404` en un `GetObject`. La condición no existe en el contexto de `GetObject`, así que puede no contar. Va a la lista de la 018 como prueba real. Si no cuenta, la salida es un `s3:ListBucket` sin condición sobre el bucket de datos, que solo deja listar nombres.

### 23.2 Punto 2 — el ETag de S3 no es el SHA-256

**Fuente**: `API_PutObject.html`, respuesta `ETag`: «for objects where the ETag is the MD5 digest of the object, you can calculate the MD5…». Y en un ejemplo con SSE-C: «The ETag that is returned is not the MD5 of the object». Es opaco: a veces MD5 y a veces no, y nunca SHA-256.

**Cómo lo obtiene la Lambda**: de la cabecera `ETag` de su propio `GetObject`, en la misma lectura que le da los bytes. Con esos bytes calcula el SHA-256, que es el etag de la API, y escribe con `If-Match` sobre el ETag de S3 de esa lectura. Si otro escribió entre medias, S3 responde `412` o `409`, y la API, `412`. El cliente nunca ve el ETag de S3.

### 23.3 Punto 3 — CloudFront y la compresión de `GET /api/ledger`

**Fuente**: `https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/ServingCompressedFiles.html`.

- «CloudFront only compresses objects that have one of the following values in the `Content-Type` response header». La lista no incluye `application/x-ndjson`. **`GET /api/ledger` no se comprime.**
- Sí incluye `application/json` y `text/csv`, y por tanto **algunas rutas de referencia pueden comprimirse**. Solo si la política de la ruta lo pide («Compress objects automatically», con una *cache policy*), y solo entre 1.000 y 10.000.000 bytes.
- Si comprime: «CloudFront also converts the strong `ETag` header value to a weak `ETag`… adds the characters `W/`». El cliente recibe `Content-Encoding`, y `fetch` descomprime por la norma Fetch, así que el cuerpo que ve son los bytes del fichero.

**Cómo lo aplica el código**:

- El cliente HTTP calcula el SHA-256 de los bytes que recibe, ya descomprimidos. Si la cabecera `ETag` viene, le quita `W/` y las comillas y **la compara**; si no cuadra, es `transport_rejected`.
- `GET /api/reference/…` acepta en `If-None-Match` tanto `"<v>"` como `W/"<v>"`.
- La tolerancia a la compresión no se aprovecha para nada más.
- **Para la 017**: la política de `/api/*` no cachea (`CachingDisabled`), y la compresión es decisión suya.

### 23.4 Lo que la Lambda devuelve, byte a byte

- `GET /api/ledger` devuelve el cuerpo **como texto si sus bytes son UTF-8 válido**, porque así se reescriben idénticos, y **en base64 (`isBase64Encoded: true`) si no**. Exacto en los dos casos, y el caso normal no paga la inflación de base64 frente al tope de 6 MB (§1.4).
- **Un libro que no quepa en 6 MB no se sirve**: la API responde `500` y lo registra. Hoy está lejos (ADR-0002: 1-2 MB en veinte años). El `ResponseStream` queda para cuando haga falta, dicho en la PR.

### 23.5 Lo que E3 fija sobre el plan

- **`ObjectStore` gana `list(prefix)`**: `ListObjectsV2` con `Delimiter: "/"`, solo el primer nivel, con nombre, ETag y tamaño, recorriendo todas las páginas. Lo usan `GET /api/sync/devices` y `GET /api/reference/index` (y E5, la administración). **Nunca hay borrado**.
- **El libro remoto en S3**: `S3LedgerBlob` implementa `LedgerBlob` sobre `ObjectStore`, y `BlobLedgerStore` pone las seis operaciones, las mismas que la web.
  - `update` lee, compara el SHA-256 y archiva con `If-None-Match: *` (`archive/<nombre>`, nunca sobrescrito).
  - Después escribe con `If-Match` sobre el ETag leído, o con `If-None-Match: *` si no había objeto. Un `412` es `ConflictError`.
  - **La diferencia con IndexedDB**: archivar y escribir no son un solo paso atómico. Si otro escritor gana entre los dos, queda un archivo y el libro no cambia. El archivo es una copia exacta de unos bytes que sí fueron el libro, nunca se sobrescribe, y el reintento lleva otro nombre (`syncArchiveName`). Se dice en el comentario del adaptador y lo prueba un test de corte.
- **La API solo ve `read()` y `appendLines()`** del libro remoto (`AppendOnlyLedger`). La inicialización es un `appendLines` sobre el etag de cero bytes. Un test de estructura comprueba que ningún fichero de `apps/api/src` nombra `replace`, `replaceLines`, `DeleteObject` ni `deleteObject`, y que `sdk-s3.ts` y `sdk-ssm.ts` no usan ninguna orden de borrado.
- **La composición de producción** (`apps/api/src/lambda.ts`):
  - lee `ATLAS_*` con `parseApiConfig`;
  - monta los clientes del SDK;
  - **lee la clave de sesión y construye el `Signer` antes de exportar el manejador**, con un `await` de primer nivel.
  
  Si la configuración no se entiende o la clave no mide 32 bytes, **la Lambda no arranca**. Se prueba con clientes simulados, sin AWS.
- **El paquete de la Lambda**: `apps/api/scripts/build-lambda.mjs` construye con `esbuild` un solo `index.mjs` ESM (Node 22, con el SDK dentro) y un `lambda.zip` determinista (fecha fija, orden fijo). Lo escribe un escritor de ZIP propio de pocas líneas con `node:zlib`, sin paquete nuevo. `npm run build` lo corre, y un test comprueba que el paquete no lleva ni dobles ni `tests/`.
- **Las rutas nuevas**, en la tabla del dominio con una política nueva, **`sync`**: sesión o token. Con la sesión, las escrituras miran `Origin`. Con las dos, el objeto del dispositivo. `GET /api/sync/devices` sigue siendo solo de sesión.
- **El cliente HTTP** (`packages/adapters/src/sync/http-remote.ts`, puerta `./sync-http`):
  - uno solo, con la credencial inyectada;
  - `redirect: "error"`;
  - `x-amz-content-sha256` con Web Crypto;
  - la regla de §7 para cada respuesta.
  
  La consola lo monta con el token y solo contra el origen HTTPS de su entrada. La web lo tendrá en E4: aquí existe, pero nada de la web lo alcanza (guardián de E1).
- **Las órdenes**, las de `contracts/cli-commands.md`. La secuencia de `sync/remote.json` y sus estados S0-S3, las del plan §7. Lo heredado de la 014, el plan §8 con la opción (a) de §8 y el punto 4 en `sync/redo-record.ts` (Q5).
- **El paquete web**: E3 no toca la web salvo las frases de los códigos nuevos (`errors`, perezoso). La función de N1 vive en `sync/redo-record.ts`, fuera del arranque (Q5). **Se mide antes y después**, y el arranque no sube.

### 23.6 La predicción fiscal, antes de correr la suite de E3

**No se mueve nada.**

- `tax` (con `--lots`, `--boxes` y `--json`), `gains`, `income`, `m720`, `m721` y `filed` dan los mismos bytes:
  - sobre `synthetic-v1` sin `sync/`;
  - con una carpeta `sync/` (marcador, lo retenido y `remote.json`);
  - y sobre un libro que ha pasado por una sincronización **a través del manejador de la API con el doble de S3**.
- `git diff 2a23ec3 -- tests/fixtures` sale vacío.
- **Motivo**: E3 no añade ningún tipo ni campo al libro ni toca la proyección. La API escribe las líneas tal cual (`appendLines`), así que el libro sincronizado es byte a byte el que el cliente serializó.
- Si algo se mueve, se para.

## 24. E3 — la sincronización sobre HTTP (2026-09-26)

Sobre `2a23ec3` (E2 fusionada). El bloque 0 y la predicción fiscal están en §23, escritos antes del primer commit de código.

### 24.1 Lo que dejó la ronda 2 de la PR #95

| Punto | Commit | Test (visto en rojo) | Mutante |
|---|---|---|---|
| R2-1: la reemisión no revoca el registro de su propio `code.tid` | `b453195` | dos canjes simultáneos del mismo código: uno 200 y otro 409, y queda exactamente un token vivo (rojo: 0 vivos) | R21, muerto |
| R2-2: si fallan todas las revocaciones, el log lleva el `token_id` que queda vivo | `b453195` | S3 cae y SSM falla tres veces: el `503` lleva `token_id` (rojo: sin él) | R22, muerto |
| R2-3: el lado que rechaza de `SAFE` | `28ba7bb` | `apps/api/test/log.test.ts` | LOG2: **sobrevive** sin `log.test.ts` y muere con él |
| Residuo de N5: una emisión nueva no sustituye la entrada de otro origen | `364d655` | la consola se niega con `credentials_other_origin` y no escribe nada (rojo: salía 0) | N5r y N5d, muertos |
| `vitest.config` excluye `dist-test-browser` | `b764b16` | `tests/test-outputs.test.ts` deriva todo `outDir` de los tsconfig (rojo: faltaba) | VX, muerto |

**Lotes: 7 de 7 muertos.**

### 24.2 Instalación

- `a230868`: `@aws-sdk/client-s3@3.1141.0` y `@aws-sdk/client-ssm@3.1141.0`, versión exacta, en `packages/adapters`, y `esbuild@0.28.2` como dependencia de desarrollo de `apps/api`.
- `docs/dependencies.md` recoge las tres con su versión y su justificación. Anota que `esbuild` trae su binario por plataforma en `optionalDependencies`, el riesgo que motivó excluir Tailwind; se acepta porque está presupuestado y solo corre en el *build* de la Lambda.
- Un test fija las versiones y que `apps/api` no tiene otra dependencia externa.
- **La autorización**: el usuario la dio en el chat a la dirección («no tengo problema ninguno en instalar lo que haga falta»), confirmada por la dirección el 2026-09-26. No se instaló nada más.

### 24.3 Mapa bloque → commit

- **Bloque 1**:
  - `65a1d1b`: `S3LedgerBlob` bajo `BlobLedgerStore`, con el contrato de los otros almacenes y el doble de S3 con las cuatro salidas de §23.1.
  - `87922f4`: los adaptadores finos del SDK, detrás de la puerta `@atlas/adapters/aws-sdk`, probados con clientes simulados, más el guardián de la lista cerrada de órdenes y sin borrado.
- **Bloque 2** y datos de referencia (**bloque 3**):
  - `d9a03fd`: las reglas en el dominio (`sync-routes.ts`, la política `sync` y los códigos 412, 422, 428 y `reference_name_invalid`).
  - `7cd9fed`: las rutas en la API, con `AppendOnlyLedger` y dos tests de estructura (nada reescribe ni borra; ningún código de §5.2 en `apps/api`).
  - Composición y paquete, `2dfb520`: `compose.ts`, `lambda.ts`, `scripts/build-lambda.mjs` y `tests/lambda-package.test.ts`. Construye un ZIP determinista y comprueba que no lleva tests ni dobles, que es idéntico dos veces y que Node lo carga y se niega a arrancar sin configuración.
- **Bloque 4**:
  - `0573ea2`: la lectura estricta de las respuestas (§7) y `LINE_REJECTION_CODES`.
  - `beeaa3e`: el cliente HTTP (`@atlas/adapters/sync-http`).
  - `2c24493`: `sync/remote.json`, el primero de la escritura de inicializar y unirse, con el test del corte entre los dos.
  - `b19d2f9`: los estados S0-S3 y la entrada de cada orden, en el dominio.
  - `c820fb0` y `abc691c`: el reparto de `where` y del doble de la consola.
  - `b852217`: `atlas sync`.
- **Bloque 5**:
  - Puntos 2 y 4, `09e4eb1`: `redo_waits_for_unit`, la traducción entre unidades y `recordRedo`, más el test de estructura de quién lo importa.
  - Puntos 1 y 3, `d0c9fbf`: las frases.
  - Punto 6, `6edad07`.
  - Punto 5, en `09e4eb1` (`correctEvent` sobre un libro ya inválido).
  - Punto 7, `4c33112`.
- **La comparación fiscal a través de la API**: `25ec6c0` y `8ced900`.
- **Los dos supervivientes del lote de E3**: `ccdbd40`.

### 24.4 Cómo se vio cada test en rojo

- Los de rutas, cliente, dominio y consola se escribieron antes que su código: módulo inexistente o aserción fallida en la primera ejecución.
- Los de `redo-across-units` fallaron primero con `startRedo` resolviendo en lugar de esperar.
- Los de `archive-names`, con `ArchiveExistsError`.
- `tests/messages.test.ts` falló con los siete códigos nuevos sin traducir en las dos interfaces.
- Los de §24.1 y §24.6, como dice su tabla.

### 24.5 Lo que se volvió a mirar alrededor

- **R2-1**: la renovación y la emisión nueva no revocan nada más que su registro.
- **El cambio de `ObjectStore`**: se añade `list`. Los tres dobles en línea de los tests de la API ganan su `list`.
- **Las órdenes que archivan**: todas pasan ahora por `withArchiveNames` (`syncDevice` ya lo hacía a su manera).
- **`PUT /api/ledger`**: la lectura previa del remoto era redundante (el mutante M31e sobrevivía por eso, §24.6) y se quita. Un remoto no vacío lo rechaza la propia escritura, con `appendLines` sobre el etag de cero bytes.

### 24.6 Mutación

**El lote de E3** (`scratchpad/015-e3-part1..6.json`): **55 mutantes, no 60** como dije en el informe anterior.
- Se corrieron de uno en uno, detrás de la puerta de memoria, con `--pool=forks --maxWorkers=1`.
- El guion afirma cada sustitución, restaura, compara byte a byte y compara `git status`.
- **52 muertos a la primera. Tres supervivientes**:
  - **M31e** (inicializar un remoto que no está vacío): equivalente, por la lectura redundante. Se quitó la lectura (§24.5), y el mutante ya no tiene dónde aplicarse.
  - **M29q2** (no comparar `sync/remote.json` al escribir): test nuevo, «otra consola escribió `remote.json` entre la lectura y la escritura» → `ConflictError`. **Muerto** al repetirlo.
  - **M-log** (el `token_id` fuera del log de una ruta de la sincronización): test nuevo en `sync.test.ts`. **Muerto** al repetirlo.
- **Resultado final: 54 de 54 aplicables muertos.**

Los mutantes, por familia del encargo:
- **30, el adaptador de S3**: reserializar; escribir sin comparar; sobrescribir un archivo; el `409` de `If-Match` y el de `If-None-Match`; el `404` de `If-Match`; no mandar `If-Match`; un `403` por «no existe»; un `500` no transitorio; crear el registro con `Overwrite`.
- **31, la API**: `If-Match` viejo; sin `428`; escribir detrás de la primera rechazada; reimplementar `acceptAppend`; reescribir en lugar de añadir; el `412` de un olvido cruzado; publicar sin comprobar el instante; un `If-Match` débil; bytes no UTF-8 como texto; arrancar con cualquier clave; el paquete con tests.
- **32, los clientes**: sin `x-amz-content-sha256`, o sobre otros bytes; un 5xx leído como respuesta; un código desconocido que retiene; seguir una redirección; no comprobar el ETag; mandar la cookie con el token.
- **33, los datos de referencia**: `..`; el prefijo fuera; el `W/` no reconocido.
- **33 bis, el rehacer**: otro id; otro tipo; negado por lo que ya era inválido; `recordEvent` relajado; `recordRedo` alcanzable desde `add`; una corrección sin sus ids sellados.
- **34, lo heredado**: terminar por parecido; no esperar a otra unidad; no traducir entre unidades; no reintentar el nombre del archivo.
- **29 quater, `remote.json` y los estados**: después del marcador; no comparado; no barrido; en la web; S1 tomado por sincronizado; `init` tras desactivar; S1 con otro origen; S3 por deducción; terminar la inicialización sobre otros bytes; `join` o `init` sin `remote.json`; la consola sin terminar S0.

**Las extensiones de la propiedad** (punto 7). Cada mutante se corrió **antes** (la propiedad de la 014, copiada del commit anterior a `4c33112`) y **después**:

| Extensión | Mutante | Antes | Después |
|---|---|---|---|
| Unirse otra vez, repetido tras un corte | P3: una orden que archiva nunca toma el nombre siguiente | sobrevive | **muerto** |
| Cortar la web | W3: la web escribe el libro en una transacción aparte | sobrevive | **muerto** |
| Terminar con algo retenido | E1: una retenida de antes se queda también en la cola | sobrevive | sobrevive: **equivalente** (una línea retenida ya salió del libro al retenerla; excluirla otra vez es defensa en profundidad) |
| Terminar con algo retenido | E2: confirmar deja la línea retenida | sobrevive | sobrevive: **transitorio** (la sincronización siguiente la saca de la cola, y el estado no llega al final) |
| Terminar con algo retenido | P1: una retenida nueva se queda en la cola | muerto | muerto (no distingue) |
| El ejercicio cerrado | C1: confirmar sin las presentaciones que toca | sobrevive | sobrevive; no pierde ninguna línea. **Lo matan** los recorridos y los tests del cliente |
| Cortar la web | W1: la web da por hecha una escritura abortada; W2: no aborta ante una negativa | sobreviven | sobreviven; **equivalentes para la propiedad** (un aborto de IndexedDB deshace todo y no se pierde ninguna línea, criterio aceptado por la dirección). **Los matan** los tests unitarios del almacén web |

**Dicho con honestidad: la extensión «terminar con algo retenido» no tiene todavía un mutante que solo ella mate.**
- Llega al estado 117 veces de 240 y añade dos comprobaciones: que la réplica empiece por el remoto, y que una línea retenida no esté en la cola.
- Los tres candidatos que probé no sirven: uno es equivalente, otro transitorio y el tercero no distingue.
- Queda para la dirección si lo quiere antes de fusionar, o para la 018.

**Cuántas veces llega cada extensión** (4 semillas × 60 corridas = 240):
- terminar con algo retenido: 117;
- cortes de la web: 122;
- volver a unirse: 274, 66 de ellas repetidas tras un corte;
- reescrituras del remoto: 152;
- volver a descargar: 136;
- ejercicio cerrado retenido: 11.

### 24.7 La salida fiscal

**Predicción (§23.6): no se mueve nada. Resultado: no se mueve nada.**
- `apps/cli/test/sync/fiscal.test.ts` gana el caso «a ledger reordered by a sync through the API». Dos consolas sobre el mismo manejador con el doble de S3 se sincronizan con `atlas sync init`, `atlas sync join --from-remote` y `atlas sync`. El libro reordenado es byte a byte el remoto.
- `tax` (con `--lots`, `--boxes` y `--json`), `gains`, `income`, `m720`, `m721` y `filed` dan los mismos bytes con `sync/` y sin él.
- `git diff 2a23ec3 -- tests/fixtures` sale vacío.

### 24.8 El paquete

- **Web**: E3 solo toca el catálogo perezoso de errores (`errors`). **Arranque 75.836** (−9, ruido de la tabla; techo 75.869) y **total 283.285** (+127; techo 283.648). No hace falta subir nada.
- **Lambda**: `apps/api/dist-lambda/index.mjs`, de unos 1,44 MB con el SDK, a partir de 1.173 entradas, y `lambda.zip`, de unos 277 KB.

### 24.9 Decisiones propias, dichas (a confirmar por la dirección)

- `ObjectStore` gana `list(prefix)`, que es `ListObjectsV2` con `Delimiter`: el primer nivel, todas las páginas. Lo usan la lista de dispositivos y el índice de referencia.
- En S3, archivar y escribir el libro son dos escrituras condicionales, no un solo paso. Si otro escritor gana entre las dos, queda un archivo que es copia exacta de lo que fue el libro, y nunca se sobrescribe. Está dicho en el comentario de `s3-ledger.ts` y lo prueba un test.
- `GET /api/ledger` devuelve el cuerpo en base64 solo si los bytes no son UTF-8 válido.
- `If-Match` solo se acepta como `"<sha256>"` fuerte: débil, sin comillas, una lista o `*` dan `412`.
- `PUT /api/sync/devices/self` rechaza con `body_invalid` y `reason: last_sync_at` un `last_sync_at` que no sea un instante. Si lo aceptara, dejaría un objeto que ninguna petición volvería a leer.
- Los códigos propios de la consola para elegir entrada: `sync_remote_unknown`, `sync_credential_missing`, `sync_already_configured`, `sync_remote_mismatch`, `sync_origin_missing`, `init_remote_not_empty` e `init_remote_not_this_ledger`. Solo los dice la consola; E4 los llevará a la web si hacen falta.
- `atlas sync redo` enseña el plan (el borrador en JSON y los ids sellados) y pide confirmación. Sin terminal y sin `--yes` sale con 4, sin registrar nada.
- El paquete de la Lambda toma las compilaciones ESM del SDK (`mainFields: module, main`), que bajan de 2,1 a 1,4 MB. Lleva además un `createRequire` en la cabecera para los módulos del SDK que todavía piden `require`.

### 24.10 Documentos (para que los traslade la dirección)

- **`docs/api.md`**:
  - §5.5: quitar el SIN VERIFICAR (verificado en §23.1).
  - §5.1: la respuesta en base64 si los bytes no son UTF-8.
  - §5.2 y §5.5: el `If-Match` fuerte.
  - §5.3: `reason: last_sync_at`.
  - §6: el `W/` en `If-None-Match`.
- **`docs/data-schema.md` §1**: `sync/remote.json` implementado, y su temporal en el barrido.
- **La 017**:
  - `s3:ListBucket` que cubra `ledger/` (§23.1);
  - `s3:GetObject` en `archive/`: **no hace falta**, la API nunca archiva;
  - el artefacto es `apps/api/dist-lambda/lambda.zip`, con el *handler* `index.handler`.
- **La 018**:
  - la prueba real de si un `s3:ListBucket` con la condición `s3:prefix` convierte el `403` en `404`;
  - la carrera real de dos `PutObject` condicionales.

### 24.11 La máquina y las paradas

- Otros proyectos de la máquina (dos Gradle y el emulador de Android) dejaron la memoria disponible oscilando entre 500 y 3.500 MB.
- El sistema paró cuatro ejecuciones en segundo plano. Ninguna perdió nada:
  - el lanzador restaura con `git checkout` cualquier fuente que quede mutado, y lo dice;
  - se reanuda solo lo que falta;
  - cada veredicto se guarda en cuanto se conoce.
- Desde la decisión de la dirección, todo corre con `--pool=forks --maxWorkers=1`, y la propiedad con `NODE_OPTIONS=--max-old-space-size=1536`, detrás de una puerta que espera a tener 1.500 MB disponibles.

### 24.12 Tubería y congelado

Sobre `ccdbd40`, el último commit de código. El congelado solo añade esta sección a `questions.md`, que ningún test lee. Todo con `--pool=forks --maxWorkers=1`.

| Orden | Código de salida | Nota |
|---|---|---|
| `npm run lint` | 0 | |
| `npm run typecheck` | 0 | |
| `npm run test:coverage -- --pool=forks --maxWorkers=1` | 0 | 301 ficheros y 2.975 tests en 796 s. El dominio al 100 %: sentencias 8.263/8.263, ramas 4.946/4.946, funciones 1.849/1.849. Ningún `ECONNREFUSED` |
| la misma, repetida a continuación | 0 | 2.975 tests en 795 s. Ningún `ECONNREFUSED` |
| `npm run build` | 0 | Arranque 75.836 y total 283.285. La Lambda, 1.442.157 bytes |

- **Ningún test falló solo por el tiempo** en mis dos ejecuciones. No se subió ningún plazo. *(Corregido en §26.4: en la ejecución del revisor falló uno de la web por el tiempo, y ya no depende del reloj.)*
- Ningún gemelo `.js`.
- `git diff 2a23ec3 -- tests/fixtures` está vacío.
- El paso de la CI con `upload-artifact` sigue fuera de la rama, a la espera del permiso `workflow`.

**Commit congelado de E3: el que contiene esta sección.** Su SHA va en la PR de E3. Desde aquí no se empuja nada mientras dura la revisión.

## 25. Decisiones de la dirección sobre E3 (2026-09-26)

Tal como llegaron, con lo que se hizo con cada una.

- **La extensión «termina con líneas retenidas»: se acepta sin un mutante exclusivo.** Aporta cobertura de estados (117 de 240 corridas) y dos comprobaciones: que la réplica empiece por el remoto, y que una línea retenida no esté en la cola. Las razones por las que E1, E2 y P1 no sirven quedan en §24.6. **No se aplaza a la 018.**
- **Las seis decisiones de §24.9: aceptadas.** Con una condición sobre la segunda (archivar y escribir en S3 son dos escrituras condicionales): **un corte entre las dos tiene que dejar un estado seguro**. El archivo existe, el libro no ha cambiado y el reintento toma el nombre siguiente sin perder ni duplicar nada. **Hecho en `6b01733`**:
  - test «leaves a safe state when cut between the archive and the ledger, and the retry takes the next name» (`packages/adapters/test/aws/s3-ledger.test.ts`). El proceso muere en la escritura del libro, tras escribir el archivo. Queda el archivo con los bytes exactos del libro, y el libro sin tocar. El reintento con `withArchiveNames` escribe `pre-restore-2.jsonl`, deja el primero intacto y escribe el libro una sola vez: dos archivos, los dos copia exacta;
  - **su mutante, S3C** (reutilizar un archivo que ya guarda exactamente estos bytes en lugar de tomar el nombre siguiente): **sobrevive** a los tests anteriores (los de `f84b743`) y **muere** con el nuevo;
  - dos mutantes más del mismo punto, que **ya mataban** los tests anteriores (la carrera perdida y «nunca sobrescribe un archivo») y el nuevo también: S3A (el archivo escrito después del libro) y S3B (el archivo escrito sin `If-None-Match`).
- **§24.10: los documentos los llevo yo, en esta PR**, por orden expresa de la dirección. **Hecho**:
  - `docs/api.md`: la nota de puesta al día de E3; §5.1, el cuerpo en base64 si no es UTF-8, la comprobación del ETag fuerte o débil y que CloudFront no comprime `application/x-ndjson`; §5.2, `If-Match` solo fuerte y la carrera verificada (412 o 409, traducidos a 412); §5.3, `reason: last_sync_at`; §5.5, fuera el SIN VERIFICAR, con lo verificado (404 de `If-Match` sin objeto, escritura con `If-None-Match: *`); §6, `W/` y `*` en `If-None-Match`.
  - `docs/data-schema.md` §1: una fila para `sync/remote.json`, con su lectura, quién lo escribe y cuándo, el estado a medias, la carpeta sin él y su temporal en el barrido. La fila de `credentials.json` deja de decir «sin implementar todavía».
  - `docs/decision-roadmap.md`: en la 017, `s3:ListBucket` que cubra `ledger/` (y que la API no necesita `s3:GetObject` en `archive/`) y el artefacto de la Lambda (`apps/api/dist-lambda/lambda.zip`, `index.handler`); en la 018, la prueba real de si `s3:ListBucket` con `s3:prefix` convierte el `403` en `404`, y la carrera real de dos `PutObject` condicionales.

**Tubería**: `npm run lint` 0 y `npm run typecheck` 0 antes de cada empuje. Los cambios de esta sección son un test (`6b01733`) y documentos. El test pasa con `--maxWorkers=1`, y sus tres mutantes están arriba. El resto del código es el de `ccdbd40`, con `test:coverage` dos veces en 0 y `build` en 0 (§24.12). La CI `verify` va en el comentario de la PR #96.

**Commit congelado: el que contiene esta sección.** Su SHA va en la PR #96. Desde aquí no se empuja nada mientras dura la revisión.

## 26. Revisiones de la PR #96: decisiones de la dirección y correcciones (2026-09-26)

Las dos revisiones se hicieron sobre el congelado `57ea212`. Aquí van las decisiones de la dirección, lo que se hizo con cada una y el commit que lo lleva.

### 26.1 Seguridad

- **B1 (bloqueante): una línea con un suplente suelto dejaba el remoto en bytes que no son UTF-8.** La API respondía `200` y escribía `ED A0 80`. Desde ahí, toda escritura por la API daba `500` y todo cliente paraba con `transport_rejected`. **Hecho**:
  - `d8c7885`, el dominio: rechaza la línea antes de juzgarla (`/\p{Cs}/u`, `holdsLoneSurrogate`). En el append responde `body_invalid` con `reason: "lone_surrogate"`, y en el init, `init_rejected` con `code: "lone_surrogate"` y la línea. `rawLinesText` también la rechaza (`raw_lone_surrogate`), para que ningún almacén la escriba. Un par de suplentes bien formado sigue valiendo.
  - `ea164f1`, la API: antes de escribir en S3 comprueba que los bytes son UTF-8 (`utf8Of`, con `TextDecoder` y `fatal: true`). Si no lo son, no escribe: `body_invalid`/`not_utf8` en el append e `init_rejected`/`not_utf8` en el init.
  - **Tests**: la línea da `400` en el append (y el remoto se sigue pudiendo leer y escribir) y `422` en el init, y en los dos casos los bytes remotos no cambian.
  - `raw_lone_surrogate` tiene su frase en las dos interfaces.
- **N1: las rutas de referencia reciben un puerto de solo lectura limitado a sus dos prefijos** (`referenceReader`, `9ff94b1`).
  - Rechaza cualquier otra clave o prefijo antes de preguntar a S3, y no tiene ninguna escritura.
  - `sync.ts` ya no recibe ningún `ObjectStore`: el libro le llega por `AppendOnlyLedger`, los dispositivos por `DeviceStore` y la referencia por `ReferenceReader`.
  - El test de estructura amplía su expresión a `putIfMatch`, `putIfNoneMatch`, `LEDGER_KEY` y `"ledger/`, y exige que `sync.ts` no nombre `ObjectStore` ni `objects`.
- **N2: `lambda.ts` captura el fallo de arranque** (`composeOrFail`, `9ab0145`). Registra una línea con `code: "compose_failed"` y solo `error_name`, y relanza `new Error("compose_failed")`. El test usa un `AccessDeniedException` con el ARN en el mensaje: ni el registro ni el error relanzado lo llevan.
- **N3: el dominio rechaza en el append y en el init una línea con una clave repetida**, a cualquier nivel (`d8c7885`): `body_invalid`/`duplicate_key` e `init_rejected`/`duplicate_key`.
  - Lo decide `repeatsKey`, que recorre el texto exacto porque `JSON.parse` se queda con la última clave sin avisar.
  - Compara las claves decodificadas: `"name"` y `"name"` son la misma.
  - Una misma clave en dos objetos distintos, dentro de una cadena o repetida como cadena dentro de un array sigue valiendo (`2ecf09f` añade el caso del array).
  - **Pendiente para la dirección**: si el cargador local (`decodeLine`) debe rechazarlas también. No se ha tocado.
- **N4: los centinelas cubren un error del SDK no transitorio** (`57fcfa0`). Es un `AccessDenied` de `SdkObjectStore` con el bucket, la clave y el ARN en el mensaje. La respuesta es `500 internal`, el registro lleva `reason: "AccessDenied"`, y ni el registro, ni `stdout`, ni `stderr` llevan el bucket, la clave o la cuenta. Es un test de guarda, sin cambio de lógica: hoy no había fuga, porque el manejador ya registraba solo el nombre.

### 26.2 Corrección

- **N1: `atlas sync redo` es idempotente** (`8c81c8c`).
  - Si el rehacer ya está en el libro con sus identificadores sellados (`redoRecorded`, por los ids sellados y con la misma regla que `finishRedo`), se salta el registro y solo termina. Lo dice: «ya estaba registrado… se termina, sin registrar nada otra vez».
  - Test del corte: se registra el plan, se muere antes de terminar y se repite la orden. Sale con 0, no registra nada otra vez y deja `resolved`/`redone`, así que la traducción entre unidades se conserva.
- **N2: la fila `unreadable`** de `GET /api/sync/devices` queda en `docs/api.md` §5.3 y tiene su test (`6f49ab3`): `{ device_id, state: "unreadable" }`, nunca omitida. **Anotado para E5**: `compact` y la restauración se niegan mientras haya un dispositivo ilegible.
- **N3: las dos decisiones que faltaban de §24.9, aceptadas**: `redo` sale con 4 sin terminal, y `mainFields` y `createRequire` en el paquete de la Lambda.
  - **`confirm` sin terminal**: la función compartida (`apps/cli/src/commands/shared.ts`) lanza `ConfirmationRequired`, que es la salida 4, y con un «no» devuelve `false`.
  - Todas las órdenes que preguntan salen con 0 ante un «no», sin tocar nada: `compact`, `ca`, `edit`, `delete`, `draft discard`, `lock break`, `fx correct`, `add` y `sync redo`. `redo` es coherente con ellas.
  - `atlas sync confirm <unidad>` no pregunta, y es a propósito. No registra ningún evento nuevo: devuelve a la cola una línea que ya estaba escrita. La orden misma es la decisión explícita.
  - `draft confirm`, que sí registra un evento, enseña la vista previa y pregunta.
- **N4: `apps/web/test/prices.test.tsx`** («offers to delete them in Ajustes…») espera una condición y no un tiempo fijo (`c3e9172`). Usa `until` en `apps/web/test/helpers/render.tsx`, que comprueba cada 10 ms y falla, diciendo qué esperaba, a los 10 s.
  - **La frase de §24.12 no era cierta**: en la ejecución del revisor, ese test falló por el tiempo con la máquina cargada. Está corregida abajo.
- **N5: el cuerpo de la PR** está al día: el congelado, la casilla **Docs** y esta ronda.
- **Observación sobre E1: el revisor tenía razón, E1 no era equivalente, y el error fue mío.**
  - En el hueco que deja a propósito el orden de `commit` (`held.jsonl` antes que el libro), una línea está en los dos sitios.
  - La sincronización siguiente termina el movimiento solo porque `settle` excluye también lo retenido de antes (`heldLines`). E1, que excluye solo lo retenido nuevo, la dejaría en la cola además de retenida.
  - **Además, E1 ya lo mataban dos tests de la 014** en `folder-store.test.ts` («loses no line with a cut between what is held back and the ledger» y el del corte dentro de la reescritura).
  - En §24.6 solo lo corrí contra la propiedad, y de «la propiedad no lo mata» deduje «equivalente». Era una conclusión que los datos no sostenían.
  - `961d555` añade el caso explícito: se corta en `open ledger.jsonl.tmp` y la sincronización siguiente deja la línea solo retenida.
  - **Corrige §24.6**: E1 no es equivalente. La extensión «termina con líneas retenidas» sigue sin un mutante que solo ella mate, pero E1 no era la prueba de que no pudiera tenerlo.

### 26.3 Mutantes: antes (los tests de `57ea212`) y después

Con `mutate-015.mjs`, de uno en uno, detrás de la puerta de memoria y con `--pool=forks --maxWorkers=1`, en tres lotes de 8. «Antes» son los ficheros de test tal como estaban en `57ea212`, copiados junto a los de ahora.

| Id | Mutante | Antes | Después |
|---|---|---|---|
| B1a | un append con un suplente suelto se juzga | sobrevive | **muerto** |
| B1b | un init con un suplente suelto o una clave repetida se juzga | sobrevive | **muerto** |
| B1c | `rawLinesText` escribe un suplente suelto | sobrevive | **muerto** |
| B1d | `utf8Of` deja pasar bytes que no son UTF-8 | sobrevive | **muerto** |
| N3a | una clave repetida no se rechaza | sobrevive | **muerto** |
| N3b | las claves se comparan por su texto crudo (`"n\u0061me"` distinto de `"name"`) | sobrevive | **muerto** |
| N3c | toda cadena tras una coma se toma por clave (también dentro de un array) | sobrevive | **muerto** |
| SN1 | el puerto de referencia deja pasar cualquier clave | sobrevive | **muerto** |
| SN2 | el fallo de arranque se relanza entero | sobrevive | **muerto** |
| CN1 | un rehacer ya registrado se registra otra vez | sobrevive | **muerto** |
| CN2 | la fila de un dispositivo ilegible se omite | sobrevive | **muerto** |
| E1 | una retenida de antes se queda también en la cola | **muerto** (ya lo mataban dos tests de la 014) | muerto |

**12 de 12 muertos después; 11 de 11 sobrevivían antes**, y E1 ya moría.

- **El mutante de la llamada**, quitar la comprobación `utf8Of(...)` antes de `appendLines`, es **equivalente** mientras el dominio rechace el suplente suelto: por HTTP no se puede llegar a él. Es defensa en profundidad, por orden de la dirección, y lo que se prueba es la función (B1d).
- Seguridad N4 y corrección N4 son tests, sin lógica, así que no llevan mutante.

### 26.4 Corrección a §24.12

En §24.12 dije «Ningún test falló solo por el tiempo». En mi ejecución fue así, pero en la del revisor falló uno de la web (`prices.test.tsx`, por un `settle(30)`), así que la frase no se sostiene. Ya no depende del reloj (§26.2, N4).

*(Corregido el 2026-09-27, §27.1: `c3e9172` esperaba el botón y el primer aviso, pero la última aserción, «Sin precios automáticos…», seguía sin esperar. Con la máquina cargada podía fallar igual. Ahora espera también con `until`.)*

### 26.5 Tubería y congelado

Todo con `--pool=forks --maxWorkers=1`:
- `lint`, `typecheck` y las dos `test:coverage`, sobre `2ecf09f`, el último commit de código;
- `build`, sobre `9d45cdb`.

| Orden | Código de salida | Nota |
|---|---|---|
| `npm run lint` | 0 | |
| `npm run typecheck` | 0 | |
| `npm run test:coverage -- --pool=forks --maxWorkers=1` | 0 | 302 ficheros y 2.993 tests en 833 s. El dominio al 100 %: sentencias 8.310/8.310, ramas 4.974/4.974, funciones 1.852/1.852. Ningún `ECONNREFUSED` |
| la misma, repetida a continuación | 0 | 2.993 tests en 963 s. Ningún `ECONNREFUSED` |
| `npm run build`, sobre `2ecf09f` | **1** | El arranque medía 75.885 contra el techo de 75.869 |
| `npm run build`, sobre `9d45cdb` | 0 | Arranque 75.885 contra el techo nuevo de 75.905; total 283.429 |

- **El techo del arranque subió después del commit que lo necesitaba, al revés de la regla** («subido ANTES del commit que lo necesite»).
  - La comprobación de `rawLinesText` (seguridad B1) cuesta **+37** en el arranque, porque el almacén del navegador está en el camino del arranque. Otros **+12** son ruido de la tabla de fragmentos perezosos.
  - Por eso **el *build* estuvo en rojo desde `d8c7885` hasta `2ecf09f`**, y la CI `verify` de esos empujes también.
  - La tubería lo encontró antes de congelar, y **`9d45cdb`** sube el techo a lo medido + 20 (75.905). Queda dentro de la autorización de §7 P13 (hasta 76.069), en su propio commit y con el desglose y la tendencia en el comentario de `check-bundle.mjs`.
  - El tramo en rojo queda anotado, sin reescribir la historia, como en §21.
- Probé a poner la comprobación en línea en lugar de compartida con la sincronización, y pesa lo mismo (75.885).
- **Ningún test falló solo por el tiempo** en estas dos ejecuciones. *(Precisión del 2026-09-27, §27.1: no depender del tiempo no estaba asegurado. El test de la web aún tenía una aserción sin esperar a su condición.)*
- `git diff 2a23ec3 -- tests/fixtures` está vacío.
- Ningún gemelo `.js`.

**Commit congelado: el que contiene esta sección.** Su SHA va en la PR #96. Desde aquí no se empuja nada mientras dura la revisión.

## 27. E4 — el plan, antes del código (2026-09-27)

Sobre `1e7c91c` (E3 fusionada: PR #96, ronda 2 convergida).

### 27.1 Lo que dejó E3

- **N4, que seguía abierto** (`7294514`): el test de Ajustes de `apps/web/test/prices.test.tsx` espera también con `until` al segundo aviso, «Sin precios automáticos…». Quedan corregidos §26.4 y §26.5, que lo daban por hecho.
- **El techo del arranque de E3 subió después del commit que lo necesitaba.** Queda anotado en §26.5, sin reescribir la historia. **En E4, el techo se sube siempre antes**: se mide con un prototipo construido y deshecho, y la subida va en su propio commit, delante del que la necesita.

### 27.2 Q12 — el cargador local ante una línea con claves repetidas (propuesta; no se implementa hasta que decida la dirección)

- **Hoy** `decodeLine` usa `JSON.parse`, que se queda con la última de dos claves iguales sin avisar. Una línea editada a mano con `"amount":"1000.00", …, "amount":"1.00"` carga como 1.00.
- **La API ya la rechaza** (E3, seguridad N3), con `body_invalid`/`duplicate_key`. Pero **`body_invalid` para la petición entera, no para esa línea**: un cliente que intentara subirla pararía la sincronización en cada intento, y no la retendría.
- **Opciones**:
  - **(a)** El cargador la rechaza, como una línea ilegible: el libro entero deja de cargar. Es fallo cerrado, pero deja sin sus datos a quien tiene un fichero de veinte años por una sola línea.
  - **(b)** La proyección degradada (ADR-0015) la marca como **inválida**, con `duplicate_key` y su id. Se sigue leyendo, `atlas check` y la web la señalan, y **la sincronización la retiene en el paso 3** con `domain_rejected` antes de subirla, así que el `400` de la API nunca llega a darse.
  - **(c)** No hacer nada: la línea la escribe solo una edición a mano, y `atlas check --deep` podría avisar.
- **Recomiendo (b)**, que es la inclinación de la dirección. No bloquea nada entero, deja el problema a la vista con su id y hace que la sincronización retenga en vez de parar.
  - **Coste**: una comprobación del texto exacto en `decodeLine` (`repeatsKey` ya existe en el dominio). Está en el camino del arranque, así que se mide antes.
  - **Una consecuencia que decidir con ella**: si la API debe responder a esa línea con un **rechazo por línea** (`line_invalid`, `domain_code: duplicate_key`, dentro del `200`) en vez de `body_invalid`. Así, un cliente antiguo que no la haya marcado como inválida la retendría en vez de parar. Hoy recomiendo mantener `body_invalid`, porque ningún cliente de la aplicación la produce.

### 27.3 El orden de E4 (encargo §3 E4; plan §14, punto 4)

1. **Bloque 1, P2 y P3**:
   - se mide el parche `specs/014-ledger-sync-core/deferred/p2-p3-web.patch` sobre este árbol con un prototipo, y se deshace;
   - si hace falta, **la subida del techo del arranque en su propio commit, antes**;
   - el test del parche (`transfer-sync.test.ts`), visto en rojo sin el código;
   - el código de P2 y P3.
2. **Solo después, en su propio commit, se afloja el guardián de E1** («the web cannot configure the sync before P2 and P3»), y en ese mismo commit la configuración se hace alcanzable. Lleva un mutante: el guardián aflojado no deja pasar lo que P2 y P3 protegen.
3. **Bloque 2, la ligadura** (P1 (a), `device_forgotten`), en §27.4.
4. **Bloque 3, las pantallas**, en §27.5.
5. **Bloque 4, los dos fallos de la 014 (P11)**, cada uno con su test en rojo primero:
   - presentar una declaración con una huella repetida pide confirmación en lugar de negarse (`confirmDuplicate`);
   - el formulario de eventos corporativos avisa del ejercicio cerrado, como la consola.
6. Las capturas, los mutantes, la tubería, la CI, el congelado y la PR.

### 27.4 La ligadura del dispositivo de la web (bloque 2) — PROPUESTA

- La web se sincroniza con **su propio origen**, con la cookie. Su `device_id` sale de `GET /api/session`, y la API lo toma de la cookie firmada, nunca del cuerpo.
- **Qué pasa si la sesión trae un `device_id` distinto del que se unió.** El anterior fue olvidado, o la API no lo aceptó al iniciar sesión.
  - **Propuesta**: la web guarda con qué dispositivo se unió, en una clave `sync:remote` de su almacén, **con el mismo formato que `sync/remote.json` de la consola** (`{ format: 1, origin, device_id }`). La escriben inicializar y unirse, en **la misma transacción** que el marcador.
  - Así la web tiene los mismos estados que la consola (S0-S3, con las mismas funciones del dominio). **Esto deshace una decisión propia de E3** («la web no tiene `remote.json`»): lo digo aquí para que la dirección lo vea.
  - Antes de sincronizar, si el `device_id` de la sesión no es el de `sync:remote`, la web **se niega** con `sync_device_changed`. La frase dice qué pasó y que la salida es **unirse otra vez**, desde la nube o con sus operaciones: lo pendiente nunca se pierde y unirse es explícito.
  - Unirse de nuevo reescribe `sync:remote` con el dispositivo nuevo.
- **`device_forgotten`** en cualquier respuesta: la web lo dice («este navegador fue olvidado en la nube: vuelve a iniciar sesión») y no retiene nada, como todo fallo remoto (V4). Al volver a iniciar sesión recibe un id nuevo y cae en el caso de arriba.
- **La IndexedDB copiada**: no se detecta. Riesgo aceptado y documentado (Q6).

### 27.5 Las pantallas (bloque 3)

- En la sección perezosa de Ajustes (Q7), dentro de la tarjeta de Sincronización, **solo con sesión**:
  - **Estado y botón**: pendientes, retenidas y cuánto hace de la última sincronización.
  - **Empezar**: inicializar, unirse desde la nube o unirse con mis operaciones.
  - **Lo retenido**: el motivo y las tres resoluciones. Rehacer enseña el plan y pide confirmación, como la consola.
  - **Desactivar**, que se niega con pendientes.
  - **Volver a descargar**, que solo se ofrece tras `remote_rewritten`.
  - Y el aviso de que lo que se ve antes de sincronizar puede cambiar después.
- **Nada sincroniza al arrancar**, con un temporizador ni al recuperar la conexión: los guardianes de la 014 siguen en verde.
- **El modo privacidad**: lo retenido enseña el tipo, la fecha y el motivo, y cualquier importe va por `Amount`, que lo tapa. Un test **renderiza** con la privacidad puesta y busca que no aparezca ningún importe.
- Los mensajes de la web de `sync_deactivated` y `join_required` nombran **los botones** de unirse (N11).

### 27.6 El paquete

- Partida sobre `1e7c91c`: **arranque 75.885 (techo 75.905) y total 283.429 (techo 283.648)**.
- Autorización:
  - **el arranque, hasta 76.069**;
  - **el total, hasta 304.640** (280.064 + 24 KB).
- Cada subida en su propio commit, **antes** del que la necesita, con la medida, el desglose y la tendencia.

## 28. E4 — la entrega (2026-09-27)

La web sincronizada, en el orden del encargo (§3 E4) y de §27.3. **Código congelado en `62e7be9`**; este informe va en el commit siguiente, solo de documentos. Todo contra los dobles de S3, SSM y Google; ni AWS ni Google.

### 28.1 Lo que hay, bloque a bloque

- **Antes de nada** (lo pedido por la dirección al abrir E4):
  - el test de precios espera también a «Sin precios automáticos…» (`7294514`); §26.4 y §26.5, corregidas;
  - Q12 (claves repetidas en el cargador local) escrita como propuesta en §27.2, **sin implementar**: espera la decisión de la dirección;
  - los techos se suben **siempre antes** del commit que los necesita, cada uno en su commit (`f8c9de0`, `6fd376a`, `4512665`, `68b7a8f`).
- **Bloque 1, P2 y P3** (`4dc3c5f`, `7d051fb`): el parche diferido de la 014, aplicado a mano. `replaceLedgerText` lee el estado de la sincronización en su misma transacción y se niega con `import_refused_synced`; la exportación da el libro byte a byte y, aparte, lo retenido sin resolver (`ledger.held.jsonl`).
- **La ligadura del dispositivo de la web** (opción (a) de P1; `b342ba7`, `ef1d593`, `344be41`):
  - la web guarda con qué dispositivo se unió en la clave `sync:device` de su almacén, escrita **primero y en la misma transacción** que el marcador, y comparada al escribir;
  - antes de sincronizar o volver a descargar, si el dispositivo de la sesión no es ese, se niega con `sync_device_changed` (o `sync_device_unknown` si no lo sabe); empezar y unirse los decide `webJoinRefusal` en el dominio;
  - `device_forgotten` llega como cualquier fallo remoto (V4): la frase dice que se vuelva a iniciar sesión, y con el id nuevo la web cae en `sync_device_changed`, cuya salida es unirse otra vez;
  - **encontrado de paso y arreglado** (`344be41`, test en rojo primero): la importación no contaba `sync:device` entre las claves de la sincronización, así que un navegador con solo esa clave se podía importar encima. Ahora la cuenta, y el guardián nuevo (abajo) exige que la importación lea **todas** las claves que escribe el almacén.
- **El guardián de la D-Q17, reemplazado** (`969786e`), en el commit que hace alcanzable la configuración y después de P2 y P3:
  - un único módulo de la web configura la sincronización, `apps/web/src/sync/engine.ts`, cargado solo desde la sección perezosa de Ajustes. Fuera de él, la web solo importa de las puertas de la sincronización los nombres de solo lectura, nunca de forma dinámica, y ningún fichero nombra una clave `sync:*`;
  - el cliente y la orquestación solo se alcanzan a través del motor, por cualquier camino (reexportaciones y rutas relativas incluidas);
  - P3: ningún módulo de la web importa la exportación sin lo retenido. P2: `replaceLedgerText` pregunta a `importPermission` y lee cada clave `SYNC_*_KEY` del almacén;
  - `check-bundle.mjs` pierde las dos familias de la D-Q17 y la lista de nombres de solo lectura; `LAZY_ONLY` mantiene todo eso fuera del arranque. El guardián «sin temporizador» de la 014 cubre ahora también el motor y la sección de Ajustes;
  - **mutantes G1–G8, 8 de 8 muertos** (§28.3).
- **Bloque 3, las pantallas** (`3d9dbd8`, `3e2d3b1`), dentro de la tarjeta «Sincronización» y solo con sesión:
  - estado (pendientes, retenidas, última sincronización) y «Sincronizar»;
  - empezar: «Subir mis datos a la nube», «Unirme desde la nube» y «Unirme con mis operaciones», cada uno con su pregunta antes de escribir;
  - lo retenido: el motivo (con las cifras tapadas por la privacidad, como toda la prosa de la web), el tipo, la fecha y el importe por `Amount`; las resoluciones que ofrece el dominio; rehacer enseña el plan y pide «Registrar» (y, si sale repetida, «Registrarla aunque parezca repetida»);
  - «Desactivar», que se niega con pendientes; «Volver a descargar», solo tras `remote_rewritten` y con pregunta;
  - el aviso de que lo que se ve antes de sincronizar puede cambiar después;
  - N11: las frases de la web de `sync_deactivated` y `join_required` nombran los dos botones de unirse.
- **Bloque 4, P11** (`66a71b0`, `c22bf0f`), cada uno con su test en rojo primero:
  - «Registrar lo presentado» ya no se niega ante una huella repetida: pregunta con el diálogo de duplicados y registra con `confirmDuplicate` (ADR-0012);
  - el formulario de eventos corporativos calcula los ejercicios cerrados al «Ver el efecto» y enseña `ClosedYearNotice` antes de «Registrar» (ADR-0020), como la consola.

### 28.2 Desviaciones del plan de §27, dichas

- **`sync:device` en lugar de `sync:remote`** (§27.4): la web guarda **solo el id del dispositivo**, no un `remote.json` completo. El origen de la web es siempre el suyo propio, y el analizador estricto de `remote.json` exige `https://`, que en las capturas locales (http) no se cumple. Los estados son los mismos (los decide el dominio con `webSyncRefusal` y `webJoinRefusal`).
- **Una configuración de TypeScript nueva para tests**: `apps/web/tsconfig.test-api.json`, que el proyecto de la web excluye. Solo la usan los tres ficheros que tienen la API de los tests como red (`test/sync/api-support.ts`, `engine.test.ts`, `sync-card.test.tsx`), como ya hacen `apps/cli/tsconfig.test.json` y `packages/adapters/tsconfig.test-sync.json`. No hay dependencia nueva.
- **Dos códigos propios de la web** (`init_remote_not_empty`, `init_remote_not_this_ledger`) se dicen en `routes/ajustes/sync/sync-texts.ts`, no en el catálogo de errores: no son códigos del dominio (la consola también los dice por su cuenta).

### 28.3 Mutantes

Por lotes, secuenciales, con el guardián de memoria; los ficheros de cada lote en el *scratchpad* (`015-e4-guards.json`, `015-e4-card.json`).

- **Lote G, el guardián que sustituye a la D-Q17 (8 de 8 muertos)**:
  - G1: otro módulo de la web importa por nombre algo que escribe;
  - G2: un módulo de la web reexporta el cliente por una ruta relativa;
  - G3: otro módulo de la web usa `BrowserSyncStore`;
  - G4: el motor carga el cliente con un `import()` dinámico;
  - G5: la exportación de la web deja fuera lo retenido (P3);
  - G6: la importación olvida la clave del dispositivo (P2);
  - G7: la importación reemplaza sin preguntar a `importPermission` (P2);
  - G8: el motor sincroniza con un temporizador.
- **Lote C, el motor, la tarjeta y P11 (9 de 10 muertos a la primera; 10 de 10 después)**:
  - C1: la tarjeta sincroniza sea cual sea el dispositivo;
  - C2: el motor sincroniza sin comprobar el dispositivo;
  - C3: empezar no guarda el dispositivo de la sesión;
  - C5: empezar escribe sin preguntar;
  - C6: un importe retenido se enseña como cifra, sin `Amount`;
  - C7: «Volver a descargar» aparece tras cualquier sincronización;
  - C8: rehacer registra sin enseñar el plan;
  - C9: «Registrar lo presentado» confirma sin `confirmDuplicate`;
  - C10: el formulario corporativo no dice el ejercicio cerrado;
  - **C4 sobrevivió** (el motor pasa «unirse» a `webJoinRefusal` también al inicializar). No era equivalente: el test solo probaba inicializar otra vez con el mismo dispositivo, donde las dos cosas se niegan igual. `4fb9835` añade el caso que las distingue (inicializar con la sesión de otro dispositivo se niega; unirse, no). Visto sobrevivir antes y morir después.
- **La corrección de la importación** (`344be41`): su mutante es el código de antes (no contar `sync:device`), visto en rojo antes del arreglo; G6 lo repite contra el guardián.

### 28.4 El paquete

| Momento | Arranque | Techo | Total | Techo |
|---|---:|---:|---:|---:|
| Partida (`1e7c91c`) | 75.885 | 75.905 | 283.429 | 283.648 |
| P2 y P3 | 75.900 | 75.920 | 284.240 | 284.496 |
| La ligadura del dispositivo | 75.895 | 75.920 | 284.533 | 284.789 |
| La tarjeta de la sincronización | 75.999 | 76.024 | 297.515 | 297.771 |
| P11 y la tarjeta en tres ficheros | 76.026 | 76.051 | 298.392 | 298.648 |
| **Congelado** | **76.030** | 76.051 | **298.381** | 298.648 |

- **Dentro de la autorización**: el arranque, hasta 76.069 (quedan 39); el total, hasta 304.640 (quedan 6.259).
- **En el arranque no hay código de la sincronización.** Lo que sube es:
  - la tabla de exportaciones del trozo del dominio, que ahora sirve también al trozo perezoso de la sincronización (+60);
  - `reloadLedger`, que antes se quitaba del arranque (+44);
  - la tabla de trozos perezosos, con uno más, `DuplicateDialog` (+27).
- **El total** es casi todo de `ajustes` (la tarjeta, el motor y el cliente) y de `sync` (el motor del dominio).
- **Cada subida de techo va en su commit, antes del que la necesita**, con la medida, el desglose y la tendencia en el comentario de `check-bundle.mjs`.

### 28.5 Commits en rojo por sí solos, dichos

- **`4dc3c5f`** (el test de P2 y P3 solo) no compila ni pasa sin `7d051fb`. Desde entonces, test y código van en el mismo commit, con el rojo visto antes en local.
- **`b342ba7`** se hizo con la construcción en rojo: `SYNC_DEVICE_KEY` se exportaba del almacén y no estaba en la lista de solo lectura del paquete. Arreglado en `ef1d593`. Desde entonces cada commit pasa antes por un guion que para si fallan el lint, los tipos o la construcción.

### 28.6 Capturas

En `~/personal/atlas/privado/capturas/2026-09-27-015-e4/`, con el libro sintético del repositorio (`tests/fixtures/ledger/synthetic-v1.jsonl`), el servidor local de la API y Chromium 153. Tres contextos de navegador, que son tres dispositivos. Cada escena, a 400×890 DPR 3 y a 2045×1141 en claro y en oscuro:

- `vacio-*`: un libro vacío con sesión, con los tres «empezar»;
- `subir-pregunta-*`: la pregunta antes de subir;
- `sincronizado-*`: 199 operaciones subidas, pendientes 0 y la hora de la última sincronización;
- `retenida-*`: otro navegador, con el libro entero, se une desde la nube. Su última línea (una valoración) queda retenida con su motivo, el tipo y la fecha, y la privacidad puesta.

**Ningún desbordamiento horizontal** en ninguna (`medidas.json`). Tras la primera pasada separé los títulos «Sincronizar» y «Retenidas» con `block-title`, y la última sincronización dice también la hora (`62e7be9`).

### 28.7 La tubería y la CI

Sobre `62e7be9`, con `--pool=forks --maxWorkers=1`, cada paso tras el guardián de memoria:

| Paso | Código de salida | Tiempo |
|---|---:|---:|
| lint | 0 | 2 s |
| typecheck | 0 | 3 s |
| cobertura, 1.ª | 0 | 848 s |
| cobertura, 2.ª | 0 | 1.036 s |
| build (incluido `check-bundle`) | 0 | 14 s |

- **3.025 tests** en 307 ficheros. El dominio, al 100 % en líneas, ramas, funciones y sentencias.
- **Dos incidencias antes de esta pasada limpia, dichas**:
  - **La primera cobertura dio 99,97 % de ramas** (`packages/domain/src/ecb/propose.ts:95`, que E4 no toca), con los mismos 3.025 tests en verde. La rama sí se ejecuta: un test del dominio que ya existía («never overwrites what was typed…») mata el mutante que la quita. La repetición limpia, sobre el mismo commit, da 100 %. **Es intermitente, en la fusión de la cobertura entre proyectos.** No subí ningún umbral ni añadí un test que no aporta; lo dejo anotado por si vuelve.
  - **La segunda cobertura de aquella pasada la estropeé yo**: mientras corría, lancé coberturas sueltas del dominio para investigar lo anterior, y borraron su directorio `coverage/.tmp`. Además probé un mutante en `propose.ts` en ese rato. Por eso repetí la tubería entera sin tocar nada. Error mío; la regla (nada en paralelo a la tubería) no admite excepción.
- **La CI**: corre al abrir la PR (solo `pull_request`); su resultado está en la PR.

### 28.8 Pendiente para la dirección

- **Q12**: la propuesta de §27.2, sin implementar.
- **Q6**: la IndexedDB copiada a otro navegador no se detecta. Riesgo aceptado; queda por escribir en la documentación.
- **Documentos** que describen lo que cambia y que no toco (`docs/` es de la dirección):
  - `docs/api.md` §5.4: la ligadura de la web con `sync:device`;
  - `docs/data-schema.md`: la clave `sync:device` del almacén del navegador y `ledger.held.jsonl` junto a la exportación;
  - `docs/specification.md`: la tarjeta de sincronización de la web.

## 29. Las decisiones de la dirección sobre E4 (2026-09-27)

- **Q12, opción (b).**
  - La proyección degradada marca la línea con una clave repetida como inválida, con `duplicate_key` y su id. `atlas check` y la web la señalan, y la sincronización la retiene con `domain_rejected` antes de subirla.
  - La API mantiene `body_invalid`.
  - **Se implementa al empezar E5, no en la PR #97.**
  - **Se mide antes**: al arranque le quedan 18 bytes hasta el tope de 76.069 (hoy 76.030 medido, techo 76.051). Si no cabe, se para y se propone de dónde sacar los bytes. **El tope no se sube.**
  - Anotada en `docs/data-schema.md` §2.
- **Desviaciones de §28.2, aceptadas**:
  - `sync:device` en lugar de `sync:remote`;
  - `apps/web/tsconfig.test-api.json`.
- **La cobertura intermitente de `ecb/propose.ts:95`**: anotada. Sigue pendiente de que el usuario dé el permiso `workflow` para el cambio de la CI que guarda la cobertura (el stash `ci-015-upload-artifact`).
- **Los dos commits que no pasan solos** (`4dc3c5f`, `b342ba7`): anotados, sin reescribir la historia.
- **Documentos, por orden expresa de la dirección, en la PR #97**:
  - `docs/api.md` §5.4: con qué dispositivo se une la web, las negativas, y `device_forgotten`;
  - `docs/data-schema.md` §1: la clave `sync:device`, `ledger.held.jsonl`, la importación negada mientras se sincroniza, y las cuatro claves `sync:*`;
  - `docs/data-schema.md` §2: la nota de Q12, opción (b);
  - `docs/specification.md` §9.6: la tarjeta de sincronización de la web.

## 30. Las revisiones de la PR #97 (ronda 1): decisiones y entrega (2026-09-27)

Revisiones: seguridad (comentario 5853136492) y corrección (comentario 5853214458), las dos sobre `35fbd0c`.

### 30.1 Las decisiones de la dirección

- **Seguridad**:
  - **B1**, que coincide con N2 de corrección: la comprobación del dispositivo pasa al servidor.
    - Cabecera `x-atlas-expected-device`, obligatoria con la cookie. Sin ella, `400`; con otro dispositivo, `409 sync_device_changed`, sin escribir nada.
    - El motor relee la sesión antes de sincronizar y de volver a descargar.
    - Documentado en `docs/api.md` §5.4 y §7, y con un test del cambio de sesión entre el pintado y el clic.
  - **B2**: el mensaje de la exportación nombra `ledger.held.jsonl` y cuántas operaciones lleva; el fichero tiene su propio botón. Con test del mensaje.
  - **N1**, que sube a bloqueante: `engine.ts` solo se importa desde la sección de la sincronización de Ajustes. Hay una regla sobre el grafo real y otra estática, que matan M1 y su variante con `setInterval`.
  - **N2**: se acepta como riesgo residual y queda documentado (§30.3).
  - **N3**: con un `sync:held` ilegible, se exporta el libro y se avisa.
  - **N4**: «Descartar» pide confirmación; «Confirmar», no.
  - **N5**: `record(true)` solo confirma el borrador idéntico al que avisó, y lo mismo en `EventForm.tsx`.
- **Corrección**:
  - **B1**: con algo retenido sin resolver, el aviso de libro inválido dice la causa y enlaza con Ajustes › Sincronización › Retenidas. Con test, y otro de «Rehacer» con el libro inválido.
  - **B2**: lo retenido enseña el activo, la cantidad y el importe con `Amount`, bajo la privacidad. Con test con y sin privacidad.
  - **N1**: tests que matan los tres mutantes.
  - **N3**: «Unirme» dice cuántas operaciones retiene, con severidad `caution`.
  - **N4**: el motivo usa la misma palabra que el botón.
  - **N5**: se borra `exportLedgerText`, que estaba muerto.
  - **N6**: capturas por *viewport*.
  - `docs/data-schema.md` dice que `ledger.held.jsonl` no se reimporta y cómo se recupera.

### 30.2 Lo hecho, commit a commit

- **Techos del paquete**, cada uno **antes** de lo que lo necesita, en su propio commit y con la medida, el desglose y la tendencia: `1165ab8`, `ab60b14`, `c518095` y `778cd00`.
  - El total pasa de 298.648 a 300.436 (medido 300.128).
  - El arranque no se toca: 76.016 medido, con techo en 76.051.
  - **Un intento que lo movía se descartó**: un componente perezoso para la causa del libro inválido separaba `solid` del arranque (+606).
- **Seguridad B1** (`4488604`):
  - la cabecera `x-atlas-expected-device` (`EXPECTED_DEVICE_HEADER` en el puerto remoto);
  - los códigos `expected_device_required` (400) y `sync_device_changed` (409) en `API_ERRORS` y en `REMOTE_FAILURE_CODES`, con frase propia en las dos interfaces;
  - la regla pura `expectedDeviceRefusal` y `DEVICE_BOUND_PATHS`, aplicada en el *handler* antes de leer ni escribir;
  - `httpRemote({ expectedDevice })`;
  - el motor lee `GET /api/session` en cada orden (`sessionNow`) y ya no recibe el dispositivo como parámetro;
  - las acciones de lo retenido pasan a `apps/web/src/sync/engine-held.ts`;
  - los tests de la web usan una cookie por navegador (`api-support.ts`, con `signInAgain` y `signOut`).
  - Aquí va también la mitad del motor de corrección N3: la cuenta de lo retenido (`retained`); la frase y su test van en `1fbc461`.
- **N1** (`b2a330f`):
  - el grafo del paquete anota quién importa cada módulo, estática y dinámicamente;
  - `check-bundle.mjs` rechaza cualquier importador del motor fuera de `routes/ajustes/sync/`, y un grafo que no lo diga;
  - `tests/api-access.test.ts` lo exige por alcance sobre los fuentes.
- **Seguridad B2 y N3; corrección N1 y N5**:
  - `3026bb4` quita `exportLedgerText` (sin llamadas en la consola ni en la web; los tests de la 012 pasan a `exportLedgerAndHeld`, y así matan el mutante de `META_KEY`);
  - `c5e24a0` hace que un `sync:held` ilegible no aborte la exportación, cuente las operaciones y no dé fichero cuando todo está resuelto;
  - `b5271b4` pone el mensaje (`exportSaid`) y el botón «Descargar lo retenido».
- **Corrección B2** (`f23b5bc`): el activo, la cantidad, el precio por unidad y el importe de lo retenido, siempre por `Amount`.
- **Corrección N4** (`0f48226`): «Rehazla», como el botón.
- **Seguridad N4** (`81e9b44`): «¿Descartar lo retenido?» antes de descartar.
- **Corrección N1 y N3, tests** (`1fbc461`): «Volver a descargar» desaparece tras descargar, y unirse dice cuántas retiene, con `caution`.
- **Seguridad N5** (`fda537a`): `warned.ts`, aplicado en «Registrar lo presentado», en `EventForm.tsx` y en el formulario corporativo, que tiene el mismo patrón.
  - **Aviso**: el corporativo no tiene test propio; comparte el mismo ayudante, que sí lo tiene.
- **Corrección B1** (`da802ae`, `2e3e582`):
  - el aviso de libro inválido de `RequireLedger` pregunta, solo cuando se pinta, cuántas unidades retiene la sincronización. Usa la pregunta de solo lectura nueva `browserHeldPending` del almacén, cargada con `import()` a través de `apps/web/src/sync/held-pending.ts`, porque el guardián no deja un `import()` de una puerta de la sincronización;
  - un test prueba que «Rehacer» funciona con el libro inválido (D-Q1).
  - **No toqué** el aviso del resumen (`attention.ts`) ni el de `ClosedYearNotice`: la decisión nombra el aviso de libro inválido.
- **Documentos** (`d30a242`):
  - `docs/api.md` §5.4 y §7: la cabecera, los dos códigos y que CloudFront debe reenviarla (queda para la 017);
  - `docs/data-schema.md`: `ledger.held.jsonl`, con su botón, que no se reimporta y cómo se recupera;
  - `docs/specification.md` §9.6.

### 30.3 N2, riesgo residual (seguridad)

**El guardián de las claves `sync:*` es textual.** Busca el literal `sync:` en los fuentes de la web, así que una clave compuesta en tiempo de ejecución (`["sync","state"].join(":")`) escrita directamente en IndexedDB no la detecta.

- **Se acepta** porque exige código nuevo de la aplicación que escriba en IndexedDB fuera de los adaptadores, que es exactamente lo que revisan las revisiones.
- **Si llega a hacer falta**, la regla que lo cerraría es prohibir `indexedDB` y `objectStore(` en `apps/web/src`.

### 30.4 Mutantes

Por lotes, secuenciales, con el guardián de memoria: `015-r97-n1.json`, `015-r97-a.json` y `015-r97-b.json`.

- **N1, antes y después**:
  - Antes, contra los guardianes de `4488604`: M1 (`App.tsx` importa el motor al arrancar y en `online`) y M1b (`configuracion.tsx` con `setInterval`) **sobreviven** a la regla estática. La construcción falla solo por el presupuesto, sin la regla («FAILED WITHOUT THE EXPECTED REASON», lo mismo que vio la revisión).
  - Después, **los cuatro mueren**, cada uno por la regla que le toca: estática y del grafo, para M1 y para M1b.
- **Lote A, 8 de 8 muertos**:
  - R1: el *handler* no comprueba la cabecera;
  - R2: la cookie sin cabecera se admite;
  - R3: el cliente no la manda;
  - R4: el motor confía en el dispositivo unido en lugar de la sesión de ahora;
  - R5: un `sync:held` ilegible aborta la exportación;
  - R6: se exporta lo retenido ya resuelto;
  - R7: la exportación no anota su fecha (`META_KEY`);
  - R8: «Volver a descargar» sigue ofrecido tras descargar.
- **Lote B, 6 de 6 muertos**:
  - R9: la exportación no nombra el fichero;
  - R10: el precio de lo retenido sin `Amount`;
  - R11: descartar sin preguntar;
  - R12: un sí que confirma cualquier borrador;
  - R13: la causa dicha sin nada retenido;
  - R14: unirse sin contar lo retenido.
- **«Antes» de cada corrección**: cada test nuevo lo vi en rojo contra el código anterior, guardando solo el fuente corregido. Así, en N3 (el test de lo ilegible caduca), corrección B2, seguridad N4, corrección N4, seguridad N5 (los dos formularios) y corrección B1. Los de corrección N1 son los propios mutantes de la revisión (R6, R7 y R8).

### 30.5 Capturas

En `~/personal/atlas/privado/capturas/2026-09-27-015-e4-r1/`, **por *viewport***, con las barras fijas encima como las ve el usuario. Cada escena se capta desde el principio de la tarjeta y una pantalla más abajo cada vez, hasta su final. Ningún desbordamiento horizontal (`medidas.json`).

- Se ven la unión con «1 operación retenida de las que había aquí», con aviso ámbar; y la valoración retenida con el activo, «•••• a ••••€» y la privacidad puesta.
- **Encontrado, no corregido**: al entrar por `/ajustes#sincronizacion`, el título «Sincronización» queda debajo de la barra superior fija, porque falta un `scroll-margin-top`. Es un defecto de maquetación ajeno a estas decisiones; lo dejo para la dirección.

### 30.6 La tubería y la CI

**Código congelado en `d30a242`**; este informe va en el commit siguiente, solo de documentos. La tubería corrió sobre `d30a242`, con `--pool=forks --maxWorkers=1` y cada paso tras el guardián de memoria:

| Paso | Código de salida | Tiempo |
|---|---:|---:|
| lint | 0 | 4 s |
| typecheck | 0 | 4 s |
| cobertura, 1.ª | 0 | 924 s |
| cobertura, 2.ª | 0 | 851 s |
| build (incluido `check-bundle`) | 0 | 10 s |

- **3.054 tests** en 310 ficheros, sin nada paralelo durante la tubería. El dominio queda al 100 % en las dos coberturas.
- **El paquete**:
  - arranque 76.016, con techo en 76.051; la autorización llega a 76.069;
  - total 300.128, con techo en 300.436; la autorización llega a 304.640, así que quedan 4.512.
- **La CI** corre en la PR (`pull_request`); su resultado se anota en el mapa de la PR #97.

## 31. La ronda 2 de revisiones de la PR #97: decisiones y entrega (2026-09-27)

La revisión es el comentario 5853955890, sobre `ddf6998`, y no converge.

### 31.1 Las decisiones de la dirección

- **B1 se cierra; no se acepta como riesgo.** La sección de la sincronización tiene **una sola puerta** hacia fuera, su tarjeta. Las dos reglas, la del grafo real y la estática, exigen:
  - que el único módulo de fuera de `ajustes/sync/` que importe algo de la sección sea `ajustes/index.tsx`, y solo ese componente;
  - que todo el cierre inverso de `engine.ts` quede dentro de la sección, más `ajustes/index.tsx` y la carga perezosa de la ruta de Ajustes.
  - Mutantes: el salto por `sync-controller` desde `no-existe.tsx`, un reexporte de `sync-controller` y el alias de ruta absoluta. Los tres tienen que sobrevivir antes y morir después.
- **N1**: un test que mate el mutante del formulario corporativo.
- **N2**: con operaciones retenidas, el aviso «sin exportar» no desaparece del todo hasta que se descarga también lo retenido; mientras tanto dice «falta descargar lo retenido». Con test.

### 31.2 Lo hecho

- **B1** (`52b0c87`):
  - La puerta es `SessionCard`, que es lo que importa la página de Ajustes; `SyncCard` y el controlador quedan dentro.
  - **Regla estática**, «keeps the section of the sync behind its one door»: fuera de `routes/ajustes/sync/`, nadie importa nada de la sección ni del motor. La única excepción es `routes/ajustes/index.tsx` → `SessionCard`, por nombre y de forma estática. Los dos ficheros del motor se importan entre ellos.
  - **Regla estática**, «keeps whoever reaches the engine inside the section of the sync»: el cierre inverso del motor, por cualquier camino y sin parar en la sección, solo puede ser la sección, el motor o la página de Ajustes. Además, `App.tsx` y `main.tsx`, que lo cargan de forma perezosa, solo pueden alcanzarlo a través de la página.
  - **`resolveAcross` resuelve las rutas absolutas** (`/src/…`, desde la raíz de la web, y las del disco). Una que no se resuelve se nombra, nunca desaparece.
  - **En el grafo real** (`check-bundle.mjs`), con los importadores estáticos y dinámicos de cada módulo:
    - todo importador de un módulo de la sección que esté fuera de ella se rechaza, salvo la página de Ajustes para `SessionCard`;
    - el cierre inverso del motor solo admite la sección, el motor, la página y la carga (`App.tsx`, `main.tsx` e `index.html`);
    - el motor solo lo importan la sección y él mismo, para que un cargador no lo importe directamente.
  - **El comentario de `tests/api-access.test.ts`** ya no promete nada que no se compruebe: nombra la puerta, el cierre y las rutas absolutas.
- **N1** (`d9ea2c3`): test del formulario corporativo en `apps/web/test/duplicate-warned.test.tsx`. Registra un split; con el aviso abierto cambian las notas; el sí no lo registra y vuelve a avisar.
- **N2** (`30502f0`, `8a4ea77`):
  - El registro de la exportación (`current:meta`) guarda `heldOwed`, las operaciones retenidas que llevaba, en la misma transacción que la fecha.
  - `heldDownloaded` lo quita al pulsar «Descargar lo retenido» y deja la fecha.
  - El arranque lo lee con `exportState()`, que sustituye a `lastExportAt()`.
  - El aviso de la barra dice «falta descargar lo retenido», en ámbar, mientras exista.
  - Tests: el del adaptador en `transfer-sync.test.ts` y el del aviso en `ledger-chip.test.tsx`.
- **Documentos** (`3e63843`): `docs/data-schema.md` (`heldOwed`, `heldDownloaded`) y `docs/specification.md` §9.6 (la puerta y el aviso).

### 31.3 El paquete — atención para E5

- **El arranque sube a 76.055** y su techo queda **en la autorización misma, 76.069** (`30502f0`, antes del commit que lo necesita).
  - Es el aviso de N2, que tiene que estar en la barra desde el primer pintado y lee el registro de la exportación al arrancar.
  - Lo recorté de +133 a +39: `exportState` sustituye a `lastExportAt` en lugar de sumarse, y el título del aviso se queda con su frase.
- **Para Q12 en E5 quedan 14 bytes**, no los 18 de §29. **Si Q12 no cabe, la dirección tendrá que decidir de dónde sacarlos.**
- El total es 300.299, con techo en 300.436.

### 31.4 Mutantes

Con el guardián de memoria y secuenciales: `015-r97r2-b1.json`, `015-r97r2-n1.json` y `015-r97r2-rest.json`.

- **B1, antes**, contra las reglas de `ddf6998`: los tres (MB1, el salto por `sync-controller` desde `no-existe.tsx` con `setInterval`; MB2, un reexporte en `src/sync/controller-relay.ts`; MB3, `import("/src/routes/ajustes/sync/sync-controller.ts")`) **sobreviven** a la regla estática. En el grafo, la construcción falla solo por bytes, sin ningún mensaje de regla.
- **B1, después**: **los seis mueren**, cada uno por su regla. El grafo dice, por ejemplo, «`apps/web/src/routes/no-existe.tsx` importa `…/sync-controller.ts`, un módulo de la sección de la sincronización que no es su puerta» y «… alcanza el motor de la sincronización de la web desde fuera de su sección».
- **M1 y M1b de la ronda 1**, con los mensajes nuevos: los cuatro mueren.
- **N1**: el mutante del revisor (`confirmDuplicate` sin `warned.confirms`) **muere**. Antes sobrevivía, como mostró la revisión.
- **N2**: mueren los tres: el aviso que ignora la deuda, la exportación que no la anota y la descarga que no la quita. Los dos tests nuevos los vi en rojo contra el código anterior.

### 31.5 La tubería y la CI

**Código congelado en `3e63843`**; este informe va en el commit siguiente, solo de documentos. La tubería corrió sobre `3e63843`, con `--pool=forks --maxWorkers=1`, tras el guardián de memoria y sin nada en paralelo:

| Paso | Código de salida | Tiempo |
|---|---:|---:|
| lint | 0 | 3 s |
| typecheck | 0 | 2 s |
| cobertura, 1.ª | 0 | 854 s |
| cobertura, 2.ª | **1**, y 0 al repetirla | 950 s, y 880 s |
| build (incluido `check-bundle`) | 0 | 11 s |

- **3.058 tests** en 310 ficheros, todos en verde en las tres ejecuciones.
- **La 2.ª cobertura salió con 1**:
  - dio el 99,94 % de ramas en `packages/domain/src/ecb/resolve.ts:54-64`, que esta ronda no toca;
  - la 1.ª, sobre el mismo commit, había dado el 100 %, y al repetir solo ese paso volvió al 100 %;
  - es la misma intermitencia de §30, entonces en `ecb/propose.ts:95`, en la fusión de la cobertura entre proyectos;
  - el registro del intento está en el *scratchpad* (`015-pipe-cov2-try1.log`);
  - sigue pendiente del permiso `workflow` para que la CI guarde la cobertura cuando falle.
- **El paquete**: arranque 76.055 (techo 76.069, que es la autorización) y total 300.299 (techo 300.436).
- **La CI** corre en la PR y su resultado va en el mapa.

## 32. E5, arranque: lo que dejó E4 y Q12 (2026-09-27) — PARADO en Q12

E4 está fusionada en `develop` (PR #97, `640fa98`), y la ronda 3 converge (comentario 5854463150). E5 sigue en la misma rama y el mismo *worktree*.

### 32.1 Lo que dejó E4

- **O2** (`5c5c085`): `apps/web/test/export-held-chip.test.tsx` recorre la exportación y el aviso en una misma visita, con el doble de IndexedDB como el del navegador.
  - Exportar con una retenida deja el aviso en «falta descargar lo retenido».
  - «Descargar lo retenido» lo quita sin recargar.
  - Mata M7 (`downloadHeld` sin `markSource`, `export.ts:66-71`) y M8 (`exportLedger` que anota `undefined`, `export.ts:111`). Los dos sobrevivían en la ronda 3.
- **O1** (`1fa783f`): el cierre inverso del motor en `check-bundle.mjs` **recorre ya el grafo entero**, más allá de los cargadores.
  - Admite `App.tsx`, `main.tsx` e `index.html` **solo como ancestros a través de la página**: con la página como barrera, ninguno de los tres puede alcanzar el motor.
  - **Mutante**: un temporizador por `App.tsx` combinado con la vía 1. `SessionCard.tsx` y la página reexportan `createSyncController`, `App.tsx` entrega la página en diferido, y `no-existe.tsx` lo llama con `setInterval`.
    - Contra el grafo de `2ff8111`: la construcción falla **solo por bytes**, sin mensaje de regla, así que sobrevive a la regla.
    - Con `1fa783f`: **muere** («`no-existe.tsx` alcanza el motor de la sincronización de la web desde fuera de su sección»).
    - Las reglas estáticas también lo matan.
  - Ficheros: `015-e5-e4left.json` y sus registros en el *scratchpad*.

### 32.2 Q12, opción (b): no cabe — **PARADO, a la espera de la dirección**

**Medida del prototipo, sin *commit* y ya deshecho**:
- `decodeLine` marca con un `WeakSet` el evento cuya línea repite una clave (`repeatsKey`, que ya existe en el dominio);
- el paso 0 de `projectLedger` lo rechaza con `duplicate_key`, así que la proyección degradada lo deja inválido.

| | Arranque (bytes gzip) |
|---|---:|
| E4 cerrada (`3e63843`) | 76.055 |
| Con el prototipo de Q12 | **76.243** (+188) |
| Tope autorizado (no se sube) | 76.069 |
| **Falta** | **174** |

El coste es `repeatsKey` (930 bytes sin comprimir en `json-keys.ts`, hoy fuera del arranque) más la marca y la comprobación. **Ni recortado cabe en 14 bytes.**

**De dónde sacar los bytes. Propuestas, para que decida la dirección:**

1. **Sacar del arranque código del dominio que solo usan pantallas perezosas.** Los metió el grupo `domain` de `advancedChunks` (feature 010) a través del barril `@atlas/domain`. Candidatos, en bytes sin comprimir en el arranque, y **solo los usan pantallas perezosas**:
   - `projections/corporate-action-draft.ts`: 5.788 (lo usan el formulario corporativo y `view-models/forms/corporate`);
   - `projections/deep-check.ts`: 3.572 (la verificación y `format/messages/findings`);
   - `projections/simulate-transfer.ts`: 3.265 (`cartera/TransferSimulator` y `view-models/core/transfer`).
   - **Probado**: quitarlos solo del grupo no mueve nada (76.243 igual), porque el barril los importa. Hay que darles **una puerta propia**, como `@atlas/domain/fiscal`, y que las pantallas perezosas los importen de ella.
   - **Estimación sin medir**: entre 3 y 4 KB gzip menos en el arranque, muy por encima de los 174 que faltan. Hay que descontar la fontanería de un trozo más (la feature 010 midió 1,3 KB al partir el dominio en dos trozos de arranque; aquí el trozo nuevo sería perezoso, no de arranque).
   - **Si la dirección lo aprueba, lo mido con un prototipo antes de construirlo.**
2. **Q12 (b) fuera del arranque de la web** (coste en el arranque: 0 bytes).
   - La marca solo la ponen la carga de la consola, `atlas check` y la verificación de la web, todas perezosas o fuera del paquete web.
   - La sincronización la retiene en el paso 3 (`inspect`, en el trozo perezoso de la sincronización) con `domain_rejected` y `duplicate_key`, antes de subirla.
   - **Lo que cambia respecto a (b)**: la pantalla de inicio de la web **no** contaría esa línea como inválida hasta abrir la verificación o sincronizar. El resto de (b) se cumple.
3. **Subir la autorización del arranque** a 76.300, por ejemplo. La dirección ya dijo que no; lo dejo solo para que la tabla esté completa.

**Recomiendo la 1**: libra el arranque de mucho más de lo que pide Q12, deja sitio a lo que venga y no rebaja (b). Si hay prisa, la 2 cumple lo esencial de (b) sin tocar el arranque.

### 32.3 Lo que falta, sin empezar hasta que decidas Q12

- **El punto 4, la cobertura intermitente**: la investigación en local (varias pasadas con los ajustes de la CI, guardando cada `coverage-final.json`) y la propuesta de configuración, sin aplicarla.
- **E5 entero**, con los bloques 0 a 3 del encargo.

Paré aquí, como pediste para el caso de que Q12 no cupiera. Si prefieres que siga con el punto 4 y con E5 mientras decides Q12, son independientes de ella.

## 33. E5: la puerta de las herramientas, Q12, la cobertura intermitente y la administración (2026-09-27)

### 33.1 La decisión de la dirección sobre Q12

«**Opción 1**. Esos bytes nos vienen bien también para las mejoras visuales que llegan después de la 015.» Por este orden y sin esperar entre pasos:
1. prototipo y medida de la puerta propia;
2. la implementación en *commits* propios, con una regla que impida que el barril vuelva a exportarlos;
3. Q12 (b) encima;
4. el punto 4, como propuesta;
5. E5 entero.

El tope de arranque autorizado se queda en 76.069. Si la medida baja, va un techo nuevo más bajo en su propio *commit*, con 20 bytes de margen.

### 33.2 La puerta `@atlas/domain/tools` (pasos 1 y 2)

- **La puerta**: `packages/domain/src/tools.ts`, con el mismo patrón que `@atlas/domain/fiscal`. Exporta `corporateActionDraft`, `deepCheck` y `simulateTransfer`, con sus tipos, y el barril `@atlas/domain` ya no los exporta (`083b6fb`).
- **Quién la importa**:
  - las pantallas perezosas: el formulario corporativo, la verificación, el simulador de traspasos y su modelo de vista;
  - las órdenes de la consola que los usan: `corporate-actions`, `query`, `synth` y `tracking`.
- **La regla** (`tests/architecture.test.ts`): el barril no los exporta, `tools.ts` sí, y ningún otro módulo del dominio importa la puerta. Mutantes `TOOLS-barrel` y `TOOLS-inner`: **muertos**.

| | Arranque (bytes gzip) | Total (bytes gzip) |
|---|---:|---:|
| E4 cerrada (`3e63843`) | 76.055 | — |
| Con la puerta | **73.889** (−2.166) | 301.240 |
| Techo nuevo del arranque (`505587f`) | 73.909 (lo medido + 20) | |
| Con Q12 (b) | **74.073** (+184) | 301.370 |
| Techo del arranque con Q12 (`f190840`) | 74.093 (lo medido + 20), **por debajo de la autorización de 76.069** | |

- **El trozo nuevo cuesta en el total**: sube el techo total a 301.496 (`64e0ca4`), dentro de la autorización de 304.640.
- **El techo, antes de cada *commit* que lo necesita**, con su medida, su desglose y su tendencia en el comentario de `check-bundle.mjs`.
- **Hoy quedan 1.996 bytes** entre lo medido en el arranque y la autorización, para lo que llegue después de la 015.

### 33.3 Q12 (b) (`15cebe7`)

- `decodeLine` marca con un `WeakSet` (`REPEATED_KEY`) el evento cuya línea repite una clave.
- El paso 0 de `projectLedger` lo rechaza con `ValidationError("duplicate_key", …, { id })`, así que la proyección degradada lo deja **inválido**, con su id.
- La sincronización lo retiene con `domain_rejected` y no lo sube.
- Mensajes en la consola y en la web.
- Tests:
  - el dominio (5);
  - la sincronización: se retiene, no se sube, y lo retenido dice `duplicate_key`;
  - la consola: `check` lo nombra y `positions` responde con la cabecera de degradado.
- Mutantes `Q12-mark`, `Q12-project` y `Q12-nested`: **muertos**.

### 33.4 Una regresión mía de E4: cuatro guardianes borrados

**El *commit* `969786e` de E4 borró por error cuatro bloques de `tests/api-access.test.ts`**, que nadie echó de menos porque un test que no existe no falla:
- los registros de los tokens nunca se borran ni se etiquetan (T26);
- los adaptadores del SDK solo toman del SDK lo que necesitan (E3);
- la API solo añade, y el dominio juzga cada línea (E3);
- el rehacer está atado al plan sellado (E3, N1).

**Repuestos tal cual en `30e5644`.**
- El último habría fallado: la web llamaba `recordRedo` a su envoltorio del rehacer.
- Se renombró antes, en su propio *commit*, a `recordPlannedRedo` (`b65016c`). No cambia el comportamiento ni los bytes del arranque.
- Visto en rojo con el nombre antiguo, y en verde con el nuevo.

### 33.5 El punto 4: la cobertura intermitente (**PROPUESTA, sin aplicar**)

**Lo medido en local, con los ajustes de la CI** (`--pool=forks --maxWorkers=1`, cada `coverage-final.json` guardado en el *scratchpad*):

| Pasada | Veces | Ramas del dominio |
|---|---:|---|
| Todo el repositorio | 2 | 5006/5006, idénticas |
| Solo el proyecto `domain` | 3 | 4996/5006, idénticas |
| Solo `domain`, con los ficheros en orden aleatorio (semillas 11 a 66) | 6 | 4996/5006, idénticas |
| Solo `adapters`, `api`, `cli`, `web` o `repo` (y `repo` con `adapters` o con `api`) | 7 | **0 ficheros del dominio** |
| `domain` y `adapters` juntos | 1 | 4998/5006 |

**Lo que dicen los datos:**
1. **Los mapas de ramas son idénticos** en todas las pasadas y en todos los proyectos. Lo comparé fichero a fichero con la cobertura de `cli`, `web` y `adapters` con `allowExternal`. Ninguna transformación distinta cambia el mapa.
2. **Los contadores bailan en unas 580 ramas entre dos pasadas cualesquiera**, también con solo el dominio. Son las pruebas de propiedades (`fast-check`, 19 ficheros). **Ninguna rama pasa nunca de cubierta a no cubierta**: cero en las 11 comparaciones.
3. **El 100 % del dominio en la CI depende de otros proyectos.** Diez ramas solo las cubren tests de fuera del dominio:
   - `ecb/drafts.ts:69` (dos brazos);
   - `ecb/rule-change.ts:96`;
   - `filings/closed-years.ts:178` y `:179`;
   - `filings/proposal.ts:144`, `:145`, `:225` y `:227`;
   - `informative/m720.ts:305`.
   
   Vitest 4.1.11 solo cuenta lo que otro proyecto ejecuta del dominio **si el proyecto `domain` corre en la misma invocación**: sin él, el fichero queda fuera de la raíz de ese proyecto (`allowExternal` falso) y no aparece.
4. **Los dos fallos que guardé** (2 de 29 pasadas en local):
   - uno en `ecb/propose.ts:95`, con 4995/4996;
   - otro en `ecb/resolve.ts:54-64`, con 4999/5002.
   
   Los dos ficheros tenían entonces el mismo número de ramas que hoy (29 y 16). Así que **no se deformó el mapa: se perdieron los contadores**. En `resolve.ts`, los brazos perdidos de las líneas 58 y 64 solo los cubren los tests del dominio (9 y 6 visitas, las mismas en la pasada completa). **Se perdió la aportación entera de un fichero de test del dominio**, no la de otro proyecto.

**La causa, hasta donde llega lo comprobado.** En `@vitest/coverage-v8` 4.1.11, por cada proyecto y entorno:
- se funden en bruto los resultados de V8 de cada fichero de test (`mergeProcessCovs`);
- después se convierten con las transformaciones de ese proyecto;
- y al final se funden los proyectos en istanbul, por posición.

Hay dos sitios donde la aportación de un fichero puede perderse sin error:
- el desplazamiento del envoltorio del módulo cae a `0` cuando el trabajador no tiene su `moduleExecutionInfo` (`startOffset: … || 0`, en `@vitest/coverage-v8/dist/index.js`). Con dos desplazamientos distintos para la misma URL, la fusión en bruto coloca mal los rangos de uno de ellos;
- `getSources` se traga el error de una transformación (`.catch(() => null)`).

El segundo cambiaría el mapa, y el mapa no cambió: queda descartado. **El primero es compatible con todo lo visto, pero no lo he reproducido**: 11 pasadas seguidas sin un fallo. **No afirmo que sea la causa.** Lo que sí está comprobado es que **en una sola pasada del dominio no hay fusión entre proyectos**, y que ahí nada baila.

**Propuesta, para que decida la dirección. No la he aplicado:**
- **(a) Recomendada: medir el 100 % del dominio en su propia pasada.**
  - `test:coverage` pasaría a ser `vitest run --coverage --project domain`, con el umbral del 100 %, seguido de `vitest run --project adapters --project api --project cli --project web --project repo` sin cobertura. `ci.yml` no cambia, porque llama a `npm run test:coverage`.
  - **Antes**, en su propio *commit*: tests del dominio para las diez ramas del punto 3. Los escribo en cuanto lo apruebes. Sin ellos, el umbral fallaría.
  - **Ganancias**:
    - quita la fusión entre proyectos, que es donde está el fallo;
    - la medida es la de los tests del propio dominio, que es lo que dice la definición de hecho;
    - solo se instrumenta el dominio: la pasada con cobertura del dominio tarda unos 3 minutos, y el resto corre sin el coste de la cobertura.
- **(b) No la recomiendo: repetir la cobertura una vez en la CI si falla.** Esconde el síntoma y deja el 100 % dependiendo de otros proyectos.

### 33.6 E5, bloque 0: lo verificado, con fuentes (consultado el 2026-09-27)

1. **Las credenciales de la consola.** Salen de la cadena estándar del SDK, y la consola nunca las guarda.
   - *AWS SDK for JavaScript v3 Developer Guide*, «Set credentials in Node.js» (`docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html`): el orden de la cadena.
   - *AWS SDKs and Tools Reference Guide*, «Assume role credential provider» (`docs.aws.amazon.com/sdkref/latest/guide/feature-assume-role-credentials.html`): `mfa_serial` es «Required when assuming a role where the trust policy for that role includes a condition that requires MFA authentication», y la tabla dice «SDK for JavaScript 3.x: Yes».
   - **Pero la cadena de un cliente no pide el código.** `@aws-sdk/credential-provider-ini` lanza «Profile … requires multi-factor authentication, but no MFA code callback was provided» si nadie le pasa `mfaCodeProvider`, y corta la cadena (`tryNextLink: false`). Está en `node_modules/@aws-sdk/credential-provider-ini/dist-cjs/index.js:96-97`.
     - **Probado con el SDK real y sin AWS**: un perfil con `mfa_serial` da `admin_aws_refused (CredentialsProviderError)` antes de llamar a STS (`apps/cli/test/admin/environment.test.ts`).
     - **Corregido** en el código, en el mensaje y en el procedimiento (`710f7af`, `a0a06ea`). Mi borrador decía que el SDK pedía el código, y no es así.
   - **Cómo se abre entonces la sesión**, en las dos variantes de C5:
     - **IAM Identity Center**: `aws sso login`, y el SDK lee la sesión guardada;
     - **usuario IAM con MFA**: la CLI de AWS «prompts the user to enter the one-time password (OTP) that the MFA device provides» y guarda la sesión en `~/.aws/cli/cache` (*AWS CLI User Guide*, «Using an IAM role in the AWS CLI»). `aws configure export-credentials --format env` la exporta como variables («Display credentials as exported shell variables», referencia de la CLI de AWS v2).
     - **Qué principal asume el rol sigue SIN VERIFICAR** (C5, de la 018).
2. **El *root* no puede asumir el rol.** *IAM User Guide*, «Compare AWS STS credentials» (`docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_sts-comparison.html`): «Who can call» de `AssumeRole` es «IAM user or IAM role with existing temporary security credentials». El de `GetSessionToken` es «IAM user or AWS account root user». **Queda verificado el SIN VERIFICAR de ADR-0034, fila 16.** El procedimiento dice que el *root* solo sirve para desbloquear.

### 33.7 E5, bloques 1 y 2: lo construido

- **Las reglas, en el dominio**, detrás de **una puerta propia, `@atlas/domain/admin`** (`9e53313`, `3b8f160`): `remoteRewritePermission`, `forgetRefusal`, `forgottenDevice`, `compareForRestore` y `parseAdminConfig`.
  - Van aparte de `@atlas/domain/access` porque la API alcanza esa puerta, y nada de la administración debe ser alcanzable desde ella.
  - `rewritePermission` recibe ahora solo lo que usa del objeto del dispositivo, sin la fecha de la última sincronización.
- **Los adaptadores** (`67a141d`, `f09b3fb`):
  - `AdminObjectStore` añade dos operaciones: una versión anterior de un objeto (`GetObject` con `VersionId`) y el listado de todo lo que cuelga de un prefijo, a cualquier profundidad (`ListObjectsV2` sin delimitador). **Sigue sin borrar.**
  - La puerta nueva es `@atlas/adapters/aws-admin`.
  - El doble de S3 guarda versiones y lista a cualquier profundidad.
- **`atlas admin`** (`3a07249`): `devices`, `revoke-all-tokens`, `forget-device <id> [--force]`, `compact` y `restore --from <fichero|s3-version:<id>|backups/AAAA-MM>`, siempre con `--env`.
  - **Lo que niega la reescritura**: lo pendiente de esta carpeta si está sincronizada, lo publicado por cualquier dispositivo vivo y un objeto ilegible. Lo retenido no bloquea, y un dispositivo olvidado no cuenta.
  - **Restaurar**: los seis pasos, cada uno con su salida.
    - El candidato se comprueba con la integridad, `deepCheck` y la proyección. **No se contrastan los tipos del BCE**, que dependen del histórico de la carpeta; el procedimiento lo dice.
    - Se escribe con `replaceLines` sobre el etag del paso 3.
    - Lo anterior se archiva en `archive/pre-restore-<fecha>T<hora>-<etag>.jsonl`, con `syncArchiveName("restore")` (`ca336cf`).
  - **Olvidar**: revoca primero, marca después, sobre el ETag leído, con tres intentos y `forget_contention`. Los dos cortes tienen su test: revocado y vivo es un estado seguro, y repetir la orden lo termina.
  - **Los fallos de AWS se dicen sin el mensaje del SDK**: `admin_remote_unavailable` y `admin_aws_refused`.
- **`atlas backup`** (`ab2774a`):
  - copia siempre la carpeta local `documents/`;
  - con `--from-bucket --env`, también `documents/` e `imports/` del bucket, en `<destino>/bucket/`, **solo leyendo**;
  - cada fichero se verifica por SHA-256, y nada se sobrescribe. Si ya está con los mismos bytes, se deja; si tiene otros, se niega con `path_exists`;
  - una clave que saldría del destino se niega con `bucket_key_unsafe`. Los marcadores de carpeta de la consola de S3 se saltan.
- **Los guardianes** (`873c564`):
  - `apps/api` no alcanza ni una orden, ni un adaptador, ni una regla de la administración;
  - ninguna fuente de la API nombra `getVersion`, `listAll`, `VersionId` ni el olvido;
  - la administración no importa ni las credenciales de la consola, ni el cliente de la API, ni la cabecera del token.
- **El paso 4 de la cuenta robada** (rotar la clave y esperar la caché) ya tenía su test en E2. Escribí uno repetido y lo quité (`3e13512`, `c0f51a8`).
- **Mensajes en español en la consola** (`1128d70`). Los cuatro códigos de la administración que salen del dominio los traduce **solo la consola**: la web nunca administra. `tests/messages.test.ts` los declara en `CLI_ONLY`.

### 33.8 E5, bloque 3: los procedimientos

En `specs/015-api-access/runbooks/`, en español, con las órdenes exactas y con lo probado y lo no probado dicho en cada uno:
- `revocar-todos-los-tokens.md`:
  - con la consola;
  - con la CLI de AWS: el paso de `jq` **da los mismos bytes que `revokedRecord`**, probado sin AWS con un `device_name` con acentos y comillas;
  - el *root*, solo para desbloquear.
- `restaurar-el-libro.md`: los seis pasos, cómo elegir la copia, qué hace después cada dispositivo, la prueba anual y la pérdida de la cuenta.
- `cuenta-de-google-robada.md`: los seis pasos de B3, en su orden, y el caso distinto de **perder** la cuenta.

### 33.9 Mutantes

Batches en el *scratchpad*: `015-e5-b1.json` y `015-e5-b2.json`, con sus salidas. **Los 18, muertos.**

| Mutante | Qué hace | Lo mata |
|---|---|---|
| E5-42a, 42c | La reescritura no mira las colas publicadas, o no se niega con un dispositivo ilegible | `rewrite.test.ts`; los tests del dominio |
| E5-42b | Lo retenido bloquea la reescritura (V5) | Los tests del dominio |
| E5-43a | Restaurar con `replace`, que vuelve a serializar | El test de los bytes tal cual (`79db531`) |
| E5-43b, 43c, 43d | Otro nombre de archivo, restaurar sin decir la comparación, o sin pedir confirmación | `rewrite.test.ts` |
| E5-43e | Escribe con una condición leída otra vez, no la que se comparó | El test del cambio entre los pasos 3 y 5 (`79db531`) |
| E5-44a | Olvida primero y revoca después | Los cortes de `admin.test.ts` |
| E5-44b | La clave de sesión queda en caché para siempre | El test de E2 |
| E5-45a, 45b | La API alcanza la administración, o la administración toma las credenciales de la consola | Los guardianes de `873c564` |
| E5-46a, 46b | Revocar todos deja alguno vivo, o cuenta como nuevo uno ya revocado | `admin.test.ts` |
| E5-46 bis a, b, c | Olvidar con cola sin `--force`, `--force` sin avisar, o la marca que deja el dispositivo activo | `admin.test.ts` |
| E5-46 ter | La copia escribe en el bucket | `backup.test.ts` |

**Vistos vivos antes de su test y muertos después**: E5-43a y E5-43e, contra el `rewrite.test.ts` anterior a `79db531`; y E5-45a, contra el `api-access.test.ts` anterior a `873c564`.

### 33.10 Documentos (para que los traslade la dirección)

- **`docs/data-schema.md` §1, fila de `archive/`**: el nombre real es `pre-restore-<YYYY-MM-DD>T<HHMMSS>-<etag>.jsonl` (`syncArchiveName("restore")`), no `pre-restore-<fecha>.jsonl`. Como confirmar, unirse y volver a descargar, **no prueba `-2`**: si el nombre existe, falla con `archive_exists` y se repite.
- **`docs/data-schema.md` §2, la clave repetida (Q12)**: «se implementa en E5 de la 015» pasa a «**implementado** en E5 (`15cebe7`)».
- **`docs/data-schema.md` §1**: `~/.config/atlas/admin.json` **se usa tal como propone `data-model.md` §9**. §9 sigue diciendo PROPUESTA: falta que la dirección la acepte.
- **`docs/runbooks/`**: los tres procedimientos de `specs/015-api-access/runbooks/`. En `google-2-step-verification.md`, línea 86, cambiar «El procedimiento paso a paso llegará con el despliegue» por un enlace a `cuenta-de-google-robada.md` («Recuperar una cuenta de Google robada»), que sigue el mismo orden de B3.
- **ADR-0034, fila 16**: el *root* y `AssumeRole` quedan **verificados**, con la fuente de §33.6. Y una nota para C5: con un usuario IAM, la consola necesita la sesión ya abierta por la CLI de AWS, porque el SDK no pide el código.
- **`docs/api.md`**: nada. La administración no pasa por la API.

### 33.11 La tubería y la CI

**La tubería completa**, con un trabajador y detrás de la puerta de memoria. Todos los pasos salieron con 0:

| Paso | Sobre | Resultado |
|---|---|---|
| lint, typecheck | `a0a06ea` | 0 |
| cobertura 1 | `7f4217f` (solo documentos sobre `a0a06ea`) | 3.140 tests; dominio al 100 % (5.054/5.054 ramas); 978 s |
| cobertura 2 | `7f4217f` | Lo mismo; 869 s |
| build | `7f4217f` | Arranque 74.073, total 301.370 |

**El código queda congelado en `a0a06ea`.** Lo posterior son solo documentos. La CI, en la PR de E5.

### 33.12 Pendiente para la dirección

- **El punto 4**: decidir la propuesta (a) o (b) de §33.5. No he tocado la configuración.
- **`admin.json`**: aceptar o cambiar la propuesta de `data-model.md` §9.
- **Trasladar los documentos** de §33.10.

## 34. Las decisiones de la dirección sobre E5, y su entrega (2026-09-27)

### 34.1 Las decisiones

- **Punto 4: opción (a).**
  - Primero, tests del dominio para lo que hoy solo cubren otros proyectos, cada uno visto en rojo al excluir los demás proyectos.
  - Después, la cobertura del dominio se mide en su propia pasada, con el umbral del 100 % solo ahí, y la pasada general va sin umbral para el dominio.
  - La CI llama a las dos. Como `ci.yml` no se puede empujar sin el permiso `workflow`, su cambio va en un parche del *scratchpad*, y `npm run test:coverage` ejecuta las dos pasadas, para que la CI de hoy ya las use.
  - Medir el tiempo añadido.
- **`admin.json`: aceptado** tal como está en `data-model.md` §9. Nunca lo escribe la aplicación, y se lee de forma estricta.
- **Documentos, en esta misma PR**, por orden expresa de la dirección:
  - `docs/data-schema.md`: el nombre de `pre-restore`, Q12 como implementada y `admin.json`;
  - los tres procedimientos, a `docs/runbooks/`, enlazados desde un índice;
  - la línea 86 de `google-2-step-verification.md`;
  - una nota fechada en ADR-0034, fila 16;
  - la nota del MFA en ADR-0033, si la cita.

### 34.2 El punto 4, hecho

**Lo que solo cubrían otros proyectos.** Medí la pasada del dominio solo con el umbral puesto, y **eran más de las diez ramas de §33.5**:
- las diez ramas;
- **dos funciones y sus líneas**: `previewReversal` (`usecases/preview-event.ts:186-198`), la función que filtra los avisos de `previewCorrection` (`:241`) y la que suma lo diferido en la propuesta de la Renta (`filings/proposal.ts:109`).

§33.5 solo miró las ramas, y por eso no las vio. **Queda corregido aquí.**

**Los tests**, en `packages/domain/test/own-coverage.test.ts` (`f0009e1`, `6a9b583`):
- `DraftChangedError`, con sus dos mensajes;
- `ruleChangeRates`, con un dividendo en dólares, cuyo tipo es de fecha de negocio;
- `closedYearImpact`, en un libro sin ningún `settings_changed`;
- `filingProposal` de un 720 con un valor extranjero valorado;
- `filingProposal` de una Renta con una pérdida diferida;
- `model720` sobre un libro con un evento inválido;
- `previewReversal`;
- `previewCorrection`, con un aviso de otro evento.

**Vistos en rojo al excluir los demás proyectos:**
- sin el fichero nuevo, la pasada del dominio solo daba 5.044/5.054 ramas, con las diez de §33.5 al aire;
- con las ocho primeras pruebas, las ramas llegaban al 100 %, pero las líneas, las funciones y las sentencias no, por las tres funciones de arriba (99,86 %, 99,83 % y 99,86 %), y el umbral la hacía fallar;
- con las ocho pruebas, todo al 100 %.

Cada `describe` del fichero, pasado solo con cobertura, cubre sus ramas por sí mismo. Lo comprobé uno a uno.

**La configuración** (`b04e828`):
- `test:coverage:domain` es `vitest run --coverage --project domain`, con el umbral del 100 % de `vitest.config.ts`;
- `test:others` es `vitest run --project !domain`, sin cobertura, así que no tiene umbral del dominio;
- `test:coverage` los encadena. Es lo que llama la CI de hoy.
- Un guardián en `tests/test-outputs.test.ts` fija los tres guiones y el umbral.

**El parche de `ci.yml`** es `ci-015-two-passes.patch` en el *scratchpad*:
- dos pasos, `test:coverage:domain` y `test:others`;
- entre los dos, **la subida de `coverage-final.json` si falla la cobertura del dominio**, que es el cambio del *stash* `ci-015-upload-artifact`. Así los dos cambios de `ci.yml` están en un solo parche. El `json` del informe ya está en `vitest.config.ts` desde E3;
- se aplica limpio sobre `develop` (`git apply --check`).
- **Lo tiene que empujar alguien con el permiso `workflow`.** Mientras tanto, la CI ya corre las dos pasadas a través de `npm run test:coverage`.

**El tiempo:**

| Dónde | Antes, una pasada con cobertura de todo | Ahora, las dos pasadas | Diferencia |
|---|---:|---:|---:|
| CI (paso `npm run test:coverage`) | 189 s (`ea55e1e`) | 174 s (`cecfa9f`) | **−15 s** |
| Local, un trabajador | 869 a 978 s | 159 s (dominio) + 480 s (resto) = 639 s | **unos −4 a −5 min** |

**No añade tiempo: lo quita.** El resto de proyectos ya no se instrumenta.

### 34.3 Los documentos, hechos

- `docs/data-schema.md` §1 y §2 (`188f15b`):
  - el nombre `pre-restore-<YYYY-MM-DD>T<HHMMSS>-<etag>.jsonl`, y que restaurar falla con `archive_exists` como confirmar, unirse y volver a descargar;
  - Q12, implementada;
  - una fila para `~/.config/atlas/admin.json`.
- **Los procedimientos, en `docs/runbooks/`** (`3598718`), con nombres en inglés como los demás ficheros: `restore-the-ledger.md`, `revoke-all-tokens.md` y `stolen-google-account.md`. Se enlazan entre sí.
- **El índice de `docs/runbooks/`** es `README.md` nuevo, con los seis procedimientos, y `docs/prompts/README.md` apunta a él (`318f536`).
- **`google-2-step-verification.md`, línea 86**: enlaza `stolen-google-account.md` (`55cde77`).
- **ADR-0034**: una nota del 2026-09-27 (`26d1fc9`). La fila 16 queda **verificada** con fuente: el *root* no puede hacer `AssumeRole`. Para C5, el MFA lo pide la CLI de AWS, no el SDK.
- **ADR-0033**: su punto 8 cita el MFA de la revocación sin Google, así que lleva la misma nota, corta.
- **`data-model.md` §9, `spec.md` FR-014 y `quickstart.md`**: `admin.json` aceptado, y los procedimientos en su sitio nuevo (`cecfa9f`). **§33.8 y §33.10 siguen nombrando `specs/015-api-access/runbooks/`**: son el registro de entonces, y esta sección dice dónde están ahora.
- `docs/prompts/015-api-access.md` §3 no se toca: dice dónde los escribía el implementador y que la dirección los traslada al cerrar, y eso es lo que ha pasado.

### 34.4 La tubería, la CI y el congelado

**El código queda congelado en `b04e828`.** Todo lo posterior son documentos.

| Paso | Sobre | Resultado |
|---|---|---|
| lint, typecheck | `cecfa9f` | 0 |
| cobertura del dominio, 1 y 2 | `cecfa9f`, `c279bf3` | 1.587 tests; dominio al 100 % (5.054/5.054 ramas, y líneas, funciones y sentencias); 158 s y 174 s |
| el resto de proyectos, 1 y 2 | `c279bf3` | 1.563 tests; 502 s y 501 s |
| build | `c279bf3` | Arranque 74.073, total 301.370 |

Un trabajador, detrás de la puerta de memoria, y todos los pasos con 0.

## 35. La ronda 1 de revisiones de la PR #98: decisiones y entrega (2026-09-27)

Revisiones: seguridad (comentario 5856369055) y corrección (comentario 5856517566), sobre `ef6115d`.

### 35.1 Las decisiones de la dirección

**Corrección**
- **B1, Q12, opción 1.** Un evento marcado `duplicate_key` con una anulación viva cuenta como anulado y deja de ser inválido. Una anulación que repite clave no anula nada.
  - Dos tests, uno por caso.
  - El camino completo: `compact`, `atlas check`, la Renta y el 720.
  - El remedio, en data-schema §2.
  - Y qué hace la retención de la sincronización con una línea así ya anulada.
- **B2.** El importe exacto, con su signo, en `own-coverage.test.ts`: tiene que matar `add` → `sub`.
- **P1.** Rehacer la descripción de la PR a partir de §34 y §35.
- **N1.** Al menos un aviso del evento corregido y ninguno ajeno: tiene que matar `filter(() => false)`.
- **N2.** Si el mutante es equivalente, decirlo y argumentarlo; si no, el escenario donde importa.

**Seguridad**
- **B1.** El paso 5 de la cuenta robada, en este orden: olvidar, revisar con el rol de administración, y restaurar o dejar que las anulaciones suban después del paso 6. La línea 7 pasa a «antes de terminar el paso 5». Un ensayo del procedimiento completo con los dobles.
- **N1.** `restore`, `compact` y `forget-device` rechazan `--yes`, y la confirmación exige escribir el nombre del entorno. Nota fechada en ADR-0032.
- **N2.** `revoke-all-tokens` sale con un código distinto de 0 si queda algún registro ilegible, y el procedimiento lo dice.
- **N3.** `printf '%s\n'` o un único programa de `jq`, con un test versionado del bucle ejecutado con `dash`, con un `device_name` que lleve `\` y `\n`.
- **N4.** `file://` desde un fichero `600` en `~/.config/atlas`, borrado después.
- **N5.** `--value="$(…)"`.
- **N6.** `Object.hasOwn`, y `--env` validado con `^[a-z][a-z0-9-]*$`.
- **N7.** Un guardián de arquitectura para que la web no alcance la administración, en las reglas estáticas y en las del grafo.
- **N8.** Después de marcar el dispositivo, `forget-device` repasa y revoca los tokens emitidos entre medias.
- **N9.** `restore --from` decodifica UTF-8 estricto y se niega si no lo es.
- **Preferencias aceptadas**:
  - la confirmación de olvidar muestra el tipo, el nombre y la última sincronización;
  - `eval export-credentials` va en una subshell;
  - en `backup --from-bucket`, una clave rara se salta con aviso, la copia sigue y la orden sale con un código distinto de 0.

### 35.2 Corrección, hecho

**B1, Q12.**
- **El dominio** (`6b4d61a`): el paso 0 de `projectLedger` aplica primero las anulaciones y después juzga las líneas marcadas. Una marcada con anulación viva queda anulada y no inválida. Una **anulación** marcada se rechaza sin aplicarse, así que su objetivo sigue vivo. Hay dos tests en `repeated-key.test.ts`; el primero se vio en rojo.
- **El camino completo mostró un defecto más, fuera de Q12.** `atlas delete` cargaba el libro de forma estricta para enseñar el evento, así que **en la consola no se podía anular ningún evento inválido** en un libro degradado, fuera `duplicate_key` o cualquier otro. El caso de uso (`reverseEvent`) sí lo permitía (ADR-0015, nota del 2026-09-25).
  - **Corregido** (`b65042e`): `atlas delete` lee en modo degradado **solo si el objetivo es uno de los inválidos**, que es la reparación. Cualquier otra mutación sigue negándose en un libro degradado, como fija «still refuses every mutation».
  - El test de la consola recorre la línea marcada: `tax 2027` se niega con `tax_ledger_invalid`; `delete` la anula; y después `check` da 0, `compact --yes` da 0, `tax 2027` da 0 y `m720 2027` da 0. Se vio en rojo.
- **La sincronización** (`05b1a5b`, un test que lo fija; **no cambia código**).
  - Una línea marcada **y ya anulada** antes de sincronizar **se retiene igual**, con `duplicate_key`. La sincronización juzga cada unidad por separado, y una anulación sin corrección es una unidad propia. Su anulación espera detrás: queda pendiente y no se retiene.
  - Al descartar la línea, la anulación se queda sin objetivo y se retiene con `reversal_target_missing`. Al descartarla también, no queda nada, y **el remoto nunca recibe la línea**.
  - Así que con la sincronización configurada el remedio es **descartar**, no anular. Queda dicho en data-schema §2.
- **El remedio, en data-schema §2** (`916f665`).
- **El arranque** sube 41 bytes: 74.114, con techo 74.134, subido antes en su propio *commit* (`5d73d34`). Quedan 1.955 bytes hasta la autorización.

**B2, N1 y N2** (`5bfd0dd`):
- **B2**: el diferido es exactamente `-400`, las diez acciones a (60 − 100), con su signo.
- **N1**: los avisos de la vista previa son exactamente `[wash_sale_window_prior_buy, <el corregido>]`, y el aviso de la recompra, que sigue en el libro, no está entre ellos.
- **N2: el mutante no es equivalente.**
  - En `ruleChangeRates` sí lo es: un punto de fecha de negocio tiene la misma fecha de referencia con las dos reglas, así que nunca se nombra.
  - Pero `fiscalPoints` también lo lee `rateCorrections`, la cadena de `atlas fx correct`. Con el mutante, un dividendo en dólares con el tipo del día 2 y fecha valor del 6 **se propondría para corregir** al tipo oficial del 6.
  - El test nuevo lo fija: `rateCorrections` no lo nombra.
- **Los tres mutantes (`add` → `sub`, `filter(() => false)` y `|| true`) sobreviven a `own-coverage.test.ts` de antes y mueren con el de ahora.** Lo ejecuté con el fichero de `5bfd0dd^`.

### 35.3 Seguridad, hecho

- **B1** (`e661d88`): el paso 5 de `docs/runbooks/stolen-google-account.md`, reescrito en tres partes.
  - 5.1: olvidar primero.
  - 5.2: revisar la nube con el rol de administración. Se puede descargar con `aws s3 cp` a `~/personal/atlas/privado/revision/`, o comparar con `atlas admin restore --from <réplica>` y contestar cualquier cosa que no sea el entorno.
  - 5.3: restaurar ahí, o registrar anulaciones que suben después del paso 6.
  - La línea 7 dice «antes de terminar el paso 5».
  - **El ensayo** (`apps/cli/test/admin/stolen-account.test.ts`): la consola del usuario y la del intruso sobre una nube, con la misma cuenta de Google, recorren los seis pasos con la API y sus dobles.
    - **Encontró un hueco en el procedimiento**: después del paso 3, la consola del usuario **necesita dos `atlas remote login`**. El primero choca con el token revocado y lo quita de `credentials.json`; el segundo vuelve a dar un token al mismo dispositivo, con confirmación en la página.
    - Queda dicho en el paso 6 y en «Revocar todos los tokens».
- **N1** (`2a8aa69`, `ac1f7a1`):
  - `Io` gana `ask`, una línea escrita, opcional; sin terminal, `ConfirmationRequired`.
  - `restore`, `compact` y `forget-device` se niegan con `--yes` (`EXIT.usage`) y confirman solo si se escribe el nombre del entorno. «s» no vale.
  - La nota fechada está en ADR-0032 (`310cec6`), y `restore-the-ledger.md` lo dice.
- **N2**: `revoke-all-tokens` sale con 1 si hay registros que no entiende, y dice que no se puede asegurar que estén revocados. El procedimiento exige «0 revocados, ningún sin entender y salida 0».
- **N3** (`6f00ac8`): el apartado 2 de `revoke-all-tokens.md` es ahora `sh` POSIX con **un solo programa de `jq`**.
  - Cada registro sale en dos líneas, el nombre y el valor con `tojson`, y se lee con `while read -r nombre && read -r nuevo`. Ningún valor pasa por `echo`.
  - Un registro ilegible se salta, y el paso 3 lo cuenta.
  - **El ensayo versionado**, `tests/runbook-revoke-all.test.ts`, extrae los dos bloques **tal como están en el procedimiento** (marcados con `<!-- ensayo: … -->`) y los ejecuta con `dash` contra una `aws` simulada:
    - con un `device_name` con acentos, comillas, `\` y un salto de línea, escribe **los mismos bytes** que `serializeTokenRecord(revokedRecord(…))`;
    - deja como están el ya revocado y el ilegible;
    - la comprobación cuenta el ilegible.
  - **El bucle anterior, con `echo`, falla con `dash`** (`jq: parse error: Invalid escape`), tal como decía la revisión. Lo ejecuté aparte.
- **N4 y N5** (`e661d88`):
  - la lista permitida se lee a `~/.config/atlas/allow-list.antes.json` con `umask 077`, se edita en `allow-list.json` y se escribe con `--value "file://…"`. El paso 6 repone la de antes y borra los dos;
  - la clave de sesión se escribe con `--value="$(…)"`.
  - *Sin probar*: contra AWS real.
- **N6**: `--env` se valida con `^[a-z][a-z0-9-]*$` antes de pedir clientes. `environmentOf` busca con `Object.hasOwn`. Los tests usan `toString`, `__proto__`, `constructor` y `hasOwnProperty`.
- **N7** (`9413de0`):
  - **Reglas estáticas**: `lets neither the SDK, nor Google, …` veta además `packages/domain/src/admin.ts` y cualquier fichero de `apps/cli/`. El adaptador, en `adapters/src/aws/`, ya lo estaba.
  - **Reglas del grafo**: una entrada nueva para `packages/domain/src/admin.ts`.
  - **Una salvedad, comprobada.** Rolldown no deja en el grafo un módulo que solo reexporta, así que esa entrada no salta. Lo que llega al grafo son las reglas mismas, `domain/src/access/admin.ts`, y esas ya las veta «las reglas del acceso».
    - Comprobado con un mutante que importa la puerta por ruta relativa: la guarda lo nombra así.
    - Por el alias `@atlas/domain`, la web ni siquiera compila `@atlas/domain/admin`.
- **N8**: después de la marca, `forget-device` vuelve a barrer los tokens del dispositivo. Si se repite sobre uno ya olvidado, barre también: así se termina un corte entre la marca y el barrido.
- **N9**: `restore --from` lee los bytes y los decodifica con `fatal: true`, también los de S3. Si no son UTF-8, `restore_candidate_invalid` con `not_utf8`, antes del paso 3.
- **Preferencias**:
  - la pregunta de olvidar enseña «consola, «sobremesa», última sincronización …»;
  - las credenciales exportadas van en una subshell;
  - `backup --from-bucket` salta las claves raras, copia el resto y sale con 1 nombrándolas (`7dbbcdc`).

### 35.4 Mutantes

Las listas están en el *scratchpad*: `015-r35-b1.json`, `015-r35-sec.json` y `015-r35-doc.json`, con sus salidas. **Los 21, muertos.**

| Mutante | Qué hace | Vivo antes |
|---|---|---|
| R35-B2, R35-N1, R35-N2 | Diferido restado, sin avisos, todo punto como fiscal | **Sí**, con el test de `5bfd0dd^` |
| R35-B1-remedy (dominio y consola) | La marcada sigue inválida aunque esté anulada | Es el código de antes; el test nuevo se vio en rojo |
| R35-B1-reversal | Una anulación marcada anula | — (el test se escribió con el código de antes, que ya lo hacía bien) |
| R35-B1-cli-never, R35-B1-cli-always | `delete` nunca repara, o repara siempre | «never» es el código de antes: el test del remedio se vio en rojo |
| S-N1-yes, S-N1-any, S-N2, S-N6-env, S-N6-own, S-N8-after, S-N8-again, S-N9, S-skip | La conducta de antes de cada corrección | Es el código de antes, con sus tests en verde: la CI de `ef6115d` |
| S-N7-static | La web importa `@atlas/domain/admin` | El guardián de antes no vetaba `domain/src/admin.ts` |
| S-N3-value, S-N3-check, S-N3-echo | El procedimiento con `--value` separado, sin contar el ilegible, o con `echo` | No había ensayo |

### 35.5 *Commits* que no pasan solos, dichos

Los *commits* `6f00ac8` a `310cec6` no pasan el typecheck por sí solos. `tests/runbook-revoke-all.test.ts` importaba el dominio por ruta relativa, fuera del `rootDir` de `tests/`. Lo corrige `b3dd724`, que lo importa por su puerta, `@atlas/domain/access`.

Ese typecheck fallido dejó ficheros compilados junto a las fuentes del dominio: 40 ficheros de `access/`, `errors` y `guards`, ignorados por git. Los borré antes de seguir. El ejecutor de mutantes se negaba a correr con ellos.
