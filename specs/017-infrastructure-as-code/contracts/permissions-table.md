# Tabla de permisos de cada rol (propuesta; la aprueba la dirección en el alto)

Notación: `B` = bucket de datos `atlas-<env>-data-<sufijo>`; `P` = `arn:aws:ssm:eu-west-1:<cuenta>:parameter/atlas/<env>`; `I` = `arn:aws:ses:eu-west-1:<cuenta>:identity`. Fila de contrato: **C15** = `specs/015-api-access/plan.md` §10; **C16-n** = `specs/016-scheduled-jobs/contracts/iam-permissions.md` §n; **A34-n** = ADR-0034 fila n; **A33** = ADR-0033; **R** = hoja de ruta («Lo que la 015 le deja a la 017»); **P12** = prompt §12.2. Todos los roles de ejecución llevan el límite de su entorno y **ninguno** tiene `s3:DeleteObject`, `ssm:DeleteParameter*` ni `ssm:LabelParameterVersion` salvo las dos excepciones del administrador. «Lista B1» = la lista exacta del bloque 0.9 de E1 (pendiente).

## `atlas-<env>-api`

| Acción | Recurso | Condición | Contrato |
|---|---|---|---|
| `s3:GetObject` | `B/ledger/ledger.jsonl`, `B/sync/devices/*`, `B/reference/ecb/*`, `B/prices/*` | — | C15 |
| `s3:PutObject` | `B/ledger/ledger.jsonl`, `B/sync/devices/*` | — (`If-Match`/`If-None-Match` los pone el código) | C15 |
| `s3:GetObject`, `s3:PutObject` | `B/access/last-web-sign-in.json` | — | C16-6 |
| `s3:ListBucket` | `B` | `s3:prefix` en `ledger/`, `sync/devices/`, `reference/ecb/`, `prices/`, `access/` | C15, R, P12-B5 |
| `ssm:GetParameter` | `P/auth/*`, `P/device-tokens/*` | — | C15 |
| `ssm:GetParametersByPath` | `P/device-tokens` | — | C15 |
| `ssm:PutParameter` | `P/device-tokens/*` | — | C15 |
| `ssm:AddTagsToResource` | `P/device-tokens/*` | — | A34 (nota 2026-09-26), R |
| `kms:Decrypt` (y `kms:Encrypt` sobre `device-tokens/*`) | clave `aws/ssm` | `kms:ViaService`, `kms:EncryptionContext:PARAMETER_ARN` | C15, A33; **SIN VERIFICAR** (E2 b0.4) |
| `logs:CreateLogStream`, `logs:PutLogEvents` | `/aws/lambda/atlas-<env>-api` y su `:*` | — | C16-6 (N6) |

## `atlas-<env>-job-ecb` / `-prices` / `-mail` / `-backup` / `-integrity`

Exactamente las tablas de `iam-permissions.md` §1 a §5, con **`logs:CreateLogStream` y `logs:PutLogEvents` sobre su propio grupo** (§7). Puntos que el test fija:

| Rol | Puntos fijados |
|---|---|
| ecb | `GetObject` `ledger.jsonl`; `GetObject`+`PutObject` `reference/ecb/*`, `jobs/ecb/*`; `ListBucket` con prefijos `reference/ecb/`, `jobs/ecb/`, `ledger/` (C16-1) |
| prices | `GetObject` `ledger.jsonl`, `prices/*`; `PutObject` `prices/*` **con `Deny` de `prices/symbols.json` y `prices/config.json`**; `jobs/prices/*`; `ssm:GetParameter` solo `P/prices/eodhd-key` y `P/prices/alpha-vantage-key` (no en `dev` en la práctica) (C16-2) |
| mail | `GetObject` `ledger.jsonl`, `prices/*`, `reference/ecb/*`, `access/last-web-sign-in.json`, `jobs/*`; `PutObject` solo `jobs/mail/*`; `ssm:GetParameter` `P/mail/recipient`, `P/mail/amounts`; `GetParametersByPath` `P/device-tokens` con `ssm:Recursive = false`; **`ses:SendEmail`** sobre `I/<remitente>` e `I/<dominio>` (y la del destinatario si C9) con `ses:FromAddress`, `ses:ApiVersion = 2`, `ForAllValues:StringEquals` `ses:Recipients` y `Null` `false`; **nada** bajo `P/prices/` ni `P/auth/` (C16-3) |
| backup | `GetObject` `ledger.jsonl`, `manifest.json`, `eurofxref-hist.csv`, `api-exr.csv`, `prices/*`; `GetObject`+`PutObject` `backups/*`, `jobs/backup/*` (C16-4) |
| integrity | `GetObject` `ledger.jsonl`, `jobs/backup/*`, `backups/*/ledger.jsonl`; `GetObject`+`PutObject` `jobs/integrity/*` (C16-5) |

## `atlas-<env>-admin` (confianza en E1, política en E2)

| Acción | Recurso | Condición | Contrato |
|---|---|---|---|
| `s3:GetObject`, `s3:PutObject` | `B/*` en los prefijos de C15 §10 | — | C15 |
| `s3:ListBucket` | `B` | — | C15 |
| `s3:GetObjectVersion` | `B/*` | — (restaurar `--from s3-version:<id>`) | R |
| `ssm:GetParametersByPath`, `ssm:PutParameter` | `P/device-tokens` / `P/device-tokens/*` | — | C15 |
| `s3:GetObject`, `s3:PutObject`, `s3:GetObjectVersion` | `B/prices/symbols.json` | — | C16-8 |
| `s3:ListBucket` / `s3:ListBucketVersions` | `B` | `s3:prefix` en `prices/`, `reference/ecb/`, `jobs/ecb/`, `backups/` | C16-8 |
| `s3:GetObjectVersion` | `B/reference/ecb/*`, `B/jobs/ecb/*` | — | C16-8 |
| `s3:PutObject` | `B/reference/ecb/*` | — | C16-8 |
| `s3:DeleteObject` | `B/reference/ecb/manifest.json`, `B/jobs/ecb/ecb_update/*` | — (aceptado por la dirección) | C16-8 |
| `s3:GetObject` | `B/jobs/*`, `B/backups/*` | — | C16-8 |
| `scheduler:GetSchedule`, `scheduler:UpdateSchedule` | `schedule/atlas-<env>-jobs/atlas-<env>-job-ecb` | — | C16-8 |
| `iam:PassRole` | el rol de Scheduler de su entorno | `iam:PassedToService = scheduler.amazonaws.com` | C16-8, P12-B4 |
| `lambda:InvokeFunction` | `function:atlas-<env>-job-ecb` | — | C16-8 |
| `ssm:PutParameter`, `ssm:AddTagsToResource` | `P/auth/*`, `P/prices/*` | — (`atlas admin secrets`; más `kms:Encrypt` con C2) | A34-21; **pregunta Q-6** |
| `ssm:GetParameter` sobre `P/auth/*`, `P/prices/*` | — | **no concedida** salvo respuesta a Q-6 | — |

## `atlas-<env>-deploy`

| Acción | Recurso | Condición | Contrato |
|---|---|---|---|
| Crear y cambiar Lambda, grupo de registros, Scheduler, SSM `String` del correo, SPA bucket, CloudFront, ACM, WAF | ARN `atlas-<env>-*`; por etiqueta donde no hay ARN con nombre | `aws:RequestTag/env` al crear; `aws:ResourceTag/env` al cambiar | A34-5 |
| `iam:CreateRole`, `PutRolePolicy`, `AttachRolePolicy`... | `role/atlas-<env>-*` salvo `-admin`, `-deploy`, `-plan` | `iam:PermissionsBoundary` = su límite | A34-5 |
| `iam:PassRole` | roles de las Lambdas y de Scheduler de su entorno | `iam:PassedToService` | P12-B4 |
| lecturas de IAM | `atlas-<env>-*` | — | P12-B4 |
| Denegaciones | `TagResource`/`UntagResource` si `aws:ResourceTag/env` existe y ≠ el suyo; cambio de `project`/`env` (`aws:TagKeys`); quitar el límite; tocar roles del *bootstrap*; cambios sobre OAC y políticas de CloudFront | — | A34-5, NB4 |
| `s3:ListBucket` y lista B1 | `B` | — | P12-B1 |
| Estado | `s3:GetObject`, `PutObject`, `DeleteObject` sobre `atlas-account-tfstate-*/envs/<env>/*` (y `.tflock`) | — | A34-15 |
| Artefactos | `atlas-dev-deploy`: `s3:PutObject`, `s3:GetObject`, `s3:ListBucket`; `atlas-prod-deploy`: `s3:GetObject`, `s3:ListBucket` | — | P12-B6 |
| SPA | `s3:PutObject`, `s3:DeleteObject`... sobre el bucket de la SPA de su entorno | — | E4 (P11) |
| **Nunca** | `s3:GetObject`/`PutObject` en `B`; `ssm:GetParameter*` o `kms:Decrypt` sobre secretos | — | A34-21, P12-B1 |

## `atlas-<env>-plan`

| Acción | Recurso | Condición | Contrato |
|---|---|---|---|
| Lecturas de metadatos (`Get*`, `List*`, `Describe*` solo de los servicios usados) | recursos de su entorno | — | A34-5 |
| `iam:Get*`, `iam:List*` | `atlas-<env>-*` | — | P12-B4 |
| `s3:ListBucket` y lista B1 | `B` | — | P12-B1 |
| `s3:GetObject` | `atlas-account-tfstate-*/envs/<env>/terraform.tfstate` (clave exacta) | — | P12-B2 |
| `s3:ListBucket` | `atlas-account-tfstate-*` | `s3:prefix` = `envs/<env>/` | P12-B2 |
| **Nunca** | `ReadOnlyAccess`, `s3:PutObject`/`DeleteObject` en el estado, objetos de `B`, secretos | — | A34-5, 21 |

## Rol de Scheduler `atlas-<env>-scheduler`

| Acción | Recurso | Contrato |
|---|---|---|
| `lambda:InvokeFunction` | las cinco `function:atlas-<env>-job-*`, nada más | C16-7 |
| Confianza | `scheduler.amazonaws.com` con `aws:SourceArn` al grupo `atlas-<env>-jobs` y sus programaciones (`ArnLike`, forma SIN VERIFICAR, E3 b0.3) | P12-B7 |

## Políticas de recurso

| Recurso | Contenido | Contrato |
|---|---|---|
| Bucket de datos | Deny objeto y listados fuera de los roles del entorno (`aws:PrincipalArn`); excepción solo de `s3:ListBucket` para `deploy` y `plan`; Deny de cambio de configuración salvo `deploy` y `admin`; Deny `backups/*` sin `If-None-Match`; solo TLS | A34-6, P12-B1, C16-4 |
| Estado | Deny `envs/prod/*` a todo salvo `atlas-prod-*` y el administrador, simétrico para `dev` | A34-15 |
| Artefactos | Deny de escritura salvo `atlas-dev-deploy` y el administrador; Deny de lectura salvo los dos despliegues y el administrador | P12-B6 |
| SPA | Lectura de la distribución de su entorno, `AWS:SourceArn` | A34-19 |
| Function URL | `lambda:InvokeFunctionUrl` y `lambda:InvokeFunction` para `cloudfront.amazonaws.com`, `AWS:SourceArn` de su distribución (b0 E2.1) | A34-19 |

## Excepciones del límite de permisos (al menos; lista completa tras b0.9 y el test de cruce)

`iam:PassRole` del admin sobre el rol de Scheduler (+ `PassedToService`); `iam:Get*`/`List*` del `plan` sobre `atlas-<env>-*`; acciones de IAM, `PassRole` y lecturas del despliegue; `atlas-account-*` solo ARN de S3; `ses:SendEmail` del correo sobre `I/<remitente>` e `I/<dominio>`; CloudFront, ACM y WAF por etiqueta/identificador y `us-east-1`; `kms:Decrypt` sobre `aws/ssm` si b0.4 lo pide; las que salgan del cruce (se anotan en `questions.md` para ADR-0034; **nunca se ensancha el patrón general**).
