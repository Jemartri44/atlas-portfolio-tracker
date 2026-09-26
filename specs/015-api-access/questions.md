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
- **`propose.ts:95` no es de las propiedades.** Con las propiedades inertes, `propose.ts` sigue al 100 %. Lo cubre `packages/domain/test/ecb/propose.test.ts` él solo (las dos ramas del `if`, 6 y 5 veces), y en la suite entera la web y la consola pasan por ella 239 y 72 veces. Ninguna suite de propiedades toca el BCE. Así que **la premisa de CI-1 («la cubre a veces una propiedad aleatoria») no se sostiene con lo medido**, y un test fijo más no la cambiaría: ya lo hay. No he añadido uno redundante.
- **Qué la pudo dejar sin cubrir en la CI: no lo he averiguado.** La hipótesis, sin verificar, es que la fusión de la cobertura V8 de un mismo fichero cargado por varios proyectos y procesos pierda recuentos de bloque según el orden en que llegan. En la CI, con otros núcleos, el reparto cambia de una ejecución a otra. Sería de Vitest o de V8, no de la PR. Lo que hay:
  - de las últimas 40 ejecuciones de `verify`, dos fallaron;
  - esta falló en cobertura;
  - en esta máquina, las cuatro ejecuciones completas en verde de la ronda 2 sacaron el dominio al 100 %, igual que las dos del revisor sobre `85b5a87`.
  Si vuelve, lo propio es aislarla con `coverage-final.json` de la CI (subirlo como artefacto), no con más tests.

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
