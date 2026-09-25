# ADR-0033 — Acceso de la consola a la API: token de dispositivo emitido al final de un inicio de sesión que abre la propia consola

**Estado:** **Aceptada (2026-09-25)** por la dirección, en uso de la delegación expresa del usuario sobre el inicio de sesión («elige la opción que creas que encaja mejor», 2026-09-24); el usuario puede revocarla. Propuesta y **revisada el mismo día**. Ronda 8. La primera redacción ponía a prueba la inclinación con la que se abrió la ronda (un token de dispositivo emitido desde la web y pegado en la configuración): **mantenía la credencial** y **cambiaba cómo se emite y dónde se guarda**. **La emisión desde la web se retiró** el mismo día por los argumentos de la tabla de abajo: el token pasaría por la página y por el portapapeles, y una XSS convertiría una sesión corta en una credencial de meses, que es el mismo motivo por el que ADR-0027 eligió la vía c. La revisión fija ocho puntos: el *loopback* con la variante manual, el fichero `credentials.json`, 90 días, las reglas añadidas, SSM, `mfa` si Google lo permite, los nombres de las órdenes y la regla de `gitleaks` como propuesta al usuario (ver «Revisión del 2026-09-25» al final). Después, **la verificación de seguridad del mismo día** concluyó que el diseño de base aguanta, pero encontró tres bloqueantes y diez puntos no bloqueantes. La dirección los decidió todos y están incorporados al texto (ver «Verificación de seguridad del 2026-09-25» al final). Mientras no se acepte, ADR-0027 no cambia. Si se acepta, **completa ADR-0027**, que solo cubre el navegador, y **matiza una frase suya** («No hay *refresh token*»): la consola tendrá una credencial de larga duración, acotada como se dice abajo. Cierra lo que ADR-0026 dejó abierto en «Quién sincroniza».

## Contexto

La feature 014 tiene dos clientes de sincronización (ADR-0026, «Quién sincroniza»). Uno es la web, que ya tiene cómo autenticarse: código de autorización con PKCE, la Lambda como cliente OAuth y una cookie de sesión propia (ADR-0027). El otro es la consola, que no tiene navegador en su proceso ni guarda cookies. El traspaso de dirección lo deja abierto y pide decidirlo antes de escribir el prompt de la 014 (`docs/prompts/000-director-handoff.md`, §8, punto 4).

**Restricciones que pesan:**

- CloudFront sobrescribe `Authorization` con OAC, y `POST` y `PUT` llevan `x-amz-content-sha256` (ADR-0027, hechos 1 y 2): toda credencial nueva va en la cookie o en una cabecera propia.
- La API solo se alcanza a través de CloudFront (ADR-0028, fila 6). Es la única que escribe el libro remoto, y solo añade (ADR-0026, Parte A).
- El acceso es Google más la lista permitida `{sub, email}`, que se vuelve a consultar en cada petición (ADR-0027 y su enmienda). La dirección quiere sesiones cortas y sin *refresh token*, y la verificación en dos pasos de Google es un requisito operativo del usuario.
- Claves locales en `~/.config/atlas/secrets.json`, con permisos `600` y fuera de la carpeta del libro. Ni la web ni ninguna copia, exportación o sincronización lo leen, y **la aplicación nunca lo escribe** (ADR-0031, segunda enmienda). Su lector **rechaza el fichero entero** ante una clave que no conoce (`secrets_unknown_key`, `packages/adapters/src/prices/secrets.ts`).
- Registros: ni tokens, ni correos, ni `sub` (ADR-0028, fila 16).
- Principio IV: el dato personal o secreto vive fuera del libro, en SSM en la nube o en configuración local fuera del repositorio. Nada personal en el repositorio.
- Coste mínimo, sin servicios nuevos sin comprobar su coste (principio VI), y ninguna dependencia nueva sin justificarla (`docs/dependencies.md`).
- La consola del usuario corre en **WSL2**.

**En qué se diferencia la consola de la web.** Su credencial vive semanas en disco, cualquier proceso del usuario puede leerla y quien la tenga puede usarla sin más (es un *bearer*). Pero **al lado, con los mismos permisos, está la réplica del libro** (ADR-0026, Parte A), así que quien lee el fichero del token ya puede leer el libro entero. Con el token robado se gana, además, **seguir leyendo después** y **escribir en el remoto**. Esas líneas solo se añaden, la API las valida con el dominio y el versionado las conserva, pero en un libro que solo crece se deshacen únicamente con anulaciones o con una restauración (ADR-0032). Por eso lo que más protege no es esconder el fichero, sino **la caducidad, la revocación y el alcance**.

**La inclinación con la que se abrió la ronda**, que esta ADR puso a prueba: un token de dispositivo personal, emitido desde la web con la sesión de Google ya iniciada, pegado una vez en `~/.config/atlas/secrets.json` y enviado en una cabecera propia. El servidor guarda solo su hash; el token se revoca uno a uno, caduca, tiene nombre y se lista en la web, y cada petición vuelve a comprobar la lista permitida.

## Opciones consideradas

Hay tres preguntas distintas: qué credencial lleva la consola, cómo le llega y dónde guarda el servidor su registro. Las fuentes (F1-F16) y las pruebas locales están al final.

### Qué credencial

1. **El token de Google en cada petición**: un ID token de una hora que se renueva con un *refresh token* de Google guardado en la consola. *Inconvenientes:* pone una credencial de Google en disco, hace que cada petición dependa de Google, obliga a la Lambda a aceptar tokens con otra `aud`, y revocar un dispositivo pasa a hacerse en Google, no en Atlas. **Descartada.**
2. **Credenciales de AWS**, firmando con SigV4 directamente contra S3 o contra la Function URL. *Inconvenientes:* se salta la Lambda, que es la única que escribe y la que valida (ADR-0026, Parte A), y el único camino, que es CloudFront (ADR-0028, fila 6). Además pone claves de AWS de larga duración en un portátil, que la fila 12 de ADR-0028 prohíbe. **Descartada.**
3. **Un token propio de dispositivo**, como proponía la inclinación inicial. *Ventajas:* se revoca en Atlas, uno a uno; no depende de Google en cada petición; y la lista permitida se sigue comprobando. *Inconveniente:* es una credencial de larga duración, justo lo que ADR-0027 evitó en la web. **Elegida, con límites.**
4. **Un token sin estado**, firmado y sin registro, al estilo JWT. *Inconveniente:* no se puede revocar uno a uno sin una lista de revocados, que ya es un registro, ni listar los que siguen vivos. **Descartada.**

### Cómo llega el token a la consola

- **a. Se emite en la web y se pega a mano** (la inclinación inicial; **retirada** en la revisión del 2026-09-25).
- **b. Un flujo *loopback* que abre la propia consola** (RFC 8252 §7.3, con PKCE según RFC 7636). La consola escucha en `127.0.0.1` y abre el navegador contra un inicio de sesión de la Lambda. Al terminar, la Lambda redirige a la consola con un código de un solo uso, que la consola canjea por el token. **Variante manual**: si el navegador no alcanza el puerto, la página enseña el código y el usuario lo teclea en la consola.
- **c. El flujo de dispositivo de Google** (RFC 8628). La consola pide un código a Google, el usuario lo introduce en la página de Google desde cualquier navegador y la consola consulta a Google hasta recibir los tokens. Después los canjea en la API por el token de Atlas.
- *d. Lo emite la administración con credenciales de AWS*, escribiendo el registro en SSM a mano. *Descartada:* mezcla la salida de emergencia (MFA y credenciales de vida corta, ADR-0028, filas 3 y 12) con el uso diario, y exige la CLI de AWS en cada máquina.

| | a. Web y pegar | b. *Loopback* (y manual) | c. Dispositivo de Google |
|---|---|---|---|
| **Robo** | El token largo **lo muestra la SPA**. Un fallo en la página, sea una XSS o una dependencia comprometida del *bundle*, puede emitir y leer tokens con la cookie **sin pasar por Google**, y convierte una sesión corta en una credencial de meses. La vía c de ADR-0027 se eligió precisamente para que el token de Google no pasara por la SPA. Pedir que el usuario vuelva a autenticarse antes de emitir reduce el riesgo, pero el token sigue pasando por la página y por el portapapeles | El token **nunca toca la SPA, ni el portapapeles, ni una URL, ni la terminal**: llega en el cuerpo de una respuesta TLS al proceso que guarda el verificador PKCE. Emitir obliga a pasar por una pantalla interactiva de Google. Una página comprometida podría abrir ella misma el intento, pero el usuario vería esa pantalla sin haberla pedido, y la página del código queda aislada (`sandbox`) | Para el token de Atlas, como en b. Pero el cliente de Google de tipo dispositivo exige `client_secret` al pedir los tokens (F2). O ese secreto va en cada consola, y deja de ser secreto, o la Lambda hace de intermediaria de las consultas |
| **Reutilización** | Es un *bearer*: lo limitan la caducidad y la revocación, igual en las tres | Igual. El código que pasa por el navegador es de un solo uso, caduca en minutos y **no sirve sin el verificador** (RFC 7636) | Igual |
| **Fuga en historiales o registros** | Windows puede **guardar un historial del portapapeles** y **sincronizarlo en la nube** con la cuenta de Microsoft (F9). Pegado con `echo … >`, va al historial de la terminal. Pegado en un editor, las copias de respaldo del editor escapan a la comprobación de `600` (SIN VERIFICAR, depende del editor) | En la URL de vuelta y en el historial del navegador queda **el código**, no el token: caduca en minutos y no sirve sin el verificador. En la variante manual, lo mismo con lo que se teclea | El código de usuario es público por diseño. Nada del token en ningún historial |
| **Suplantación (*phishing*)** | Si alguien convence al usuario de que le envíe el token, le sirve durante meses | En *loopback*, el código va al `127.0.0.1` de la máquina de quien inicia sesión, así que un atacante no lo recibe. **La variante manual sí se presta al ataque de RFC 8628 §5.4**: quien abrió el intento en su máquina pide al usuario que le pase el código. Ese código solo vale unos minutos. Es un **riesgo aceptado**, con las defensas del punto 2 de la Decisión | Es el ataque propio de este flujo (RFC 8628 §5.4, *Remote Phishing*). Google retiró en 2022-2023 el flujo de copiar y pegar (OOB) por el *phishing* y la suplantación de aplicaciones (F3) |
| **WSL** | Funciona: no necesita red local | **Verificado en la máquina del usuario** (2026-09-25, WSL 2.5.9, `networkingMode=mirrored`): un servidor en `127.0.0.1` dentro de Linux responde a `curl.exe` lanzado en Windows, tanto por `127.0.0.1` como por `localhost`. En modo NAT depende de `localhostForwarding`, activo por defecto (F4); **no probado**. Abrir el navegador desde WSL no está garantizado: `wslview` y `xdg-open` no están instalados, y la interoperabilidad se puede desactivar (F4). Por eso la consola **siempre imprime la URL**, y la variante manual cubre el resto, SSH incluido | Es la mejor: no necesita navegador en la misma máquina ni puerto local |
| **Coste** | 0 | 0 (dos invocaciones más por inicio de sesión) | 0 en dinero; un cliente OAuth más por entorno, creado a mano (otra excepción de ADR-0028) |
| **Piezas nuevas que mantener veinte años** | Pantalla de emisión, lista y revocación en la web; el registro; la comprobación de la cabecera; y la lectura del fichero en la consola | Comunes con a: el registro, la comprobación y la lista y la revocación en la web. Propias: **dos rutas** (inicio y canje) y una rama nueva en la vuelta de Google; en la consola, un servidor de un solo uso con `node:http` y el lanzador del navegador. **Sin dependencias nuevas y sin cambios en Google**: usa el mismo cliente OAuth y la misma URL de vuelta que la web | Lo común, y además otro cliente OAuth por entorno con su secreto, las consultas periódicas a Google, una segunda `aud` en la Lambda y la dependencia de que Google mantenga el flujo de dispositivo para `openid` y `email` (hoy lo admite, F2) durante veinte años |
| **Si se pierde la cuenta de Google** | Los tokens emitidos siguen valiendo hasta caducar, porque su par sigue en la lista; no se pueden emitir más | Igual | Igual |

### Dónde guarda el servidor el registro

1. **SSM Parameter Store**, con un parámetro `SecureString` estándar por token (elegida; motivos en la Decisión, punto 9).
2. **El bucket de datos**, bajo un prefijo propio (`auth/`). *Ventajas:* es donde la API ya escribe estado suyo (`sync/devices/`), tiene escritura condicional y no hay que dar a la API un permiso nuevo. *Inconvenientes:* mezcla credenciales con datos que se copian y se restauran (punto 9).
3. **DynamoDB.** *Descartada:* un servicio más que mantener veinte años para una decena de registros (ADR-0002).

## Decisión

**Se propone un token de dispositivo propio, emitido por la vía b (*loopback*, con la variante manual como respaldo), guardado en la consola en `~/.config/atlas/credentials.json` y registrado en el servidor en SSM.**

1. **La credencial.** Un token propio con un prefijo reconocible, un identificador público y un secreto de 256 bits aleatorios (`crypto.randomBytes`). El servidor guarda solo el SHA-256 del secreto y lo compara en tiempo constante (`crypto.timingSafeEqual`). Con 256 bits de azar no hace falta ni sal ni un hash lento. **El identificador tiene longitud fija y solo admite `[A-Za-z0-9_-]`**, nunca `:` ni `/`. La API lo valida **antes** de construir con él el nombre del parámetro de SSM, porque `GetParameter` acepta `nombre:versión` y `nombre:etiqueta` (F17): sin esa validación, `<id>:1` leería la versión del registro anterior a la revocación y **el token revocado volvería a valer**. Además, **el registro guarda su propio identificador y la API lo compara** con el que se pidió. El prefijo permite que un escáner de secretos lo reconozca: una regla de `gitleaks` es configuración de herramientas, así que **se propone al usuario** y esta ADR no la añade. El formato exacto va en `docs/api.md`.

2. **Emisión: solo al final de un inicio de sesión con Google que abre la propia consola**, con la orden `atlas remote login`. Usa el cliente OAuth de ADR-0027.
   1. La consola genera un `state` y un verificador PKCE. Abre **solo en `127.0.0.1`** un puerto que elige el sistema (puerto 0), solo mientras dura el intento, y lo cierra con la primera respuesta válida o cuando caduca (RFC 8252 §8.3). **Un `state` erróneo no lo cierra**: la petición se ignora y el puerto sigue esperando; si se cerrara, cualquiera que llegara antes tumbaría el intento. La página que devuelve el puerto **no carga nada externo** y lleva `Referrer-Policy: no-referrer`. Después **imprime siempre la URL**, porque en la máquina del usuario no están ni `wslview` ni `xdg-open` (prueba 1), e intenta abrir el navegador sin depender de ello.
   2. La URL lleva a una ruta de inicio de la Lambda con el puerto, el `state`, el `code_challenge` (S256) y el nombre del dispositivo. **El nombre del dispositivo se valida aquí**, en longitud y caracteres (los límites, en `docs/api.md`), y **se escapa** allí donde se muestre. La Lambda guarda los parámetros en la **cookie transitoria** de ADR-0027, junto a sus propios datos, y sigue la vía c sin cambios, pidiendo a Google una **pantalla interactiva** (`prompt=select_account`, documentado en F5). Una credencial de meses nunca se emite sin que el usuario la vea.
   3. Google vuelve a **la misma** `/api/auth/callback` de la web, así que no hay URL de vuelta nueva ni cambio en el cliente OAuth. La Lambda verifica todo lo que exige ADR-0027, en el mismo orden y con la lista permitida incluida. Como el intento viene de la consola, **no emite cookie de sesión**. Emite un **código de un solo uso** que caduca en minutos, ligado al `code_challenge`, al par `{sub, email}` y al nombre. **Las firmas se separan por propósito**: de la clave de sesión de ADR-0027 se derivan con HKDF (`crypto.hkdfSync`) una subclave `session`, que firma la cookie, y otra `console_code`, que firma el código. Además, cada carga lleva un campo `typ`, y **cada verificador rechaza el tipo ajeno**. Así, un código filtrado no puede servir nunca como cookie, ni una cookie como código. No hace falta un secreto nuevo. Después redirige a `http://127.0.0.1:<puerto>/…` con el código y el `state`. **El destino es el literal `127.0.0.1`, fijado en el código**, porque RFC 8252 §8.3 desaconseja `localhost`, y el puerto es un número validado: la ruta no puede redirigir a ningún otro sitio.
   4. La consola comprueba el `state` y envía el código y el verificador a una ruta de canje (`POST`, con `x-amz-content-sha256`). La Lambda comprueba la firma y el `typ`, la caducidad, el verificador contra el `code_challenge` y otra vez la lista permitida.
      - **El uso único del código es obligatorio.** El identificador del token sale del código, y el registro se crea sin sobrescribir: si ya existe, el código ya se usó y el canje se rechaza. El estado que lo garantiza es el propio registro.
      - **El identificador del dispositivo lo asigna la API al canjear; la consola nunca lo propone.** Si la consola presenta su token anterior, que puede estar caducado pero nunca revocado, la API conserva ese dispositivo y **revoca el token anterior**: primero lo revoca y después crea el nuevo. Así, renovar invalida una copia robada. Si falla la creación, la consola vuelve a iniciar sesión.
      - Devuelve el token **una sola vez**.

   **Emitir exige `amr` con `mfa` si Google lo permite.** Si la verificación de la feature 015 confirma que el ID token puede decir cómo se autenticó el usuario (F5), la Lambda rechaza la emisión cuando `amr` no incluye `mfa`. Está SIN VERIFICAR y la 015 lo comprueba antes de escribir código. Si no se puede, la verificación en dos pasos sigue siendo un requisito operativo del usuario, como en ADR-0027.

   **Variante manual** (`atlas remote login --manual`), para cuando el navegador no alcanza el puerto: WSL en modo NAT o una sesión por SSH. Al volver de Google, la Lambda sirve una página suya **sin script**, con `Content-Security-Policy: sandbox`, que la aísla del origen de la SPA, y con `Cache-Control: no-store`. La página **pide confirmar expresamente el nombre del dispositivo** antes de enseñar el código. Enseña también la hora del intento y un aviso: el código solo se teclea en una consola que el usuario acaba de abrir él mismo. La consola lo lee sin mostrarlo en pantalla. **Riesgo aceptado**: esta variante se presta al ataque de RFC 8628 §5.4. Las defensas son la confirmación del nombre, el aviso, la caducidad en minutos y **las emisiones recientes que enseña la web** (punto 8). No se comparan direcciones IP, que es una defensa frágil. **No existe la opción de emitir desde la web con la sesión ya iniciada.**

3. **En la consola, un fichero propio y no `secrets.json`.** El fichero es `~/.config/atlas/credentials.json`, hermano de `secrets.json`, o su equivalente en `$XDG_CONFIG_HOME/atlas/`. Sigue **las mismas reglas** que `secrets.json`: con permisos distintos de `600` no se usa; está fuera de la carpeta del libro y la consola se niega si una carpeta está dentro de la otra; y ni la web ni ninguna copia, exportación o sincronización lo leen. La diferencia es que **solo lo escribe la consola**, al iniciar y al cerrar sesión, de forma atómica y creado ya con `600`. No se usa `secrets.json` por tres motivos. ADR-0031 fija que la aplicación nunca lo escribe. Su lector rechaza el fichero entero ante una clave desconocida, así que **una consola de la 013 perdería sus claves de precios** en cuanto apareciera el token. Y el token caduca y se renueva, mientras que las claves no. Cada entrada dice **para qué origen** es el token (uno por entorno: `dev` y `prod` tienen registros distintos en cuentas distintas) y a qué dispositivo pertenece. El token **nunca** va en un argumento de la línea de órdenes, que queda en el historial de la terminal, ni en una variable de entorno, ni en una URL, ni en la salida de la consola. **En WSL, el `600` no protege frente a Windows**: un proceso de Windows del mismo usuario lee el fichero a través de `\\wsl$` (o `\\wsl.localhost`), porque el acceso entra como el usuario de Linux dueño del fichero. Probado en la máquina del usuario (prueba 3): Windows lee un fichero `600` de ese usuario y se le deniega uno `000`. Es el mismo límite que ya tienen `secrets.json` y la réplica del libro.

4. **Transporte, en una cabecera propia**: `x-atlas-device-token` (el nombre final va en `docs/api.md`), nunca en `Authorization`. Tres reglas:
   - Se envía **solo al origen para el que se emitió y solo por HTTPS**.
   - La consola **no sigue redirecciones** (`redirect: "error"`). No es un detalle: se **verificó el 2026-09-25 con Node 22.23.2** que `fetch` reenvía una cabecera propia a otro origen tras una redirección y solo quita `Authorization`, que es lo que dice el estándar Fetch (F10).
   - Una petición que traiga **a la vez** la cookie de sesión y el token se rechaza.

   CloudFront tiene que reenviar la cabecera a la Lambda. La política gestionada `AllViewerExceptHostHeader`, pensada para orígenes Function URL, reenvía todas las cabeceras salvo `Host` (F6); si se usa otra, hay que nombrar la cabecera en ella. Los registros estándar de CloudFront **no** recogen cabeceras propias; sí recogen la cadena de consulta y, si se activa, la cookie (F7). Los registros del WAF **sí** recogen las cabeceras si algún día se activan, y entonces esta se censura con `RedactedFields` (F8). La comprobación de `Origin` de ADR-0027 sigue valiendo para lo que llega con cookie. Con la cabecera no hace falta: un navegador no añade una cabecera propia a una petición de otro sitio sin una comprobación previa de CORS (F10), y la API no responde a CORS (ADR-0028, fila 6).

5. **Comprobación en cada petición**, en este orden y rechazando al primer fallo: el formato; el registro, buscado por su identificador; el hash, comparado en tiempo constante; que no esté revocado; que no haya caducado; y que **su par `{sub, email}` siga en la lista permitida**.
   - El formato incluye la longitud fija y los caracteres del identificador (punto 1), y el registro tiene que llevar el mismo identificador que se pidió.
   - «No caducado» significa antes de `expires_at` y antes de `issued_at` más el techo fijo (punto 7).
   - **El registro no se cachea.** Se lee de SSM en cada petición, así que una revocación surte efecto en la petición siguiente, en cualquier instancia de la Lambda. Una caché de pocos minutos duraría lo que viva cada instancia caliente, y la revocación no llegaría a tiempo. Como mucho se cachean los negativos que no pueden volver a ser válidos: revocado y caducado. Un «no existe» no se cachea, porque ese identificador puede crearse después. Un usuario no se acerca a los 40 TPS de lectura (F14) ni a las 20.000 llamadas gratuitas de KMS al mes (F16).
   - La lista permitida conserva su caché de ADR-0027: quitar a alguien de ella sigue tardando esos minutos. Por eso, ante un robo, lo primero es revocar (punto 8).

6. **Alcance: solo lo que la consola necesita.** El token permite leer el remoto y los datos de referencia, añadir líneas al sincronizar, publicar **el estado de su propia cola** y revocarse a sí mismo. **La API toma el identificador del dispositivo del token, el que ella misma asignó al canjear, y nunca del cuerpo de la petición**, así que un token robado no puede publicar el `sync/devices/<dispositivo>.json` de otro, del que dependen `compact` y la restauración (ADR-0026, paso 7). Un token de dispositivo **no puede** emitir tokens, listarlos ni revocar otros: para eso hace falta la sesión de la web o un inicio de sesión nuevo. Cada token corresponde a un solo dispositivo de sincronización y a una sola carpeta. Cómo se liga a su sesión el identificador de dispositivo **de la web** queda fuera de esta ADR y va a `docs/api.md` como punto de la 014.

7. **Caducidad absoluta de 90 días, que no se renueva con el uso.** El token se renueva volviendo a iniciar sesión con Google (`atlas remote login`), y eso además **mantiene vivo el cliente OAuth** frente al borrado que Google aplica a los seis meses sin uso (ADR-0027; las condiciones exactas de ese borrado siguen SIN VERIFICAR). Los 90 días son configuración fuera del libro (principio IV). La comprobación usa **el `expires_at` guardado y, además, `issued_at` más un máximo fijo en el código**, y vale el menor de los dos. Ese máximo es un techo de seguridad, no un valor de ajuste; **120 días**, por debajo de los seis meses, confirmado por la dirección el 2026-09-25. La configuración nunca admite más que el techo, y **un cambio de configuración nunca alarga un token ya emitido**, porque su `expires_at` se fija al emitirlo. La consola avisa cuando queda poco (el umbral lo fija la feature). Cuando el token caduca, la consola sigue funcionando en local; solo la sincronización pide volver a iniciar sesión, que es una orden.

8. **Revocación y lista.**
   - La web, con su sesión, lista los tokens y revoca uno a uno. De cada token enseña el nombre, la emisión, la caducidad, el estado y **la última sincronización**, y destaca **las emisiones recientes**. Esta última no se guarda en el registro: se lee del `sync/devices/<dispositivo>.json` que el dispositivo ya publica, y así el registro no se escribe en cada petición.
   - `atlas remote logout` revoca en el servidor el token de esa consola, y solo ese, y **solo cuando la revocación se confirma** borra su entrada local. Si la revocación falla, por ejemplo sin conexión, no borra nada sin decirlo: avisa de que el token sigue vivo en el servidor. Borrar solo lo local es una opción explícita (su nombre, en la feature).
   - **Revocar todos sin Google** es una operación de administración con credenciales de AWS (ADR-0028, fila 12), con un procedimiento escrito.
   - **Quitar el par de la lista permitida suspende** todos sus tokens, pero volver a ponerlo reactiva los que no hayan caducado. Por eso, **si roban la cuenta de Google**, el procedimiento sigue este orden: quitar el par, recuperar la cuenta, **revocar todos los tokens** y **solo después reponer el par**. Si se repone antes, los tokens que emitió el atacante vuelven a valer.
   - **Rotar la clave de sesión no revoca los tokens**; solo invalida los códigos pendientes.
   - Olvidar un dispositivo perdido (ADR-0026, Consecuencias) empieza por revocar su token.

9. **El registro vive en SSM**, un parámetro `SecureString` estándar por token: `/atlas/<entorno>/device-tokens/<id>`. Guarda el hash, el par `{sub, email}`, el nombre, el dispositivo, la emisión, la caducidad y, si la hay, la revocación. **Se escribe solo dos veces**: al crearlo y al revocarlo. Al crearlo no se sobrescribe, porque `PutParameter` falla si el parámetro ya existe, y como el identificador del token sale del código, eso es lo que garantiza que el código se use una sola vez (punto 2). La API **nunca lo borra**. Los caducados los poda la administración si algún día molestan: el límite es de 10.000 parámetros por cuenta y región (F1), y a una docena al año no se llega nunca. El rol de la API gana **lectura y escritura solo bajo ese prefijo** (`GetParameter`, `GetParametersByPath` para la lista y `PutParameter`). Su política **no incluye `DeleteParameter` ni `LabelParameterVersion`**. Para ella, la lista permitida, el secreto del cliente y la clave de sesión siguen siendo de solo lectura.

   **Por qué SSM y no el bucket de datos:**
   - **Principio IV.** El registro dice quién puede llamar a la API. Es de la misma naturaleza que la lista permitida, que la constitución pone en SSM, y guarda un dato personal (el correo). Como no mueve ninguna cifra del libro, nunca va a `Settings`. Y nunca va al libro, que la sincronización replica en todos los dispositivos y del que nada se borra (principio I, ADR-0003).
   - **ADR-0028 y ADR-0032: la separación la da la propia estructura.** El bucket de datos se copia en el volcado mensual, en `atlas backup` a un disco, en la restauración y en la reconstrucción tras perder la cuenta. Con las credenciales dentro, cada una de esas operaciones tendría que excluirlas siempre, y una restauración podría **reactivar tokens revocados**. A SSM no llega ninguna de ellas. Es el mismo argumento que sacó las claves de la carpeta del libro (ADR-0031). Perder la cuenta también hace perder los tokens, y eso es lo correcto: se vuelven a emitir.
   - **Auditoría sin coste.** SSM registra todas sus operaciones de control como eventos de gestión (F11), y el *trail* de ADR-0028 (fila 10) entrega una copia de esos eventos gratis (F12). Así, cada emisión y cada revocación queda en CloudTrail con su hora y su rol. Las escrituras de objetos en S3, en cambio, son eventos de datos: no se registran por defecto y se cobran aparte (F13).
   - **Coste.** Los parámetros estándar no tienen coste adicional, hasta 10.000 y 4 KB cada uno (F1). El rendimiento estándar es de 40 peticiones por segundo para leer y 3 para `PutParameter` (F14), de sobra para un usuario aunque el registro se lea en cada petición. Cada lectura queda en CloudTrail como evento de gestión (F11), dentro de la copia gratuita (F12); solo cuesta el almacenamiento de esos registros en S3. `SecureString` usa la clave gestionada `aws/ssm` (F15), y sus llamadas a KMS entran en el nivel gratuito de 20.000 al mes (F16).
   - **Lo que cuesta.** El rol de la API gana un permiso de escritura en SSM que ADR-0027 no le daba. SSM no tiene escritura condicional más allá de «crear si no existe», así que revocar es sobrescribir; no es un problema, porque es la única sobrescritura. Y los parámetros los crea la aplicación, no Terraform, que solo gestiona el prefijo y los permisos, igual que ya hace con el valor de la lista permitida.

10. **Registros**: ni el token, ni su hash, ni el correo, ni el `sub`. Solo el resultado con su código (`device_token_invalid`, `device_token_expired`, `device_token_revoked`, `not_allowed`…) y, como mucho, el **identificador** del token, que no es secreto y permite cruzar con CloudTrail. Fuera de la Lambda:
   - los registros estándar de CloudFront no recogen cabeceras propias (F7);
   - los del WAF sí, y la cabecera se censura con `RedactedFields` si algún día se activan (F8);
   - **los registros en tiempo real de CloudFront** también las recogen, con su valor, en el campo `cs-headers` (F18): si algún día se activan, **ese campo queda fuera** y la cabecera del token no se registra.

## Consecuencias

- **En qué se aparta de la inclinación con la que se abrió la ronda** (aceptado en la revisión del mismo día):
  1. No se emite en la web con la sesión ya abierta, sino al final de un inicio de sesión con Google que abre la consola, para que el token no pase por la SPA ni por el portapapeles.
  2. No va en `secrets.json`, sino en un fichero propio que escribe la consola.
  3. Añade reglas que la inclinación no mencionaba: alcance limitado, token ligado al dispositivo, no seguir redirecciones, enviarlo solo a su origen y caducidad inferior a seis meses que no se renueva con el uso.

  Lo demás se mantiene: token propio, cabecera propia, hash en el servidor, revocable, con nombre y caducidad, listado en la web y con la lista permitida comprobada en cada petición.
- **Si se pierde la cuenta de Google**, los tokens emitidos siguen sincronizando hasta caducar; la web no, porque su sesión necesita Google. No se pueden emitir más. La salida es la administración de AWS, que tiene MFA propia (ADR-0028, fila 12): se cambia la entrada de la lista permitida por otra cuenta de Google. Los tokens de la cuenta perdida dejan de valer en cuanto caduca la caché de la lista permitida, y cada consola vuelve a iniciar sesión con la cuenta nueva. El libro no se pierde (réplicas locales: ADR-0026, Parte A, y ADR-0032). **Si la cuenta de Google no se pierde sino que la roban**, el ladrón puede emitir tokens de consola igual que puede abrir la web. El procedimiento es el del punto 8: quitar el par, recuperar la cuenta, **revocar todos los tokens y después reponer el par**. El correo mensual y las emisiones recientes de la web lo delatan (ver abajo).
- **La web gana una pantalla de dispositivos** (lista y revocación). Va en un fragmento aparte, **fuera del arranque**, cuyo techo ya no tiene margen (`docs/prompts/000-director-handoff.md`: 74,0 KB).
- **El correo mensual** (feature 016) cuenta también los inicios de sesión de la consola, que ADR-0027 usa para avisar de un cliente OAuth sin uso. Además dice cuántos tokens hay vivos y cuántos se emitieron en el mes, sin nombres ni importes. Una emisión que el usuario no reconoce indica que su cuenta de Google está comprometida.
- **Reparto entre features.**
  - La **014** no se bloquea: sigue con su remoto en memoria y fija en `docs/api.md` la cabecera, las rutas de inicio, canje, revocación y lista, sus códigos de error, los límites del nombre del dispositivo y **cómo se liga a su sesión el identificador de dispositivo de la web**.
  - La **015** implementa todo lo de esta ADR en la API, la SPA y la consola.
  - La **016** hace el correo.
  - La **017** crea el prefijo de SSM y sus permisos y la política de origen que reenvía la cabecera, y se asegura de que la función de la CSP no pise la `sandbox` de la página del código.
- **Sin dependencias nuevas** (`node:http`, `node:crypto` y el `fetch` de Node) y **sin cambios en Google**.
- Lo que se vuelve más difícil: hay en disco una credencial de meses que ADR-0027 no tenía, y la consola gana un pequeño servidor HTTP y un lanzador de navegador por plataforma que mantener.
- **SIN VERIFICAR.** Lo comprueba, con fuente y antes de escribir código, la feature que dependa de cada punto (regla de la Ronda 8):
  - que la vuelta a `http://127.0.0.1` funcione en el navegador real del usuario (lo probado es `curl.exe`). Y que las restricciones de acceso a la red local que están introduciendo los navegadores no afecten a una navegación de primer nivel. Que Google recomiende el *loopback* a los clientes de escritorio (F3) apunta a que funciona, pero no lo prueba. Feature 015;
  - que `Content-Security-Policy: sandbox`, sin `allow-same-origin`, impida a la SPA leer la página del código. Feature 015;
  - WSL en modo NAT, y abrir el navegador desde WSL. Feature 015;
  - si Google permite exigir que el usuario vuelva a autenticarse, o que el ID token diga cómo se autenticó. Su documentación describe las reclamaciones `amr` (entre sus valores, `mfa`) y `auth_time`, que solo aparecen si se piden y están habilitadas en la configuración (F5). Si se puede, **emitir un token de consola exige `mfa`** (Decisión, punto 2), y la verificación en dos pasos deja de ser un simple requisito operativo para esta credencial. Feature 015, antes de escribir código;
  - que `PutParameter` sin sobrescribir sea atómico ante dos peticiones simultáneas. Ahora que el uso único del código es obligatorio y descansa en ello, la 015 lo verifica, y si no lo es, para y lo dice. Sin el verificador, un segundo canje tampoco sirve. Feature 015;
  - qué permisos de KMS necesita el rol de la Lambda para usar `aws/ssm`. Feature 017;
  - que la función de la CSP de CloudFront respete la cabecera `sandbox` que pone el origen. Feature 017;
  - que las copias de respaldo de los editores hereden los permisos del fichero. Solo afecta a la opción a.
- **Documentos que cambian si se acepta** (no se tocan antes):
  - ADR-0027: una nota fechada. La consola entra por ADR-0033; «No hay *refresh token*» vale para la web; rotar la clave no cierra los tokens de consola; la vuelta de Google gana la rama de consola; la cookie transitoria lleva los parámetros de la consola; y **la cookie se firma con la subclave `session` derivada con HKDF y lleva `typ`**.
  - ADR-0026: «Quién sincroniza» (la frase «está por decidir»), el paso 7 (el dispositivo de la consola sale del token) y Consecuencias (olvidar un dispositivo empieza por revocar su token).
  - ADR-0028: permisos del rol de la API en SSM (fila 7, o una nota; sin `DeleteParameter` ni `LabelParameterVersion`); registros (fila 16: ni el token ni su hash); la política de origen que reenvía la cabecera; y la cabecera fuera de los registros del WAF y de los registros en tiempo real de CloudFront si algún día se activan.
  - ADR-0031: una nota. `secrets.json` no cambia; el fichero de credenciales es un fichero hermano con las mismas reglas, pero lo escribe la consola.
  - La constitución, Restricciones técnicas (Seguridad): el registro de tokens de consola en SSM. Probablemente una aclaración (PATCH).
  - `CLAUDE.md`: la fila *Auth* del *stack*, *Security* y *Logging*.
  - `docs/specification.md`: §9.2 (la consola como cliente de CloudFront en el diagrama), §9.5 (el correo mensual), §10 (el acceso de la consola) y §11.8 (el registro en SSM y el fichero local).
  - `docs/data-schema.md` §1: una fila para el fichero de credenciales local, y la aclaración de que el registro no vive en el bucket.
  - `docs/api.md`, que se crea en el encargo de la 014: la cabecera, las rutas y los códigos.
  - `docs/decision-roadmap.md`, Ronda 8: la fila de esta ADR, las features 015 a 017 y la lista SIN VERIFICAR.
  - `docs/prompts/000-director-handoff.md`: cierra lo abierto en §8, punto 4.
  - Un procedimiento escrito, en la feature 015 o la 018, para revocar todos los tokens sin Google y para una cuenta robada: quitar el par, recuperar la cuenta, revocar todos los tokens y después reponer el par.
- Relacionadas: ADR-0026, ADR-0027, ADR-0028, ADR-0031 y ADR-0032.

## Cuándo habría que revisarla

- Si la consola necesita sincronizar **sin una persona delante**, por ejemplo en una tarea programada en otra máquina: el *loopback* no sirve y haría falta otra credencial.
- Si Google deja de admitir la pantalla interactiva o la vuelta al mismo cliente, o si aparece una forma documentada de exigir `mfa`, en cuyo caso se exige.
- Si el llavero del sistema está disponible en WSL sin dependencias nuevas: el fichero con permisos `600` pasaría a él.
- Si el registro tuviera que escribirse en cada petición, por ejemplo para guardar el último uso, o si leerlo en cada petición se acercara a la cuota de lectura de SSM o a la gratuita de KMS: entonces SSM deja de ser el sitio adecuado y se revisa.
- Si hubiera más de un usuario.

## Revisión del 2026-09-25

La emisión desde la web, que era la inclinación con la que se abrió la ronda, **se retiró** por los argumentos de la tabla: el token pasaría por la página y por el portapapeles, y una XSS convertiría una sesión corta en una credencial de meses. Es el mismo motivo por el que ADR-0027 eligió la vía c. Queda fijado:

1. **La consola emite el token** con el *loopback* a `127.0.0.1`, un código de un solo uso y PKCE, reutilizando el cliente OAuth de ADR-0027. **Tiene una variante manual** para WSL en modo NAT o SSH, en la que la página enseña el código y el usuario lo teclea. La consola **siempre imprime la URL**.
2. **`~/.config/atlas/credentials.json`**, hermano de `secrets.json`, con sus mismas reglas. **Solo lo escribe la consola.**
3. **Caducidad absoluta de 90 días**, sin renovación con el uso. Se renueva volviendo a iniciar sesión con Google, lo que además mantiene vivo el cliente OAuth.
4. **Las reglas añadidas**: `redirect: "error"`, envío solo al origen que lo emitió, alcance limitado (no emite, no lista ni revoca otros tokens) y el identificador del dispositivo sacado del token, nunca del cuerpo.
5. **Los hashes, en SSM**: un `SecureString` por token bajo `/atlas/<entorno>/device-tokens/`, con la escritura limitada a ese prefijo, por los motivos del punto 9.
6. **Si Google permite exigir `amr` con `mfa`, se exige al emitir.** SIN VERIFICAR; la 015 lo comprueba antes de escribir código.
7. **Órdenes**: `atlas remote login` y `atlas remote logout`, que revoca el token propio en el servidor y borra la entrada local. Listar y revocar el resto se hace desde la web, con la sesión de Google.
8. **La regla de `gitleaks`** para el prefijo del token se propone al usuario; esta ADR no la añade.

**Estado:** **Aceptada** el 2026-09-25 (ver la cabecera). Los documentos listados en «Documentos que cambian si se acepta» se actualizan en el encargo de la feature 014.

## Verificación de seguridad del 2026-09-25 (decisiones de la dirección)

La verificación concluyó que **el diseño de base aguanta**: PKCE, nada por la SPA ni por el portapapeles, `credentials.json` aparte y SSM a salvo de las restauraciones. Encontró tres bloqueantes y diez puntos no bloqueantes, que la dirección decidió todos y que están incorporados arriba.

**Bloqueantes:**

- **B1. Un token revocado podía volver a valer con un selector de versión de SSM.** `GetParameter` acepta `nombre:versión` y `nombre:etiqueta` (F17). Decisión: identificador de longitud fija con solo `[A-Za-z0-9_-]`, validado antes de construir el nombre del parámetro, y el registro guarda su propio identificador para compararlo (punto 1).
- **B2. La revocación no surtía efecto en la petición siguiente**, porque la caché de pocos minutos dura lo que cada instancia caliente. Decisión: el registro no se cachea; como mucho, los negativos (punto 5). Se retira la frase que decía lo contrario.
- **B3. El código de un solo uso se firmaba con la clave de sesión sin separar dominios.** Decisión: subclaves derivadas con HKDF por propósito (`session`, `console_code`), un campo `typ` en la carga y cada verificador rechaza el tipo ajeno (punto 2).

**No bloqueantes:**

1. Cuenta robada: primero revocar todos los tokens y después reponer el par (punto 8).
2. El identificador del dispositivo lo asigna la API al canjear, y canjear revoca el token anterior del mismo dispositivo. La ligadura del identificador de dispositivo de la web con su sesión va a `docs/api.md`, para la 014 (puntos 2 y 6).
3. *Phishing* de la variante manual: confirmar el nombre del dispositivo, las emisiones recientes en la web y el riesgo escrito como aceptado; sin comparar IP (puntos 2 y 8).
4. Caducidad: `expires_at` y `issued_at` más un techo fijo en el código; sin `DeleteParameter` ni `LabelParameterVersion` en IAM; la configuración nunca alarga un token emitido (puntos 7 y 9).
5. Uso único del código obligatorio, con el identificador del token sacado del código (puntos 2 y 9).
6. Nombre del dispositivo validado al inicio y escapado donde se muestre (punto 2).
7. Páginas: la de `127.0.0.1` sin nada externo y con `Referrer-Policy: no-referrer`; la manual con `Cache-Control: no-store`; y el *listener* en el puerto 0, sin cerrarse ante un `state` erróneo (punto 2).
8. Registros en tiempo real de CloudFront: la cabecera del token queda fuera (punto 10).
9. `atlas remote logout` sin conexión no borra la entrada local sin decirlo; borrar solo lo local es explícito (punto 8).
10. En WSL, un proceso de Windows del mismo usuario lee `credentials.json` a través de `\\wsl$` (punto 3). **Matiz de la prueba 3:** el acceso entra como el usuario de Linux dueño del fichero, así que no ignora cualquier permiso: un fichero `000` se deniega. Pero el `600` que exige la consola no protege frente a Windows.

**Decidido por la dirección:** el techo fijo de caducidad es de 120 días.

## Fuentes y pruebas (consultadas el 2026-09-25)

- **F1** — AWS Systems Manager, niveles de parámetros: `docs.aws.amazon.com/systems-manager/latest/userguide/parameter-store-advanced-parameters.html` (estándar: 10.000 por cuenta y región, 4 KB, sin coste adicional).
- **F2** — Google, *OAuth 2.0 for TV and Limited-Input Device Applications*: `developers.google.com/identity/protocols/oauth2/limited-input-device` (cliente de tipo *TVs and Limited Input devices*; `client_secret` obligatorio al pedir los tokens; ámbitos admitidos: `openid`, `email`, `profile` y algunos de Drive y YouTube).
- **F3** — Google, *Out-Of-Band (OOB) flow Migration Guide*: `developers.google.com/identity/protocols/oauth2/resources/oob-migration` (retirado por *phishing* y suplantación de aplicaciones; bloqueado del todo el 31 de enero de 2023; los clientes de escritorio, al *loopback*).
- **F4** — Microsoft, *Advanced settings configuration in WSL*: `learn.microsoft.com/en-us/windows/wsl/wsl-config` (`localhostForwarding`, `true` por defecto; `networkingMode`; `[interop]`).
- **F5** — Google, *OpenID Connect*: `developers.google.com/identity/openid-connect/openid-connect` (`prompt`: `none`, `consent`, `select_account`; reclamaciones `amr` y `auth_time`, «si se piden y están habilitadas en la configuración»).
- **F6** — CloudFront, *managed origin request policies*: `docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-origin-request-policies.html` (`AllViewerExceptHostHeader`, pensada para orígenes Function URL).
- **F7** — CloudFront, *standard logs reference*: `docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/standard-logs-reference.html` (`cs-uri-query`, `cs(Cookie)`; ninguna cabecera propia).
- **F8** — AWS WAF, campos y gestión de los registros: `docs.aws.amazon.com/waf/latest/developerguide/logging-fields.html` y `…/logging-management.html` (`headers`; censura de campos).
- **F9** — Microsoft, *Clipboard in Windows*: `support.microsoft.com/en-us/windows/clipboard-in-windows-c436501e-985d-1c8d-97ea-fe46ddf338c6` (historial y *Clipboard history across your devices*).
- **F10** — WHATWG, *Fetch Standard*, §4.5 *HTTP-redirect fetch* y las cabeceras que no están en la lista segura de CORS: `fetch.spec.whatwg.org` (en una redirección a otro origen solo se quita `Authorization`).
- **F11** — AWS Systems Manager y CloudTrail: `docs.aws.amazon.com/systems-manager/latest/userguide/monitoring-cloudtrail-logs.html` («Systems Manager logs all control plane operations to CloudTrail as management events»).
- **F12** — Precios de CloudTrail: `aws.amazon.com/cloudtrail/pricing/` (una copia de los eventos de gestión, gratis, con un *trail*).
- **F13** — CloudTrail, eventos de datos: `docs.aws.amazon.com/awscloudtrail/latest/userguide/logging-data-events-with-cloudtrail.html` (no se registran por defecto y se cobran aparte; incluyen `PutObject` de S3).
- **F14** — Rendimiento de Parameter Store: `docs.aws.amazon.com/systems-manager/latest/userguide/parameter-store-throughput.html`.
- **F15** — `SecureString` y KMS: `docs.aws.amazon.com/systems-manager/latest/userguide/secure-string-parameter-kms-encryption.html` (`aws/ssm` por defecto).
- **F16** — Precios de KMS: `aws.amazon.com/kms/pricing/` (20.000 peticiones al mes gratis; las claves gestionadas por AWS, sin coste de creación ni de almacenamiento).
- **RFC 7636** (PKCE), **RFC 8252** (OAuth 2.0 para aplicaciones nativas; §7.3 y §8.3) y **RFC 8628** (concesión de dispositivo; §5.4, *Remote Phishing*), en `rfc-editor.org`.
- **Prueba 1** (máquina del usuario, WSL 2.5.9, núcleo 6.6.87.2, `networkingMode=mirrored`): un servidor de Node en `127.0.0.1` dentro de WSL responde a `curl.exe` de Windows por `127.0.0.1` y por `localhost`. `wslview` y `xdg-open` no están instalados.
- **F17** — AWS Systems Manager, referencia de la API, `GetParameter`: `docs.aws.amazon.com/systems-manager/latest/APIReference/API_GetParameter.html` («To query by parameter label, use "Name": "name:label". To query by parameter version, use "Name": "name:version"»).
- **F18** — CloudFront, registros en tiempo real: `docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/real-time-logs.html` (`cs-headers`: «The HTTP headers (names and values) in the viewer request»).
- **Prueba 2** (Node 22.23.2): `fetch` con una cabecera propia y con `Authorization` hacia un servidor que redirige a otro origen. En el destino llega la cabecera propia y no llega `Authorization`.
- **Prueba 3** (máquina del usuario, WSL2): con `cmd.exe /c type` sobre la ruta `\\wsl.localhost\…` de un fichero de prueba del usuario, Windows **lee** el fichero con permisos `600` y recibe «Acceso denegado» con `000`.

## Nota del 2026-09-25 (prompt de la feature 014)

**Cómo se liga a su sesión el identificador de dispositivo de la web la decide la feature 015**, no la 014. El punto 6 lo mandaba a `docs/api.md` «como punto de la 014», y `docs/api.md` §5.4 lo deja escrito con lo que está fijado —el dispositivo sale de la credencial, nunca del cuerpo— y tres opciones sin elegir. *Por qué en la 015:* es la feature que construye la sesión de la web, la API y la sincronización desde la SPA, así que es donde las opciones se pueden probar contra el flujo real de ADR-0027; la 014 no tiene sesión ni HTTP, y su remoto simulado recibe el dispositivo como parámetro. Decidirlo antes sería elegir sin poder probar.

## Nota del 2026-09-25 (regla de `gitleaks`)

**El usuario aprobó la regla de `gitleaks`** que dejaban propuesta el punto 1 y el punto 8 de la revisión. Está en `.gitleaks.toml`, que extiende la configuración por defecto, con el identificador `atlas-console-device-token`: reconoce `atlasdt1.<token_id>.<secret>` con el formato exacto de `docs/api.md` §2.1 y un secreto de entropía alta. Una lista de permitidos acotada deja pasar el `token_id` solo bajo una clave `token_id`, porque es público (punto 1). La decisión no cambia.

## Nota del 2026-09-25 (decisión del usuario; ADR-0034 propuesta)

No habrá cuentas miembro dedicadas: `dev` y `prod` viven en una cuenta que el usuario comparte con otros proyectos (ADR-0028, nota del mismo día; ADR-0034, propuesta). Lo que cambia aquí:

- **Punto 3**: «`dev` y `prod` tienen registros distintos en cuentas distintas» pasa a ser **en prefijos distintos de la misma cuenta** (`/atlas/dev/device-tokens/` y `/atlas/prod/device-tokens/`). La separación la dan las políticas de cada rol, que solo nombran su prefijo, y el límite de permisos de cada entorno (ADR-0034, filas 4 y 7). **SSM no tiene política de recurso**: cualquier rol de la cuenta con `ssm:GetParameter` sobre `*` lee el registro. Guarda hashes, no tokens, pero también el par `{sub, email}` (ADR-0034, «Riesgo que queda», punto 2).
- **Punto 9**: el rendimiento de SSM (40 lecturas por segundo) y las 20.000 peticiones gratuitas de KMS al mes **son de la cuenta y la región, y se comparten** con los otros proyectos. Leer el registro en cada petición sin caché sigue sobrando para un usuario, salvo que otro proyecto lea SSM de forma intensiva (ADR-0034, comprobación C16). Un `ThrottlingException` de SSM es un fallo transitorio con su código y **nunca** deja pasar un token.
- **Punto 9, el cupo de parámetros**: los 10.000 parámetros estándar son de la cuenta y la región, y la API nunca borra un token. Si otro proyecto llena el cupo, `PutParameter` falla y no se emiten tokens; la comprobación C16 de ADR-0034 cuenta el total, y por encima de 9.000 la administración poda los caducados.
- **Punto 9, la auditoría en CloudTrail**: se apoyaba en el *trail* de ADR-0028 (fila 10), y ADR-0034 no crea ninguno. **Sin *trail* en la cuenta**, el historial gratuito cubre 90 días y un token vive hasta 120: la emisión de un token vivo de más de 90 días ya no está en CloudTrail. Su `issued_at` sigue en el registro y en la lista de la web; lo que se pierde es el contraste con CloudTrail, no el dato.
- **Punto 8, revocar todos sin Google**: la hace el rol de administración del entorno, asumido con MFA independiente de Google (ADR-0034, fila 16), en lugar de la administración desde la cuenta de gestión.

## Nota del 2026-09-25 (revisión del prompt de la feature 015): la cuenta de Google robada

Decidida por la dirección tras la revisión de la PR #89 (hallazgo B3; `docs/prompts/015-api-access.md` §7.1 bis). **El orden del punto 8 y de «Consecuencias» no bastaba**: solo hablaba de tokens, y la **sesión web** del intruso, una cookie firmada que dura lo que dure la sesión, volvía a pasar la lista permitida en cuanto se reponía el par. Con ella podía leer el libro, añadir líneas y revocar los tokens del usuario. **El procedimiento pasa a ser este, en este orden:**

1. quitar el par de la lista permitida;
2. recuperar la cuenta de Google;
3. revocar todos los tokens de consola (`atlas admin revoke-all-tokens`, con el rol de administración);
4. **rotar la clave de sesión** con el guion de secretos (ADR-0034, fila 21) **y esperar a que venza su caché en la Lambda**: cierra las sesiones web (ADR-0027) e invalida los códigos de consola pendientes;
5. **revisar las líneas añadidas al libro en esa ventana** (rectificarlas o restaurar, ADR-0032) y **olvidar los dispositivos que creó el intruso**;
6. **solo entonces**, reponer el par.

Donde el punto 8 y «Consecuencias» dan el orden de cuatro pasos, vale este. El procedimiento escrito lo redacta la feature 015.
