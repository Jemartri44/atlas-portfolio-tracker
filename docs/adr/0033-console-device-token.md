# ADR-0033 — Acceso de la consola a la API: token de dispositivo emitido al final de un inicio de sesión que abre la propia consola

**Estado:** Reemplazada por [ADR-0037](0037-web-only-access.md) (2026-11-03). Aceptada el 2026-09-25; completaba ADR-0027. Nunca llegó a desplegarse.

> **Reemplazada.** La consola ya no tiene acceso propio a la API: el token, su inicio de sesión, `credentials.json`, los objetos de dispositivo y las rutas de este ADR se retiraron. Lo vigente está en [ADR-0037](0037-web-only-access.md) y en [`docs/api.md`](../api.md). El texto original, de 316 líneas, está en el historial de git (`git log -- docs/adr/0033-console-device-token.md`); aquí queda lo que explica por qué se pensó así y por qué se retiró.

## Qué se decidió

La consola (WSL2, sin navegador en su proceso) necesitaba una credencial para leer y escribir el libro de la nube por la API. Se eligió un **token de dispositivo propio**:

- **Credencial:** un token con prefijo (`atlasdt1.…`), identificador público y secreto de 256 bits; el servidor guardaba solo el SHA-256, lo comparaba en tiempo constante y lo registraba en SSM (`SecureString`, no en el bucket de datos, para que no viajara en las copias).
- **Emisión:** solo al final de un inicio de sesión con Google que abría la propia consola (*loopback* a `127.0.0.1` con PKCE, RFC 8252, y variante manual para WSL en modo NAT o SSH), de modo que el token **nunca pasara por la SPA ni por el portapapeles**.
- **Uso:** cabecera propia `x-atlas-device-token`, solo por HTTPS y solo al origen emisor, sin seguir redirecciones; la lista permitida `{sub, email}` se comprobaba en cada petición.
- **Límites:** alcance reducido a lo que la consola necesita, caducidad absoluta de 90 días sin renovar con el uso, revocación uno a uno desde la web y registro sin tokens, correos ni `sub`.

**Descartadas:** el ID token de Google con *refresh token* en disco (credencial de Google en la consola y dependencia de Google en cada petición), credenciales de AWS de larga duración o SigV4 contra S3 (se saltaba la Lambda, que es la única que valida y escribe), un token sin estado tipo JWT (no se puede revocar uno a uno) y el flujo de dispositivo de Google (exigía un `client_secret` en cada consola). Emitirlo en la web y pegarlo a mano se retiró en la revisión: lo habría mostrado la SPA.

## Por qué se retiró

El 2026-11-03 el dueño dijo que no pensaba usar la consola («solo la web principal»). Una credencial *bearer* de 90 días en disco, con sus rutas, su registro en SSM y su servidor *loopback*, era demasiada superficie para un cliente que nadie iba a usar. ADR-0037 la sustituye por la administración con credenciales cortas de AWS y MFA, y por «Cerrar sesión en todos los dispositivos» en la web.
