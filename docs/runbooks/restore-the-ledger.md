# Restaurar el libro de la nube

**Cuándo**: el libro de la nube (`ledger/ledger.jsonl` del bucket de datos) está mal, por ejemplo por una reescritura equivocada o un intruso que añadió operaciones, y quieres volver a una copia buena.

**Qué es** (ADR-0032): una operación de **administración**, desde la consola y con las credenciales de vida corta del rol `atlas-<entorno>-admin`. **Nunca pasa por la API**, que solo sabe añadir.
- **Restaurar nunca borra nada**: lo que hay se archiva antes en `archive/pre-restore-…`, que nunca se sobrescribe.
- La copia se escribe **línea a línea, tal cual** (`replaceLines`): nunca se vuelve a serializar.

**También es la subida inicial**: con la nube vacía, `atlas admin restore --env <e> --from <ledger.jsonl>` escribe el libro tal cual (ADR-0037).

## Lo que necesitas

Vale para toda orden `atlas admin …` y para `atlas backup --from-bucket`: las credenciales de vida corta del rol `atlas-<entorno>-admin`, con MFA (ADR-0034, fila 16). La consola las toma de la **cadena estándar del SDK de AWS** y no guarda nada. Tienen que venir **de una sesión ya abierta**, según quién asuma el rol (la comprobación **C5 de ADR-0034, SIN VERIFICAR, de la 018**):

- **Con IAM Identity Center**: abre la sesión con `aws sso login --profile atlas-prod-admin`, que pide el MFA, y usa `AWS_PROFILE=atlas-prod-admin` en cada orden.
- **Con un usuario IAM con MFA**: el perfil de `~/.aws/config` lleva `role_arn`, `source_profile` y `mfa_serial`. La CLI de AWS pide el código al usar ese perfil (*AWS CLI User Guide*, «Using an IAM role in the AWS CLI»). Exporta la sesión **en una subshell**, para que las credenciales mueran con ella:
  ```sh
  ( eval "$(aws configure export-credentials --profile atlas-prod-admin --format env)"
    atlas admin pull --env prod --to ~/personal/atlas/privado/revision )
  ```
  **No basta con `AWS_PROFILE=atlas-prod-admin` para `atlas`**: el SDK de JavaScript no sabe pedir el código y se niega con `admin_aws_refused (CredentialsProviderError)` antes de llamar a AWS (`apps/cli/test/admin/environment.test.ts`).

En los ejemplos, `AWS_PROFILE=atlas-prod-admin` vale tal cual con IAM Identity Center; con un usuario IAM, quítalo y ejecuta la orden dentro de la subshell.

Y `~/.config/atlas/admin.json`, que escribes tú y la aplicación nunca escribe (`docs/data-schema.md` §1):

```json
{ "admin_format": 1, "environments": { "prod": { "region": "eu-west-1", "data_bucket": "atlas-prod-data-<sufijo>", "ssm_prefix": "/atlas/prod/" } } }
```

**El *root* de AWS no puede asumir el rol** (*IAM User Guide*, «Compare AWS STS credentials»: `AssumeRole` lo llama un usuario o rol IAM, no el *root*). Solo sirve para desbloquear, por ejemplo reescribir la política de un bucket que deja fuera a todos los principales de Atlas (ADR-0034, fila 16).

Los dispositivos no guardan ninguna copia del libro (ADR-0035), así que no hay nada que esperar de ellos: la restauración no se niega por nada de lo que ellos tengan.

---

## 1. Elegir la copia

| Copia | Cómo se nombra |
|---|---|
| Una versión anterior del objeto en S3 | `--from s3-version:<id>`. Los identificadores, con `aws s3api list-object-versions --bucket <bucket> --prefix ledger/ledger.jsonl` |
| El volcado mensual | `--from backups/2026-10` |
| La copia de tu disco (`atlas backup` o «Descargar copia» de la web) | `--from /disco/ledger-2026-10-01.jsonl` |

## 2 a 6. La orden, paso a paso

```sh
AWS_PROFILE=atlas-prod-admin atlas admin restore --env prod --from <copia>
```

La orden recorre los seis pasos de ADR-0032 **en orden y sin saltarse ninguno**, y escribe cada uno:

1. **La copia candidata**, la que has nombrado.
2. **La comprueba antes de tocar nada.** Tiene que ser UTF-8 válido, byte a byte (si no, `restore_candidate_invalid` con `not_utf8`), cargar con el esquema actual, proyectarse sin eventos inválidos y pasar las comprobaciones de `check --deep` sin errores. Si no, se niega (`restore_candidate_invalid`) con la lista.
   - No contrasta los tipos del BCE, porque dependen del histórico de la carpeta. Si quieres ese contraste, pasa antes `atlas --ledger <copia> check --deep` en una carpeta con el histórico.
3. **La compara con la nube por identificador**:
   - si la copia es un prefijo de la nube, dice «se pierde esta cola» (los eventos que solo tiene la nube) y nombra cada uno;
   - si no, evento a evento, en los dos sentidos.
4. **Te pide confirmación** con esa lista delante: **escribe el nombre del entorno** (`prod`). Cualquier otra respuesta no toca nada. La orden **no admite `--yes`**, que se escribiría antes de ver la lista (ADR-0032, nota del 2026-09-27).
5. **Archiva lo que había** en `archive/pre-restore-<fecha>T<hora>-<etag>.jsonl` y escribe la copia línea a línea, **con la condición de la nube que comparó en el paso 3**. Si alguien escribió entre medias, se niega sin escribir nada; vuelve a empezar.
6. **Te dice lo que tiene que hacer cada dispositivo** (abajo).

## Después

No hay nada que hacer en los dispositivos: quien tenga la web abierta lo notará en su siguiente escritura, que recarga el libro restaurado y pide confirmar otra vez. Lo que se registró en la nube después de la copia y que la restauración quita **no vuelve solo**: está en `archive/pre-restore-…`, y decides línea a línea qué vuelves a registrar.

## La prueba anual (constitución VI)

Una vez al año, **en tu ordenador y nunca en `dev`**:
1. descarga el último volcado;
2. ábrelo con la consola **desde una carpeta local vacía** (`atlas --ledger <carpeta>/ledger.jsonl …`);
3. ejecuta `atlas check --deep`;
4. contrasta las cifras principales con las de la aplicación en uso.

Anota la fecha.

## Si se pierde la cuenta de AWS

La cuenta de `prod` es la que compartes con otros proyectos (ADR-0034; ADR-0032, nota del 2026-09-25). Si se pierde:
1. Terraform levanta la pila en **otra cuenta, que habría que crear entonces**;
2. el libro vuelve desde **tu disco** (`atlas backup`, «Descargar copia»);
3. `documents/` e `imports/` vuelven desde tu disco (`atlas backup --from-bucket` los dejó allí).

Las copias de tu disco son la capa que no depende de la cuenta: mantenlas al día (el correo mensual lo recuerda).

*Probado* contra los dobles de S3 (`apps/cli/test/admin/rewrite.test.ts`):
- la subida inicial, sobre una nube vacía;
- la copia que no pasa la comprobación, que se niega antes del paso 3;
- un «no» en el paso 4, que no toca nada;
- un prefijo, con su cola perdida, y una versión anterior del objeto;
- los bytes de la copia escritos tal cual, aunque el codificador de hoy los escribiría de otra forma;
- **los dos cortes**: la nube cambia entre el paso 3 y el 5, y cambia en la escritura misma. En los dos no se escribe nada.

El corte entre archivar y escribir es el de la E3: el archivo se queda y el libro no cambia (`packages/adapters/src/aws/s3-ledger.ts`).

*Sin probar*: contra AWS real (018), y `list-object-versions`.
