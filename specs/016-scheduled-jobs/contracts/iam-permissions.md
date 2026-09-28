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
| `s3:GetObject` | `B/ledger/ledger.jsonl`, `B/reference/ecb/*`, `B/prices/*` | lo que se vuelca |
| `s3:GetObject`, `s3:PutObject` | `B/backups/*` | escribir con `If-None-Match: *` y comparar lo que ya existe |
| `s3:GetObject`, `s3:PutObject` | `B/jobs/backup/*` | su registro |
| `s3:ListBucket` | `B`, con `s3:prefix` en `prices/`, `reference/ecb/`, `backups/`, `jobs/backup/`, `ledger/` | listar `prices/` (primer nivel) y `404` |

**Política del bucket, aceptada por la dirección** (questions §1.7 y §9): denegar `s3:PutObject` en `B/backups/*` a cualquier principal cuando falte `s3:if-none-match` (`conditional-writes-enforce.html`): así, ni un error del código puede sobrescribir un volcado. Su forma exacta se verifica en el bloque 0 de E4.

## 5. `atlas-<entorno>-job-integrity`

| Acción | Recurso | Para qué |
|---|---|---|
| `s3:GetObject` | `B/ledger/ledger.jsonl`, `B/backups/*`, `B/reference/ecb/*`, `B/jobs/backup/*` | recalcular, el último volcado y el histórico para `deepCheck` |
| `s3:GetObject`, `s3:PutObject` | `B/jobs/integrity/*` | su registro |
| `s3:ListBucket` | `B`, con `s3:prefix` en `jobs/backup/`, `jobs/integrity/`, `backups/`, `reference/ecb/`, `ledger/` | encontrar el último volcado cerrado y `404` |

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

Con credenciales de corta duración y MFA, como las demás órdenes de `atlas admin` (ADR-0032, ADR-0034). Si el rol de administración de la 015 ya alcanza todo el bucket de datos, esta fila no añade nada; se escribe para que la 017 lo compruebe. La orden **nunca** escribe `B/prices/config.json`.

## 9. Tiempo y memoria (propuesta del bloque 0 de E2, questions §14.1, punto 3)

| Función | `timeout` | Memoria | `ATLAS_JOB_MAX_RUN_SECONDS` |
|---|---|---|---|
| `atlas-<entorno>-job-ecb` | 300 s | 256 MB | 300 |
| `atlas-<entorno>-job-prices` | 900 s | 256 MB | 900 |

Cada llamada a una fuente lleva un tiempo máximo de 15 s (`AbortSignal.timeout`, en la composición): el peor caso de la de precios son 41 × 15 s = 615 s.
