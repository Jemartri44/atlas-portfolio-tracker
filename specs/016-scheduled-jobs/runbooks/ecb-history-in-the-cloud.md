# Restaurar o retirar una generación del histórico del BCE en la nube

> Borrador de la feature 016 (E3). La dirección lo pasará a `docs/runbooks/` al cerrar la feature.

**Cuándo usarlo.** Cuando el histórico del BCE de la nube (`reference/ecb/` del bucket de datos) dice algo que no es verdad, en cualquiera de estos casos:

- **El correo `[Atlas] Aviso: historico del BCE danado` pide intervenir.** El ZIP oficial contradice la última versión que aún se lee, y no se ha activado nada.
- **El correo `[Atlas] Aviso: historico del BCE sin comparar`.** Se reconstruyó sin nada con qué compararlo y quieres comprobar esa versión.
- **Sabes que una generación en vigor está mal**, por ejemplo porque `atlas check --deep` da `fx_rate_mismatch` en operaciones que cuadraban antes.

**Qué es.** Una operación de **administración**, con las credenciales de vida corta y MFA del rol `atlas-<entorno>-admin` (ADR-0034, fila 16). Los permisos que usa, uno por paso, están en `specs/016-scheduled-jobs/contracts/iam-permissions.md` §8. **Nunca pasa por la API**, que solo lee `reference/ecb/`. **Nada se borra para siempre**: el bucket está versionado, y cada paso de abajo crea una versión nueva o una marca de borrado, nunca destruye una anterior.

**Una generación** son tres objetos que van juntos:

- `manifest.json`: dice qué fichero está en vigor y su SHA-256;
- el fichero en vigor: `eurofxref-hist.csv` si vino del ZIP, `api-exr.csv` si vino de la API;
- `previous/<fichero>`: el anterior.

Un fichero que no cuadra con el SHA-256 de su manifiesto **no lo usa nadie**: ni la API ni los dispositivos.

---

**Trabaja en una carpeta fuera del repositorio** (por ejemplo `~/personal/atlas/privado/`), nunca en la del libro ni en el repositorio: los ficheros que bajes son datos de tu nube.

## 1. Parar la tarea del BCE

Así ninguna ejecución escribe mientras trabajas:

```sh
AWS_PROFILE=atlas-prod-admin aws scheduler get-schedule --group-name atlas-prod-jobs --name atlas-prod-job-ecb > ecb-schedule.json
```

Desactiva la programación con `aws scheduler update-schedule`, usando los mismos campos de `ecb-schedule.json` y `--state DISABLED`. Guarda `ecb-schedule.json` para el paso 5.

**Aviso: deriva respecto de Terraform.** Mientras la programación esté desactivada a mano, no es lo que dice Terraform. Un `terraform apply` en medio la volvería a activar; un `terraform plan` la enseña como cambio. **No despliegues nada hasta el paso 5**, y después comprueba que `terraform plan` ya no enseña ninguna diferencia en ella.

## 2. Ver las generaciones que hay

```sh
AWS_PROFILE=atlas-prod-admin aws s3api list-object-versions --bucket <bucket-de-datos> --prefix reference/ecb/ \
  --query 'Versions[].[Key,VersionId,LastModified,ETag]' --output table
```

Baja la versión que quieras mirar a tu carpeta de trabajo, **nunca la de tu libro ni el repositorio**. El nombre del fichero en vigor lo dice su manifiesto (`active.file`): `eurofxref-hist.csv` si vino del ZIP, `api-exr.csv` si vino de la API.

```sh
AWS_PROFILE=atlas-prod-admin aws s3api get-object --bucket <bucket-de-datos> --key reference/ecb/manifest.json --version-id <id> manifest-<id>.json
FILE=$(jq -r .active.file manifest-<id>.json)
AWS_PROFILE=atlas-prod-admin aws s3api get-object --bucket <bucket-de-datos> --key "reference/ecb/$FILE" --version-id <id-del-fichero> hist-<id>.csv
sha256sum hist-<id>.csv
```

**Una generación buena cumple dos cosas:**

- el `sha256sum` del fichero coincide con `active.sha256` de su manifiesto;
- sus tipos coinciden con los del ZIP oficial que descargas tú mismo con `atlas fx update` en una carpeta de prueba: `atlas fx status` enseña el último día y la procedencia.

## 3a. Restaurar una generación buena

Copia sobre el objeto actual la versión buena, **primero el fichero y después su manifiesto**. Es el mismo orden en que escribe la tarea: un corte entre los dos deja un fichero que no cuadra con el manifiesto, que nadie usa.

```sh
FILE=$(jq -r .active.file manifest-<id-del-manifiesto>.json)
AWS_PROFILE=atlas-prod-admin aws s3api copy-object --bucket <bucket-de-datos> --key "reference/ecb/$FILE" \
  --copy-source "<bucket-de-datos>/reference/ecb/$FILE?versionId=<id-del-fichero>"
AWS_PROFILE=atlas-prod-admin aws s3api copy-object --bucket <bucket-de-datos> --key reference/ecb/manifest.json \
  --copy-source "<bucket-de-datos>/reference/ecb/manifest.json?versionId=<id-del-manifiesto>"
```

## 3b. Retirar una generación que miente, sin ninguna buena a mano

Pon una marca de borrado sobre `manifest.json` (las versiones anteriores siguen ahí):

```sh
AWS_PROFILE=atlas-prod-admin aws s3api delete-object --bucket <bucket-de-datos> --key reference/ecb/manifest.json
```

Sin manifiesto no hay histórico en vigor. La siguiente ejecución lo descarga del BCE como la primera vez: con el ZIP, o con la API si el ZIP falla, siempre dicho. **Úsalo solo si has comprobado la descarga del paso 2 contra el ZIP**, porque esa primera activación no compara con nada.

- Necesita `s3:DeleteObject` sobre `reference/ecb/manifest.json` en el rol de administración. **Es una propuesta para la 017**: el contrato de IAM de la 016 no lo da todavía.

## 4. Comprobar

Si la tarea del BCE ya corrió hoy, una invocación a mano no hace nada: su registro de hoy dice que ya terminó (`job_already_done`). **Primero borra ese registro**. Está versionado, así que la versión anterior sigue en el historial. `<periodo>` es el día de hoy en Madrid, `AAAA-MM-DD`:

```sh
AWS_PROFILE=atlas-prod-admin aws s3api delete-object --bucket <bucket-de-datos> --key jobs/ecb/ecb_update/<periodo>.json
```

Después ejecuta la tarea una vez a mano:

```sh
AWS_PROFILE=atlas-prod-admin aws lambda invoke --function-name atlas-prod-job-ecb \
  --payload '{"event_format":1,"tasks":["ecb_update"]}' --cli-binary-format raw-in-base64-out out.json
```

Después mira su registro en `jobs/ecb/ecb_update/<día>.json`. Tiene que decir `ecb_updated` y no `ecb_history_damaged`.

## 5. Volver a activar la tarea

Vuelve a activar la programación con los campos que guardaste en `ecb-schedule.json` y `--state ENABLED`.

## Después, en cada dispositivo

- **La consola no cambia**: sigue bajando el BCE del propio BCE (feature 016, §8.1 P16).
- **La web guarda su propia copia**, y una web que ya guardó la generación que mentía **rechaza la restaurada**, porque le faltan tipos o los cambia (ADR-0029, punto 2): se queda con la mala y lo dice. **En cada navegador**: Ajustes → Tipos del BCE → «Borrar la copia del BCE de este navegador». Confirma, y la tarjeta la vuelve a bajar entera de la nube la próxima vez que la abras con la sesión iniciada (o con «Bajar de la nube»).
- Si algún tipo del libro se contrastó contra la generación que mentía, `atlas check --deep` lo vuelve a contrastar con la buena.
