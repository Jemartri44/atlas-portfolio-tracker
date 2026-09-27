# Restaurar el libro de la nube

**Cuándo**: el libro de la nube (`ledger/ledger.jsonl` del bucket de datos) está mal, por ejemplo por una reescritura equivocada o un intruso que añadió operaciones, y quieres volver a una copia buena.

**Qué es** (ADR-0032): una operación de **administración**, desde la consola y con las credenciales de vida corta del rol `atlas-<entorno>-admin`. **Nunca pasa por la API**, que solo sabe añadir.
- **Restaurar nunca borra nada**: lo que hay se archiva antes en `archive/pre-restore-…`, que nunca se sobrescribe.
- La copia se escribe **línea a línea, tal cual** (`replaceLines`): nunca se vuelve a serializar.

**Lo que necesitas**: el rol y `admin.json`, como en [Revocar todos los tokens](revoke-all-tokens.md), apartado «Lo que necesitas».

**Se niega**, y hay que resolverlo antes:
- si **algún dispositivo tiene operaciones pendientes** publicadas en `sync/devices/`, o las tiene la carpeta desde la que la ejecutas. Que sincronicen antes;
- si el objeto de algún dispositivo **no se puede leer**: su cola no se puede conocer;
- si el marcador de esta carpeta falta o no se lee.

**Los olvidados no cuentan.**

---

## 1. Elegir la copia

| Copia | Cómo se nombra |
|---|---|
| Una versión anterior del objeto en S3 | `--from s3-version:<id>`. Los identificadores, con `aws s3api list-object-versions --bucket <bucket> --prefix ledger/ledger.jsonl` |
| El volcado mensual | `--from backups/2026-10` |
| La réplica de un dispositivo sincronizado | `--from /ruta/a/su/ledger.jsonl`. Es idéntica, byte a byte, a lo que tenía la nube en su última sincronización |
| La copia de tu disco (`atlas backup`) | `--from /disco/ledger-2026-10-01.jsonl` |

## 2 a 6. La orden, paso a paso

```sh
AWS_PROFILE=atlas-prod-admin atlas admin restore --env prod --from <copia>
```

La orden recorre los seis pasos de ADR-0032 **en orden y sin saltarse ninguno**, y escribe cada uno:

1. **La copia candidata**, la que has nombrado.
2. **La comprueba antes de tocar nada.** Tiene que cargar con el esquema actual, proyectarse sin eventos inválidos y pasar las comprobaciones de `check --deep` sin errores. Si no, se niega (`restore_candidate_invalid`) con la lista.
   - No contrasta los tipos del BCE, porque dependen del histórico de la carpeta. Si quieres ese contraste, pasa antes `atlas --ledger <copia> check --deep` en una carpeta con el histórico.
3. **La compara con la nube por identificador**:
   - si la copia es un prefijo de la nube, dice «se pierde esta cola» y nombra cada evento;
   - si no, evento a evento, en los dos sentidos.
4. **Te pide confirmación** con esa lista delante. Un «no» no toca nada.
5. **Archiva lo que había** en `archive/pre-restore-<fecha>T<hora>-<etag>.jsonl` y escribe la copia línea a línea, **con la condición de la nube que comparó en el paso 3**. Si alguien escribió entre medias, se niega sin escribir nada; vuelve a empezar.
6. **Te dice lo que tiene que hacer cada dispositivo** (abajo).

## Después, en cada dispositivo

- Al sincronizar, cada dispositivo ve que la nube se ha reescrito, porque el hash de su prefijo ya no coincide (`remote_rewritten`), y **se detiene**.
- Su usuario **vuelve a descargar**:
  - en la consola, `atlas sync redownload`;
  - en la web, «Volver a descargar».
- **Todo lo que el dispositivo tenía y la copia no queda retenido para revisarlo**, esté pendiente o ya sincronizado, y **nunca se vuelve a subir solo**, porque podría deshacer la restauración. Decides línea a línea qué vuelves a registrar.

## La prueba anual (constitución VI)

Una vez al año, **en tu ordenador y nunca en `dev`**:
1. descarga el último volcado;
2. ábrelo con la consola y con la web **desde una carpeta vacía**;
3. ejecuta `atlas check --deep`;
4. contrasta las cifras principales con las de la aplicación en uso.

Anota la fecha.

## Si se pierde la cuenta de AWS

La cuenta de `prod` es la que compartes con otros proyectos (ADR-0034; ADR-0032, nota del 2026-09-25). Si se pierde:
1. Terraform levanta la pila en **otra cuenta, que habría que crear entonces**;
2. el libro vuelve desde **una réplica de un dispositivo o desde tu disco**;
3. `documents/` e `imports/` vuelven desde tu disco (`atlas backup --from-bucket` los dejó allí).

Las réplicas y el disco son las capas que no dependen de la cuenta: mantenlas al día.

*Probado* contra los dobles de S3 (`apps/cli/test/admin/rewrite.test.ts`):
- las negativas antes de leer la copia: un dispositivo con pendientes publicadas, uno ilegible, y un olvidado que no cuenta;
- la copia que no pasa la comprobación, que se niega antes del paso 3;
- un «no» en el paso 4, que no toca nada;
- un prefijo, con su cola perdida, y una versión anterior del objeto;
- los bytes de la copia escritos tal cual, aunque el codificador de hoy los escribiría de otra forma;
- **los dos cortes**: la nube cambia entre el paso 3 y el 5, y cambia en la escritura misma. En los dos no se escribe nada.

El corte entre archivar y escribir es el de la E3: el archivo se queda y el libro no cambia (`packages/adapters/src/aws/s3-ledger.ts`).

*Sin probar*: contra AWS real (018), y `list-object-versions`.
