# ADR-0032 — Copias de seguridad y restauración del libro

**Estado:** Aceptada (2026-09-24). **Enmendada el mismo día** tras la revisión de la PR #72 (ver al final). **Nota del cierre de la feature 013** (2026-09-25): los precios del volcado no necesitan ninguna exclusión (ver al final). Ronda 8. Las capas de copia las fija la dirección (versionado de S3, volcado periódico y la exportación local que ya existe); este documento diseña **cómo se restaura** y cómo se comprueba que se puede, porque una copia que nunca se ha restaurado no es una copia. Responde a la pregunta de la Ronda 8 original sobre la copia fuera de AWS.

## Contexto

Lo que ya existe: el versionado del bucket con las versiones no vigentes caducando a los 365 días, `backups/<YYYY-MM>/` y `archive/` para siempre (ADR-0006); `atlas backup --to <dir>`, que copia los bytes del libro y comprueba la copia por etag y número de líneas (`apps/cli/src/commands/backup.ts`); `atlas export` a JSONL o CSV; y en la web, exportar con un botón y un aviso tras una semana sin hacerlo. La constitución (VI) exige una **prueba de restauración anual**.

Una observación ordena todo lo demás: **en un libro append-only, un error de registro se rectifica, no se restaura** (ADR-0003). Anotar mal una compra se arregla con `reversal`, y nada se pierde. Restaurar es para cuando se pierden o se corrompen **los bytes**.

| Qué falla | Qué lo recupera |
|---|---|
| Un cliente o la Lambda escriben una cola ilegible | La versión anterior del objeto en S3, o la réplica de un dispositivo |
| Un error de administración sobrescribe o borra el objeto | El versionado de S3 |
| **Se pierde la cuenta** (cierre, compromiso) o el bucket | Las réplicas de los dispositivos y la copia en un disco propio. **El volcado mensual no**: vive en la misma cuenta |
| Se pierde un dispositivo, o se borran los datos del navegador | El remoto. Solo se pierde lo que ese dispositivo no llegó a sincronizar |
| Se pierde la cuenta de Google | Nada que recuperar: las réplicas locales siguen funcionando y S3 sigue accesible con la administración de AWS (ADR-0027) |
| AWS no responde durante un tiempo | Nada: lo local sigue funcionando y se sincroniza después |

## Opciones consideradas

1. **Solo el versionado de S3.** Cubre las escrituras malas; no cubre perder la cuenta.
2. **Versionado más volcado mensual en el mismo bucket** (ADR-0006). Añade una foto legible y permanente; sigue sin cubrir perder la cuenta.
3. **Réplica en otra cuenta o en otra región de AWS.** Cubre más, con más infraestructura y coste, y sigue dentro del mismo proveedor.
4. **Las anteriores más copias fuera de AWS** (elegida): las réplicas que ya tiene cada dispositivo sincronizado y una copia periódica a un disco del usuario.

## Decisión

**Cuatro capas**, de la más automática a la más independiente:

1. **Réplicas en los dispositivos.** Cada dispositivo sincronizado guarda el libro entero, idéntico byte a byte al remoto (ADR-0026). Es una copia fuera de AWS que no cuesta nada y no depende de que nadie se acuerde.
2. **Versionado de S3**, con la caducidad de ADR-0006 y la regla de ciclo de vida de ADR-0028.
3. **Volcado mensual** en `backups/<YYYY-MM>/`: el libro, el histórico del BCE, los precios y `positions.json` (la proyección valorada, legible sin la aplicación). Para siempre.
4. **Copia fuera de AWS** en un disco del usuario: `atlas backup` se amplía para llevarse también `documents/` e `imports/`, que los dispositivos **no** replican y sin los que un evento corporativo pierde su fuente documental obligatoria. El correo mensual lo recuerda.

**Cómo se restaura el libro.** Es una operación de administración sobre la copia de referencia, con credenciales de vida corta y desde la consola; **nunca por la API**, que solo sabe añadir (ADR-0026). **Se niega si hay líneas pendientes en alguna cola conocida** (ADR-0026, Parte A). En este orden, y sin saltarse ninguno:

1. **Elegir la copia candidata**: una versión anterior del objeto, un volcado, la réplica de un dispositivo o la copia del disco.
2. **Comprobarla antes de tocar nada**: carga con el esquema actual, `check --deep` sin errores (los hallazgos, listados) y la proyección calculada.
3. **Compararla con el remoto actual por identificador**: qué eventos tiene cada uno que no tenga el otro. Si la candidata es un prefijo del remoto, se dice «se pierde esta cola»; cualquier otra forma se explica evento a evento.
4. **Confirmación explícita**, con esa lista delante.
5. ~~**Sustituir con el contrato de `LedgerStore.replace`**~~ **Sustituir con la operación de líneas crudas del puerto** (corregido en la enmienda): `replace` recibe eventos ya migrados y los vuelve a serializar, así que con una versión 2 del esquema restaurar sería un `compact` sin resellar las presentaciones, con todas sus huellas ilegibles (ADR-0026, Parte A). La operación de líneas crudas escribe **los bytes de la copia tal cual**. Primero se archivan los bytes actuales en `archive/pre-restore-<fecha>.jsonl`, que nunca se sobrescribe, y después se escribe con la condición del remoto que se comparó en el paso 3. **Restaurar nunca borra nada.**
6. **Después**, cada dispositivo detecta que el remoto se ha reescrito, porque el hash de su prefijo sincronizado ya no coincide (ADR-0026, Parte A), y se detiene. El procedimiento le manda volver a descargar. ~~Lo que solo ese dispositivo tenía vuelve como pendiente y pasa por la reaplicación. **Las réplicas curan la restauración.**~~ **Corregido en la enmienda, y alineado con ADR-0026 en la segunda:** se retiene para revisión **todo lo que el dispositivo tenía y la copia restaurada no**, esté pendiente o ya sincronizado, y **nunca se vuelve a subir solo**, porque podría deshacer la restauración. El usuario decide, línea a línea, qué vuelve a registrar.

**Si se pierde la cuenta de producción:** Terraform levanta la pila en una cuenta miembro nueva (ADR-0028: una por entorno), el libro se sube desde una réplica o desde el disco, y `documents/` e `imports/` desde el disco. Se ensaya **una vez** en la etapa de despliegue, con datos sintéticos en `atlas-dev`, antes de fiarse de la nube.

**La prueba de que se puede restaurar:**

- **Automática, cada trimestre**, dentro de la tarea de integridad de `docs/specification.md` §9.5: carga el último volcado en un almacén en memoria, lo proyecta y compara la proyección con la del libro vivo cortado en los mismos eventos. Cualquier diferencia manda un correo.
- **Manual, cada año** (constitución VI): el usuario descarga el último volcado en su ordenador, lo abre con la consola y con la web **desde una carpeta vacía**, ejecuta `check --deep` y contrasta las cifras principales con la aplicación en uso.
- **Nunca en `dev`**: «datos de producción jamás en `dev`» también vale para un ensayo. La prueba se hace en memoria dentro de `prod` o en la máquina del usuario.

## Consecuencias

- `atlas backup` se amplía (documentos y extractos) y aparece un comando de restauración de administración; el procedimiento completo se escribe en `docs/` en la etapa de despliegue, con los seis pasos de arriba.
- `docs/data-schema.md` §1 amplía el contenido de `backups/` (histórico del BCE y precios); las retenciones de ADR-0006 no cambian.
- La copia fuera de AWS de `documents/` e `imports/` depende de que el usuario la haga: es la única capa manual, y por eso la recuerda el correo.
- No se propone ahora bloquear los objetos de `backups/` contra el borrado (S3 Object Lock): cubriría un compromiso de la administración, pero su coste y su encaje con Terraform están **SIN VERIFICAR**. Queda anotado.
- Relacionadas: ADR-0002, ADR-0003, ADR-0006, ADR-0025 (el contrato de `replace`), ADR-0026, ADR-0027 y ADR-0028.

## Enmienda del 2026-09-24 (revisión de la PR #72)

Decidida por la dirección el mismo día. El paso 5 se apoyaba en `LedgerStore.replace`, que vuelve a serializar eventos migrados; ahora usa la operación de líneas crudas de ADR-0026. El paso 6 daba por hecho que lo pendiente de un dispositivo volvía a subir, cosa que ADR-0026 no definía y que podía deshacer la restauración; ahora queda retenido para revisión. Y la restauración se niega si hay pendientes en alguna cola conocida. La segunda revisión alineó el paso 6 con ADR-0026: lo retenido tras restaurar es todo lo que el dispositivo tenía y la copia no, no solo lo pendiente.

## Nota del 2026-09-25 (cierre de la feature 013)

La segunda enmienda de ADR-0031 pedía excluir `cache/` de los volcados mensuales, porque allí iban a vivir los datos de CoinGecko, cuyas condiciones desaconsejan acumularlos. **Esa exclusión ya no hace falta**: CoinGecko salió de la feature 013 (ADR-0031, tercera enmienda) y **`cache/` no existe**. Lo que el paso 3 llama «los precios» es `prices/` entero —los cierres, `symbols.json`, `_status.json` y `config.json`—, y **ninguno guarda claves ni direcciones**: las claves viven fuera de la carpeta del libro, en `~/.config/atlas/secrets.json`, y en la nube en SSM (`docs/data-schema.md` §1). Hoy `atlas backup` copia solo el libro; el volcado mensual con precios llegará con las tareas programadas.
