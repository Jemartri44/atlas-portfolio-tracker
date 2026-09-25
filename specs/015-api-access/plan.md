# Plan de implementación: `015-api-access`

**Rama**: `feature/015-api-access` (worktree `../atlas-wt-015`) | **Fecha**: 2026-09-25 (Europe/Madrid) | **Especificación**: [`spec.md`](spec.md) | **Bloque 0 y preguntas**: [`questions.md`](questions.md)

**Estado**: **aprobado por la dirección el 2026-09-25**, con las decisiones de `questions.md` §8 (Q1 a Q7 respondidas). Las marcas **PROPUESTA** quedan como referencia a esas respuestas.

**Artefactos**:

- [`data-model.md`](data-model.md): los formatos, escritos como contrato;
- [`contracts/api-routes.md`](contracts/api-routes.md): las propuestas sobre `docs/api.md`;
- [`contracts/cli-commands.md`](contracts/cli-commands.md): las órdenes;
- [`research.md`](research.md): las decisiones y sus alternativas;
- [`quickstart.md`](quickstart.md): cómo se valida cada entrega.

## Contexto técnico

| | |
|---|---|
| Lenguaje | TypeScript estricto, ESM, Node 22.23.2 (`.nvmrc` = 22). Lambda con Node 22 |
| Dependencias nuevas | **Ninguna externa mientras la P3 esté sin contestar.** El *workspace* `@atlas/api` depende solo de `@atlas/domain` y `@atlas/adapters` (B4). Criptografía con `node:crypto` (HMAC, HKDF, RS256 con JWK, `randomBytes`, `timingSafeEqual`) y, en la web, Web Crypto (solo SHA-256); `fetch` de Node hacia Google; `node:http` para el *loopback* de la consola |
| AWS | Detrás de **interfaces estrechas propias** (§1), probadas con dobles. El SDK solo se enchufaría en la composición, si el usuario dice que sí (§9) |
| Red en los tests | Ninguna salida: dobles de S3, SSM y Google (claves RSA generadas en el test) y `fetch` inyectado |
| Tests | vitest. Un proyecto nuevo, `api` (`apps/api`), en `vitest.config.ts`. `packages/domain` al 100 % |
| Navegador | Chromium de Playwright (`~/.cache/ms-playwright/chromium-1234`, Chrome for Testing 151.0.7922.34), conducido desde el *scratchpad*; nunca Playwright en un `package.json` |
| Paquete web, partida | **Arranque 75.843 (techo 75.869); total 280.039 (techo 280.064)**, medidos sobre `b3e2fcb` (`questions.md` §4) |

## Comprobación contra la constitución

| Principio | Cómo lo cumple el plan | Estado |
|---|---|---|
| I. El libro es la fuente de verdad | Ningún tipo ni campo nuevo, y `schema_version` no se toca. Todo lo nuevo vive fuera del libro (data-model) | Sí |
| II. Append-only | La API solo usa `appendLines` y la inicialización sobre vacío. `replace`/`replaceLines` y `DeleteObject`, inalcanzables desde el manejador (test de arquitectura). La restauración archiva sin sobrescribir | Sí |
| II. Fiscalidad solo del libro | La predicción fiscal se escribe antes, y la salida es byte a byte con y sin `sync/` y tras sincronizar por la API (§13) | Previsto |
| III. Compartimentación | La API no interpreta el libro más allá de `acceptAppend` y `acceptInit` | Sí |
| IV. Nada configurable en el código | Duraciones, cachés, tolerancia y umbrales, en variables de entorno de la Lambda (no secretas) o en `atlas.config.json`. **El techo de 120 días sí va en el código**: es un tope de seguridad, no un ajuste (ADR-0033) | Sí |
| IV. Lo personal o secreto, fuera del libro | La lista, los secretos y los registros de los tokens, en SSM; el token, en `credentials.json` | Sí |
| V. Fallo seguro | `ThrottlingException` y los 5xx de S3 son `503 remote_unavailable`, **nunca** una credencial que pasa. Un objeto de dispositivo que falta o es ilegible **niega**. Los lectores son estrictos | Sí |
| VI. Veinte años y pocas dependencias | Cero dependencias externas (P3 pendiente). Todos los formatos son JSON legible | Sí |
| VII. Tests primero | La tabla de §4 y los mutantes de §5 del encargo (del 1 al 49, con sus variantes), cada uno visto morir | Previsto |
| Seguridad | Validación en el *backend*; la CSP de la SPA no cambia; nada de terceros; IAM de mínimo privilegio (§10); tokens en SSM | Sí |
| Privacidad y registros | El test de centinelas, sobre `stdout` y `stderr` (R25) | Previsto |

## 1. Dónde vive cada cosa

| Qué | Dónde | Puerta |
|---|---|---|
| **Las reglas del acceso**, puras: clasificar las credenciales, `Origin`, verificar una carga firmada (sin el HMAC), las reclamaciones del ID token y su cabecera, la lista permitida, el formato del token, el registro y el orden de su comprobación, la caducidad y el techo, el alcance por ruta, el objeto del dispositivo y su aceptabilidad, `device_name` y los parámetros de `console/start`, la reemisión, la elección de la entrada de `credentials.json`, `sync/remote.json`, el nombre de un dato de referencia y los códigos | `packages/domain/src/access/` (nueva) | **`@atlas/domain/access`**, nunca en el barril. **La web no la importa** (test de arquitectura) |
| La función de N1 (rehacer con la regla de `correctEvent`) y la espera entre unidades | `packages/domain/src/sync/redo-record.ts` y `resolve.ts` | `@atlas/domain/sync` (Q5) |
| El filtro de dispositivos activos para `rewritePermission` | `packages/domain/src/sync/permission.ts` | `@atlas/domain/sync` |
| **Las interfaces estrechas de AWS** (`ObjectStore`: `get`, `putIfMatch`, `putIfNoneMatch`, `list`; `ParameterStore`: `get`, `putNew`, `overwrite`, `listByPath`) y lo que se apoya en ellas: `S3LedgerStore`, el almacén de dispositivos, el registro de tokens, el lector de secretos con caché y la copia de documentos de administración | `packages/adapters/src/aws/` | subruta **`./aws`**, solo Node. **Nunca** en el barril `"."` ni al alcance de la web |
| Las primitivas criptográficas de la API (HMAC, HKDF, RS256 sobre JWK) | `packages/adapters/src/access/crypto.ts` | subruta `./access` (Node) |
| **El cliente OIDC de Google**: las direcciones del bloque 0 fijadas en el código, el canje por `fetch` inyectado y las claves con su caché | `packages/adapters/src/identity/google.ts` | subruta `./identity` (Node). Test: ninguna dirección de Google fuera de aquí y de `apps/api` |
| **El cliente HTTP de `RemoteLedger`**, uno solo con la credencial inyectada: la consola con `x-atlas-device-token`, `redirect: "error"` y solo HTTPS a su origen; la web con la cookie. `x-amz-content-sha256` con Web Crypto (existe en Node 22 y en el navegador) | `packages/adapters/src/sync/http-remote.ts` | subruta **`./sync-http`**, sin Node ni DOM; en `LAZY_ONLY` |
| El *loopback* de la consola, `credentials.json` y el lanzador del navegador | `packages/adapters/src/remote/` | barril `"."` de Node (como `folder-store.ts`) |
| **La Lambda**: `createHandler(deps)`, el evento de la Function URL 2.0, el enrutador, las rutas, las páginas HTML, los registros y la configuración. `compose.ts` monta los adaptadores con las interfaces que reciba | `apps/api/src/` (`@atlas/api`) | nada la importa (test) |
| Las órdenes de la consola | `apps/cli/src/commands/{remote,sync,admin}.ts`; `backup.ts` se amplía | — |
| Las pantallas de la web | `apps/web/src/routes/ajustes/sync/` (sección perezosa de Ajustes, Q7) y `apps/web/src/sync/` | en `LAZY_ONLY` desde su primer commit |
| **Los dobles** (`test-only-fake-s3.ts`, `test-only-fake-ssm.ts`, `test-only-fake-google.ts`: el nombre dice que no son de producción, y cada comportamiento imitado cita su fuente) y el servidor local de las capturas | `tests/support/api/` | **solo tests**. Test: nada alcanzable desde `apps/api/src` ni desde los `exports` los importa |

## 2. La partición, tal como la sigo

La de §3 del encargo, **sin cambios**: E1 → E2 → E3 → E4 → E5. Es una rama y son cinco PRs, cada una con su commit congelado, la revisión en worktrees desacoplados y `git log origin/develop..feature/015-api-access` vacío antes de seguir. Dentro de cada entrega, los bloques del encargo en su orden:

- **E1**: bloque 1 (guardianes), bloque 2 (esqueleto), bloque 3 (acceso de la web).
- **E2**: bloque 0, las reglas en el dominio, la API, la consola y la pantalla de dispositivos.
- **E3**: bloque 0, `S3LedgerStore`, las rutas, los datos de referencia, los clientes y las órdenes, y lo heredado de la 014.
- **E4**: P2 y P3 → aflojar el guardián → la ligadura → las pantallas → los dos fallos.
- **E5**: bloque 0, las órdenes de administración, `atlas backup` y los procedimientos.

**Un solo añadido que propongo**: la primera tarea de **E1** es el test de estructura «nada alcanzable desde `apps/api/src` importa un doble ni `tests/`», antes de que existan los dobles.

## 3. Bloque 0

El de E1 está hecho (`questions.md` §1), con fuentes, citas y conclusiones. **Lo que cambia en el plan por él**:

- los dos `iss` literales;
- RS256 y nada más;
- las claves según su `Cache-Control`, con un tope de 24 h y una recarga con límite ante un `kid` desconocido;
- `mfa_required` propuesto como no emitido (Q2);
- las cookies de `event.cookies` y `headers.cookie`, con el duplicado de la sesión como `session_invalid`;
- el `413` con un tope propio.

La lista de E2 a E5, con cuándo se hace cada punto, está en `questions.md` §2.

## 4. Las reglas de seguridad, cada una con su test y su mutante (el índice de E1 y E2)

Cada regla es una función pura del dominio o una comprobación del manejador, y **cada test se ve en rojo antes que el código**. «M n» es el mutante n de §5 del encargo. Los tests de E1 viven en `apps/api/test/` (manejador) y en `packages/domain/test/access/` (reglas); los de la consola, en `apps/cli/test/remote/`.

### 4.1 ADR-0027 y `docs/api.md` §1 a §3 (E1)

| # | Regla (fuente) | Test | Mutante |
|---|---|---|---|
| R01 | `Authorization` no se lee ni se escribe (ADR-0027, hecho 1; api §1) | Arquitectura: ningún fichero de `apps/` ni de `packages/` accede a la cabecera `authorization`; y un test de manejador con `Authorization` presente, que la ignora | M8 |
| R02 | Cookie y token a la vez: `400 credentials_ambiguous`, **sin mirar ninguna** (api §2) | Con una cookie mal firmada y un token mal formado sigue siendo `credentials_ambiguous`, y el doble de SSM no recibe ninguna llamada | M5 |
| R03 | Sin credencial: `401 unauthenticated`, en toda ruta que no es de inicio de sesión (api §2) | Tabla de rutas × sin credencial | quitar la comprobación en una ruta |
| R04 | Escritura con cookie: `Origin` igual al propio; **ajeno o ausente**, `403 origin_rejected` (ADR-0027; N6) | Tres casos por ruta que escribe: igual, ajeno y ausente | M6 (`if (origin && origin !== self)`) |
| R05 | Cuerpo JSON obligatorio en toda escritura: `415 body_not_json` (ADR-0027) | Sin cuerpo, con `text/plain` y con JSON roto | aceptar lo que no es JSON |
| R06 | La cookie de sesión es `__Host-`, `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, sin `Domain` (ADR-0027) | Se analiza la `Set-Cookie` emitida, atributo por atributo | M7, un mutante por atributo |
| R07 | La transitoria es `SameSite=Lax`, firmada, caduca, se borra en toda vuelta y es de un solo uso (ADR-0027) | Atributos; una vuelta repetida con la misma cookie falla, porque la primera la borró y el `state` ya no cuadra en el doble de Google; caducada es `login_attempt_missing` | M7 (`Strict`); no borrarla |
| R08 | Cada propósito con su subclave HKDF y su `typ`; cada verificador rechaza el ajeno (ADR-0033, punto 2; B3) | Una matriz 3×3: sesión, intento y código, cada uno presentado a los tres verificadores; más una carga firmada con la clave **sin derivar** | M1 |
| R09 | `state` contra la cookie transitoria **antes** del canje (ADR-0027) | `state` distinto: `login_state_mismatch`, y el doble de Google no recibe el canje | M2 (`state`) |
| R10 | El canje lleva el verificador PKCE (ADR-0027) | El doble de Google exige `code_verifier` S256 del `code_challenge` de la autorización | M2 (PKCE) |
| R11 | Firma RS256 contra las claves de Google; `alg: none`, `HS256` con la clave pública como secreto y un `kid` desconocido se rechazan (ADR-0027; bloque 0.1) | Cuatro ID tokens fabricados por el doble | M3 |
| R12 | `aud` igual al cliente **del entorno** | Un ID token con el `aud` del otro entorno | M2 (`aud`) |
| R13 | `iss` es uno de los dos literales | `https://accounts.google.com.evil` y `accounts.google.co` | M2 (`iss`) |
| R14 | `exp` no vencido | Un token vencido | M2 (`exp`) |
| R15 | `nonce` igual al del intento | Otro `nonce` | M2 (`nonce`) |
| R16 | `email_verified === true` | `false`, ausente y `"true"` (una cadena) | M2 (`email_verified`) |
| R17 | `sub` y correo **juntos** en una misma entrada de la lista | El `sub` de una entrada con el correo de otra, y al revés | M2 (el par) |
| R18 | Cada petición con cookie vuelve a consultar la lista, con una caché que no dura más de lo configurado (ADR-0027, enmienda) | Se quita el par del doble de SSM: pasa mientras dura la caché y se niega (`403 not_allowed`) en cuanto vence; se cuentan las lecturas | M4 (no volver a consultar; cachear más) |
| R19 | La sesión caduca en su `exp` | Reloj inyectado, un segundo antes y un segundo después | ignorar `exp` |
| R20 | El `device_id` de la web: solo se acepta al iniciar sesión uno que la API emitió, de tipo `web` y `active`; si no, se asigna uno nuevo con su objeto (`If-None-Match: *`); **nunca** se toma del cuerpo, de la URL ni de una cabecera en una petición (§7 P1; B1) | Iniciar sesión con uno válido, uno inventado, uno olvidado y uno de consola; y una petición con `device_id` en la consulta, en una cabecera y en el cuerpo: ninguno cambia el de la cookie | M12 bis |
| R21 | Cada petición con cookie comprueba que el objeto de su dispositivo **existe, es `web` y está `active`**: si no, `403 device_forgotten` (B1; R2-B2) | Olvidado, borrado por fuera y cambiado a `console` | M12 bis, M46 quinquies y M46 sexies |
| R22 | La página de acceso denegado: solo el `sub` **de la cuenta recién autenticada**, nunca el correo, sin *script*, `no-store` y `no-referrer`, y el `sub` ni en una URL ni en el registro (ADR-0027; P8 (c); N10) | Se analiza el HTML y las cabeceras; se hace otra vuelta con una cookie de sesión de otra cuenta presente, y la página enseña el `sub` recién autenticado; centinela en el registro | M10 y M12 ter |
| R23 | `GET /api/session`: `signed_in` solo con una cookie válida, y el `device_id` **de la cookie** (P8 (a); B5) | Mal firmada, de otro `typ`, caducada y válida | M12 ter y M12 quater |
| R24 | Ninguna ruta de datos redirige (api §1) | Una tabla de todas las rutas: nunca `3xx` fuera de `login`, `callback` y `console/start` | devolver un `302` en una ruta |
| R25 | Nunca se registra un token, un hash, un secreto, el correo, el `sub`, el `sid`, un código, un verificador ni una línea; ni el `error.message` de un error ajeno (§2 bis; N3) | **Centinelas**: se recorren todas las rutas con valores reconocibles y con cuerpos mal formados que **empiezan** por el centinela; se capturan `stdout`, `stderr` y el registrador | M9 |
| R26 | Nada del SDK de AWS ni ninguna dirección de Google alcanzable desde la web ni desde el dominio; lo que alcanza la web **se deriva de `exports`** (§2 bis) | Arquitectura: la lista de subrutas de `adapters` que alcanza `apps/web/src` sale de `package.json`, y una subruta nueva entra sola | M11 (añadir una subruta sin que el test la mire) |
| R27 | La web no configura la sincronización antes de E4 (§0) | Arquitectura: ningún módulo de `apps/web/src` alcanza `initialiseRemote`, `replaceFromRemote`, `joinWithOwnLines`, `http-remote` ni las escrituras de `sync:*` | M12 |
| R28 | `apps/api` no es alcanzable desde la web, la consola ni el dominio; el dominio no importa nada | Arquitectura | importar `@atlas/api` desde la consola |
| R29 | Errores con la forma `{ error: { code, details } }`, sin frase (api §7) | Toda respuesta de error de la tabla de rutas se valida contra la forma | añadir `message` |
| R30 | Ningún secreto en una variable de entorno; la configuración, cerrada (spec. §11.8) | El cargador rechaza una variable desconocida `ATLAS_*` y no lee nada que se llame `*SECRET*` o `*KEY*` | leer la clave de sesión del entorno |
| R31 | Un fallo transitorio de SSM al leer la lista o los secretos es `503 remote_unavailable` y **nunca** deja pasar (ADR-0034, fila 13) | `ThrottlingException` del doble en cada lectura | M27 y M29 ter |

### 4.2 ADR-0033 y `docs/api.md` §2 y §4 (E2)

| # | Regla (fuente) | Test | Mutante |
|---|---|---|---|
| T01 | Formato `^atlasdt1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$` **antes** de construir el nombre del parámetro (B1) | `atlasdt1.<id>:1.<secret>` y `…/…`: el doble de SSM no recibe ninguna llamada | M13 (sin validar) |
| T02 | El registro, sin selector y **con su propio `token_id` igual al pedido** (B1) | El doble imita `nombre:versión` (verificado en el bloque 0.3 de E2): un revocado no vuelve a valer; y un registro con otro `token_id` dentro | M13 (aceptar otro `token_id`) |
| T03 | El hash del secreto, comparado en tiempo constante | Un secreto erróneo con el mismo prefijo; y arquitectura: la comparación usa `timingSafeEqual` | comparar con `===` (muere por arquitectura) |
| T04 | Revocado: `device_token_revoked`, también para renovar | Renovar con uno revocado | M17 |
| T05 | Caducado: antes de `expires_at` **y** antes de `issued_at` + 120 días | Un registro con `expires_at` a 200 días | M16 (solo `expires_at`) |
| T06 | Una configuración de más de 120 días no arranca; cambiarla no alarga un token emitido | Arranque con 121; se emite con 90 y se comprueba con 120 configurados | M16 |
| T07 | El par sigue en la lista (`403 not_allowed`) | Se quita el par | saltarse la lista |
| T08 | El objeto del dispositivo existe, es `console` y está `active`: si no, `device_forgotten` | Olvidado, borrado y `web` | M46 quinquies y M46 sexies |
| T09 | **Sin caché positiva, y sin caché de «no existe»**; solo se cachean, si acaso, revocado y caducado (B2) | Se revoca en el doble entre dos peticiones de la misma instancia; se crea después de un «no existe» | M14 |
| T10 | `ThrottlingException`: `503 remote_unavailable`, nunca válido ni inválido para siempre | El doble lanza y después responde | M27 y M29 ter |
| T11 | El alcance de api §2.3: token en una ruta solo de sesión, `403 forbidden_for_credential` | Tabla ruta × credencial | M26 |
| T12 | El dispositivo, de la credencial; un `device_id` en el cuerpo es `400 body_invalid` | En cada ruta que escribe | M18 y M26 |
| T13 | `console/start`: cada parámetro con su regla y su nombre en `details`; `device_name` según contracts §B | Uno por parámetro y por borde | M29 |
| T14 | `console/start` con un token no abre ningún intento | Presentar un token | M26 |
| T15 | La consola pide `prompt=select_account` | Se lee la URL del `302` | quitarlo |
| T16 | La rama de consola de la vuelta: **sin cookie de sesión**, y el código con la subclave `console_code` y su `typ` | Ninguna `Set-Cookie` de sesión; la matriz de R08 | M15 |
| T17 | *Loopback*: `302` al literal `http://127.0.0.1:<port>/callback`, con el puerto validado | Puertos 1023, 65536 y `0x50`; `localhost` | M20 |
| T18 | Página manual: sin *script*, CSP `sandbox`, `no-store`, `no-referrer`, y el código **solo dentro del `<details>`** tras confirmar el nombre | Se analiza el HTML | M21 |
| T19 | `amr` con `mfa` (si Q2 dice lo contrario de la propuesta) | — | M28: no aplicable con Q2 |
| T20 | Canje: firma y `typ`, caducidad, PKCE y la lista otra vez, en ese orden | Uno por fallo, con su código | M15 |
| T21 | Un solo uso: `putNew` sin sobrescribir; un segundo canje, `409 console_code_used` | Dos canjes seguidos y dos concurrentes contra el doble, que imita `ParameterAlreadyExists` (bloque 0.1 de E2) | M19 |
| T22 | Renovar: el anterior (caducado sí, revocado no) se **revoca antes** de crear el nuevo, y se conserva el `device_id` | Un corte entre los dos pasos (el doble falla en `putNew`) deja el anterior revocado y ninguno nuevo; es un estado seguro, y la consola vuelve a iniciar sesión | M18 (crear antes de revocar) |
| T23 | Reemisión: las tres condiciones, tras Google y PKCE, la confirmación en la página con los datos del servidor y **todos** los tokens anteriores del dispositivo revocados antes (N5; R2-B1; R2-N1) | Olvidado, inexistente y `web`; sin confirmación no hay código; dos tokens vivos anteriores quedan revocados | M29 sexies |
| T24 | `console/revoke` revoca **ese** token y solo ese | Dos tokens del mismo dispositivo | revocar otro |
| T25 | Lista y revocación, solo con sesión; `<token_id>` validado **antes** del nombre; revocar uno ya revocado devuelve el mismo `revoked_at` sin escribir | El doble cuenta las escrituras | M26 |
| T26 | El registro se escribe solo al crear y al revocar, y la API **nunca** lo borra: `ParameterStore` no tiene ni borrar ni etiquetar versiones | Arquitectura: la interfaz no expone esas operaciones, y nada de `apps/api` llama a otra cosa | añadir `delete` |
| T27 | El *loopback* de la consola: solo en `127.0.0.1`, puerto 0, un `state` erróneo **se ignora** y el puerto sigue esperando, y la página sin nada externo y con `no-referrer` | Una petición con `state` erróneo y después la buena | M22 |
| T28 | La consola imprime siempre la URL; el canje con `redirect: "error"`, solo por HTTPS y solo al origen del token | `fetch` inyectado que redirige; un origen `http://` | M23 |
| T29 | El token nunca en un argumento, una variable de entorno, una URL, la salida ni un error | Centinela en toda la consola | M23 |
| T30 | `credentials.json` se crea con `600` y de forma atómica; con otros permisos no se usa; se niega dentro de la carpeta del libro (o al revés); solo lo escribe la consola, y la web, las copias, las exportaciones y la sincronización no lo leen | Sistema de ficheros inyectado; arquitectura | M24 |
| T31 | `credentials.json` es un mapa por `device_id` | Dos carpetas contra el mismo origen conservan cada una su token | M29 bis |
| T32 | `sync/remote.json`: lectura estricta y escritura bajo el cerrojo, en la secuencia de §7 | Una clave desconocida, `format: 2` y un corte en cada hueco | M29 bis y M29 quater |
| T33 | `atlas remote login` no escribe nada en la carpeta del libro | Árbol de la carpeta antes y después; `compact`, desactivar y `acceptInvalid` se comportan igual | M29 quater |
| T34 | Renovar solo con la entrada que nombra `sync/remote.json`; inicializar o unirse solo con una entrada cuya pista sea exactamente esta carpeta | Los dos escenarios de B2 | M29 quinquies, uno por escenario |
| T35 | `logout` borra la entrada local solo con el `200`; `--local-only` es explícito | 5xx y fallo de red: la entrada sigue | M25 |
| T36 | Aviso de caducidad próxima | Umbral −1, 0 y +1 días | no avisar |
| T37 | El nombre del dispositivo, escapado donde se muestre (página manual, página de reemisión, lista de la web) | Un nombre con `<`… no pasa la validación; se prueba también el escape con un registro sembrado a mano | M29 (sin escapar) |
| T38 | Emisiones recientes destacadas (`recent`) | En el borde de 7 días | invertir la comparación |

## 5. Los formatos

En [`data-model.md`](data-model.md):

- las cargas firmadas y su verificación;
- el registro del token;
- la lista permitida;
- los parámetros de SSM;
- la configuración de la Lambda;
- el objeto del dispositivo;
- `credentials.json`;
- `sync/remote.json`;
- `admin.json`;
- las transiciones de estado.

## 6. Propuestas que decide la dirección (§6.2 del encargo)

- **(a) Los [PENDIENTE] de `docs/api.md`**, todos **fuera del libro**, como variables de entorno de la Lambda, que no son secretas (data-model §5):
  - la caché de la lista, **120 s**;
  - la sesión, **8 h**, absoluta;
  - la cookie transitoria, **10 min**;
  - cerrar la sesión: `POST /api/auth/logout` → `204`, borra la cookie sin validarla (contracts §A);
  - `device_name`, **de 1 a 40**, con el alfabeto cerrado de contracts §B;
  - el código de la consola, **5 min**;
  - «recientes», **7 días**;
  - la tolerancia de `recorded_at`, **10 min**.
- **(b) La cookie transitoria**: firmada con su propia subclave, `atlas login v1`, y `typ: "atlas.login"`. Las etiquetas `info` de HKDF son `atlas session v1`, `atlas login v1` y `atlas console_code v1` (data-model §1.1). **Firmadas, no cifradas**, con la alternativa escrita (data-model §1.3 y §1.4).
- **(c) La caché de los secretos**: **300 s**. Rotar la clave de sesión cierra todas las sesiones como mucho en 5 minutos, y el paso 4 del procedimiento de la cuenta robada dice «espera 5 minutos».
- **(d) Los nombres de SSM**:
  - `/atlas/<entorno>/auth/allow-list`;
  - `/atlas/<entorno>/auth/google-client-id` (`String`);
  - `/atlas/<entorno>/auth/google-client-secret`;
  - `/atlas/<entorno>/auth/session-key`;
  - `/atlas/<entorno>/device-tokens/<token_id>`.

  La lista es `{allow_list_format: 1, entries: [{sub, email}]}`, y el **correo se compara exacto** (data-model §3 y §4).
- **(d bis) Las formas exactas**:
  - `GET /api/session`, `remote_unavailable` (`503`, `Retry-After: 5`, `details.dependency`) y las páginas (contracts §A, §D y §E);
  - `sync/devices/<id>.json` (data-model §6);
  - la IndexedDB copiada: **solo se documenta** (Q6).
- **(e)** El aviso de caducidad a **14 días** (`token_expiry_warning_days` en `atlas.config.json`), y borrar solo lo local con **`atlas remote logout --local-only`**.
- **(f) Las órdenes**: las de [`contracts/cli-commands.md`](contracts/cli-commands.md). **El sitio de la web**: una sección de Ajustes cargada en diferido, `/ajustes#sincronizacion`, con cuatro tarjetas (Sesión, Sincronizar, Lo retenido y Dispositivos) y, en E4, los diálogos de empezar, desactivar y volver a descargar (Q7).
- **(g)** La salida del rehacer a medias y la espera entre unidades: §8.
- **(h)** Los datos de referencia: contracts §C.
- **(i)** El navegador real sin AWS: §11.
- **(i bis)** La confirmación sin *script* en la página manual y en la de reemisión: un `<details>` cuyo `<summary>` es la confirmación. En *loopback* con reemisión, un enlace al literal `127.0.0.1`. **La alternativa** son dos peticiones, con un vale firmado en la segunda. Lo que se ve en el `<details>` se prueba en Chromium en el bloque 0.5 de E2.

## 7. `sync/remote.json` y el marcador: la secuencia y sus estados intermedios

**Regla** (§7 P16; N4): se escriben **bajo la misma toma del cerrojo**, después de la red, que va fuera del cerrojo, y **primero `sync/remote.json` y después el marcador**. `remote.json` es la identidad del destino; el marcador, la prueba de que se llegó. Así, **un corte nunca deja un marcador sin saber de qué remoto es**. Unirse ya escribe bajo una toma el archivo, el libro, lo retenido y el marcador (014), y `remote.json` va **el primero** de esa toma.

| Estado | Cómo se llega | Qué hace cada orden |
|---|---|---|
| **S0**: sin `sync/` | La carpeta de siempre; o `init` cortado **después** del `PUT` remoto y **antes** de la toma | `sync`: `sync_not_configured`. `init`: si el remoto tiene **exactamente** los bytes del libro local, **termina** la inicialización (escribe `remote.json` y el marcador) y lo dice; si está vacío, inicializa; si tiene otra cosa, se niega y remite a `join`. `compact` y `acceptInvalid`, como siempre |
| **S1**: `remote.json` sin marcador | Corte entre las dos escrituras | Es «configurada con el marcador ausente» (D-Q6): `compact`, desactivar y `acceptInvalid` se niegan, que es fallo seguro. `sync` reconstruye el marcador como la parte común con **el remoto que nombra `remote.json`**: tras `init`, es todo, y sigue; tras un `join` cortado, con líneas propias, para con `join_required`, y **repetir el `join`** lo termina. `init` y `join` reconocen S1 («inicialización o unión a medias») y la terminan **solo si el origen y el `device_id` coinciden** con los suyos; si no, se niegan con `sync_remote_mismatch` |
| **S2**: `remote.json` y marcador | Terminado | Normal |
| **S3**: marcador sin `remote.json` | Una carpeta de la 014 o de antes; nunca la produce la 015, porque `remote.json` va primero | `sync`, `init` y `redownload` se niegan con **`sync_remote_unknown`**: «esta carpeta está sincronizada pero no dice con qué remoto; asóciala con `atlas sync join --from-remote --origin <url>` o `--with-own-lines`». El remoto **nunca se deduce**: lo nombra el usuario, y la entrada de `credentials.json` tiene que tener la pista de esta carpeta |

Cada hueco tiene su test de corte (sistema de ficheros inyectado, como en la 014) y su mutante: escribir `remote.json` después del marcador o en otra toma (M29 quater). **Una consola de la 014** no lee `remote.json` ni lo barre, y su temporal huérfano es inocuo (§7 P16). La de la 015 lo barre: `sync/remote.json.tmp-<pid>-<hora>`, en `sweepOrphanTemporaries`, con su test y su mutante.

## 8. Lo que deja la 014 (E3, bloque 5)

1. **El rehacer a medias. PROPUESTA (a), la mínima:** la salida **ya existe y es descartar**, porque `discardHeld` no mira si hay un rehacer empezado. Lo que falta es decirlo.
   - `redo_not_recorded` gana en las dos interfaces la frase: «si registraste a mano lo que había que rehacer, descarta lo retenido: lo que registraste se queda en tu libro».
   - Hay un recorrido que lo reproduce: se empieza a rehacer, se registra a mano media pareja, `finishRedo` se niega y descartar lo resuelve sin perder nada.
   - **El rehacer sigue reconociéndose solo por los identificadores sellados.**
   - **(b)**, si la dirección quiere que además se pueda **volver a rehacer**: un registro `redo_cancelled` en `held.jsonl` que suelta los identificadores sellados. Es un cambio de formato fuera del libro que sube `held_format` a 2, y una consola de la 014 leería ese fichero como ilegible, que es fallo seguro. **Recomiendo la (a).**
2. **La espera entre unidades.** `targetOf` gana dos pasos más, en este orden:
   1. dentro de la unidad, `redo_waits_for_pair`, como hoy;
   2. si el objetivo es una línea retenida **en otra unidad sin resolver**, se niega con **`redo_waits_for_unit`** (`details.unit`: «primero la unidad X»);
   3. si el objetivo se rehízo en otra unidad, se traduce con los registros `resolved`/`redone` de **todo** `held.jsonl` (`replaces` → `event_id`) y después `inForce`.

   Todo por identificador exacto. Primero, un recorrido rojo que lo reproduce.
3. **Los mensajes**: `sync_deactivated` y `join_required` de la consola nombran **`atlas sync join --from-remote`** y **`--with-own-lines`** (E3). Los de la web, en E4, con sus botones (N11).
4. **Rehacer con el libro inválido (§7 P6; N1; N2).**
   - `recordRedo(deps, plan, event, options)` en `packages/domain/src/sync/redo-record.ts`:
     1. acepta solo planes `record` y `reverse`;
     2. **comprueba `event.id === plan.id`**, y si no se niega con `redo_id_mismatch`;
     3. comprueba que el tipo coincide con el borrador;
     4. registra con la regla de `checkCandidate`: solo se niega por lo que **él** deja inválido, más la huella con su confirmación.
   - Los planes `correct` ya van por `correctEvent`.
   - **Un test de estructura**: solo importan `recordRedo` `held-actions.ts` (la orquestación del rehacer) y el rehacer de la web; nada de `registrar/` ni de las órdenes de registrar.
   - Fuera del rehacer, `recordEvent` no cambia.
   - Coste en el arranque: Q5.
5. **Los tests que faltan**: `correctEvent` sobre un libro ya inválido (`packages/domain/test/usecases/`), y rehacer una línea y una pareja con el libro local inválido por una pareja retenida (el escenario de D-Q1), primero en rojo.
6. **El nombre del archivo repetido**: `confirmHeldUnit`, `replaceFromRemote` y `joinWithOwnLines` prueban `-2` a `-9` con `syncArchiveName`, como `syncDevice`. Un test de corte por orden tras archivar, repetido en el mismo segundo con un reloj fijo.
7. **La propiedad** (`no-line-lost.property.test.ts`), con tres extensiones:
   - comprueba el final **con algo retenido sin resolver**, sin resolverlo todo antes;
   - **corta también en la web** (el doble de IndexedDB con aborto inyectado entre la lectura y el `commit`);
   - **ejercita unirse, volver a descargar y el ejercicio cerrado**.

   Cada extensión se instrumenta (cuántas corridas llegan al estado que importa) y **se ve matar un mutante que sin ella sobrevive**: el orden fijo antiguo de lo retenido, no reintentar el nombre del archivo y confirmar sin la presentación. Las cifras, en `questions.md`.

## 9. Dependencias y artefacto (§7 P3, pendiente del usuario)

- **Hasta que conteste**, `package.json` y el *lockfile* solo cambian por el *workspace* `@atlas/api` (B4). `apps/api` se construye con `tsc` y exporta `createHandler(deps)`. **No hay `lambda.ts` de producción**, porque sin el SDK no hay nada que componer, y se dice en la PR de E1 (Q4).
- **Si el usuario dice que sí**, en E3:
  - `@aws-sdk/client-s3` y `@aws-sdk/client-ssm`, con versión exacta, en `packages/adapters`, **solo** en `src/aws/sdk-*.ts` (dos adaptadores finos de las interfaces estrechas);
  - `esbuild` (desarrollo), para construir `apps/api/dist/lambda.zip` con un guion versionado;
  - el test de arquitectura, ampliado a «el SDK solo en `src/aws/sdk-*`»;
  - `docs/dependencies.md`, en «Documentos».

## 10. Las acciones de AWS que usa la Lambda (para la política de la 017)

| Servicio | Acción | Recurso |
|---|---|---|
| S3 | `s3:GetObject` | `ledger/ledger.jsonl`, `sync/devices/*`, `reference/ecb/*` y `prices/*` |
| S3 | `s3:PutObject` (con `If-Match` o `If-None-Match`; si piden otro permiso, lo dice el bloque 0.1 de E3) | `ledger/ledger.jsonl` y `sync/devices/*` |
| S3 | `s3:ListBucket`, con la condición `s3:prefix` en `sync/devices/`, `reference/ecb/` y `prices/` | el bucket |
| SSM | `ssm:GetParameter` | `/atlas/<entorno>/auth/*` y `/atlas/<entorno>/device-tokens/*` |
| SSM | `ssm:GetParametersByPath` | `/atlas/<entorno>/device-tokens` |
| SSM | `ssm:PutParameter` | `/atlas/<entorno>/device-tokens/*` |
| SSM | `ssm:AddTagsToResource`, **solo si** el bloque 0.2 de E2 confirma que etiquetar al crear lo pide | `/atlas/<entorno>/device-tokens/*` |
| KMS | lo que diga la 017 para `aws/ssm` | — |

**Nunca**: `s3:DeleteObject*`, `s3:PutObject` en `archive/`, `backups/`, `documents/` ni `imports/`, `ssm:DeleteParameter*` ni `ssm:LabelParameterVersion`.

- **La salida a Internet** es solo a `accounts.google.com`, `oauth2.googleapis.com` y `www.googleapis.com`, por HTTPS.
- **El rol de administración (E5)**: `s3:GetObject`, `s3:PutObject` y `s3:ListBucket` en el bucket de datos, más `ssm:GetParametersByPath` y `ssm:PutParameter` en `device-tokens/`.
- **Consecuencia de despliegue para la 018**: la Lambda se despliega **antes** que los clientes que escriban una versión nueva del esquema (ADR-0026, caso 6).

## 11. Cómo se ejercita en un navegador real, sin AWS y sin Google (§6.2 (i))

Un servidor local, `tests/support/api/local-server.ts`, que:

- compone `createHandler` con `test-only-fake-s3` (en un directorio del *scratchpad*), `test-only-fake-ssm` (sembrado con una lista permitida, un secreto y una clave de sesión sintéticos) y `test-only-fake-google` (autoriza con un formulario propio en `/__fake-google/authorize`, donde se elige una de tres cuentas sintéticas: permitida, no permitida y con `email_verified: false`, y firma los ID tokens con una clave RSA generada al arrancar);
- sirve `apps/web/dist` en `/` y el manejador en `/api/*`, **en el mismo origen**, `http://127.0.0.1:<puerto>`. Chromium 151 acepta así las cookies `__Host-` (`questions.md` §2).

**Tres condiciones**:

- el manejador recibe el proveedor de identidad **como puerto**: las direcciones de Google no son configurables por entorno, y la composición de producción usa las del código;
- **nada alcanzable desde `apps/api/src` ni desde ningún `exports` importa `tests/`** (test de arquitectura, el primero de E1);
- el servidor se arranca desde el *scratchpad*, con su orden en `quickstart.md`.

Las capturas se toman con Chromium conducido desde el *scratchpad*, a 400×890 con DPR 3, a 2045×1141 y a 360 de ancho, y van a `~/atlas-private/capturas/<fecha>-<asunto>/`.

## 12. El paquete web: la partida y la estimación trozo a trozo

**Partida**: arranque **75.843** (techo 75.869); total **280.039** (techo 280.064). **Autorización de §7 P13**: el arranque, hasta 76.069; el total, hasta 284.160.

| Entrega | Trozo | Arranque (estimado) | Total (estimado) |
|---|---|---|---|
| E1 | Tarjeta de sesión y cliente de `GET /api/session` (sección perezosa de Ajustes, Q7) | +0 a +10 (ruido de la tabla) | +1,5 a +2,5 KB |
| E1 | Si la dirección prefiere una ruta propia (Q7) | +25 a +45 | igual |
| E2 | Tarjeta de dispositivos (lista, revocar, recientes) | +0 a +10 | +1,5 a +2,5 KB |
| E3 | La función de N1 en `sync/` (Q5) | +0 a +10 (+40 a +80 si va en `record-event.ts`) | +0,2 KB |
| E3 | Las frases de los códigos nuevos (`errors`, perezoso) | 0 | +0,5 a +1 KB |
| E4 | P2 y P3 (el parche de `deferred/`; la 014 midió +23 en su árbol) | **+18 a +23** | +0,3 KB |
| E4 | Aflojar el guardián: la configuración y el motor alcanzables desde la sección | +0 a +30 (tabla de precargas) | **+8 a +9 KB** (medido con `rolldown`, `questions.md` §4) |
| E4 | Pantallas: sincronizar, empezar, lo retenido, desactivar y volver a descargar | 0 | +4 a +7 KB |
| E4 | Los dos fallos de la web (`presentar.tsx`, formulario corporativo; rutas perezosas) | 0 | +0,2 a +0,4 KB |
| E5 | Solo consola | 0 | 0 |
| **Toda la feature** | | **+18 a +85**, es decir, **75.861 a 75.928**, dentro de la autorización | **+16 a +23 KB**, es decir, de 296 a 303 KB: **fuera de la autorización de +4 KB** (Q1) |

**Cada entrega mide antes de su primer commit de web.** Si una subida hace falta, va en su propio commit, **antes** del que la necesita, con lo medido, el desglose y la tendencia en el comentario de `check-bundle.mjs`. **La excepción que dice el encargo (N2)**: lo que el rehacer de E3 añade al dominio del arranque no puede ir en diferido. Con la propuesta de Q5 no toca el arranque, y si la dirección la rechaza, se mide y se sube con esa regla.

## 13. Mutación, gemelos y salida fiscal

- **El guion de mutación** (`015-mut/mutate-015.mjs`, en el *scratchpad*):
  - afirma que el patrón aparece exactamente las veces que dice;
  - restaura el fichero y lo compara byte a byte con el original;
  - **se niega a correr si hay un gemelo `.js`**.

  Hay un lote por entrega (`e1.json` … `e5.json`) con los mutantes de §5 del encargo que le tocan, y el recuento va a `questions.md`.
- **Gemelos**: se buscan antes de cada lote y de cada PR, con la orden y la salida en `questions.md` (§7 de ese fichero).
- **La salida fiscal**: la **predicción** («no se mueve nada») se escribe en `questions.md` **antes** de correr la suite de E3.
  - Se compara `tax` (con `--lots`, `--boxes` y `--json`), `gains`, `income`, `m720`, `m721` y `filed`, byte a byte, con y sin `sync/`, sobre `synthetic-v1` y sobre un libro sincronizado **a través del manejador con el doble de S3**.
  - `git diff tests/fixtures` tiene que salir vacío.
  - Si algo se mueve y no estaba predicho, **se para**.

## 14. Orden de trabajo tras el visto bueno

1. **E1**:
   1. los guardianes en rojo con un `apps/api` vacío (R01, R26 a R28 y el de los dobles; el test de centinelas vacío);
   2. las reglas del dominio (`access/`), con tests y cobertura;
   3. el esqueleto del manejador (R02 a R05, R24, R25, R29 y R30);
   4. la vuelta de Google con el doble (R08 a R19 y R31);
   5. el registro de dispositivos y la sesión (R20 a R23);
   6. la tarjeta de la web y su medida;
   7. el servidor local y las capturas;
   8. los mutantes de E1;
   9. el commit congelado y la PR.
2. **E2**: el bloque 0 (escrito aquí antes del primer código); T01 a T12 en el dominio; T13 a T26 en la API; T27 a T37 en la consola; la tarjeta de dispositivos (T37 y T38); capturas; mutantes; congelar y PR.
3. **E3**: el bloque 0; `S3LedgerStore` con los tests de contrato; las rutas; los datos de referencia; el cliente HTTP; las órdenes y `remote.json` (§7); lo heredado (§8), cada punto primero en rojo; la predicción fiscal y la comparación; mutantes; congelar y PR.
4. **E4**: la medida de P2 y P3 → P2 y P3 (el parche aplicado a mano, cada test visto en rojo) → **en su propio commit**, aflojar el guardián y hacer alcanzable la configuración → la ligadura del `device_id` → las pantallas → los dos fallos → capturas → mutantes → congelar y PR.
5. **E5**: el bloque 0; las órdenes de administración contra los dobles, con sus cortes; `atlas backup`; los tres procedimientos, probados en lo que no necesita AWS; mutantes; congelar y PR.

Cada commit es una línea, en Conventional Commits, con `npm run lint` en verde, y la rama se empuja cada pocos commits.
