# Contrato: las acciones de AWS de cada Lambda (para la política de la 017)

**Aceptado por la dirección el 2026-09-27** (questions §9).

**Es lo que la 017 convertirá en política** (§2 del encargo). Se pone al día al cerrar cada entrega. Notación: `B` = `arn:aws:s3:::atlas-<entorno>-data-<sufijo>`; `P` = `arn:aws:ssm:eu-west-1:<cuenta>:parameter/atlas/<entorno>`; `I` = `arn:aws:ses:eu-west-1:<cuenta>:identity`. Todas con el límite de permisos de su entorno (ADR-0034, fila 5) y **sin `s3:DeleteObject`, `ssm:DeleteParameter`, `ssm:PutParameter` ni `ssm:LabelParameterVersion`**.

**Reglas de §8.2 B2**: **solo el rol de correo tiene acciones `ses:*`**; los del BCE, los precios, el volcado y la integridad no tienen ninguna; **el rol de correo no alcanza `P/prices/*`**.

Por qué `s3:ListBucket`: sin él, un `GetObject` de una clave que no existe da `403` y no `404` (questions §1.7; 015, §23.1), y todas las tareas leen claves que pueden no existir (el primer registro de un periodo, el primer volcado). Si basta con la condición `s3:prefix` es un punto de la 018 (hoja de ruta, «Etapas pendientes», 018); la tabla la pone como propuesta.

Por qué `s3:GetObject` sobre lo que se escribe: `If-Match` exige `s3:PutObject` **y** `s3:GetObject` (questions §1.7).

## 1. `atlas-<entorno>-job-ecb`

| Acción | Recurso | Para qué |
|---|---|---|
| `s3:GetObject` | `B/ledger/ledger.jsonl` | `job_frequencies` y la primera `fx_rate_date` del libro |
| `s3:GetObject`, `s3:PutObject` | `B/reference/ecb/*` | el histórico, `manifest.json`, `previous/`, `rejected/` (plan §7.1) |
| `s3:GetObject`, `s3:PutObject` | `B/jobs/ecb/*` | su registro de ejecución |
| `s3:ListBucket` | `B`, con `s3:prefix` en `reference/ecb/`, `jobs/ecb/`, `ledger/` | `404` en vez de `403` |
| — | red de salida | `www.ecb.europa.eu` y `data-api.ecb.europa.eu` (Lambda fuera de VPC) |

## 2. `atlas-<entorno>-job-prices`

| Acción | Recurso | Para qué |
|---|---|---|
| `s3:GetObject` | `B/ledger/ledger.jsonl` | los activos y su prioridad (ADR-0031, segunda enmienda, punto 5); las tesis del cubo |
| `s3:GetObject` | `B/prices/*` | cierres, `symbols.json`, `_status.json` |
| `s3:PutObject` | `B/prices/*` **con denegación explícita** de `B/prices/symbols.json` y `B/prices/config.json` | cierres y `_status.json`; **un solo escritor por objeto** (§8.1 P18, §8.2 M5): IAM impide lo que el código ya no hace |
| `s3:GetObject`, `s3:PutObject` | `B/jobs/prices/*` | su registro |
| `s3:ListBucket` | `B`, con `s3:prefix` en `prices/`, `jobs/prices/`, `ledger/` | ídem |
| `ssm:GetParameter` | `P/prices/eodhd-key`, `P/prices/alpha-vantage-key` | las claves (`SecureString`, `aws/ssm`); `kms:Decrypt` **sin verificar**: comprobación de la 018 (questions §9) |
| — | red de salida | `eodhd.com`, `www.alphavantage.co` |

## 3. `atlas-<entorno>-job-mail`

| Acción | Recurso | Para qué |
|---|---|---|
| `s3:GetObject` | `B/ledger/ledger.jsonl`, `B/prices/*`, `B/reference/ecb/*`, `B/access/last-web-sign-in.json` | el recordatorio y los avisos |
| `s3:GetObject` | `B/jobs/*` | los hallazgos de las demás familias |
| `s3:PutObject` | `B/jobs/mail/*` | sus registros y sus rachas; **ningún otro prefijo** |
| `s3:ListBucket` | `B`, con `s3:prefix` en `jobs/`, `prices/`, `reference/ecb/`, `access/`, `ledger/` | ídem |
| `ssm:GetParameter` | `P/mail/recipient`, `P/mail/amounts` | `String`, sin KMS |
| `ssm:GetParametersByPath` | `P/device-tokens` (con `ssm:Recursive = false`) | contar tokens vivos y emitidos; `SecureString`, `kms:Decrypt` **sin verificar**: comprobación de la 018 |
| `ses:SendEmail` | `I/<remitente>` **y** `I/<dominio del remitente>`, los dos (aceptado, questions §9; qué ARN evalúa SES con un dominio verificado sigue sin verificar, §1.1), y la del destinatario si la cuenta sigue en el *sandbox* | el envío |

Condiciones de `ses:SendEmail` (questions §1.1, verificadas contra la API v2):

```json
{
  "StringEquals": { "ses:FromAddress": "<remitente de terraform.tfvars>", "ses:ApiVersion": "2" },
  "ForAllValues:StringEquals": { "ses:Recipients": ["<destinatario de terraform.tfvars>"] },
  "Null": { "ses:Recipients": "false" }
}
```

**No tiene**: nada bajo `P/prices/`, `P/auth/`, ni escritura fuera de `B/jobs/mail/`.

## 4. `atlas-<entorno>-job-backup`

| Acción | Recurso | Para qué |
|---|---|---|
| `s3:GetObject` | `B/ledger/ledger.jsonl`, `B/reference/ecb/manifest.json`, `B/reference/ecb/eurofxref-hist.csv`, `B/reference/ecb/api-exr.csv`, `B/prices/*` | lo que se vuelca; `prices/` y el histórico también valoran `positions.json`. **Estrechado en la ronda 1 de la PR #109 (N4)**: ni `previous/` ni `rejected/`, que el volcado no lee |
| `s3:GetObject`, `s3:PutObject` | `B/backups/*` | escribir con `If-None-Match: *` (basta `s3:PutObject`, questions §20.1) y comparar lo que ya existe (`s3:GetObject`) |
| `s3:GetObject`, `s3:PutObject` | `B/jobs/backup/*` | su registro |
| `s3:ListBucket` | `B`, con `s3:prefix` en `prices/`, `reference/ecb/`, `backups/`, `jobs/backup/`, `ledger/` | listar `prices/` (primer nivel) y `404` |

**Política del bucket, aceptada por la dirección** (questions §1.7 y §9), con la forma que verificó el bloque 0 de E4 (questions §20.1, `conditional-writes-enforce.html`): así, ni un error del código puede sobrescribir un volcado.

```json
{ "Sid": "BackupsOnlyIfAbsent", "Effect": "Deny", "Principal": "*", "Action": "s3:PutObject",
  "Resource": "B/backups/*",
  "Condition": { "Null": { "s3:if-none-match": "true" }, "Bool": { "s3:ObjectCreationOperation": "true" } } }
```

**Sin verificar, para la 018**: que `s3:ObjectCreationOperation` valga `true` en un `PutObject` simple; si no, basta la condición `Null` sola. `If-None-Match` solo mira la versión vigente: ningún rol de Atlas tiene `s3:DeleteObject` sobre `B/backups/*`, así que nadie puede dejar una marca de borrado encima de un volcado.

## 5. `atlas-<entorno>-job-integrity`

| Acción | Recurso | Para qué |
|---|---|---|
| `s3:GetObject` | `B/ledger/ledger.jsonl` | recalcular desde cero (`integrity`, `deepCheck`) y medir su tamaño (questions §20.1, punto 2) |
| `s3:GetObject` | `B/jobs/backup/*`, `B/backups/*/ledger.jsonl` | el último volcado cerrado (su registro y su `ledger.jsonl`) para el ensayo de restauración. **Estrechado en la ronda 1 de la PR #109 (N4)**: ni `positions.json` ni `prices/` del volcado |
| `s3:GetObject`, `s3:PutObject` | `B/jobs/integrity/*` | su registro |
| `s3:ListBucket` | `B`, con `s3:prefix` en `jobs/backup/monthly_backup/`, `jobs/integrity/`, `backups/`, `ledger/` | encontrar los volcados y `404` |

**Cambio en E4**: ya no lee `B/reference/ecb/*`. Los errores de la integridad son los de `atlas check --deep` sin el contraste de los tipos del BCE, que solo da avisos (Q7; questions §20.2).

## 6. `atlas-<entorno>-api` (lo que añade la 016)

| Acción | Recurso | Para qué |
|---|---|---|
| `s3:GetObject`, `s3:PutObject` | `B/access/last-web-sign-in.json` | avanzar la fecha del último inicio de sesión web (Q3; §8.1 P6) |

## 7. Comunes a las cinco funciones de tareas

- `logs:CreateLogStream` y `logs:PutLogEvents` sobre su propio grupo `/aws/lambda/atlas-<entorno>-job-<familia>` (lo crea Terraform, ADR-0034, fila 3).
- Concurrencia reservada **1** (§8.1 P11); `PutFunctionEventInvokeConfig` con `MaximumRetryAttempts = 0` y `MaximumEventAgeInSeconds = 3600`; cada programación con `RetryPolicy` `MaximumRetryAttempts = 2` y `MaximumEventAgeInSeconds = 3600` (questions §1.4; **aceptado**, §9).
- El rol de Scheduler que invoca: `lambda:InvokeFunction` sobre las cinco funciones, nada más.
- El grupo de programaciones `atlas-<entorno>-jobs`, etiquetado (solo se etiquetan grupos, questions §1.6); en `dev`, las programaciones **desactivadas** (ADR-0034, fila 2).

## 8. `atlas-<entorno>-admin` (lo que añade la 016, E2)

| Acción | Recurso | Para qué |
|---|---|---|
| `s3:GetObject`, `s3:PutObject` | `B/prices/symbols.json` | `atlas admin prices push`: leer el remoto, enseñar la diferencia y escribir con `If-Match` sobre esa misma lectura (o `If-None-Match: *` si no había) |
| `s3:ListBucket` | `B`, con `s3:prefix` en `prices/` | `404` en vez de `403` cuando la nube aún no tiene correspondencia |
| `s3:GetObjectVersion` | `B/prices/symbols.json` | recuperar la versión que sustituyó `push`, que la orden dice con su ETag y su `VersionId` (revisión de la PR #106, N5) |

**El procedimiento del histórico del BCE en la nube** (`specs/016-scheduled-jobs/runbooks/ecb-history-in-the-cloud.md`; E3, revisión de la PR #108, N4, y §18). `S` = `arn:aws:scheduler:eu-west-1:<cuenta>:schedule/atlas-<entorno>-jobs/atlas-<entorno>-job-ecb`; `L` = `arn:aws:lambda:eu-west-1:<cuenta>:function:atlas-<entorno>-job-ecb`.

| Acción | Recurso | Para qué |
|---|---|---|
| `scheduler:GetSchedule`, `scheduler:UpdateSchedule` | `S` | parar la tarea del BCE mientras se trabaja, comprobar que solo cambió el estado y volver a dejarla como estaba (pasos 1 y 5; órdenes **sin verificar** contra AWS, para la 018). **Crea deriva respecto de Terraform** mientras dura; el procedimiento lo dice |
| `iam:PassRole` | el rol de Scheduler que invoca (`contracts/iam-permissions.md` §7) | lo exige `UpdateSchedule` al reescribir la programación con su destino |
| `s3:ListBucketVersions` | `B`, con `s3:prefix` en `reference/ecb/` y `jobs/ecb/` | ver las generaciones y sus versiones (paso 2) |
| `s3:GetObjectVersion` | `B/reference/ecb/*`, `B/jobs/ecb/*` | bajar una versión anterior para mirarla (paso 2) y copiarla (paso 3a) |
| `s3:PutObject` | `B/reference/ecb/*` | restaurar una generación buena copiando sus versiones (paso 3a) |
| `s3:DeleteObject` | `B/reference/ecb/manifest.json` | retirar una generación que miente con una marca de borrado (paso 3b). **Aceptado por la dirección para la 017** (§18) |
| `s3:DeleteObject` | `B/jobs/ecb/ecb_update/*` | borrar el registro de ejecución de hoy, versionado, para que la invocación a mano no acabe en `job_already_done` (paso 4) |
| `lambda:InvokeFunction` | `L` | ejecutar la tarea una vez a mano (paso 4) |
| `s3:GetObject` | `B/jobs/ecb/*` | leer el registro de la ejecución a mano, que tiene que decir `ecb_updated` (paso 4; pedido por la dirección para E4) |

**El procedimiento de los avisos** (`specs/016-scheduled-jobs/runbooks/scheduled-warnings.md`; E4):

| Acción | Recurso | Para qué |
|---|---|---|
| `s3:GetObject` | `B/jobs/*` | leer el registro de una tarea que falla o no se lee, y el de un volcado |
| `s3:GetObject` | `B/backups/*` | comprobar un volcado contra su registro (el bloque ensayado) |
| `s3:ListBucketVersions` | `B`, con `s3:prefix` en `backups/` | ver quién escribió un objeto que no dejó el volcado (`backup_object_differs`) |

Con credenciales de corta duración y MFA, como las demás órdenes de `atlas admin` (ADR-0032, ADR-0034). Si el rol de administración de la 015 ya alcanza todo el bucket de datos, estas filas no añaden nada **del bucket**; se escriben para que la 017 lo compruebe, y las de Scheduler y Lambda sí son nuevas. La orden `push` **nunca** escribe `B/prices/config.json`.

## 9. Tiempo y memoria (propuesta del bloque 0 de E2, questions §14.1, punto 3)

| Función | `timeout` | Memoria | `ATLAS_JOB_MAX_RUN_SECONDS` |
|---|---|---|---|
| `atlas-<entorno>-job-ecb` | 300 s | 256 MB | 300 |
| `atlas-<entorno>-job-prices` | 900 s | 256 MB | 900 |
| `atlas-<entorno>-job-mail` | 300 s | 256 MB | 300 |
| `atlas-<entorno>-job-backup` | 300 s | 512 MB | 300 |
| `atlas-<entorno>-job-integrity` | 300 s | 512 MB | 300 |

**E4, propuesta**:
- **El volcado** tiene en memoria a la vez el libro, `prices/` y el histórico del BCE, unos 600 KB en ZIP y unos 12 MB en el CSV de la API (§19.1).
- **La integridad** tiene en memoria dos libros, el vivo y el del volcado, con sus dos proyecciones.

Con un libro de 1-2 MB (ADR-0002), 512 MB dejan margen. **Sin medir** contra una Lambda real: es de la 018.

Cada llamada a una fuente lleva un tiempo máximo de 15 s (`AbortSignal.timeout`, en la composición): el peor caso de la de precios son 41 × 15 s = 615 s.
