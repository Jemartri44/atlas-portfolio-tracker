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
