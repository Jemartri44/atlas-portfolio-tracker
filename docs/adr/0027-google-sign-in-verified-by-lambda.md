# ADR-0027 — Acceso solo con Google, verificado en nuestra Lambda; sin Cognito

**Estado:** Aceptada (2026-09-24), por decisión de la dirección, que elige la vía c. Ronda 8. La decisión de fondo es de la dirección; la vía c **corrige el texto con el que la dirección abrió la ronda** («la SPA obtiene un ID token de Google»): cargar el *script* de Google en la página rompe la CSP, la constitución y la comprobación del *build*, y eso pesa más que la redacción. **Sustituye** a «Cognito con MFA» de la constitución (Restricciones técnicas), de `docs/specification.md` §9.2, §9.3 y §10, de la tabla de *stack* de `CLAUDE.md` y de ADR-0019 («Cognito protegerá la API»), desde su aceptación.

## Contexto

La especificación protegía la API con Cognito, MFA obligatorio y sin «recordar dispositivo» indefinido. ADR-0019 dejó la web sin autenticación porque no había nada remoto que proteger. Con la nube (ADR-0026) sí lo hay: el libro en S3 y la API que lo sirve.

**Lo que decide la dirección, con su motivo:**

- **Acceso solo con Google, verificado en nuestra Lambda. Ni Cognito ni Lambda@Edge.** Un servicio menos que configurar y mantener veinte años; la verificación en dos pasos la aporta la cuenta de Google del usuario, que ya la tiene; y verificar en la Lambda de la API deja el control en código propio, en una sola región, sin réplicas en el borde.
- **Lista permitida en SSM Parameter Store, nunca en el repositorio**, que es público: ninguna dirección de correo real en ningún fichero.
- **La web estática no se protege con inicio de sesión.** Su código ya es público (el repositorio lo es); lo que se protege son los datos y la API.

**Dos hechos de la plataforma que condicionan el diseño** (documentación de CloudFront, *Restrict access to an AWS Lambda function URL origin*, `docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html`, recogido por la investigación del 2026-09-24):

1. Con Origin Access Control, **CloudFront sobrescribe la cabecera `Authorization`**, porque la usa para firmar la petición a la Function URL (`AuthType=AWS_IAM`).
2. En **`PUT` y `POST`, el cliente tiene que enviar `x-amz-content-sha256`** con el hash del cuerpo.

**Y una restricción propia:** la constitución prohíbe *scripts* de terceros y la CSP de producción es `script-src 'self'` y `connect-src 'self'` (`apps/web/index.html`); `npm run build` falla si el resultado contiene una URL a un origen ajeno (README, «CSP: desarrollo y producción»). La especificación lo razona en §10: un *script* de terceros en una aplicación financiera es una vía de exfiltración.

## Opciones consideradas

**Quién autentica**

1. **Cognito con MFA** (lo escrito). *Ventajas:* MFA que la aplicación exige y puede comprobar. *Inconvenientes:* un servicio más (grupo de usuarios, interfaz de acceso, recuperación), para un solo usuario.
2. **Lambda@Edge.** Descartada por la dirección: código replicado en el borde, registros repartidos por regiones, otro despliegue.
3. **Google, verificado en la Lambda de la API** (decidido).

**Cómo llega el token de Google a nuestra Lambda sin romper la CSP**

- **a. La biblioteca Google Identity Services en la página.** Es lo más corto, y **carga un *script* de Google en la SPA**: exige abrir `script-src` y `connect-src` a Google y rompe la regla de la constitución y la comprobación del *build*. **Descartada**, salvo que la dirección enmiende la constitución.
- **b. Redirección con el token en el fragmento de la URL.** La SPA navega a Google pidiendo solo un ID token con `nonce`; Google vuelve a la SPA con el token en el fragmento, y la SPA lo envía a `/api/session` en **su propia cabecera** (no en `Authorization`) con el hash del cuerpo calculado con Web Crypto. Es la lectura literal de «la SPA obtiene un ID token». *Inconvenientes:* el token pasa por el JavaScript de la página y por la barra de direcciones; el flujo implícito está desaconsejado por las guías de seguridad de OAuth, y **si Google lo sigue admitiendo para un cliente nuevo está SIN VERIFICAR**.
- **c. Redirección con código de autorización y PKCE, con la Lambda como cliente OAuth** (elegida). La SPA navega a `/api/auth/login`; la Lambda redirige a Google; Google vuelve a `/api/auth/callback` con un código; la Lambda lo canjea por el ID token directamente con Google y lo verifica. *Ventajas:* el token **nunca toca la SPA** ni la URL; el retorno es un `GET` sin cuerpo, así que el requisito del hash no aplica; la SPA no necesita conocer el identificador del cliente, de modo que cambiarlo (ver riesgos) es cambiar un parámetro de SSM, no reconstruir la web. *Inconvenientes:* un secreto más (el secreto del cliente OAuth) en SSM, y una llamada saliente de la Lambda a Google en cada inicio de sesión.

## Decisión

Se adopta el acceso **solo con Google, verificado en la Lambda**, y el token se obtiene por la **vía c**: el código de autorización lo canjea la Lambda, que es el cliente OAuth. **El secreto de cliente de Google va a SSM como `SecureString`.** La **a** queda descartada por la CSP y la **b** por pasar el token por la página.

**Verificación, toda en la Lambda y en este orden**, rechazando al primer fallo: firma contra las claves públicas que Google publica (cacheadas según sus cabeceras de caché); `aud` igual al identificador del cliente **del entorno**; `iss` de Google; `exp` no vencido; `nonce` igual al que emitió la propia Lambda para ese intento; `email_verified` verdadero; y **`sub` y correo, los dos**, presentes juntos en una entrada de la lista permitida. Los valores exactos de `iss` y la dirección de las claves se toman de la documentación de Google al implementar (**SIN VERIFICAR** en esta ronda). Sin dependencia nueva: `node:crypto` importa claves JWK y verifica RS256.

**Lista permitida.** Un parámetro `SecureString` por entorno con pares `{sub, email}`. Terraform crea el parámetro con un valor de relleno e ignora los cambios de valor; el valor real se pone con un comando documentado. Para averiguar el propio `sub` la primera vez, la página de acceso denegado se lo enseña **a quien lo pide**, nunca al registro.

**Sesión propia.** Tras verificar, la Lambda emite una cookie `__Host-` con `HttpOnly`, `Secure`, `SameSite=Strict` y `Path=/`, firmada con una clave HMAC guardada en SSM, que lleva solo `sub`, emisión, caducidad y un identificador de sesión. La duración es configuración (la dirección pide que sea corta; el valor se fija en la feature). No hay *refresh token*: al caducar, se vuelve a pasar por Google. Cerrar todas las sesiones es rotar la clave. **La cookie transitoria del inicio de sesión** (estado, `nonce`, verificador PKCE) tiene que ser `SameSite=Lax`: la vuelta desde Google es una navegación desde otro sitio y una cookie `Strict` no viajaría; caduca en minutos y es de un solo uso.

**Por dónde viaja cada cosa, por el hecho 1 de arriba:** la sesión, en la cookie; el token de Google no viaja nunca entre la SPA y la API, porque lo recibe la Lambda directamente de Google. Cualquier credencial que se añada en el futuro va en la cookie o en una cabecera propia, **nunca en `Authorization`**, que CloudFront sobrescribe. Todo `POST` y `PUT` de la SPA lleva `x-amz-content-sha256`, calculado con Web Crypto.

**Contra la falsificación de peticiones:** `SameSite=Strict`, comprobación de `Origin` en toda petición que escribe, y cuerpo JSON obligatorio.

**Registros:** ni el token, ni el correo, ni el `sub`; solo el resultado con su código (`token_invalid`, `not_allowed`…), además de la regla vigente de no registrar importes, posiciones ni cuentas.

## Consecuencias

- **Riesgo: perder la cuenta de Google.** Salida de emergencia: la web local y la consola siguen funcionando sobre la réplica local (ADR-0026, parte A), y los datos de S3 siguen accesibles con el acceso de administración de AWS, que tiene **MFA propia e independiente de Google** (ADR-0028).
- **Riesgo: Google borra un cliente OAuth tras seis meses sin uso**, según indica la dirección (condiciones exactas, aviso previo y posibilidad de recuperarlo: **SIN VERIFICAR**). Con un uso sobre todo local, medio año sin iniciar sesión es plausible. Mitigación: el correo mensual (siempre llega, `docs/specification.md` §9.5) dice cuántos días lleva sin iniciarse sesión y avisa antes de los seis meses; y recrear el cliente es un procedimiento escrito que acaba en dos parámetros de SSM, sin reconstruir la web (vía c).
- **Lo que se pierde frente a Cognito, dicho claro:** la aplicación **no puede comprobar** que la cuenta de Google tenga activada la verificación en dos pasos, ni impedir que Google recuerde el navegador. «MFA obligatorio» pasa a depender de cómo mantenga el usuario su cuenta de Google. **Queda como requisito operativo del usuario** (decisión de la dirección): tener activada la verificación en dos pasos en la cuenta de Google que figura en la lista permitida. Se escribe en el procedimiento de puesta en marcha y en el traspaso de dirección (`docs/prompts/000-director-handoff.md`). Si Google permite forzar la reautenticación en cada acceso con los parámetros de OpenID Connect: **SIN VERIFICAR**.
- **Excepción a «nada creado a mano»:** el cliente OAuth y su pantalla de consentimiento se crean en la consola de Google Cloud, con un procedimiento escrito; si existe una API para gestionarlos con Terraform: **SIN VERIFICAR**. Un cliente y una lista permitida **por entorno**: `dev` nunca acepta la cuenta que da acceso a `prod`.
- **Secretos nuevos en SSM:** el secreto del cliente de Google y la clave de sesión, los dos `SecureString`. La frase «el único secreto es el token Flex de IBKR» de `CLAUDE.md` y de §10 de la especificación deja de ser cierta, y hay que corregirla (junto con las claves de las fuentes de precios de ADR-0031).
- Documentos que hay que actualizar: la constitución (Restricciones técnicas: «Cognito con MFA» → acceso con Google verificado en la Lambda), §9.2, §9.3 y §10 de la especificación, la tabla de *stack* y la de seguridad de `CLAUDE.md`, una nota fechada en ADR-0019, y el traspaso de dirección, con el requisito operativo de la verificación en dos pasos.
- Relacionadas: ADR-0019, ADR-0026, ADR-0028.
