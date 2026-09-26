# Investigación y decisiones: `015-api-access`

La **investigación con fuente** (el bloque 0 de E1) está en [`questions.md`](questions.md) §1, que es donde la pide el encargo. Aquí van las **decisiones de diseño** del plan, con su motivo y lo que se descartó. Las que dependen de la dirección van marcadas **PROPUESTA**.

| # | Decisión | Motivo | Alternativas descartadas |
|---|---|---|---|
| D1 | Las reglas del acceso, en un módulo puro del dominio, `access/`, detrás de su propia puerta, y fuera del barril y de la web | §2 bis: «ninguna regla fuera del dominio»; ADR-0007 | Reglas en `apps/api`: la tabla de §4 no se podría probar al 100 % ni reutilizar en E5 |
| D2 | AWS detrás de interfaces estrechas propias (`ObjectStore`, `ParameterStore`) | §7 P3: nada instalado sin el usuario; el SDK entra después como adaptador fino | Firmar SigV4 a mano con `fetch`: una criptografía más que mantener veinte años |
| D3 | Tres subclaves HKDF y tres `typ`, con la transitoria incluida (PROPUESTA) | B3: un propósito, una clave; la transitoria también tiene que ir firmada (§6.2 (b)) | La transitoria con la subclave `session`: rompería la separación por propósito |
| D4 | Cargas **firmadas**, no cifradas (PROPUESTA) | Una primitiva para las tres; lo que exponen es del propio usuario, en su navegador | AES-256-GCM: oculta el correo en el historial, a cambio de algo más de código |
| D5 | Un cliente HTTP de `RemoteLedger` con la credencial inyectada, para la consola y para la web | La misma traducción de §7 para los dos; Web Crypto existe en los dos | Dos clientes: dos traducciones que pueden divergir |
| D6 | El `device_id` de la web, en `sync/devices/` con `type` y `state` | N8 y B1: el rol de la API no escribe en SSM fuera de `device-tokens/` | SSM: fuera de los permisos de la API (ADR-0028, fila 7) |
| D7 | `sync/remote.json` primero y el marcador después, en una sola toma, tras la red (§7 del plan) | Un corte nunca deja un marcador sin su remoto; S1 se reconoce y se termina | El marcador primero: dejaría S3 (una carpeta sin remoto conocido) como estado intermedio |
| D8 | La salida del rehacer a medias: descartar, que ya existe, más la frase (PROPUESTA (a)) | Sin cambiar ningún formato; reconocer solo por identificadores sellados | `redo_cancelled` con `held_format` 2: más cambio, y una consola de la 014 no lo lee |
| D9 | La función de N1 en `sync/` (PROPUESTA, Q5) | `checkCandidate` y `completeDraft` ya están exportados; no toca el arranque | En `record-event.ts`: de +40 a +80 bytes de arranque |
| D10 | La confirmación sin *script* con `<details>` (PROPUESTA) | Funciona dentro de una CSP `sandbox` sin formularios, y es una sola petición | Un formulario: la `sandbox` sin `allow-forms` lo bloquea. Dos peticiones con un vale firmado: el vale equivale al código |
| D11 | El servidor local de las capturas por HTTP en `127.0.0.1` | Verificado: Chromium 151 acepta allí `__Host-…; Secure` (`questions.md` §2) | TLS con un certificado propio: innecesario |
| D12 | La sincronización de la web, en una sección perezosa de Ajustes (PROPUESTA, Q7) | 0 bytes de arranque frente a +25 a +45 de una ruta | Una ruta propia |
| D13 | No emitir `mfa_required` (PROPUESTA, Q2) | `amr` exige una aplicación publicada y verificada con una función Beta, y puede no venir aunque se pida | Exigirlo: dejaría al usuario sin tokens en cuanto faltara |
| D14 | El correo de la lista, exacto (PROPUESTA) | Identidad, no parecido (§2 ter); el par ya es la identidad | Normalizar mayúsculas y puntos de Gmail: reconocer por parecido |
| D15 | Los datos de referencia con una `version` opaca (el ETag de S3) y `If-None-Match` (PROPUESTA) | Saber qué cambió sin descargarlo ni hashearlo en la Lambda | Un SHA-256 por fichero en el índice: habría que leerlos todos |
