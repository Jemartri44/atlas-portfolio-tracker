# Investigación: verificaciones antes de escribir código

Cada verificación se hace **con fuente, fecha y lo que dice**, y se anota aquí al hacerla (esta fase solo las planifica; ninguna está hecha). Regla de la Ronda 8: antes del primer commit de código de cada entrega. Lo que no tenga fuente se resuelve por el lado seguro y se dice. Referencias `b0.N` = bloque 0, punto N, del prompt.

## E1 (antes del primer `.tf`)

| Punto | Qué se verifica | Fuente prevista | Si sale mal |
|---|---|---|---|
| b0.1 | `mock_provider` (versión mínima), qué hace con recursos y con `aws_iam_policy_document`; cómo se obtiene el `plan` en JSON sin AWS (vía 1 con credenciales falsas y `endpoints` muertos, o vía 2 con `assert`); probado en un módulo mínimo con `init -backend=false` | Documentación de Terraform (*test*, `mock_provider`), `terraform version`, prueba local | **Para la entrega**: el análisis estático es su condición |
| b0.2 | Acciones que admiten `aws:ResourceTag`/`aws:RequestTag` y cuáles autorizan `TagResource` al crear: S3, IAM, Lambda, CloudFront, WAF, ACM, SSM, Logs, Scheduler, Budgets | *Service Authorization Reference* de cada servicio | Se acota por ARN; lo inacotable no lo crea el despliegue |
| b0.3 | Si OAC y políticas de CloudFront admiten etiquetas | Documentación de CloudFront y del recurso del proveedor | Las crea el *bootstrap* (ya decidido para la OAC) |
| b0.4 | Un solo proveedor OIDC por URL; reclamaciones `sub` (PR, rama, `environment:`) | Documentación de IAM y de GitHub (*OIDC reference*) | Nada cambia; el `plan` no declara `environment:` |
| b0.5 | Confianza del rol de administración para las dos variantes de C5; `aws:MultiFactorAuthPresent` en Identity Center | IAM User Guide, Identity Center | SIN VERIFICAR para la 018; variable para las dos |
| b0.6 | Política de clave KMS sin delegación: riesgo de clave inmanejable | Documentación de KMS | Solo si C2 la exige |
| b0.7 | `aws_ce_cost_allocation_tag` antes de que la clave aparezca en Billing | Documentación del recurso | Segunda pasada con variable apagada |
| b0.8 | Filtros de Budgets por `user:project` y exclusión de créditos y reembolsos, y su forma en `aws_budgets_budget` | Documentación de Budgets y del recurso | — |
| b0.9 | **Llamadas del proveedor al refrescar cada recurso y permiso de cada una** (`aws_s3_bucket` y configuración, IAM); **lista exacta** de acciones de configuración sobre el bucket de datos; las del *backend* de S3 con `-lock=false`; qué lista `Workspaces()` y si hace falta `workspace_key_prefix` dentro de `envs/<entorno>/`; la premisa `HeadBucket` ⇒ `s3:ListBucket` | Código del proveedor y del *backend* en la versión fijada; documentación de las APIs | **Es una pregunta**, no un ajuste de la política |
| b0.10 | Si `prevent_destroy` aparece en `terraform show -json` | Prueba en el arnés | Test estático del HCL; `run` en `command = plan` |

## E2

| Punto | Qué se verifica | Fuente prevista |
|---|---|---|
| b0.1 | Function URL `AWS_IAM` detrás de OAC: `lambda:InvokeFunctionUrl` y `lambda:InvokeFunction` con `AWS:SourceArn` | Documentación de CloudFront (*Restrict access to Lambda function URL origin*) y de Lambda |
| b0.2 | Qué admite el plan Free: CloudFront Functions, políticas propias, reglas de la *web ACL*, cobro de una *web ACL* antes de suscribir, asociación al plan | Guía de planes de tarifa plana (ADR-0034, F9) y de Pricing Plan Manager |
| b0.3 | Qué reenvía `AllViewerExceptHostHeader` (las cuatro cabeceras, *cookies*, consulta y `x-amz-content-sha256`) | Documentación de políticas gestionadas (ADR-0033, F6) |
| b0.4 | Permisos de KMS para `aws/ssm`; lado seguro con `kms:ViaService` y `kms:EncryptionContext:PARAMETER_ARN` | Documentación de SSM y KMS (`specs/016-scheduled-jobs/questions.md` §1.7) |
| b0.5 | `dev` de pago por uso en el nivel gratuito permanente de CloudFront | Página de precios |
| b0.6 | Precio de un parámetro avanzado y validez de su política dentro de la cuenta | Página de precios |
| (d) | Que los ZIP no llevan binarios nativos, para `arm64` | Inspección de `dist-lambda/*.zip` |

## E3

| Punto | Qué se verifica | Fuente prevista |
|---|---|---|
| b0.1 | Qué ARN de identidad evalúa SES con dominio verificado | Documentación de SES; si no hay fuente, el recurso nombra las dos (aceptado) y queda para la 018 |
| b0.2 | Configuración en Terraform de reintentos de Scheduler, `aws_lambda_function_event_invoke_config`, zona `Europe/Madrid`, `FlexibleTimeWindow = OFF`, estado `DISABLED` | Documentación de los recursos |
| b0.3 | `aws:SourceArn` de Scheduler al asumir el rol: grupo o programación | Documentación de Scheduler; si no, `ArnLike` con las dos formas acotadas al grupo de su entorno |

## E4

| Punto | Qué se verifica | Fuente prevista |
|---|---|---|
| b0.1 | Estado de la PR del proveedor de planes de tarifa plana (#49235, #45450, #49232) | GitHub |
| b0.2 | Órdenes de la CLI para suscribir, consultar y cancelar un plan Free, e idempotencia | Documentación de Pricing Plan Manager |
| b0.3 | Que un `pull_request` desde un *fork* no recibe OIDC; variables y secretos visibles sin *environment*; enmascarado de secretos | Documentación de GitHub Actions |

## Decisiones ya tomadas que no se investigan

SSE-S3 sin clave propia; sin analizadores estáticos; sin WAF fuera del plan; sin *trail* propio; Terraform 1.16.5 instalada (ver `questions.md` P-1).
