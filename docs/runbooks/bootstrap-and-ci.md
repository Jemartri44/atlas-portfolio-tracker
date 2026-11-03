# Aplicar el *bootstrap* por partes y activar la CI de `infra/`

Feature 017, E4. **Ninguno de estos pasos se ejecuta en la 017**; los hace la persona en la 018, con el visto bueno y `infra/test/contract/cost.md` delante.

## Aplicar el *bootstrap* (ADR-0034, filas 5 y 20)

1. Cuenta, luego `dev`, y `prod` solo cuando `dev` funciona: `terraform -chdir=infra/bootstrap/<account|env> init` y `apply -var-file=<ruta privada>/terraform.tfvars` (`env` con `env=dev` o `env=prod`). Los `tfvars` y el estado viven en `~/personal/atlas/privado/terraform/bootstrap/<account|dev|prod>/`, nunca en el repositorio.
2. **Respalda el estado local tras cada `apply`**, en el mismo disco que la copia fuera de AWS.
3. **La segunda pasada de la etiqueta**: la clave `project` tarda hasta 24 horas en aparecer en *Cost Allocation Tags*; pasado ese plazo, `cost_tag_activation = "terraform"` y otro `apply` de la cuenta.
4. La parte `env` crea el bucket de datos con su versionado, ciclo de vida y política, y pide el certificado de la distribución (hace falta `domain` en su `tfvars`). Tras el `apply`: el registro DNS de validación sale en `terraform output certificate_validation_records` (sensible), y `certificate_arn` va al `tfvars` del *stack* del entorno junto a los identificadores de los OAC. El rol de despliegue ya no puede cambiar nada de esto: cualquier cambio de retención, de versionado o de política del bucket de datos es un `apply` a mano del bootstrap.
5. Si cambia `infra/bootstrap/`, la casilla de la plantilla de PR dice qué partes se aplicaron y cuándo.

## Reconstruir el estado local del *bootstrap* si se pierde

Con las credenciales de administración y el `terraform.tfvars` de esa parte: `terraform init` y un `terraform import <dirección> <id>` por recurso (la lista sale de `terraform plan` sin estado: lo que propone crear y ya existe). Después, `plan` sin cambios. Si no hay copia, es esto o empezar de cero.

## Activar y desactivar `dev` (`dev_active`, `dev_active_jobs`)

`dev` duerme: `dev_active = false` deja la distribución desactivada, y las programaciones de las cinco tareas quedan **deshabilitadas** salvo las que nombra `dev_active_jobs` (un conjunto con `ecb`, `prices`, `mail`, `backup`, `integrity`; vacío por defecto). Las dos son variables del `terraform.tfvars` de `dev` (ejemplo en `infra/envs/dev/terraform.tfvars.example`) y se cambian desde el *pipeline* de `dev`; nada a mano en la consola. El rol de administración solo puede invocar `job-ecb` (`statements-admin.tf`): para ensayar otra tarea de `dev` (`first-deploy-checks.md`) hay que habilitar su programación con `dev_active_jobs` y esperar a su hora.

## Preparar los `tfvars` y el `backend.hcl` de un entorno

Los secretos `ATLAS_<ENTORNO>_TFVARS_B64` y `ATLAS_<ENTORNO>_BACKEND_B64` (y los `ATLAS_PLAN_*`) son un fichero en base64 de una línea. Parte de los ejemplos, con valores de relleno:
- `infra/envs/<dev|prod>/terraform.tfvars.example`: todas las variables obligatorias de la pila. Los cuatro valores de artefacto no van: los pone el *pipeline*. `certificate_arn`, `oac_spa_id` y `oac_api_id` salen de las salidas del *bootstrap* de ese entorno (paso 4 de arriba). **`mail_sender` y `domain` tienen que ser iguales que en el `terraform.tfvars` del *bootstrap* del mismo entorno**; nada lo comprueba sobre los ficheros privados.
- `infra/envs/<dev|prod>/backend.hcl.example`: `bucket` (`atlas-account-tfstate-<sufijo>`, el del *bootstrap* de la cuenta), `key` (`envs/<entorno>/terraform.tfstate`) y `region`. `use_lockfile` ya está en `versions.tf`.

Se suben sin pasar por la línea de órdenes ni el historial: `base64 -w0 <fichero> | gh secret set <NOMBRE>` (con `--env prod` para los `ATLAS_PROD_*`).

## Plan de tarifa plana de CloudFront

`prod` exige `edge_mode = free_plan`, y la suscripción no es Terraform: tras el primer `apply` de la pila de cada entorno con esa modalidad, y antes de dar el entorno por listo, ejecuta `infra/scripts/flat-rate-plan.sh subscribe` ([`flat-rate-plan.md`](flat-rate-plan.md)). `dev` puede ir con `pay_per_use` (C11).

## Subir un arreglo urgente a `prod` (*hotfix*)

`prod` no construye: despliega el conjunto que `dev` construyó y firmó para **el mismo árbol de git** (`promote.sh`, `verify-attestation.sh`), y esas comprobaciones fallan cerrado. Así que no hay atajo, y es deliberado:
1. Rama `hotfix/<nombre>` desde `main`, y PR a `develop` (no a `main`). `deploy-dev.yml` construye, firma y despliega en `dev`; compruébalo ahí.
2. PR de `develop` a `main`, fusionada con `--no-ff`. Si `main` no tiene nada que `develop` no tenga, el árbol resultante es el de `develop`, el que `dev` firmó; con la aprobación del *environment* `prod` se despliega.
3. Si `develop` lleva trabajo que no debe salir, se revierte en `develop` antes (otra PR) y se espera al despliegue de `dev`.
4. Si `prod` dice «no hay artefacto de dev para este árbol», el árbol de `main` no es uno que `dev` haya construido: no se fuerza, se vuelve al paso 2.

## Activar los flujos de la CI (018)

1. Secretos del repositorio: `ATLAS_PLAN_{DEV,PROD}_{ROLE_ARN,TFVARS_B64,BACKEND_B64}`, `ATLAS_DEV_{DEPLOY_ROLE_ARN,TFVARS_B64,BACKEND_B64,SPA_BUCKET}` y `ATLAS_ARTIFACT_BUCKET` (solo lo lee el despliegue de `dev`). Del *environment* `prod`, y **solo de él, nunca del repositorio** (el flujo de `prod` lee únicamente nombres `ATLAS_PROD_*` y un test lo comprueba): `ATLAS_PROD_{DEPLOY_ROLE_ARN,TFVARS_B64,BACKEND_B64,SPA_BUCKET,ARTIFACT_BUCKET}` (el último es el mismo bucket de artefactos que `ATLAS_ARTIFACT_BUCKET`). Un secreto de repositorio lo puede leer cualquier flujo de cualquier rama; uno del *environment* solo los trabajos que lo declaran y que pasan su regla de rama. Los `*_B64` son el fichero en base64 (un valor de una línea).
2. El *environment* `prod`: aprobación obligatoria y **regla de rama que solo admite `main`** (*Deployment branches and tags* → *Selected branches* → `main`; configuración de GitHub, no está en el repositorio y el dueño la hace al desplegar). Es una segunda cerradura: la primera es que la confianza del rol de `prod` pide el `job_workflow_ref` de `deploy-prod.yml@refs/heads/main` (paso 2 bis).
2 bis. **Personalizar el `sub` de OIDC del repositorio** (las dos confianzas lo exigen; sin esto ningún flujo asume su rol): `gh api -X PUT repos/<dueño>/<repo>/actions/oidc/customization/sub -F use_default=false -f 'include_claim_keys[]=repo' -f 'include_claim_keys[]=context' -f 'include_claim_keys[]=job_workflow_ref'`. Desde ahí el `sub` es `repo:<dueño>/<repo>:environment:prod:job_workflow_ref:<dueño>/<repo>/.github/workflows/deploy-prod.yml@refs/heads/main` (`dev`: `…:ref:refs/heads/develop:job_workflow_ref:…/deploy-dev.yml@refs/heads/develop`; `plan`: `…:pull_request:job_workflow_ref:…/infra-plan.yml@refs/pull/<n>/merge`). Aplicar antes el *bootstrap* con las confianzas nuevas, o el primer despliegue recibe `AccessDenied`. Comprueba el `sub` real de una ejecución (`first-deploy-checks.md`).
3. Variables del repositorio `ATLAS_INFRA_PLAN_ENABLED` y `ATLAS_DEPLOY_ENABLED` a `true`. Hoy no existen y los flujos son inertes.
4. Un `plan` sale en el registro como direcciones y acciones; el completo se revisa en local antes de cada `apply`.
5. El `plan` no tiene artefacto construido: `terraform-run.sh` le pasa valores de relleno para las cuatro variables `*artifact*`, y el código de las dos Lambdas aparece siempre como «update in place». Los despliegues pasan las reales.
6. La SPA se sube sin `--delete` (`aws s3 sync` de `deploy-*.yml`; el rol de despliegue no necesita `s3:DeleteObject` por eso): los `assets/` con hash de la versión anterior siguen en el bucket mientras CloudFront sirva el `index.html` viejo, y el resto (el `index.html` incluido) lleva `Cache-Control: no-cache`. Tras el primer despliegue con estos encabezados, invalida `/*` a mano una vez: el `index.html` que CloudFront ya tenía en caché no los trae.
7. El despliegue de `dev` construye en un trabajo **sin `id-token`** (`npm ci --ignore-scripts` y `npm run build` no ejecutan scripts de instalación ni pueden pedir el token OIDC) y entrega el conjunto, como artefacto de la ejecución de un día, al trabajo que sí asume el rol (el `SHA256SUMS` viaja con él: protege el token, no la integridad frente a un `build` comprometido). El conjunto publicado en `builds/<árbol>/` es inmutable. El flujo de `dev` firma con una atestación de GitHub los tres ficheros que **construyó esa ejecución**, *antes* de publicarlos, y `prod` (`verify-attestation.sh`) exige que la firma sea de `deploy-dev.yml` en `refs/heads/develop` y que el commit firmado tenga el mismo árbol que el que despliega (lo lee de la API de GitHub con el token del trabajo, `contents: read`). Si alguien subió antes un conjunto propio a ese árbol, no está firmado y `prod` falla sin desplegar; solo administración puede borrar el prefijo (`builds/<árbol>/`) para que `dev` lo publique de nuevo. La referencia no sale del bucket. `promote.sh` y `artifact-env.sh` rechazan un `SHA256SUMS` que no liste los dos ZIP.
8. **Riesgo aceptado:** los secretos `ATLAS_PLAN_*` son del repositorio, y un flujo de cualquier rama del repositorio puede leerlos (el `sub` del rol de `plan` es `pull_request` y su flujo, `infra-plan.yml`; ADR-0034, fila 3). Con una sola persona escribiendo en el repositorio no cambia nada; si entra otra, mover el `plan` de `prod` a un *environment* exigiría cambiar el `sub` del rol (bootstrap).
