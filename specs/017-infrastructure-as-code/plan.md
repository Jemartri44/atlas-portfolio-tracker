# Plan de implementación: infraestructura como código (`017-infrastructure-as-code`)

**Rama**: `feature/017-infrastructure-as-code` | **Fecha**: 2026-10-03 | **Especificación**: [spec.md](spec.md)

**Entrada**: `docs/prompts/017-infrastructure-as-code.md` (manda lo decidido en su §12), ADR-0028, 0033, 0034 y las notas citadas, `specs/015-api-access/plan.md` §10 y `specs/016-scheduled-jobs/contracts/`.

**Estado**: ejecutado y fusionado en cuatro entregas (PR #114 a #117); sin AWS, nada desplegado. Lo que el código decidió por su cuenta, en `questions.md`. El texto de abajo es el de la propuesta original, y lo que dice de «no hay código ni `.tf` todavía» ya no es cierto. Todo lo marcado **propuesta** lo confirma la dirección (prompt §11.2); lo marcado **SIN VERIFICAR** lo cierra el bloque 0 de su entrega o la 018.

## Resumen

Se escribe en Terraform la pila de Atlas para la cuenta compartida, en cuatro entregas (E1 aislamiento y cuenta; E2 datos y borde; E3 tareas y correo; E4 guiones, CI y procedimientos), y se verifica **sin AWS**: `fmt`, `validate`, `terraform test` con proveedor simulado y una suite de `vitest` que analiza el `plan` renderizado contra una tabla de permisos versionada. Ningún `apply`, ninguna credencial. El primer `apply` es de la 018.

## Contexto técnico

- **Lenguaje**: HCL (Terraform) para la infraestructura; TypeScript (ESM, Node 22) para la suite de `infra/test/` y para `atlas admin secrets` (E4, `apps/cli`).
- **Herramientas**: Terraform CLI **1.16.5** ya instalada en `/home/ubuntu/.local/bin/terraform` (comprobado el 2026-10-03; `mock_provider` exige ≥ 1.7 y el bloqueo nativo de S3, ≥ 1.10). Proveedor `hashicorp/aws`: **propuesta**, la última 6.x estable que `terraform init -backend=false` resuelva en el bloque 0.1 de E1, **versión exacta** y `.terraform.lock.hcl` versionado con los *hashes* de `linux_amd64` (máquina del usuario y CI). `hashicorp/setup-terraform` fijada por SHA en la CI (E4). Ningún analizador estático (§12 P2). Ver `questions.md` P-1.
- **Dependencias npm nuevas**: ninguna. La suite usa `vitest` (ya presupuestado) y `child_process`; `atlas admin secrets` usa `@aws-sdk/client-ssm` ya instalado.
- **Almacenamiento**: el estado de las raíces de entorno, en el bucket `atlas-account-tfstate-<sufijo>` (clave `envs/<entorno>/terraform.tfstate`, bloqueo nativo `use_lockfile`); el del *bootstrap*, local y fuera del repositorio, uno por parte.
- **Pruebas**: `terraform fmt -check`, `init -backend=false`, `validate`, `terraform test` (`mock_provider`) y `vitest` bajo `infra/test/` (nuevo proyecto en `vitest.config.ts`), con `--pool=forks --maxWorkers=1` y `free -m` antes de cada paso pesado.
- **Plataforma objetivo**: AWS `eu-west-1`; `us-east-1` solo para ACM, la *web ACL* de CloudFront y lo global (dos proveedores con alias).
- **Restricciones**: coste 0,01-0,05 $/mes con alarma `atlas-cost` a 1 $ (2 $ con clave KMS); nada personal en el repositorio; los registros de Actions son públicos; secretos fuera de Terraform.

## Comprobación de la constitución

| Principio | Cumplimiento |
|---|---|
| I-III (libro, lotes, compartimentación) | No se toca el libro ni el dominio. El bucket de datos conserva las reglas de solo añadir (sin `s3:DeleteObject` salvo las dos excepciones aceptadas del rol de administración) |
| IV (nada codificado que sea configurable) | Todo lo variable entre entornos o de la cuenta es variable de Terraform con `validation`; los valores personales viven en `terraform.tfvars` fuera del repositorio |
| V (fallo seguro) | Reintentos de Scheduler y de Lambda como los contratos; grupos de registros con retención 30/7; `dev` en reposo |
| VI (20 años, coste mínimo) | Cero dependencias nuevas de npm; Terraform y el proveedor con versión exacta; `cost.md` como lista cerrada con test; ningún servicio de pago (NAT, KMS del cliente salvo C2, WAF fuera del plan) |
| VII (tests primero) | Arnés antes que infraestructura; cada regla de seguridad con su test visto fallar y su mutante (55 en total, prompt §10) |
| Restricciones técnicas | Terraform para todo, con las excepciones escritas (*bootstrap* por entorno, guion de secretos, guion del plan de tarifa plana); `eu-west-1`; `dev` y `prod` con pilas separadas; construir una vez y promocionar |

**Resultado**: sin violaciones que justificar. **Tensiones anotadas** (no bloquean, van a `questions.md`): la excepción de lectura de bucket del despliegue y del `plan` (B1, riesgo aceptado por el usuario) y que la premisa del `HeadBucket` está SIN VERIFICAR.

## Estructura del proyecto

Propuesta (§11.2 a):

```text
infra/
  bootstrap/
    account/          estado local; bucket del estado y de artefactos, presupuesto, etiqueta, OIDC, analizador, SES
    env/              una raíz, aplicada una vez por entorno (variable `env`); límite, roles, OAC, clave KMS (C2)
  modules/
    atlas/            la pila de un entorno (S3 SPA, CloudFront, Lambdas, Scheduler, logs, SSM String, políticas)
    data-bucket/            bucket de datos sin protección (dev)
    data-bucket-protected/  bucket de datos con prevent_destroy (prod); misma interfaz
  envs/
    dev/  prod/       raíces: backend S3, proveedores con alias, eligen el módulo del bucket de datos
  scripts/            guion del plan de tarifa plana (E4)
  test/               suite de vitest sobre el plan renderizado, ensayos de guiones, guardianes
  README.md           cómo se verifica sin AWS
apps/cli/src/admin/   atlas admin secrets (E4)
specs/017-infrastructure-as-code/
  spec.md plan.md research.md quickstart.md questions.md cost.md (E1+) runbooks/ contracts/
```

**Por qué dos módulos de bucket.** `prevent_destroy` no admite variables: el bucket de datos se crea en un módulo hermano elegido por la raíz del entorno (`envs/prod` usa el protegido, `envs/dev` el otro), y sus salidas (nombre, ARN) entran en `modules/atlas`. La **política** del bucket vive en `modules/atlas`, que conoce los roles por nombre y no por referencia, así que no hay ciclo. **Ningún literal `dev` ni `prod` en `infra/modules/`**: lo comprueba un test (familia 16).

## Entregas, orden y zonas de revisión

| Entrega | Bloques | Depende de | Zonas de revisión (propuesta) |
|---|---|---|---|
| **E1** | 0 verificar (10 puntos, [research.md](research.md)); 1 arnés sobre raíz vacía, cada guardián visto fallar; 2 *bootstrap* de la cuenta; 3 *bootstrap* de entorno; 4 casilla de la plantilla de PR | P1 contestada (Terraform ya instalado) | **Z1** aislamiento: `infra/bootstrap/env/*` (límite, roles, confianzas), políticas de los buckets del estado y de artefactos. **Z2** cuenta y arnés: `infra/bootstrap/account/*` (presupuesto, etiqueta, compartidos, `prevent_destroy`), `infra/test/harness/*`, `.gitignore`, plantilla de PR |
| **E2** | 0 verificar (6 puntos); 1 bucket de datos; 2 roles de la API y de administración; 3 CloudFront, SPA y Function URL; 4 Lambda de la API, parámetros `String` y registros | E1 | **Z3** datos e identidad: bucket de datos y su política, roles API/admin contra la tabla, SSM, KMS. **Z4** borde: CloudFront, WAF, función de CSP, Function URL, SPA, `dev_active` |
| **E3** | 0 verificar (3 puntos); 1 cinco funciones; 2 Scheduler | E2 | **Z5** tareas: roles contra la tabla, SES, Scheduler. **Z6** configuración: `ATLAS_*` y `Input` contra los analizadores del código |
| **E4** | 0 verificar (3 puntos); 1 `atlas admin secrets`; 2 guion del plan de tarifa plana; 3 flujos de Actions; 4 procedimientos y `cost.md` cerrado | E1-E3 | **Z7** CI y promoción. **Z8** guiones, procedimientos y coste |

Cada entrega termina como la 016: tubería en verde y rama empujada; autocomprobación de las 17 familias de §9 escrita en `questions.md`; commit congelado con su SHA para los revisores por zonas (worktrees desacoplados, nada empujado mientras dura la revisión); arreglos con el test en rojo primero; y PR a `develop` abierta por quien implementa, **con la casilla del *bootstrap* contestada («nada aplicado; el primer `apply` es de la 018») y sin fusionarla**. La entrega siguiente empieza con `git merge origin/develop`.

## Cómo se verifica sin AWS (§4 del prompt, propuesta)

**Capa A, sintaxis y esquema**: `terraform fmt -check -recursive infra/` y, en cada una de las cuatro raíces, `terraform init -backend=false` + `validate`. La única red es la del registro de HashiCorp en `init`.

**Capa B, `terraform test` con `mock_provider "aws"`**: un `run` por salida de la matriz de comprobaciones y por entorno, con `command = plan` (siempre, por `prevent_destroy`). Afirma qué recursos existen y con qué valores. **Riesgo conocido** (bloque 0.1): un `aws_iam_policy_document` bajo el proveedor simulado devuelve un JSON inventado; por eso **las políticas se escriben con `jsonencode()`** (o `override_data`), y el bloque 0.1 lo comprueba antes de escribir un recurso.

**Capa C, análisis estático del `plan` renderizado**, el que decide la seguridad. `terraform test` no exporta el `plan` en JSON, así que hay dos vías y el bloque 0.1 elige una **con prueba**:

1. *(preferida si funciona)* un `plan` con el proveedor `aws` configurado con credenciales falsas, `skip_credentials_validation`, `skip_requesting_account_id`, `skip_metadata_api_check`, `-refresh=false`, sin estado, **y `endpoints` apuntando a `127.0.0.1:9` para que cualquier llamada que se escape falle sin red**, seguido de `terraform show -json`. Sin fuentes de datos que consulten AWS (lo existente se elige por variable, no por `data` implícito; ver «Variables»).
2. *(si la 1 llama a AWS)* las aserciones se escriben dentro de `terraform test` (`assert` sobre `jsondecode(...)` de cada política) y la suite de `vitest` solo comprueba que esas aserciones existen y que los fuentes cumplen las reglas estáticas que sí se pueden leer del HCL (`prevent_destroy`).

La suite de `vitest` (`infra/test/`, proyecto nuevo del `vitest.config.ts`) lee el JSON y aplica: la tabla de permisos (acción a acción y recurso a recurso), comodines (lista cerrada), cruce de entornos, límite de permisos contra todo rol que lo lleva, confianzas, políticas de bucket, rol de `plan` sin escritura en el estado, `output` sensibles, etiquetas, secretos en el plan, región por recurso, tipos contra `cost.md`, variables `ATLAS_*` contra los analizadores del código (leídos con `import`, no copiados) y los `Input` contra `scheduler-event.md`.

**El evaluador no es IAM.** Cada regla es una **afirmación estructural** (§12 P3): «toda sentencia `Allow` de `atlas-dev-deploy` sobre CloudFront lleva `aws:ResourceTag/env` = `dev` o un ARN de `dev`», «existe la denegación de `TagResource`...», etc. Un operador que la suite no entiende **hace fallar el test, no pasarlo**.

### Cómo se prueba cada límite de permisos sin AWS

| Límite | Prueba (todas sobre el `plan` renderizado, cada una con su mutante) |
|---|---|
| Límite de permisos `atlas-<entorno>-boundary` | Para cada rol que lo lleva (API, 5 tareas, admin, deploy, plan, Scheduler), cada acción de su tabla pasa por el límite (prefijos, regiones, IAM); `organizations:*`, `account:*`, facturación y otra región, denegados. Un rol fuera del test hace fallar el test de cobertura de roles |
| Despliegue de `dev` contra `prod` (escenarios 1-3 de la fila 5) | Afirmaciones estructurales sobre `atlas-dev-deploy`: toda sentencia `Allow` sobre CloudFront/ACM/WAF lleva su `env` o un ARN de `dev`; existe la denegación de `TagResource`/`UntagResource` con `aws:ResourceTag/env` presente y distinto, y la de `aws:TagKeys` sobre `project`/`env`; ninguna acción de cambio sobre OAC o políticas de CloudFront; el hueco del escenario 2 queda escrito. **Simulador real: 018, condición del primer `apply`** |
| Dos cerraduras (filas 6, 7, 15) | Un test **por cerradura y por separado**: la política de identidad de cada rol nombra solo ARN de su entorno; la del recurso niega lo de otro entorno. Quitar una sola hace fallar un test |
| Bucket de datos (B1) | Despliegue y `plan`: solo `s3:ListBucket` y la lista exacta de configuración del bloque 0.9, nunca `GetObject`/`PutObject`; la denegación de objeto sigue valiendo para ellos |
| Estado y artefactos (B2, B6) | `plan` solo `GetObject` sobre su clave exacta y `ListBucket` con prefijo, sin `Put`/`Delete`; solo `atlas-dev-deploy` escribe artefactos; el principal de administración nunca queda fuera (autobloqueo) |
| Rol de `plan` y despliegue contra secretos (fila 21) | Ni `ssm:GetParameter*` ni `kms:Decrypt` sobre ningún recurso que cubra `/atlas/<entorno>/` salvo `String` no secretos |
| Confianzas | `sub` y `aud` exactos, sin comodín; `plan` sin `environment:`; admin con principal y condición de C5; servicios `lambda.amazonaws.com` y `scheduler.amazonaws.com` con `aws:SourceArn` |
| Function URL / CloudFront | `authorization_type = "AWS_IAM"`, `AWS:SourceArn` y no `SourceAccount`, el bucket de datos no es origen |
| `prevent_destroy` | Lectura estática del HCL (si 0.10 dice que no sale en el JSON) |

## Tabla de permisos de cada rol

En [contracts/permissions-table.md](contracts/permissions-table.md): rol, acción, recurso, condición y fila del contrato. **Una acción sin fila de contrato es una pregunta, no una línea de la política.**

## Matriz de salidas de las comprobaciones de ADR-0034

| Comprobación | Variable que elige (propuesta) | Salidas | `run` de `terraform test` |
|---|---|---|---|
| **C2** clave KMS del cliente | `use_customer_managed_key` (solo `prod`, *bootstrap* de entorno) | `false`: `aws/ssm`, alarma 1 $; `true`: clave con política sin delegación, `aws:PrincipalArn` + `ArnLike`, alarma 2 $ | `c2_default_ssm_key`, `c2_customer_key` (+ presupuesto 1 $ / 2 $) |
| **C5** confianza del administrador | `admin_principal_arn` (sensible), `admin_trust_mode` | `iam_user_mfa`: `aws:MultiFactorAuthPresent = true`; `identity_center_role`: confianza por el rol reservado de Identity Center, sin condición de MFA (SIN VERIFICAR) | `c5_iam_user_mfa`, `c5_identity_center` |
| **C9** destinatario en SES | `ses_verify_recipient_identity` | `false`: solo remitente; `true`: también identidad del destinatario | `c9_sender_only`, `c9_sandbox` |
| **C11** planes Free de CloudFront | `edge_mode` (`free_plan` \| `pay_per_use`); «ninguno» = parar, no es un valor | `free_plan`: WAF por entorno con regla de ritmo; `pay_per_use`: `dev` sin WAF | `c11_free_plan_both_envs`, `c11_dev_pay_per_use` (los dos entornos) |
| **C12** concurrencia | `api_reserved_concurrency`, `jobs_reserved_concurrency` (`null` omite) | número / omitida | `c12_reserved`, `c12_unreserved` |
| **C13 / C19** OIDC y analizador | `github_oidc_provider_mode`, `access_analyzer_mode` (`use_existing` \| `create`) | `use_existing`: `data`; `create`: recurso con `prevent_destroy`; la variable elige, no un `try()` | `c13_use_oidc`, `c13_create_oidc`, `c19_use`, `c19_create` |
| **C3** activación de la etiqueta | `cost_tag_activation` (`off` \| `terraform`); `off` por defecto | segunda pasada o manual (organización ajena) | `c3_tag_off`, `c3_tag_on` |
| Variantes SES | `ses_create_sender_identity` | usar o crear | `ses_use`, `ses_create` |

## Variables de Terraform (propuesta, §11.2 b)

En [contracts/variables.md](contracts/variables.md), con su `validation` y cuáles llevan `sensitive = true`. Los nombres que proponían los runbooks de la 016 (`mail_recipient`, `mail_amounts`) **se mantienen**; los presupuestos de la nube se llaman `prices_eodhd_daily_calls`, `prices_alpha_vantage_daily_calls` y `prices_failure_threshold`. Ficheros: `~/personal/atlas/privado/terraform/<entorno>/terraform.tfvars` (pila) y `~/personal/atlas/privado/terraform/bootstrap/<account|dev|prod>/terraform.tfvars` (*bootstrap*, junto a su estado), siempre con `-var-file`, nunca por `-var`.

## Tabla de los SIN VERIFICAR (prompt §6)

| # | Qué | Qué hace esta feature | Dónde |
|---|---|---|---|
| 1 | PR del proveedor para planes de tarifa plana | Localizar y enlazar (#49235 como punto de partida) y decir su estado | E4 b0.1 |
| 2-3 | Acciones con condiciones por etiqueta; OAC y políticas con etiquetas | Fuente (*Service Authorization Reference*, docs del recurso); lo no acotable se acota por ARN o lo crea el *bootstrap* | E1 b0.2, b0.3 |
| 4 | Un solo proveedor OIDC por URL; reclamaciones del `sub` | Fuente de IAM y de GitHub | E1 b0.4 |
| 5 | Riesgo de clave KMS inmanejable | Fuente; solo con C2 | E1 b0.6 |
| 6 | Parámetro avanzado de SSM | Página de precios | E2 b0.6 |
| 7 | `dev` de pago por uso en el nivel gratuito | Página de precios; consumo real, 018 | E2 b0.5 |
| 8 | Permisos de KMS para `aws/ssm` | Por el lado seguro con `kms:ViaService` y `EncryptionContext`; real, 018 | E2 b0.4 |
| 9 | La CSP respeta la `sandbox` | Por construcción y con test; navegador, 018 | E2 b3 |
| 10 | Function URL detrás de OAC pide también `lambda:InvokeFunction` | Fuente de AWS | E2 b0.1 |
| 11 | Qué admite el plan Free; *web ACL* antes de suscribir | Fuente de AWS | E2 b0.2 |
| 12-13 | Etiquetado de programaciones y de parámetros | Cerrados por la 016 y la 015: se aplican | E2, E3 |
| 14 | Atribución de Scheduler y SES al presupuesto | **018** (Cost Explorer) | — |
| 15 | ARN de identidad de SES con dominio verificado | Si hay fuente, se dice; si no, el recurso nombra las dos (aceptado), **018** | E3 b0.1 |
| 16 | `aws:MultiFactorAuthPresent` en Identity Center | Con fuente si la hay; si no, variable para las dos variantes | E1 b0.5 |
| 17-18 | Concurrencia sin reservar; duración de la petición de SSM | Fórmula escrita y valor prudente; mide la **018** | E2 b4 |
| 19 | Simulador de IAM | Análisis estático aquí; simulador en la **018** antes del primer `apply` | E1-E3 |
| 20-24 | `s3:prefix` y `404`; `ObjectCreationOperation`; cookies; atomicidad; órdenes de Scheduler | **018**; se escribe con la condición y la salida alternativa dicha | — |
| 25 | `HeadBucket` exige `s3:ListBucket`; el `plan` funciona con solo las acciones de B1 | Lista exacta de acciones del proveedor y del *backend* con la versión fijada; real, **018** | E1 b0.9 |
| 26 | `prevent_destroy` en `show -json` | Prueba en el arnés | E1 b0.10 |
| 27 | Function URL invocable por la misma cuenta | Riesgo aceptado, C2 en la 018 | — |
| 28 | Qué lista el *backend* de S3; `workspace_key_prefix` | Con docs y código del *backend* | E1 b0.9 |
| 29 | ARN de `aws:SourceArn` de Scheduler | Lado seguro: `ArnLike` con grupo y programación, ambos acotados al grupo de su entorno | E3 b0.3 |

## Tabla de coste (lista cerrada de tipos de recurso)

Se rellena en E1 y se cierra en E4 en `cost.md` (cabecera: «cualquier `apply` necesita el visto bueno del usuario con esta estimación delante»). Tipos previstos y su coste esperado:

| Tipo de recurso (previsto) | Entorno / parte | Coste esperado | Qué lo haría crecer |
|---|---|---|---|
| `aws_s3_bucket` y configuración (estado, artefactos, datos, SPA) | cuenta, `dev`, `prod` | céntimos al año | versiones no vigentes sin ciclo de vida; multiparte a medias |
| `aws_lambda_function` ×6 por entorno, `aws_cloudwatch_log_group` | `dev`, `prod` | nivel gratuito compartido; registros 30/7 días | concurrencia provisionada (no entra), VPC (no entra) |
| `aws_cloudfront_distribution`, OAC, función, `aws_wafv2_web_acl` | `dev`, `prod` | 0 con plan Free | *web ACL* fuera del plan: 7-8 $/mes; registros de CloudFront o WAF (apagados) |
| `aws_acm_certificate` | `dev`, `prod` | 0 | — |
| `aws_scheduler_schedule_group` y programaciones ×5 | `dev`, `prod` | por verificar (nivel gratuito) | — |
| `aws_ssm_parameter` (`String` ×2) | `dev`, `prod` | 0 | parámetros avanzados, rendimiento alto |
| `aws_budgets_budget`, `aws_ce_cost_allocation_tag` | cuenta | 0 | acciones o informes de Budgets |
| IAM (roles, políticas, límite, OIDC, analizador), identidades de SES | cuenta, `dev`, `prod` | 0 | — |
| `aws_kms_key` | `prod`, solo con C2 | **1 $/mes** | alarma a 2 $ |

La suma esperada cae en 0,01-0,05 $/mes; **si al verificar las fuentes no sale, se para**. Se verifican con fuente y fecha: Scheduler, CloudWatch Logs, CloudFront Functions en el plan Free.

## Decisiones propuestas para confirmar (prompt §11.2)

- **(a) Forma de `infra/`**: la de arriba. Motivo: una raíz de *bootstrap* por entorno con la variable `env` evita duplicar código, y dos módulos de bucket resuelven `prevent_destroy` sin variables.
- **(b) Variables y ficheros de `tfvars`**: las de `contracts/variables.md`.
- **(c) Versiones**: Terraform 1.16.5 (la instalada; mínimo 1.10), proveedor `hashicorp/aws` fijado en el bloque 0.1 con `required_version`/`required_providers` exactos.
- **(d) Arquitectura de las Lambdas**: **propuesta `arm64`** (más barata) **si** el bloque 0 de E2 comprueba que `dist-lambda/*.zip` no lleva binarios nativos (`esbuild` los deja fuera del paquete); si hay duda, `x86_64`.
- **(e) Tiempo y memoria de la API**: propuesta `timeout` 30 s y 256 MB (sin medir; la 018 ajusta). Las tareas, los de `iam-permissions.md` §9.
- **(f) Lista cerrada de comodines (familia 11)**: se escribe acción a acción en E1/E2. Previstos: `logs:CreateLogGroup` no hace falta (los crea Terraform); candidatas a `Resource: "*"` por no admitir recurso: `ce:*` no se usa; `iam:ListOpenIDConnectProviders`, `cloudfront:ListDistributions`/`List*` de lectura, `wafv2:List*`, `acm:List*`, `budgets:ViewBudget` si el `plan` los necesita (se deciden con la *Service Authorization Reference* en b0.2/b0.9; **sin fuente, no entran**).
- **(g) Zonas de revisión**: las de la tabla de entregas.
- **(h) `aws` simulado**: un ejecutable `infra/test/fakes/aws` (script de Node) que va delante en el `PATH`, registra cada llamada (argumentos, con los valores secretos redactados) en un fichero y responde con JSON fijo por subcomando; los ensayos viven en `infra/test/scripts/*.test.ts` y afirman las órdenes una a una.

## Documentos que tendrá que actualizar la dirección

Lista viva en `questions.md` (§prompt 10): ADR-0028 (PR del proveedor, KMS para `aws/ssm`, CSP/`sandbox`, plan Free), ADR-0034 (lo que cierre b0 y las excepciones del límite que falten), ADR-0033 y ADR-0027, `docs/decision-roadmap.md`, `docs/specification.md` §9.3, §11.4 y §11.6, `docs/dependencies.md`, `docs/runbooks/`, `CLAUDE.md` si cambia *Where things live*, `docs/prompts/README.md`.

## Artefactos de diseño de esta fase

- [research.md](research.md): las verificaciones del bloque 0 de cada entrega, con cuándo se harán.
- [contracts/permissions-table.md](contracts/permissions-table.md): tabla de permisos por rol.
- [contracts/variables.md](contracts/variables.md): variables de Terraform.
- [quickstart.md](quickstart.md): cómo recorrer la verificación sin AWS.
- [questions.md](questions.md): preguntas abiertas para la dirección.
- `data-model.md`: no aplica (no hay datos de dominio nuevos; las entidades están en `spec.md`).
