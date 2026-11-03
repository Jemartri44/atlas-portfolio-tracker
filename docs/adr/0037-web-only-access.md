# ADR-0037 — La consola no tiene acceso propio a la API; cerrar todas las sesiones desde la web

**Estado:** Aceptada (2026-11-03); reemplaza a [ADR-0033](0033-console-device-token.md) y enmienda [ADR-0027](0027-google-sign-in-verified-by-lambda.md), [ADR-0035](0035-cloud-ledger-single-source.md) y, en las líneas que nombran el token, ADR-0026, ADR-0028, ADR-0031, ADR-0032 y ADR-0034.

## Contexto

ADR-0033 dio a la consola un token de dispositivo propio (`atlasdt1.…`, 90 días, en `~/.config/atlas/credentials.json`) para leer y escribir el libro de la nube por la API, y ADR-0035 hizo de la consola un cliente directo, con carpetas «de nube». Nada de ello está desplegado.

En la revisión de arquitectura (P1), el dueño decidió el 2026-11-03: «No tengo pensado usarla [la consola] nunca, solo la web principal. Como mucho, la usará claude cuando tenga que resolver alguna cosa.» El acceso con Google de la web no cambia (ADR-0027).

Sin token, quedaba sin cubrir lo que el token traía de paso: una forma de **echar a todos los dispositivos a la vez** sin tocar AWS. La única era rotar la clave de sesión, que exige el rol de administración y MFA.

## Opciones consideradas

1. **Mantener el token de ADR-0033.** *Ventajas:* ya está construido y probado. *Inconvenientes:* una credencial *bearer* de 90 días en disco, mucho código y superficie (rutas de inicio, canje y revocación, registros en SSM, objetos de dispositivo) para un cliente que nadie va a usar.
2. **Consola solo como administración, y un cierre de todas las sesiones en la web** (elegida). *Ventajas:* desaparece la credencial de larga vida, la API tiene un único cliente y una única credencial. *Inconvenientes:* mantener la nube desde la consola exige al dueño delante para el MFA.

Para el cierre de todas las sesiones:

- **a. Objetos por dispositivo o por sesión** (como `sync/devices/*` de ADR-0026), cada uno marcado al cerrar. *Inconvenientes:* un objeto por inicio de sesión (unos 365 al año), una lectura más por petición sobre un objeto que cambia, y cerrar todos es recorrerlos y reescribirlos uno a uno, con fallos a medias.
- **b. Una marca de tiempo única** (elegida): un objeto con un instante; vale toda sesión emitida desde él. Una lectura pequeña por petición, una escritura al cerrar, nada que recorrer ni que limpiar.

## Decisión

1. **La consola no tiene acceso propio a la API.** Se retiran el token de dispositivo y su formato `atlasdt1.…`; el inicio de sesión de consola (loopback y manual, su PKCE) y `credentials.json`; las carpetas «de nube» de la CLI (`sync/remote.json`, `ApiLedgerStore` en la consola, `folder_mode_ambiguous`); `atlas remote login|logout|status|upload`; `atlas admin devices|revoke-all-tokens|forget-device`; las rutas `/api/auth/console/*` y `/api/devices/tokens*` y la cabecera del token; los parámetros SSM del token y sus permisos; sus variables y códigos de error; los códigos de salida 8, 9 y 10; `atlas prices update --from-sources` y el fichero local de precios bajados de la nube; y la tarjeta «Dispositivos de la consola» de Ajustes.
2. **Fuera los objetos de dispositivo**: `sync/devices/*`, `GET /api/sync/devices`, el `did` de la cookie y del intento, el `device_id` de `GET /api/session` (ahora `{signed_in, expires_at}`) y el `?device_id=` de `/api/auth/login`. La cookie es `{sub, sid, iat, exp}`.
3. **Fuera `PUT /api/ledger`.** La subida inicial a una nube vacía es `atlas admin restore --env <e> --from <ledger.jsonl>`, que con la nube vacía escribe el libro tal cual.
4. **«Cerrar sesión en todos los dispositivos»** en Ajustes › Sesión: `POST /api/auth/logout-all` escribe la marca `access/sessions-valid-from.json` con la hora del servidor, y la API rechaza con `401 session_invalid` (`reason: "closed"`) toda cookie emitida estrictamente antes. Contrato: [`docs/api.md`](../api.md) §3.
5. **`atlas admin pull --env <e> --to <dir>`** baja el libro de S3 a `<dir>/ledger.jsonl` para consultarlo y pasar `check --deep`. Las correcciones se hacen en la web, o con `admin restore`.
6. **`atlas backup --from-bucket`** copia también el libro de la nube, fechado, `0400` y verificado por SHA-256.
7. **El correo mensual** cuenta solo el último inicio de sesión de la web.

La consola conserva la carpeta local (desarrollo y copias) y la administración con credenciales cortas de AWS y MFA: `admin pull|compact|restore|prices push|secrets` ([`docs/cli.md`](../cli.md)).

**Por qué una marca de tiempo.** Cerrar todas las sesiones no necesita saber cuáles hay: basta con decir desde cuándo valen. La cookie ya lleva su emisión (`iat`) firmada, así que la comprobación es comparar dos números. La marca solo avanza y se escribe condicionalmente, así que dos cierres a la vez no la hacen retroceder.

**Resolución de segundos y el mismo segundo.** `iat` y la marca van en segundos. Se rechaza la cookie **estrictamente anterior** a la marca: una sesión iniciada en el mismo segundo que el cierre vale. Así el dueño puede entrar de nuevo en el acto. El precio es que una sesión emitida en ese mismo segundo por otro sobrevive al cierre. Es una ventana de un segundo, y la cierra un segundo `logout-all` o quitar la cuenta de la lista ([runbook](../runbooks/stolen-google-account.md)).

**Fallo cerrado.** Una marca que no se lee de forma estricta cierra todas las sesiones. Solo puede venir de una escritura que quería cerrarlas, y dejar pasar a todos desharía justo eso. Para salir, la administración lo rehace con una marca válida (su rol escribe en el bucket de datos, pero no borra ahí); el paso está en el [runbook](../runbooks/stolen-google-account.md). Un fallo transitorio de S3 al leerla es `503`, como el resto de fallos de dependencia, y nunca deja pasar.

## Consecuencias

- **La seguridad sube**: desaparece una credencial *bearer* de 90 días que cualquier proceso del usuario podía leer y usar, y con ella las rutas que la emitían y su estado en SSM. La API tiene un solo cliente y una sola credencial.
- **Mantener la nube exige al dueño delante para el MFA**: la consola, o Claude con ella, solo llega a la nube con el rol de administración ([`runbooks/restore-the-ledger.md`](../runbooks/restore-the-ledger.md), «Lo que necesitas»).
- **El dueño puede echar a un intruso en el acto** desde la web, sin AWS ([`runbooks/stolen-google-account.md`](../runbooks/stolen-google-account.md)). No le impide volver a entrar mientras tenga la cuenta de Google: para eso sigue haciendo falta quitarla de la lista permitida.
- **Nada desplegado, nada que migrar**: no hay tokens emitidos, objetos de dispositivo ni carpetas de nube en uso.
- `has_correction` y `chain_continues` se conservan en la API aunque su único cliente sea la web: [ADR-0026](0026-cloud-sync-layer.md), enmienda del 2026-11-03.
